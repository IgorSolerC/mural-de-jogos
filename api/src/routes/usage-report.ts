import { Hono } from 'hono';
import { DESFECHOS, Desfecho, OPERACOES, SERVICOS_DO_NAVEGADOR, ServicoContado } from '../../../contrato/uso-apis/contagem';
import { Deps } from '../ports';
import { catalogBrake } from './catalog';
import { readJson, sessionOf } from './http';

/** Quantas linhas valem por envio; o resto é ignorado. */
export const MAX_REPORT_LINES = 40;
const MAX_REQUESTS_PER_LINE = 1_000;
/** Uma chamada que levasse mais que isto já teria desistido há muito tempo. */
const MAX_MS = 60_000;
/** Quantos envios uma conta faz por hora. O site manda de 5 em 5 min, e ao esconder a aba, no mínimo 2 min depois. */
export const MAX_REPORTS_PER_HOUR = 30;
const HOUR_MS = 3_600_000;

const COUNTED_IN_BROWSER: readonly string[] = SERVICOS_DO_NAVEGADOR;

/** A linha, se ela é o que deveria ser; o que vier fora das listas fechadas some, sem erro. */
function cleanLine(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  const servico = l['servico'];
  const operacao = l['operacao'];
  const desfecho = l['desfecho'];
  const pedidos = l['pedidos'];
  if (typeof servico !== 'string' || !COUNTED_IN_BROWSER.includes(servico)) return null;
  if (!(OPERACOES[servico as ServicoContado] as readonly string[]).includes(String(operacao))) return null;
  if (!DESFECHOS.includes(desfecho as Desfecho)) return null;
  if (typeof pedidos !== 'number' || !Number.isInteger(pedidos) || pedidos < 1 || pedidos > MAX_REQUESTS_PER_LINE) return null;
  const number = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, max) : 0);
  const status = l['status'];
  return {
    servico,
    operacao: String(operacao),
    desfecho: desfecho as Desfecho,
    pedidos,
    ms: number(l['msTotal'], pedidos * MAX_MS),
    msMax: number(l['msMax'], MAX_MS),
    status: typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    medidoEm: 'navegador' as const,
  };
}

/**
 * Os totais das chamadas que saem direto do navegador, que o Worker não vê (PLANO-ADMIN-APIS.md, seção 7).
 * Exige a sessão, mas não guarda de quem veio: a tabela não tem coluna de conta. O freio fica na memória: gravar
 * um freio no banco a cada envio gastaria justamente o que se quer poupar. A gravação é a do medidor (a janela, a
 * cota do dia, a parada em metade dela), e a resposta é sempre 204: o navegador não tem o que fazer com o resto.
 */
export function usageReportRoutes(app: Hono, deps: Deps): void {
  const brake = catalogBrake(MAX_REPORTS_PER_HOUR, HOUR_MS);

  app.post('/v1/uso/navegador', async (c) => {
    const session = await sessionOf(deps, c);
    const body = await readJson(c);
    const meter = deps.meter;
    const now = deps.now();
    if (meter && brake.take(session.userId, now.getTime())) {
      const lines = Array.isArray(body['linhas']) ? body['linhas'].slice(0, MAX_REPORT_LINES) : [];
      for (const raw of lines) {
        const line = cleanLine(raw);
        if (line) meter.note(line, now);
      }
    }
    return c.body(null, 204);
  });
}
