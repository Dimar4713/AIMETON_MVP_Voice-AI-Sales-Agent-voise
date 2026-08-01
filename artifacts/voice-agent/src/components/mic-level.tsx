import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Live microphone level bar — shows a VU meter while the mic is active.
 * level: 0-100 from the AnalyserNode RMS reading during a call.
 */
export function MicLevelBar({ level }: { level: number }) {
  // 12 segments: light up proportionally to level
  const segments = 12;
  const lit = Math.round((level / 100) * segments);

  return (
    <div className="flex items-center gap-1.5">
      <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="flex gap-[3px]">
        {Array.from({ length: segments }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-3.5 w-1.5 rounded-sm transition-all duration-75',
              i < lit
                ? i < 7
                  ? 'bg-[hsl(var(--primary))]'
                  : i < 10
                    ? 'bg-[hsl(var(--accent))]'
                    : 'bg-destructive'
                : 'bg-muted',
            )}
          />
        ))}
      </div>
      <span className="w-7 text-right font-mono text-xs text-muted-foreground">
        {level}
      </span>
    </div>
  );
}

type TestState = 'idle' | 'testing' | 'success' | 'error';

/**
 * Standalone mic test panel. Opens the mic independently of a call,
 * shows a live VU meter for 5 seconds, then reports pass/fail.
 */
export function MicTestPanel() {
  const [state, setState] = useState<TestState>('idle');
  const [level, setLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTest = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => undefined);
      ctxRef.current = null;
    }
    setLevel(0);
  }, []);

  useEffect(() => () => stopTest(), [stopTest]);

  const runTest = useCallback(async () => {
    setPeakLevel(0);
    setErrorMsg('');
    setState('testing');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: false,
        },
      });
      streamRef.current = stream;

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      // Use the system's native rate — forcing 16 kHz is unreliable across browsers
      const ctx = new AudioContextCtor();
      ctxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let peak = 0;

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const s = (data[i] - 128) / 128;
          sum += s * s;
        }
        const rms = Math.sqrt(sum / data.length);
        const lvl = Math.min(100, Math.round(rms * 300));
        setLevel(lvl);
        if (lvl > peak) {
          peak = lvl;
          setPeakLevel(peak);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      // Auto-stop after 5 seconds and evaluate
      timerRef.current = setTimeout(() => {
        stopTest();
        if (peak >= 3) {
          setState('success');
        } else {
          setState('error');
          setErrorMsg(
            'Сигнал не обнаружен. Проверьте, что микрофон не заглушён и выбран верный источник в настройках системы.',
          );
        }
        setPeakLevel(peak);
      }, 5000);
    } catch (err) {
      stopTest();
      setState('error');
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setErrorMsg(
        msg.includes('Permission')
          ? 'Доступ к микрофону запрещён. Разрешите его в настройках браузера и попробуйте снова.'
          : `Ошибка микрофона: ${msg}`,
      );
    }
  }, [stopTest]);

  return (
    <div className="rounded-xl border border-card-border bg-card/60 p-5 backdrop-blur-sm sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Mic className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight">Тест микрофона</h2>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Нажмите «Проверить» и говорите — индикатор покажет, слышит ли браузер ваш
        микрофон (16 кГц, как в звонке).
      </p>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Уровень сигнала</span>
          {peakLevel > 0 && (
            <span className="font-mono">пик: {peakLevel}</span>
          )}
        </div>
        <MicLevelBar level={level} />
      </div>

      {state === 'success' && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/10 px-3 py-2 text-xs text-[hsl(var(--primary))]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Микрофон работает — пиковый уровень{' '}
            <span className="font-mono font-semibold">{peakLevel}</span>. Можно
            звонить.
          </span>
        </div>
      )}

      {state === 'error' && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <Button
        size="sm"
        variant={state === 'testing' ? 'secondary' : 'outline'}
        onClick={state === 'testing' ? stopTest : runTest}
        className="w-full"
      >
        {state === 'testing' ? (
          <>
            <MicOff className="h-4 w-4" />
            Остановить тест
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" />
            {state === 'idle' ? 'Проверить микрофон' : 'Проверить ещё раз'}
          </>
        )}
      </Button>

      {state === 'testing' && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Говорите в микрофон… тест завершится через 5 секунд
        </p>
      )}
    </div>
  );
}
