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
    <nav className="inline-flex rounded-full border border-[#d8e2da] bg-white p-1 shadow-sm">
      {ORDER.map((key) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={key === 'month' ? basePath : `${basePath}?range=${key}`}
            aria-current={isActive ? 'page' : undefined}
            className={
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition ' +
              (isActive
                ? 'bg-[#0b5c49] text-white'
                : 'text-[#66756e] hover:bg-[#f1f5f1]')
            }
          >
            {RANGE_LABELS[key]}
          </Link>
        );
      })}
    </nav>
  );
}
