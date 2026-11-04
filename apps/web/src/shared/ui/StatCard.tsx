import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card } from './Card.tsx';

export interface StatCardProps {
  readonly label: string;
  readonly value: string;
  readonly deltaLabel: string;
  readonly trend?: 'up' | 'down' | 'neutral';
}

export function StatCard({ label, value, deltaLabel, trend = 'neutral' }: StatCardProps) {
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;

  return (
    <Card className="flex flex-col justify-between gap-3">
      <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
      <span className="tap-heading-lg tap-tabular text-4xl">{value}</span>
      <div className="flex items-center gap-1.5 text-xs text-muted tap-tabular">
        <TrendIcon className="h-3.5 w-3.5 shrink-0 text-heading" aria-hidden="true" />
        <span>{deltaLabel}</span>
      </div>
    </Card>
  );
}
