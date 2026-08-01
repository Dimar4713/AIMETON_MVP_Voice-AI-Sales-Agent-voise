import { useEffect, useState } from 'react';
import {
  useGetSettingsStatus,
  useGetAgentStatus,
  useCreateAgent,
  useGetSignedUrl,
  getGetSignedUrlQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { SettingsDialog } from '@/components/settings-dialog';
import { StatusIndicator, type IndicatorTone } from '@/components/status-indicator';
import { LogsPanel } from '@/components/logs-panel';
import { WelcomeBlock } from '@/components/welcome-block';
import { useAppState, type CallStatus } from '@/hooks/use-app-state';
import { useConversation } from '@/hooks/use-conversation';
import {
  Phone,
  PhoneOff,
  Bot,
  Settings,
  Radio,
  Loader2,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { MicLevelBar, MicTestPanel } from '@/components/mic-level';
import { cn } from '@/lib/utils';

const callStatusMeta: Record<
  CallStatus,
  { label: string; tone: IndicatorTone }
> = {
  idle: { label: 'Ожидание', tone: 'idle' },
  'requesting-mic': { label: 'Запрос микрофона...', tone: 'warn' },
  connecting: { label: 'Подключение...', tone: 'warn' },
  active: { label: 'В разговоре', tone: 'active' },
  ending: { label: 'Завершение...', tone: 'warn' },
};

export default function Dashboard() {
  const appState = useAppState();
  const { keyStatus, setKeyStatus, agentStatus, setAgentStatus, callStatus, setCallStatus, logs, addLog, micLevel } =
    appState;
  const { startCall, endCall } = useConversation(appState);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const settingsStatusQuery = useGetSettingsStatus();
  const agentStatusQuery = useGetAgentStatus();

  const createAgent = useCreateAgent({
    mutation: {
      onSuccess: (result) => {
        setAgentStatus({ hasAgent: true, agentId: result.agentId });
        addLog('info', `AI-агент создан: ${result.agentId}`);
      },
      onError: (error) => {
        addLog('error', `Не удалось создать агента: ${error.message}`);
      },
    },
  });

  const signedUrlQuery = useGetSignedUrl({
    query: { enabled: false, queryKey: getGetSignedUrlQueryKey() },
  });

  // Sync server-fetched settings/agent status into local app state once loaded.
  useEffect(() => {
    if (settingsStatusQuery.data) {
      setKeyStatus({
        keySaved: settingsStatusQuery.data.keySaved,
        maskedKey: settingsStatusQuery.data.maskedKey ?? null,
      });
    }
  }, [settingsStatusQuery.data, setKeyStatus]);

  useEffect(() => {
    if (agentStatusQuery.data) {
      setAgentStatus({
        hasAgent: agentStatusQuery.data.hasAgent,
        agentId: agentStatusQuery.data.agentId ?? null,
      });
    }
  }, [agentStatusQuery.data, setAgentStatus]);

  const isCallActive = callStatus === 'active';
  const isCallBusy = callStatus !== 'idle';
  const showWelcome = !keyStatus.keySaved || !agentStatus.hasAgent;

  const handleCall = async () => {
    if (!agentStatus.hasAgent || isCallBusy) return;
    addLog('info', 'Запрашиваем защищённую ссылку для звонка...');
    try {
      const result = await signedUrlQuery.refetch();
      if (result.data?.signedUrl) {
        await startCall(result.data.signedUrl);
      } else {
        addLog('error', 'Сервер не вернул ссылку для соединения');
        setCallStatus('idle');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'неизвестная ошибка';
      addLog('error', `Не удалось получить ссылку для звонка: ${message}`);
      setCallStatus('idle');
    }
  };

  const handleEndCall = () => {
    if (!isCallBusy) return;
    endCall();
  };

  const handleCreateAgent = () => {
    if (!keyStatus.keySaved || createAgent.isPending) return;
    addLog('info', 'Создаём AI-агента продаж...');
    createAgent.mutate();
  };

  const callMeta = callStatusMeta[callStatus];

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
      <div className="pointer-events-none fixed inset-0 opacity-[0.03] mix-blend-overlay" />

      {/* Header */}
      <header className="z-30 shrink-0 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary-border bg-primary/15">
              <Radio className="h-5 w-5 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">
                Пункт управления AI-звонками
              </h1>
              <p className="text-xs text-muted-foreground">
                Voice AI Sales Agent · Живые голосовые продажи
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setSettingsOpen(true)}
            data-testid="button-open-settings"
          >
            <Settings className="h-4 w-4" />
            Настройки
          </Button>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:overflow-hidden">
        {showWelcome && (
          <div className="mb-6">
            <WelcomeBlock
              keySaved={keyStatus.keySaved}
              hasAgent={agentStatus.hasAgent}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Main action column */}
          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="flex flex-col gap-6">
            <div className="relative overflow-hidden rounded-xl border border-card-border bg-card/60 p-6 backdrop-blur-sm sm:p-8">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Управление звонком
                  </h2>
                  <p className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                    {isCallActive ? 'Звонок в процессе' : 'Готовы к звонку'}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'gap-1.5 px-3 py-1.5 text-xs transition-colors duration-500',
                    callMeta.tone === 'active' &&
                      'border-primary-border bg-primary/10 text-[hsl(var(--primary))]',
                    callMeta.tone === 'warn' &&
                      'border-[hsl(var(--accent))]/40 bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]',
                  )}
                  data-testid="badge-call-status"
                >
                  {isCallBusy && callStatus !== 'active' && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  {callMeta.label}
                </Badge>
              </div>

              {/* Central call visual */}
              <div className="mb-6 flex items-center justify-center py-4">
                <div className="relative flex h-40 w-40 items-center justify-center sm:h-48 sm:w-48">
                  {isCallActive && (
                    <>
                      <span className="absolute inline-flex h-full w-full animate-signal-ring rounded-full bg-[hsl(var(--primary))]/40" />
                      <span
                        className="absolute inline-flex h-full w-full animate-signal-ring rounded-full bg-[hsl(var(--primary))]/30"
                        style={{ animationDelay: '0.6s' }}
                      />
                    </>
                  )}
                  <div
                    className={cn(
                      'relative flex h-28 w-28 items-center justify-center rounded-full border-2 transition-all duration-500 sm:h-32 sm:w-32',
                      isCallActive
                        ? 'border-[hsl(var(--primary))] bg-primary/15 shadow-[0_0_40px_hsl(var(--primary)/0.3)]'
                        : 'border-border bg-muted/50',
                    )}
                  >
                    <Bot
                      className={cn(
                        'h-11 w-11 transition-colors duration-500 sm:h-12 sm:w-12',
                        isCallActive
                          ? 'text-[hsl(var(--primary))]'
                          : 'text-muted-foreground',
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Live mic level — only visible during active call */}
              {isCallActive && (
                <div className="mb-5 rounded-lg border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/5 px-4 py-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Сигнал микрофона
                  </p>
                  <MicLevelBar level={micLevel} />
                  {micLevel === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Индикатор молчит — убедитесь, что микрофон не заглушён в системе
                    </p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  size="lg"
                  onClick={handleCall}
                  disabled={!agentStatus.hasAgent || isCallBusy}
                  className={cn(
                    'h-14 text-base font-semibold',
                    isCallActive && 'animate-pulse',
                  )}
                  data-testid="button-call"
                >
                  {callStatus === 'requesting-mic' || callStatus === 'connecting' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Phone className="h-5 w-5" />
                  )}
                  Позвонить
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={handleEndCall}
                  disabled={!isCallBusy}
                  className="h-14 text-base font-semibold"
                  data-testid="button-end-call"
                >
                  <PhoneOff className="h-5 w-5" />
                  Завершить разговор
                </Button>
              </div>

              <Separator className="my-5" />

              <Button
                variant="secondary"
                size="lg"
                onClick={handleCreateAgent}
                disabled={!keyStatus.keySaved || createAgent.isPending}
                className="h-12 w-full text-sm font-medium"
                data-testid="button-create-agent"
              >
                {createAgent.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Создать AI-агента
              </Button>
            </div>

            {/* Status rail */}
            <div className="rounded-xl border border-card-border bg-card/60 p-5 backdrop-blur-sm sm:p-6">
              <div className="mb-1 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-tight">
                  Состояние системы
                </h2>
              </div>
              <div className="divide-y divide-border">
                <StatusIndicator
                  label="API-ключ"
                  value={keyStatus.keySaved ? 'Сохранён' : 'Не задан'}
                  tone={keyStatus.keySaved ? 'good' : 'bad'}
                  testId="status-api-key"
                />
                <StatusIndicator
                  label="AI-агент"
                  value={
                    agentStatus.hasAgent && agentStatus.agentId
                      ? agentStatus.agentId
                      : 'Не создан'
                  }
                  tone={agentStatus.hasAgent ? 'good' : 'bad'}
                  testId="status-agent"
                />
                <StatusIndicator
                  label="Соединение"
                  value={callMeta.label}
                  tone={callMeta.tone}
                  pulse={isCallActive}
                  testId="status-call"
                />
              </div>
            </div>
            </div>
          </div>

          {/* Right column: mic test + logs */}
          <div className="flex min-h-[420px] min-w-0 flex-col gap-6 lg:min-h-0">
            <MicTestPanel />
            <div className="min-h-0 flex-1">
              <LogsPanel logs={logs} />
            </div>
          </div>
        </div>
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        appState={appState}
      />
    </div>
  );
}
