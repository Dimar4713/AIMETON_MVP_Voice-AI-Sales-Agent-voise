import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, CheckCircle2, XCircle, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Shared helpers ──────────────────────────────────────────────────────────

function getAudioContext() {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

/** 12-segment VU bar used both in the call view and the mic test panel. */
export function MicLevelBar({ level }: { level: number }) {
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

// ─── Mic test ────────────────────────────────────────────────────────────────

type TestState = 'idle' | 'testing' | 'success' | 'error';

function MicTest() {
  const [state, setState] = useState<TestState>('idle');
  const [level, setLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTest = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
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
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false },
      });
      streamRef.current = stream;
      const ctx = getAudioContext();
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
        for (let i = 0; i < data.length; i++) { const s = (data[i] - 128) / 128; sum += s * s; }
        const lvl = Math.min(100, Math.round(Math.sqrt(sum / data.length) * 300));
        setLevel(lvl);
        if (lvl > peak) { peak = lvl; setPeakLevel(peak); }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      timerRef.current = setTimeout(() => {
        stopTest();
        setState(peak >= 3 ? 'success' : 'error');
        if (peak < 3) setErrorMsg('Сигнал не обнаружен. Проверьте, что микрофон не заглушён и выбран верный источник в системных настройках.');
        setPeakLevel(peak);
      }, 5000);
    } catch (err) {
      stopTest();
      setState('error');
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setErrorMsg(msg.includes('Permission')
        ? 'Доступ к микрофону запрещён. Разрешите его в настройках браузера.'
        : `Ошибка: ${msg}`);
    }
  }, [stopTest]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Mic className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold tracking-tight">Микрофон</span>
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Уровень сигнала</span>
          {peakLevel > 0 && <span className="font-mono">пик: {peakLevel}</span>}
        </div>
        <MicLevelBar level={level} />
      </div>

      {state === 'success' && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/10 px-3 py-2 text-xs text-[hsl(var(--primary))]">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Работает — пик <span className="font-mono font-semibold">{peakLevel}</span></span>
        </div>
      )}
      {state === 'error' && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <Button
        size="sm"
        variant={state === 'testing' ? 'secondary' : 'outline'}
        onClick={state === 'testing' ? stopTest : runTest}
        className="w-full text-xs"
      >
        {state === 'testing' ? (
          <><MicOff className="h-3.5 w-3.5" />Остановить</>
        ) : (
          <><Mic className="h-3.5 w-3.5" />{state === 'idle' ? 'Проверить микрофон' : 'Повторить тест'}</>
        )}
      </Button>
      {state === 'testing' && (
        <p className="mt-1.5 text-center text-xs text-muted-foreground">Говорите… тест завершится через 5 с</p>
      )}
    </div>
  );
}

// ─── Speaker test ─────────────────────────────────────────────────────────────

type SpeakerState = 'idle' | 'playing' | 'confirm' | 'success' | 'error';

/**
 * Plays a short 440 Hz tone + fade so the user can confirm their speakers work.
 * Uses only the Web Audio API — no file downloads needed.
 */
function SpeakerTest() {
  const [state, setState] = useState<SpeakerState>('idle');
  const ctxRef = useRef<AudioContext | null>(null);

  const stopCtx = useCallback(() => {
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => undefined);
      ctxRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCtx(), [stopCtx]);

  const playTone = useCallback(async () => {
    stopCtx();
    setState('playing');

    try {
      const ctx = getAudioContext();
      ctxRef.current = ctx;

      if (ctx.state === 'suspended') await ctx.resume();

      const now = ctx.currentTime;
      const duration = 1.2; // seconds

      // Sine wave at 440 Hz (A4)
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;

      // Gentle fade-in / fade-out envelope
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.1);
      gain.gain.setValueAtTime(0.5, now + duration - 0.2);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);

      osc.onended = () => {
        stopCtx();
        setState('confirm');
      };
    } catch (err) {
      stopCtx();
      setState('error');
    }
  }, [stopCtx]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold tracking-tight">Динамики / наушники</span>
      </div>

      {state === 'playing' && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {/* Animated bars */}
          <span className="flex items-end gap-[3px]">
            {[0, 0.15, 0.05, 0.2, 0.1].map((delay, i) => (
              <span
                key={i}
                className="inline-block w-1 animate-bounce rounded-sm bg-[hsl(var(--primary))]"
                style={{ height: `${8 + i * 3}px`, animationDelay: `${delay}s` }}
              />
            ))}
          </span>
          <span>Воспроизводим тон 440 Гц…</span>
        </div>
      )}

      {state === 'confirm' && (
        <div className="mb-3 space-y-2">
          <p className="text-xs text-muted-foreground">Вы слышали звуковой сигнал?</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-[hsl(var(--primary))]/40 text-xs text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10"
              onClick={() => setState('success')}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />Да, слышал
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-destructive/40 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => setState('error')}
            >
              <VolumeX className="h-3.5 w-3.5" />Нет
            </Button>
          </div>
        </div>
      )}

      {state === 'success' && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/10 px-3 py-2 text-xs text-[hsl(var(--primary))]">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Динамики работают — звук слышен</span>
        </div>
      )}

      {state === 'error' && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Звук не слышен. Проверьте: не заглушён ли звук в системе, верное ли
            устройство вывода выбрано, не заблокирован ли звук в браузере.
          </span>
        </div>
      )}

      <Button
        size="sm"
        variant={state === 'playing' ? 'secondary' : 'outline'}
        disabled={state === 'playing'}
        onClick={playTone}
        className="w-full text-xs"
      >
        <Volume2 className="h-3.5 w-3.5" />
        {state === 'idle' ? 'Проверить динамики' : state === 'playing' ? 'Воспроизведение…' : 'Повторить тест'}
      </Button>
    </div>
  );
}

// ─── Combined panel ───────────────────────────────────────────────────────────

/**
 * Card containing both mic and speaker tests side-by-side.
 * Exported for use in the dashboard right column.
 */
export function MicTestPanel() {
  return (
    <div className="rounded-xl border border-card-border bg-card/60 p-5 backdrop-blur-sm sm:p-6">
      <h2 className="mb-4 text-sm font-semibold tracking-tight">Проверка аудио</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-x-6 sm:divide-x sm:divide-border">
        <MicTest />
        <div className="sm:pl-6">
          <SpeakerTest />
        </div>
      </div>
    </div>
  );
}
