import { Config, Mode } from './ports';

const MODES: readonly Mode[] = ['ligado', 'so-leitura', 'desligado'];

/** O código da conta sem o traço e em maiúsculas (`K7QF-M2XA` vira `K7QFM2XA`), como no Murall. */
export function plainCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/**
 * Lê a configuração das variáveis de ambiente (as `[vars]` do wrangler.toml, ou o `process.env`).
 * Na dúvida, desliga, como na API do Murall: um MODO com erro de digitação, uma cota que não é número
 * ou um endereço do cofre que não bate com o rpId não podem deixar o cofre de pé.
 */
export function readConfig(env: Record<string, unknown>): Config {
  const text = (key: string) => (typeof env[key] === 'string' ? (env[key] as string).trim() : '');
  const mode = text('MODO') as Mode;
  const budget = Number(text('COTA_LINHAS_DIA'));
  const codes = text('COFRE_CODIGOS')
    .split(',')
    .map((c) => (c.trim() === '*' ? '*' : plainCode(c)))
    .filter(Boolean);
  const origin = text('COFRE_ORIGEM').replace(/\/+$/, '');
  const rpId = text('COFRE_RP_ID');
  return {
    mode: MODES.includes(mode) && sameSite(origin, rpId) ? mode : 'desligado',
    dailyRowBudget: Number.isSafeInteger(budget) && budget > 0 ? budget : 0,
    allowedCodes: codes.includes('*') ? '*' : codes,
    origin,
    rpId,
    googleClientId: text('GOOGLE_CLIENT_ID'),
  };
}

/**
 * O endereço do cofre tem de ser https (ou http://localhost, no desenvolvimento, 16.15), só a origem
 * (sem caminho), e o rpId tem de ser exatamente o host dele: uma passkey do domínio de cima responderia
 * a qualquer página dele, inclusive às do Murall.
 */
function sameSite(origin: string, rpId: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost');
  return secure && url.origin === origin && url.hostname === rpId;
}

/** A conta (pelo código do Murall) pode usar o cofre? */
export function canUseVault(config: Config, code: string): boolean {
  return config.allowedCodes === '*' || config.allowedCodes.includes(plainCode(code));
}
