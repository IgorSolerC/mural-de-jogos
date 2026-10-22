import { ApiCofre, ErroApi } from './api';

/** Um fetch de mentira que anota cada pedido e responde o que o teste mandar. */
function fetchDeMentira(resposta: () => Response | Promise<Response>) {
  const pedidos: { url: string; init: RequestInit }[] = [];
  const buscar = (async (url: RequestInfo | URL, init?: RequestInit) => {
    pedidos.push({ url: String(url), init: init ?? {} });
    return resposta();
  }) as typeof fetch;
  return { pedidos, buscar };
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

async function falhaCom(promessa: Promise<unknown>): Promise<ErroApi> {
  try {
    await promessa;
  } catch (e) {
    expect(e).toBeInstanceOf(ErroApi);
    return e as ErroApi;
  }
  throw new Error('esperava um ErroApi');
}

describe('a conversa com a API do cofre', () => {
  it('pede na mesma origem, sem cookie, sem cache, sem seguir redirecionamento e sem referência', async () => {
    const { pedidos, buscar } = fetchDeMentira(() => json({ existe: false, congeladoAte: null, aparelhos: 0 }));
    const api = new ApiCofre(buscar);
    expect(await api.estado()).toEqual({ existe: false, congeladoAte: null, aparelhos: 0 });
    expect(pedidos[0]!.url).toBe('/api/cofre');
    expect(pedidos[0]!.init).toEqual(
      jasmine.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', body: undefined }),
    );
    expect(pedidos[0]!.init.headers).toEqual({});
  });

  it('entrar guarda o token só na memória e passa a mandá-lo', async () => {
    const entrada = { token: 'a'.repeat(43), expiraEm: '2026-10-21T15:05:00.000Z', usuario: '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', codigo: 'K7QFM2XA' };
    const { pedidos, buscar } = fetchDeMentira(() => json(entrada));
    const api = new ApiCofre(buscar);
    expect(api.temSessao).toBe(false);
    expect(await api.entrar('codigo-do-google', 'verificador', 'Chrome no Windows')).toEqual(entrada);
    expect(JSON.parse(pedidos[0]!.init.body as string)).toEqual({ codigo: 'codigo-do-google', verificador: 'verificador', aparelho: 'Chrome no Windows' });
    expect(pedidos[0]!.init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(api.temSessao).toBe(true);
    await api.desafioDeRegistro();
    expect(pedidos[1]!.init.headers).toEqual({ Authorization: `Bearer ${'a'.repeat(43)}`, 'Content-Type': 'application/json' });
    api.usarToken(null);
    await api.estado();
    expect(pedidos[2]!.init.headers).toEqual({});
  });

  it('congelar: o servidor tranca tudo, e a página esquece o token', async () => {
    const { pedidos, buscar } = fetchDeMentira(() => json({ congeladoAte: '2026-10-23T18:00:00.000Z' }));
    const api = new ApiCofre(buscar);
    api.usarToken('a'.repeat(43));
    expect(await api.congelar()).toEqual({ congeladoAte: '2026-10-23T18:00:00.000Z' });
    expect([pedidos[0]!.url, pedidos[0]!.init.method]).toEqual(['/api/cofre/congelar', 'POST']);
    expect(api.temSessao).toBe(false);
  });

  it('o erro da API vira ErroApi com o código e a mensagem dela', async () => {
    const { buscar } = fetchDeMentira(() => json({ erro: 'cofre-existe', mensagem: 'Esta conta já tem um cofre.' }, 409));
    const erro = await falhaCom(new ApiCofre(buscar).criarCofre({}));
    expect([erro.status, erro.codigo, erro.message]).toEqual([409, 'cofre-existe', 'Esta conta já tem um cofre.']);
  });

  it('uma resposta que não é da API (a Cloudflare fora) e a falta de rede viram mensagens simples', async () => {
    const html = await falhaCom(new ApiCofre(fetchDeMentira(() => new Response('<html>502</html>', { status: 502 })).buscar).estado());
    expect([html.status, html.codigo]).toEqual([502, 'resposta-estranha']);
    expect(html.message).toContain('não respondeu');
    const semRede = await falhaCom(
      new ApiCofre((() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch).estado(),
    );
    expect([semRede.status, semRede.codigo]).toEqual([0, 'sem-rede']);
    const semCampos = await falhaCom(new ApiCofre(fetchDeMentira(() => json({ x: 1 }, 500)).buscar).estado());
    expect([semCampos.codigo, semCampos.message]).toEqual(['erro', html.message]);
  });

  it('só pede caminhos da API do cofre', async () => {
    const { pedidos, buscar } = fetchDeMentira(() => json({}));
    await expectAsync(new ApiCofre(buscar).pedir('GET', 'https://outro.site/api/x')).toBeRejectedWithError(/fora da API/);
    await expectAsync(new ApiCofre(buscar).pedir('GET', '/outra-coisa')).toBeRejectedWithError(/fora da API/);
    expect(pedidos).toEqual([]);
  });
});
