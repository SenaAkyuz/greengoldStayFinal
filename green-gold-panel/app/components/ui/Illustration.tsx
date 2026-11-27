import type { ReactNode } from 'react';

/**
 * Boş durum çizimleri (UX-2.5 / plan G7). Tek çizgi kalınlığı (2px), mürekkep
 * rengi + tek altın vurgu; metin ve marka içermez. Renkler token'lardan.
 */
export type IllustrationName = 'calendar' | 'chart' | 'key' | 'browser' | 'leaf';

const INK = 'var(--ds-color-heading)';
const GOLD = 'var(--ds-palette-sun-500)';
const SOFT = 'var(--ds-color-surface-highlight)';

function Leaf({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 22C0 8 10 0 26 0c0 15-9 24-22 24" fill={SOFT} stroke={INK} strokeWidth={2 / s} strokeLinejoin="round" />
      <path d="M2 22C8 15 14 10 21 5" fill="none" stroke={GOLD} strokeWidth={2 / s} strokeLinecap="round" />
    </g>
  );
}

const ART: Record<IllustrationName, ReactNode> = {
  calendar: (
    <>
      <rect x="52" y="28" width="96" height="84" rx="10" fill="#fff" stroke={INK} strokeWidth="2" />
      <path d="M52 50h96" stroke={INK} strokeWidth="2" />
      <path d="M74 20v16M126 20v16" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      {[0, 1, 2, 3].map((c) => [0, 1, 2].map((r) => (
        <rect key={`${c}-${r}`} x={64 + c * 20} y={60 + r * 15} width="10" height="7" rx="2" fill={c === 2 && r === 1 ? GOLD : SOFT} />
      )))}
      <Leaf x={136} y={84} s={1.1} />
    </>
  ),
  chart: (
    <>
      <path d="M44 112h112" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      {[[56, 70], [80, 52], [104, 84], [128, 38]].map(([x, h], i) => (
        <rect key={x} x={x} y={112 - h} width="16" height={h} rx="3" fill={i === 3 ? SOFT : '#fff'} stroke={INK} strokeWidth="2" />
      ))}
      <path d="M58 46l26-16 22 12 30-22" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Leaf x={140} y={8} s={0.9} />
    </>
  ),
  key: (
    <>
      <rect x="50" y="30" width="100" height="70" rx="10" fill="#fff" stroke={INK} strokeWidth="2" transform="rotate(-8 100 65)" />
      <path d="M66 52h40M66 64h26" stroke={INK} strokeWidth="2" strokeLinecap="round" transform="rotate(-8 100 65)" />
      <rect x="112" y="72" width="24" height="16" rx="3" fill={SOFT} stroke={GOLD} strokeWidth="2" transform="rotate(-8 100 65)" />
      <Leaf x={40} y={92} s={0.9} />
    </>
  ),
  browser: (
    <>
      <rect x="38" y="24" width="124" height="88" rx="10" fill="#fff" stroke={INK} strokeWidth="2" />
      <path d="M38 42h124" stroke={INK} strokeWidth="2" />
      <circle cx="50" cy="33" r="2.5" fill={INK} /><circle cx="59" cy="33" r="2.5" fill={INK} /><circle cx="68" cy="33" r="2.5" fill={GOLD} />
      <path d="M84 64l-12 11 12 11M116 64l12 11-12 11M106 60l-12 32" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Leaf x={146} y={92} s={0.9} />
    </>
  ),
  leaf: (
    <>
      <circle cx="100" cy="68" r="44" fill={SOFT} />
      <Leaf x={74} y={40} s={2} />
    </>
  ),
};

export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 132" width="200" height="132" aria-hidden="true" focusable="false">
      {ART[name]}
    </svg>
  );
}
