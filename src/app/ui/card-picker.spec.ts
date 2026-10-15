import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { CardPicker } from './card-picker';

function card(id: string, name: string, kind: string, updatedAt: string, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    kind,
    game: { name, coverUrl: null, source: 'manual' },
    scores: { diversao: 9, historia: 8, jogabilidade: 9, visual: 8, envolvimento: 8, personagens: 8, escrita: 8 },
    status: 'finalizado',
    text: '',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt,
    ...extra,
  })!;
}

describe('escolher a ficha da Nota', () => {
  let fixture: ComponentFixture<CardPicker>;
  let el: HTMLElement;
  let picked: Review[];

  async function open(chosen = '', selfId: string | null = null): Promise<void> {
    fixture = TestBed.createComponent(CardPicker);
    fixture.componentRef.setInput('chosen', chosen);
    fixture.componentRef.setInput('selfId', selfId);
    picked = [];
    fixture.componentInstance.picked.subscribe((r) => picked.push(r));
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
  }

  const names = () => Array.from(el.querySelectorAll('.escolha .nome')).map((n) => n.textContent!.trim());
  const filters = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.filtro'));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [CardPicker], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([
      card('rjogo1', 'Hollow Knight', 'jogos', '2026-10-03T10:00:00.000Z'),
      card('rlivro1', 'O Hobbit', 'livros', '2026-10-05T10:00:00.000Z'),
      card('rnota1', 'Comprar um console', 'anotacoes', '2026-10-04T10:00:00.000Z', { category: 'Compras' }),
      card('rnota2', 'Esta anotação', 'anotacoes', '2026-10-06T10:00:00.000Z'),
    ]);
  });

  afterEach(() => {
    el?.remove();
    fixture?.destroy();
    localStorage.clear();
  });

  it('todas as suas, de todos os murais, das mexidas por último primeiro; menos aquela onde vai ser colada', async () => {
    await open('', 'rnota2');
    expect(el.querySelector('dialog')!.open).toBeTrue();
    expect(names()).toEqual(['O Hobbit', 'Comprar um console', 'Hollow Knight']);
    // as anotações primeiro nas abas, com quantas
    expect(filters().map((f) => f.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Todos 3', 'Anotações 1', 'Jogos 1', 'Livros 1']);
    expect(document.activeElement).toBe(el.querySelector('input[type="search"]'));
  });

  it('a busca e as abas filtram; Enter na busca escolhe a primeira e fecha', async () => {
    await open();
    filters()[2].click();
    await fixture.whenStable();
    expect(names()).toEqual(['Hollow Knight']);
    filters()[0].click();
    const search = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'CONSOLE';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(names()).toEqual(['Comprar um console']);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(picked.map((r) => r.id)).toEqual(['rnota1']);
    expect(fixture.componentInstance.open()).toBeFalse();
  });

  it('a já escolhida vem primeiro, com o tique, e a lista abre no mural dela', async () => {
    await open('rjogo1');
    expect(filters().find((f) => f.getAttribute('aria-pressed') === 'true')!.textContent).toContain('Jogos');
    const first = el.querySelector('.escolha')!;
    expect(first.classList).toContain('on');
    expect(first.getAttribute('aria-current')).toBe('true');
  });

  it('tocar numa escolhe; as teclas não passam para o editor de baixo', async () => {
    await open();
    let outside = 0;
    const count = () => outside++;
    document.body.addEventListener('keydown', count);
    el.querySelector('input[type="search"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    document.body.removeEventListener('keydown', count);
    expect(outside).toBe(0);
    el.querySelectorAll<HTMLButtonElement>('.escolha')[2].click();
    expect(picked.map((r) => r.game.name)).toEqual(['Comprar um console']);
  });
});
