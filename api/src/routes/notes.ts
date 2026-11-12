import { Context, Hono } from 'hono';
import { brakeStatement, usedToday } from '../domain/brake';
import { formatCode, normalizeCode } from '../domain/code';
import { photoOut } from '../domain/photo';
import { write } from '../domain/quota';
import {
  Access,
  MAX_MEMBERS,
  MAX_NOTES_PER_USER,
  MAX_NOTE_BODY_CHARS,
  Role,
  canManage,
  canWrite,
  isPrivateNote,
  isRole,
  noteData,
  noteId,
  structureOf,
  titleOf,
} from '../domain/shared-note';
import { Who, markStatements } from '../domain/shared-public';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { readJson, sessionOf } from './http';
import { imageIdsIn, noteImageStatements } from '../domain/image';
import { MAX_GROUP_NOTES, asRole, groupId, widest } from '../domain/shared-group';

/**
 * As anotações compartilhadas (ver `domain/shared-note.ts` e a migração 0011).
 *
 * - `GET /v1/eu/notas`: as anotações em que a pessoa está (dela e com ela), só o id, a `versao` e o
 *   papel: o site baixa de novo só as que mudaram, com `GET /v1/eu/notas/detalhes?ids=…`.
 * - `POST /v1/notas`: o dono compartilha uma anotação dele (o conteúdo e, se quiser, já as pessoas).
 * - `PUT /v1/notas/:id`: grava o conteúdo, dizendo em qual `rev` se baseou. Se outra pessoa gravou
 *   antes, responde 409 com a anotação de agora, e o site junta as duas e tenta de novo. Um conflito
 *   (os dois mexeram no mesmo trecho de jeitos diferentes) vai junto (`conflito.b`) e fica guardado até
 *   alguém que escreve escolher (`resolver`).
 * - `PUT`/`DELETE /v1/notas/:id/membros/:codigo`: o dono e os gestores põem, trocam o papel e tiram
 *   pessoas; qualquer um sai sozinho (`/membros/eu`).
 * - `DELETE /v1/notas/:id`: só o dono apaga, para todos.
 *
 * Quem entra recebe o aviso "compartilhou uma nota com você" no correio (atividade 'compartilhou'),
 * que some quando a pessoa sai.
 */

/** Quantas pessoas novas uma conta põe em anotações por dia (cada uma recebe um aviso). */
export const MAX_SHARES_PER_DAY = 100;
/** Quantas anotações o pedido de detalhes devolve de uma vez. */
export const MAX_DETAILS = 25;
/** O intervalo mínimo entre duas gravações da mesma pessoa na mesma anotação. */
export const MIN_EDIT_MS = 1_000;

interface NoteRow {
  id: string;
  dono_id: string;
  /** O grupo compartilhado da anotação (migração 0025); null: a compartilhada solta. */
  grupo_id: string | null;
  /** Quem a escreveu (só nas de grupo: o dono dela é o dono do grupo). */
  criado_por: string | null;
  rev: number;
  versao: number;
  dados: string;
  conflito: string | null;
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

interface StoredConflict {
  a: unknown;
  b: unknown;
  autorA: string;
  autorB: string;
  em: string;
}

export function noteRoutes(app: Hono, deps: Deps): void {
  const session = (c: Context) => sessionOf(deps, c);

  const notFound = () => new HttpError(404, 'nota-nao-encontrada', 'Essa anotação não está mais compartilhada com você.');

  async function note(id: string): Promise<NoteRow | null> {
    return deps.db.first<NoteRow>('SELECT * FROM notas WHERE id = ?', [id]);
  }

  /**
   * O papel de `userId` na anotação (null: não está nela): o da própria anotação ou o do grupo dela, o mais
   * aberto (PLANO-COMPARTILHAR.md, 3.4). O dono do grupo é o dono das anotações dele.
   */
  async function accessOf(n: NoteRow, userId: string): Promise<Access | null> {
    if (n.dono_id === userId) return 'dono';
    const m = await deps.db.first<{ papel: string }>('SELECT papel FROM nota_membros WHERE nota_id = ? AND usuario_id = ?', [n.id, userId]);
    const own = m && isRole(m.papel) ? m.papel : null;
    if (!n.grupo_id) return own;
    return widest(own, await groupRole(n.grupo_id, userId));
  }

  /** O papel de `userId` num grupo compartilhado (null: não está nele, ou o grupo não existe). */
  async function groupRole(grupoId: string, userId: string): Promise<Access | null> {
    const g = await deps.db.first<{ dono_id: string; papel: string | null }>(
      'SELECT g.dono_id, m.papel FROM grupos g LEFT JOIN grupo_membros m ON m.grupo_id = g.id AND m.usuario_id = ? WHERE g.id = ?',
      [userId, grupoId],
    );
    if (!g) return null;
    return g.dono_id === userId ? 'dono' : asRole(g.papel);
  }

  /** O grupo e o papel de quem pede, ou 404. */
  async function groupFor(id: string, userId: string): Promise<{ dono_id: string; access: Access }> {
    const g = await deps.db.first<{ dono_id: string }>('SELECT dono_id FROM grupos WHERE id = ?', [id]);
    const access = g ? await groupRole(id, userId) : null;
    if (!g || !access) throw new HttpError(404, 'grupo-nao-encontrado', 'Esse grupo não está mais compartilhado com você.');
    return { dono_id: g.dono_id, access };
  }

  /** Quantas anotações o grupo já tem. */
  async function groupCount(grupoId: string): Promise<number> {
    return (await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM notas WHERE grupo_id = ?', [grupoId]))?.n ?? 0;
  }

  const groupFull = () => new HttpError(429, 'grupo-cheio', `O grupo já tem ${MAX_GROUP_NOTES} anotações, o máximo.`);

  /**
   * O id é o de uma ficha à mostra no mural de outra pessoa: só pode ser cópia (o id nasce sorteado em
   * cada mural). Compartilhada com a dona do id, a ficha dela ganharia um id novo (as duas não cabem no
   * mesmo mural) e perderia os comentários, as reações e os links; e ninguém toma de antemão o id de uma
   * ficha que ela ainda vai compartilhar.
   */
  async function idFree(id: string, userId: string): Promise<void> {
    if (await deps.db.first('SELECT 1 AS x FROM usuarios WHERE id <> ? AND fichas_publicas IS NOT NULL AND instr(fichas_publicas, ?) > 0 LIMIT 1', [userId, JSON.stringify(id)])) {
      throw idInUse();
    }
  }

  /** Uma anotação nova num grupo compartilhado, escrita por `userId` (que escreve no grupo). */
  async function createInGroup(userId: string, id: string, grupoId: string, dados: string) {
    const g = await groupFor(grupoId, userId);
    if (!canWrite(g.access)) throw new HttpError(403, 'so-leitura', 'Você pode ler este grupo, mas não escrever nele.');
    if ((await groupCount(grupoId)) >= MAX_GROUP_NOTES) throw groupFull();
    await idFree(id, userId);
    const at = deps.now().toISOString();
    const row: NoteRow = { id, dono_id: g.dono_id, grupo_id: grupoId, criado_por: userId, rev: 1, versao: 1, dados, conflito: null, criado_em: at, atualizado_em: at, atualizado_por: userId };
    try {
      await write(
        deps,
        [
          {
            sql: 'INSERT INTO notas (id, dono_id, grupo_id, criado_por, rev, versao, dados, criado_em, atualizado_em, atualizado_por) VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?)',
            params: [id, g.dono_id, grupoId, userId, dados, at, at, userId],
          },
          ...noteImageStatements(id, [dados]),
        ],
        2 + 2 * imageIdsIn(dados, 200).length,
      );
    } catch (error) {
      // dois pedidos iguais ao mesmo tempo: o outro criou; devolve a de agora
      const now2 = await note(id);
      if (error instanceof HttpError || !now2 || now2.grupo_id !== grupoId) throw error;
      return detail(now2, g.access);
    }
    return detail(row, g.access);
  }

  /** A anotação e o papel de quem pede, ou 404 (para quem não está nela, ela não existe). */
  async function mine(id: string, userId: string): Promise<{ n: NoteRow; access: Access }> {
    const n = await note(id);
    const access = n ? await accessOf(n, userId) : null;
    if (!n || !access) throw notFound();
    return { n, access };
  }

  async function byCode(input: unknown): Promise<Person> {
    const code = typeof input === 'string' ? normalizeCode(input) : null;
    if (!code) throw new HttpError(400, 'codigo-invalido', 'Esse código não existe. Confira: ele tem 8 letras e números.');
    const p = await deps.db.first<Person>('SELECT id, codigo, nome, foto FROM usuarios WHERE codigo = ?', [code]);
    if (!p) throw new HttpError(404, 'pessoa-nao-encontrada', `Não achei ninguém com o código ${formatCode(code)}.`);
    return p;
  }

  /** O dono e todo mundo que está na anotação (para marcar o mural público de cada um). */
  const everyone = (id: string): Who => ({ sql: 'SELECT dono_id FROM notas WHERE id = ? UNION SELECT usuario_id FROM nota_membros WHERE nota_id = ?', params: [id, id] });

  const idInUse = () => new HttpError(409, 'nota-id-em-uso', 'Essa anotação não pode ser compartilhada assim. Faça uma cópia dela e tente de novo.');

  /** Recusa pôr `p` em mais uma anotação se ela já está no máximo. */
  async function roomFor(p: Person): Promise<void> {
    if ((await countFor(p.id)) >= MAX_NOTES_PER_USER) {
      throw new HttpError(429, 'notas-demais', `${p.nome} já está em ${MAX_NOTES_PER_USER} anotações compartilhadas, o máximo.`);
    }
  }

  const personOut = (p: Pick<Person, 'codigo' | 'nome' | 'foto'>) => {
    const foto = photoOut(p.foto);
    return { codigo: formatCode(p.codigo), nome: p.nome, ...(foto ? { foto } : {}) };
  };

  /** A anotação inteira, como o site recebe: o conteúdo, as pessoas, quem gravou por último e (para quem escreve) o conflito. */
  async function detail(n: NoteRow, access: Access) {
    const members = await deps.db.all<Person & { papel: string; criado_em: string }>(
      'SELECT u.id, u.codigo, u.nome, u.foto, m.papel, m.criado_em FROM nota_membros m JOIN usuarios u ON u.id = m.usuario_id ' +
        'WHERE m.nota_id = ? ORDER BY m.criado_em, u.codigo',
      [n.id],
    );
    const conflict = canWrite(access) ? parseConflict(n.conflito) : null;
    const ids = [...new Set([n.dono_id, n.atualizado_por, ...(n.criado_por ? [n.criado_por] : []), ...(conflict ? [conflict.autorA, conflict.autorB] : [])])];
    const people = await deps.db.all<Person>(`SELECT id, codigo, nome, foto FROM usuarios WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
    const byId = new Map(people.map((p) => [p.id, p]));
    const who = (id: string) => {
      const p = byId.get(id);
      return p ? personOut(p) : null;
    };
    const owner = who(n.dono_id);
    let dados: unknown = null;
    try {
      dados = JSON.parse(n.dados);
    } catch {
      dados = null;
    }
    return {
      id: n.id,
      dono: owner,
      papel: access,
      rev: n.rev,
      versao: n.versao,
      dados,
      membros: members.filter((m) => isRole(m.papel)).map((m) => ({ ...personOut(m), papel: m.papel, desde: m.criado_em })),
      criadoEm: n.criado_em,
      atualizadoEm: n.atualizado_em,
      atualizadoPor: who(n.atualizado_por),
      // a de um grupo compartilhado: o grupo e quem a escreveu (o dono dela é o dono do grupo)
      ...(n.grupo_id ? { grupo: n.grupo_id, criadoPor: n.criado_por ? who(n.criado_por) : null } : {}),
      ...(conflict ? { conflito: { a: conflict.a, b: conflict.b, autorA: who(conflict.autorA), autorB: who(conflict.autorB), em: conflict.em } } : {}),
    };
  }

  /** Quantas anotações compartilhadas a pessoa já tem (dela e com ela). */
  async function countFor(userId: string): Promise<number> {
    const row = await deps.db.first<{ n: number }>(
      // as de grupo têm o limite do grupo (MAX_GROUP_NOTES), não o da pessoa
      'SELECT (SELECT COUNT(*) FROM notas WHERE dono_id = ? AND grupo_id IS NULL) + (SELECT COUNT(*) FROM nota_membros WHERE usuario_id = ?) AS n',
      [userId, userId],
    );
    return row?.n ?? 0;
  }

  /** O freio de pôr gente nova: conta cada pessoa, mesmo as tiradas depois. */
  async function shareBrake(userId: string, now: Date, adding: number): Promise<void> {
    if (adding && (await usedToday(deps, userId, 'compartilhar', now)) + adding > MAX_SHARES_PER_DAY) {
      throw new HttpError(429, 'compartilhar-devagar', 'Você compartilhou com muita gente hoje. Tente de novo amanhã.');
    }
  }

  /** As gravações que põem `p` na anotação (ou trocam o papel dela), com o aviso se ela é nova ali. */
  function memberStatements(n: Pick<NoteRow, 'id' | 'dados'>, p: Person, role: Role, by: string, isNew: boolean, at: string, now: Date): Statement[] {
    if (!isNew) return [{ sql: 'UPDATE nota_membros SET papel = ? WHERE nota_id = ? AND usuario_id = ?', params: [role, n.id, p.id] }];
    return [
      {
        sql: 'INSERT INTO nota_membros (nota_id, usuario_id, papel, convidado_por, criado_em) VALUES (?, ?, ?, ?, ?)',
        params: [n.id, p.id, role, by, at],
      },
      // o aviso: um por pessoa e anotação (sair e entrar de novo avisa de novo)
      { sql: "DELETE FROM atividades WHERE tipo = 'compartilhou' AND alvo_id = ? AND ref = ?", params: [p.id, n.id] },
      {
        sql: "INSERT INTO atividades (tipo, autor_id, alvo_id, ref, resumo, criado_em) VALUES ('compartilhou', ?, ?, ?, ?, ?)",
        params: [by, p.id, n.id, JSON.stringify({ titulo: titleOf(n.dados), mural: 'anotacoes' }), at],
      },
      brakeStatement(by, 'compartilhar', now),
    ];
  }

  // As anotações em que a pessoa está: só o que muda (a versão) e o papel.
  // (com as dos grupos compartilhados em que ela está; numa que vem pelos dois caminhos, vale o papel mais aberto)
  app.get('/v1/eu/notas', async (c) => {
    const s = await session(c);
    const limit = MAX_NOTES_PER_USER * 2 + MAX_GROUP_NOTES * 4;
    const rows = await deps.db.all<{ id: string; versao: number; papel: string }>(
      "SELECT id, versao, 'dono' AS papel FROM notas WHERE dono_id = ? " +
        'UNION ALL SELECT n.id, n.versao, m.papel FROM nota_membros m JOIN notas n ON n.id = m.nota_id WHERE m.usuario_id = ? ' +
        'UNION ALL SELECT n.id, n.versao, g.papel FROM grupo_membros g JOIN notas n ON n.grupo_id = g.grupo_id WHERE g.usuario_id = ? ' +
        'LIMIT ?',
      [s.userId, s.userId, s.userId, limit],
    );
    const byId = new Map<string, { id: string; versao: number; papel: Access }>();
    for (const r of rows) {
      const papel = r.papel === 'dono' ? 'dono' : asRole(r.papel);
      if (!papel) continue;
      byId.set(r.id, { id: r.id, versao: r.versao, papel: widest(byId.get(r.id)?.papel ?? null, papel)! });
    }
    // (no teto, a lista não está inteira: as que ficaram de fora não saíram, e o site não as tira)
    return c.json({ notas: [...byId.values()], ...(rows.length >= limit ? { cortada: true } : {}) });
  });

  // As anotações pedidas, inteiras (só as em que a pessoa está; as outras não vêm).
  app.get('/v1/eu/notas/detalhes', async (c) => {
    const s = await session(c);
    const ids = [...new Set((c.req.query('ids') ?? '').split(',').filter(Boolean))].slice(0, MAX_DETAILS);
    const out = [];
    for (const raw of ids) {
      let id: string;
      try {
        id = noteId(raw);
      } catch {
        continue;
      }
      const n = await note(id);
      const access = n ? await accessOf(n, s.userId) : null;
      if (n && access) out.push(await detail(n, access));
    }
    return c.json({ notas: out });
  });

  // Compartilhar uma anotação: ela passa a morar aqui, com o dono e as pessoas que vierem junto.
  //
  // Com `grupo`, a anotação nasce num grupo compartilhado (quem escreve nele: o dono, os gestores e os
  // editores): ela é do dono do grupo, e quem a escreveu fica em `criado_por`. Sem pessoas a mais.
  app.post('/v1/notas', async (c) => {
    const s = await session(c);
    const body = await readJson(c, MAX_NOTE_BODY_CHARS);
    const id = noteId(body['id']);
    const grupoId = body['grupo'] === undefined || body['grupo'] === null ? null : groupId(body['grupo']);
    const dados = noteData(body['dados'], id, !!grupoId);
    const existing = await note(id);
    if (existing) {
      // já compartilhada (o pedido de antes chegou e a resposta se perdeu): devolve como está
      if (existing.dono_id === s.userId) return c.json({ nota: await detail(existing, 'dono') }, 200);
      const access = grupoId && existing.grupo_id === grupoId ? await accessOf(existing, s.userId) : null;
      if (access) return c.json({ nota: await detail(existing, access) }, 200);
      throw idInUse();
    }
    if (grupoId) return c.json({ nota: await createInGroup(s.userId, id, grupoId, dados) }, 201);
    if ((await countFor(s.userId)) >= MAX_NOTES_PER_USER) {
      throw new HttpError(429, 'notas-demais', `Você já tem ${MAX_NOTES_PER_USER} anotações compartilhadas, o máximo.`);
    }
    await idFree(id, s.userId);
    const wanted = Array.isArray(body['membros']) ? body['membros'].slice(0, MAX_MEMBERS + 1) : [];
    const people = new Map<string, { p: Person; role: Role }>();
    for (const item of wanted) {
      const m = item as Record<string, unknown> | null;
      const role = m?.['papel'];
      if (!isRole(role)) throw new HttpError(400, 'papel-invalido', 'Escolha entre gestor, editor e leitor.');
      const p = await byCode(m?.['codigo']);
      if (p.id !== s.userId) people.set(p.id, { p, role });
    }
    if (people.size > MAX_MEMBERS) throw new HttpError(400, 'gente-demais', `Uma anotação tem até ${MAX_MEMBERS} pessoas além de você.`);
    // o limite de cada pessoa vale também para quem entra junto (como ao pôr alguém depois)
    for (const { p } of people.values()) await roomFor(p);
    const now = deps.now();
    await shareBrake(s.userId, now, people.size);
    const at = now.toISOString();
    const row: NoteRow = { id, dono_id: s.userId, grupo_id: null, criado_por: null, rev: 1, versao: 1, dados, conflito: null, criado_em: at, atualizado_em: at, atualizado_por: s.userId };
    try {
      await write(
        deps,
        [
          {
            sql: 'INSERT INTO notas (id, dono_id, rev, versao, dados, criado_em, atualizado_em, atualizado_por) VALUES (?, ?, 1, 1, ?, ?, ?, ?)',
            params: [id, s.userId, dados, at, at, s.userId],
          },
          ...[...people.values()].flatMap(({ p, role }) => memberStatements(row, p, role, s.userId, true, at, now)),
          // as imagens coladas nela: quem está na anotação passa a vê-las (ver domain/image.ts)
          ...noteImageStatements(id, [dados]),
        ],
        3 + 9 * people.size + 2 * imageIdsIn(dados, 200).length,
      );
    } catch (error) {
      // dois pedidos iguais ao mesmo tempo: o outro criou; devolve a de agora
      const now2 = await note(id);
      if (error instanceof HttpError || !now2) throw error;
      if (now2.dono_id !== s.userId) throw new HttpError(409, 'nota-id-em-uso', 'Essa anotação não pode ser compartilhada assim.');
      return c.json({ nota: await detail(now2, 'dono') }, 200);
    }
    return c.json({ nota: await detail(row, 'dono') }, 201);
  });

  // Gravar o conteúdo, a partir da `rev` que o site tinha.
  app.put('/v1/notas/:id', async (c) => {
    const s = await session(c);
    const id = noteId(c.req.param('id'));
    const { n, access } = await mine(id, s.userId);
    if (!canWrite(access)) throw new HttpError(403, 'so-leitura', 'Você pode ler esta anotação, mas não editar.');
    const body = await readJson(c, MAX_NOTE_BODY_CHARS);
    const base = body['base'];
    if (typeof base !== 'number' || !Number.isSafeInteger(base) || base < 1) {
      throw new HttpError(400, 'sem-rev', 'Faltou dizer em qual versão da anotação a edição se baseia.');
    }
    if (base !== n.rev) return c.json({ erro: 'conflito', mensagem: 'Outra pessoa gravou antes. Juntando as duas edições.', nota: await detail(n, access) }, 409);
    const dados = noteData(body['dados'], id, !!n.grupo_id);
    const raw = body['conflito'] as Record<string, unknown> | undefined;
    const other = raw && typeof raw === 'object' && !Array.isArray(raw) ? noteData(raw['b'], id, !!n.grupo_id) : null;
    const pending = parseConflict(n.conflito);
    // O editor escreve, mas não muda a estrutura (o site nem mostra; aqui é a garantia). Escolhendo num
    // conflito, vale a estrutura de uma das duas versões (a outra pode ter vindo de um gestor).
    if (!canManage(access)) {
      const allowed = new Set([structureOf(n.dados)]);
      if (body['resolver'] === true && pending) for (const v of [pending.a, pending.b]) allowed.add(structureOf(JSON.stringify(v)));
      if (!allowed.has(structureOf(dados)) || (other !== null && structureOf(other) !== structureOf(n.dados))) {
        throw new HttpError(403, 'so-gestor', 'Só o dono e os gestores mudam quem vê esta anotação.');
      }
    }
    const now = deps.now();
    if (n.atualizado_por === s.userId && now.getTime() - Date.parse(n.atualizado_em) < MIN_EDIT_MS) {
      throw new HttpError(429, 'devagar', 'Muitas gravações seguidas. A próxima vai daqui a pouco.');
    }
    const at = now.toISOString();
    // o conflito: o de antes fica (até alguém escolher), um novo toma o lugar dele, `resolver` tira
    let conflict = n.conflito;
    if (other !== null) {
      conflict = JSON.stringify({ a: JSON.parse(dados), b: JSON.parse(other), autorA: n.atualizado_por, autorB: s.userId, em: at } satisfies StoredConflict);
    } else if (body['resolver'] === true) {
      conflict = null;
    }
    // virou privada: some do mural público de todos que estão nela (a cópia de cada um só muda quando o
    // site dele abre; ver domain/shared-public.ts), se a gravação entrou mesmo
    const hiding = !isPrivateNote(n.dados) && isPrivateNote(dados);
    const people = hiding ? ((await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM nota_membros WHERE nota_id = ?', [id]))?.n ?? 0) + 1 : 0;
    const [result] = await write(
      deps,
      [
        {
          sql:
            'UPDATE notas SET rev = rev + 1, versao = versao + 1, dados = ?, conflito = ?, atualizado_em = ?, atualizado_por = ? ' +
            'WHERE id = ? AND rev = ?',
          params: [dados, conflict, at, s.userId, id, base],
        },
        ...(hiding
          ? markStatements(everyone(id), now, id, {
              sql: 'SELECT 1 FROM notas WHERE id = ? AND rev = ? AND atualizado_em = ? AND atualizado_por = ?',
              params: [id, base + 1, at, s.userId],
            })
          : []),
        // as imagens coladas nela (e na versão em conflito), se a gravação entrou
        ...noteImageStatements(id, [dados, ...(conflict ? [conflict] : [])], {
          sql: 'SELECT 1 FROM notas WHERE id = ? AND rev = ? AND atualizado_em = ? AND atualizado_por = ?',
          params: [id, base + 1, at, s.userId],
        }),
      ],
      2 + 2 * people + 2 * imageIdsIn(dados + (conflict ?? ''), 200).length,
    );
    if (!result || result.changes === 0) {
      // outra gravação entrou entre a leitura e esta: a de agora volta para juntar
      const current = await note(id);
      if (!current) throw notFound();
      return c.json({ erro: 'conflito', mensagem: 'Outra pessoa gravou antes. Juntando as duas edições.', nota: await detail(current, access) }, 409);
    }
    const saved = await note(id);
    return c.json({ nota: await detail(saved!, access) });
  });

  // Pôr alguém na anotação, ou trocar o papel de quem já está.
  app.put('/v1/notas/:id/membros/:codigo', async (c) => {
    const s = await session(c);
    const id = noteId(c.req.param('id'));
    const { n, access } = await mine(id, s.userId);
    if (!canManage(access)) throw new HttpError(403, 'so-gestor', 'Só o dono e os gestores escolhem quem está nesta anotação.');
    const body = await readJson(c);
    const role = body['papel'];
    if (!isRole(role)) throw new HttpError(400, 'papel-invalido', 'Escolha entre gestor, editor e leitor.');
    const p = await byCode(c.req.param('codigo'));
    if (p.id === n.dono_id) throw new HttpError(400, 'e-o-dono', `${p.id === s.userId ? 'Você é' : `${p.nome} é`} o dono desta anotação.`);
    if (p.id === s.userId) throw new HttpError(400, 'e-voce', 'Esse é você. Para mudar o seu papel, peça ao dono.');
    const current = await deps.db.first<{ papel: string }>('SELECT papel FROM nota_membros WHERE nota_id = ? AND usuario_id = ?', [id, p.id]);
    if (current?.papel === role) return c.json({ nota: await detail(n, access) });
    const now = deps.now();
    if (!current) {
      const members = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM nota_membros WHERE nota_id = ?', [id]);
      if ((members?.n ?? 0) >= MAX_MEMBERS) throw new HttpError(400, 'gente-demais', `Uma anotação tem até ${MAX_MEMBERS} pessoas além do dono.`);
      await roomFor(p);
      await shareBrake(s.userId, now, 1);
    }
    const at = now.toISOString();
    try {
      await write(
        deps,
        [...memberStatements(n, p, role, s.userId, !current, at, now), { sql: 'UPDATE notas SET versao = versao + 1 WHERE id = ?', params: [id] }],
        current ? 3 : 12,
      );
    } catch (error) {
      // dois pedidos para pôr a mesma pessoa ao mesmo tempo: o outro já a pôs (a chave da tabela
      // recusou este); devolve a anotação como ficou, em vez de um erro
      if (error instanceof HttpError || current) throw error;
      const now2 = await note(id);
      const joined = now2 ? await deps.db.first('SELECT 1 AS x FROM nota_membros WHERE nota_id = ? AND usuario_id = ?', [id, p.id]) : null;
      if (!now2 || !joined) throw error;
      return c.json({ nota: await detail(now2, access) }, 200);
    }
    const saved = await note(id);
    if (!saved) throw notFound();
    return c.json({ nota: await detail(saved, access) }, current ? 200 : 201);
  });

  // Tirar alguém (o dono e os gestores), ou sair (`eu`, qualquer um menos o dono).
  app.delete('/v1/notas/:id/membros/:codigo', async (c) => {
    const s = await session(c);
    const id = noteId(c.req.param('id'));
    const { n, access } = await mine(id, s.userId);
    const param = c.req.param('codigo');
    const target = param === 'eu' ? s.userId : (await byCode(param)).id;
    if (target === n.dono_id) {
      throw new HttpError(400, 'e-o-dono', target === s.userId ? 'Você é o dono: para tirar a anotação de todos, apague-a.' : 'Ninguém tira o dono da anotação.');
    }
    if (target !== s.userId && !canManage(access)) throw new HttpError(403, 'so-gestor', 'Só o dono e os gestores tiram alguém desta anotação.');
    // quem já não está (tirado por outro gestor, o mesmo pedido de novo): nada a gravar, e a versão de
    // todos não sobe à toa (cada um baixaria a anotação inteira de novo)
    if (target !== s.userId && !(await deps.db.first('SELECT 1 AS x FROM nota_membros WHERE nota_id = ? AND usuario_id = ?', [id, target]))) {
      return c.json({ nota: await detail(n, access) });
    }
    await write(
      deps,
      [
        { sql: 'DELETE FROM nota_membros WHERE nota_id = ? AND usuario_id = ?', params: [id, target] },
        { sql: "DELETE FROM atividades WHERE tipo = 'compartilhou' AND alvo_id = ? AND ref = ?", params: [target, id] },
        { sql: 'UPDATE notas SET versao = versao + 1 WHERE id = ?', params: [id] },
        // a anotação sai do mural público de quem saiu (ver domain/shared-public.ts)
        ...markStatements({ sql: 'SELECT ?', params: [target] }, deps.now(), id),
      ],
      10,
    );
    if (target === s.userId) return c.json({ ok: true });
    const saved = await note(id);
    if (!saved) throw notFound();
    return c.json({ nota: await detail(saved, access) });
  });

  // Pôr a anotação num grupo compartilhado, ou tirar dela. Pôr: quem é dono da anotação e escreve no grupo
  // (ela passa a ser do dono do grupo, resposta P4). Tirar: o dono e os gestores do grupo (ela fica com o
  // dono do grupo, sem grupo). Trocar de um grupo para outro: as duas coisas.
  app.put('/v1/notas/:id/grupo', async (c) => {
    const s = await session(c);
    const id = noteId(c.req.param('id'));
    const { n, access } = await mine(id, s.userId);
    const body = await readJson(c);
    const target = body['grupo'] === null ? null : groupId(body['grupo']);
    if (target === n.grupo_id) return c.json({ nota: await detail(n, access) });
    if (n.grupo_id && !canManage(await groupRole(n.grupo_id, s.userId))) {
      throw new HttpError(403, 'so-gestor', 'Só o dono e os gestores tiram uma anotação do grupo.');
    }
    if (!n.grupo_id && n.dono_id !== s.userId) throw new HttpError(403, 'so-dono', 'Só o dono da anotação a põe num grupo.');
    let owner = n.dono_id;
    if (target) {
      const g = await groupFor(target, s.userId);
      if (!canWrite(g.access)) throw new HttpError(403, 'so-leitura', 'Você pode ler este grupo, mas não escrever nele.');
      if ((await groupCount(target)) >= MAX_GROUP_NOTES) throw groupFull();
      owner = g.dono_id;
    }
    // o conteúdo guardado como o do lugar novo: a pasta e as tags ficam só dentro de um grupo
    let stored: unknown = null;
    try {
      stored = JSON.parse(n.dados);
    } catch {
      stored = null;
    }
    const dados = noteData(stored, id, !!target);
    const at = deps.now().toISOString();
    const [result] = await write(
      deps,
      [
        {
          sql:
            'UPDATE notas SET grupo_id = ?, dono_id = ?, criado_por = COALESCE(criado_por, ?), dados = ?, rev = rev + 1, versao = versao + 1, ' +
            'atualizado_em = ?, atualizado_por = ? WHERE id = ? AND rev = ?',
          params: [target, owner, n.dono_id, dados, at, s.userId, id, n.rev],
        },
        // mudou de dono (foi para o grupo de outra pessoa): a conversa, as reações e os comentários fechados
        // vão junto, porque moram no mural do dono (pelo código dele), se a mudança entrou
        ...(owner === n.dono_id
          ? []
          : ['comentarios', 'reacoes', 'comentarios_fechados'].map((table) => ({
              sql: `UPDATE ${table} SET dono_id = ? WHERE dono_id = ? AND ref = ? AND EXISTS (SELECT 1 FROM notas WHERE id = ? AND rev = ? AND dono_id = ?)`,
              params: [owner, n.dono_id, id, id, n.rev + 1, owner],
            }))),
      ],
      owner === n.dono_id ? 1 : 4,
    );
    const saved = await note(id);
    if (!saved) throw notFound();
    const now = await accessOf(saved, s.userId);
    if (!result || result.changes === 0) {
      if (!now) throw notFound();
      return c.json({ erro: 'conflito', mensagem: 'Outra pessoa gravou antes. Tente de novo.', nota: await detail(saved, now) }, 409);
    }
    // quem tirou e não está mais nela (a dona de antes, que a pôs num grupo de outra pessoa e saiu dele) não a vê
    if (!now) return c.json({ ok: true });
    return c.json({ nota: await detail(saved, now) });
  });

  // Apagar para todos: o dono; numa de grupo, também os gestores, e o editor a que ele escreveu (resposta P3).
  app.delete('/v1/notas/:id', async (c) => {
    const s = await session(c);
    const id = noteId(c.req.param('id'));
    const { n, access } = await mine(id, s.userId);
    const inGroup = n.grupo_id ? await groupRole(n.grupo_id, s.userId) : null;
    const mayDelete = access === 'dono' || canManage(inGroup) || (canWrite(inGroup) && n.criado_por === s.userId);
    if (!mayDelete) {
      throw n.grupo_id
        ? new HttpError(403, 'so-quem-escreveu', 'Num grupo, o editor apaga só as anotações que escreveu. As outras, o dono e os gestores.')
        : new HttpError(403, 'so-dono', 'Só o dono apaga a anotação para todos. Você pode sair dela.');
    }
    const members = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM nota_membros WHERE nota_id = ?', [id]);
    await write(
      deps,
      [
        // antes de as pessoas saírem: a anotação sai do mural público de cada uma (e do da dona)
        ...markStatements(everyone(id), deps.now(), id),
        { sql: 'DELETE FROM nota_membros WHERE nota_id = ?', params: [id] },
        { sql: "DELETE FROM atividades WHERE tipo = 'compartilhou' AND ref = ?", params: [id] },
        { sql: 'DELETE FROM nota_imagens WHERE nota_id = ?', params: [id] },
        { sql: 'DELETE FROM notas WHERE id = ?', params: [id] },
      ],
      6 + 8 * (members?.n ?? 0),
    );
    return c.json({ ok: true });
  });
}

function parseConflict(raw: string | null): StoredConflict | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as StoredConflict;
    return c && typeof c === 'object' && typeof c.autorA === 'string' && typeof c.autorB === 'string' ? c : null;
  } catch {
    return null;
  }
}
