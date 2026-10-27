import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeedItem, Follow, Person } from '../core/follow';
import { AccessNotice, CardNotice, Notice, groupNotices } from '../core/notices';
import { ReviewStore } from '../core/review-store';
import { NoticeList } from './notice-list';
import { PersonFace } from './person-photo';

/**
 * A lista de avisos de Amigos, desenhada de verdade: a frase de cada aviso, a foto e o remendo de
 * quem foi, o "Novo", o que a linha abre e o "Seguir de volta".
 */

const ANA = { codigo: 'AAAA-1111', nome: 'Ana' };
const BIA = { codigo: 'BBBB-2222', nome: 'Bia' };
const CRIS = { codigo: 'CCCC-3333', nome: 'Cris' };

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
/** Os avisos, com as horas contadas de agora: montados no começo de cada teste (contados ao carregar o
 * arquivo, um teste que rodava um minuto depois via "há 6 min" no lugar de "há 5 min"). */
const feed = (): FeedItem[] => [
  { tipo: 'reagiu', em: minutesAgo(5), pessoa: ANA, ref: 'rminha1', titulo: 'Hades', mural: 'jogos', silenciado: false, reacao: 'fogo' },
  { tipo: 'reagiu', em: minutesAgo(9), pessoa: BIA, ref: 'rminha1', titulo: 'Hades', mural: 'jogos', silenciado: false, reacao: 'amei' },
  { tipo: 'comentou', em: minutesAgo(70), pessoa: BIA, ref: 'nminha2', titulo: 'Compras', mural: 'anotacoes', silenciado: false },
  { tipo: 'seguiu', em: minutesAgo(200), pessoa: CRIS, euSigo: false },
  { tipo: 'seguiu', em: minutesAgo(300), pessoa: ANA, euSigo: true },
  { tipo: 'comentou', em: minutesAgo(400), pessoa: ANA, ref: 'rsumiu', titulo: 'Celeste', mural: 'jogos', silenciado: false },
];

@Component({
  imports: [NoticeList],
  template: `
    <app-notice-list
      [notices]="notices()"
      [faces]="faces()"
      [fresh]="fresh()"
      [following]="following()"
      [waiting]="!!following()"
      (profile)="profiles.push($event)"
      (card)="cards.push($event)"
      (followBack)="followed.push($event)"
      (access)="accessed.push($event)"
    />
  `,
})
class Host {
  readonly notices = signal<Notice[]>(groupNotices(feed()));
  readonly faces = signal<ReadonlyMap<string, PersonFace>>(new Map());
  readonly fresh = signal<ReadonlySet<string>>(new Set());
  readonly following = signal<string | null>(null);
  readonly profiles: Person[] = [];
  readonly cards: CardNotice[] = [];
  readonly followed: Person[] = [];
  readonly accessed: AccessNotice[] = [];
}

describe('A lista de avisos (NoticeList)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let el: HTMLElement;
  /** Quem eu sigo, como o correio sabe (null: a lista ainda não veio). */
  let known: ReturnType<typeof signal<ReadonlySet<string> | null>>;

  const rows = () => [...el.querySelectorAll<HTMLElement>('.aviso')];
  /** A frase como se vê: sem a parte que só o leitor de tela ouve. */
  const seen = (row: HTMLElement) => {
    const text = row.querySelector('.texto')!.cloneNode(true) as HTMLElement;
    text.querySelector('.sr-only')?.remove();
    return text.textContent?.replace(/\s+/g, ' ').trim();
  };
  const refresh = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    known = signal<ReadonlySet<string> | null>(null);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Follow, useValue: { isFollowing: (code: string) => known()?.has(code) ?? null } },
        // das minhas fichas avisadas, só a "rsumiu" já não está no mural
        { provide: ReviewStore, useValue: { get: (id: string) => (id === 'rsumiu' ? undefined : { id }) } },
      ],
    });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    await refresh();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('uma linha por aviso, com a frase de cada um e há quanto tempo', () => {
    expect(rows().map(seen)).toEqual([
      'Ana e Bia reagiram à sua ficha de Hades',
      'Bia comentou na sua anotação Compras',
      'Cris começou a seguir você',
      'Ana começou a seguir você',
      'Ana comentou na sua ficha de Celeste',
    ]);
    expect(rows().map((r) => r.querySelector('time')?.textContent?.trim())).toEqual(['há 5 min', 'há 1 h', 'há 3 h', 'há 5 h', 'há 6 h']);
  });

  it('o leitor de tela ouve a frase inteira, com a reação pelo nome', () => {
    expect(rows()[0].querySelector('.texto .sr-only')?.textContent).toBe('Ana e Bia reagiram com Fogo, Amei à sua ficha de Hades. ');
  });

  it('a foto de quem foi (duas, no máximo) e o remendo com o que a pessoa fez', async () => {
    host.faces.set(new Map([[ANA.codigo, { emoji: '🐙', cor: 'rosa' }]]));
    await refresh();
    const [reacted, commented, followed] = rows();
    expect([...reacted.querySelectorAll('app-person-photo')].map((p) => p.textContent?.trim())).toEqual(['🐙', 'B']);
    expect(reacted.querySelector('.selo')?.textContent?.replace(/\s+/g, '')).toBe('🔥❤️');
    expect(commented.querySelector('.selo lucide-icon')).not.toBeNull();
    expect(followed.querySelector('.selo lucide-icon')).not.toBeNull();
    // é enfeite: a frase já diz tudo
    expect(reacted.querySelector('.fotos')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('o "Novo" só nos avisos que chegaram depois da última visita', async () => {
    expect(el.querySelector('.novo')).toBeNull();
    host.fresh.set(new Set([host.notices()[1].key]));
    await refresh();
    expect(rows().map((r) => !!r.querySelector('.novo'))).toEqual([false, true, false, false, false]);
  });

  it('a linha abre a minha ficha; a de quem começou a seguir, o perfil da pessoa', () => {
    const [reacted, commented, followed] = rows();
    expect(reacted.querySelector('.abre')?.getAttribute('aria-label')).toBe('Ver a ficha Hades');
    expect(commented.querySelector('.abre')?.getAttribute('aria-label')).toBe('Ver os comentários de Compras');
    commented.querySelector<HTMLElement>('.abre')!.click();
    expect(host.cards.map((n) => `${n.tipo}:${n.item.ref}`)).toEqual(['comentou:nminha2']);
    expect(followed.querySelector('.abre')?.getAttribute('aria-label')).toBe('Ver o perfil de Cris');
    followed.querySelector<HTMLElement>('.abre')!.click();
    expect(host.profiles).toEqual([CRIS]);
  });

  it('a ficha que eu já tirei do mural: o aviso fica, sem ficha para abrir (o perfil de quem foi, sim)', () => {
    expect(rows()[4].querySelector('.abre')).toBeNull();
    rows()[4].querySelector<HTMLElement>('.gente-link')!.click();
    expect(host.profiles).toEqual([ANA]);
  });

  it('o nome de cada pessoa leva ao perfil dela, mesmo quando a linha abre a ficha', () => {
    const [reacted] = rows();
    const names = [...reacted.querySelectorAll<HTMLElement>('.gente-link')];
    expect(names.map((n) => n.getAttribute('aria-label'))).toEqual(['Ver o perfil de Ana', 'Ver o perfil de Bia']);
    names[1].click();
    names[0].click();
    expect(host.profiles).toEqual([BIA, ANA]);
    expect(host.cards).toEqual([]);
  });

  it('com mais de duas pessoas, só as duas primeiras têm nome (e perfil): "Ana, Bia e mais 2"', async () => {
    const DANI = { codigo: 'DDDD-4444', nome: 'Dani' };
    const react = (pessoa: Person, min: number): FeedItem => ({ tipo: 'reagiu', em: minutesAgo(min), pessoa, ref: 'rminha1', titulo: 'Hades', mural: 'jogos', silenciado: false, reacao: 'fogo' });
    host.notices.set(groupNotices([react(ANA, 1), react(BIA, 2), react(CRIS, 3), react(DANI, 4)]));
    await refresh();
    expect(seen(rows()[0])).toBe('Ana, Bia e mais 2 reagiram à sua ficha de Hades');
    expect(rows()[0].querySelectorAll('.gente-link').length).toBe(2);
  });

  it('a foto de cada pessoa leva ao perfil dela, só para o mouse (o leitor de tela e o teclado vão pelo nome)', () => {
    const photos = [...rows()[0].querySelectorAll<HTMLButtonElement>('.fotos .foto-perfil')];
    expect(photos.map((p) => p.tabIndex)).toEqual([-1, -1]);
    photos[1].click();
    expect(host.profiles).toEqual([BIA]);
    expect(host.cards).toEqual([]);
  });

  it('quem começou a seguir: "Seguir de volta", ou "Vocês se seguem" quando eu já sigo', async () => {
    // sem a lista de quem eu sigo, vale o que o próprio aviso diz
    const [, , cris, ana] = rows();
    expect(cris.querySelector('.seguir')?.textContent?.trim()).toBe('Seguir de volta');
    expect(cris.querySelector('.seguir')?.getAttribute('aria-label')).toBe('Seguir Cris de volta');
    expect(ana.querySelector('.mutuo')?.textContent?.trim()).toBe('Vocês se seguem');
    cris.querySelector<HTMLElement>('.seguir')!.click();
    expect(host.followed).toEqual([CRIS]);
    // com a lista, vale ela: agora eu sigo a Cris e não sigo mais a Ana
    known.set(new Set([CRIS.codigo]));
    await refresh();
    expect(rows()[2].querySelector('.mutuo')).not.toBeNull();
    expect(rows()[3].querySelector('.seguir')).not.toBeNull();
  });

  it('enquanto o seguir de volta vai, o botão espera e diz que está seguindo', async () => {
    host.following.set(CRIS.codigo);
    await refresh();
    const button = rows()[2].querySelector<HTMLButtonElement>('.seguir')!;
    expect(button.disabled).toBeTrue();
    expect(button.textContent?.trim()).toBe('Seguindo…');
    expect(button.getAttribute('aria-busy')).toBe('true');
    // é o botão de tinta (.forte), e esperando não desbota como o desligado
    expect(button.classList).toContain('forte');
    expect(getComputedStyle(button).opacity).toBe('1');
    expect(getComputedStyle(button).backgroundColor).toBe('rgb(21, 21, 21)');
  });

  it('um acesso novo (conector ou chave): o disco com o ícone, a frase, o "Não foi você?" e a linha abre Acessos', async () => {
    const IGOR = { codigo: 'EEEE-0000', nome: 'Igor' };
    host.notices.set(
      groupNotices([
        { tipo: 'acesso', em: minutesAgo(2), pessoa: IGOR, ref: 'ch_AAAAAAAAAAAAAAAA', nome: 'Claude', conector: 'claude.ai', silenciado: false },
        { tipo: 'acesso', em: minutesAgo(4), pessoa: IGOR, ref: 'ch_BBBBBBBBBBBBBBBB', nome: 'Script dos gastos', conector: null, silenciado: false },
      ]),
    );
    await refresh();
    expect(rows().map(seen)).toEqual(['O conector Claude ganhou acesso ao seu Murall (claude.ai)', 'Chave de API criada: Script dos gastos']);
    expect(rows()[0].querySelector('.texto .sr-only')?.textContent).toBe('O conector Claude (claude.ai) ganhou acesso ao seu Murall. ');
    expect(rows()[0].querySelector('.disco-acesso')).not.toBeNull();
    expect(rows()[0].querySelector('app-person-photo')).toBeNull();
    expect(rows()[1].querySelector('.cuidado-acesso')!.textContent).toBe('Não foi você? Apague em Acessos.');
    rows()[1].querySelector<HTMLButtonElement>('button.abre')!.click();
    expect(host.accessed.map((n) => n.item.ref)).toEqual(['ch_BBBBBBBBBBBBBBBB']);
  });
});
