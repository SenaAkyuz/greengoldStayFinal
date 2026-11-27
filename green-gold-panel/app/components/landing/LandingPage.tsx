import Image from 'next/image';
import Link from 'next/link';
import { BRAND_LOGO, FORUM_PHOTO, MARKETING_IMAGES, PUBLISHED_PARTNERS } from '@/lib/marketing-assets';
import styles from './landing.module.css';

/**
 * ÜRÜN ANA SAYFASI (UX-1.x, KD-1) — herkese açık `/`.
 *
 * İçerik kuralları:
 *   - Yalnız GERÇEK özellikler: misafir ekranı (widget), otel paneli, 3P Metrics
 *     ConnectHub ile Kapsam 1 + 2 ölçümü, raporlar. Faz 2 (rezervasyon motoru
 *     tahsilatı) "yakında" diye anılır.
 *   - Örnek sayılar AÇIKÇA "örnek / temsili" etiketlidir (KD-6); panelde yalnız
 *     gerçek veri gösterilir.
 *   - "Karbon nötr", "dengeledik", doğrulanmış offset iddiası YOK.
 *   - Ortak/otel logosu YOK (KD-5); ölçüm ortağı yalnız adıyla anılır.
 */
export function LandingPage() {
  const { hero, guest, forest, terrace, og } = MARKETING_IMAGES;
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#icerik">İçeriğe geç</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="GreenGold Stay ana sayfa">
            <Image src={BRAND_LOGO.src} alt="" width={40} height={40} className={styles.brandLogo} priority />
            <span className={styles.brandName}>GreenGold<span> Stay</span></span>
          </Link>
          <nav aria-label="Ana sayfa bölümleri" className={styles.nav}>
            <a href="#misafir">Misafir deneyimi</a>
            <a href="#panel">Otel paneli</a>
            <a href="#olcum">Ölçüm</a>
            <a href="#sss">SSS</a>
          </nav>
          <div className={styles.headerActions}>
            <Link href="/login" className={styles.linkQuiet}>Otel girişi</Link>
            <Link href="/demo" className={styles.btnPrimary}>Demoyu incele</Link>
          </div>
        </div>
      </header>

      <main id="icerik">
        {/* ---- HERO ---- */}
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrowDark}>Oteller için sürdürülebilir konaklama platformu</p>
              <h1 id="hero-title" className={styles.heroTitle}>
                Konaklamada sürdürülebilirliğe <em>yeni bir yaklaşım.</em>
              </h1>
              <p className={styles.heroLead}>
                GreenGold Stay, otelinizin onaylı enerji verisinden hesaplanan tahmini karbon ayak izini rezervasyon
                adımında misafirinize sunar ve gönüllü katkı seçeneği tanır.
              </p>
              <div className={styles.heroActions}>
                <Link href="/demo" className={styles.btnMint}>Misafir ekranını inceleyin</Link>
                <a href="#iletisim" className={styles.btnGhost}>Bizimle iletişime geçin</a>
              </div>
              <ul className={styles.heroPoints}>
                <li>Gönüllü katılım</li>
                <li>Kapsam 1 ve 2 ölçümüne dayalı tahmin</li>
                <li>Hızlı entegrasyon</li>
              </ul>
            </div>

            <div className={styles.heroVisual}>
              <div className={styles.photo} aria-hidden={!hero.available}>
                {hero.available ? (
                  <Image src={hero.src} alt={hero.alt} fill sizes="(max-width: 1023px) 100vw, 620px" className={styles.photoImg} priority />
                ) : (
                  <RoomArt />
                )}
                <span className={styles.photoTag}>Rezervasyon adımı · örnek görünüm</span>
              </div>
              <GuestCardSample />
            </div>
          </div>

          <div className={styles.sampleStrip} aria-label="Örnek otel raporu (temsili veriler)">
            <div className={styles.sampleInner}>
              <p className={styles.sampleLabel}>
                Örnek otel raporu · <strong>temsili veriler</strong>
              </p>
              <dl className={styles.sampleStats}>
                <div><dt>Misafir ekranını gören oturum</dt><dd>1.240</dd></div>
                <div><dt>Gönüllü katkı tercihi</dt><dd>71<span> oturum</span></dd></div>
                <div><dt>Seçilen konaklamaların tahmini emisyonu</dt><dd>873<span> kg CO₂e</span></dd></div>
              </dl>
            </div>
          </div>
        </section>

        {/* ---- EKOSİSTEM (KD-5: yalnız izni doğrulanmış logolar; yoksa bölüm yok) ---- */}
        {PUBLISHED_PARTNERS.length > 0 && (
        <section className={styles.partners} aria-labelledby="partners-title">
          <div className={styles.sectionInner}>
            <p className={styles.partnersBadge}>
              <Image src={BRAND_LOGO.src} alt="" width={22} height={22} className={styles.brandLogo} />
              GreenGold Stay ekosistemi
            </p>
            <h2 id="partners-title" className={styles.partnersTitle}>
              Birlikte çalıştığımız <strong>kuruluşlar</strong>
            </h2>
            <ul className={styles.partnerGrid}>
              {PUBLISHED_PARTNERS.map((p) => (
                <li key={p.name}>
                  <Image
                    src={p.src}
                    alt={p.name}
                    width={p.width}
                    height={p.height}
                    unoptimized
                    className={styles.partnerLogo}
                    style={{ height: p.displayHeight, width: 'auto' }}
                  />
                  {p.role && <span>{p.role}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
        )}

        {/* ---- 01 MİSAFİR ---- */}
        <section id="misafir" className={styles.section} aria-labelledby="guest-title">
          <div className={styles.sectionInner}>
            <div className={styles.split}>
              <div>
                <p className={styles.sectionNo}>01 / Misafir deneyimi</p>
                <h2 id="guest-title" className={styles.h2}>
                  Rezervasyon sürecinin <strong>doğal bir parçası.</strong>
                </h2>
                <p className={styles.lead}>
                  Misafir, ödeme adımında konaklamasına ait tahmini karbon ayak izini görür ve katkı kararını kendisi verir.
                  Katkı seçeneği varsayılan olarak seçili değildir; rezervasyon her iki durumda da aynı şekilde tamamlanır.
                </p>
                <ol className={styles.steps}>
                  <li>
                    <span className={styles.stepNo}>1</span>
                    <div>
                      <h3>Tahmini ayak izi</h3>
                      <p>Gece ve oda sayısına göre, otelinizin onaylı ölçüm verisiyle hesaplanır.</p>
                    </div>
                  </li>
                  <li>
                    <span className={styles.stepNo}>2</span>
                    <div>
                      <h3>Gönüllü katkı</h3>
                      <p>Gecelik tutar ve toplam açıkça gösterilir; ekran Türkçe ve İngilizce sunulur.</p>
                    </div>
                  </li>
                  <li>
                    <span className={styles.stepNo}>3</span>
                    <div>
                      <h3>Otelin kendi altyapısı</h3>
                      <p>Misafir ekranı ödeme almaz; katkı, otelin ödeme altyapısı ya da rezervasyon motoru üzerinden tahsil edilir.</p>
                    </div>
                  </li>
                </ol>
              </div>
              <div className={styles.guestStage}>
                {guest.available && (
                  <Image src={guest.src} alt={guest.alt} fill sizes="(max-width: 1023px) 100vw, 560px" className={styles.stageImg} />
                )}
                <GuestCardSample expanded />
              </div>
            </div>
          </div>
        </section>

        {/* ---- 02 PANEL ---- */}
        <section id="panel" className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="panel-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.sectionNo}>02 / Otel paneli</p>
                <h2 id="panel-title" className={styles.h2}>
                  Etkileşim ve etki verileri <strong>tek panelde.</strong>
                </h2>
              </div>
              <p className={styles.lead}>
                Görüntülenme, katkı tercihi ve tahmini emisyon günlük olarak raporlanır. Katkı tercihi, tahsilat ve
                emisyon tahmini ayrı metrikler olarak sunulur.
              </p>
            </div>
            <PanelSample />
          </div>
        </section>

        {/* ---- 03 ÖLÇÜM ---- */}
        <section id="olcum" className={`${styles.section} ${styles.sectionDark}`} aria-labelledby="measure-title">
          {forest.available && (
            <Image src={forest.src} alt="" fill sizes="100vw" className={styles.sectionBg} />
          )}
          <div className={`${styles.sectionInner} ${styles.onImage}`}>
            <div className={styles.split}>
              <div>
                <p className={styles.sectionNoDark}>03 / Ölçüm</p>
                <h2 id="measure-title" className={styles.h2Dark}>
                  <em>Ölçülen veriye</em> dayalı yöntem.
                </h2>
                <p className={styles.leadDark}>
                  Aylık elektrik, doğalgaz ve yakıt tüketimi ölçüm ortağımız 3P Metrics’te onaylanır. Onaylı kayıtlar
                  yayımlanmış emisyon faktörleriyle hesaplanır; sonuç konaklama alanına ve dolu oda-geceye dağıtılır.
                </p>
              </div>
              <ul className={styles.measureList}>
                <li>
                  <strong>Kapsam 1 ve 2</strong>
                  <span>Doğrudan yakıt ve gaz kullanımı ile satın alınan elektrik.</span>
                </li>
                <li>
                  <strong>Onaylı veri</strong>
                  <span>Yalnız ölçüm ortağında onaylanan kayıtlar hesaba katılır; her hesap sürümü kayıt altındadır.</span>
                </li>
                <li>
                  <strong>Yayın kontrolü</strong>
                  <span>Emisyon faktörünün ülke uygunluğu doğrulanmadan sonuç misafir ekranına alınmaz.</span>
                </li>
                <li>
                  <strong>Şeffaf raporlama</strong>
                  <span>Tüm değerler tahmini olarak etiketlenir; yöntem ve kaynak otel panelinde açıklanır.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ---- İLKELER ---- */}
        <section className={styles.section} aria-labelledby="principles-title">
          <div className={styles.sectionInner}>
            <div className={styles.principlesWrap}>
            {FORUM_PHOTO.permission === 'confirmed' ? (
              // Yatay 4:3 fotoğraf: kutu aynı oranda → kırpma yok (kişiler tam görünür).
              <figure className={styles.principlesFigure}>
                <Image
                  src={FORUM_PHOTO.src}
                  alt={FORUM_PHOTO.alt}
                  width={FORUM_PHOTO.width}
                  height={FORUM_PHOTO.height}
                  sizes="(max-width: 1023px) 100vw, 520px"
                  className={styles.principlesFigureImg}
                />
                <figcaption>{FORUM_PHOTO.caption}</figcaption>
              </figure>
            ) : (
              terrace.available && (
                <div className={styles.principlesPhoto}>
                  <Image src={terrace.src} alt={terrace.alt} fill sizes="(max-width: 1023px) 100vw, 520px" className={styles.stageImg} />
                </div>
              )
            )}
            <div>
            <p className={styles.sectionNo}>İlkelerimiz</p>
            <h2 id="principles-title" className={styles.h2}>Güvene dayalı bir çerçeve.</h2>
            <div className={styles.principles}>
              <article>
                <h3>Gönüllü katılım</h3>
                <p>Katkı seçeneği misafirin tercihine bırakılır ve varsayılan olarak seçili gelmez.</p>
              </article>
              <article>
                <h3>Bilimsel yaklaşım</h3>
                <p>Tahminler, onaylı tüketim verisi ve yayımlanmış emisyon faktörleriyle GHG Protokolü esas alınarak hesaplanır.</p>
              </article>
              <article>
                <h3>Şeffaflık</h3>
                <p>Her değerin tahmini niteliği ve kaynağı misafir ekranında ve otel panelinde açıkça belirtilir.</p>
              </article>
            </div>
            </div>
            </div>
          </div>
        </section>

        {/* ---- SSS ---- */}
        <section id="sss" className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="faq-title">
          <div className={`${styles.sectionInner} ${styles.faqWrap}`}>
            <div>
              <p className={styles.sectionNo}>Sık sorulan sorular</p>
              <h2 id="faq-title" className={styles.h2}>Ayrıntılar</h2>
            </div>
            <div className={styles.faq}>
              <details>
                <summary>Katkı nasıl tahsil edilir?</summary>
                <p>Misafir ekranı ödeme almaz. Katkı, otelin kendi ödeme sayfasında ya da rezervasyon motorunda (ör. HotelRunner’da ekstra ürün olarak) rezervasyonla birlikte tahsil edilir.</p>
              </details>
              <details>
                <summary>Tahmini emisyon nasıl hesaplanıyor?</summary>
                <p>Otelin aylık tüketimi ölçüm ortağında onaylanır, emisyon faktörleriyle hesaplanır ve konaklama alanı payıyla dolu oda-geceye bölünür. Sonuç “oda-gece başına kg CO₂e” olarak misafir ekranına alınır.</p>
              </details>
              <details>
                <summary>GreenGold Stay bir karbon dengeleme ürünü mü?</summary>
                <p>Hayır. GreenGold Stay karbon kredisi satmaz; misafire konaklamasının tahmini etkisini gösterir ve gönüllü katkı imkânı sunar.</p>
              </details>
              <details>
                <summary>Entegrasyon nasıl yapılır?</summary>
                <p>Web sitesi için tek bir betik ve etiket eklenir; misafir ekranı yalnız tanımlı alan adlarında çalışır. Rezervasyon motoru bağlantısı Green Gold ekibiyle birlikte kurulur.</p>
              </details>
              <details>
                <summary>Misafir verisi nasıl korunur?</summary>
                <p>Misafir ekranı kişisel veri istemez; yalnız anonim etkileşim sayıları tutulur. Her otel yalnız kendi verisine erişir.</p>
              </details>
            </div>
          </div>
        </section>

        {/* ---- CTA ---- */}
        <section id="iletisim" className={styles.cta} aria-labelledby="cta-title">
          {og.available && <Image src={og.src} alt="" fill sizes="100vw" className={styles.sectionBg} />}
          <div className={`${styles.ctaInner} ${styles.onImage}`}>
            <div>
              <h2 id="cta-title" className={styles.h2Dark}>GreenGold Stay’i otelinizde değerlendirin.</h2>
              <p className={styles.leadDark}>Misafir ekranını inceleyin; otel paneli erişimi Green Gold ekibi tarafından tanımlanır.</p>
            </div>
            <div className={styles.heroActions}>
              <Link href="/demo" className={styles.btnMint}>Demoyu incele</Link>
              <Link href="/login" className={styles.btnGhost}>Otel girişi</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <span className={styles.brand}>
              <Image src={BRAND_LOGO.src} alt="" width={36} height={36} className={styles.brandLogo} />
              <span className={styles.brandNameDark}>GreenGold<span> Stay</span></span>
            </span>
            <p>Oteller için tahmini karbon ayak izi ve gönüllü katkı platformu.</p>
          </div>
          <nav aria-label="Ürün" className={styles.footerCol}>
            <p className={styles.footerHead}>Ürün</p>
            <a href="#misafir">Misafir deneyimi</a>
            <a href="#panel">Otel paneli</a>
            <a href="#olcum">Ölçüm yöntemi</a>
            <a href="#sss">Sık sorulan sorular</a>
          </nav>
          <nav aria-label="Erişim" className={styles.footerCol}>
            <p className={styles.footerHead}>Erişim</p>
            <Link href="/login">Otel girişi</Link>
            <Link href="/demo">Demo</Link>
            <a href="#iletisim">İletişim</a>
          </nav>
        </div>
        <div className={styles.footerBottom}>
          <div className={styles.footerBottomInner}>
            <span>© {new Date().getFullYear()} GreenGold Stay</span>
            <span>Ölçüm altyapısı: 3P Metrics ConnectHub</span>
            <span>Sayfadaki otel ve rapor verileri örnektir. Gösterilen değerler tahmindir; doğrulanmış emisyon beyanı niteliği taşımaz.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Misafir ekranının statik örneği (gerçek widget'ın görünümüyle aynı dil; veri temsili). */
function GuestCardSample({ expanded = false }: { expanded?: boolean }) {
  return (
    <figure className={expanded ? `${styles.guestCard} ${styles.guestCardStatic}` : styles.guestCard} aria-label="Örnek misafir ekranı (temsili veriler)">
      <div className={styles.gcHead}>
        <span className={styles.gcMark} aria-hidden="true">Ö</span>
        <span>
          <strong>Örnek Otel</strong>
          <small>Sürdürülebilir konaklama</small>
        </span>
        <span className={styles.gcBadge}>Örnek</span>
      </div>
      <div className={styles.gcBody}>
        <p className={styles.gcEyebrow}>Gönüllü katkı</p>
        <p className={styles.gcTitle}>Daha sürdürülebilir bir konaklamayı destekle</p>
        <div className={styles.gcSummary}>
          <div><span>Konaklamanız</span><b>2 gece</b></div>
          <div><span>Tahmini ayak iziniz</span><b className={styles.gcBig}>≈ 1,37 <small>kg CO₂e</small></b></div>
        </div>
        {expanded && (
          <>
            <div className={styles.gcOption}>
              <span className={styles.gcCheck} aria-hidden="true">✓</span>
              <span><b>Bu seçeneği tercih ediyorum</b><small>0,02 € × 2 gece</small></span>
            </div>
            <div className={styles.gcTotal}><span>Toplam katkı</span><b>0,04 €</b></div>
          </>
        )}
        <div className={styles.gcBtn}>Tercihimi kaydet</div>
      </div>
      <figcaption className={styles.gcSig}>
        <Image src={BRAND_LOGO.src} alt="" width={18} height={18} /> Destekleyen: <b>GreenGold Stay</b>
      </figcaption>
    </figure>
  );
}

/** Panel raporunun statik örneği — açıkça "örnek veri" etiketli (KD-6). */
function PanelSample() {
  const days = [32, 41, 38, 55, 47, 29, 22, 44, 51, 60, 58, 40, 35, 49];
  const max = Math.max(...days);
  return (
    <figure className={styles.panelCard} aria-label="Örnek otel paneli raporu (temsili veriler)">
      <div className={styles.pcHead}>
        <span className={styles.brand}>
          <Image src={BRAND_LOGO.src} alt="" width={26} height={26} className={styles.brandLogo} />
          <b>Örnek Otel · Raporlar</b>
        </span>
        <span className={styles.pcTag}>Örnek veri</span>
      </div>
      <div className={styles.pcStats}>
        <div><span>Görüntülenme</span><b>1.240</b><small>+%12 önceki döneme göre</small></div>
        <div><span>Katkı tercihi</span><b>71</b><small>%5,7 uçtan uca oran</small></div>
        <div><span>Tahmini emisyon</span><b>873 <small>kg CO₂e</small></b><small>seçilen konaklamalar</small></div>
      </div>
      <div className={styles.pcBody}>
        <div>
          <p className={styles.pcLabel}>Günlük görüntülenme</p>
          <div className={styles.pcBars} aria-hidden="true">
            {days.map((d, i) => (
              <span key={i} style={{ height: `${(d / max) * 100}%` }} className={i % 3 === 0 ? styles.pcBarOn : undefined} />
            ))}
          </div>
        </div>
        <div className={styles.pcSide}>
          <p className={styles.pcLabel}>Misafir ekranındaki tahmin</p>
          <b>0,687 <small>kg CO₂e / oda-gece</small></b>
          <p>Ölçüm ortağının onaylı verisi · Kapsam 1 + 2</p>
          <span className={styles.pcLive}>Yayında · Ekim</span>
        </div>
      </div>
    </figure>
  );
}

/** Fotoğraf gelene kadar hero görseli: sakin, doğa odaklı çizim (metin/logo yok). */
function RoomArt() {
  return (
    <svg className={styles.roomArt} viewBox="0 0 620 460" preserveAspectRatio="xMinYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6efd9" />
          <stop offset="1" stopColor="#dfe9d7" />
        </linearGradient>
        <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f4a46" />
          <stop offset="1" stopColor="#0a393b" />
        </linearGradient>
      </defs>
      <rect width="620" height="460" fill="url(#wall)" />
      {/* Kart sağda durur: pencere ve bitki solda, yatak kartın altında. */}
      <g transform="translate(-140 0)">
      {/* kemerli pencere */}
      <path d="M210 420V180a100 100 0 0 1 200 0v240Z" fill="url(#sky)" />
      <path d="M210 420V180a100 100 0 0 1 200 0v240" fill="none" stroke="#d3a632" strokeWidth="3" />
      <path d="M310 82v338M210 270h200" stroke="#0a393b" strokeOpacity=".18" strokeWidth="3" />
      {/* tepeler ve zeytin */}
      <path d="M210 360c60-40 120-46 200-18v78H210Z" fill="#9fbf96" />
      <path d="M210 390c70-30 140-24 200 0v30H210Z" fill="#6f9a6c" />
      <path d="M352 380c0-50 6-92 2-130" stroke="#5b4a2a" strokeWidth="5" strokeLinecap="round" />
      {[[330, 250], [372, 236], [348, 222], [384, 262], [322, 278], [360, 270]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="24" ry="10" fill="#3b7256" transform={`rotate(${i % 2 ? -24 : 18} ${x} ${y})`} />
      ))}
      </g>
      <g transform="translate(270 0)">
      {/* yatak ve keten */}
      <rect x="40" y="350" width="250" height="70" rx="12" fill="#f3eee2" />
      <rect x="40" y="338" width="250" height="22" rx="10" fill="#e6dfcd" />
      <rect x="58" y="318" width="80" height="30" rx="10" fill="#ffffff" />
      <rect x="150" y="318" width="80" height="30" rx="10" fill="#ffffff" />
      <rect x="40" y="392" width="250" height="28" rx="6" fill="#3b7256" opacity=".85" />
      </g>
      <g transform="translate(-180 0)">
      {/* lamba ve saksı */}
      <path d="M520 300h40l-10 40h-20Z" fill="#c9a35a" />
      <path d="M540 340v80" stroke="#c9a35a" strokeWidth="3" />
      <rect x="470" y="380" width="44" height="40" rx="6" fill="#d9cdb3" />
      <path d="M492 380c-14-30-6-60 12-74M492 380c10-28 30-40 44-42M492 380c-4-24-26-36-40-36" stroke="#3b7256" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
      <rect y="420" width="620" height="40" fill="#c8b48e" />
      <rect y="420" width="620" height="4" fill="#b29d74" />
    </svg>
  );
}
