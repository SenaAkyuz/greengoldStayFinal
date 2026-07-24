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
    <div className="mt-8 flex justify-center">
      <div className="gg-card flex w-full max-w-2xl flex-col items-center px-8 py-20 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[#edf5ef] text-[#1c6b58]">
          <ClockIcon />
        </span>
        <span className="mt-5 rounded-full border border-[#d8e7d9] bg-[#f1f7f1] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#286b5a]">
          {badge}
        </span>
        <h2 className="mt-4 font-[Georgia] text-3xl font-medium text-[#102b22]">{title}</h2>
        <p className="mt-3 max-w-lg text-sm leading-6 text-[#68766f]">{description}</p>
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
