import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoteLinks } from '../core/note-links';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { LinkedCard } from './linked-card';

function card(id: string, name: string, kind = 'jogos', extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    kind,
    game: { name, coverUrl: null, source: 'manual' },
    scores: { diversao: 9, historia: 8, jogabilidade: 9, visual: 8 },
    status: 'finalizado',
    text: '',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...extra,
  })!;
}

describe('a nota colada no texto (o widget Nota)', () => {
  let fixture: ComponentFixture<LinkedCard>;
  let el: HTMLElement;

  async function show(args: string[], links: NoteLinks | null = null): Promise<void> {
    fixture = TestBed.createComponent(LinkedCard);
    fixture.componentRef.setInput('args', args);
    fixture.componentRef.setInput('links', links);
    el = fixture.nativeElement as HTMLElement;
    el.style.setProperty('--widget-alto', '200px');
    el.style.width = '500px';
    document.body.appendChild(el);
    await fixture.whenStable();
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [LinkedCard], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([
      card('rjogo1', 'Hollow Knight'),
      card('rnota1', 'Comprar um console', 'anotacoes', { category: 'Compras' }),
    ]);
  });

  afterEach(() => {
    el?.remove();
    fixture?.destroy();
    localStorage.clear();
  });

  it('é a ficha simples de verdade, de outro mural, presa com fita e colada (o estrago de fora não a come)', async () => {
    await show(['#rjogo1', 'Hollow Knight']);
    const inner = el.querySelector('app-review-card')!;
    expect(inner.classList).toContain('compact');
    expect(inner.querySelector('.title')?.textContent).toContain('Hollow Knight');
    expect(el.querySelector('.lugar')!.hasAttribute('data-colado')).toBeTrue();
    expect(el.querySelectorAll('.fita').length).toBe(2);
    // colada, e não pregada: sem a tachinha
    expect(getComputedStyle(inner.querySelector('.pin')!).display).toBe('none');
  });

  it('encolhe até a altura do tamanho, e até a largura da linha', async () => {
    await show(['#rjogo1']);
    await new Promise((r) => setTimeout(r, 80));
    await fixture.whenStable();
    const inner = el.querySelector<HTMLElement>('app-review-card')!;
    const box = el.querySelector<HTMLElement>('.lugar')!;
    expect(box.offsetHeight).toBeLessThanOrEqual(201);
    expect(Math.abs(box.offsetHeight - inner.offsetHeight * Number(getComputedStyle(el.querySelector('.escala')!).scale))).toBeLessThan(2);
    el.style.width = '150px';
    await new Promise((r) => setTimeout(r, 80));
    await fixture.whenStable();
    expect(box.offsetWidth).toBeLessThanOrEqual(150);
  });

  it('com quem abra, tocar abre a ficha; sem, ela só se vê (nem o teclado para nela)', async () => {
    const opened: string[] = [];
    await show(['#rjogo1'], { openCard: (r) => opened.push(r.id) });
    el.querySelector<HTMLButtonElement>('app-review-card .hit')!.click();
    expect(opened).toEqual(['rjogo1']);
    expect(el.classList).toContain('tocavel');
    fixture.destroy();
    el.remove();

    await show(['#rjogo1'], {});
    expect(el.querySelector('app-review-card')!.hasAttribute('inert')).toBeTrue();
    expect(el.querySelector('.sr-only')?.textContent).toContain('Hollow Knight');
  });

  it('escrita à mão só com o título: a anotação dele, pelos links do texto', async () => {
    const notes = TestBed.inject(ReviewStore).notes();
    await show(['Comprar um console'], { resolve: (t) => notes.find((n) => n.game.name === t) ?? null });
    expect(el.querySelector('app-review-card .title')?.textContent).toContain('Comprar um console');
  });

  it('a que sumiu deixa o papel rasgado com o nome dela', async () => {
    await show(['#rapagada', 'Uma ficha apagada']);
    expect(el.querySelector('app-review-card')).toBeNull();
    expect(el.querySelector('.perdida-nome')?.textContent).toBe('Uma ficha apagada');
    expect(el.querySelector('.perdida-dica')?.textContent).toContain('apagada');
  });

  it('as regras da ficha de fora não pegam a de dentro (a anotação sem capa não desmonta a cabeça dela)', async () => {
    // a ficha colada dentro de uma anotação sem capa, num mural: a cabeça dela tem a capa ao lado do nome
    const { ReviewCard } = await import('./review-card');
    const outer = TestBed.createComponent(ReviewCard);
    outer.componentRef.setInput('review', card('rfora', 'Viagem', 'anotacoes', { text: 'oi\n{{nota: #rjogo1 | Hollow Knight}}' }));
    outer.componentRef.setInput('full', true);
    document.body.appendChild(outer.nativeElement);
    await outer.whenStable();
    await new Promise((r) => setTimeout(r, 50));
    await outer.whenStable();
    const head = (outer.nativeElement as HTMLElement).querySelector<HTMLElement>('app-linked-card app-review-card > .corpo > .head');
    expect(head).not.toBeNull();
    expect(getComputedStyle(head!).gridTemplateColumns.split(' ').length).toBe(2);
    outer.nativeElement.remove();
    outer.destroy();
  });
});
