/**
 * Shadow DOM içine enjekte edilen CSS. Host sayfa stillerinden tamamen izole.
 * `:host` reset'i ile dışarıdan miras alınan (inherited) stilleri de nötrler.
 *
 * Görünüm: onaylı tasarım dili (panel `app/design/tokens.css`) ve ürün
 * sitesindeki misafir kartı (başlık şeridi + otel adı, ayraçlı özet satırları,
 * büyük "tahmini ayak izi" değeri, 7px köşeli birincil buton). Renkler:
 * mürekkep #0b393a, çam #006e64 (varsayılan vurgu), ikincil metin #4d625a,
 * çizgi #d6ded2, adaçayı #f2f5ed, altın #f3cc61. Yazı tipi DM Sans (kendi alan
 * adımızdan, bkz. fonts.ts); yüklenemezse sistem yazı tipi.
 *
 * Duyarlılık: kart kapsayıcının genişliğine uyar (container query + medya
 * sorgusu yedeği); kendi beyaz zemini olduğu için açık/koyu otel sitelerinde
 * okunur.
 */
export const STYLES = `
:host {
  all: initial;
  display: block;
  contain: content;
  container-type: inline-size;
  /* Vurgu: otel rengi yalnız okunabilirlik denetimini geçerse (colors.ts). */
  --gg-accent: #006e64;
  --gg-ink: #0b393a;
  --gg-sub: #4d625a;
  --gg-rule: #d6ded2;
  --gg-rule-strong: #c9d5c9;
  --gg-sage: #f2f5ed;
  --gg-gold: #f3cc61;
  --gg-gold-rule: #d3a632;
  font-family: "GG DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.45;
  color: var(--gg-ink);
  -webkit-font-smoothing: antialiased;
}
*, *::before, *::after { box-sizing: border-box; }

.card {
  width: 100%;
  min-width: min(100%, 280px);
  max-width: 560px;
  background: #ffffff;
  border: 1px solid var(--gg-rule-strong);
  border-radius: 18px;
  overflow: hidden;
  color: var(--gg-ink);
  font-size: 15px;
  box-shadow: 0 1px 2px rgba(11, 57, 58, .04), 0 12px 32px -18px rgba(11, 57, 58, .28);
}

/* Başlık şeridi (KD-2): OTELİN kimliği — logo/baş harf + ad + şehir */
.head {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 20px;
  background: var(--gg-sage);
  border-bottom: 1px solid var(--gg-rule);
}
.mark {
  flex: 0 0 auto;
  width: 40px; height: 40px;
  display: grid; place-items: center;
  border-radius: 999px;
  background: var(--gg-ink);
  overflow: hidden;
}
.mark .initial { font-size: 17px; font-weight: 600; color: var(--gg-gold); letter-spacing: -0.02em; }
.mark svg { width: 18px; height: 18px; display: block; color: var(--gg-gold); }
.mark.has-logo { background: #ffffff; border: 1px solid var(--gg-rule); border-radius: 10px; padding: 3px; }
.logo { width: 100%; height: 100%; object-fit: contain; display: block; }
.brand { display: flex; flex-direction: column; min-width: 0; }
.hotel {
  /* Otel adı olduğu gibi (büyük harfe çevrilmez: TR/EN adlarda İ/I sorunu). */
  font-size: 15px; font-weight: 700; letter-spacing: -0.01em;
  color: var(--gg-ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.brand-sub { font-size: 12.5px; color: var(--gg-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.preview-badge {
  margin-left: auto; flex: 0 0 auto;
  font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  color: var(--gg-ink); background: #ffffff; border: 1px solid var(--gg-rule-strong);
  padding: 4px 8px; border-radius: 999px;
  white-space: nowrap;
}

.body { padding: 22px 24px 20px; }
.eyebrow {
  display: flex; align-items: center; gap: 8px;
  margin: 0 0 8px;
  font-size: 11.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
  color: var(--gg-accent);
}
.eyebrow::before { content: ""; width: 18px; height: 2px; border-radius: 2px; background: var(--gg-gold-rule); }
.heading {
  margin: 0;
  font-size: 23px; font-weight: 600; letter-spacing: -0.04em; line-height: 1.18;
  color: var(--gg-ink);
}
.subheading { margin: 8px 0 0; font-size: 14px; line-height: 1.5; color: var(--gg-sub); }

/* Konaklama özeti + tahmini ayak izi (referans: açık adaçayı panel) */
.summary {
  margin-top: 18px;
  padding: 4px 16px;
  border-radius: 12px;
  background: var(--gg-sage);
  border: 1px solid #e3eadc;
}
.rowval {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 12px 0;
}
.rowval + .rowval { border-top: 1px solid #dfe7d6; }
.rowval-label { display: inline-flex; align-items: center; gap: 7px; font-size: 14.5px; color: var(--gg-ink); }
.rowval-label svg { width: 16px; height: 16px; color: var(--gg-accent); flex: 0 0 auto; }
.rowval-value { font-size: 15px; font-weight: 700; color: var(--gg-ink); text-align: right; }
.co2-value { display: inline-flex; align-items: baseline; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.big { font-size: 32px; font-weight: 600; letter-spacing: -0.05em; line-height: 1.05; color: var(--gg-ink); font-variant-numeric: tabular-nums; }
.unit { font-size: 14px; font-weight: 600; color: var(--gg-ink); }

/* Seçenek: misafirin kararı (büyük, net tıklama alanı) */
.row {
  display: flex; align-items: flex-start; gap: 12px;
  margin-top: 14px;
  padding: 14px 16px; border-radius: 12px;
  border: 1.5px solid var(--gg-rule-strong); background: #ffffff;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.row:hover { border-color: var(--gg-accent); }
.row.checked { border-color: var(--gg-accent); background: #f7faf4; box-shadow: 0 0 0 3px rgba(0, 110, 100, .08); }
.row input[type=checkbox] {
  flex: 0 0 auto;
  width: 20px; height: 20px; margin: 1px 0 0;
  accent-color: var(--gg-accent);
  cursor: pointer;
}
.row-body { flex: 1 1 auto; min-width: 0; }
.row-label { display: block; font-weight: 700; font-size: 15.5px; color: var(--gg-ink); }
.row-sub { display: block; font-size: 13.5px; color: var(--gg-sub); margin-top: 3px; font-variant-numeric: tabular-nums; }

/* Toplam katkı: seçildiğinde belirgin; kaydedildikten sonra da kalır */
.details { margin-top: 12px; }
.line {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  padding: 12px 16px; border-radius: 12px;
  background: var(--gg-ink); color: #ffffff;
}
.line-label { font-size: 14px; color: #d0e3e1; }
.line-value { font-size: 24px; font-weight: 600; letter-spacing: -0.03em; color: #ffffff; font-variant-numeric: tabular-nums; }
.details.saved .line { background: #e5f1e9; color: var(--gg-ink); border: 1px solid #bcdcc8; }
.details.saved .line-label { color: var(--gg-ink); }
.details.saved .line-value { color: var(--gg-ink); }

.badge {
  display: inline-block;
  font-size: 10.5px; font-weight: 700; letter-spacing: .05em;
  text-transform: uppercase;
  color: #7a5a12; background: #f5ecd3; border: 1px solid #e6d29c;
  padding: 2px 8px; border-radius: 21px;
  white-space: nowrap;
}

.actions { margin-top: 14px; display: flex; }
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 100%;
  min-height: 48px;
  font-size: 15.5px; font-weight: 650; font-family: inherit;
  color: #ffffff; background: var(--gg-accent);
  border: 1px solid transparent; border-radius: 10px;
  padding: 11px 22px; cursor: pointer;
  transition: filter .15s ease, background .15s ease;
}
.btn:hover:not(:disabled) { filter: brightness(0.9); }
.btn:disabled { background: #e3e9df; color: #5f726b; cursor: not-allowed; }
.btn:focus-visible, .row input:focus-visible {
  outline: 3px solid var(--gg-accent); outline-offset: 2px;
}

.confirm {
  margin-top: 12px;
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px; border-radius: 12px;
  background: #ffffff; border: 1px solid #bcdcc8;
  color: var(--gg-ink); font-size: 14px;
}
.confirm svg { flex: 0 0 auto; width: 18px; height: 18px; color: #256b45; margin-top: 1px; }

/* Notlar (UX-4.8): kısa, tek blok, küçük punto */
.notes { margin-top: 16px; display: flex; flex-direction: column; gap: 4px; }
.notes:empty { display: none; }
.footprint-note, .co2-note { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--gg-sub); }
.impact {
  margin: 6px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--gg-rule);
  font-size: 12.5px; color: var(--gg-sub);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}

/* KD-2: GreenGold Stay imzası (altta) */
.signature {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 24px;
  border-top: 1px solid var(--gg-rule);
  font-size: 12px; color: var(--gg-sub);
}
.signature b { color: var(--gg-ink); font-weight: 700; letter-spacing: -0.01em; }
.sig-mark { width: 22px; height: 22px; flex: 0 0 auto; display: block; border-radius: 999px; overflow: hidden; }
.sig-mark img, .sig-mark svg { width: 100%; height: 100%; display: block; object-fit: cover; }

@media (prefers-reduced-motion: reduce) {
  .row, .btn { transition: none; }
}

/* Dar kapsayıcı (otel sitesinin yan sütunu, mobil) */
@container (max-width: 420px) {
  .head { padding: 12px 16px; }
  .body { padding: 18px 16px 16px; }
  .heading { font-size: 20px; }
  .big { font-size: 27px; }
  .summary { padding: 2px 12px; }
  .rowval.footprint { flex-direction: column; align-items: flex-start; gap: 4px; }
  .co2-value { justify-content: flex-start; }
  .signature { padding: 10px 16px; }
}
@supports not (container-type: inline-size) {
  @media (max-width: 460px) {
    .head { padding: 12px 16px; }
    .body { padding: 16px 16px 18px; }
    .heading { font-size: 20px; }
  }
}
`;
