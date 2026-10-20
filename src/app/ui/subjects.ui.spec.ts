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

/** O assunto nas telas do mural: a fileira da pasta (o filtro), a linha miúda da ficha e a ordem. */

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

  it('a pasta mostra os assuntos antes das tags, impressos em tinta; um toque filtra e a nova nasce no único ligado', async () => {
    const bar = await mount(WallToolbar);
    const el: HTMLElement = bar.nativeElement;
    const chips = () => [...el.querySelectorAll<HTMLButtonElement>('.pasta-assuntos .assunto')];
    expect(el.querySelector('.pasta-assuntos .rotulo')!.textContent!.trim()).toBe('Assunto');
    expect(chips().map((b) => b.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Geografia, 1', 'História, 2', 'Sem assunto, 1']);
    expect(view.newNoteSubject()).toBeNull();
    chips()[1].click();
    await bar.whenStable();
    expect(chips()[1].getAttribute('aria-pressed')).toBe('true');
    expect(view.visible().map((r) => r.id).sort()).toEqual(['nhist001', 'nhist002']);
    expect(el.querySelector('.achados')!.textContent).toContain('Mostrando 2 de 4');
    expect(view.newNoteSubject()).toBe('História');
    // dois ligados: vale qualquer um, e a nova não escolhe por você
    chips()[0].click();
    await bar.whenStable();
    expect(view.visible().length).toBe(3);
    expect(view.newNoteSubject()).toBeNull();
  });

  it('sem o que separar (um assunto só, em todas), a fileira não aparece; nenhum assunto, também não', async () => {
    store.reviews.set([note('nhist001', 'História'), note('nhist002', 'História')]);
    const bar = await mount(WallToolbar);
    const el: HTMLElement = bar.nativeElement;
    expect(el.querySelector('.pasta-assuntos .assuntos')).toBeNull();
    store.reviews.set([note('nsem0001', null)]);
    await bar.whenStable();
    expect(el.querySelector('.pasta-assuntos .assuntos')).toBeNull();
  });

  it('com muitos assuntos, dez ficam à mão e o "+N" mostra os outros; o ligado e o "Sem assunto" ficam sempre', async () => {
    store.reviews.set([...Array.from({ length: 13 }, (_, i) => note(`nmuitos${String(i).padStart(2, '0')}`, `Assunto ${String.fromCharCode(65 + i)}`)), note('nsem0001', null)]);
    const bar = await mount(WallToolbar);
    const el: HTMLElement = bar.nativeElement;
    const names = () => [...el.querySelectorAll<HTMLElement>('.pasta-assuntos .assunto .nome')].map((n) => n.textContent!.trim());
    expect(names().length).toBe(11);
    expect(names().at(-1)).toBe('Sem assunto');
    const more = el.querySelector<HTMLButtonElement>('.pasta-assuntos .mais')!;
    expect(more.textContent!.trim()).toContain('+3');
    more.click();
    await bar.whenStable();
    expect(names().length).toBe(14);
    expect(el.querySelector('.pasta-assuntos .mais')!.textContent!.trim()).toBe('Menos');
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
