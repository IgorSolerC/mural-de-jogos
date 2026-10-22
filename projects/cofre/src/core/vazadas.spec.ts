import { conferirVazadas, lerFaixa, sha1 } from './vazadas';

describe('o aviso de senha vazada', () => {
  it('o SHA-1 no formato da base (o de "password" é conhecido)', async () => {
    expect(await sha1('password')).toBe('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  });

  it('lê a faixa e ignora as linhas de preenchimento (0 vezes) e as estranhas', () => {
    const f = lerFaixa('1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n00000000000000000000000000000000000:0\nlixo\nABC:5');
    expect([...f]).toEqual([['1E4C9B93F3F0682250B6CF8331B7EE68FD8', 3861493]]);
  });

  it('só os 5 primeiros caracteres saem, com o preenchimento; o resto é conferido aqui', async () => {
    const pedidos: { url: string; init: RequestInit }[] = [];
    const buscar = (async (url: RequestInfo | URL, init?: RequestInit) => {
      pedidos.push({ url: String(url), init: init ?? {} });
      return new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\n', { status: 200 });
    }) as typeof fetch;
    const resultado = await conferirVazadas(['password', 'password', ''], buscar);
    expect(resultado).toEqual([3861493, 3861493, 0]);
    // a mesma faixa, um pedido só; e nunca a senha nem o hash inteiro
    expect(pedidos.length).toBe(1);
    expect(pedidos[0]!.url).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(pedidos[0]!.init.headers).toEqual({ 'Add-Padding': 'true' });
    expect(pedidos[0]!.init.credentials).toBe('omit');
  });

  it('sem rede ou com a base fora: null (não avisa nada), sem quebrar', async () => {
    expect(await conferirVazadas(['abc'], (() => Promise.reject(new TypeError('offline'))) as typeof fetch)).toEqual([null]);
    expect(await conferirVazadas(['abc'], (async () => new Response('', { status: 503 })) as typeof fetch)).toEqual([null]);
  });
});
