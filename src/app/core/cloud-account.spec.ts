import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_KEY, CloudAccount, CloudError, SESSION_KEY, cleanName, deviceLabel } from './cloud-account';
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

  it('apagar a conta sai dela neste navegador', async () => {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'K7QF-M2XA', nome: 'Igor' }));
    const calls = fakeFetch(json({ codigo: 'K7QF-M2XA', nome: 'Igor' }), json({ ok: true }));
    const account = setup();
    await settle();
    await account.deleteAccount();
    expect(calls.at(-1)!.init.method).toBe('DELETE');
    expect(account.signedIn()).toBeFalse();
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
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36')).toBe('Chrome no Windows');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1')).toBe('Safari no iPhone');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0')).toBe('Edge no Windows');
  });
});
