import { Context, Hono } from 'hono';
import { isAdmin } from '../domain/admin';
import { cloudflareReader } from '../domain/cloudflare-usage';
import { ALL, room, usageOf } from '../domain/image';
import { DAY_MS, usageToday, utcDay } from '../domain/quota';
import { Session } from '../domain/session';
import { HttpError } from '../errors';
import { Deps, SqlValue } from '../ports';
import { sessionOf } from './http';

/** Um teto folgado: 40 combinações por dia em 31 dias dá 1.240 linhas. Se passar, saem os dias mais velhos. */
const MAX_LINES = 3_000;
const MAX_FAILURES = 50;

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

  /**
   * O uso de cada API. As linhas vão como listas, e as contas ficam no site: medido, 1.243 linhas como
   * objetos gastavam de 3 a 7 ms dos 10 ms de CPU do plano grátis.
   */
  app.get('/v1/admin/uso', async (c) => {
    await requireAdmin(deps, c);
    const now = deps.now();
    const [lines, failures, since, today, images, connected] = await Promise.all([
      deps.db.all<Record<string, SqlValue>>('SELECT dia, servico, operacao, medido_em, desfecho, pedidos, ms_total, ms_max, ultimo_em FROM uso_apis WHERE dia >= ? ORDER BY dia DESC LIMIT ?', [usageFrom(now), MAX_LINES]),
      deps.db.all<{ em: string; servico: string; operacao: string; medido_em: string; desfecho: string; status: number | null; repeticoes: number }>(
        'SELECT em, servico, operacao, medido_em, desfecho, status, repeticoes FROM uso_apis_falhas ORDER BY em DESC, id DESC LIMIT ?',
        [MAX_FAILURES],
      ),
      deps.db.first<{ dia: string | null }>('SELECT MIN(dia) AS dia FROM uso_apis'),
      usageToday(deps),
      usageOf(deps.db, ALL),
      deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM agenda_google'),
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
}
