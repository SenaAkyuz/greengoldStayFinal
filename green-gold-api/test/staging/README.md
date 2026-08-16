# Acceptance Testleri (disposable Postgres)

Bu klasördeki testler **Jest ile çalışmaz** ve **CI'da çalışmaz**. Gerçek bir
Postgres gerektirirler.

## Durum

> ✅ **Son çalıştırma: 2026-08-15 — PostgreSQL 15.19 (disposable Docker),
> T1–T15 tamamı PASS.** Runbook birebir uygulandı; hiçbir düzeltme gerekmedi.
> Ayrıntılı sonuçlar, blokaj/`pg_blocking_pids` kanıtları ve katalog çıktıları:
> `CLAUDE_FAZ2_BOOKING_ENGINE_CEKIRDEK_RAPORU.md` Bölüm 4.
>
> Bu testler **her migration/RPC değişikliğinden sonra yeniden çalıştırılmalıdır**;
> Jest'te ve CI'da koşmazlar.

## Neden ayrı?

`green-gold-api`'nin birim testleri `test/fake-supabase.ts` (bellek-içi sahte
istemci) kullanır. Bu sahte istemci **Postgres transaction semantiğini taklit
etmez ve edemez**:

| Davranış | Birim testte doğrulanabilir mi? |
|---|---|
| Uygulama doğru RPC'yi doğru argümanlarla çağırıyor mu | ✅ evet |
| `hotel_id`/`provider`'ın RPC'ye gönderilMEdiği | ✅ evet |
| RPC sonucunu (`already_processed` / `40001`) doğru ele alıyor mu | ✅ evet |
| State machine kararları | ✅ evet (saf fonksiyon) |
| **Atomiklik** (kısmi yazım kalmaması) | ❌ **hayır** |
| **Tenant bağının DB'de zorlanması** | ❌ **hayır** |
| **Advisory lock / satır kilidi** | ❌ **hayır** |
| **Rollback** | ❌ **hayır** |
| **EXECUTE yetki modeli** | ❌ **hayır** |
| **Eşzamanlı duplicate'te toplamın bir kez etkilenmesi** | ❌ **hayır** |
| **Lost update önleme** | ❌ **hayır** |

Yani `ingest_reservation_event`'in asıl güvenceleri birim testlerle
**kanıtlanmamıştır** ve öyle sunulmamaktadır.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `bootstrap-acceptance.sql` | **Yalnızca test için** `auth` şeması/`auth.uid()`/`auth.users` ve `anon`/`authenticated`/`service_role` rol stub'ları. Production migration'ları bu test uğruna DEĞİŞTİRİLMEDİ. |
| `ingest-reservation-event.acceptance.sql` | T1–T13 otomatik testler (`ASSERT`'li) |
| `concurrency-manual.md` | T14–T15: iki oturum gerektiren eşzamanlılık testleri |

### Test kapsamı

| Test | Ne doğrular |
|---|---|
| T1 | confirmed+selected+collected → reservation+contribution; `hotel_id` **DB'den türetiliyor** |
| T2 | Aynı `provider_event_id` tekrar → `already_processed`, tutar şişmiyor |
| T3 | Bayat karar → `40001` + **tam rollback** (delivery satırı bile kalmıyor) |
| T4 | `reject` → audit yazılıyor, domain değişmiyor |
| T5 | `manual_review` → reservation güncelleniyor, contribution dokunulmuyor |
| T6 | Contribution CHECK ihlali → **reservation da geri alınıyor** (atomiklik) |
| T7 | **İmza kanıtı:** `p_hotel_id`/`p_provider` parametreleri YOK; tek overload |
| T8 | **Çapraz tenant** reddediliyor; 3 tablonun satır sayısı değişmiyor |
| T9 | **Pending** integration yazamıyor |
| T10 | **Suspended** integration yazamıyor (provider DB'den okunuyor) |
| T11 | **Bilinmeyen** integration → domain VE audit yazamıyor |
| T12 | EXECUTE: PUBLIC/anon/authenticated **kapalı**, service_role **açık** |
| T13 | `SECURITY DEFINER` + sabit `search_path` |

---

## Runbook — disposable Docker container

### ⚠️ Güvenlik sınırları (uyulması ZORUNLU)

- Yalnız **yeni, açık isimli** disposable container: **`gg-faz2-acceptance`**
- Host portu **55433** (boş yüksek port). **5432'ye veya production portuna bağlanma.**
- **Volume mount / persistent volume KULLANMA.**
- Bağlantı URL'i **asla** proje `.env`'inden veya Supabase değişkenlerinden
  alınmaz — **literal `localhost`**, acceptance-only kullanıcı/parola/veritabanı.
- **Production/staging Supabase URL'sine hiçbir komut gönderilmez.**
- Test sonunda container **durdurulup kaldırılır**; kalıcı veri olmaz.

### Adımlar

```bash
# 0) HEDEFİ DOĞRULA — komuttan önce ekranda göster
echo "Container: gg-faz2-acceptance | Host: localhost:55433 | DB: gg_acceptance"
docker ps -a --filter name=gg-faz2-acceptance   # boş olmalı (isim çakışması yok)

# 1) Disposable container (volume YOK, yalnızca localhost'a bind)
docker run -d --name gg-faz2-acceptance \
  -e POSTGRES_USER=gg_acceptance \
  -e POSTGRES_PASSWORD=gg_acceptance_local_only \
  -e POSTGRES_DB=gg_acceptance \
  -p 127.0.0.1:55433:5432 \
  postgres:15

# 2) Hazır olmasını bekle
until docker exec gg-faz2-acceptance pg_isready -U gg_acceptance -d gg_acceptance; do sleep 1; done

# 3) LİTERAL bağlantı URL'i (.env'den ALINMAZ)
export ACCEPTANCE_URL="postgresql://gg_acceptance:gg_acceptance_local_only@localhost:55433/gg_acceptance"
echo "$ACCEPTANCE_URL" | grep -q '@localhost:55433/' || { echo "HEDEF YANLIS — DUR"; exit 1; }

# 4) Bootstrap (yalnızca test stub'ları)
psql "$ACCEPTANCE_URL" -v ON_ERROR_STOP=1 -f test/staging/bootstrap-acceptance.sql

# 5) Production migration'larını SIRAYLA uygula (0001..0014), her biri ON_ERROR_STOP=1
for f in supabase/migrations/00*.sql; do
  echo "--- $f"
  psql "$ACCEPTANCE_URL" -v ON_ERROR_STOP=1 -f "$f" || { echo "MIGRATION FAILED: $f"; exit 1; }
done

# 6) Acceptance testleri (T1..T13)
psql "$ACCEPTANCE_URL" -v ON_ERROR_STOP=1 \
  -f test/staging/ingest-reservation-event.acceptance.sql

# 7) T14/T15: iki ayrı psql oturumu — concurrency-manual.md
#    Otomatikleştirilemiyorsa "geçti" DENMEZ, "bekliyor" olarak raporlanır.

# 8) TEMİZLİK — kalıcı veri bırakma
docker stop gg-faz2-acceptance && docker rm gg-faz2-acceptance
docker ps -a --filter name=gg-faz2-acceptance   # boş olmalı
```

> `psql` host'ta yoksa container içinden çalıştırılabilir:
> `docker exec -i gg-faz2-acceptance psql -U gg_acceptance -d gg_acceptance -v ON_ERROR_STOP=1 < <dosya>`
> Bu durumda da bağlantı container'ın kendi localhost'udur — dış ağa çıkılmaz.

### Beklenen çıktı

Her test `NOTICE: Tn PASS` basar. Herhangi bir `ASSERT` geçmezse
`ON_ERROR_STOP=1` sayesinde script hata ile durur ve o testin mesajı görünür.
