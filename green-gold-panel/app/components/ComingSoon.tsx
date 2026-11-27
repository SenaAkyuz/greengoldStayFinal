import { ButtonLink, Card, Notice, StatusPill } from './ui';

// Bekleyen sekmeler için dürüst boş durum. SAHTE VERİ YOK — yalnızca ne
// göstereceğini, neden boş olduğunu ve neyin gerektiğini açıklar. Rezervasyon/
// Tahsilat/Sertifika gerçek işlev gelene kadar "Faz 2" / "Entegrasyon
// bekleniyor" rozetiyle ayrılır.
export function ComingSoon({
  icon,
  badge,
  title,
  whatItShows,
  whyEmpty,
  requirements,
  notice,
  ctaHref,
  ctaLabel,
}: {
  icon?: React.ReactNode;
  badge: string;
  title: string;
  whatItShows: string;
  whyEmpty: string;
  requirements: string[];
  notice?: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <Card as="section" padding="lg" className="mt-6">
      <div className="flex flex-col items-start gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--ds-color-surface-highlight)] text-[var(--ds-color-primary)]">
          {icon ?? <ClockIcon />}
        </span>
        <StatusPill tone="neutral">{badge}</StatusPill>
        <h2 className="text-xl font-semibold tracking-tight text-[var(--ds-color-heading)]">{title}</h2>
      </div>

      <dl className="mt-6 grid gap-5 text-sm md:grid-cols-3">
        <div>
          <dt className="gg-kicker">Ne gösterecek?</dt>
          <dd className="mt-2 leading-relaxed text-[var(--ds-color-text)]">{whatItShows}</dd>
        </div>
        <div>
          <dt className="gg-kicker">Neden henüz boş?</dt>
          <dd className="mt-2 leading-relaxed text-[var(--ds-color-text)]">{whyEmpty}</dd>
        </div>
        <div>
          <dt className="gg-kicker">Gereken</dt>
          <dd className="mt-2">
            <ul className="space-y-1.5">
              {requirements.map((req) => (
                <li key={req} className="flex items-start gap-2 leading-relaxed text-[var(--ds-color-text)]">
                  <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ds-color-accent)]" />
                  {req}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>

      {notice && (
        <Notice tone="warning" className="mt-6">
          {notice}
        </Notice>
      )}

      <div className="mt-6">
        <ButtonLink href={ctaHref}>{ctaLabel}</ButtonLink>
      </div>
    </Card>
  );
}

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
