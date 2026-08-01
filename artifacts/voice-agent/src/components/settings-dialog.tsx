import { useEffect, useState } from 'react';
import {
  useSaveApiKey,
  getGetSettingsStatusQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KeyRound, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import type { AppState } from '@/hooks/use-app-state';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appState: AppState;
}

/** Settings modal: enter and save the ElevenLabs API key. */
export function SettingsDialog({ open, onOpenChange, appState }: SettingsDialogProps) {
  const { keyStatus, setKeyStatus, addLog } = appState;
  const [apiKey, setApiKey] = useState('');
  const queryClient = useQueryClient();

  const saveApiKey = useSaveApiKey({
    mutation: {
      onSuccess: (result, variables) => {
        const key = variables.data.apiKey;
        const masked =
          key.length > 8
            ? `${key.slice(0, 4)}...${key.slice(-4)}`
            : `${key.slice(0, 2)}...`;
        setKeyStatus({ keySaved: true, maskedKey: masked });
        addLog('info', 'API-ключ ElevenLabs успешно сохранён');
        setApiKey('');
        queryClient.invalidateQueries({
          queryKey: getGetSettingsStatusQueryKey(),
        });
      },
      onError: (error) => {
        addLog('error', `Не удалось сохранить API-ключ: ${error.message}`);
      },
    },
  });

  useEffect(() => {
    if (!open) {
      setApiKey('');
    }
  }, [open]);

  const handleSave = () => {
    if (!apiKey.trim()) return;
    saveApiKey.mutate({ data: { apiKey: apiKey.trim() } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-card-border sm:max-w-md" data-testid="dialog-settings">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary-border bg-primary/15">
              <KeyRound className="h-4 w-4 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <DialogTitle>Настройки</DialogTitle>
              <DialogDescription>
                Подключение к ElevenLabs Conversational AI
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between rounded-lg border border-card-border bg-secondary/40 px-3.5 py-3">
            <span className="text-sm text-muted-foreground">Статус ключа</span>
            {keyStatus.keySaved ? (
              <Badge
                variant="outline"
                className="gap-1.5 border-primary-border bg-primary/10 text-[hsl(var(--primary))]"
                data-testid="badge-key-status"
              >
                <CheckCircle2 className="h-3 w-3" />
                API key сохранён ✓
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1.5 text-muted-foreground"
                data-testid="badge-key-status"
              >
                <ShieldAlert className="h-3 w-3" />
                API key не задан
              </Badge>
            )}
          </div>

          {keyStatus.keySaved && keyStatus.maskedKey && (
            <div className="rounded-lg border border-card-border bg-muted/40 px-3.5 py-2.5">
              <p className="text-xs text-muted-foreground">Сохранённый ключ</p>
              <p
                className="mt-0.5 font-mono text-sm tracking-wide"
                data-testid="text-masked-key"
              >
                {keyStatus.maskedKey}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="api-key-input"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {keyStatus.keySaved ? 'Заменить ключ' : 'ElevenLabs API-ключ'}
            </label>
            <Input
              id="api-key-input"
              type="password"
              placeholder="sk_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
              className="font-mono"
              data-testid="input-api-key"
            />
            <p className="text-xs text-muted-foreground">
              Ключ хранится на сервере и никогда не отображается полностью.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-settings-close"
          >
            Закрыть
          </Button>
          <Button
            onClick={handleSave}
            disabled={!apiKey.trim() || saveApiKey.isPending}
            data-testid="button-save-api-key"
          >
            {saveApiKey.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Сохранение...
              </>
            ) : (
              'Сохранить ключ'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
