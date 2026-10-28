import { ACCOUNT_KEY, SESSION_KEY } from './cloud-account';
import { BEFORE_CLOUD_DB, readBeforeCloud, saveBeforeCloud } from './cloud-before';
import { BrowserReset, COVERS_CACHE, OWNER_KEY, RESET_KEY, resetOnBoot, takeReset, watchOtherTabs, wipeBrowser } from './browser-reset';
import { DATA_DB } from './local-data';
import { APPLIED_KEY } from './api-requests';
import { freezeStorage, thawStorage, writeJson, writeText } from './storage';

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

  it('o mural de uma conta com a sessão mas sem a conta guardada (não coube ao entrar) é limpo ao abrir', async () => {
    signedInBrowser();
    localStorage.removeItem(ACCOUNT_KEY);
    expect(await resetOnBoot()).toBeTrue();
    expect(localStorage.getItem('meu-mural:gastos:v1')).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
  });

  it('o mural de uma conta com a sessão estragada é limpo ao abrir (o app abriria fora da conta)', async () => {
    signedInBrowser();
    localStorage.setItem(SESSION_KEY, 'estragada');
    expect(await resetOnBoot()).toBeTrue();
    expect(localStorage.getItem('meu-mural:calendario:v1')).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('a sessão de outra conta por cima do mural desta (entrou noutra aba, que fechou antes de sincronizar): o mural sai, a sessão fica', async () => {
    signedInBrowser();
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: 'conta-outra', codigo: 'K7QF-M2XA', nome: 'Outra' }));
    expect(await resetOnBoot()).toBeTrue();
    expect(localStorage.getItem('meu-mural:gastos:v1')).toBeNull();
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY)!).id).toBe('conta-outra');
    expect(takeReset()).toBe('entrou');
  });

  it('a conta guardada sem o id (de antes dele) não é tomada por outra: não mexe em nada', async () => {
    signedInBrowser();
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ codigo: 'TMY1-BJMW', nome: 'Ela' }));
    expect(await resetOnBoot()).toBeFalse();
    expect(localStorage.getItem('meu-mural:gastos:v1')).not.toBeNull();
  });

  it('ler a cópia de antes da nuvem depois da limpeza não traz o banco de volta', async () => {
    await wipeBrowser();
    expect(await readBeforeCloud()).toBeNull();
    expect(await databases()).not.toContain(BEFORE_CLOUD_DB);
    // e com a página recarregando para limpar, nem abre
    expect(await saveBeforeCloud(new Blob(['{}']))).toBeTrue();
    freezeStorage();
    try {
      expect(await readBeforeCloud()).toBeNull();
    } finally {
      thawStorage();
    }
  });

  it('o que o mural guardou na sessão da aba sai junto; o de outro site fica', async () => {
    sessionStorage.setItem('meu-mural:coisa-da-aba', '1');
    sessionStorage.setItem('mural-de-jogos:coisa-antiga', '1');
    sessionStorage.setItem('outro-site:coisa', 'fica');
    localStorage.setItem(RESET_KEY, JSON.stringify({ keep: [], motivo: 'saiu' }));
    expect(await resetOnBoot()).toBeTrue();
    expect(sessionStorage.getItem('meu-mural:coisa-da-aba')).toBeNull();
    expect(sessionStorage.getItem('mural-de-jogos:coisa-antiga')).toBeNull();
    expect(sessionStorage.getItem('outro-site:coisa')).toBe('fica');
    // o aviso de que limpou é gravado depois da limpeza
    expect(takeReset()).toBe('saiu');
  });

  it('enquanto a página recarrega para limpar, nada grava: nem as chaves, nem a cópia de antes da nuvem', async () => {
    // (um teste de outro arquivo, rodado antes na ordem aleatória, pode ter deixado o banco)
    await wipeBrowser();
    freezeStorage();
    try {
      writeText('meu-mural:lembrete-conta', 'x');
      writeJson('mural-de-jogos:chaves-do-site:v1', { rawg: true });
      expect(await saveBeforeCloud(new Blob(['{}']))).toBeFalse();
    } finally {
      thawStorage();
    }
    expect(localStorage.getItem('meu-mural:lembrete-conta')).toBeNull();
    expect(localStorage.getItem('mural-de-jogos:chaves-do-site:v1')).toBeNull();
    expect(await databases()).not.toContain(BEFORE_CLOUD_DB);
  });

  it('a sessão que acabou antes de escolher o que fazer com o mural de ninguém: sai tudo, o de ninguém e o que a conta trouxe', async () => {
    // entrou, a pergunta "Levar o mural para a conta?" ficou sem resposta (sem dono), e a conta já trouxe coisas dela
    localStorage.setItem(SESSION_KEY, 'A'.repeat(43));
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: 'conta-ela', codigo: 'TMY1-BJMW', nome: 'Ela' }));
    localStorage.setItem('mural-de-jogos:resenhas:v1', '[]');
    localStorage.setItem('meu-mural:gastos:v1', '{"entries":[]}');
    localStorage.setItem('meu-mural:agenda-google:v1', '{"conta":"conta-ela"}');
    localStorage.setItem('outro-site:coisa', 'fica');
    await openDb(DATA_DB);
    // a sessão acabou (401): a conta sai daqui, e a limpeza é pedida como no Sair
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
    const reset = new BrowserReset();
    reset.freeze = () => undefined;
    reset.reload = () => undefined;
    reset.request('saiu');
    expect(await resetOnBoot()).toBeTrue();
    expect(Object.keys(localStorage)).toEqual(['outro-site:coisa']);
    expect(await databases()).not.toContain(DATA_DB);
    expect(takeReset()).toBe('saiu');
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

  it('as preferências dos Gastos (sem os fixos, e os gráficos de uma versão de antes) saem junto', async () => {
    signedInBrowser();
    localStorage.setItem('meu-mural:gastos-sem-fixos:v1', '1');
    localStorage.setItem('meu-mural:gastos-graficos:v1', '1');
    localStorage.removeItem(SESSION_KEY);
    localStorage.setItem(RESET_KEY, JSON.stringify({ keep: [], motivo: 'saiu' }));
    expect(await resetOnBoot()).toBeTrue();
    expect(localStorage.getItem('meu-mural:gastos-sem-fixos:v1')).toBeNull();
    expect(localStorage.getItem('meu-mural:gastos-graficos:v1')).toBeNull();
  });

  it('os pedidos da API aplicados aqui e ainda não concluídos saem junto (o banco e a cópia)', async () => {
    signedInBrowser();
    await openDb(DATA_DB);
    localStorage.setItem(APPLIED_KEY, JSON.stringify({ conta: 'conta-ela', itens: [{ id: 'pd_aaaaaaaaaaaaaaaa' }] }));
    localStorage.removeItem(SESSION_KEY);
    localStorage.setItem(RESET_KEY, JSON.stringify({ keep: [], motivo: 'saiu' }));
    expect(await resetOnBoot()).toBeTrue();
    expect(localStorage.getItem(APPLIED_KEY)).toBeNull();
    expect(await databases()).not.toContain(DATA_DB);
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

  it('sem espaço nem para o pedido (armazenamento cheio): limpa antes de recarregar, e o pedido vai depois', async () => {
    signedInBrowser();
    await openDb(DATA_DB);
    // o dono não chegou a ser gravado: sem a limpeza daqui, a subida deixaria o mural como de ninguém
    localStorage.removeItem(OWNER_KEY);
    const setItem = Storage.prototype.setItem;
    let full = true;
    spyOn(Storage.prototype, 'setItem').and.callFake(function (this: Storage, key: string, value: string) {
      if (full && key === RESET_KEY) {
        full = false;
        throw new DOMException('cheio', 'QuotaExceededError');
      }
      setItem.call(this, key, value);
    });
    const reset = new BrowserReset();
    const freeze = jasmine.createSpy('freeze');
    const reloaded = new Promise<void>((resolve) => (reset.reload = resolve));
    reset.freeze = freeze;
    reset.request('saiu');
    expect(freeze).toHaveBeenCalled();
    await reloaded;
    expect(localStorage.getItem('meu-mural:gastos:v1')).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(await databases()).not.toContain(DATA_DB);
    expect(JSON.parse(localStorage.getItem(RESET_KEY)!)).toEqual({ keep: [], motivo: 'saiu' });
    expect(localStorage.getItem('outro-site:coisa')).toBe('fica');
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
