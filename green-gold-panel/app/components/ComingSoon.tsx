// Bekleyen sekmeler için dürüst boş durum. SAHTE VERİ YOK — yalnızca ne zaman
// dolacağını açıklar. Rezervasyon/Tahsilat/Sertifika gerçek işlev gelene kadar
// "Faz 2" / "Yakında" / "Entegrasyon bekleniyor" olarak ayrılır.
export function ComingSoon({
  title,
  badge,
  description,
}: {
  title: string;
  badge: string;
  description: string;
}) {
  return (
    <div className="mt-6 flex justify-center">
      <div className="flex max-w-md flex-col items-center rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-neutral-100 text-neutral-400">
          <ClockIcon />
        </span>
        <span className="mt-4 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
          {badge}
        </span>
        <h2 className="mt-3 text-lg font-semibold text-neutral-900">{title}</h2>
        <p className="mt-2 text-sm text-neutral-500">{description}</p>
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
