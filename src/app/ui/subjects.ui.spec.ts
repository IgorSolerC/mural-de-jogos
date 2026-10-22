import { Type, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Mural } from '../core/mural';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { WallView } from '../core/wall-view';
import { ReviewCard } from './review-card';
import { WallToolbar } from './wall-toolbar';

/** O assunto nas telas do mural: a ficha dos filtros da pasta, a linha miúda da ficha e a ordem. */

const T0 = '2026-10-20T10:00:00.000Z';

const note = (id: string, subject: string | null, extra: Record<string, unknown> = {}): Review => ({
  ...sanitizeReview({
    kind: 'anotacoes',
    game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' },
    category: 'Estudos',
    completedAt: '2026-10-01',
    createdAt: T0,
    updatedAt: T0,
    ...(subject ? { subject } : {}),
    ...extra,
  })!,
  id,
});

describe('o assunto nas telas do mural', () => {
  let store: ReviewStore;
  let view: WallView;
  const hosts: HTMLElement[] = [];

  async function mount<T>(type: Type<T>, setup?: (f: ComponentFixture<T>) => void): Promise<ComponentFixture<T>> {
    const f = TestBed.createComponent(type);
    setup?.(f);
    document.body.appendChild(f.nativeElement);
    hosts.push(f.nativeElement);
    await f.whenStable();
    return f;
  }

  beforeEach(() => {
    localStorage.clear();
    // a ficha dos filtros aberta (ela lembra no aparelho): os testes mexem no assunto e nas tags
    localStorage.setItem('meu-mural:filtros-abertos:v1', 'true');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    TestBed.inject(Mural).kind.set('anotacoes');
    TestBed.inject(Settings).setNotesConfig({ showAll: true });
    store = TestBed.inject(ReviewStore);
    view = TestBed.inject(WallView);
    store.reviews.set([note('nhist001', 'História'), note('nhist002', 'historia'), note('ngeo0001', 'Geografia'), note('nsem0001', null)]);
  });

  afterEach(() => {
    for (const h of hosts.splice(0)) h.remove();
    localStorage.clear();
  });

  /** Os recortes do assunto na ficha dos filtros: o rádio de cada um e o que se lê nele. */
  const radios = (el: HTMLElement) => [...el.querySelectorAll<HTMLInputElement>('app-filter-card .recorte input')];
  const labels = (el: HTMLElement) => [...el.querySelectorAll('app-filter-card .recorte')].map((l) => l.textContent!.replace(/\s+/g, ' ').trim());
  const summary = (el: HTMLElement) => el.querySelector('app-filter-card .resumo')!.textContent!.replace(/\s+/g, ' ').trim();
  async function pick(bar: ComponentFixture<WallToolbar>, i: number): Promise<void> {
    radios(bar.nativeElement)[i].click();
    await bar.whenStable();
  }

  it('a ficha dos filtros mostra o assunto antes das tags, em recortes; escolher filtra, vai para o resumo e a nova nasce nele', async () => {
    const bar = await mount(WallToolbar);
    const el: HTMLElement = bar.nativeElement;
    const rows = [...el.querySelectorAll('app-filter-card .linha-titulo')].map((t) => t.textContent!.trim());
    expect(rows).toEqual(['Assunto']);
    // Todos, de A a Z, "Sem assunto" no fim, com quantas cada um mostra
    expect(labels(el)).toEqual(['Todos', 'Geografia, 1', 'História, 2', 'Sem assunto, 1']);
    expect(radios(el)[0].checked).toBeTrue();
    expect(summary(el)).toBe(': Todas as anotações');
    expect(view.newNoteSubject()).toBeNull();
    await pick(bar, 2);
    expect(radios(el)[2].checked).toBeTrue();
    expect(view.visible().map((r) => r.id).sort()).toEqual(['nhist001', 'nhist002']);
    expect(summary(el)).toBe(': História');
    expect(el.querySelector('.achados')!.textContent).toContain('Mostrando 2 de 4');
    expect(view.newNoteSubject()).toBe('História');
    // um por vez: escolher outro troca, não soma
    await pick(bar, 1);
    expect(view.visible().map((r) => r.id)).toEqual(['ngeo0001']);
    // Todos desfaz
    await pick(bar, 0);
    expect(view.visible().length).toBe(4);
    expect(view.newNoteSubject()).toBeNull();
  });

  it('o Limpar da ficha volta o assunto para Todos', async () => {
    const bar = await mount(WallToolbar);
    const el: HTMLElement = bar.nativeElement;
    await pick(bar, 2);
    el.querySelector<HTMLButtonElement>('.achados .tinta-link')!.click();
    await bar.whenStable();
    expect(radios(el)[0].checked).toBeTrue();
    expect(view.visible().length).toBe(4);
  });

  it('fechada, a ficha é uma linha com o resumo; abrir e fechar fica guardado no aparelho', async () => {
    localStorage.removeItem('meu-mural:filtros-abertos:v1');
    const bar = await mount(WallToolbar);
    const el: HTMLElement = bar.nativeElement;
    const head = el.querySelector<HTMLButtonElement>('app-filter-card .abre')!;
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('app-filter-card .corpo')).toBeNull();
    expect(head.textContent!.replace(/\s+/g, ' ').trim()).toBe('Filtros: Todas as anotações');
    head.click();
    await bar.whenStable();
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('app-filter-card .corpo')!.id).toBe(head.getAttribute('aria-controls')!);
    expect(localStorage.getItem('meu-mural:filtros-abertos:v1')).toBe('true');
  });

  it('sem o que separar (um assunto só, em todas), a linha do assunto não aparece; nada para filtrar, nem a ficha', async () => {
    store.reviews.set([note('nhist001', 'História', { tags: ['Prova'] }), note('nhist002', 'História')]);
    const bar = await mount(WallToolbar);
    const el: HTMLElement = bar.nativeElement;
    expect(radios(el).length).toBe(0);
    expect([...el.querySelectorAll('app-filter-card .linha-titulo')].map((t) => t.textContent!.trim())).toEqual(['Tags']);
    store.reviews.set([note('nsem0001', null)]);
    await bar.whenStable();
    expect(el.querySelector('app-filter-card')!.classList).toContain('vazio');
  });

  it('com muitos assuntos, todos ficam na ficha (ela só ocupa espaço aberta)', async () => {
    store.reviews.set([...Array.from({ length: 13 }, (_, i) => note(`nmuitos${String(i).padStart(2, '0')}`, `Assunto ${String.fromCharCode(65 + i)}`)), note('nsem0001', null)]);
    const bar = await mount(WallToolbar);
    const el: HTMLElement = bar.nativeElement;
    expect(radios(el).length).toBe(15);
    expect(labels(el).at(-1)).toBe('Sem assunto, 1');
  });

  it('ordenar por assunto está no Ordenar das anotações', async () => {
    const bar = await mount(WallToolbar);
    const options = [...(bar.nativeElement as HTMLElement).querySelectorAll('select[aria-label="Ordenar por"] option')].map((o) => o.textContent!.trim());
    expect(options).toContain('Assunto');
    expect(options.indexOf('Assunto')).toBe(options.indexOf('Grupo') + 1);
  });

  it('a ficha abre a linha da data com o assunto (nada em cima do nome); só capa e nome, não', async () => {
    const f = await mount(ReviewCard, (x) => x.componentRef.setInput('review', note('nhist001', 'História')));
    const el: HTMLElement = f.nativeElement;
    const line = el.querySelector('.meta-nota')!;
    expect(line.firstElementChild!.classList).toContain('assunto');
    expect(line.textContent!.replace(/\s+/g, ' ').trim()).toBe('Assunto: História · 1 de out de 2026'.replace('1 de out de 2026', line.querySelector('time')!.textContent!.trim()));
    expect(el.querySelector('.words')!.firstElementChild!.classList).toContain('title');
    f.componentRef.setInput('capas', true);
    await f.whenStable();
    expect(el.querySelector('.assunto')).toBeNull();
    const plain = await mount(ReviewCard, (x) => x.componentRef.setInput('review', note('nsem0001', null)));
    expect((plain.nativeElement as HTMLElement).querySelector('.assunto')).toBeNull();
  });
});
