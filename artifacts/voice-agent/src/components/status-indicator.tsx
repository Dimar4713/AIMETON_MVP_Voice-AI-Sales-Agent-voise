import { cn } from '@/lib/utils';

export type IndicatorTone = 'idle' | 'good' | 'warn' | 'bad' | 'active';

const toneStyles: Record<IndicatorTone, string> = {
  idle: 'bg-muted-foreground/40',
  good: 'bg-[hsl(var(--primary))]',
  warn: 'bg-[hsl(var(--accent))]',
  bad: 'bg-[hsl(var(--destructive))]',
  active: 'bg-[hsl(var(--primary))]',
};

interface StatusIndicatorProps {
  tone: IndicatorTone;
  label: string;
  value: string;
  pulse?: boolean;
  testId?: string;
}

/** Small status row: colored dot + label + value, used across the status rail. */
export function StatusIndicator({
  tone,
  label,
  value,
  pulse,
  testId,
}: StatusIndicatorProps) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5"
      data-testid={testId}
    >
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5">
          {pulse && (
            <span
              className={cn(
                'absolute inline-flex h-full w-full rounded-full opacity-75 animate-signal-ring',
                toneStyles[tone],
              )}
            />
          )}
          <span
            className={cn(
              'relative inline-flex h-2.5 w-2.5 rounded-full transition-colors duration-500',
              toneStyles[tone],
            )}
          />
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
      </div>
      <span
        className={cn(
          'font-mono text-xs font-medium transition-colors duration-500',
          tone === 'bad'
            ? 'text-[hsl(var(--destructive))]'
            : tone === 'warn'
              ? 'text-[hsl(var(--accent))]'
              : tone === 'idle'
                ? 'text-muted-foreground'
                : 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}
