import { soundVolume } from './volume';

/**
 * O sininho do Pomodoro (PLANO-POMODORO.md, seção 8): dois toques de sino sintetizados no Web Audio, sem
 * arquivo para baixar. Subindo na volta ao estudo, descendo no começo da pausa. Respeita o volume do site.
 *
 * O navegador só deixa o som começar depois de um clique na página: `wakeChime` é chamado nos cliques do
 * Pomodoro (Começar o foco, continuar, pular) e guarda o contexto; sem ele, o sininho não toca e nada quebra.
 */
let ctx: AudioContext | null = null;

export function wakeChime(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Um toque: a fundamental e um harmônico de sino, que somem devagar. */
function strike(c: AudioContext, freq: number, at: number, gain: number): void {
  for (const [mult, share] of [
    [1, 1],
    [2.76, 0.32],
    [5.4, 0.12],
  ]) {
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain * share, at + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 1.6 / mult);
    osc.connect(amp).connect(c.destination);
    osc.start(at);
    osc.stop(at + 1.8);
  }
}

/** Toca o sininho da troca: `estudo` sobe (volta ao trabalho), `pausa` desce (pode respirar). */
export function chime(to: 'estudo' | 'pausa'): void {
  const v = soundVolume();
  if (!ctx || ctx.state !== 'running' || v <= 0) return;
  const gain = 0.22 * v;
  const t = ctx.currentTime + 0.02;
  const [a, b] = to === 'estudo' ? [659.25, 987.77] : [987.77, 659.25];
  strike(ctx, a, t, gain);
  strike(ctx, b, t + 0.28, gain);
}
