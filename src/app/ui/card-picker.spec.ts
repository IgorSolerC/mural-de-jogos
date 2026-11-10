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
  /** As linhas do "Onde" (os murais, na raiz). */
  const filters = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.indice button.lugar'));
  const rowText = (b: Element) => `${b.querySelector('.idx-nome')!.textContent!.trim()} ${b.querySelector('.idx-n')!.textContent!.replace(/[^\d]/g, '')}`;

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
    // os murais no "Onde", as anotações primeiro, com quantas
    expect(filters().map(rowText)).toEqual(['Todos os murais 3', 'Anotações 1', 'Jogos 1', 'Livros 1']);
    expect(document.activeElement).toBe(el.querySelector('input[type="search"]'));
  });

  it('a ficha privada avisa o que quem visita vê: só que ela é privada, sem o nome (o texto vai com o cadeado)', async () => {
    const store = TestBed.inject(ReviewStore);
    store.reviews.set([...store.reviews(), card('rjogo2', 'Celeste', 'jogos', '2026-10-07T10:00:00.000Z', { private: true })]);
    await open();
    const meta = (name: string) => Array.from(el.querySelectorAll('.escolha')).find((b) => b.querySelector('.nome')!.textContent!.trim() === name)!.querySelector('.meta')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(meta('Celeste')).toMatch(/^Jogo · .* · privada: quem visita não vê qual é$/);
    expect(meta('Hollow Knight')).not.toContain('privada');
  });

  it('a busca e os murais filtram; Enter na busca escolhe a primeira e fecha', async () => {
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

  it('"Nova anotação" (o Quadro livre): leva o que se procurava como título e fecha; sem o pedido, o botão não aparece', async () => {
    await open();
    expect(el.querySelector('.criar')).toBeNull();
    el.remove();
    fixture.destroy();
    fixture = TestBed.createComponent(CardPicker);
    fixture.componentRef.setInput('createLabel', 'Nova anotação');
    const created: string[] = [];
    fixture.componentInstance.create.subscribe((t) => created.push(t));
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    const search = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'Sala 46';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    // sem nenhuma com o nome: o atalho de criar já com ele
    expect(el.querySelector('.nada-link')?.textContent).toContain('Criar “Sala 46”');
    el.querySelector<HTMLButtonElement>('.criar')!.click();
    await fixture.whenStable();
    expect(created).toEqual(['Sala 46']);
    expect(fixture.componentInstance.open()).toBeFalse();
  });
});
