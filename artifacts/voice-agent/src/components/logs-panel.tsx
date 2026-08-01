import { useEffect, useRef } from 'react';
import { AlertTriangle, Info, OctagonAlert, TerminalSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LogEntry, LogLevel } from '@/hooks/use-app-state';

const levelConfig: Record<
  LogLevel,
  { icon: typeof Info; color: string; label: string }
> = {
  info: { icon: Info, color: 'text-[hsl(var(--primary))]', label: 'INFO' },
  warn: { icon: AlertTriangle, color: 'text-[hsl(var(--accent))]', label: 'WARN' },
  error: {
    icon: OctagonAlert,
    color: 'text-[hsl(var(--destructive))]',
    label: 'ERR',
  },
};

function formatTime(date: Date) {
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface LogsPanelProps {
  logs: LogEntry[];
}

/** Scrolling event log — mission-control terminal feel, newest at bottom. */
export function LogsPanel({ logs }: LogsPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs.length]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-card-border bg-card/60 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-card-border px-4 py-3">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">
            Журнал событий
          </h2>
        </div>
        <span
          className="font-mono text-[11px] text-muted-foreground"
          data-testid="text-log-count"
        >
          {logs.length} событ{logs.length === 1 ? 'ие' : logs.length >= 2 && logs.length <= 4 ? 'ия' : 'ий'}
        </span>
      </div>
      <div
        className="logs-scroll flex-1 overflow-y-auto px-4 py-3"
        data-testid="panel-logs"
      >
        {logs.length === 0 ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-center">
            <TerminalSquare className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              Здесь появятся события звонков и системные сообщения
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {logs.map((log) => {
              const config = levelConfig[log.level];
              const Icon = config.icon;
              return (
                <li
                  key={log.id}
                  className="animate-soft-rise flex items-start gap-2.5 rounded-md px-2 py-1.5 font-mono text-[12.5px] leading-relaxed hover-elevate"
                  data-testid={`row-log-${log.id}`}
                >
                  <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', config.color)} />
                  <span className="shrink-0 text-muted-foreground">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className={cn('shrink-0 font-semibold', config.color)}>
                    {config.label}
                  </span>
                  <span className="break-words text-foreground/90">
                    {log.message}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
