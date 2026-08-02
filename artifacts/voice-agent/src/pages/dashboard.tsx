import { useEffect, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type AgentConfiguration,
  type AgentStatus,
  AgentCreateInputSalesMode,
  useGetSettingsStatus,
  useGetAgentStatus,
  useCreateAgent,
  useUpdateAgentConfiguration,
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
  Upload,
  FileText,
  Eye,
  GraduationCap,
  Dumbbell,
  BriefcaseBusiness,
  X,
  type LucideIcon,
} from 'lucide-react';
import { MicLevelBar, MicTestPanel } from '@/components/mic-level';
import { cn } from '@/lib/utils';
import type { AgentCreateInputSalesMode as SalesMode } from '@workspace/api-client-react';

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

const salesModeOptions: Array<{
  value: SalesMode;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: AgentCreateInputSalesMode.online_course,
    title: 'Онлайн-курс',
    description: 'Обучение и развитие навыков',
    icon: GraduationCap,
  },
  {
    value: AgentCreateInputSalesMode.fitness_membership,
    title: 'Фитнес-абонемент',
    description: 'Тренировки и физическая форма',
    icon: Dumbbell,
  },
  {
    value: AgentCreateInputSalesMode.crm_system,
    title: 'CRM-система',
    description: 'Продажи и управление клиентами',
    icon: BriefcaseBusiness,
  },
];

const salesModeLabels = Object.fromEntries(
  salesModeOptions.map((option) => [option.value, option]),
) as Record<SalesMode, (typeof salesModeOptions)[number]>;

export default function Dashboard() {
  const appState = useAppState();
  const { keyStatus, setKeyStatus, agentStatus, setAgentStatus, callStatus, setCallStatus, logs, addLog, micLevel } =
    appState;
  const { startCall, endCall } = useConversation(appState);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [salesMode, setSalesMode] = useState<SalesMode>(
    AgentCreateInputSalesMode.crm_system,
  );
  const [serviceDescription, setServiceDescription] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [savedSalesMode, setSavedSalesMode] = useState<SalesMode | null>(null);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);
  const [savedServiceDescription, setSavedServiceDescription] = useState('');
  const [agentConfigurations, setAgentConfigurations] = useState<
    Partial<Record<SalesMode, AgentConfiguration>>
  >({});

  const settingsStatusQuery = useGetSettingsStatus();
  const agentStatusQuery = useGetAgentStatus();
  const queryClient = useQueryClient();

  const updateAgentStatusCache = (configuration: AgentConfiguration) => {
    queryClient.setQueryData<AgentStatus>(
      ['/api/agent/status'],
      (current) => ({
        hasAgent: true,
        agents: [
          ...(current?.agents ?? []).filter(
            (agent) => agent.salesMode !== configuration.salesMode,
          ),
          configuration,
        ],
      }),
    );
  };

  const createAgent = useCreateAgent({
    mutation: {
      onSuccess: (result) => {
        setAgentStatus({ hasAgent: true, agentId: result.agentId });
        const configuration: AgentConfiguration = {
          agentId: result.agentId,
          salesMode,
          fileName: uploadedFileName,
          serviceDescription: serviceDescription.trim() || null,
        };
        updateAgentStatusCache(configuration);
        setAgentConfigurations((previous) => ({
          ...previous,
          [salesMode]: configuration,
        }));
        setSavedSalesMode(salesMode);
        setSavedFileName(uploadedFileName);
        setSavedServiceDescription(serviceDescription.trim());
        addLog(
          'info',
          `AI-агент создан: ${result.agentId}. Файл «${uploadedFileName ?? 'без файла'}» прикреплён к этому агенту.`,
        );
      },
      onError: (error) => {
        addLog('error', `Не удалось создать агента: ${error.message}`);
      },
    },
  });

  const updateAgent = useUpdateAgentConfiguration({
    mutation: {
      onSuccess: (result) => {
        setAgentStatus({ hasAgent: true, agentId: result.agentId ?? null });
        if (result.agentId && result.salesMode) {
          const configuration: AgentConfiguration = {
            agentId: result.agentId,
            salesMode: result.salesMode,
            fileName: result.fileName ?? null,
            serviceDescription: result.serviceDescription ?? null,
          };
          updateAgentStatusCache(configuration);
          setAgentConfigurations((previous) => ({
            ...previous,
            [result.salesMode as SalesMode]: configuration,
          }));
        }
        setSavedSalesMode(result.salesMode ?? salesMode);
        setSavedFileName(result.fileName ?? null);
        setSavedServiceDescription(result.serviceDescription ?? '');
        addLog(
          'info',
          `Конфигурация текущего агента обновлена. Файл «${result.fileName ?? 'без файла'}» теперь прикреплён к ${result.agentId}.`,
        );
        void agentStatusQuery.refetch();
      },
      onError: (error) => {
        addLog('error', `Не удалось обновить текущего агента: ${error.message}`);
      },
    },
  });

  const signedUrlQuery = useGetSignedUrl(
    { salesMode },
    {
      query: {
        enabled: false,
        queryKey: getGetSignedUrlQueryKey({ salesMode }),
      },
    },
  );

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
      const configurations = Object.fromEntries(
        (agentStatusQuery.data.agents ?? []).map((configuration) => [
          configuration.salesMode,
          configuration,
        ]),
      ) as Partial<Record<SalesMode, AgentConfiguration>>;
      const selectedConfiguration = configurations[salesMode];

      setAgentConfigurations(configurations);
      setAgentStatus({
        hasAgent: Boolean(selectedConfiguration?.agentId),
        agentId: selectedConfiguration?.agentId ?? null,
      });
      setSavedSalesMode(selectedConfiguration?.salesMode ?? salesMode);
      setSavedFileName(selectedConfiguration?.fileName ?? null);
      setSavedServiceDescription(selectedConfiguration?.serviceDescription ?? '');
      setUploadedFileName(selectedConfiguration?.fileName ?? null);
      setServiceDescription(selectedConfiguration?.serviceDescription ?? '');
    }
  }, [agentStatusQuery.data, salesMode, setAgentStatus]);

  const selectSalesMode = (mode: SalesMode) => {
    if (isCallBusy || isAgentMutationPending) return;

    const configuration = agentConfigurations[mode];
    setSalesMode(mode);
    setAgentStatus({
      hasAgent: Boolean(configuration?.agentId),
      agentId: configuration?.agentId ?? null,
    });
    setSavedSalesMode(configuration?.salesMode ?? mode);
    setSavedFileName(configuration?.fileName ?? null);
    setSavedServiceDescription(configuration?.serviceDescription ?? '');
    setUploadedFileName(configuration?.fileName ?? null);
    setServiceDescription(configuration?.serviceDescription ?? '');
    setFileError(null);
    addLog(
      configuration?.agentId ? 'info' : 'warn',
      configuration?.agentId
        ? `Выбран агент ${configuration.agentId} для направления «${salesModeLabels[mode].title}».`
        : `Для направления «${salesModeLabels[mode].title}» агент ещё не создан.`,
    );
  };

  const isCallActive = callStatus === 'active';
  const isCallBusy = callStatus !== 'idle';
  const showWelcome = !keyStatus.keySaved || !agentStatus.hasAgent;

  const handleCall = async () => {
    if (!agentStatus.hasAgent || !agentStatus.agentId || isCallBusy) return;
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
    if (
      !keyStatus.keySaved ||
      createAgent.isPending ||
      updateAgent.isPending
    )
      return;
    addLog(
      'info',
      `Создаём AI-агента продаж: ${salesModeLabels[salesMode].title}...`,
    );
    createAgent.mutate({
      data: {
        salesMode,
        fileName: uploadedFileName,
        ...(serviceDescription.trim()
          ? { serviceDescription: serviceDescription.trim() }
          : {}),
      },
    });
  };

  const handleUpdateAgent = () => {
    if (
      !keyStatus.keySaved ||
      !agentStatus.hasAgent ||
      !agentStatus.agentId ||
      createAgent.isPending ||
      updateAgent.isPending
    )
      return;

    addLog(
      'info',
      `Обновляем текущего агента ${agentStatus.agentId ?? ''}: ${salesModeLabels[salesMode].title}...`,
    );
    updateAgent.mutate({
      data: {
        salesMode,
        fileName: uploadedFileName,
        serviceDescription: serviceDescription.trim() || null,
      },
    });
  };

  const handleServiceFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setFileError(null);

    if (!file) return;

    const supportedExtensions = [
      '.txt',
      '.md',
      '.csv',
      '.json',
      '.html',
      '.htm',
    ];
    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!supportedExtensions.includes(extension)) {
      setFileError(
        'Поддерживаются текстовые файлы: TXT, MD, CSV, JSON и HTML.',
      );
      return;
    }

    if (file.size > 200_000) {
      setFileError('Файл слишком большой. Максимальный размер — 200 КБ.');
      return;
    }

    try {
      const text = await file.text();
      if (!text.trim()) {
        setFileError('Файл пустой. Загрузите описание услуги с текстом.');
        return;
      }
      if (text.length > 50_000) {
        setFileError(
          'Описание слишком длинное. Сократите файл до 50 000 символов.',
        );
        return;
      }
      setServiceDescription(text);
      setUploadedFileName(file.name);
    } catch {
      setFileError('Не удалось прочитать файл. Попробуйте другой текстовый файл.');
    }
  };

  const clearServiceFile = () => {
    setServiceDescription('');
    setUploadedFileName(null);
    setFileError(null);
  };

  const isAgentMutationPending =
    createAgent.isPending || updateAgent.isPending;
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

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:h-0 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Main action column */}
          <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
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

              {agentStatus.hasAgent && (
                <div className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Текущая конфигурация агента
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Этот файл и режим уже применены именно к текущему агенту.
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 border-primary/30 bg-primary/10 text-[hsl(var(--primary))]"
                    >
                      Активен
                    </Badge>
                  </div>

                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-lg border border-card-border bg-background/40 px-3 py-2.5">
                      <span className="block text-muted-foreground">ID агента</span>
                      <span className="mt-1 block break-all font-mono text-[11px]">
                        {agentStatus.agentId}
                      </span>
                    </div>
                    <div className="rounded-lg border border-card-border bg-background/40 px-3 py-2.5">
                      <span className="block text-muted-foreground">
                        Направление
                      </span>
                      <span className="mt-1 block font-medium">
                        {savedSalesMode
                          ? salesModeLabels[savedSalesMode].title
                          : 'Не указано'}
                      </span>
                    </div>
                    <div className="rounded-lg border border-card-border bg-background/40 px-3 py-2.5 sm:col-span-2">
                      <span className="block text-muted-foreground">
                        Прикреплённый файл
                      </span>
                      <span className="mt-1 flex items-center gap-2 font-medium">
                        <FileText className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                        {savedFileName ?? 'Файл не прикреплён'}
                        {savedServiceDescription && (
                          <span className="font-normal text-muted-foreground">
                            · {savedServiceDescription.length.toLocaleString('ru-RU')} симв.
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {savedServiceDescription && (
                    <details className="mt-3 rounded-lg border border-card-border bg-background/40">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                        <Eye className="h-3.5 w-3.5" />
                        Посмотреть прикреплённое описание
                      </summary>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-card-border px-3 py-3 font-sans text-xs leading-relaxed text-muted-foreground">
                        {savedServiceDescription}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <Separator className="my-5" />

              <div className="mb-5 rounded-xl border border-card-border bg-background/35 p-4 sm:p-5">
                <div className="mb-4">
                  <p className="text-sm font-semibold">Направление продаж</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Выберите направление звонка. Для каждого направления хранится
                    свой агент, ID и описание услуги.
                  </p>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-3">
                  {salesModeOptions.map((option) => {
                    const Icon = option.icon;
                    const selected = salesMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => selectSalesMode(option.value)}
                        className={cn(
                          'rounded-lg border px-3 py-3 text-left transition-colors',
                          selected
                            ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                            : 'border-card-border bg-secondary/30 text-muted-foreground hover:border-primary/50 hover:text-foreground',
                        )}
                        aria-pressed={selected}
                        data-testid={`sales-mode-${option.value}`}
                      >
                        <Icon
                          className={cn(
                            'mb-2 h-4 w-4',
                            selected
                              ? 'text-[hsl(var(--primary))]'
                              : 'text-muted-foreground',
                          )}
                        />
                        <span className="block text-xs font-semibold leading-snug">
                          {option.title}
                        </span>
                        <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                          {option.description}
                        </span>
                        <span
                          className={cn(
                            'mt-2 block truncate text-[10px] font-medium',
                            agentConfigurations[option.value]
                              ? 'text-[hsl(var(--primary))]'
                              : 'text-muted-foreground',
                          )}
                        >
                          {agentConfigurations[option.value]
                            ? `Агент: ${agentConfigurations[option.value]?.agentId}`
                            : 'Агент ещё не создан'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Описание услуги для агента
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Загрузите файл с ценами, условиями, программой и ответами на
                        частые вопросы.
                      </p>
                    </div>
                    <label
                      htmlFor="service-description-file"
                      className={cn(
                        'inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-card-border bg-secondary/50 px-3 py-2 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-secondary',
                        createAgent.isPending &&
                          'pointer-events-none opacity-50',
                      )}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Загрузить файл
                      <input
                        id="service-description-file"
                        type="file"
                        accept=".txt,.md,.csv,.json,.html,.htm,text/plain,text/markdown,text/csv,application/json,text/html"
                        className="sr-only"
                        onChange={handleServiceFile}
                        disabled={isAgentMutationPending}
                      />
                    </label>
                  </div>

                  {uploadedFileName ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
                        <span className="truncate text-xs font-medium">
                          {uploadedFileName}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {serviceDescription.length.toLocaleString('ru-RU')} симв.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={clearServiceFile}
                        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                        aria-label="Удалить описание услуги"
                        data-testid="button-remove-service-file"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="service-description-file"
                      className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-card-border px-4 py-4 text-center text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      Можно загрузить TXT, MD, CSV, JSON или HTML до 200 КБ
                    </label>
                  )}

                  {fileError && (
                    <p className="mt-2 text-xs text-destructive" role="alert">
                      {fileError}
                    </p>
                  )}
                </div>
              </div>

              <Button
                variant="secondary"
                size="lg"
                onClick={handleCreateAgent}
                disabled={!keyStatus.keySaved || isAgentMutationPending}
                className="h-12 w-full text-sm font-medium"
                data-testid="button-create-agent"
              >
                {isAgentMutationPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Создать AI-агента для выбранного направления
              </Button>
              {agentStatus.hasAgent && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleUpdateAgent}
                  disabled={
                    !keyStatus.keySaved ||
                    isAgentMutationPending ||
                    !agentStatus.agentId
                  }
                  className="mt-2 h-11 w-full text-sm font-medium"
                  data-testid="button-update-agent"
                >
                  {updateAgent.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  Обновить текущего агента
                </Button>
              )}
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
          <div className="flex min-h-[420px] min-w-0 flex-col gap-6 lg:h-full lg:min-h-0">
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
