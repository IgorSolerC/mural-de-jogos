import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Cloud } from './cloud-config';
import { CloudAccount, CloudAccountInfo, CloudError } from './cloud-account';
import { FeedItem, Follow, People, parseFeed } from './follow';
import { Reaction, Reactions, parseReactions, spokenReactions, tally } from './reactions';
import { Toasts } from '../ui/toast';
import { EMOJI_DRAWERS, searchEmoji } from './emoji-catalog';
import { isEmoji } from './emoji';
import { fold } from './review';
import { isReaction, reactionOf } from './reactions';

/** As reações: o que vem da nuvem, as contas do balão e o reagir (que muda na hora e volta se a nuvem recusar). */

const ME: CloudAccountInfo = { id: 'u-eu', codigo: 'EEEE-0000', nome: 'Eu' };
const ANA = 'AAAA-1111';
const at = '2026-10-07T12:00:00.000Z';
const r = (codigo: string, reacao: Reaction['reacao'], nome = codigo): Reaction => ({ codigo, nome, reacao, em: at });
const flush = () => new Promise((res) => setTimeout(res, 0));

describe('reações', () => {
  it('lê o que veio da nuvem e deixa de fora o que não tem a forma certa', () => {
    const map = parseReactions({
      reacoes: {
        'r-hades': [
          { codigo: 'bbbb2222', nome: 'Bia', reacao: 'fogo', em: at },
          { codigo: 'CCCC-3333', nome: 'Caio', reacao: 'raiva', em: at },
          { codigo: 'nao é código', nome: 'X', reacao: 'amei', em: at },
          { codigo: 'DDDD-4444', nome: '', reacao: 'amei', em: at },
        ],
        'com espaço': [{ codigo: 'BBBB-2222', nome: 'Bia', reacao: 'fogo', em: at }],
        'r-vazio': [],
      },
    });
    expect([...map.keys()]).toEqual(['r-hades']);
    expect(map.get('r-hades')).toEqual([{ codigo: 'BBBB-2222', nome: 'Bia', reacao: 'fogo', em: at }]);
    expect(parseReactions(null).size).toBe(0);
    expect(parseReactions({ reacoes: 'x' }).size).toBe(0);
  });

  it('conta da mais dada para a menos (empate: a ordem do seletor), e diz por extenso', () => {
    const list = [r('A', 'fogo'), r('B', 'amei'), r('C', 'fogo'), r('D', 'hmm')];
    expect(tally(list).map((t) => [t.kind.id, t.n])).toEqual([
      ['fogo', 2],
      ['amei', 1],
      ['hmm', 1],
    ]);
    expect(spokenReactions(list)).toBe('2 Fogo, 1 Amei e 1 Dúvida');
    expect(spokenReactions([r('A', 'uau')])).toBe('1 Surpresa');
  });

  it('o aviso de reação no correio: só com uma reação que existe', () => {
    const base = { em: at, pessoa: { codigo: 'BBBB-2222', nome: 'Bia' }, ref: 'r-hades', titulo: 'Hades', mural: 'jogos', silenciado: false };
    const items = parseFeed([
      { tipo: 'reagiu', ...base, reacao: 'fogo' },
      { tipo: 'reagiu', ...base, reacao: 'raiva' },
      { tipo: 'reagiu', ...base },
    ]);
    expect(items).toEqual([{ tipo: 'reagiu', ...base, mural: 'jogos', reacao: 'fogo' } as FeedItem]);
  });

  it('o "+": todo emoji da gaveta é um emoji só (a API aceita), sem repetir; a busca acha pelo nome sem acento', () => {
    const all = EMOJI_DRAWERS.flatMap((d) => d.list.map((x) => x.e));
    for (const e of all) expect(isEmoji(e)).withContext(e).toBeTrue();
    expect(new Set(all).size).toBe(all.length);
    expect(searchEmoji('coração', fold).map((x) => x.e)).toContain('❤️');
    expect(searchEmoji('pipo', fold).map((x) => x.e)).toEqual(['🍿']);
    expect(searchEmoji('   ', fold)).toEqual([]);
    for (const bad of ['ab', '🦄🦄', '🦄a', '1', '']) expect(isEmoji(bad)).withContext(bad).toBeFalse();
  });

  it('uma reação do "+" é o próprio emoji, e vale como reação', () => {
    expect(isReaction('🦄')).toBeTrue();
    expect(isReaction('raiva')).toBeFalse();
    expect(reactionOf('🦄')).toEqual({ id: '🦄', emoji: '🦄', label: '🦄' });
    expect(tally([r('A', '🦄'), r('B', 'fogo'), r('C', '🦄')]).map((t) => [t.kind.emoji, t.n])).toEqual([
      ['🦄', 2],
      ['🔥', 1],
    ]);
  });

  describe('o serviço', () => {
    let calls: { path: string; method: string; body: unknown }[];
    let fail: CloudError | null;
    let people: ReturnType<typeof signal<People | null>>;
    let toasts: string[];

    function make(): Reactions {
      TestBed.resetTestingModule();
      calls = [];
      fail = null;
      toasts = [];
      people = signal<People | null>({ seguindo: [{ codigo: ANA, nome: 'Ana', desde: at, silenciado: false, rev: 1, meSegue: true }], seguidores: [] });
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          { provide: Cloud, useValue: { config: signal({ api: 'https://api.teste' }), ready: Promise.resolve() } },
          {
            provide: CloudAccount,
            useValue: {
              account: signal(ME),
              signedIn: signal(true),
              request: async (path: string, init: { method?: string; body?: unknown } = {}) => {
                calls.push({ path, method: init.method ?? 'GET', body: init.body });
                if (fail && init.method) throw fail;
                if (path === `/v1/murais/${ANA}/reacoes`) return { reacoes: { 'r-hades': [{ codigo: 'BBBB-2222', nome: 'Bia', reacao: 'amei', em: at }] } };
                return { reacoes: {} };
              },
            },
          },
          { provide: Follow, useValue: { items: signal<FeedItem[]>([]), people } },
          { provide: Toasts, useValue: { show: (t: string) => toasts.push(t) } },
        ],
      });
      return TestBed.inject(Reactions);
    }

    afterEach(() => TestBed.resetTestingModule());

    it('só reage quem segue o dono, e nunca a si mesmo', () => {
      const s = make();
      expect(s.canReact(ANA)).toBeTrue();
      expect(s.canReact('ZZZZ-9999')).toBeFalse();
      expect(s.canReact(ME.codigo)).toBeFalse();
      people.set(null);
      expect(s.canReact(ANA)).toBeFalse();
    });

    it('busca as reações do mural de alguém, e não pede de novo logo em seguida', async () => {
      const s = make();
      await s.load(ANA);
      await s.load(ANA);
      expect(calls.filter((c) => c.path === `/v1/murais/${ANA}/reacoes`).length).toBe(1);
      expect(s.of(ANA, 'r-hades').map((x) => x.nome)).toEqual(['Bia']);
    });

    it('reagir aparece na hora; trocar substitui; tirar some', async () => {
      const s = make();
      await s.load(ANA);
      const target = { code: ANA, ref: 'r-hades', titulo: 'Hades', mural: 'jogos' as const };
      await s.react(target, 'fogo');
      expect(s.mineOn(ANA, 'r-hades')).toBe('fogo');
      expect(s.of(ANA, 'r-hades').length).toBe(2);
      expect(calls.at(-1)).toEqual({ path: `/v1/murais/${ANA}/reacoes/r-hades`, method: 'PUT', body: { reacao: 'fogo', titulo: 'Hades', mural: 'jogos' } });
      await s.react(target, 'uau');
      expect(s.of(ANA, 'r-hades').filter((x) => x.codigo === ME.codigo).map((x) => x.reacao)).toEqual(['uau']);
      await s.react(target, null);
      expect(s.mineOn(ANA, 'r-hades')).toBeNull();
      expect(calls.at(-1)!.method).toBe('DELETE');
    });

    it('a nuvem recusou: volta como era e o bilhete diz por quê', async () => {
      const s = make();
      await s.load(ANA);
      fail = new CloudError('Siga a pessoa para reagir às resenhas dela.', 'reagir-sem-seguir', 403);
      await s.react({ code: ANA, ref: 'r-hades', titulo: 'Hades', mural: 'jogos' }, 'fogo');
      expect(s.mineOn(ANA, 'r-hades')).toBeNull();
      expect(s.of(ANA, 'r-hades').length).toBe(1);
      expect(toasts).toEqual(['Siga a pessoa para reagir às resenhas dela.']);
    });

    it('as reações às minhas fichas chegam ao entrar', async () => {
      make();
      TestBed.tick();
      await flush();
      expect(calls.some((c) => c.path === `/v1/murais/${ME.codigo}/reacoes`)).toBeTrue();
    });
  });
});
