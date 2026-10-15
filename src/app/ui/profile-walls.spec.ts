import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Kind } from '../core/kinds';
import { Profile, defaultProfile } from '../core/profile';
import { Review, sanitizeReview } from '../core/review';
import { ProfileWalls } from './profile-walls';

function card(id: string, kind: Kind, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    kind,
    game: { name: `Obra ${id}`, coverUrl: null, source: 'manual' },
    scores: { final: 8 },
    status: 'finalizado',
    text: '',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...extra,
  })!;
}

/** Duas fichas em cada um dos sete murais. */
const ALL: Review[] = (['jogos', 'livros', 'filmes', 'series', 'animes', 'musicas', 'anotacoes'] as Kind[]).flatMap((k) => [card(`${k}1`, k), card(`${k}2`, k)]);

describe('as pastas dos murais no perfil', () => {
  let fixture: ComponentFixture<ProfileWalls>;
  let el: HTMLElement;
  let opened: Kind[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ProfileWalls], providers: [provideZonelessChangeDetection(), provideRouter([])] });
  });

  afterEach(() => {
    el?.remove();
    fixture?.destroy();
  });

  async function show(profile: Partial<Profile>, cards: Review[] = ALL, width = 1100): Promise<void> {
    fixture = TestBed.createComponent(ProfileWalls);
    fixture.componentRef.setInput('profile', { ...defaultProfile(), ...profile });
    fixture.componentRef.setInput('cards', cards);
    fixture.componentRef.setInput('name', 'Bia');
    opened = [];
    fixture.componentInstance.opened.subscribe((k) => opened.push(k));
    el = fixture.nativeElement as HTMLElement;
    el.style.width = `${width}px`;
    document.body.appendChild(el);
    await fixture.whenStable();
  }

  const rows = (selector: string) => new Set(Array.from(el.querySelectorAll(selector)).map((b) => Math.round(b.getBoundingClientRect().top))).size;

  it('sem escolher, as pastas grandes de sempre', async () => {
    await show({});
    expect(el.querySelectorAll('.pasta-mural').length).toBe(7);
    expect(el.querySelector('.arquivo')).toBeNull();
  });

  it('o arquivo: uma pasta por mural com fichas à mostra, o número, o texto e o nome na aba', async () => {
    await show({ wallsLook: 'arquivo', walls: { livros: { hidden: true }, jogos: { text: 'Os que eu zerei' } } }, [...ALL, card('jogos3', 'jogos')]);
    expect(el.querySelector('.pastas')).toBeNull();
    const folders = Array.from(el.querySelectorAll<HTMLButtonElement>('.suspensa'));
    // a pasta escondida fica de fora
    expect(folders.length).toBe(6);
    const first = folders[0];
    expect(first.getAttribute('aria-label')).toBe('Abrir o Mural de jogos de Bia, 3 jogos');
    expect(first.querySelector('.numero')!.textContent!.trim()).toBe('3');
    expect(first.querySelector('.linha')!.textContent!.trim()).toBe('Os que eu zerei');
    // o texto inteiro no title, já que a frente corta em duas linhas
    expect(first.title).toBe('Os que eu zerei');
    expect(first.querySelector('.aba-nome')!.textContent!.trim()).toBe('jogos');
    expect(folders[1].querySelector('.linha')).toBeNull();
    expect(folders[1].hasAttribute('title')).toBeFalse();
    folders[1].click();
    expect(opened).toEqual(['filmes']);
  });

  it('o arquivo é compacto: os sete murais numa fileira no largo, duas por linha no celular, sem nome cortado', async () => {
    await show({ wallsLook: 'arquivo' }, ALL, 1100);
    expect(rows('.suspensa-item')).toBe(1);
    const wide = el.querySelector('.murais')!.getBoundingClientRect().height;

    el.style.width = '340px';
    await fixture.whenStable();
    expect(rows('.suspensa-item')).toBe(4);
    for (const name of Array.from(el.querySelectorAll<HTMLElement>('.aba-nome'))) {
      expect(name.scrollWidth).withContext(name.textContent!).toBeLessThanOrEqual(name.clientWidth);
    }

    // as pastas grandes, na mesma largura, ocupam bem mais
    fixture.componentRef.setInput('profile', defaultProfile());
    el.style.width = '1100px';
    await fixture.whenStable();
    expect(el.querySelector('.murais')!.getBoundingClientRect().height).toBeGreaterThan(wide * 2);
  });
});
