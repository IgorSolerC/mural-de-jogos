import { ACCOUNT_KEY, SESSION_KEY } from './cloud-account';
import { BEFORE_CLOUD_DB, readBeforeCloud, saveBeforeCloud } from './cloud-before';
import { COVERS_CACHE, OWNER_KEY, RESET_KEY, resetOnBoot, takeReset, watchOtherTabs, wipeBrowser } from './browser-reset';
import { DATA_DB } from './local-data';

function databases(): Promise<string[]> {
  return indexedDB.databases().then((list) => list.map((d) => d.name ?? ''));
}

function openDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('chaves');
    r.onsuccess = () => {
      r.result.close();
      resolve();
    };
    r.onerror = () => reject(r.error);
  });
}

describe('limpar o navegador (sair da conta)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await wipeBrowser();
  });

  /** O que um navegador com conta guarda: o login, o dono, os dados e uma preferência. */
  function signedInBrowser(): void {
    localStorage.setItem(SESSION_KEY, 'A'.repeat(43));
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: 'conta-ela', codigo: 'TMY1-BJMW', nome: 'Ela' }));
    localStorage.setItem(OWNER_KEY, 'conta-ela');
    localStorage.setItem('meu-mural:gastos:v1', '{"entries":[]}');
    localStorage.setItem('meu-mural:calendario:v1', '{"reminders":[]}');
    localStorage.setItem('mural-de-jogos:resenhas:v1', '[]');
    localStorage.setItem('mural-de-jogos:config:v1', '{}');
    localStorage.setItem('meu-mural:volume', '0.5');
    localStorage.setItem('outro-site:coisa', 'fica');
  }

  it('sem pedido e com a sessão do dono: não mexe em nada', async () => {
    signedInBrowser();
    expect(await resetOnBoot()).toBeFalse();
    expect(localStorage.getItem('meu-mural:gastos:v1')).not.toBeNull();
    expect(takeReset()).toBeNull();
  });

  it('o pedido de sair limpa tudo do mural (os dados, os ajustes, as preferências, os bancos), menos o que é de outro site', async () => {
    signedInBrowser();
    await openDb(DATA_DB);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
    localStorage.setItem(RESET_KEY, JSON.stringify({ keep: [], motivo: 'saiu' }));
    expect(await resetOnBoot()).toBeTrue();
    const left = Object.keys(localStorage);
    expect(left).toEqual(['outro-site:coisa']);
    expect(await databases()).not.toContain(DATA_DB);
    expect(takeReset()).toBe('saiu');
    expect(takeReset()).toBeNull();
  });

  it('o mural de uma conta sem a sessão dela (o site de antes deixava ficar ao sair) é limpo ao abrir', async () => {
    signedInBrowser();
    localStorage.removeItem(SESSION_KEY);
    expect(await resetOnBoot()).toBeTrue();
    expect(localStorage.getItem('meu-mural:gastos:v1')).toBeNull();
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    expect(localStorage.getItem(ACCOUNT_KEY)).toBeNull();
  });

  it('o mural de ninguém, sem conta, fica', async () => {
    localStorage.setItem('meu-mural:gastos:v1', '{"entries":[]}');
    expect(await resetOnBoot()).toBeFalse();
    expect(localStorage.getItem('meu-mural:gastos:v1')).not.toBeNull();
  });

  it('entrando numa conta com o mural de outra aqui: limpa tudo menos a sessão de quem entra', async () => {
    signedInBrowser();
    localStorage.setItem(RESET_KEY, JSON.stringify({ keep: ['sessao'], motivo: 'entrou' }));
    expect(await resetOnBoot()).toBeTrue();
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
    expect(localStorage.getItem(ACCOUNT_KEY)).not.toBeNull();
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    expect(localStorage.getItem('meu-mural:gastos:v1')).toBeNull();
    expect(localStorage.getItem(RESET_KEY)).toBeNull();
    expect(takeReset()).toBe('entrou');
  });

  it('"Só o da conta" deixa a cópia de antes da nuvem; sair leva ela junto', async () => {
    await saveBeforeCloud(new Blob(['{}']));
    localStorage.setItem(SESSION_KEY, 'A'.repeat(43));
    localStorage.setItem(RESET_KEY, JSON.stringify({ keep: ['sessao', 'copia'], motivo: 'entrou' }));
    await resetOnBoot();
    expect(await readBeforeCloud()).not.toBeNull();
    localStorage.setItem(RESET_KEY, JSON.stringify({ keep: [], motivo: 'saiu' }));
    await resetOnBoot();
    expect(await databases()).not.toContain(BEFORE_CLOUD_DB);
  });

  it('as preferências dos Gastos (sem os fixos, os gráficos) saem junto', async () => {
    signedInBrowser();
    localStorage.setItem('meu-mural:gastos-sem-fixos:v1', '1');
    localStorage.setItem('meu-mural:gastos-graficos:v1', '1');
    localStorage.removeItem(SESSION_KEY);
    localStorage.setItem(RESET_KEY, JSON.stringify({ keep: [], motivo: 'saiu' }));
    expect(await resetOnBoot()).toBeTrue();
    expect(localStorage.getItem('meu-mural:gastos-sem-fixos:v1')).toBeNull();
    expect(localStorage.getItem('meu-mural:gastos-graficos:v1')).toBeNull();
  });

  it('as capas guardadas saem junto', async () => {
    const cache = await caches.open(COVERS_CACHE);
    await cache.put('https://exemplo.test/capa.jpg', new Response('x'));
    localStorage.setItem(RESET_KEY, JSON.stringify({ keep: [], motivo: 'saiu' }));
    await resetOnBoot();
    expect(await caches.has(COVERS_CACHE)).toBeFalse();
  });

  it('um pedido estragado limpa tudo (na dúvida, nada da conta fica)', async () => {
    signedInBrowser();
    localStorage.setItem(RESET_KEY, 'não é json');
    expect(await resetOnBoot()).toBeTrue();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem('meu-mural:gastos:v1')).toBeNull();
  });

  it('outra aba pediu a limpeza: esta para de gravar e recarrega', () => {
    const freeze = jasmine.createSpy('freeze');
    const reload = jasmine.createSpy('reload');
    const stop = watchOtherTabs(reload, freeze);
    window.dispatchEvent(new StorageEvent('storage', { key: 'meu-mural:gastos:v1', newValue: '{}' }));
    expect(reload).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: RESET_KEY, newValue: '{"keep":[],"motivo":"saiu"}' }));
    expect(freeze).toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
    // a própria limpeza tira o pedido: não recarrega de novo
    window.dispatchEvent(new StorageEvent('storage', { key: RESET_KEY, newValue: null }));
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
  });
});
