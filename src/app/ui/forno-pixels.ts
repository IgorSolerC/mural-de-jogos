/**
 * As contas de pixel do forno, as mesmas na página e no ajudante (ui/forno.worker.ts).
 */

/**
 * Tira a silhueta da imagem filtrada, ficando só a sombra que ia por baixo dela. `silhueta` é a silhueta
 * em preto (só o alfa conta) e `filtrada` é ela passada pelo filtro da ficha (a sombra e a silhueta
 * juntas), mexida no lugar. Posta por baixo da ficha sem o filtro, a sombra que sobra dá o mesmo que o
 * filtro: onde a silhueta cobre de todo não sobra nada; onde cobre em parte, a sombra que aparecia em
 * volta dela é desmisturada (R = S·Sa·(1 − a) + a·0, com as cores sem o alfa multiplicado).
 */
export function desmisturar(silhueta: Uint8ClampedArray, filtrada: Uint8ClampedArray): void {
  const d = filtrada;
  for (let k = 0; k < d.length; k += 4) {
    const a = silhueta[k + 3] / 255;
    const ra = d[k + 3] / 255;
    if (a >= 0.998) {
      d[k + 3] = 0;
      continue;
    }
    const sa = Math.max(0, (ra - a) / (1 - a));
    if (sa <= 0) {
      d[k + 3] = 0;
      continue;
    }
    // as cores de R vêm sem o alfa multiplicado: R·Ra = S·Sa·(1 − a), então S = R·Ra / (Sa·(1 − a))
    const f = ra / (sa * (1 - a));
    d[k] = Math.min(255, Math.round(d[k] * f));
    d[k + 1] = Math.min(255, Math.round(d[k + 1] * f));
    d[k + 2] = Math.min(255, Math.round(d[k + 2] * f));
    d[k + 3] = Math.round(sa * 255);
  }
}
