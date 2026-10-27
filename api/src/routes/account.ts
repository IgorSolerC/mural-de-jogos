import { Context, Hono } from 'hono';
import { MAX_CODES_PER_DAY, formatCode, generateCode, normalizeCode } from '../domain/code';
import { isCommentsFrom } from '../domain/comment';
import { cleanName } from '../domain/name';
import { brakeStatement, usedToday } from '../domain/brake';
import { write } from '../domain/quota';
import { MAX_SESSIONS, hashToken, invalidSession, newToken, sessionStatements } from '../domain/session';
import { vaultAllowed } from '../domain/vault';
import { apiAllowed } from '../domain/api-key';
import { MAX_CHAVES } from '../../../contrato/api-v1/escopos';
import { cancelErase, eraseAccount, hasVault, scheduleErase } from '../domain/erase';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { readJson, sessionOf } from './http';

interface UserRow {
  id: string;
  codigo: string;
  nome: string;
  criado_em: string;
}

/** Login, sessões e a própria conta: /v1/auth/*, /v1/eu, /v1/eu/codigo e /v1/eu/cancelar-apagar. */
export function accountRoutes(app: Hono, deps: Deps): void {
  const session = (c: Context) => sessionOf(deps, c);
  const account = (u: Pick<UserRow, 'id' | 'codigo' | 'nome'>) => ({ id: u.id, codigo: formatCode(u.codigo), nome: u.nome });
  const findBySub = (sub: string) =>
    deps.db.first<UserRow>('SELECT id, codigo, nome, criado_em FROM usuarios WHERE google_sub = ?', [sub]);

  app.post('/v1/auth/google', async (c) => {
    const body = await readJson(c);
    if (typeof body['credential'] !== 'string' || body['credential'].length > 8_192) {
      throw new HttpError(400, 'sem-credencial', 'Faltou o login do Google.');
    }
    const google = await deps.verifyGoogle(body['credential']);
    const device = typeof body['aparelho'] === 'string' ? body['aparelho'].slice(0, 60) || null : null;
    const now = deps.now();
    const token = newToken();
    const hash = await hashToken(token);

    let user = await findBySub(google.sub);
    let created = false;
    if (user) {
      // freio: no máximo MAX_SESSIONS logins por conta em 24 horas (cada um grava algumas linhas); sair
      // não devolve a vaga
      if ((await usedToday(deps, user.id, 'entrar', now)) >= MAX_SESSIONS) {
        throw new HttpError(429, 'muitos-logins', 'Muitos logins nesta conta hoje. Tente de novo amanhã.');
      }
      await write(deps, sessionStatements(hash, user.id, device, now), 8);
    } else {
      const name = cleanName(body['nome']) ?? cleanName(google.givenName) ?? 'Sem nome';
      const id = crypto.randomUUID();
      const code = await freeCode(deps);
      const statements: Statement[] = [
        {
          sql: 'INSERT INTO usuarios (id, google_sub, codigo, nome, criado_em) VALUES (?, ?, ?, ?, ?)',
          params: [id, google.sub, code, name, now.toISOString()],
        },
        ...sessionStatements(hash, id, device, now),
      ];
      try {
        await write(deps, statements, 12);
        user = { id, codigo: code, nome: name, criado_em: now.toISOString() };
        created = true;
      } catch (error) {
        // dois primeiros logins ao mesmo tempo: o outro criou a conta; entra nela
        user = await findBySub(google.sub);
        if (!user || error instanceof HttpError) throw error;
        await write(deps, sessionStatements(hash, user.id, device, now), 8);
      }
    }
    return c.json({ token, conta: { ...account(user), nova: created } });
  });

  app.post('/v1/auth/sair', async (c) => {
    const s = await session(c);
    await write(deps, [{ sql: 'DELETE FROM sessoes WHERE hash = ?', params: [s.hash] }], 3);
    return c.json({ ok: true });
  });

  // Com `{"chaves": true}`, corta também as chaves de API e os conectores (PLANO-API.md, D5: o site
  // pergunta, com a caixa marcada).
  app.post('/v1/auth/sair-de-todos', async (c) => {
    const s = await session(c);
    const body = await readJson(c);
    const keys = body['chaves'] === true;
    await write(
      deps,
      [
        { sql: 'DELETE FROM sessoes WHERE usuario_id = ?', params: [s.userId] },
        ...(keys ? [{ sql: 'DELETE FROM api_chaves WHERE usuario_id = ?', params: [s.userId] }] : []),
      ],
      3 * MAX_SESSIONS + (keys ? 4 * MAX_CHAVES : 0),
    );
    return c.json({ ok: true });
  });

  app.get('/v1/eu', async (c) => {
    const s = await session(c);
    const user = await deps.db.first<UserRow & { seguidores: number; seguindo: number; pessoas_visiveis: number; comentarios_de: string; apagar_em: string | null }>(
      'SELECT id, codigo, nome, criado_em, pessoas_visiveis, comentarios_de, apagar_em, ' +
        '(SELECT COUNT(*) FROM seguindo WHERE seguido_id = usuarios.id) AS seguidores, ' +
        '(SELECT COUNT(*) FROM seguindo WHERE seguidor_id = usuarios.id) AS seguindo ' +
        'FROM usuarios WHERE id = ?',
      [s.userId],
    );
    if (!user) throw invalidSession();
    return c.json({
      ...account(user),
      criadoEm: user.criado_em,
      seguidores: user.seguidores,
      seguindo: user.seguindo,
      pessoas: user.pessoas_visiveis ? 'listas' : 'numeros',
      comentarios: user.comentarios_de === 'seguidos' ? 'seguidos' : 'seguidores',
      cofre: await vaultAllowed(deps, user.codigo),
      // pode usar a API das AIs (API_CODIGOS)? Só mostra a parte Acessos dos Ajustes
      api: apiAllowed(deps, user.codigo),
      // marcada para sair (ver o DELETE): o site mostra o aviso com o Cancelar
      ...(user.apagar_em ? { apagarEm: user.apagar_em } : {}),
    });
  });

  app.patch('/v1/eu', async (c) => {
    const s = await session(c);
    const body = await readJson(c);
    // o nome e/ou o que os outros veem de quem eu sigo e de quem me segue (as listas, ou só os números)
    // e/ou quem comenta nas minhas publicações (quem me segue, ou só quem eu sigo)
    const people = body['pessoas'];
    if (people !== undefined && people !== 'listas' && people !== 'numeros') {
      throw new HttpError(400, 'pessoas-invalido', 'Escolha entre mostrar as listas ou só os números.');
    }
    const comments = body['comentarios'];
    if (comments !== undefined && !isCommentsFrom(comments)) {
      throw new HttpError(400, 'comentarios-invalido', 'Escolha entre quem segue você ou só quem você segue.');
    }
    const visible = people === undefined ? null : people === 'listas' ? 1 : 0;
    const from = comments ?? null;
    const hasName = body['nome'] !== undefined;
    const name = hasName ? cleanName(body['nome']) : null;
    // um nome que não serve, ou um pedido sem nada para mudar (o erro de sempre, o do nome)
    if ((hasName && !name) || (!hasName && visible === null && from === null)) {
      throw new HttpError(400, 'nome-invalido', 'Escreva um nome de 1 a 40 caracteres.');
    }
    await write(
      deps,
      [
        {
          sql:
            'UPDATE usuarios SET nome = COALESCE(?, nome), pessoas_visiveis = COALESCE(?, pessoas_visiveis), ' +
            'comentarios_de = COALESCE(?, comentarios_de) WHERE id = ?',
          params: [name, visible, from, s.userId],
        },
      ],
      2,
    );
    return c.json({ ...(name ? { nome: name } : {}), ...(visible !== null ? { pessoas: people } : {}), ...(from !== null ? { comentarios: from } : {}) });
  });

  // Trocar o código: o antigo para de funcionar; quem segue continua seguindo (seguir guarda o id).
  app.post('/v1/eu/codigo', async (c) => {
    const s = await session(c);
    const now = deps.now();
    await codeBrake(deps, s.userId, now);
    const code = await freeCode(deps);
    await write(deps, [{ sql: 'UPDATE usuarios SET codigo = ? WHERE id = ?', params: [code, s.userId] }, brakeStatement(s.userId, 'codigo', now)], 5);
    return c.json({ codigo: formatCode(code) });
  });

  // Escolher o código (`{ "codigo": "ABCD-1234" }`): vale como o sorteado, se ninguém estiver usando.
  // Num PUT, e não no POST de cima: uma API antiga, que não conhece a escolha, sortearia outro.
  app.put('/v1/eu/codigo', async (c) => {
    const s = await session(c);
    const body = await readJson(c);
    const code = typeof body['codigo'] === 'string' ? normalizeCode(body['codigo']) : null;
    if (!code) {
      throw new HttpError(400, 'codigo-invalido', 'O código tem 8 letras e números, como ABCD-1234, sem as letras I, L, O e U.');
    }
    const taken = () => new HttpError(409, 'codigo-em-uso', 'Esse código já é de outra pessoa. Escolha outro.');
    const owner = await deps.db.first<{ id: string }>('SELECT id FROM usuarios WHERE codigo = ?', [code]);
    // (o que já é o seu: nada a gravar)
    if (owner?.id === s.userId) return c.json({ codigo: formatCode(code) });
    if (owner) throw taken();
    const now = deps.now();
    await codeBrake(deps, s.userId, now);
    try {
      await write(deps, [{ sql: 'UPDATE usuarios SET codigo = ? WHERE id = ?', params: [code, s.userId] }, brakeStatement(s.userId, 'codigo', now)], 5);
    } catch (error) {
      // duas pessoas pedindo o mesmo código ao mesmo tempo: a coluna é única, e quem chegou depois fica sem
      if (error instanceof HttpError || !(await deps.db.first('SELECT 1 AS x FROM usuarios WHERE codigo = ? AND id <> ?', [code, s.userId]))) throw error;
      throw taken();
    }
    return c.json({ codigo: formatCode(code) });
  });

  // Apagar a conta. Com cofre de senhas, ela só fica marcada para sair em 7 dias (202, com `apagarEm`),
  // com o aviso no site e o Cancelar; sem cofre (ou depois de apagá-lo lá dentro), sai na hora. Ver domain/erase.ts.
  app.delete('/v1/eu', async (c) => {
    const s = await session(c);
    if (await hasVault(deps, s.userId)) return c.json({ ok: true, apagarEm: await scheduleErase(deps, s.userId) }, 202);
    await eraseAccount(deps, s.userId);
    return c.json({ ok: true });
  });

  // Cancelar o apagar marcado (qualquer sessão da conta).
  app.post('/v1/eu/cancelar-apagar', async (c) => {
    const s = await session(c);
    await cancelErase(deps, s.userId);
    return c.json({ ok: true });
  });
}

/** O freio de trocar o código (sorteado ou escolhido): cada troca grava, e o código antigo fica livre para outra pessoa. */
async function codeBrake(deps: Deps, userId: string, now: Date): Promise<void> {
  if ((await usedToday(deps, userId, 'codigo', now)) >= MAX_CODES_PER_DAY) {
    throw new HttpError(429, 'codigo-devagar', 'Você trocou o código muitas vezes hoje. Tente de novo amanhã.');
  }
}

/** Um código que ninguém usa ainda (com 1,1 trilhão de combinações, quase sempre o primeiro). */
async function freeCode(deps: Deps): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    if (!(await deps.db.first('SELECT 1 AS x FROM usuarios WHERE codigo = ?', [code]))) return code;
  }
  throw new HttpError(503, 'codigo-indisponivel', 'Não consegui criar um código agora. Tente de novo.');
}
