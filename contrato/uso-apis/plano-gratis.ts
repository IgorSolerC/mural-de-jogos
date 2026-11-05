/**
 * O plano grátis da Cloudflare, por dia UTC (menos o tamanho de cada banco), e a partir de quando avisar. Um
 * lugar só: a checagem diária (api/scripts/saude.ts) e a tela Uso das APIs olham os mesmos números.
 * Conferido em 05/nov/2026 (PLANO-ADMIN-APIS.md, seção 21).
 */
export const PLANO_GRATIS = {
  pedidosWorkers: 100_000,
  linhasLidas: 5_000_000,
  linhasGravadas: 100_000,
  bytesPorBanco: 500 * 1024 * 1024,
} as const;

/** A partir daqui, "perto do fim". */
export const ALERTA = 0.7;
