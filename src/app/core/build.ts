/**
 * O número da build do site: sobe 1 a cada commit que muda o site, e nunca volta. Vai dentro de todo
 * backup (e do mural da nuvem), para um site mais novo saber de que build veio o que está lendo e
 * aplicar as conversões que faltam (ver `migrations.ts`).
 *
 * Não é a versão das Novidades (1.38.12…): aquela é para as pessoas lerem e ainda pode ser
 * renumerada; esta é só uma contagem. A 301 é o 301º commit da main.
 */
export const BUILD = 577;
