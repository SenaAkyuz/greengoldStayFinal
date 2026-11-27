import { Card, Stat } from './ui';

/** Tek metrik kartı. G2: tasarım dilinin `Card` + `Stat` bileşenleri; değer boşsa "—". */
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
    <Card padding="md">
      <Stat label={label} value={value} unit={unit} hint={hint} />
    </Card>
  );
}
