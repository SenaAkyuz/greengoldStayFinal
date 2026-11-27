import { DataTable, Notice, StatusPill } from '../ui';
import type { ResultLine, ResultModel } from '@/lib/connecthub';
import { periodStatusView } from '@/lib/carbon-ui/status';
import styles from './panel.module.css';

/**
 * Hesap sonucunun görünümü (hook yok; istemci panelinin içinde çizilir).
 * İçerik `explainResult` modelinden gelir: sırasıyla sonuç durumu →
 * özet cümle → kapsamlar → kalem/faktör/ülke tablosu → uyarılar.
 */
export function CalculationResultView({ model }: { model: ResultModel }) {
  const view = periodStatusView(model.status);
  return (
    <div className={styles.stack}>
      <Notice tone={model.tone} title={model.title} layout="block">
        {model.message}
      </Notice>

      {model.pending && (
        <ul className={styles.plainList}>
          {model.pending.map((p, i) => (
            <li key={i}>
              <strong>{p.name}</strong> · {p.amount} — {p.reason}
            </li>
          ))}
        </ul>
      )}

      {model.blocking && model.blocking.length > 0 && (
        <div>
          <p className={styles.groupTitle}>Hesaplanamayan kalemler</p>
          <ul className={styles.plainList}>
            {model.blocking.map((b, i) => (
              <li key={i}>
                <strong>{b.name}</strong>: {b.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {model.allocation && model.totals && (
        <>
          <div className={styles.resultSummary}>
            <div className={styles.resultBig}>
              <span className={styles.muted}>Oda-gece başına</span>
              <strong>{model.allocation.perNightKg}</strong>
            </div>
            <div className={styles.resultBig}>
              <span className={styles.muted}>Gece başı tahmini katkı</span>
              <strong>{model.allocation.amount}</strong>
            </div>
            <div className={styles.resultBig}>
              <span className={styles.muted}>Tesis toplamı</span>
              <strong>{model.totals.totalText}</strong>
            </div>
          </div>
          <p className={styles.resultSentence}>{model.allocation.sentence}</p>

          <div className={styles.split2}>
            <div>
              <p className={styles.groupTitle}>Kapsamlara göre</p>
              <dl className={styles.facts}>
                {model.totals.scopes.map((s) => (
                  <div key={s.key}>
                    <dt>{s.label}</dt>
                    <dd>{s.kgText} <span className={styles.small}>{s.share}</span></dd>
                  </div>
                ))}
              </dl>
              <p className={`${styles.small} ${styles.gapTopSm}`}>{model.totals.coverage}</p>
              {model.totals.biogenic && <p className={`${styles.small} ${styles.gapTopSm}`}>{model.totals.biogenic}</p>}
            </div>
            <div>
              <p className={styles.groupTitle}>Konaklamaya dağıtım</p>
              <dl className={styles.facts}>
                <div><dt>Konaklama alan payı</dt><dd>{model.allocation.roomShare}</dd></div>
                <div><dt>Konaklamaya düşen</dt><dd>{model.allocation.guestroomsText}</dd></div>
                <div><dt>Doluluk</dt><dd>{model.allocation.occupancy}</dd></div>
                <div><dt>Ton fiyatı</dt><dd>{model.allocation.pricePerTonne}</dd></div>
              </dl>
            </div>
          </div>
        </>
      )}

      {model.lines && model.lines.length > 0 && (
        <div>
          <p className={styles.groupTitle}>Kalemler ve kullanılan faktörler</p>
          <DataTable<ResultLine>
            caption="Kalem bazında hesap"
            captionHidden
            rows={model.lines}
            rowKey={(r) => r.record_id}
            columns={[
              {
                key: 'n',
                header: 'Kalem',
                primary: true,
                cell: (r) => (
                  <>
                    {r.name} <span className={styles.small}>· {r.amount}</span>
                    <span className={styles.recordNote}>{r.scope}</span>
                    {r.factor && (
                      <span className={styles.recordNote}>
                        Faktör: {r.factor}{r.factorSource ? ` · ${r.factorSource}` : ''}
                      </span>
                    )}
                    {(r.factorCredit || r.factorUrl) && (
                      <details className={`${styles.details} ${styles.detailsInline}`}>
                        <summary>Kaynak ve lisans</summary>
                        <span className={styles.recordNote}>
                          {r.factorCredit}
                          {r.factorUrl && (
                            <>
                              {r.factorCredit ? ' · ' : ''}
                              <a className={styles.textLink} href={r.factorUrl} target="_blank" rel="noopener noreferrer">
                                Kaynağı aç
                              </a>
                            </>
                          )}
                        </span>
                      </details>
                    )}
                    {r.notes.map((n) => <span key={n} className={styles.recordNote}>{n}</span>)}
                  </>
                ),
              },
              {
                key: 'c',
                header: 'Ülke',
                cell: (r) =>
                  r.country ? (
                    <span title={r.country.message}>
                      <StatusPill tone={r.country.tone}>{r.country.label}</StatusPill>
                      {r.country.factorCountry && <span className={styles.recordNote}>Faktör: {r.country.factorCountry}</span>}
                    </span>
                  ) : (
                    '—'
                  ),
              },
              { key: 'kg', header: 'Emisyon', align: 'end', cell: (r) => (r.excluded ? <span className={styles.small}>Sayılmaz</span> : r.kgText) },
            ]}
          />
        </div>
      )}

      {(model.countryMessages.length > 0 || model.warnings.length > 0) && (
        <Notice
          tone={model.gate.allowed ? 'info' : 'warning'}
          title={model.gate.allowed ? 'Kontroller · bilgi amaçlı' : 'Kontroller · yayından önce bakın'}
          layout="block"
        >
          <ul className={styles.checks}>
            {model.countryMessages.map((m) => <li key={`c-${m}`}><span aria-hidden="true">!</span>{m}</li>)}
            {model.warnings.map((m) => <li key={`w-${m}`}><span aria-hidden="true">!</span>{m}</li>)}
          </ul>
          {model.gate.allowed && <p className={styles.small}>Bu notlar yayını engellemez; değerleri ölçüm ortağının panelinden kontrol edebilirsiniz.</p>}
        </Notice>
      )}
      {model.ignored.length > 0 && (
        <p className={styles.small}>Hesaba katılmayan kayıtlar: {model.ignored.join('; ')}</p>
      )}
      <p className={styles.small}>
        Durum: <StatusPill tone={view.tone}>{view.label}</StatusPill>
        {model.inventory ? ` · Faktör envanteri: ${model.inventory}` : ''} · Sonuçlar tahminidir; resmi sonuç ölçüm ortağımızın envanter raporudur.
      </p>
    </div>
  );
}
