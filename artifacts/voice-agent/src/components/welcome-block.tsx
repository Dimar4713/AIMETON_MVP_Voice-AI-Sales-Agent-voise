import { Settings, KeyRound, Bot, PhoneCall, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WelcomeBlockProps {
  keySaved: boolean;
  hasAgent: boolean;
  onOpenSettings: () => void;
}

interface Step {
  icon: typeof Settings;
  title: string;
  description: string;
  done: boolean;
}

/** Onboarding checklist shown until the operator has a key and an agent. */
export function WelcomeBlock({ keySaved, hasAgent, onOpenSettings }: WelcomeBlockProps) {
  const steps: Step[] = [
    {
      icon: Settings,
      title: 'Откройте настройки',
      description: 'Нажмите «Настройки» в правом верхнем углу',
      done: keySaved,
    },
    {
      icon: KeyRound,
      title: 'Введите API-ключ',
      description: 'Вставьте ваш ключ ElevenLabs и сохраните его',
      done: keySaved,
    },
    {
      icon: Bot,
      title: 'Создайте AI-агента',
      description: 'Нажмите «Создать AI-агента» на главном экране',
      done: hasAgent,
    },
    {
      icon: PhoneCall,
      title: 'Нажмите «Позвонить»',
      description: 'Начните живой разговор с AI-агентом продаж',
      done: false,
    },
  ];

  return (
    <div
      className="animate-soft-rise rounded-xl border border-card-border bg-card/60 p-6 backdrop-blur-sm"
      data-testid="panel-welcome"
    >
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Начало работы
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Выполните четыре шага, чтобы запустить первый звонок
          </p>
        </div>
        <button
          onClick={onOpenSettings}
          className="hover-elevate active-elevate-2 flex items-center gap-1.5 rounded-md border border-primary-border bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
          data-testid="button-welcome-settings"
        >
          <Settings className="h-3.5 w-3.5" />
          Настройки
        </button>
      </div>
      <ol className="space-y-1">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              className={cn(
                'flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors duration-300',
                step.done
                  ? 'border-primary-border bg-primary/10'
                  : 'border-transparent bg-secondary/40',
              )}
              data-testid={`step-onboarding-${index + 1}`}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold transition-colors duration-300',
                  step.done
                    ? 'border-primary-border bg-primary text-primary-foreground'
                    : 'border-border bg-muted text-muted-foreground',
                )}
              >
                {index + 1}
              </div>
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  step.done ? 'text-[hsl(var(--primary))]' : 'text-muted-foreground',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{step.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {step.description}
                </p>
              </div>
              {index < steps.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
