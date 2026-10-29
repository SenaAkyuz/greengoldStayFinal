import type { InteractionFunnel } from '@/lib/api';
import { formatNumber, formatPercent } from '@/lib/format';

// Görüntülendi → Seçildi → Katkı butonu. Sayı VE geçiş oranı birlikte; anlam
// yalnızca renkle değil metinle taşınır.
// compact: Genel Bakış özeti (ince çubuk, ölçek = görüntülenme).
// full: Dönüşüm sayfası (kalın gradyan çubuk, ölçek = en büyük aşama).
const VARIANTS = {
  compact: {
    track: 'mt-1.5 h-3 w-full overflow-hidden rounded-full bg-neutral-100',
    bar: 'h-full rounded-full bg-[#0b5c49]',
    minWidthPct: 3,
    fade: 0,
  },
  full: {
    track: 'mt-1.5 h-8 w-full overflow-hidden rounded-lg bg-neutral-100',
    bar: 'h-full rounded-lg bg-gradient-to-r from-[#075442] to-[#6da98d] transition-all',
    minWidthPct: 4,
    fade: 0.18,
  },
} as const;

export function FunnelBars({
  funnel,
  labels,
  variant,
  className,
}: {
  funnel: InteractionFunnel;
  labels: readonly [viewed: string, selected: string, clicked: string];
  variant: keyof typeof VARIANTS;
  className: string;
}) {
  const style = VARIANTS[variant];
  const { viewed, selected, clicked } = funnel.stages;
  const stages = [
    { key: 'viewed', label: labels[0], count: viewed },
    { key: 'selected', label: labels[1], count: selected },
    { key: 'clicked', label: labels[2], count: clicked },
  ];
  const transitions = [funnel.rates.view_to_select_pct, funnel.rates.select_to_button_pct];
  const maxCount =
    variant === 'compact' ? Math.max(viewed, 1) : Math.max(viewed, selected, clicked, 1);

  return (
    <div className={className}>
      {stages.map((stage, i) => (
        <div key={stage.key}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-neutral-700">{stage.label}</span>
            <span className="tabular-nums font-semibold text-neutral-900">
              {formatNumber(stage.count)}
              <span className="ml-1 text-xs font-normal text-neutral-400">
                tekil session
              </span>
            </span>
          </div>
          <div className={style.track}>
            <div
              className={style.bar}
              style={{
                width: `${Math.max((stage.count / maxCount) * 100, stage.count > 0 ? style.minWidthPct : 0)}%`,
                ...(style.fade ? { opacity: 1 - i * style.fade } : {}),
              }}
            />
          </div>
          {i < transitions.length && (
            <div className="mt-1.5 pl-1 text-xs text-neutral-500">
              ↓ {formatPercent(transitions[i])} bir sonraki adıma geçti
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
