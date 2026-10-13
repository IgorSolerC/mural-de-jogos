import { Component, input, output, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Comments } from '../core/comments';
import { ReactionId } from '../core/reaction-kinds';
import { Reaction, Reactions } from '../core/reactions';
import { Review, sanitizeReview } from '../core/review';
import { scoreDisplay } from '../core/settings';
import { FeedPost, FeedPostData } from './feed-post';
import { PersonFace } from './person-photo';
import { ReviewCard } from './review-card';

/**
 * Um post do Feed de Amigos, desenhado de verdade: quem pregou e há quanto tempo, a ficha (ou o que
 * aparece no lugar dela enquanto o mural não vem) e o pé com o reagir, o comentar e, na ponta, a
 * diferença para a minha nota ou o "Quero jogar". A ficha em si é de mentira: ela tem os testes dela.
 */

@Component({
  selector: 'app-review-card',
  template: `<button type="button" class="ficha-de-mentira" (click)="opened.emit(review().id)">{{ review().game.name }}</button>`,
})
class StubCard {
  readonly review = input.required<Review>();
  readonly preview = input(false);
  readonly masked = input(false);
  readonly reactCode = input<string | null>(null);
  readonly opened = output<string>();
}

const ANA = { codigo: 'AAAA-1111', nome: 'Ana' };

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

/** As notas de cada categoria são inteiras; a Média sai quebrada (a Diversão pesa em dobro): 7,6 e 9,8. */
const SEVEN_SIX = { historia: 8, diversao: 7, jogabilidade: 8, visual: 8 } as Review['scores'];
const NINE_EIGHT = { historia: 10, diversao: 10, jogabilidade: 10, visual: 9 } as Review['scores'];

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

function data(extra: Partial<FeedPostData> = {}, mural: 'jogos' | 'series' | 'anotacoes' = 'jogos'): FeedPostData {
  const item = { tipo: 'resenha' as const, em: minutesAgo(125), pessoa: ANA, ref: 'rana01', titulo: 'Hades', mural, silenciado: false };
  return {
    key: `resenha:${ANA.codigo}:rana01`,
    item,
    theirs: review('rana01', 'Hades', {}, 9),
    mine: null,
    secret: false,
    target: { code: ANA.codigo, ref: 'rana01', titulo: 'Hades', mural },
    estado: 'ficha',
    ...extra,
  };
}

@Component({
  imports: [FeedPost],
  template: `
    <app-feed-post
      [post]="post()"
      [fresh]="fresh()"
      [face]="face()"
      [wished]="wished()"
      (profile)="log.push('perfil')"
      (opened)="log.push($event.comments ? 'comentarios' : 'ficha')"
      (revealed)="log.push('revelar')"
      (wish)="log.push('quero')"
      (retry)="log.push('tentar')"
    />
  `,
})
class Host {
  readonly post = signal(data());
  readonly fresh = signal(false);
  readonly face = signal<PersonFace | null>(null);
  readonly wished = signal(false);
  readonly log: string[] = [];
}

describe('Um post do Feed (FeedPost)', () => {
  let can: ReturnType<typeof signal<boolean>>;
  let mine: ReturnType<typeof signal<ReactionId | null>>;
  let count: ReturnType<typeof signal<number>>;
  /** Quem reagiu à ficha do post. */
  let given: ReturnType<typeof signal<Reaction[]>>;
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let el: HTMLElement;

  const text = (selector: string) => el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const labels = () => [...el.querySelectorAll<HTMLElement>('.pe button')].map((b) => b.getAttribute('aria-label') ?? b.textContent?.replace(/\s+/g, ' ').trim());
  const click = (selector: string) => el.querySelector<HTMLElement>(selector)!.click();

  async function show(post: FeedPostData = data()): Promise<void> {
    host.post.set(post);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    can = signal(true);
    mine = signal<ReactionId | null>(null);
    count = signal(0);
    given = signal<Reaction[]>([]);
    // as notas como foram dadas (outro teste pode ter deixado Inteiras ligado)
    scoreDisplay.set('livre');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: Reactions,
          useValue: { canReact: () => can(), mineOn: () => mine(), react: async (_: unknown, r: ReactionId | null) => void mine.set(r), of: () => given(), myCode: () => 'EEEE-0000' },
        },
        { provide: Comments, useValue: { countOf: () => count() } },
      ],
    });
    TestBed.overrideComponent(FeedPost, { remove: { imports: [ReviewCard] }, add: { imports: [StubCard] } });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    await show();
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('quem pregou', () => {
    it('diz o nome, o que a pessoa fez e há quanto tempo; o nome abre o perfil', async () => {
      expect(text('.nome')).toBe('Ana');
      expect(text('.verbo')).toBe('avaliou um jogo');
      expect(text('.quando')).toBe('há 2 h');
      expect(el.querySelector('.quando')?.getAttribute('datetime')).toBe(host.post().item.em);
      click('.nome');
      expect(host.log).toEqual(['perfil']);
    });

    it('a foto abre o mesmo perfil, só para o mouse (o leitor de tela e o teclado vão pelo nome)', async () => {
      const photo = el.querySelector<HTMLButtonElement>('.quem .foto-perfil')!;
      expect([photo.getAttribute('aria-hidden'), photo.tabIndex]).toEqual(['true', -1]);
      expect(photo.querySelector('app-person-photo')).not.toBeNull();
      photo.click();
      expect(host.log).toEqual(['perfil']);
    });

    it('o que ela fez acompanha o mural e a ficha: "uma série", uma rejogada, uma anotação', async () => {
      await show(data({}, 'series'));
      expect(text('.verbo')).toBe('avaliou uma série');
      await show(data({ theirs: review('rana02', 'Hades', { revisitOf: 'rana01' }) }));
      expect(text('.verbo')).toBe('escreveu uma rejogada');
      await show(data({ theirs: { ...review('nana01', 'Compras'), kind: 'anotacoes' } }, 'anotacoes'));
      expect(text('.verbo')).toBe('publicou uma anotação');
    });

    it('o que ela fez vai sempre embaixo do nome, mesmo cabendo ao lado; a hora na ponta da linha do nome', async () => {
      const box = (selector: string) => el.querySelector(selector)!.getBoundingClientRect();
      el.style.width = '424px';
      for (const post of [data(), data({}, 'series'), data({ theirs: { ...review('nana01', 'Compras'), kind: 'anotacoes' } }, 'anotacoes')]) {
        await show(post);
        const [name, verb, when] = [box('.nome'), box('.verbo'), box('.quando')];
        const what = text('.verbo');
        expect(verb.top).withContext(`"${what}" embaixo do nome`).toBeGreaterThan(name.top + name.height / 2);
        expect(Math.abs(verb.left - name.left)).withContext(`"${what}" começa onde o nome começa`).toBeLessThan(2);
        expect(when.bottom).withContext('a hora na linha do nome').toBeLessThanOrEqual(verb.top + 1);
        expect(when.left).withContext('a hora depois do nome').toBeGreaterThan(name.right);
      }
    });

    it('num post estreito a hora desce para o lado do que ela fez, e o nome continua em cima', async () => {
      const box = (selector: string) => el.querySelector(selector)!.getBoundingClientRect();
      el.style.width = '320px';
      await show();
      const [name, verb, when] = [box('.nome'), box('.verbo'), box('.quando')];
      expect(verb.top).withContext('embaixo do nome').toBeGreaterThan(name.top + name.height / 2);
      expect(when.left).withContext('a hora ao lado').toBeGreaterThanOrEqual(verb.right);
      expect(when.top).withContext('a hora na mesma linha').toBeLessThan(verb.bottom);
      expect(when.bottom).toBeGreaterThan(verb.top);
    });

    it('o leitor de tela ouve um título por post, com a obra (e o "novo")', async () => {
      const heading = () => text('h2');
      expect(heading()).toBe('Ana avaliou um jogo: Hades, há 2 h');
      expect(el.querySelector('article')?.getAttribute('aria-labelledby')).toBe(el.querySelector('h2')?.id);
      host.fresh.set(true);
      await show();
      expect(heading()).toBe('Ana avaliou um jogo: Hades, há 2 h (novo)');
      expect(text('.novo')).toBe('Novo');
    });

    it('com foto, o emoji na cartolina da pessoa; sem ela, a inicial', async () => {
      expect(text('app-person-photo .pf-inicial')).toBe('A');
      host.face.set({ emoji: '🐙', cor: 'rosa' });
      await show();
      expect(text('app-person-photo .pf-emoji')).toBe('🐙');
      expect(el.querySelector('app-person-photo')?.getAttribute('data-cor')).toBe('rosa');
    });
  });

  describe('a ficha', () => {
    it('tocar nela abre a leitura (sem os comentários)', async () => {
      click('.ficha-de-mentira');
      expect(host.log).toEqual(['ficha']);
    });

    it('a anotação com categoria desce para dar lugar à orelha, que não fica em cima de quem pregou', async () => {
      const note = (extra: Partial<Review> = {}) => data({ theirs: { ...review('nana01', 'Compras'), kind: 'anotacoes', ...extra } }, 'anotacoes');
      const gap = () => el.querySelector('.lugar')!.getBoundingClientRect().top - el.querySelector('.quem')!.getBoundingClientRect().bottom;
      el.style.width = '424px';
      // sem categoria, e uma ficha de jogo: a distância de sempre
      expect(el.querySelector('.lugar')?.classList).not.toContain('com-orelha');
      const usual = gap();
      await show(note());
      expect(el.querySelector('.lugar')?.classList).not.toContain('com-orelha');
      expect(gap()).toBe(usual);
      // com categoria: a orelha sobe até 38px acima da ficha (32 dela, 6 do mouse em cima)
      await show(note({ category: 'Artezinha' }));
      expect(el.querySelector('.lugar')?.classList).toContain('com-orelha');
      expect(gap()).withContext('cabe a orelha levantada, com folga').toBeGreaterThanOrEqual(38 + 8);
    });

    it('enquanto o mural vem, uma cartolina com o nome da obra dizendo que está buscando, e nenhum pé', async () => {
      await show(data({ theirs: null, estado: 'buscando' }));
      expect(text('.espera-titulo')).toBe('Hades');
      expect(el.querySelector('.espera [role="status"]')?.textContent).toContain('Buscando a ficha no mural de Ana');
      expect(el.querySelector('.pe')).toBeNull();
    });

    it('o mural não veio: "Tentar de novo"', async () => {
      await show(data({ theirs: null, estado: 'erro' }));
      expect(text('.espera-txt')).toBe('Não consegui buscar o mural de Ana agora.');
      click('.tentar');
      expect(host.log).toEqual(['tentar']);
    });

    it('a pessoa tirou a ficha: só o lugar dela, sem botão', async () => {
      await show(data({ theirs: null, estado: 'saiu' }));
      expect(el.querySelector('.espera')?.classList).toContain('saiu');
      expect(text('.espera-txt')).toBe('Ana tirou essa ficha do mural.');
      expect(el.querySelector('.espera button')).toBeNull();
    });
  });

  describe('o pé', () => {
    it('eu ainda não avaliei: Reagir, Comentar e, na ponta, "Quero jogar"', async () => {
      expect(labels()).toEqual(['Reagir', 'Comentar', 'Quero jogar']);
      click('.querer');
      expect(host.log).toEqual(['quero']);
      // já na wishlist: o botão vira a frase
      host.wished.set(true);
      await show();
      expect(el.querySelector('.querer')).toBeNull();
      expect(text('.guardada')).toBe('Na sua wishlist');
    });

    it('eu avaliei a mesma obra: o bilhete com a diferença, na caneta do amigo, e a minha nota', async () => {
      await show(data({ mine: review('rme001', 'Hades', { scores: SEVEN_SIX }) }));
      expect(text('.placar-n')).toBe('+1,4');
      expect(text('.placar-txt')).toBe('que você');
      expect(text('.placar-voce')).toBe('Você deu 7,6');
      expect(text('.placar .sr-only')).toBe('Ana deu +1,4 que você.');
      // com a minha nota, nada de wishlist
      expect(el.querySelector('.querer, .guardada')).toBeNull();
    });

    it('a diferença para menos leva o sinal de menos; a mesma nota, o igual', async () => {
      await show(data({ mine: review('rme001', 'Hades', { scores: NINE_EIGHT }) }));
      expect(text('.placar-n')).toBe('−0,8');
      await show(data({ mine: review('rme001', 'Hades', {}, 9) }));
      expect(text('.placar-n')).toBe('=');
      expect(text('.placar-txt')).toBe('a mesma nota');
      expect(text('.placar .sr-only')).toBe('Ana deu a mesma nota que você.');
    });

    it('com as notas em Inteiras (Ajustes › Mural), a diferença é a das notas como aparecem', async () => {
      scoreDisplay.set('inteiro');
      await show(data({ mine: review('rme001', 'Hades', { scores: SEVEN_SIX }) }));
      expect(text('.placar-n')).toBe('+1');
      expect(text('.placar-voce')).toBe('Você deu 8');
      scoreDisplay.set('livre');
    });

    it('o Comentar abre a ficha já nos comentários, e mostra quantos ela tem', async () => {
      click('.comentar');
      expect(host.log).toEqual(['comentarios']);
      count.set(4);
      await show();
      expect(text('.comentar')).toBe('4');
      expect(el.querySelector('.comentar')?.getAttribute('aria-label')).toBe('4 comentários. Abrir');
    });

    it('em segredo: o Revelar aparece (e diz de qual ficha), e revela só esta', async () => {
      await show(data({ secret: true }));
      expect(labels()).toEqual(['Reagir', 'Comentar', 'Revelar spoilers: Hades', 'Quero jogar']);
      expect(el.querySelector('.pe')?.classList).toContain('com-segredo');
      click('.pe button[aria-label^="Revelar"]');
      expect(host.log).toEqual(['revelar']);
    });

    it('a anotação não tem nota nem wishlist: só reagir e comentar', async () => {
      await show(data({ theirs: { ...review('nana01', 'Compras'), kind: 'anotacoes' } }, 'anotacoes'));
      expect(labels()).toEqual(['Reagir', 'Comentar']);
      expect(el.querySelector('.placar, .querer, .guardada')).toBeNull();
    });

    it('sem poder reagir (não sigo a pessoa, ou a lista ainda não veio): some o Reagir; ler os comentários, todo mundo lê', async () => {
      can.set(false);
      await show();
      expect(labels()).toEqual(['Comentar', 'Quero jogar']);
    });

    it('as reações dos outros aparecem no pé, num remendo que diz quantas são; só a minha, não (ela já está no botão)', async () => {
      const at = new Date().toISOString();
      expect(el.querySelector('.contagem')).toBeNull();
      given.set([{ codigo: 'EEEE-0000', nome: 'Eu', reacao: 'fogo', em: at }]);
      await show();
      expect(el.querySelector('.contagem')).toBeNull();
      given.set([
        { codigo: 'EEEE-0000', nome: 'Eu', reacao: 'fogo', em: at },
        { codigo: 'BBBB-2222', nome: 'Bia', reacao: 'amei', em: at },
      ]);
      await show();
      expect(el.querySelector('.contagem .balao')?.getAttribute('aria-label')).toBe('Reações: 1 Amei e 1 Fogo. Ver quem reagiu');
      // a ficha do Feed não leva os remendos na quina: cada número aparece uma vez só
      expect(fixture.debugElement.query(By.directive(StubCard)).componentInstance.reactCode()).toBeNull();
    });

    it('a reação que eu dei fica à mostra no botão, como um remendo', async () => {
      const button = () => el.querySelector<HTMLElement>('app-reaction-picker .reagir')!;
      expect(button().classList).toContain('giz');
      expect(button().classList).not.toContain('dada');
      mine.set('fogo');
      await show();
      expect(button().classList).toContain('dada');
      expect(button().getAttribute('aria-label')).toBe('Sua reação: Fogo. Trocar');
      expect(button().textContent).toContain('🔥');
    });
  });
});
