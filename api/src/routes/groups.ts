import { Context, Hono } from 'hono';
import { brakeStatement, usedToday } from '../domain/brake';
import { formatCode, normalizeCode } from '../domain/code';
import { photoOut } from '../domain/photo';
import { write } from '../domain/quota';
import { Access, Role, canManage, canWrite, isRole } from '../domain/shared-note';
import {
  MAX_GROUPS_PER_USER,
  MAX_GROUP_BODY_CHARS,
  MAX_GROUP_MEMBERS,
  asRole,
  groupData,
  groupId,
  groupNameOf,
  groupStructureOf,
} from '../domain/shared-group';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { readJson, sessionOf } from './http';
import { MAX_SHARES_PER_DAY } from './notes';

/**
 * Os grupos compartilhados (ver `domain/shared-group.ts`, a migração 0025 e PLANO-COMPARTILHAR.md).
 *
 * - `GET /v1/eu/grupos`: os grupos em que a pessoa está (dela e com ela), só o id, a `versao` e o papel.
 * - `GET /v1/eu/grupos/detalhes?ids=…`: os pedidos, inteiros.
 * - `POST /v1/grupos`: o dono compartilha um grupo (o documento e, se quiser, já as pessoas e o público). As
 *   anotações vão depois, uma a uma, com `POST /v1/notas` e o `grupo`.
 * - `PUT /v1/grupos/:id`: grava o documento, dizendo em qual `rev` se baseou (outra gravação no meio é um
 *   409 com o de agora, e o site junta), e o público.
 * - `PUT`/`DELETE /v1/grupos/:id/membros/:codigo`: o dono e os gestores põem, trocam e tiram; qualquer um
 *   sai sozinho (`eu`).
 * - `DELETE /v1/grupos/:id`: o dono para de compartilhar (o grupo e tudo o que está nele fica só com ele).
 * - Público: `GET /v1/murais/:codigo/grupos` e `/grupos/:id` (o documento e as anotações), só com `publico`.
 *
 * Quem entra recebe o aviso "compartilhou o grupo com você" (atividade 'compartilhou-grupo').
 */

/** Quantos grupos o pedido de detalhes devolve de uma vez. */
export const MAX_GROUP_DETAILS = 10;
/** O intervalo mínimo entre duas gravações da mesma pessoa no mesmo grupo. */
export const MIN_GROUP_EDIT_MS = 1_000;
/** Quantas anotações de um grupo público vão numa página. */
export const PUBLIC_NOTES_PAGE = 200;

interface GroupRow {
  id: string;
  dono_id: string;
  rev: number;
  versao: number;
  dados: string;
  publico: number;
  criado_em: string;
  atualizado_em: string;
  atualizado_por: string;
}

interface Person {
  id: string;
  codigo: string;
  nome: string;
  foto: string | null;
}

export function groupRoutes(app: Hono, deps: Deps): void {
  const session = (c: Context) => sessionOf(deps, c);
  const notFound = () => new HttpError(404, 'grupo-nao-encontrado', 'Esse grupo não está mais compartilhado com você.');

  const group = (id: string) => deps.db.first<GroupRow>('SELECT * FROM grupos WHERE id = ?', [id]);

  async function accessOf(g: GroupRow, userId: string): Promise<Access | null> {
    if (g.dono_id === userId) return 'dono';
    const m = await deps.db.first<{ papel: string }>('SELECT papel FROM grupo_membros WHERE grupo_id = ? AND usuario_id = ?', [g.id, userId]);
    return asRole(m?.papel);
  }

  /** O grupo e o papel de quem pede, ou 404 (para quem não está nele, ele não existe). */
  async function mine(id: string, userId: string): Promise<{ g: GroupRow; access: Access }> {
    const g = await group(id);
    const access = g ? await accessOf(g, userId) : null;
    if (!g || !access) throw notFound();
    return { g, access };
  }

  async function byCode(input: unknown): Promise<Person> {
    const code = typeof input === 'string' ? normalizeCode(input) : null;
    if (!code) throw new HttpError(400, 'codigo-invalido', 'Esse código não existe. Confira: ele tem 8 letras e números.');
    const p = await deps.db.first<Person>('SELECT id, codigo, nome, foto FROM usuarios WHERE codigo = ?', [code]);
    if (!p) throw new HttpError(404, 'pessoa-nao-encontrada', `Não achei ninguém com o código ${formatCode(code)}.`);
    return p;
  }

  const personOut = (p: Pick<Person, 'codigo' | 'nome' | 'foto'>) => {
    const foto = photoOut(p.foto);
    return { codigo: formatCode(p.codigo), nome: p.nome, ...(foto ? { foto } : {}) };
  };

  /** Quantos grupos compartilhados a pessoa já tem (dela e com ela). */
  async function countFor(userId: string): Promise<number> {
    const row = await deps.db.first<{ n: number }>(
      'SELECT (SELECT COUNT(*) FROM grupos WHERE dono_id = ?) + (SELECT COUNT(*) FROM grupo_membros WHERE usuario_id = ?) AS n',
      [userId, userId],
    );
    return row?.n ?? 0;
  }

  async function roomFor(p: Person): Promise<void> {
    if ((await countFor(p.id)) >= MAX_GROUPS_PER_USER) {
      throw new HttpError(429, 'grupos-demais', `${p.nome} já está em ${MAX_GROUPS_PER_USER} grupos compartilhados, o máximo.`);
    }
  }

  /** O freio de pôr gente nova (o mesmo das anotações: cada pessoa recebe um aviso). */
  async function shareBrake(userId: string, now: Date, adding: number): Promise<void> {
    if (adding && (await usedToday(deps, userId, 'compartilhar', now)) + adding > MAX_SHARES_PER_DAY) {
      throw new HttpError(429, 'compartilhar-devagar', 'Você compartilhou com muita gente hoje. Tente de novo amanhã.');
    }
  }

  /** O grupo inteiro, como o site recebe: o documento, as pessoas, o público e quantas anotações tem. */
  async function detail(g: GroupRow, access: Access) {
    const members = await deps.db.all<Person & { papel: string; criado_em: string }>(
      'SELECT u.id, u.codigo, u.nome, u.foto, m.papel, m.criado_em FROM grupo_membros m JOIN usuarios u ON u.id = m.usuario_id ' +
        'WHERE m.grupo_id = ? ORDER BY m.criado_em, u.codigo',
      [g.id],
    );
    const ids = [...new Set([g.dono_id, g.atualizado_por])];
    const people = await deps.db.all<Person>(`SELECT id, codigo, nome, foto FROM usuarios WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
    const byId = new Map(people.map((p) => [p.id, p]));
    const who = (id: string) => {
      const p = byId.get(id);
      return p ? personOut(p) : null;
    };
    const notes = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM notas WHERE grupo_id = ?', [g.id]);
    let dados: unknown = null;
    try {
      dados = JSON.parse(g.dados);
    } catch {
      dados = null;
    }
    return {
      id: g.id,
      dono: who(g.dono_id),
      papel: access,
      rev: g.rev,
      versao: g.versao,
      dados,
      publico: g.publico === 1,
      notas: notes?.n ?? 0,
      membros: members.filter((m) => isRole(m.papel)).map((m) => ({ ...personOut(m), papel: m.papel, desde: m.criado_em })),
      criadoEm: g.criado_em,
      atualizadoEm: g.atualizado_em,
      atualizadoPor: who(g.atualizado_por),
    };
  }

  /** As gravações que põem `p` no grupo (ou trocam o papel), com o aviso se a pessoa é nova ali. */
  function memberStatements(g: Pick<GroupRow, 'id' | 'dados'>, p: Person, role: Role, by: string, isNew: boolean, at: string, now: Date): Statement[] {
    if (!isNew) return [{ sql: 'UPDATE grupo_membros SET papel = ? WHERE grupo_id = ? AND usuario_id = ?', params: [role, g.id, p.id] }];
    return [
      {
        sql: 'INSERT INTO grupo_membros (grupo_id, usuario_id, papel, convidado_por, criado_em) VALUES (?, ?, ?, ?, ?)',
        params: [g.id, p.id, role, by, at],
      },
      { sql: "DELETE FROM atividades WHERE tipo = 'compartilhou-grupo' AND alvo_id = ? AND ref = ?", params: [p.id, g.id] },
      {
        sql: "INSERT INTO atividades (tipo, autor_id, alvo_id, ref, resumo, criado_em) VALUES ('compartilhou-grupo', ?, ?, ?, ?, ?)",
        params: [by, p.id, g.id, JSON.stringify({ titulo: groupNameOf(g.dados), mural: 'anotacoes' }), at],
      },
      brakeStatement(by, 'compartilhar', now),
    ];
  }

  /** O grupo mudou para todos que estão nele: a versão sobe (cada um baixa de novo). */
  const bump = (id: string): Statement => ({ sql: 'UPDATE grupos SET versao = versao + 1 WHERE id = ?', params: [id] });

  // Os grupos em que a pessoa está: só o que muda (a versão) e o papel.
  app.get('/v1/eu/grupos', async (c) => {
    const s = await session(c);
    const rows = await deps.db.all<{ id: string; versao: number; papel: string }>(
      "SELECT id, versao, 'dono' AS papel FROM grupos WHERE dono_id = ? " +
        'UNION ALL SELECT g.id, g.versao, m.papel FROM grupo_membros m JOIN grupos g ON g.id = m.grupo_id WHERE m.usuario_id = ? LIMIT ?',
      [s.userId, s.userId, MAX_GROUPS_PER_USER * 2],
    );
    return c.json({ grupos: rows.map((r) => ({ id: r.id, versao: r.versao, papel: r.papel })) });
  });

  // Os grupos pedidos, inteiros (só os em que a pessoa está).
  app.get('/v1/eu/grupos/detalhes', async (c) => {
    const s = await session(c);
    const ids = [...new Set((c.req.query('ids') ?? '').split(',').filter(Boolean))].slice(0, MAX_GROUP_DETAILS);
    const out = [];
    for (const raw of ids) {
      let id: string;
      try {
        id = groupId(raw);
      } catch {
        continue;
      }
      const g = await group(id);
      const access = g ? await accessOf(g, s.userId) : null;
      if (g && access) out.push(await detail(g, access));
    }
    return c.json({ grupos: out });
  });

  // Compartilhar um grupo: o documento passa a morar aqui, com o dono e as pessoas que vierem junto.
  app.post('/v1/grupos', async (c) => {
    const s = await session(c);
    const body = await readJson(c, MAX_GROUP_BODY_CHARS);
    const id = groupId(body['id']);
    const dados = groupData(body['dados']);
    const publico = body['publico'] === true ? 1 : 0;
    const existing = await group(id);
    if (existing) {
      // o pedido de antes chegou e a resposta se perdeu: devolve como está
      if (existing.dono_id === s.userId) return c.json({ grupo: await detail(existing, 'dono') }, 200);
      throw new HttpError(409, 'grupo-id-em-uso', 'Esse grupo não pode ser compartilhado assim. Tente de novo.');
    }
    if ((await countFor(s.userId)) >= MAX_GROUPS_PER_USER) {
      throw new HttpError(429, 'grupos-demais', `Você já tem ${MAX_GROUPS_PER_USER} grupos compartilhados, o máximo.`);
    }
    const wanted = Array.isArray(body['membros']) ? body['membros'].slice(0, MAX_GROUP_MEMBERS + 1) : [];
    const people = new Map<string, { p: Person; role: Role }>();
    for (const item of wanted) {
      const m = item as Record<string, unknown> | null;
      const role = m?.['papel'];
      if (!isRole(role)) throw new HttpError(400, 'papel-invalido', 'Escolha entre gestor, editor e leitor.');
      const p = await byCode(m?.['codigo']);
      if (p.id !== s.userId) people.set(p.id, { p, role });
    }
    if (people.size > MAX_GROUP_MEMBERS) throw new HttpError(400, 'gente-demais', `Um grupo tem até ${MAX_GROUP_MEMBERS} pessoas além de você.`);
    for (const { p } of people.values()) await roomFor(p);
    const now = deps.now();
    await shareBrake(s.userId, now, people.size);
    const at = now.toISOString();
    const row: GroupRow = { id, dono_id: s.userId, rev: 1, versao: 1, dados, publico, criado_em: at, atualizado_em: at, atualizado_por: s.userId };
    try {
      await write(
        deps,
        [
          {
            sql: 'INSERT INTO grupos (id, dono_id, rev, versao, dados, publico, criado_em, atualizado_em, atualizado_por) VALUES (?, ?, 1, 1, ?, ?, ?, ?, ?)',
            params: [id, s.userId, dados, publico, at, at, s.userId],
          },
          ...[...people.values()].flatMap(({ p, role }) => memberStatements(row, p, role, s.userId, true, at, now)),
        ],
        1 + 4 * people.size,
      );
    } catch (error) {
      const now2 = await group(id);
      if (error instanceof HttpError || !now2 || now2.dono_id !== s.userId) throw error;
      return c.json({ grupo: await detail(now2, 'dono') }, 200);
    }
    return c.json({ grupo: await detail(row, 'dono') }, 201);
  });

  // Gravar o documento (e o público), a partir da `rev` que o site tinha.
  app.put('/v1/grupos/:id', async (c) => {
    const s = await session(c);
    const id = groupId(c.req.param('id'));
    const { g, access } = await mine(id, s.userId);
    if (!canWrite(access)) throw new HttpError(403, 'so-leitura', 'Você pode ler este grupo, mas não mudar nada nele.');
    const body = await readJson(c, MAX_GROUP_BODY_CHARS);
    const base = body['base'];
    if (typeof base !== 'number' || !Number.isSafeInteger(base) || base < 1) {
      throw new HttpError(400, 'sem-rev', 'Faltou dizer em qual versão do grupo a edição se baseia.');
    }
    if (base !== g.rev) return c.json({ erro: 'conflito', mensagem: 'Outra pessoa gravou antes. Juntando as duas edições.', grupo: await detail(g, access) }, 409);
    const dados = body['dados'] === undefined ? g.dados : groupData(body['dados']);
    const publico = typeof body['publico'] === 'boolean' ? (body['publico'] ? 1 : 0) : g.publico;
    // o editor mexe no Kanban, nas pastas e nas tags; o nome, a aparência e o público, só o dono e os gestores
    if (!canManage(access) && (groupStructureOf(dados) !== groupStructureOf(g.dados) || publico !== g.publico)) {
      throw new HttpError(403, 'so-gestor', 'Só o dono e os gestores mudam o nome, a cor e quem vê este grupo.');
    }
    const now = deps.now();
    if (g.atualizado_por === s.userId && now.getTime() - Date.parse(g.atualizado_em) < MIN_GROUP_EDIT_MS) {
      throw new HttpError(429, 'devagar', 'Muitas gravações seguidas. A próxima vai daqui a pouco.');
    }
    const at = now.toISOString();
    const [result] = await write(
      deps,
      [
        {
          sql: 'UPDATE grupos SET rev = rev + 1, versao = versao + 1, dados = ?, publico = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ? AND rev = ?',
          params: [dados, publico, at, s.userId, id, base],
        },
      ],
      1,
    );
    if (!result || result.changes === 0) {
      const current = await group(id);
      if (!current) throw notFound();
      return c.json({ erro: 'conflito', mensagem: 'Outra pessoa gravou antes. Juntando as duas edições.', grupo: await detail(current, access) }, 409);
    }
    return c.json({ grupo: await detail((await group(id))!, access) });
  });

  // Pôr alguém no grupo, ou trocar o papel de quem já está.
  app.put('/v1/grupos/:id/membros/:codigo', async (c) => {
    const s = await session(c);
    const id = groupId(c.req.param('id'));
    const { g, access } = await mine(id, s.userId);
    if (!canManage(access)) throw new HttpError(403, 'so-gestor', 'Só o dono e os gestores escolhem quem está neste grupo.');
    const body = await readJson(c);
    const role = body['papel'];
    if (!isRole(role)) throw new HttpError(400, 'papel-invalido', 'Escolha entre gestor, editor e leitor.');
    const p = await byCode(c.req.param('codigo'));
    if (p.id === g.dono_id) throw new HttpError(400, 'e-o-dono', `${p.id === s.userId ? 'Você é' : `${p.nome} é`} o dono deste grupo.`);
    if (p.id === s.userId) throw new HttpError(400, 'e-voce', 'Esse é você. Para mudar o seu papel, peça ao dono.');
    const current = await deps.db.first<{ papel: string }>('SELECT papel FROM grupo_membros WHERE grupo_id = ? AND usuario_id = ?', [id, p.id]);
    if (current?.papel === role) return c.json({ grupo: await detail(g, access) });
    const now = deps.now();
    if (!current) {
      const members = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM grupo_membros WHERE grupo_id = ?', [id]);
      if ((members?.n ?? 0) >= MAX_GROUP_MEMBERS) throw new HttpError(400, 'gente-demais', `Um grupo tem até ${MAX_GROUP_MEMBERS} pessoas além do dono.`);
      await roomFor(p);
      await shareBrake(s.userId, now, 1);
    }
    const at = now.toISOString();
    try {
      await write(deps, [...memberStatements(g, p, role, s.userId, !current, at, now), bump(id)], current ? 2 : 5);
    } catch (error) {
      // dois pedidos para pôr a mesma pessoa ao mesmo tempo: o outro já a pôs
      if (error instanceof HttpError || current) throw error;
      const joined = await deps.db.first('SELECT 1 AS x FROM grupo_membros WHERE grupo_id = ? AND usuario_id = ?', [id, p.id]);
      const now2 = await group(id);
      if (!joined || !now2) throw error;
      return c.json({ grupo: await detail(now2, access) }, 200);
    }
    const saved = await group(id);
    if (!saved) throw notFound();
    return c.json({ grupo: await detail(saved, access) }, current ? 200 : 201);
  });

  // Tirar alguém (o dono e os gestores), ou sair (`eu`, qualquer um menos o dono). O que a pessoa escreveu
  // no grupo fica nele (resposta P4): ela perde o acesso a tudo.
  app.delete('/v1/grupos/:id/membros/:codigo', async (c) => {
    const s = await session(c);
    const id = groupId(c.req.param('id'));
    const { g, access } = await mine(id, s.userId);
    const param = c.req.param('codigo');
    const target = param === 'eu' ? s.userId : (await byCode(param)).id;
    if (target === g.dono_id) {
      throw new HttpError(400, 'e-o-dono', target === s.userId ? 'Você é o dono: para tirar o grupo de todos, pare de compartilhar.' : 'Ninguém tira o dono do grupo.');
    }
    if (target !== s.userId && !canManage(access)) throw new HttpError(403, 'so-gestor', 'Só o dono e os gestores tiram alguém deste grupo.');
    if (!(await deps.db.first('SELECT 1 AS x FROM grupo_membros WHERE grupo_id = ? AND usuario_id = ?', [id, target]))) {
      return target === s.userId ? c.json({ ok: true }) : c.json({ grupo: await detail(g, access) });
    }
    await write(
      deps,
      [
        { sql: 'DELETE FROM grupo_membros WHERE grupo_id = ? AND usuario_id = ?', params: [id, target] },
        { sql: "DELETE FROM atividades WHERE tipo = 'compartilhou-grupo' AND alvo_id = ? AND ref = ?", params: [target, id] },
        // (as anotações do grupo saem da lista de quem saiu, e o site dela as tira; a versão delas não sobe,
        // senão todos os outros baixariam o grupo inteiro de novo)
        bump(id),
      ],
      3,
    );
    if (target === s.userId) return c.json({ ok: true });
    const saved = await group(id);
    if (!saved) throw notFound();
    return c.json({ grupo: await detail(saved, access) });
  });

  // Parar de compartilhar: só o dono. O grupo e tudo o que está nele ficam só com ele (as anotações viram
  // anotações dele, sem grupo compartilhado; o site dele as põe de volta no grupo de mesmo nome).
  app.delete('/v1/grupos/:id', async (c) => {
    const s = await session(c);
    const id = groupId(c.req.param('id'));
    const { access } = await mine(id, s.userId);
    if (access !== 'dono') throw new HttpError(403, 'so-dono', 'Só o dono para de compartilhar o grupo. Você pode sair dele.');
    await write(
      deps,
      [
        { sql: "DELETE FROM atividades WHERE tipo = 'compartilhou-grupo' AND ref = ?", params: [id] },
        { sql: 'DELETE FROM grupo_membros WHERE grupo_id = ?', params: [id] },
        { sql: 'UPDATE notas SET grupo_id = NULL, versao = versao + 1 WHERE grupo_id = ?', params: [id] },
        { sql: 'DELETE FROM grupos WHERE id = ?', params: [id] },
      ],
      4,
    );
    return c.json({ ok: true });
  });

  publicGroupRoutes(app, deps);
}

/**
 * Os grupos públicos de outra pessoa, pelo código do mural (a visita e o link, PLANO-COMPARTILHAR.md 4.6):
 * a lista e cada grupo, com as anotações dele. Servidos daqui, e não do mural público que o site monta:
 * a edição de qualquer pessoa do grupo aparece sem esperar o site do dono abrir. Com VER_MURAIS=logados,
 * só quem entrou.
 */
function publicGroupRoutes(app: Hono, deps: Deps): void {
  const owner = async (c: Context): Promise<string> => {
    if (deps.config.publicMurals === 'logados') await sessionOf(deps, c);
    const code = normalizeCode(c.req.param('codigo') ?? '');
    const row = code ? await deps.db.first<{ id: string }>('SELECT id FROM usuarios WHERE codigo = ?', [code]) : null;
    if (!row) throw new HttpError(404, 'mural-nao-encontrado', 'Não achei mural com esse código.');
    return row.id;
  };
  const parse = (text: string): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  app.get('/v1/murais/:codigo/grupos', async (c) => {
    const userId = await owner(c);
    const rows = await deps.db.all<{ id: string; versao: number; dados: string }>(
      'SELECT id, versao, dados FROM grupos WHERE dono_id = ? AND publico = 1 ORDER BY criado_em LIMIT ?',
      [userId, MAX_GROUPS_PER_USER],
    );
    return c.json({ grupos: rows.map((r) => ({ id: r.id, versao: r.versao, nome: groupNameOf(r.dados) })) });
  });

  // `depois`: a página seguinte das anotações (o id da última recebida). `versao`: a que o site já tem (204).
  app.get('/v1/murais/:codigo/grupos/:id', async (c) => {
    const userId = await owner(c);
    const id = groupId(c.req.param('id'));
    const g = await deps.db.first<{ versao: number; dados: string; atualizado_em: string }>(
      'SELECT versao, dados, atualizado_em FROM grupos WHERE id = ? AND dono_id = ? AND publico = 1',
      [id, userId],
    );
    if (!g) throw new HttpError(404, 'grupo-nao-encontrado', 'Esse grupo não é público.');
    // a versão de quem visita junta o grupo e as anotações dele (uma anotação mudada muda a página)
    // (com quantas são: apagar uma e mexer em outra não pode dar a mesma soma)
    const sum = await deps.db.first<{ n: number; v: number; u: string | null }>(
      'SELECT COUNT(*) AS n, COALESCE(SUM(versao), 0) AS v, MAX(atualizado_em) AS u FROM notas WHERE grupo_id = ?',
      [id],
    );
    const versao = `${g.versao}.${sum?.n ?? 0}.${sum?.v ?? 0}.${Date.parse(sum?.u ?? '') || 0}`;
    c.header('Grupo-Versao', versao);
    const after = c.req.query('depois') ?? '';
    if (!after && c.req.query('versao') === versao) return c.body(null, 204);
    const notes = await deps.db.all<{ id: string; dados: string }>('SELECT id, dados FROM notas WHERE grupo_id = ? AND id > ? ORDER BY id LIMIT ?', [
      id,
      after,
      PUBLIC_NOTES_PAGE + 1,
    ]);
    const page = notes.slice(0, PUBLIC_NOTES_PAGE);
    return c.json({
      grupo: { id, versao, dados: parse(g.dados), atualizadoEm: g.atualizado_em },
      notas: page.map((n) => parse(n.dados)).filter((n) => n !== null),
      ...(notes.length > PUBLIC_NOTES_PAGE ? { depois: page.at(-1)!.id } : {}),
    });
  });
}
