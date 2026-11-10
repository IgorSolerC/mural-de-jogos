import { Context, Hono } from 'hono';
import { isAdmin } from '../domain/admin';
import { cloudflareReader } from '../domain/cloudflare-usage';
import { ALL, room, usageOf } from '../domain/image';
import { DAY_MS, usageToday, utcDay } from '../domain/quota';
import { Session } from '../domain/session';
import { HttpError } from '../errors';
import { Deps, SqlValue } from '../ports';
import { catalogProbe } from './catalog';
import { keepAliveOf, sessionOf } from './http';

/** Um teto folgado: 40 combinações por dia em 31 dias dá 1.240 linhas. Se passar, saem os dias mais velhos. */
const MAX_LINES = 3_000;
const MAX_FAILURES = 50;
/** O "Testar agora" de cada catálogo, no máximo uma vez neste intervalo. */
export const PROBE_EVERY_MS = 20_000;

/**
 * Quem chama, se for admin: sem sessão, 401; com a sessão de outra conta, 403. Só a sessão do site passa
 * (`sessionOf`): uma chave de API ou um conector nunca entram aqui.
 */
async function requireAdmin(deps: Deps, c: Context): Promise<Session> {
  const session = await sessionOf(deps, c);
  if (!isAdmin(deps, session.userId)) throw new HttpError(403, 'so-admin', 'Só a conta de admin vê isto.');
  return session;
}

/** Desde quando devolver: o mais antigo entre 30 dias atrás e o dia 1º do mês (a cota mensal da RAWG). */
export function usageFrom(now: Date): string {
  const back = utcDay(new Date(now.getTime() - 30 * DAY_MS));
  const firstOfMonth = `${utcDay(now).slice(0, 7)}-01`;
  return back < firstOfMonth ? back : firstOfMonth;
}

/**
 * O que só o admin lê (PLANO-ADMIN-APIS.md, seção 10). Sem `Cache-Control` próprio, sai `no-store`
 * (ver `app.ts`), e o service worker não guarda.
 */
export function adminRoutes(app: Hono, deps: Deps): void {
  const readCloudflare = cloudflareReader(deps);
  const probe = catalogProbe(deps);
  const lastProbe = new Map<string, number>();

  /**
   * O uso de cada API. As linhas vão como listas, e as contas ficam no site: medido, 1.243 linhas como
   * objetos gastavam de 3 a 7 ms dos 10 ms de CPU do plano grátis.
   */
  app.get('/v1/admin/uso', async (c) => {
    await requireAdmin(deps, c);
    const now = deps.now();
    const [lines, failures, since, today, images, connected, boards] = await Promise.all([
      deps.db.all<Record<string, SqlValue>>('SELECT dia, servico, operacao, medido_em, desfecho, pedidos, ms_total, ms_max, ultimo_em FROM uso_apis WHERE dia >= ? ORDER BY dia DESC LIMIT ?', [usageFrom(now), MAX_LINES]),
      deps.db.all<{ em: string; servico: string; operacao: string; medido_em: string; desfecho: string; status: number | null; repeticoes: number }>(
        'SELECT em, servico, operacao, medido_em, desfecho, status, repeticoes FROM uso_apis_falhas ORDER BY em DESC, id DESC LIMIT ?',
        [MAX_FAILURES],
      ),
      deps.db.first<{ dia: string | null }>('SELECT MIN(dia) AS dia FROM uso_apis'),
      usageToday(deps),
      usageOf(deps.db, ALL),
      deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM agenda_google'),
      // os quadros do Quadro livre guardados (PLANO-QUADRO-LIVRE.md, 7.7): quantos e quanto, sem as lápides
      deps.db.first<{ n: number; bytes: number }>('SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM quadros WHERE apagado_em IS NULL'),
    ]);
    return c.json({
      geradoEm: now.toISOString(),
      contandoDesde: since?.dia ?? null,
      // [dia, serviço, operação, medido em, desfecho, pedidos, ms total, ms máximo, último em]
      linhas: lines.map((l) => [l['dia'], l['servico'], l['operacao'], l['medido_em'], l['desfecho'], l['pedidos'], l['ms_total'], l['ms_max'], l['ultimo_em']]),
      falhas: failures.map((f) => ({ em: f.em, servico: f.servico, operacao: f.operacao, medidoEm: f.medido_em, desfecho: f.desfecho, status: f.status, repeticoes: f.repeticoes })),
      proprias: {
        dia: today.day,
        linhasGravadas: today.rowsWritten,
        cotaLinhas: deps.config.dailyRowBudget,
        imagens: room(images, deps.config.imagesTotalBytes),
        quadros: { quadros: boards?.n ?? 0, bytes: boards?.bytes ?? 0, cota: deps.config.boardsTotalBytes },
      },
      agenda: { contasLigadas: connected?.n ?? 0 },
    });
  });

  /**
   * O uso oficial na Cloudflare, numa rota à parte: se ela não responde, o resto da tela está de pé. "Falta o
   * token" e "não respondeu" são estados da tela, não erros: respondem 200. `?novo=1` é o Atualizar.
   */
  app.get('/v1/admin/cloudflare', async (c) => {
    await requireAdmin(deps, c);
    return c.json(await readCloudflare(c.req.query('novo') === '1'));
  });

  /**
   * O "Testar agora": uma chamada de verdade ao catálogo, pela chave do site, para saber se ele voltou sem esperar
   * alguém buscar. Gasta 1 da cota e entra na conta como qualquer busca, gravada na hora para a tabela já mostrar.
   * Uma vez a cada 20 s por catálogo: o dedo nervoso não gasta a cota.
   */
  app.post('/v1/admin/testar/:servico', async (c) => {
    await requireAdmin(deps, c);
    const which = c.req.param('servico');
    if (which !== 'rawg' && which !== 'tmdb') throw new HttpError(404, 'nao-encontrado', 'Esse serviço não tem teste.');
    const now = deps.now().getTime();
    if (now - (lastProbe.get(which) ?? -Infinity) < PROBE_EVERY_MS) {
      c.header('Retry-After', String(Math.ceil(PROBE_EVERY_MS / 1000)));
      throw new HttpError(429, 'teste-devagar', 'Espere uns segundos para testar de novo.');
    }
    lastProbe.set(which, now);
    const result = await probe(which, keepAliveOf(c));
    if (!result) throw new HttpError(503, 'sem-chave', 'O site está sem a chave deste catálogo.');
    await deps.meter?.flush(deps);
    return c.json({ servico: which, ...result, em: deps.now().toISOString() });
  });
}
