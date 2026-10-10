import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { CloudMurals } from '../core/cloud-murals';
import { Colleague, ColleagueStore } from '../core/colleague-store';
import { FeedItem, Follow, People } from '../core/follow';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { Confirm } from '../ui/confirm';
import { MailPage } from './mail-page';

/**
 * A aba Amigos (MailPage), sem desenhar a tela: o que ela monta a partir do correio, dos murais dos
 * amigos e do meu mural (os blocos do Feed, o estado de cada ficha, a minha nota da mesma obra, o
 * segredo, a lista única de Pessoas) e a ordem do que ela faz ao abrir. O serviço do correio
 * (Follow) e os murais da nuvem (CloudMurals) são de mentira.
 */

class MemoryData {
  private readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {
    /* sem outras abas */
  }
  takeForeign(): null {
    return null;
  }
}

const ana = { codigo: 'AAAA-1111', nome: 'Ana' };
const bia = { codigo: 'BBBB-2222', nome: 'Bia' };
const cris = { codigo: 'CCCC-3333', nome: 'Cris' };

function review(id: string, name: string, extra: Partial<Review> = {}, final = 8): Review {
  return sanitizeReview({
    id,
    kind: 'jogos',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { historia: final, diversao: final, jogabilidade: final, visual: final },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    completedAt: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  })!;
}

type Resenha = Extract<FeedItem, { tipo: 'resenha' }>;
const post = (pessoa: typeof ana, ref: string, em: string, titulo = `Obra ${ref}`): Resenha => ({ tipo: 'resenha', em, pessoa, ref, titulo, mural: 'jogos', silenciado: false });
const seguiu = (pessoa: typeof ana, em: string): FeedItem => ({ tipo: 'seguiu', em, pessoa, euSigo: false });

/** O mural de um amigo, como fica guardado depois de aberto pela nuvem. */
const wallOf = (who: typeof ana, reviews: Review[], loadedAt = new Date().toISOString()): Colleague => ({
  id: `nuvem:${who.codigo.replace('-', '')}`,
  name: who.nome,
  fileName: `Código ${who.codigo}`,
  loadedAt,
  codigo: who.codigo,
  rev: 1,
  reviews,
} as unknown as Colleague);

interface Page {
  blocks(): ({ tipo: 'seguiu'; key: string } | { tipo: 'pessoa'; key: string; pessoa: typeof ana; posts: { key: string; estado: string; theirs: Review | null; mine: Review | null; secret: boolean }[] })[];
  everyone(): { codigo: string; nome: string; sigo: unknown; segue: unknown }[];
  bond(x: unknown): string;
  isFresh(item: FeedItem): boolean;
  signed(d: number): string;
  delta(a: Review, b: Review): number;
  isNotePost(p: unknown): boolean;
  blockVerb(posts: unknown[]): string;
  wish(r: Review): void;
  isWished(r: Review): boolean;
  retryWall(code: string): Promise<void>;
  reveal(p: unknown): void;
}

describe('Amigos: a página (MailPage)', () => {
  let items: ReturnType<typeof signal<FeedItem[]>>;
  let seenAt: ReturnType<typeof signal<string | null>>;
  let people: ReturnType<typeof signal<People | null>>;
  let walls: ReturnType<typeof signal<Colleague[]>>;
  /** O que a nuvem devolve para cada código (null: não veio). */
  let cloudWalls: Map<string, Colleague | null>;
  /** A ordem do que a página pede. */
  let log: string[];
  /** As fichas que a página disse precisar em cada busca (`código:ref,ref`). */
  let needs: string[];
  let store: ReviewStore;
  let settings: Settings;

  beforeEach(() => {
    localStorage.clear();
    items = signal<FeedItem[]>([]);
    seenAt = signal<string | null>(null);
    people = signal<People | null>(null);
    walls = signal<Colleague[]>([]);
    cloudWalls = new Map();
    log = [];
    needs = [];
    const follow = {
      available: signal(true),
      items,
      seenAt,
      seenKeys: signal<ReadonlySet<string>>(new Set()),
      people,
      visible: computed(() => items()),
      check: async (full = false) => void log.push(`check(${full})`),
      loadPeople: async () => {
        log.push('loadPeople');
        return people() ?? { seguindo: [], seguidores: [] };
      },
      markSeen: async () => void log.push('markSeen'),
    };
    const murals = {
      ensure: async (code: string, need: readonly string[] = []) => {
        log.push(`ensure(${code})`);
        needs.push(`${code}:${need.join(',')}`);
        await new Promise((r) => setTimeout(r, 0));
        // da nuvem: chega agora; sem ela (null), fica o que já estava guardado
        const hit = cloudWalls.get(code);
        const c = hit ? { ...hit, loadedAt: new Date().toISOString() } : null;
        if (c) walls.update((list) => [c, ...list.filter((x) => x.id !== c.id)]);
        return c ?? walls().find((x) => x.codigo === code) ?? null;
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: Follow, useValue: follow },
        { provide: CloudMurals, useValue: murals },
        { provide: ColleagueStore, useValue: { colleagues: walls, select: () => undefined } },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        { provide: CloudAccount, useValue: { account: signal({ id: 'u-eu', codigo: 'EEEE-0000', nome: 'Eu' }), signedIn: signal(true) } },
        { provide: Confirm, useValue: { ask: async () => true, choose: async () => null } },
      ],
    });
    TestBed.overrideComponent(MailPage, { set: { template: '', imports: [] } });
    store = TestBed.inject(ReviewStore);
    settings = TestBed.inject(Settings);
  });

  afterEach(() => localStorage.clear());

  /** Abre a página e espera ela buscar tudo. */
  async function open(): Promise<Page> {
    const fixture = TestBed.createComponent(MailPage);
    fixture.detectChanges();
    await fixture.whenStable();
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    return fixture.componentInstance as unknown as Page;
  }

  const settle = async () => {
    TestBed.tick();
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };

  const posts = (page: Page) => page.blocks().flatMap((b) => (b.tipo === 'pessoa' ? b.posts : []));

  describe('ao abrir', () => {
    it('busca o correio inteiro, depois um mural por pessoa (uma vez só), e só então marca como visto', async () => {
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z'), post(ana, 'rana02', '2026-10-06T09:00:00.000Z'), post(bia, 'rbia01', '2026-10-05T10:00:00.000Z'), seguiu(cris, '2026-10-04T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste'), review('rana02', 'Hades')]));
      cloudWalls.set(bia.codigo, wallOf(bia, [review('rbia01', 'Hollow Knight')]));
      await open();
      expect(log[0]).toBe('check(true)');
      expect(log.filter((l) => l.startsWith('ensure')).sort()).toEqual([`ensure(${ana.codigo})`, `ensure(${bia.codigo})`]);
      expect(log.at(-1)).toBe('markSeen');
      // quem só começou a seguir não tem mural para buscar
      expect(log).not.toContain(`ensure(${cris.codigo})`);
    });

    it('o adesivo "Novo" fica nos itens de depois do visto que valia quando a página abriu', async () => {
      seenAt.set('2026-10-05T12:00:00.000Z');
      const page = await open();
      const novo = post(ana, 'rana02', '2026-10-06T10:00:00.000Z');
      expect(page.isFresh(novo)).toBeTrue();
      expect(page.isFresh(post(ana, 'rana01', '2026-10-05T10:00:00.000Z'))).toBeFalse();
      // o visto muda (markSeen), mas o adesivo continua enquanto a página estiver aberta
      seenAt.set('2026-10-06T23:00:00.000Z');
      expect(page.isFresh(novo)).toBeTrue();
    });

    it('nunca visto: tudo é novo', async () => {
      const page = await open();
      expect(page.isFresh(post(ana, 'rana01', '2020-01-01T00:00:00.000Z'))).toBeTrue();
    });
  });

  describe('o Feed', () => {
    it('agrupa as resenhas seguidas da mesma pessoa; outra pessoa ou um aviso de seguir abrem outro bloco', async () => {
      items.set([
        post(ana, 'rana03', '2026-10-06T10:00:00.000Z'),
        post(ana, 'rana02', '2026-10-06T09:00:00.000Z'),
        post(bia, 'rbia01', '2026-10-06T08:00:00.000Z'),
        seguiu(cris, '2026-10-06T07:00:00.000Z'),
        post(ana, 'rana01', '2026-10-06T06:00:00.000Z'),
      ]);
      const page = await open();
      const shape = page.blocks().map((b) => (b.tipo === 'seguiu' ? 'seguiu' : `${b.pessoa.nome}×${b.posts.length}`));
      expect(shape).toEqual(['Ana×2', 'Bia×1', 'seguiu', 'Ana×1']);
      const keys = page.blocks().map((b) => b.key);
      expect(new Set(keys).size).toBe(keys.length); // chaves únicas para o @for
    });

    it('a ficha do amigo aparece com a minha da mesma obra e a diferença das notas', async () => {
      store.add(review('rme001', 'Celeste', {}, 7));
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z', 'Celeste')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste', {}, 9)]));
      const page = await open();
      const [p] = posts(page);
      expect(p.estado).toBe('ficha');
      expect(p.theirs!.id).toBe('rana01');
      expect(p.mine!.id).toBe('rme001');
      expect(page.delta(p.theirs!, p.mine!)).toBe(2);
      expect(p.secret).toBeFalse();
    });

    it('a anotação publicada aparece como anotação: sem placar, sem segredo, "publicou uma anotação"', async () => {
      store.add({ ...review('nme001', 'Compras'), kind: 'anotacoes' });
      items.set([{ ...post(ana, 'nana01', '2026-10-06T10:00:00.000Z', 'Compras'), mural: 'anotacoes' }]);
      cloudWalls.set(ana.codigo, wallOf(ana, [{ ...review('nana01', 'Compras'), kind: 'anotacoes' }]));
      const page = await open();
      const [p] = posts(page);
      expect(p.estado).toBe('ficha');
      expect(p.theirs!.id).toBe('nana01');
      expect(p.mine).toBeNull();
      expect(p.secret).toBeFalse();
      expect(page.isNotePost(p)).toBeTrue();
      expect(page.blockVerb([p])).toBe('publicou uma anotação');
    });

    it('"Evitar spoilers": a nota do que eu não avaliei vem em segredo; desligado, aparece', async () => {
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste')]));
      const page = await open();
      expect(posts(page)[0].secret).toBeTrue();
      settings.friendSpoilers.set(false);
      expect(posts(page)[0].secret).toBeFalse();
    });

    it('"Revelar spoilers" mostra só aquela ficha', async () => {
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z'), post(ana, 'rana02', '2026-10-05T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste'), review('rana02', 'Hades')]));
      const page = await open();
      expect(posts(page).map((p) => p.secret)).toEqual([true, true]);
      page.reveal(posts(page)[0]);
      expect(posts(page).map((p) => p.secret)).toEqual([false, true]);
    });

    it('o mural não veio: a ficha diz que falhou; "Tentar de novo" busca e mostra', async () => {
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, null);
      const page = await open();
      expect(posts(page)[0].estado).toBe('erro');
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste')]));
      await page.retryWall(ana.codigo);
      expect(posts(page)[0].estado).toBe('ficha');
    });

    it('o mural veio sem a ficha (a pessoa tirou ou deixou privada): "saiu"', async () => {
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('routra', 'Outra coisa')]));
      const page = await open();
      expect(posts(page)[0].estado).toBe('saiu');
    });

    it('"Quero jogar" põe na wishlist uma vez só', async () => {
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste')]));
      const page = await open();
      const theirs = posts(page)[0].theirs!;
      expect(page.isWished(theirs)).toBeFalse();
      page.wish(theirs);
      page.wish(theirs);
      expect(store.wishes().map((w) => w.game.name)).toEqual(['Celeste']);
      expect(page.isWished(theirs)).toBeTrue();
    });

    it('a diferença com sinal: "+1,4", "−0,8"', async () => {
      const page = await open();
      expect(page.signed(1.4)).toBe('+1,4');
      expect(page.signed(-0.8)).toBe('−0,8');
    });
  });

  describe('Pessoas', () => {
    it('uma linha por pessoa; quem me segue sem eu seguir de volta vem primeiro, depois pelo nome', async () => {
      people.set({
        seguindo: [
          { ...cris, desde: '2026-10-01T00:00:00.000Z', silenciado: false, rev: 1, meSegue: false },
          { ...ana, desde: '2026-10-01T00:00:00.000Z', silenciado: false, rev: 1, meSegue: true },
        ],
        seguidores: [
          { ...ana, desde: '2026-10-01T00:00:00.000Z', euSigo: true },
          { ...bia, desde: '2026-10-01T00:00:00.000Z', euSigo: false },
          { codigo: 'DDDD-4444', nome: 'Ágata', desde: '2026-10-01T00:00:00.000Z', euSigo: false },
        ],
      });
      const page = await open();
      const list = page.everyone();
      expect(list.map((x) => x.nome)).toEqual(['Ágata', 'Bia', 'Ana', 'Cris']);
      expect(list.map((x) => page.bond(x))).toEqual(['Segue você', 'Segue você', 'Vocês se seguem', 'Você segue']);
    });
  });

  describe('bugs corrigidos', () => {
    it('na rejogada de um amigo, aparece a minha nota da mesma obra', async () => {
      store.add(review('rme001', 'Celeste', {}, 7));
      items.set([post(ana, 'rana02', '2026-10-06T10:00:00.000Z', 'Celeste')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste', {}, 9), review('rana02', 'Celeste', { revisitOf: 'rana01' }, 10)]));
      const page = await open();
      const [p] = posts(page);
      expect(p.estado).toBe('ficha');
      expect(p.theirs!.revisitOf).toBe('rana01');
      expect(p.mine?.id).toBe('rme001');
      expect(p.secret).toBeFalse();
    });

    it('rejogada cuja original ficou privada (fora do mural público): casa pela própria obra', async () => {
      store.add(review('rme001', 'Celeste', {}, 7));
      items.set([post(ana, 'rana02', '2026-10-06T10:00:00.000Z', 'Celeste')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana02', 'Celeste', { revisitOf: 'rana01' }, 10)]));
      const page = await open();
      expect(posts(page)[0].mine?.id).toBe('rme001');
    });

    it('rejogada de algo que eu não avaliei: continua sem a minha nota', async () => {
      store.add(review('rme001', 'Hades', {}, 7));
      items.set([post(ana, 'rana02', '2026-10-06T10:00:00.000Z', 'Celeste')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste', {}, 9), review('rana02', 'Celeste', { revisitOf: 'rana01' }, 10)]));
      const page = await open();
      expect(posts(page)[0].mine).toBeNull();
    });

    it('uma resenha que chega com a página aberta busca o mural de novo, em vez de dizer "tirou essa ficha"', async () => {
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste')]));
      const page = await open();
      expect(posts(page)[0].estado).toBe('ficha');
      // chega uma resenha nova da Ana; o mural dela na nuvem já tem a ficha
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste'), review('rana02', 'Hades')]));
      log = [];
      items.update((list) => [post(ana, 'rana02', '2026-10-06T11:00:00.000Z', 'Hades'), ...list]);
      await settle();
      expect(log).toEqual([`ensure(${ana.codigo})`]);
      // a página diz quais fichas precisa: o guardado de 2 minutos não serve se faltar alguma
      expect(needs.at(-1)).toBe(`${ana.codigo}:rana02,rana01`);
      expect(posts(page).find((p) => p.key.endsWith('rana02'))!.estado).toBe('ficha');
    });

    it('buscou de novo e a ficha não está no mural de agora: aí sim "saiu", sem buscar sem parar', async () => {
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste')]));
      const page = await open();
      log = [];
      items.update((list) => [post(ana, 'rana02', '2026-10-06T11:00:00.000Z', 'Hades'), ...list]);
      await settle();
      expect(posts(page).find((p) => p.key.endsWith('rana02'))!.estado).toBe('saiu');
      items.update((list) => [...list]); // outra conferência do correio, sem nada novo
      await settle();
      expect(log).toEqual([`ensure(${ana.codigo})`]);
    });

    it('sem rede só vem o mural guardado, de antes da resenha: "Tentar de novo", não "saiu"', async () => {
      walls.set([wallOf(ana, [review('rana01', 'Celeste')], '2026-10-06T09:00:00.000Z')]);
      items.set([post(ana, 'rana02', '2026-10-06T11:00:00.000Z', 'Hades'), post(ana, 'rana01', '2026-10-06T10:00:00.000Z')]);
      const page = await open(); // cloudWalls vazio: a nuvem não responde
      const [nova, velha] = posts(page);
      expect(nova.estado).toBe('erro');
      expect(velha.estado).toBe('ficha');
    });

    it('a resenha de uma pessoa nova no Feed, com a página aberta, busca o mural dela', async () => {
      const page = await open();
      cloudWalls.set(bia.codigo, wallOf(bia, [review('rbia01', 'Hollow Knight')]));
      log = [];
      items.set([post(bia, 'rbia01', '2026-10-06T11:00:00.000Z', 'Hollow Knight')]);
      await settle();
      expect(log).toEqual([`ensure(${bia.codigo})`]);
      expect(posts(page)[0].estado).toBe('ficha');
    });

    it('com o mural de alguém ainda vindo, uma resenha nova dela não dispara outro pedido', async () => {
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste')]));
      const page = await open();
      log = [];
      cloudWalls.set(cris.codigo, wallOf(cris, [review('rcri01', 'Hades'), review('rcri02', 'Celeste')]));
      items.update((list) => [post(cris, 'rcri01', '2026-10-06T11:00:00.000Z'), ...list]);
      TestBed.tick(); // a busca do mural da Cris começa
      items.update((list) => [post(cris, 'rcri02', '2026-10-06T11:30:00.000Z'), ...list]); // antes da primeira busca voltar
      await settle();
      expect(log.filter((l) => l === `ensure(${cris.codigo})`).length).toBe(1);
      expect(posts(page).filter((p) => p.key.includes('rcri')).map((p) => p.estado)).toEqual(['ficha', 'ficha']);
    });
  });

  describe('reações às minhas fichas', () => {
    const reagiu = (pessoa: typeof ana, ref: string, em: string, reacao: 'fogo' | 'amei'): FeedItem => ({ tipo: 'reagiu', em, pessoa, ref, titulo: `Obra ${ref}`, mural: 'jogos', silenciado: false, reacao });

    it('reações seguidas à mesma ficha viram um bilhete só, cada pessoa uma vez; outra ficha, outro bilhete', async () => {
      items.set([
        reagiu(ana, 'rminha1', '2026-10-06T10:00:00.000Z', 'fogo'),
        reagiu(bia, 'rminha1', '2026-10-06T09:00:00.000Z', 'amei'),
        reagiu(cris, 'rminha1', '2026-10-06T08:00:00.000Z', 'fogo'),
        reagiu(ana, 'rminha2', '2026-10-05T10:00:00.000Z', 'amei'),
      ]);
      const page = (await open()) as any;
      const blocks = page.blocks().filter((b: any) => b.tipo === 'reagiu');
      expect(blocks.length).toBe(2);
      expect(blocks[0].who.map((w: any) => w.pessoa.nome)).toEqual(['Ana', 'Bia', 'Cris']);
      expect(page.reactedNames(blocks[0])).toBe('Ana, Bia e mais 1');
      expect(page.reactedEmojis(blocks[0])).toEqual(['🔥', '❤️']);
      expect(page.reactedSpoken(blocks[1])).toBe('Ana reagiu com Amei à sua ficha de Obra rminha2');
      // quem só reagiu não tem mural para buscar
      expect(log.some((l) => l.startsWith('ensure'))).toBeFalse();
    });
  });
});
