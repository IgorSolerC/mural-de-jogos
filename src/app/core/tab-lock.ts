/**
 * Uma aba por vez, entre as abas do Murall neste navegador (a trava do navegador, que solta sozinha se a
 * aba fechar). Sem o `navigator.locks` (navegadores antigos), roda direto.
 */
export async function oneTabAtATime<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks?.request ? ((await locks.request(name, fn)) as T) : fn();
}
