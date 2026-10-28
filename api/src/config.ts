import { plainCode } from './domain/agenda';
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
  // um número inteiro e positivo; qualquer outra coisa é zero (as imagens param, nunca ficam sem limite)
  const count = (key: string) => {
    const n = Number(text(key));
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  };
  const mb = (key: string) => count(key) * 1024 * 1024;
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
    // o código como aparece (K7QF-M2XA) ou como fica no banco: vale sem o traço; vazio, ninguém
    apiCodes: text('API_CODIGOS')
      .split(',')
      .map((c) => (c.trim() === '*' ? '*' : plainCode(c)))
      .filter(Boolean),
    site: siteUrl(text('SITE')),
    imagesTotalBytes: mb('IMAGENS_MB_TOTAL'),
    imagesUserBytes: mb('IMAGENS_MB_PESSOA'),
    imagesPerDay: count('IMAGENS_POR_DIA'),
  };
}

/** O endereço do site (sem a barra do fim): https, ou http só no próprio computador; outro valor, vazio. */
function siteUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return url.protocol === 'https:' || (url.protocol === 'http:' && local) ? url.origin + url.pathname.replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}
