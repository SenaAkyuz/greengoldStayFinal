import Link from 'next/link';

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
    <div className="mt-8 flex justify-center">
      <div className="gg-card w-full max-w-2xl p-8 sm:p-10">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[#edf5ef] text-[#1c6b58]">
            {icon ?? <ClockIcon />}
          </span>
          <span className="mt-5 rounded-full border border-[#d8e7d9] bg-[#f1f7f1] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#286b5a]">
            {badge}
          </span>
          <h2 className="mt-4 font-[Georgia] text-3xl font-medium text-[#102b22]">
            {title}
          </h2>
        </div>

        <dl className="mt-8 space-y-5 text-left text-sm">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#718078]">
              Ne gösterecek?
            </dt>
            <dd className="mt-1 leading-relaxed text-[#3d4a45]">{whatItShows}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#718078]">
              Neden henüz boş?
            </dt>
            <dd className="mt-1 leading-relaxed text-[#3d4a45]">{whyEmpty}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#718078]">
              Gereken
            </dt>
            <dd className="mt-2">
              <ul className="space-y-1.5">
                {requirements.map((req) => (
                  <li key={req} className="flex items-start gap-2 leading-relaxed text-[#3d4a45]">
                    <span
                      aria-hidden="true"
                      className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#a8cbb6]"
                    />
                    {req}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>

        {notice && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800"
          >
            {notice}
          </div>
        )}

        <div className="mt-7">
          <Link
            href={ctaHref}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-[#075442] px-5 text-sm font-semibold text-white transition hover:bg-[#043f34] focus:outline-none focus:ring-2 focus:ring-[#5c9f80]/40"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
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
