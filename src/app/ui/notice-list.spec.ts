import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeedItem, Follow, Person } from '../core/follow';
import { CardNotice, Notice, groupNotices } from '../core/notices';
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
const FEED: FeedItem[] = [
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
    />
  `,
})
class Host {
  readonly notices = signal<Notice[]>(groupNotices(FEED));
  readonly faces = signal<ReadonlyMap<string, PersonFace>>(new Map());
  readonly fresh = signal<ReadonlySet<string>>(new Set());
  readonly following = signal<string | null>(null);
  readonly profiles: Person[] = [];
  readonly cards: CardNotice[] = [];
  readonly followed: Person[] = [];
}

describe('A lista de avisos (NoticeList)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let el: HTMLElement;
  /** Quem eu sigo, como o correio sabe (null: a lista ainda não veio). */
  let known: ReturnType<typeof signal<ReadonlySet<string> | null>>;

  const rows = () => [...el.querySelectorAll<HTMLElement>('.aviso')];
  const seen = (row: HTMLElement) => row.querySelector('.texto [aria-hidden]')?.textContent?.replace(/\s+/g, ' ').trim();
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

  it('a ficha que eu já tirei do mural: o aviso fica, sem nada para abrir', () => {
    expect(rows()[4].querySelector('button')).toBeNull();
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
  });
});
