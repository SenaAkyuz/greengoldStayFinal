import Link from 'next/link';
import { RANGE_LABELS, type RangeKey } from '@/lib/range';

const ORDER: RangeKey[] = ['month', '7d', '30d'];

export function RangePills({
  active,
  basePath = '/',
}: {
  active: RangeKey;
  basePath?: string;
}) {
  return (
    <nav className="inline-flex rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
      {ORDER.map((key) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={key === 'month' ? basePath : `${basePath}?range=${key}`}
            aria-current={isActive ? 'page' : undefined}
            className={
              'rounded-lg px-3.5 py-1.5 text-sm font-medium transition ' +
              (isActive
                ? 'bg-emerald-700 text-white'
                : 'text-neutral-600 hover:bg-neutral-50')
            }
          >
            {RANGE_LABELS[key]}
          </Link>
        );
      })}
    </nav>
  );
}
