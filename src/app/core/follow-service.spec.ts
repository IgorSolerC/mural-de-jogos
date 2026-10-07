import { TestBed } from '@angular/core/testing';
import { WritableSignal, computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { Cloud } from './cloud-config';
import { CloudAccount, CloudAccountInfo, CloudError } from './cloud-account';
import { FeedItem, Follow, People } from './follow';
import { Mural } from './mural';
import { Colleague, ColleagueStore } from './colleague-store';
import { cloudColleagueId } from './cloud-murals';
import { Settings } from './settings';

/**
 * O serviço da aba Amigos (`Follow`): o correio guardado por conta, a conferência "algo novo?", o
 * visto, silenciar, seguir e deixar de seguir, e as listas de pessoas. A nuvem é de mentira e cada
 * pedido fica anotado.
 */

const CACHE_KEY = 'meu-mural:correio';
const ME: CloudAccountInfo = { id: 'u-eu', codigo: 'EEEE-0000', nome: 'Eu' };
const OTHER: CloudAccountInfo = { id: 'u-outra', codigo: '0000-1111', nome: 'Outra' };
const ana = { codigo: 'AAAA-1111', nome: 'Ana' };
const bia = { codigo: 'BBBB-2222', nome: 'Bia' };

const resenha = (ref: string, em: string, extra: Partial<Extract<FeedItem, { tipo: 'resenha' }>> = {}): FeedItem => ({
  tipo: 'resenha',
  em,
  pessoa: ana,
  ref,
  titulo: `Obra ${ref}`,
  mural: 'jogos',
  silenciado: false,
  ...extra,
});
const seguiu = (em: string, pessoa = bia, euSigo = false): FeedItem => ({ tipo: 'seguiu', em, pessoa, euSigo });

function feedResponse(itens: FeedItem[], vistasEm: string | null, agora = '2026-10-06T12:00:00.000Z'): Response {
  return new Response(JSON.stringify({ itens, vistasEm, naoVistas: 0 }), { status: 200, headers: { 'Content-Type': 'application/json', 'Mural-Agora': agora } });
}
const nothingNew = (agora = '2026-10-06T12:00:00.000Z') => new Response(null, { status: 204, headers: { 'Mural-Agora': agora } });

interface Harness {
  follow: Follow;
  account: WritableSignal<CloudAccountInfo | null>;
  settings: Settings;
  mural: Mural;
  /** Os caminhos pedidos ao correio, na ordem. */
  feedCalls: string[];
  /** O que o correio responde a seguir (um por pedido; vazio: 204). */
  feedReplies: (Response | Error)[];
  /** Os pedidos JSON (seguir, visto, pessoas...), na ordem. */
  calls: { path: string; method: string; body: unknown }[];
  /** Os pedidos da lista de pessoas em aberto: resolva ou recuse quando quiser. */
  peopleRequests: { resolve: (v: unknown) => void; reject: (e: unknown) => void }[];
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Amigos: o serviço (Follow)', () => {
  afterEach(async () => {
    await flush();
    TestBed.resetTestingModule();
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem('mural-de-jogos:config:v1');
    localStorage.removeItem('mural-de-jogos:mural:v1');
  });

  function make(opts: { cache?: unknown; peopleManual?: boolean } = {}): Harness {
    TestBed.resetTestingModule();
    if (opts.cache !== undefined) localStorage.setItem(CACHE_KEY, JSON.stringify(opts.cache));
    const account = signal<CloudAccountInfo | null>(ME);
    const feedCalls: string[] = [];
    const feedReplies: (Response | Error)[] = [];
    const calls: Harness['calls'] = [];
    const peopleRequests: Harness['peopleRequests'] = [];
    // a nuvem lembra quem eu sigo e quem me segue (começa igual ao guardado, se houver)
    const saved = (opts.cache as { pessoas?: People } | undefined)?.pessoas;
    const server: People = { seguindo: [...(saved?.seguindo ?? [])], seguidores: [...(saved?.seguidores ?? [])] };
    const request = async (path: string, init: { method?: string; body?: unknown } = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ path, method, body: init.body });
      if (path === '/v1/eu/pessoas') {
        if (opts.peopleManual) return new Promise((resolve, reject) => peopleRequests.push({ resolve, reject }));
        return structuredClone(server);
      }
      if (path === '/v1/seguindo') {
        const pessoa = (init.body as { codigo: string }).codigo === ana.codigo ? ana : bia;
        if (!server.seguindo.some((f) => f.codigo === pessoa.codigo)) {
          server.seguindo.unshift({ ...pessoa, desde: '2026-10-06T10:00:00.000Z', silenciado: false, rev: null, meSegue: server.seguidores.some((f) => f.codigo === pessoa.codigo) });
        }
        return { pessoa, desde: '2026-10-06T10:00:00.000Z', silenciado: false };
      }
      const parts = path.split('/'); // ['', 'v1', 'seguindo', CÓDIGO] ou ['', 'v1', 'eu', 'seguidores', CÓDIGO]
      if (method === 'DELETE' && parts[2] === 'seguindo') server.seguindo = server.seguindo.filter((f) => f.codigo !== parts[3]);
      if (method === 'DELETE' && parts[3] === 'seguidores') {
        server.seguidores = server.seguidores.filter((f) => f.codigo !== parts[4]);
        server.seguindo = server.seguindo.map((f) => (f.codigo === parts[4] ? { ...f, meSegue: false } : f));
      }
      return { ok: true };
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        {
          provide: CloudAccount,
          useValue: {
            account,
            signedIn: computed(() => account() !== null),
            request,
            requestRaw: async (path: string) => {
              feedCalls.push(path);
              const next = feedReplies.shift() ?? nothingNew();
              if (next instanceof Error) throw next;
              return next;
            },
          },
        },
      ],
    });
    const follow = TestBed.inject(Follow);
    const h: Harness = { follow, account, settings: TestBed.inject(Settings), mural: TestBed.inject(Mural), feedCalls, feedReplies, calls, peopleRequests };
    return h;
  }

  /** Liga o serviço (o efeito da conta roda) e espera a primeira conferência. */
  async function start(): Promise<void> {
    TestBed.tick();
    await flush();
    await flush();
  }

  describe('o correio guardado e a conferência', () => {
    it('sem nada guardado: pede o correio inteiro e guarda para a próxima abertura, marcado com a conta', async () => {
      const h = make();
      h.feedReplies.push(feedResponse([resenha('r0001', '2026-10-06T10:00:00.000Z')], null));
      TestBed.tick();
      await flush();
      await flush();
      expect(h.feedCalls[0]).toBe('/v1/eu/notificacoes');
      expect(h.follow.items().map((i) => i.tipo === 'resenha' && i.ref)).toEqual(['r0001']);
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY)!);
      expect(cache.conta).toBe('u-eu');
      expect(cache.agora).toBe('2026-10-06T12:00:00.000Z');
    });

    it('com o correio guardado: o número aparece antes da nuvem, e a conferência pergunta só "depois do mais novo"', async () => {
      const h = make({ cache: { conta: 'u-eu', itens: [resenha('r0002', '2026-10-05T10:00:00.000Z'), resenha('r0001', '2026-10-04T10:00:00.000Z')], vistasEm: null, agora: null } });
      TestBed.tick();
      expect(h.follow.unseen()).toBe(2);
      await flush();
      expect(h.feedCalls[0]).toBe(`/v1/eu/notificacoes?depois=${encodeURIComponent('2026-10-05T10:00:00.000Z')}`);
      // 204: nada muda
      expect(h.follow.items().length).toBe(2);
    });

    it('com o correio vazio, a pergunta usa a hora da nuvem da última conferência', async () => {
      const h = make({ cache: { conta: 'u-eu', itens: [], vistasEm: null, agora: '2026-10-06T09:00:00.000Z' } });
      await start();
      expect(h.feedCalls[0]).toBe(`/v1/eu/notificacoes?depois=${encodeURIComponent('2026-10-06T09:00:00.000Z')}`);
    });

    it('check(true) pede tudo de novo e traz o "visto" feito em outro aparelho', async () => {
      const h = make({ cache: { conta: 'u-eu', itens: [resenha('r0001', '2026-10-05T10:00:00.000Z')], vistasEm: null, agora: null } });
      await start();
      expect(h.follow.unseen()).toBe(1);
      h.feedReplies.push(feedResponse([resenha('r0001', '2026-10-05T10:00:00.000Z')], '2026-10-05T10:00:00.000Z'));
      await h.follow.check(true);
      expect(h.feedCalls.at(-1)).toBe('/v1/eu/notificacoes');
      expect(h.follow.unseen()).toBe(0);
    });

    it('duas conferências ao mesmo tempo viram um pedido só', async () => {
      const h = make({ cache: { conta: 'u-eu', itens: [], vistasEm: null, agora: null } });
      await start();
      const before = h.feedCalls.length;
      await Promise.all([h.follow.check(), h.follow.check(), h.follow.check()]);
      expect(h.feedCalls.length).toBe(before + 1);
    });

    it('sem rede: fica o guardado e o aviso de offline; a próxima conferência boa tira o aviso', async () => {
      const h = make({ cache: { conta: 'u-eu', itens: [resenha('r0001', '2026-10-05T10:00:00.000Z')], vistasEm: null, agora: null } });
      h.feedReplies.push(new CloudError('Sem conexão', 'sem-rede', 0));
      await start();
      expect(h.follow.offline()).toBeTrue();
      expect(h.follow.items().length).toBe(1);
      await h.follow.check();
      expect(h.follow.offline()).toBeFalse();
    });

    it('o correio guardado de outra conta não aparece e é jogado fora', async () => {
      const h = make({ cache: { conta: 'u-outra', itens: [resenha('r0001', '2026-10-05T10:00:00.000Z')], vistasEm: null, agora: null } });
      TestBed.tick();
      expect(h.follow.items()).toEqual([]);
      await flush();
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{"conta":"u-eu"}').conta).toBe('u-eu');
    });

    it('sair da conta esvazia o correio da memória e do navegador', async () => {
      const h = make({ cache: { conta: 'u-eu', itens: [resenha('r0001', '2026-10-05T10:00:00.000Z')], vistasEm: null, agora: null } });
      await start();
      h.account.set(null);
      TestBed.tick();
      expect(h.follow.items()).toEqual([]);
      expect(h.follow.people()).toBeNull();
      expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it('um item estragado no guardado é ignorado, sem derrubar os outros', async () => {
      const h = make({
        cache: { conta: 'u-eu', itens: [resenha('r0001', '2026-10-05T10:00:00.000Z'), { tipo: 'resenha', em: 'ontem', pessoa: ana }, null, 'x'], vistasEm: 'quebrado', agora: null },
      });
      TestBed.tick();
      expect(h.follow.items().length).toBe(1);
      expect(h.follow.seenAt()).toBeNull();
    });
  });

  describe('visto, silenciar, seguir', () => {
    it('abrir marca como visto até o mais novo, avisa a nuvem uma vez só e zera o número', async () => {
      const h = make({ cache: { conta: 'u-eu', itens: [resenha('r0002', '2026-10-05T10:00:00.000Z'), seguiu('2026-10-04T10:00:00.000Z')], vistasEm: null, agora: null } });
      await start();
      expect(h.follow.unseen()).toBe(2);
      await h.follow.markSeen();
      expect(h.follow.unseen()).toBe(0);
      expect(h.calls.filter((c) => c.path === '/v1/eu/notificacoes/vistas')).toEqual([
        { path: '/v1/eu/notificacoes/vistas', method: 'POST', body: { ate: '2026-10-05T10:00:00.000Z' } },
      ]);
      await h.follow.markSeen();
      expect(h.calls.filter((c) => c.path === '/v1/eu/notificacoes/vistas').length).toBe(1);
      expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).vistasEm).toBe('2026-10-05T10:00:00.000Z');
    });

    it('sem rede, o visto vale aqui do mesmo jeito', async () => {
      const h = make({ cache: { conta: 'u-eu', itens: [resenha('r0002', '2026-10-05T10:00:00.000Z')], vistasEm: null, agora: null } });
      await start();
      const account = TestBed.inject(CloudAccount) as unknown as { request: (...a: unknown[]) => Promise<unknown> };
      spyOn(account, 'request').and.rejectWith(new CloudError('Sem conexão', 'sem-rede', 0));
      await h.follow.markSeen();
      expect(h.follow.unseen()).toBe(0);
    });

    it('silenciar tira as resenhas da pessoa do número na hora; o aviso de seguir continua contando', async () => {
      const h = make({
        cache: { conta: 'u-eu', itens: [resenha('r0002', '2026-10-05T10:00:00.000Z'), resenha('r0001', '2026-10-04T10:00:00.000Z'), seguiu('2026-10-03T10:00:00.000Z', ana)], vistasEm: null, agora: null },
      });
      await start();
      expect(h.follow.unseen()).toBe(3);
      await h.follow.mute(ana.codigo, true);
      expect(h.follow.unseen()).toBe(1);
      expect(h.calls.find((c) => c.method === 'PATCH')).toEqual({ path: `/v1/seguindo/${ana.codigo}`, method: 'PATCH', body: { silenciado: true } });
      await h.follow.mute(ana.codigo, false);
      expect(h.follow.unseen()).toBe(3);
    });

    it('seguir de volta acende o "você segue" no aviso; deixar de seguir apaga', async () => {
      const h = make({ cache: { conta: 'u-eu', itens: [seguiu('2026-10-05T10:00:00.000Z', bia, false)], vistasEm: null, agora: null } });
      await start();
      await h.follow.follow(bia.codigo);
      expect((h.follow.items()[0] as Extract<FeedItem, { tipo: 'seguiu' }>).euSigo).toBeTrue();
      expect(h.follow.isFollowing(bia.codigo)).toBeTrue();
      await h.follow.unfollow(bia.codigo);
      expect((h.follow.items()[0] as Extract<FeedItem, { tipo: 'seguiu' }>).euSigo).toBeFalse();
      expect(h.follow.isFollowing(bia.codigo)).toBeFalse();
    });

    it('seguir aceita o código digitado de qualquer jeito, e recusa o meu e o inválido sem chamar a nuvem', async () => {
      const h = make();
      await start();
      await expectAsync(h.follow.follow('eeee 0000')).toBeRejectedWithError(/seu código/);
      await expectAsync(h.follow.follow('curto')).toBeRejectedWithError(/não existe/);
      expect(h.calls.filter((c) => c.path === '/v1/seguindo')).toEqual([]);
      await h.follow.follow('aaaa-ilil'); // I e L viram 1
      expect(h.calls.find((c) => c.path === '/v1/seguindo')!.body).toEqual({ codigo: 'AAAA-1111' });
    });

    it('tirar um seguidor atualiza as duas listas na hora', async () => {
      const h = make({
        cache: {
          conta: 'u-eu',
          itens: [],
          vistasEm: null,
          agora: null,
          pessoas: { seguindo: [{ ...bia, desde: '2026-10-01T00:00:00.000Z', silenciado: false, rev: null, meSegue: true }], seguidores: [{ ...bia, desde: '2026-10-01T00:00:00.000Z', euSigo: true }] },
        },
      });
      await start();
      await h.follow.removeFollower(bia.codigo);
      const p = h.follow.people() as People;
      expect(p.seguidores).toEqual([]);
      expect(p.seguindo[0].meSegue).toBeFalse();
    });
  });

  describe('bugs corrigidos', () => {
    describe('separado: o visto de um mural não engole o dos outros', () => {
      const livro = resenha('rlivro', '2026-10-05T10:00:00.000Z', { mural: 'livros' });
      const jogo = resenha('rjogo1', '2026-10-04T10:00:00.000Z', { mural: 'jogos' });
      const cache = { conta: 'u-eu', itens: [livro, jogo], vistasEm: null, agora: null };

      it('abrir Amigos em livros não dá como vista a novidade de jogos, mais antiga, que nunca apareceu', async () => {
        const h = make({ cache });
        h.settings.friendKinds.set('separado');
        h.mural.kind.set('livros');
        await start();
        expect(h.follow.unseen()).toBe(1); // só o livro aparece
        await h.follow.markSeen();
        expect(h.follow.unseen()).toBe(0);
        // a de jogos é a mais velha: o visto da nuvem (uma data só) não pode andar; o livro fica visto aqui
        const vistas = () => h.calls.filter((c) => c.path === '/v1/eu/notificacoes/vistas').map((c) => c.body);
        expect(vistas()).toEqual([]);
        h.mural.kind.set('jogos');
        expect(h.follow.unseen()).toBe(1);
        // abrindo em jogos, agora sim tudo fica visto, e a data anda até o mais novo
        await h.follow.markSeen();
        expect(h.follow.unseen()).toBe(0);
        expect(h.follow.seenAt()).toBe('2026-10-05T10:00:00.000Z');
        expect(h.follow.seenKeys().size).toBe(0);
        expect(vistas()).toEqual([{ ate: '2026-10-05T10:00:00.000Z' }]);
        h.mural.kind.set('livros');
        expect(h.follow.unseen()).toBe(0);
      });

      it('com um visto de antes, a data anda até a última mostrada antes da novidade de outro mural', async () => {
        const cedo = resenha('rcedo1', '2026-10-03T18:00:00.000Z', { mural: 'livros' });
        const novo = resenha('rlivr2', '2026-10-06T10:00:00.000Z', { mural: 'livros' });
        const h = make({ cache: { conta: 'u-eu', itens: [novo, livro, jogo, cedo], vistasEm: '2026-10-03T12:00:00.000Z', agora: null } });
        h.settings.friendKinds.set('separado');
        h.mural.kind.set('livros');
        await start();
        expect(h.follow.unseen()).toBe(3);
        await h.follow.markSeen();
        expect(h.follow.seenAt()).toBe('2026-10-03T18:00:00.000Z');
        expect(h.calls.find((c) => c.path === '/v1/eu/notificacoes/vistas')!.body).toEqual({ ate: '2026-10-03T18:00:00.000Z' });
        expect(h.follow.unseen()).toBe(0);
        h.mural.kind.set('jogos');
        expect(h.follow.unseen()).toBe(1);
      });

      it('o visto à parte fica guardado: recarregar não traz o livro de volta como novo', async () => {
        const h = make({ cache });
        h.settings.friendKinds.set('separado');
        h.mural.kind.set('livros');
        await start();
        await h.follow.markSeen();
        const saved = JSON.parse(localStorage.getItem(CACHE_KEY)!);
        const again = make({ cache: saved });
        again.settings.friendKinds.set('separado');
        again.mural.kind.set('livros');
        await start();
        expect(again.follow.unseen()).toBe(0);
        again.mural.kind.set('jogos');
        expect(again.follow.unseen()).toBe(1);
      });

      it('misturado: o visto vai direto até o mais novo, como antes', async () => {
        const h = make({ cache });
        await start();
        await h.follow.markSeen();
        expect(h.follow.seenAt()).toBe('2026-10-05T10:00:00.000Z');
        expect(h.follow.unseen()).toBe(0);
      });

      it('a conferência completa não volta o visto para trás quando o aviso à nuvem não chegou', async () => {
        const h = make({ cache });
        await start();
        await h.follow.markSeen();
        h.feedReplies.push(feedResponse([livro, jogo], null)); // a nuvem não soube do visto
        await h.follow.check(true);
        expect(h.follow.unseen()).toBe(0);
      });
    });

    it('trocar de conta com a lista de pessoas a caminho não mostra a lista da conta anterior', async () => {
      const h = make({ peopleManual: true });
      await start();
      expect(h.peopleRequests.length).toBe(1); // o pedido da conta "Eu"
      h.account.set(OTHER);
      TestBed.tick();
      await flush();
      expect(h.peopleRequests.length).toBe(2); // o pedido da conta "Outra"
      // a resposta de "Eu" chega depois da troca; a de "Outra" falha (sem rede)
      h.peopleRequests[0].resolve({ seguindo: [{ ...ana, desde: '2026-10-01T00:00:00.000Z' }], seguidores: [] });
      h.peopleRequests[1].reject(new CloudError('Sem conexão', 'sem-rede', 0));
      await flush();
      expect(h.follow.isFollowing(ana.codigo)).toBeNull(); // não sabe ainda (e não diz que segue)
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
      expect(cached?.pessoas?.seguindo ?? []).toEqual([]);
    });

    it('quem eu sigo trocou o código: o mural dela guardado aqui passa para o código novo', async () => {
      await new Promise<void>((resolve) => {
        const r = indexedDB.deleteDatabase('meu-mural:colegas');
        r.onsuccess = r.onerror = r.onblocked = () => resolve();
      });
      const desde = '2026-10-01T00:00:00.000Z';
      const h = make({
        peopleManual: true,
        cache: { conta: 'u-eu', itens: [], vistasEm: null, agora: null, pessoas: { seguindo: [{ ...ana, chave: 'chave-da-ana', desde }], seguidores: [] } },
      });
      const colleagues = TestBed.inject(ColleagueStore);
      await colleagues.ready;
      const wall = { id: cloudColleagueId(ana.codigo), name: 'Ana', fileName: `Código ${ana.codigo}`, loadedAt: desde, codigo: ana.codigo, rev: 7, reviews: [] } as unknown as Colleague;
      await colleagues.restore(wall);
      await start();
      h.peopleRequests[0].resolve({ seguindo: [{ codigo: 'AAAB-1111', nome: 'Ana', chave: 'chave-da-ana', desde }], seguidores: [] });
      // a troca passa pelo IndexedDB (gravar o novo, apagar o antigo): espera, com prazo
      const moved = () => colleagues.colleagues().some((c) => c.codigo === 'AAAB-1111');
      for (const until = Date.now() + 3000; !moved() && Date.now() < until; ) await new Promise((r) => setTimeout(r, 20));
      expect(colleagues.colleagues().map((c) => [c.id, c.codigo, c.rev])).toEqual([[cloudColleagueId('AAAB-1111'), 'AAAB-1111', 7]]);
    });

    it('sem troca de conta, a lista que chega vale', async () => {
      const h = make({ peopleManual: true });
      await start();
      h.peopleRequests[0].resolve({ seguindo: [{ ...ana, desde: '2026-10-01T00:00:00.000Z' }], seguidores: [] });
      await flush();
      expect(h.follow.isFollowing(ana.codigo)).toBeTrue();
    });
  });
});
