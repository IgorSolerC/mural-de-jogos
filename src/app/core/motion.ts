/** Quem pediu menos movimento no sistema (sem `matchMedia`, como nos testes antigos e no servidor: não pediu). */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
