'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, CardHeader, Notice, StatusPill } from './ui';
import styles from './panel/panel.module.css';

/**
 * WEB SİTESİ WIDGET'I kartı (UX-6.1 / 6.2 / 6.4). Betik adresi geçersizse
 * (yer tutucu, https değil) gömme kodu KOPYALANAMAZ — yanlış adresli kodun
 * otel sitesine yapıştırılması engellenir. İzinli domain ayarına doğrudan
 * bağlantı verilir. Ortak anahtar maskelenmez (gömme kodunda zaten görünür);
 * servis anahtarı burada asla yer almaz.
 */
export function IntegrationCard({
  embedCode,
  allowedOrigins,
  widgetSrc,
  apiBaseUrl,
  publicKey,
  widgetSrcConfigured,
  settingsHref = '/ayarlar#izinli-domainler',
}: {
  embedCode: string;
  allowedOrigins?: string[];
  widgetSrc: string;
  apiBaseUrl: string;
  publicKey: string;
  /** Betik adresi geçerli mi (yer tutucu / https dışı değil). */
  widgetSrcConfigured: boolean;
  settingsHref?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copy() {
    if (!widgetSrcConfigured) return;
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyFailed(true);
    }
  }

  const origins = allowedOrigins ?? [];

  return (
    <Card as="section" aria-labelledby="widget-card-title">
      <CardHeader
        id="widget-card-title"
        title="Web sitesi widget’ı"
        headingLevel={2}
        description="Kendi ödeme (checkout) sayfası olan siteler için. Kodu misafirin oda/gece seçtiği adıma yapıştırın."
        actions={
          <Button
            variant="secondary"
            onClick={copy}
            disabled={!widgetSrcConfigured}
            aria-describedby={!widgetSrcConfigured ? 'embed-blocked' : undefined}
          >
            {copied ? 'Kopyalandı ✓' : 'Kodu kopyala'}
          </Button>
        }
      />

      {!widgetSrcConfigured && (
        <div id="embed-blocked" className={styles.gapBottom}>
          <Notice tone="warning" title="Kod henüz kullanılamaz">
            Widget betik adresi yapılandırılmadı ya da https değil (<code>NEXT_PUBLIC_WIDGET_SRC</code> / <code>NEXT_PUBLIC_SITE_URL</code>).
            Aşağıdaki kod yer tutucu adres içerdiği için kopyalanamaz; adres ayarlanınca etkinleşir.
          </Notice>
        </div>
      )}
      {copyFailed && (
        <div className={styles.gapBottom}>
          <Notice tone="info">Tarayıcı panoya erişime izin vermedi; kodu seçip elle kopyalayın.</Notice>
        </div>
      )}

      <pre className={`${styles.code} ${!widgetSrcConfigured ? styles.codeBlocked : ''}`}>
        <code>{embedCode}</code>
      </pre>

      <dl className={`${styles.connGrid} ${styles.gapTop}`}>
        <div><dt>Betik adresi</dt><dd>{widgetSrc}</dd></div>
        <div><dt>API adresi</dt><dd>{apiBaseUrl}</dd></div>
        <div><dt>Ortak widget anahtarı</dt><dd>{publicKey}</dd></div>
      </dl>

      <div className={styles.originBox}>
        <div className={styles.inlineRow} style={{ justifyContent: 'space-between' }}>
          <p className={styles.itemName}>İzinli domain’ler</p>
          <Link className={styles.textLink} href={settingsHref}>İzinli domainleri düzenle →</Link>
        </div>
        {origins.length > 0 ? (
          <ul className={styles.originList}>
            {origins.map((o) => (
              <li key={o}><StatusPill tone="success" dot={false}>{o}</StatusPill></li>
            ))}
          </ul>
        ) : (
          <Notice tone="warning">Henüz izinli domain yok — widget hiçbir sitede görünmez. Otelinizin sitesini https adresiyle ekleyin.</Notice>
        )}
        <p className={styles.small}>Widget yalnız bu adreslerde çalışır; diğer sitelerde gizlenir (403).</p>
      </div>

      <details className={styles.details}>
        <summary>Otel geliştiricisi için ayrıntılar</summary>
        <p className={styles.small}>
          Misafir oda/gece seçtikçe <code>data-rooms</code> ve <code>data-nights</code> değerlerini rezervasyon formundan
          güncelleyin (varsayılan 1). Misafir tercihini kaydedince widget <code>greengold:contribution-selected</code>{' '}
          olayını yayınlar (<code>detail.amount_total</code>); bu tutarı kendi sepetinize ekstra satır olarak ekleyin. Ödeme sizin
          mevcut altyapınızdan alınır; widget ödeme almaz.
        </p>
      </details>
    </Card>
  );
}
