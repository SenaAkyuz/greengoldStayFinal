import { requireAccessToken } from '@/lib/auth';
import {
  getHotel,
  getApiBaseUrl,
  getWidgetEmbedSrc,
  getWidgetEventsSummary,
  getIntegrationHealth,
  type HotelInfo,
  type IntegrationHealthItem,
} from '@/lib/api';
import { Card, CardHeader, Notice, PageHeader, StatusPill, Stepper } from '../components/ui';
import { isWidgetSrcValid, widgetSetupSteps } from '@/lib/panel/integration-setup';
import styles from '../components/panel/panel.module.css';
import { HotelPanelFrame } from '../components/panel/HotelPanelFrame';
import { IntegrationCard } from '../components/IntegrationCard';

export default async function IntegrationPage() {
  const token = await requireAccessToken();

  // Son 30 gün etkileşim sinyali — API'de tüm-zamanlar endpoint'i yok, bu
  // yüzden "ilk etkileşim" değil yalnızca "son 30 günde etkileşim" iddia
  // ediyoruz. İstek başarısızsa durum "bilinmiyor" (etkileşim yok VARSAYILMAZ).
  const [hotelRes, summaryRes, integrationHealthRes] = await Promise.all([
    getHotel(token),
    getWidgetEventsSummary(token, '30d'),
    getIntegrationHealth(token),
  ]);
  const hotel = hotelRes.data;
  const recentViews = summaryRes.error || !summaryRes.data ? null : summaryRes.data.views > 0;

  const widgetSrc = getWidgetEmbedSrc();
  const widgetSrcValid = isWidgetSrcValid(widgetSrc);
  const apiBaseUrl = getApiBaseUrl();

  const embedCode = hotel
    ? `<script src="${widgetSrc}"></script>
<green-gold-widget data-key="${hotel.public_widget_key}" data-rooms="1" data-nights="1" data-lang="tr"
    data-api="${apiBaseUrl}"></green-gold-widget>`
    : '';
  const steps = hotel ? widgetSetupSteps({ hotel, widgetSrcValid, recentViews }) : [];

  return (
    <HotelPanelFrame
      hotelName={hotel?.hotel_name}
      city={hotel?.city}
      title="Entegrasyon"
      isDemo={hotel?.role === 'demo_viewer'}
    >
      <div className={`gg-page gg-page--framed ${styles.stack}`}>
        <PageHeader
          size="compact"
          eyebrow="Kurulum ve bağlantı"
          title="Entegrasyon"
          description="Misafir ekranını sitenize ekleyin ya da rezervasyon motorunuzla bağlayın. İki yol birbirinden bağımsızdır."
          actions={
            hotel ? (
              <StatusPill tone={hotel.status === 'active' ? 'success' : hotel.status === 'suspended' ? 'danger' : 'warning'}>
                Otel durumu: {HOTEL_STATUS[hotel.status] ?? hotel.status}
              </StatusPill>
            ) : undefined
          }
        />

        {hotelRes.error && (
          <Notice tone="warning" title="Otel bilgileri yüklenemedi">
            {hotelRes.error}. API sunucusunun çalıştığından emin olun.
          </Notice>
        )}

        {hotel && (
          <>
            <Card aria-labelledby="setup-title" as="section">
              <CardHeader id="setup-title" title="Widget kurulum durumu" headingLevel={2} description="Yalnız doğrulanabilen adımlar işaretlenir." />
              <Stepper
                label="Widget kurulum adımları"
                steps={steps.map((s, i) => ({
                  key: s.key,
                  label: s.label,
                  status: s.status,
                  state:
                    s.state === 'done'
                      ? 'done'
                      : s.state === 'unknown'
                        ? 'blocked'
                        : steps.slice(0, i).every((p) => p.state === 'done')
                          ? 'current'
                          : 'upcoming',
                }))}
              />
            </Card>

            <IntegrationCard
              embedCode={embedCode}
              allowedOrigins={hotel.allowed_origins}
              widgetSrc={widgetSrc}
              apiBaseUrl={apiBaseUrl}
              publicKey={hotel.public_widget_key}
              widgetSrcConfigured={widgetSrcValid}
            />

            <ReservationSystemConnection
              hotel={hotel}
              integrations={integrationHealthRes.data?.integrations ?? []}
              loadFailed={!!integrationHealthRes.error}
            />
          </>
        )}
      </div>
    </HotelPanelFrame>
  );
}

const HOTEL_STATUS: Record<string, string> = { active: 'Aktif', pending: 'Beklemede', suspended: 'Askıya alındı' };

const PROVIDER_LABEL: Record<string, string> = {
  hotelrunner: 'HotelRunner',
  synxis: 'SynXis',
  generic_signed_webhook: 'İmzalı webhook',
};

const INTEGRATION_STATUS: Record<string, string> = {
  active: 'Aktif',
  pending: 'Kurulum bekliyor',
  suspended: 'Durduruldu',
};

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  received: 'Alındı, işleniyor',
  processed: 'İşlendi',
  rejected_bad_signature: 'Reddedildi: anahtar doğrulanamadı',
  rejected_invalid_payload: 'Reddedildi: içerik okunamadı',
  rejected_replay: 'Tekrar gönderim, yok sayıldı',
  rejected_out_of_order: 'Eski güncelleme, yok sayıldı',
  manual_review: 'İnceleme bekliyor',
  error: 'Hata',
};

// Rezervasyon sistemi (HotelRunner vb.) bağlantısı. Widget kurulumundan AYRI:
// katkı otelin rezervasyon motorunda bir ekstra olarak satılır, rezervasyon
// bize sunucudan sunucuya gelir. Bağlantı anahtarı / bildirim adresi ASLA
// gösterilmez (API zaten döndürmüyor).
function ReservationSystemConnection({
  hotel,
  integrations,
  loadFailed,
}: {
  hotel: HotelInfo;
  integrations: IntegrationHealthItem[];
  loadFailed: boolean;
}) {
  // HotelRunner'daki ekstra fiyatı misafir ekranıyla AYNI olmalı: kuruşlu, 2 hane.
  const price = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: hotel.currency || 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(hotel.amount_per_night);
  const tz = hotel.timezone || 'Europe/Istanbul';
  const changed = hotel.carbon_pricing?.calculated_at
    ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(new Date(hotel.carbon_pricing.calculated_at))
    : null;

  return (
    <Card as="section" aria-labelledby="hr-title">
      <CardHeader
        id="hr-title"
        title="HotelRunner · rezervasyon motoru"
        headingLevel={2}
        description="Rezervasyonu HotelRunner gibi bir motordan alıyorsanız katkı orada bir ekstra ürün olarak sunulur; rezervasyon bildirimleri Green Gold’a sunucudan sunucuya gelir."
        actions={<StatusPill tone="neutral" dot={false}>Kurulum Green Gold ekibiyle</StatusPill>}
      />

      <div className={styles.priceAlert} role="note">
        <div>
          <strong>Fiyat otomatik güncellenmez.</strong> HotelRunner’daki <code>GREENGOLD</code> ekstrasının gecelik fiyatı misafir
          ekranındaki katkıyla aynı olmalı. Karbon ölçümü yayına alındığında ya da katkı değiştiğinde HotelRunner’da elle güncelleyin.
          {changed && <> Son değişiklik: {changed}.</>}
        </div>
        <div>
          <span className={styles.small}>Güncel gecelik katkı</span>
          <br />
          <strong className={styles.priceBig}>{price}</strong>
        </div>
      </div>

      <div className={styles.gapTop}>
        {loadFailed ? (
          <Notice tone="warning">Bağlantı durumu şu an alınamadı.</Notice>
        ) : integrations.length === 0 ? (
          <p className={styles.small}>Henüz bir rezervasyon motoru bağlantısı kurulmadı.</p>
        ) : (
          <dl className={styles.facts}>
            {integrations.map((integ) => (
              <div key={integ.id}>
                <dt>
                  {PROVIDER_LABEL[integ.provider] ?? integ.provider} · {integ.environment === 'production' ? 'Canlı' : 'Test ortamı'} · tesis{' '}
                  {integ.external_property_id}
                  <span className={styles.recordNote}>
                    Son bildirim:{' '}
                    {integ.last_delivery_status && integ.last_delivery_at
                      ? `${DELIVERY_STATUS_LABEL[integ.last_delivery_status] ?? integ.last_delivery_status} — ${new Date(integ.last_delivery_at).toLocaleString('tr-TR', { timeZone: tz })}`
                      : 'henüz bildirim gelmedi'}
                  </span>
                </dt>
                <dd>
                  <StatusPill tone={integ.status === 'active' ? 'success' : integ.status === 'suspended' ? 'danger' : 'warning'}>
                    {INTEGRATION_STATUS[integ.status] ?? integ.status}
                  </StatusPill>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <details className={`${styles.details} ${styles.gapTop}`}>
        <summary>HotelRunner kurulum adımları</summary>
        <ol className={styles.numSteps}>
          <li>HotelRunner panelinizde Green Gold için bir uygulama açın; verilen otel kimliğini (HR_ID) ve anahtarı (TOKEN) Green Gold ekibine güvenli bir kanaldan iletin.</li>
          <li>Rezervasyon motorunuzda bir ekstra ürün tanımlayın: kodu (kod alanı yoksa adı) <code>GREENGOLD</code>, gecelik fiyatı <strong>{price}</strong>.</li>
          <li>Green Gold ekibinin ilettiği bildirim adresini HotelRunner’da rezervasyon bildirim adresi olarak girin.</li>
          <li>Bağlantı etkinleşince bildirimler alınmaya başlar. Rezervasyonlar ve Tahsilatlar ekranları <strong>Faz 2</strong>’de açılacak; şu an “Yakında” olarak görünür.</li>
        </ol>
      </details>
    </Card>
  );
}
