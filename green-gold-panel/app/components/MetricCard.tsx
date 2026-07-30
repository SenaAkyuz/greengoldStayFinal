export function MetricCard({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="gg-card relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0b6652] via-[#5c9f80] to-[#d7e9a0]" />
      <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#718078]">{label}</div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-[Georgia] text-[34px] font-medium tracking-tight text-[#102b22] tabular-nums">
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-[#87928d]">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-xs text-[#87928d]">{hint}</div>}
    </div>
  );
}
