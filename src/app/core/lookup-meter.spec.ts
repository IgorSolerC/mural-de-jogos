import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CloudAccount, CloudAccountInfo, CloudError } from './cloud-account';
import { LookupMeter, SEND_EVERY_MS, SEND_HIDDEN_AFTER_MS, failureOf, outcomeOf, whereOf } from './lookup-meter';

describe('a conta das chamadas do navegador', () => {
  describe('de qual serviço é o endereço', () => {
    it('cada catálogo que o navegador chama', () => {
      expect(whereOf('https://en.wikipedia.org/w/api.php?x=1')).toEqual({ servico: 'wikipedia', operacao: 'geral' });
      expect(whereOf('https://pt.wikipedia.org/w/api.php')).toEqual({ servico: 'wikipedia', operacao: 'geral' });
      expect(whereOf('https://openlibrary.org/search.json?q=hobbit')).toEqual({ servico: 'open-library', operacao: 'geral' });
      expect(whereOf('https://kitsu.io/api/edge/anime')).toEqual({ servico: 'kitsu', operacao: 'geral' });
      expect(whereOf('https://graphql.anilist.co')).toEqual({ servico: 'anilist', operacao: 'geral' });
      expect(whereOf('https://itunes.apple.com/search?term=x')).toEqual({ servico: 'itunes', operacao: 'geral' });
    });

    it('a chave própria é um serviço à parte: nunca a RAWG nem o TMDB do site', () => {
      expect(whereOf('https://api.rawg.io/api/games?key=minha')).toEqual({ servico: 'chave-propria', operacao: 'rawg' });
      expect(whereOf('https://api.themoviedb.org/3/search/movie')).toEqual({ servico: 'chave-propria', operacao: 'tmdb' });
    });

    it('a busca pela própria API não conta aqui (o Worker já contou), nem o desconhecido', () => {
      expect(whereOf('https://mural-api.igorsoler.workers.dev/v1/catalogo/rawg/games?search=x')).toBeNull();
      expect(whereOf('https://exemplo.com/x')).toBeNull();
      expect(whereOf('não é endereço')).toBeNull();
    });
  });

  describe('como terminou', () => {
    const itunes = { servico: 'itunes', operacao: 'geral' } as const;
    const kitsu = { servico: 'kitsu', operacao: 'geral' } as const;

    it('o 403 do iTunes é o limite; nos outros, uma recusa', () => {
      expect(outcomeOf(itunes, 403)).toBe('limite');
      expect(outcomeOf(kitsu, 403)).toBe('recusada');
      expect(outcomeOf(kitsu, 200)).toBe('ok');
      expect(outcomeOf(kitsu, 429)).toBe('limite');
      expect(outcomeOf(kitsu, 500)).toBe('fora');
    });

    it('sem resposta: prazo, a pessoa que continuou digitando, ou fora', () => {
      const live = new AbortController().signal;
      expect(failureOf(new DOMException('x', 'TimeoutError'), live)).toBe('prazo');
      expect(failureOf(new TypeError('rede'), live)).toBe('fora');
      expect(failureOf(new DOMException('x', 'AbortError'), live)).toBe('cancelada');
      const gone = new AbortController();
      gone.abort();
      expect(failureOf(new TypeError('x'), gone.signal)).toBe('cancelada');
    });
  });

  describe('a conta', () => {
    const URL = 'https://en.wikipedia.org/w/api.php?srsearch=o-que-buscou';
    const live = () => new AbortController().signal;

    function setup(initial: Partial<CloudAccountInfo> | null = { id: 'c1', codigo: 'K7QF-M2XA', nome: 'Ana' }) {
      const account = signal<Partial<CloudAccountInfo> | null>(initial);
      const request = jasmine.createSpy('request').and.resolveTo(null);
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), { provide: CloudAccount, useValue: { account, signedIn: () => account() !== null, request } }],
      });
      const meter = TestBed.inject(LookupMeter);
      const ok = (status = 200) => meter.track(URL, live(), async () => new Response('{}', { status }));
      const sent = (i = 0) => request.calls.argsFor(i)[1].body.linhas as Record<string, unknown>[];
      return { meter, account, request, ok, sent };
    }

    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    it('devolve a resposta como veio, e soma as chamadas iguais', async () => {
      const t = setup();
      const res = await t.ok();
      expect(res.status).toBe(200);
      await t.ok();
      t.meter.send(false);
      expect(t.request).toHaveBeenCalledTimes(1);
      expect(t.request.calls.argsFor(0)[0]).toBe('/v1/uso/navegador');
      expect(t.sent()).toEqual([jasmine.objectContaining({ servico: 'wikipedia', operacao: 'geral', desfecho: 'ok', status: 200, pedidos: 2 })]);
    });

    it('o que vai é só total: nem o que foi buscado, nem o endereço, nem de quem é', async () => {
      const t = setup();
      await t.ok();
      t.meter.send(false);
      const text = JSON.stringify(t.request.calls.argsFor(0)[1]);
      expect(text).not.toContain('o-que-buscou');
      expect(text).not.toContain('wikipedia.org');
      expect(text).not.toContain('c1');
      expect(Object.keys(t.sent()[0]!).sort()).toEqual(['desfecho', 'msMax', 'msTotal', 'operacao', 'pedidos', 'servico', 'status']);
    });

    it('a busca pela API passa direto, sem conta', async () => {
      const t = setup();
      const res = await t.meter.track('https://mural-api.igorsoler.workers.dev/v1/catalogo/rawg/games', live(), async () => new Response('{}'));
      expect(res.status).toBe(200);
      t.meter.send(false);
      expect(t.request).not.toHaveBeenCalled();
    });

    it('o erro da chamada continua sendo de quem chamou, e fica anotado', async () => {
      const t = setup();
      await expectAsync(t.meter.track(URL, live(), () => Promise.reject(new TypeError('rede')))).toBeRejectedWithError(TypeError);
      t.meter.send(false);
      expect(t.sent()).toEqual([jasmine.objectContaining({ desfecho: 'fora', status: null })]);
    });

    it('sem internet no aparelho, o catálogo não leva a culpa', async () => {
      const t = setup();
      spyOnProperty(navigator, 'onLine').and.returnValue(false);
      await expectAsync(t.meter.track(URL, live(), () => Promise.reject(new TypeError('rede')))).toBeRejected();
      t.meter.send(false);
      expect(t.request).not.toHaveBeenCalled();
    });

    it('sem sessão, nada é contado e nada é mandado', async () => {
      const t = setup(null);
      await t.ok();
      t.meter.send(false);
      jasmine.clock().tick(SEND_EVERY_MS + 1);
      expect(t.request).not.toHaveBeenCalled();
    });

    it('trocar de conta zera: o de antes não vai junto', async () => {
      const t = setup();
      await t.ok();
      t.account.set({ id: 'c2', codigo: 'OUTR-0000', nome: 'Bia' });
      t.meter.send(false);
      expect(t.request).not.toHaveBeenCalled();
      await t.ok();
      t.meter.send(false);
      expect(t.sent()).toEqual([jasmine.objectContaining({ pedidos: 1 })]);
    });

    it('saiu da conta com a conta na memória: não manda', async () => {
      const t = setup();
      await t.ok();
      t.account.set(null);
      t.meter.send(false);
      expect(t.request).not.toHaveBeenCalled();
    });

    it('manda sozinha depois de 5 min, e sem nada novo não manda de novo', async () => {
      const t = setup();
      await t.ok();
      jasmine.clock().tick(SEND_EVERY_MS - 1);
      expect(t.request).not.toHaveBeenCalled();
      jasmine.clock().tick(2);
      expect(t.request).toHaveBeenCalledTimes(1);
      jasmine.clock().tick(SEND_EVERY_MS * 3);
      expect(t.request).toHaveBeenCalledTimes(1);
    });

    describe('ao esconder a aba', () => {
      function hide(state: DocumentVisibilityState) {
        spyOnProperty(document, 'visibilityState').and.returnValue(state);
        document.dispatchEvent(new Event('visibilitychange'));
      }

      it('manda com keepalive, porque a aba pode estar indo embora', async () => {
        const t = setup();
        await t.ok();
        hide('hidden');
        expect(t.request).toHaveBeenCalledTimes(1);
        expect(t.request.calls.argsFor(0)[1].keepalive).toBeTrue();
      });

      it('voltar para a aba não manda', async () => {
        const t = setup();
        await t.ok();
        hide('visible');
        expect(t.request).not.toHaveBeenCalled();
      });

      it('esconder e mostrar sem parar não vira um envio a cada vez', async () => {
        const t = setup();
        jasmine.clock().mockDate(new Date('2026-11-05T12:00:00Z'));
        await t.ok();
        t.meter.send(false);
        await t.ok();
        jasmine.clock().tick(SEND_HIDDEN_AFTER_MS - 1);
        hide('hidden');
        expect(t.request).toHaveBeenCalledTimes(1);
      });
    });

    describe('quando o envio falha', () => {
      const flush = async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      };

      it('sem rede, vai junto na próxima vez, somado', async () => {
        const t = setup();
        t.request.and.returnValues(Promise.reject(new CloudError('sem rede', 'sem-rede', 0)), Promise.resolve(null));
        await t.ok();
        t.meter.send(false);
        await flush();
        await t.ok();
        t.meter.send(false);
        expect(t.sent(1)).toEqual([jasmine.objectContaining({ pedidos: 2 })]);
      });

      it('com a nuvem fora, tenta sozinha depois', async () => {
        const t = setup();
        t.request.and.returnValues(Promise.reject(new CloudError('fora', 'nuvem-desligada', 503)), Promise.resolve(null));
        await t.ok();
        t.meter.send(false);
        await flush();
        jasmine.clock().tick(SEND_EVERY_MS + 1);
        expect(t.request).toHaveBeenCalledTimes(2);
      });

      it('recusado (4xx), não insiste', async () => {
        const t = setup();
        t.request.and.returnValue(Promise.reject(new CloudError('não', 'sessao-invalida', 401)));
        await t.ok();
        t.meter.send(false);
        await flush();
        jasmine.clock().tick(SEND_EVERY_MS * 2);
        expect(t.request).toHaveBeenCalledTimes(1);
      });

      it('nunca lança: quem buscou nem fica sabendo', async () => {
        const t = setup();
        t.request.and.returnValue(Promise.reject(new CloudError('sem rede', 'sem-rede', 0)));
        await t.ok();
        expect(() => t.meter.send(false)).not.toThrow();
        await flush();
      });
    });

    it('nada fica guardado no navegador', async () => {
      localStorage.clear();
      sessionStorage.clear();
      const t = setup();
      await t.ok();
      t.meter.send(false);
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
    });
  });
});
