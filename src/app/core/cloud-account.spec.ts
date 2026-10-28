import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_KEY, CloudAccount, CloudError, SESSION_KEY, cleanName, deviceLabel, eraseDayLabel } from './cloud-account';
import { Cloud } from './cloud-config';
import { Settings } from './settings';
import { saveKeys } from './erase-save';

const TOKEN = 'A'.repeat(43);
const API = 'https://api.teste';

/** Um `fetch` falso: cada chamada responde com o que estiver na fila e fica anotada. */
function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  spyOn(window, 'fetch').and.callFake(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error(`chamada inesperada: ${String(url)}`);
    if (next instanceof Error) throw next;
    return next;
  });
  return calls;
}

/** Deixa terminar a conferência da sessão que a conta faz ao abrir. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('conta na nuvem', () => {
  let settings: Settings;

  function setup(): CloudAccount {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: API, googleClientId: 'x.apps.googleusercontent.com' }) } },
      ],
    });
    settings = TestBed.inject(Settings);
    return TestBed.inject(CloudAccount);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('entra com o credential do Google, manda o "Seu nome" e guarda a sessão', async () => {
    const account = setup();
    settings.ownerName.set('  Igor  ');
    const calls = fakeFetch(json({ token: TOKEN, conta: { codigo: 'K7QF-M2XA', nome: 'Igor', nova: true } }));
    expect(await account.signIn('jwt-do-google')).toEqual({ nova: true });
    expect(calls[0].url).toBe(`${API}/v1/auth/google`);
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.credential).toBe('jwt-do-google');
    expect(body.nome).toBe('Igor');
    expect(account.signedIn()).toBeTrue();
    expect(account.account()).toEqual({ codigo: 'K7QF-M2XA', nome: 'Igor' });
    expect(localStorage.getItem(SESSION_KEY)).toBe(TOKEN);
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY)!)).toEqual({ codigo: 'K7QF-M2XA', nome: 'Igor' });
  });

  it('numa conta que já existia, o nome dela passa a ser o "Seu nome"', async () => {
    const account = setup();
    settings.ownerName.set('');
    fakeFetch(json({ token: TOKEN, conta: { codigo: 'K7QF-M2XA', nome: 'Igor Soler', nova: false } }));
    await account.signIn('jwt');
    expect(settings.ownerName()).toBe('Igor Soler');
  });

  it('usa o token nas chamadas seguintes', async () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'K7QF-M2XA', nome: 'Igor' }));
    const calls = fakeFetch(json({ codigo: 'K7QF-M2XA', nome: 'Igor', seguidores: 0, seguindo: 0 }), json({ codigo: 'K7QF-M2XA', nome: 'Igor' }));
    const account = setup();
    await settle();
    await account.refresh();
    expect((calls.at(-1)!.init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('o /v1/eu diz se a conta pode usar o cofre; fica guardado com a conta e some quando deixa de poder', async () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'G11T-G00D', nome: 'Igor' }));
    fakeFetch(json({ codigo: 'G11T-G00D', nome: 'Igor', cofre: true }), json({ codigo: 'G11T-G00D', nome: 'Igor', cofre: true }), json({ codigo: 'G11T-G00D', nome: 'Igor', cofre: false }));
    const account = setup();
    await settle();
    await account.refresh();
    expect(account.account()?.cofre).toBeTrue();
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY)!).cofre).toBeTrue();
    await account.refresh();
    expect(account.account()?.cofre).toBeUndefined();
  });

  it('o /v1/eu diz se a conta pode usar a API das AIs (a parte Acessos)', async () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'G11T-G00D', nome: 'Igor' }));
    fakeFetch(json({ codigo: 'G11T-G00D', nome: 'Igor', api: true }), json({ codigo: 'G11T-G00D', nome: 'Igor', api: true }), json({ codigo: 'G11T-G00D', nome: 'Igor', api: false }));
    const account = setup();
    await settle();
    await account.refresh();
    expect(account.account()?.api).toBeTrue();
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY)!).api).toBeTrue();
    await account.refresh();
    expect(account.account()?.api).toBeUndefined();
  });

  for (const keys of [false, true]) {
    it(`sair de todos ${keys ? 'pede' : 'não pede'} para cortar as chaves de API`, async () => {
      localStorage.setItem(SESSION_KEY, TOKEN);
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'K7QF-M2XA', nome: 'Igor' }));
      const calls = fakeFetch(json({ codigo: 'K7QF-M2XA', nome: 'Igor' }), json({ ok: true }));
      const account = setup();
      await settle();
      await account.signOutEverywhere(keys);
      expect(calls[1].url).toBe(`${API}/v1/auth/sair-de-todos`);
      expect(calls[1].init.body === undefined ? undefined : JSON.parse(calls[1].init.body as string)).toEqual(keys ? { chaves: true } : undefined);
      expect(account.signedIn()).toBeFalse();
    });
  }

  it('sessão recusada pela nuvem (401) sai da conta neste navegador', async () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'K7QF-M2XA', nome: 'Igor' }));
    const expired = () => json({ erro: 'sessao-invalida', mensagem: 'Sua sessão acabou.' }, 401);
    fakeFetch(expired(), expired());
    const account = setup();
    await settle();
    await expectAsync(account.refresh()).toBeRejectedWith(jasmine.any(CloudError));
    expect(account.signedIn()).toBeFalse();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('ao entrar, o resto da conta (o cofre, a marca de apagar) vem do /v1/eu sem precisar recarregar', async () => {
    const account = setup();
    const at = '2026-10-30T15:00:00.000Z';
    const calls = fakeFetch(
      json({ token: TOKEN, conta: { id: 'conta-igor', codigo: 'K7QF-M2XA', nome: 'Igor', nova: false } }),
      json({ id: 'conta-igor', codigo: 'K7QF-M2XA', nome: 'Igor', cofre: true, apagarEm: at }),
    );
    await account.signIn('jwt');
    for (let i = 0; i < 50 && !account.account()?.apagarEm; i++) await settle();
    expect(calls[1].url).toBe(`${API}/v1/eu`);
    expect(account.account()).toEqual({ id: 'conta-igor', codigo: 'K7QF-M2XA', nome: 'Igor', cofre: true, apagarEm: at });
  });

  /** Um `fetch` que só responde quando o teste manda (`answer`), na ordem das chamadas. */
  function heldFetch() {
    const waiting: ((r: Response) => void)[] = [];
    const calls: RequestInit[] = [];
    spyOn(window, 'fetch').and.callFake((_url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Promise<Response>((resolve) => waiting.push(resolve));
    });
    let next = 0;
    /** Responde a chamada `at` (sem ele, a próxima na ordem). */
    const answer = async (r: Response, at = next++) => {
      for (let i = 0; i < 50 && waiting.length <= at; i++) await settle();
      waiting[at]!(r);
    };
    return { calls, answer };
  }

  it('o 401 atrasado de um pedido feito antes de entrar não derruba a sessão que acabou de entrar', async () => {
    const account = setup();
    const net = heldFetch();
    // um pedido sem sessão, que a nuvem vai recusar
    const before = account.request('/v1/eu').catch((e: unknown) => e);
    const signing = account.signIn('jwt');
    await net.answer(json({ token: TOKEN, conta: { id: 'conta-igor', codigo: 'K7QF-M2XA', nome: 'Igor', nova: false } }), 1);
    await signing;
    await net.answer(json({ erro: 'sessao-invalida', mensagem: 'Sua sessão acabou.' }, 401), 0);
    // na ordem trocada: a resposta do pedido de antes chega depois de entrar
    expect(await before).toBeInstanceOf(CloudError);
    expect(account.signedIn()).toBeTrue();
    expect(localStorage.getItem(SESSION_KEY)).toBe(TOKEN);
  });

  it('o /v1/eu que chega depois de sair não põe a conta de volta no navegador', async () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: 'conta-igor', codigo: 'K7QF-M2XA', nome: 'Igor' }));
    const net = heldFetch();
    const account = setup();
    await settle();
    // a conferência de ao abrir está no ar quando a sessão sai daqui
    account.forget();
    await net.answer(json({ id: 'conta-igor', codigo: 'K7QF-M2XA', nome: 'Igor', cofre: true }));
    for (let i = 0; i < 5; i++) await settle();
    expect(account.account()).toBeNull();
    expect(localStorage.getItem(ACCOUNT_KEY)).toBeNull();
  });

  it('apagar marca a conta mesmo se a sessão daqui caiu no meio (não diz que apagou)', async () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: 'conta-igor', codigo: 'K7QF-M2XA', nome: 'Igor', cofre: true }));
    const net = heldFetch();
    const account = setup();
    await settle();
    await net.answer(json({ id: 'conta-igor', codigo: 'K7QF-M2XA', nome: 'Igor', cofre: true }));
    const deleting = account.deleteAccount('login-do-google');
    account.forget();
    await net.answer(json({ ok: true, apagarEm: '2026-10-30T15:00:00.000Z' }, 202));
    expect(await deleting).toBe('2026-10-30T15:00:00.000Z');
  });

  it('sair sem internet tira a sessão daqui do mesmo jeito', async () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'K7QF-M2XA', nome: 'Igor' }));
    fakeFetch(new Error('offline'), new Error('offline'));
    const account = setup();
    await settle();
    await account.signOut();
    expect(account.signedIn()).toBeFalse();
  });

  it('erro da nuvem chega com a mensagem dela; sem rede, uma mensagem própria', async () => {
    const account = setup();
    fakeFetch(json({ erro: 'login-invalido', mensagem: 'Não consegui confirmar o login.' }, 401), new Error('offline'));
    await expectAsync(account.signIn('x')).toBeRejectedWithError(CloudError, 'Não consegui confirmar o login.');
    await expectAsync(account.signIn('x')).toBeRejectedWithError(CloudError, /Sem conexão com a nuvem/);
    expect(account.signedIn()).toBeFalse();
  });

  it('escolher o código: vai num PUT e passa a ser o da conta; se já tem dono, a conta fica como estava', async () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'K7QF-M2XA', nome: 'Igor' }));
    const calls = fakeFetch(
      json({ codigo: 'K7QF-M2XA', nome: 'Igor' }),
      json({ codigo: 'ABCD-1234' }),
      json({ erro: 'codigo-em-uso', mensagem: 'Esse código já é de outra pessoa. Escolha outro.' }, 409),
    );
    const account = setup();
    await settle();
    expect(await account.chooseCode('ABCD-1234')).toBe('ABCD-1234');
    expect(calls[1].url).toBe(`${API}/v1/eu/codigo`);
    expect(calls[1].init.method).toBe('PUT');
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ codigo: 'ABCD-1234' });
    expect(account.account()?.codigo).toBe('ABCD-1234');
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY)!).codigo).toBe('ABCD-1234');

    const refused = await account.chooseCode('S011-1234').catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(CloudError);
    expect((refused as CloudError).code).toBe('codigo-em-uso');
    expect(account.account()?.codigo).toBe('ABCD-1234');
  });

  it('uma nuvem antiga, que apaga a conta na hora: sai dela neste navegador', async () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'K7QF-M2XA', nome: 'Igor' }));
    const calls = fakeFetch(json({ codigo: 'K7QF-M2XA', nome: 'Igor' }), json({ ok: true }));
    const account = setup();
    await settle();
    await account.deleteAccount('login-do-google');
    expect(calls.at(-1)!.init.method).toBe('DELETE');
    expect(account.signedIn()).toBeFalse();
  });

  it('apagar leva o login do Google e só marca a conta: a sessão fica, com a data, e cancelar desmarca', async () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'K7QF-M2XA', nome: 'Igor' }));
    const at = '2026-10-30T15:00:00.000Z';
    const calls = fakeFetch(json({ codigo: 'K7QF-M2XA', nome: 'Igor' }), json({ ok: true, apagarEm: at }, 202), json({ ok: true }));
    const account = setup();
    await settle();
    expect(await account.deleteAccount('login-do-google')).toBe(at);
    expect(calls.at(-1)!.url).toBe(`${API}/v1/eu`);
    expect(calls.at(-1)!.init.method).toBe('DELETE');
    // só a sessão daqui não basta: o login do Google de agora vai no corpo
    expect(JSON.parse(calls.at(-1)!.init.body as string)).toEqual({ credential: 'login-do-google' });
    expect(account.signedIn()).toBeTrue();
    expect(account.account()?.apagarEm).toBe(at);
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY)!).apagarEm).toBe(at);
    await account.cancelDelete();
    expect(calls.at(-1)!.url).toBe(`${API}/v1/eu/cancelar-apagar`);
    expect(calls.at(-1)!.init.method).toBe('POST');
    expect(account.account()).toEqual({ codigo: 'K7QF-M2XA', nome: 'Igor' });
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY)!)).not.toEqual(jasmine.objectContaining({ apagarEm: jasmine.anything() }));
  });

  it('a marca de apagar vem do /v1/eu (aberto em outro aparelho) e some quando a nuvem tira', async () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'K7QF-M2XA', nome: 'Igor' }));
    fakeFetch(json({ codigo: 'K7QF-M2XA', nome: 'Igor', apagarEm: '2026-10-30T15:00:00.000Z' }), json({ codigo: 'K7QF-M2XA', nome: 'Igor' }));
    const account = setup();
    // a conferência de ao abrir termina sozinha, em algumas voltas
    for (let i = 0; i < 50 && !account.account()?.apagarEm; i++) await settle();
    expect(account.account()?.apagarEm).toBe('2026-10-30T15:00:00.000Z');
    await account.refresh();
    expect(account.account()?.apagarEm).toBeUndefined();
  });

  it('o dia do aviso: "30 de outubro"', () => {
    expect(eraseDayLabel(new Date(2026, 9, 30, 12).toISOString())).toBe('30 de outubro');
    expect(eraseDayLabel('lixo')).toBe('daqui a 7 dias');
  });

  it('"Apagar o save" não tira o login', () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, '{}');
    localStorage.setItem('meu-mural:dados', 'x');
    expect(saveKeys(localStorage)).toEqual(['meu-mural:dados']);
  });

  it('limpa o nome como a nuvem e reconhece o aparelho', () => {
    expect(cleanName('  Igor \n Soler​ ')).toBe('Igor Soler');
    expect(cleanName('   ')).toBeNull();
    // o tab e a quebra entre as palavras viram espaço, não juntam o nome (o mesmo na nuvem)
    expect(cleanName('Ana\tMaria')).toBe('Ana Maria');
    expect(cleanName('Ana\nMaria Souza')).toBe('Ana Maria Souza');
    expect(cleanName('Ana ​ Maria')).toBe('Ana Maria');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36')).toBe('Chrome no Windows');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1')).toBe('Safari no iPhone');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0')).toBe('Edge no Windows');
  });
});
