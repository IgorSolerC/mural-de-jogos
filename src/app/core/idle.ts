/** O que o navegador conta quando fica à toa: quanto tempo sobra, e se o prazo venceu antes disso. */
export interface IdleDeadlineLike {
  timeRemaining(): number;
  didTimeout?: boolean;
}

type RequestIdle = (cb: (d: IdleDeadlineLike) => void, opts?: { timeout: number }) => number;

/**
 * Roda com o navegador à toa (`requestIdleCallback`, com `timeout` como prazo máximo). Onde não há
 * como saber (Safari antigo), roda depois de `fallback.after` ms com o prazo de `fallback.deadline`.
 * Devolve o número para `cancelIdle`.
 */
export function whenIdle(
  run: (deadline: IdleDeadlineLike) => void,
  timeout: number | undefined,
  fallback: { after: number; deadline: IdleDeadlineLike },
): number {
  const ric = (globalThis as { requestIdleCallback?: RequestIdle }).requestIdleCallback;
  if (ric) return timeout === undefined ? ric(run) : ric(run, { timeout });
  return setTimeout(() => run(fallback.deadline), fallback.after) as unknown as number;
}

/** Desmarca o que `whenIdle` marcou, pelo mesmo caminho. */
export function cancelIdle(id: number): void {
  const cic = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
  if (cic) cic(id);
  else clearTimeout(id);
}
