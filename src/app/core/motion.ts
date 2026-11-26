/** Quem pediu menos movimento no sistema (sem `matchMedia`, como nos testes antigos e no servidor: não pediu). */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * O clique do mouse ou do dedo que chega antes disto depois de os botões trocarem era para o botão de antes:
 * o segundo clique de um clique duplo cairia no que acabou de surgir no mesmo lugar, e viraria a próxima carta
 * sem mostrar a frente, ou responderia a carta sem mostrar a resposta.
 */
export const BOUNCE_MS = 350;
