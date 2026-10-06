import { Config, Mode } from './ports';

const MODES: readonly Mode[] = ['ligado', 'so-leitura', 'desligado'];

/**
 * Lê a configuração das variáveis de ambiente (as `[vars]` do wrangler.toml, ou o `process.env`).
 * Na dúvida, desliga: um MODO com erro de digitação ou uma cota que não é número não podem deixar a
 * nuvem gravando sem freio.
 */
export function readConfig(env: Record<string, unknown>): Config {
  const text = (key: string) => (typeof env[key] === 'string' ? (env[key] as string).trim() : '');
  const mode = text('MODO') as Mode;
  const budget = Number(text('COTA_LINHAS_DIA'));
  return {
    mode: MODES.includes(mode) ? mode : 'desligado',
    allowedOrigins: text('ORIGENS')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    dailyRowBudget: Number.isSafeInteger(budget) && budget > 0 ? budget : 0,
    googleClientId: text('GOOGLE_CLIENT_ID'),
    // na dúvida, só logados (o mais fechado)
    publicMurals: text('VER_MURAIS') === 'todos' ? 'todos' : 'logados',
  };
}
