import { signal } from '@angular/core';
import { writeJson } from './storage';

/**
 * O volume de tudo o que toca no site: os widgets de áudio e de vídeo e o vinil das fichas de
 * música, de 0 a 1. Vale neste aparelho (localStorage, como as escolhas de Desempenho), e as abas
 * abertas andam juntas. Mudar aqui muda na hora o que está tocando.
 *
 * Calar guarda o volume de antes, e o alto-falante volta para ele.
 */
const KEY = 'meu-mural:volume';
const FULL = 1;
/** Abaixo disso, o volume não serve para voltar depois de calar. */
const SETTLE_MIN = 0.15;

interface Stored {
  v: number;
  /** Para onde o alto-falante volta depois de calar: o último volume solto (sem ele, o cheio). */
  antes?: number;
}

const clamp = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

function read(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Stored> | null;
    if (!raw || typeof raw !== 'object') return { v: FULL };
    return { v: clamp(raw.v, FULL), antes: raw.antes === undefined ? undefined : clamp(raw.antes, FULL) };
  } catch {
    return { v: FULL };
  }
}

const state = signal<Stored>(read());

/** O volume, de 0 (calado) a 1. */
export const soundVolume = () => state().v;

function write(next: Stored): void {
  state.set(next);
  writeJson(KEY, next);
}

/** Durante o arrasto: o volume muda na hora, e o de voltar (de antes de calar) fica onde estava. */
export function setSoundVolume(v: number): void {
  const next = clamp(v, FULL);
  const cur = state();
  if (next === cur.v) return;
  write({ v: next, antes: cur.antes });
}

/**
 * A pessoa soltou a barra: é para lá que o alto-falante volta depois de calar. Os miúdos (do
 * teclado descendo até o zero, um a um) não contam: voltar a 3% seria quase calado.
 */
export function settleSoundVolume(): void {
  const cur = state();
  if (cur.v >= SETTLE_MIN && cur.v !== cur.antes) write({ v: cur.v, antes: cur.v });
}

/** O alto-falante: cala, ou volta ao volume de antes de calar (sem nenhum, o cheio). */
export function toggleMute(): void {
  const cur = state();
  if (cur.v > 0) write({ v: 0, antes: cur.v >= SETTLE_MIN ? cur.v : cur.antes });
  else write({ v: cur.antes && cur.antes > 0 ? cur.antes : FULL, antes: cur.antes });
}

// outra aba mexeu: esta acompanha (o que já está tocando aqui também)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) state.set(read());
  });
}
