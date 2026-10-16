import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { CloudMurals } from '../core/cloud-murals';
import { Comments } from '../core/comments';
import { Colleague, ColleagueStore } from '../core/colleague-store';
import { FeedItem, Follow, People } from '../core/follow';
import { CardNotice, Notice } from '../core/notices';
import { ListedPerson, ProfilePeople } from '../core/profile-people';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { Confirm } from '../ui/confirm';
import { FeedPostData } from '../ui/feed-post';
import { PersonFace } from '../ui/person-photo';
import { MailPage } from './mail-page';

/**
 * A aba Amigos (MailPage), sem desenhar a tela: o que ela monta a partir do correio, dos murais dos
 * amigos e do meu mural (os posts do Feed, o estado de cada ficha, a minha nota da mesma obra, o
 * segredo, os avisos, as fotos de perfil, a lista única de Pessoas) e a ordem do que ela faz ao abrir.
 * O serviço do correio (Follow) e os murais da nuvem (CloudMurals) são de mentira. O desenho de cada
 * peça tem o seu teste: ui/feed-post.spec.ts e ui/notice-list.spec.ts.
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
  posts(): FeedPostData[];
  notices(): Notice[];
  boardNotices(): Notice[];
  freshNotices(): ReadonlySet<string>;
  faces(): ReadonlyMap<string, PersonFace>;
  everyone(): { codigo: string; nome: string; sigo: unknown; segue: unknown }[];
  groups(): { id: string; titulo: string; pessoas: { nome: string }[] }[];
  tab(): string;
  bond(x: unknown): string;
  isFresh(item: FeedItem): boolean;
  wish(r: Review): void;
  isWished(r: Review): boolean;
  retryWall(code: string): Promise<void>;
  reveal(p: unknown): void;
  openNotice(n: CardNotice): void;
  onTabKey(e: KeyboardEvent): void;
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
  /** As minhas listas de Seguindo e Seguidores, com o cartão (a foto) de cada pessoa. */
  let myLists: ReturnType<typeof signal<{ seguindo: ListedPerson[]; seguidores: ListedPerson[] } | undefined>>;

  beforeEach(() => {
    localStorage.clear();
    items = signal<FeedItem[]>([]);
    seenAt = signal<string | null>(null);
    people = signal<People | null>(null);
    walls = signal<Colleague[]>([]);
    cloudWalls = new Map();
    log = [];
    needs = [];
    myLists = signal(undefined);
    const profilePeople = {
      of: (code: string) => (code === 'EEEE-0000' && myLists() ? { seguindo: 0, seguidores: 0, listasVisiveis: true, listas: myLists() } : undefined),
      load: async (code: string, lists = false) => void log.push(`pessoas(${code},${lists})`),
    };
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
        { provide: ProfilePeople, useValue: profilePeople },
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

  const posts = (page: Page) => page.posts();

  describe('ao abrir', () => {
    it('busca o correio inteiro, depois um mural por pessoa (uma vez só), e só então marca como visto', async () => {
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z'), post(ana, 'rana02', '2026-10-06T09:00:00.000Z'), post(bia, 'rbia01', '2026-10-05T10:00:00.000Z'), seguiu(cris, '2026-10-04T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste'), review('rana02', 'Hades')]));
      cloudWalls.set(bia.codigo, wallOf(bia, [review('rbia01', 'Hollow Knight')]));
      await open();
      expect(log[0]).toBe('check(true)');
      // as fotos de perfil vêm com as minhas listas de Seguindo e Seguidores
      expect(log).toContain('pessoas(EEEE-0000,true)');
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
    it('cada resenha é um post, do mais novo para o mais velho; quem começou a seguir vai para os Avisos', async () => {
      items.set([
        post(ana, 'rana03', '2026-10-06T10:00:00.000Z'),
        post(ana, 'rana02', '2026-10-06T09:00:00.000Z'),
        post(bia, 'rbia01', '2026-10-06T08:00:00.000Z'),
        seguiu(cris, '2026-10-06T07:00:00.000Z'),
        post(ana, 'rana01', '2026-10-06T06:00:00.000Z'),
      ]);
      const page = await open();
      expect(posts(page).map((p) => `${p.item.pessoa.nome}:${p.item.ref}`)).toEqual(['Ana:rana03', 'Ana:rana02', 'Bia:rbia01', 'Ana:rana01']);
      expect(page.notices().map((n) => `${n.tipo}:${n.people[0].nome}`)).toEqual(['seguiu:Cris']);
      const keys = posts(page).map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length); // chaves únicas para o @for
    });

    it('a ficha do amigo aparece com a minha da mesma obra', async () => {
      store.add(review('rme001', 'Celeste', {}, 7));
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z', 'Celeste')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste', {}, 9)]));
      const page = await open();
      const [p] = posts(page);
      expect(p.estado).toBe('ficha');
      expect(p.theirs!.id).toBe('rana01');
      expect(p.mine!.id).toBe('rme001');
      expect(p.secret).toBeFalse();
      // a ficha do amigo é o alvo das reações e dos comentários do post
      expect(p.target).toEqual({ code: ana.codigo, ref: 'rana01', titulo: 'Celeste', mural: 'jogos' });
    });

    it('a anotação publicada aparece como anotação: sem a minha nota e sem segredo', async () => {
      store.add({ ...review('nme001', 'Compras'), kind: 'anotacoes' });
      items.set([{ ...post(ana, 'nana01', '2026-10-06T10:00:00.000Z', 'Compras'), mural: 'anotacoes' }]);
      cloudWalls.set(ana.codigo, wallOf(ana, [{ ...review('nana01', 'Compras'), kind: 'anotacoes' }]));
      const page = await open();
      const [p] = posts(page);
      expect(p.estado).toBe('ficha');
      expect(p.theirs!.id).toBe('nana01');
      expect(p.mine).toBeNull();
      expect(p.secret).toBeFalse();
      expect(p.item.mural).toBe('anotacoes');
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

    it('o mural veio sem a ficha (a pessoa tirou ou deixou privada): o post não aparece, sem aviso de que saiu', async () => {
      items.set([post(ana, 'rana02', '2026-10-06T11:00:00.000Z', 'Hades'), post(ana, 'rana01', '2026-10-06T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana02', 'Hades')]));
      const page = await open();
      expect(posts(page).map((p) => p.key)).toEqual([`resenha:${ana.codigo}:rana02`]);
    });

    it('privada e publicada de novo: o post volta com a ficha', async () => {
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, wallOf(ana, []));
      const page = await open();
      expect(posts(page)).toEqual([]);
      // no dia seguinte ela publica de novo: o mural novo, com a ficha, chega
      cloudWalls.set(ana.codigo, wallOf(ana, [review('rana01', 'Celeste')]));
      walls.set([wallOf(ana, [review('rana01', 'Celeste')])]);
      await settle();
      expect(posts(page).map((p) => p.estado)).toEqual(['ficha']);
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
      // na tela, em dois grupos: quem espera você seguir de volta, e o resto
      expect(page.groups().map((g) => `${g.titulo}: ${g.pessoas.map((x) => x.nome).join(', ')}`)).toEqual(['Para seguir de volta: Ágata, Bia', 'Suas pessoas: Ana, Cris']);
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
      expect(posts(page).some((p) => p.key.endsWith('rana02'))).toBeFalse();
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

  describe('os Avisos', () => {
    const reagiu = (pessoa: typeof ana, ref: string, em: string, reacao: 'fogo' | 'amei'): FeedItem => ({ tipo: 'reagiu', em, pessoa, ref, titulo: `Obra ${ref}`, mural: 'jogos', silenciado: false, reacao });
    const comentou = (pessoa: typeof ana, ref: string, em: string): FeedItem => ({ tipo: 'comentou', em, pessoa, ref, titulo: `Obra ${ref}`, mural: 'jogos', silenciado: false });

    it('reações seguidas à mesma ficha viram um aviso só; quem só reagiu não tem mural para buscar', async () => {
      items.set([
        reagiu(ana, 'rminha1', '2026-10-06T10:00:00.000Z', 'fogo'),
        reagiu(bia, 'rminha1', '2026-10-06T09:00:00.000Z', 'amei'),
        reagiu(cris, 'rminha1', '2026-10-06T08:00:00.000Z', 'fogo'),
        reagiu(ana, 'rminha2', '2026-10-05T10:00:00.000Z', 'amei'),
      ]);
      const page = await open();
      expect(page.notices().map((n) => n.people.map((p) => p.nome).join('+'))).toEqual(['Ana+Bia+Cris', 'Ana']);
      expect(posts(page)).toEqual([]);
      expect(log.some((l) => l.startsWith('ensure'))).toBeFalse();
    });

    it('o quadro ao lado do Feed mostra só os cinco mais novos; a aba Avisos, todos', async () => {
      items.set(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'].map((ref, i) => reagiu(ana, `minha-${ref}`, `2026-10-06T${String(20 - i).padStart(2, '0')}:00:00.000Z`, 'fogo')));
      const page = await open();
      expect(page.notices().length).toBe(7);
      expect(page.boardNotices().map((n) => n.item.em)).toEqual(page.notices().slice(0, 5).map((n) => n.item.em));
    });

    it('os avisos novos são os de depois do visto que valia quando a página abriu (o número da etiqueta Avisos)', async () => {
      seenAt.set('2026-10-06T08:30:00.000Z');
      items.set([
        post(ana, 'rana01', '2026-10-06T11:00:00.000Z'), // um post novo não é aviso
        reagiu(ana, 'rminha1', '2026-10-06T10:00:00.000Z', 'fogo'),
        comentou(cris, 'rminha2', '2026-10-06T09:00:00.000Z'),
        reagiu(bia, 'rminha3', '2026-10-06T08:00:00.000Z', 'amei'),
        seguiu(bia, '2026-10-06T07:00:00.000Z'),
      ]);
      const page = await open();
      const fresh = page.notices().filter((n) => page.freshNotices().has(n.key));
      expect(fresh.map((n) => n.tipo)).toEqual(['reagiu', 'comentou']);
      // abrir marcou como visto, mas o "Novo" fica enquanto a página estiver aberta
      seenAt.set('2026-10-06T23:00:00.000Z');
      expect(page.freshNotices().size).toBe(2);
    });

    it('tocar num aviso de reação abre a minha ficha; num de comentário, já com a folha de comentários', async () => {
      const mine = review('rminha1', 'Hades');
      store.add(mine);
      items.set([comentou(ana, 'rminha1', '2026-10-06T10:00:00.000Z'), reagiu(bia, 'rminha1', '2026-10-06T09:00:00.000Z', 'fogo'), comentou(cris, 'rsumiu', '2026-10-06T08:00:00.000Z')]);
      const page = await open();
      const [comment, reaction, gone] = page.notices() as CardNotice[];
      const comments = TestBed.inject(Comments);
      page.openNotice(reaction);
      expect(comments.take('rminha1')).toBeFalse();
      page.openNotice(comment);
      // o pedido fica guardado para a leitura que abrir essa ficha (e só para ela)
      expect(comments.take('rminha1')).toBeTrue();
      expect(comments.take('rminha1')).toBeFalse();
      // a ficha que eu já tirei do mural: o aviso fica, mas não abre nada
      expect(() => page.openNotice(gone)).not.toThrow();
      expect(comments.take('rsumiu')).toBeFalse();
    });
  });

  describe('as fotos de perfil', () => {
    it('vêm do cartão das minhas listas e, de quem tem o mural aqui, do perfil dele (o mais novo)', async () => {
      myLists.set({
        seguindo: [
          { ...ana, cartao: { emoji: '🐙', cor: 'rosa', fundo: null, linha: '', fichas: null, murais: null } },
          { ...bia, cartao: { emoji: '🌵', cor: 'laranja', fundo: null, linha: '', fichas: null, murais: null } },
        ],
        seguidores: [{ ...cris, cartao: null }],
      });
      items.set([post(ana, 'rana01', '2026-10-06T10:00:00.000Z')]);
      cloudWalls.set(ana.codigo, { ...wallOf(ana, [review('rana01', 'Celeste')]), profile: { emoji: '🦑', photo: 'azul' } } as unknown as Colleague);
      const page = await open();
      expect(page.faces().get(ana.codigo)).toEqual({ emoji: '🦑', cor: 'azul' });
      expect(page.faces().get(bia.codigo)).toEqual({ emoji: '🌵', cor: 'laranja' });
      // sem foto: fica a inicial
      expect(page.faces().has(cris.codigo)).toBeFalse();
    });
  });

  describe('as três partes', () => {
    const key = (k: string) => new KeyboardEvent('keydown', { key: k, cancelable: true });

    it('abre no Feed, e as setas dão a volta pelas três; Home e End vão às pontas', async () => {
      const page = await open();
      expect(page.tab()).toBe('chegou');
      page.onTabKey(key('ArrowRight'));
      expect(page.tab()).toBe('avisos');
      page.onTabKey(key('ArrowRight'));
      expect(page.tab()).toBe('pessoas');
      page.onTabKey(key('ArrowRight'));
      expect(page.tab()).toBe('chegou');
      page.onTabKey(key('ArrowLeft'));
      expect(page.tab()).toBe('pessoas');
      page.onTabKey(key('Home'));
      expect(page.tab()).toBe('chegou');
      page.onTabKey(key('End'));
      expect(page.tab()).toBe('pessoas');
      // outra tecla não mexe em nada
      const other = key('a');
      page.onTabKey(other);
      expect(page.tab()).toBe('pessoas');
      expect(other.defaultPrevented).toBeFalse();
    });
  });
});
