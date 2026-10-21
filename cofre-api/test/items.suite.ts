import { describe, expect, it } from 'vitest';
import { base64url } from '../src/domain/bytes';
import { hashToken } from '../src/domain/session';
import { DONO, OUTRA } from './harness';
import type { Setup } from './suite';

const seq = (n: number, ini: number) => Uint8Array.from({ length: n }, (_, i) => (ini + i) & 255);
const b = (n: number, ini: number) => base64url(seq(n, ini));
const ORIGEM = 'https://cofre.teste.dev';
const A = '6a1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b70';
const B = '6a1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b71';
/** Um item e um manifesto selados de mentira: só o tamanho importa para o servidor. */
const ITEM = (ini: number, blocos = 1) => b(29 + 512 * blocos, ini);
const MANIFESTO = (ini: number) => b(541, ini);

/** Os itens, o manifesto e a lixeira, com o cofre aberto. */
export function itemsSuite(label: string, setup: Setup) {
  /** Um cofre criado e aberto direto no banco (o caminho até aqui já tem os testes dele). */
  async function aberto(env: Record<string, string> = {}) {
    const ctx = await setup({ COTA_LINHAS_DIA: '100000', ...env });
    const at = ctx.deps.now().toISOString();
    const blob = seq(16, 0);
    const conta = (userId: string) => ({
      sql: 'INSERT INTO cofre_contas (usuario_id, versao_cripto, kdf_m, kdf_t, kdf_p, sal, v, auth_hash, auth_pimenta, manifesto, contador, usuario_passkey, criado_em, mudado_em) VALUES (?, 1, 65536, 3, 1, ?, ?, ?, 1, ?, 0, ?, ?, ?)',
      params: [userId, blob, blob, blob, seq(541, 4), blob, at, at],
    });
    const sessao = async (userId: string, tipo: 'cofre' | 'entrada', token: string) => ({
      sql: 'INSERT INTO cofre_sessoes (hash, usuario_id, tipo, codigo, criada_em, usada_em, expira_em) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [await hashToken(token), userId, tipo, 'K7QFM2XA', at, at, new Date(ctx.deps.now().getTime() + 3_600_000).toISOString()],
    });
    const token = 'c'.repeat(43);
    await ctx.db.batch([conta(DONO.id), conta(OUTRA.id), await sessao(DONO.id, 'cofre', token), await sessao(DONO.id, 'entrada', 'e'.repeat(43)), await sessao(OUTRA.id, 'cofre', 'o'.repeat(43))]);
    const pedir = (method: string, path: string, body?: unknown, t = token, call = ctx.call) => call(method, path, body, { origin: ORIGEM, token: t });
    const gravar = (id: string, versao: number, contadorAnterior: number, ini = 10, t = token) =>
      pedir('PUT', `/api/cofre/itens/${id}`, { dados: ITEM(ini), versao, manifesto: MANIFESTO(ini + 1), contadorAnterior }, t);
    const listar = async (t = token) => (await (await pedir('GET', '/api/cofre/itens', undefined, t)).json()) as any;
    return { ...ctx, token, pedir, gravar, listar };
  }

  describe(`Itens do cofre (${label})`, () => {
    it('cofre vazio: o contador, o manifesto e nenhum item', async () => {
      const { listar } = await aberto();
      expect(await listar()).toEqual({ contador: 0, manifesto: MANIFESTO(4), itens: [] });
    });

    it('cria um item (versão 1) e o manifesto novo, e o contador sobe', async () => {
      const { gravar, listar } = await aberto();
      const res = await gravar(A, 1, 0);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ contador: 1 });
      expect(await listar()).toEqual({
        contador: 1,
        manifesto: MANIFESTO(11),
        itens: [{ id: A, versao: 1, dados: ITEM(10), mudadoEm: '2026-10-21T15:00:00.000Z', naLixeiraDesde: null }],
      });
    });

    it('mudar um item sobe a versão de 1 em 1; outra versão é recusada', async () => {
      const { gravar, listar } = await aberto();
      await gravar(A, 1, 0);
      expect(await (await gravar(A, 1, 1, 20)).json()).toMatchObject({ erro: 'versao-do-item' });
      expect(await (await gravar(A, 3, 1, 20)).json()).toMatchObject({ erro: 'versao-do-item' });
      expect(await (await gravar(B, 2, 1, 20)).json()).toMatchObject({ erro: 'versao-do-item' });
      expect((await gravar(A, 2, 1, 20)).status).toBe(200);
      expect((await listar()).itens[0]).toMatchObject({ versao: 2, dados: ITEM(20) });
    });

    it('dois aparelhos ao mesmo tempo: o segundo recebe 409 e nada dele entra', async () => {
      const { gravar, listar } = await aberto();
      expect((await gravar(A, 1, 0, 10)).status).toBe(200);
      const atrasado = await gravar(B, 1, 0, 30);
      expect(atrasado.status).toBe(409);
      expect(await atrasado.json()).toMatchObject({ erro: 'conflito', contador: 1 });
      const agora = await listar();
      expect(agora.manifesto).toBe(MANIFESTO(11));
      expect(agora.itens.map((i: any) => i.id)).toEqual([A]);
      // recarregou: com o contador de agora, entra
      expect(await (await gravar(B, 1, 1, 30)).json()).toEqual({ contador: 2 });
    });

    it('apagar põe na lixeira (a versão não muda), e dá para voltar', async () => {
      const { gravar, pedir, listar, advance } = await aberto();
      await gravar(A, 1, 0);
      advance(60_000);
      expect((await pedir('DELETE', `/api/cofre/itens/${A}`, { manifesto: MANIFESTO(50), contadorAnterior: 1 })).status).toBe(200);
      expect((await listar()).itens[0]).toMatchObject({ versao: 1, dados: ITEM(10), naLixeiraDesde: '2026-10-21T15:01:00.000Z' });
      expect(await (await pedir('DELETE', `/api/cofre/itens/${A}`, { manifesto: MANIFESTO(51), contadorAnterior: 2 })).json()).toMatchObject({ erro: 'ja-na-lixeira' });
      expect(await (await pedir('POST', `/api/cofre/itens/${A}/restaurar`, { manifesto: MANIFESTO(52), contadorAnterior: 2 })).json()).toEqual({ contador: 3 });
      expect((await listar()).itens[0].naLixeiraDesde).toBeNull();
    });

    it('mudar um item da lixeira o tira de lá', async () => {
      const { gravar, pedir, listar } = await aberto();
      await gravar(A, 1, 0);
      await pedir('DELETE', `/api/cofre/itens/${A}`, { manifesto: MANIFESTO(50), contadorAnterior: 1 });
      expect((await gravar(A, 2, 2, 60)).status).toBe(200);
      expect((await listar()).itens[0]).toMatchObject({ versao: 2, naLixeiraDesde: null });
    });

    it('a lápide (dados apagados pela limpeza): aparece sem dados, não volta, e sai de vez', async () => {
      const { gravar, pedir, listar, db } = await aberto();
      await gravar(A, 1, 0);
      await pedir('DELETE', `/api/cofre/itens/${A}`, { manifesto: MANIFESTO(50), contadorAnterior: 1 });
      // o que a limpeza diária (parte 6) faz depois de 30 dias
      await db.batch([{ sql: 'UPDATE cofre_itens SET dados = ? WHERE id = ?', params: [new Uint8Array(0), A] }]);
      expect((await listar()).itens[0]).toMatchObject({ id: A, versao: 1, dados: null });
      expect(await (await pedir('POST', `/api/cofre/itens/${A}/restaurar`, { manifesto: MANIFESTO(52), contadorAnterior: 2 })).json()).toMatchObject({ erro: 'item-apagado' });
      expect(await (await pedir('DELETE', `/api/cofre/lixeira/${A}`, { manifesto: MANIFESTO(53), contadorAnterior: 2 })).json()).toEqual({ contador: 3 });
      expect((await listar()).itens).toEqual([]);
    });

    it('apagar de vez só da lixeira', async () => {
      const { gravar, pedir, listar } = await aberto();
      await gravar(A, 1, 0);
      expect((await pedir('DELETE', `/api/cofre/lixeira/${A}`, { manifesto: MANIFESTO(53), contadorAnterior: 1 })).status).toBe(404);
      expect((await listar()).itens).toHaveLength(1);
    });

    it('apagar, voltar e apagar de vez também respondem 409 com o contador velho, sem mexer em nada', async () => {
      const { gravar, pedir, listar } = await aberto();
      await gravar(A, 1, 0);
      await gravar(B, 1, 1, 30);
      expect((await pedir('DELETE', `/api/cofre/itens/${A}`, { manifesto: MANIFESTO(50), contadorAnterior: 1 })).status).toBe(409);
      expect((await listar()).itens.every((i: any) => i.naLixeiraDesde === null)).toBe(true);
    });

    it('recusa item ou manifesto fora do tamanho da versão 1, e id que não é UUID', async () => {
      const { pedir } = await aberto();
      const put = (id: string, dados: string, manifesto = MANIFESTO(11)) => pedir('PUT', `/api/cofre/itens/${id}`, { dados, versao: 1, manifesto, contadorAnterior: 0 });
      expect(await (await put(A, ITEM(10, 33))).json()).toMatchObject({ erro: 'pedido-invalido' }); // passa de 16 kB
      expect(await (await put(A, b(29 + 500, 1))).json()).toMatchObject({ erro: 'pedido-invalido' }); // não é múltiplo de 512
      expect(await (await put(A, b(29, 1))).json()).toMatchObject({ erro: 'pedido-invalido' }); // vazio
      expect(await (await put(A, ITEM(10), b(540, 1))).json()).toMatchObject({ erro: 'pedido-invalido' });
      expect((await put('nao-e-uuid', ITEM(10))).status).toBe(404);
      expect((await put(A.toUpperCase(), ITEM(10))).status).toBe(404);
      expect(await (await pedir('PUT', `/api/cofre/itens/${A}`, { dados: ITEM(10), versao: 1, manifesto: MANIFESTO(11) })).json()).toMatchObject({ erro: 'pedido-invalido' });
    });

    it('16 kB: o maior item cabe', async () => {
      const { pedir } = await aberto();
      const maior = b(29 + 512 * 31, 1);
      expect(maior.length).toBeLessThan(16 * 1024 * 2);
      expect((await pedir('PUT', `/api/cofre/itens/${A}`, { dados: maior, versao: 1, manifesto: MANIFESTO(11), contadorAnterior: 0 })).status).toBe(200);
    });

    it('no máximo 2.000 itens, contando a lixeira', async () => {
      const { db, gravar } = await aberto();
      const at = '2026-10-21T15:00:00.000Z';
      const linhas = Array.from({ length: 2000 }, (_, i) => ({
        sql: 'INSERT INTO cofre_itens (usuario_id, id, versao, dados, mudado_em, na_lixeira_desde) VALUES (?, ?, 1, ?, ?, ?)',
        params: [DONO.id, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, seq(4, 0), at, i % 2 ? at : null],
      }));
      for (let i = 0; i < linhas.length; i += 100) await db.batch(linhas.slice(i, i + 100));
      expect(await (await gravar(A, 1, 0)).json()).toMatchObject({ erro: 'cofre-cheio' });
    });

    it('só com o cofre aberto, e só os itens da própria conta', async () => {
      const { pedir, gravar, listar } = await aberto();
      expect((await pedir('GET', '/api/cofre/itens', undefined, 'e'.repeat(43))).status).toBe(401);
      expect((await pedir('GET', '/api/cofre/itens', undefined, 'x'.repeat(43))).status).toBe(401);
      await gravar(A, 1, 0);
      // a outra conta não vê o item, e o mesmo id na conta dela é outro item
      expect((await listar('o'.repeat(43))).itens).toEqual([]);
      expect((await gravar(A, 1, 0, 70, 'o'.repeat(43))).status).toBe(200);
      expect((await listar()).itens[0].dados).toBe(ITEM(10));
    });

    it('sem cota hoje: nada é gravado', async () => {
      const { gravar, listar } = await aberto({ COTA_LINHAS_DIA: '5' });
      expect(await (await gravar(A, 1, 0)).json()).toMatchObject({ erro: 'cota-diaria' });
      expect(await listar()).toMatchObject({ contador: 0, itens: [] });
    });

    it('no modo só leitura, dá para ler, não para gravar', async () => {
      const { withEnv, pedir } = await aberto();
      const leitura = withEnv({ MODO: 'so-leitura' });
      expect((await pedir('GET', '/api/cofre/itens', undefined, undefined, leitura)).status).toBe(200);
      expect(await (await pedir('PUT', `/api/cofre/itens/${A}`, { dados: ITEM(10), versao: 1, manifesto: MANIFESTO(11), contadorAnterior: 0 }, undefined, leitura)).json()).toMatchObject({ erro: 'cofre-so-leitura' });
    });

    it('corpo grande demais: 413', async () => {
      const { pedir } = await aberto();
      const res = await pedir('PUT', `/api/cofre/itens/${A}`, { dados: 'a'.repeat(300 * 1024), versao: 1, manifesto: MANIFESTO(11), contadorAnterior: 0 });
      expect(res.status).toBe(413);
    });
  });
}
