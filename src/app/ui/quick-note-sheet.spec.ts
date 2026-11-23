import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { NoteFolders } from '../core/note-folders';
import { Toasts } from './toast';
import { QuickNoteLinked, QuickNoteSheet } from './quick-note-sheet';
import { comMarkdown } from '../testing/writing-mode.spec';

/** A folhinha da nota nova a partir de um trecho da leitura (PLANO-NOTA-DE-REFERENCIA.md, parte 1). */

const at = '2026-11-20T10:00:00.000Z';
const note = (id: string, name: string, extra: Partial<Review> = {}): Review => ({
  ...sanitizeReview({ kind: 'anotacoes', game: { name }, text: '', completedAt: '2026-11-20', createdAt: at, updatedAt: at, ...extra })!,
  id,
});

describe('a folhinha da nota nova (QuickNoteSheet)', () => {
  comMarkdown();
  let fixture: ComponentFixture<QuickNoteSheet>;
  let host: HTMLElement;
  let store: ReviewStore;
  let linked: QuickNoteLinked[];
  let closed: number;

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      TestBed.tick();
    }
  }
  const dialog = () => host.querySelector<HTMLDialogElement>('dialog')!;
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label);
  const titleField = () => host.querySelector<HTMLInputElement>('#nota-rapida-nome')!;
  const textField = () => host.querySelector<HTMLTextAreaElement>('app-rich-editor textarea')!;
  async function type(field: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await settle();
  }
  /** Os nomes das anotações do mural, menos as de antes. */
  const fresh = () => store.notes().filter((n) => !['nviagem01', 'nparis001'].includes(n.id));

  async function open(piece: string, from: Review, shared = false): Promise<void> {
    fixture = TestBed.createComponent(QuickNoteSheet);
    fixture.componentRef.setInput('piece', piece);
    fixture.componentRef.setInput('from', from);
    fixture.componentRef.setInput('shared', shared);
    fixture.componentInstance.linked.subscribe((l) => linked.push(l));
    fixture.componentInstance.closed.subscribe(() => closed++);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  }

  beforeEach(() => {
    localStorage.clear();
    linked = [];
    closed = 0;
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    store = TestBed.inject(ReviewStore);
  });

  afterEach(() => {
    if (dialog()?.open) dialog().close();
    host?.remove();
    TestBed.inject(Toasts).dismiss();
    localStorage.clear();
  });

  it('abre com o trecho no título, só a Pasta e as Tags, na cartolina da anotação que vai nascer', async () => {
    const from = note('nviagem01', 'Diário de viagem', { category: 'Viagens' });
    store.add(from);
    await open('Torre Eiffel', from);
    expect(dialog().open).toBeTrue();
    expect(titleField().value).toBe('Torre Eiffel');
    expect(host.querySelector('#nota-rapida-sub')!.textContent).toContain('Diário de viagem');
    expect([...host.querySelectorAll('.prop')].map((p) => p.getAttribute('data-prop'))).toEqual(['pasta', 'tags']);
    // nada de Grupo, Data, Capa ou Público
    expect(host.textContent).not.toContain('Público');
    const stock = host.querySelector('.ficha')!.getAttribute('data-cor');
    await type(textField(), 'Subir de escada.');
    button('Criar e ligar')!.click();
    await settle();
    const made = fresh();
    expect(made.length).toBe(1);
    expect(made[0].game.name).toBe('Torre Eiffel');
    expect(made[0].text).toBe('Subir de escada.');
    expect(made[0].category).toBe('Viagens');
    expect(made[0].stock).toBe(stock as Review['stock']);
    expect(linked).toEqual([{ title: 'Torre Eiffel', created: true }]);
    expect(dialog().open).toBeFalse();
    expect(closed).toBe(1);
  });

  it('a Pasta começa na da anotação de onde veio; as tags escolhidas vão junto', async () => {
    const folders = TestBed.inject(NoteFolders);
    const europa = folders.create('Viagens', null, 'Europa')!;
    const from = note('nviagem01', 'Diário de viagem', { category: 'Viagens', folder: europa.id });
    store.add(from);
    await open('Louvre', from);
    expect(host.querySelector('.prop[data-prop="pasta"]')!.textContent).toContain('Europa');
    host.querySelector<HTMLButtonElement>('.prop[data-prop="tags"]')!.click();
    await settle();
    const field = host.querySelector<HTMLInputElement>('app-tag-picker input')!;
    await type(field, 'museu');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    button('Pronto')!.click();
    await settle();
    expect(host.querySelector('.prop[data-prop="tags"]')!.getAttribute('aria-label')).toBe('Tags: museu');
    button('Criar e ligar')!.click();
    await settle();
    expect(fresh()[0].folder).toBe(europa.id);
    expect(fresh()[0].tags).toEqual(['museu']);
  });

  it('o título trocado vai para a anotação e para o link', async () => {
    const from = note('nviagem01', 'Diário de viagem', { category: 'Viagens' });
    store.add(from);
    await open('a torre', from);
    await type(titleField(), '  Torre   Eiffel ');
    button('Criar e ligar')!.click();
    await settle();
    expect(fresh()[0].game.name).toBe('Torre Eiffel');
    expect(linked).toEqual([{ title: 'Torre Eiffel', created: true }]);
  });

  it('o título que já existe não cria outra: oferece só ligar a ela', async () => {
    const from = note('nviagem01', 'Diário de viagem', { category: 'Viagens' });
    store.add(from);
    store.add(note('nparis001', 'Paris'));
    await open('paris', from);
    expect(host.querySelector('.gemea')!.textContent).toContain('Já existe “Paris”');
    button('Criar e ligar')!.click();
    await settle();
    expect(fresh().length).toBe(0);
    expect(host.querySelector('.falta')!.textContent).toContain('Já existe uma anotação com esse título');
    expect(titleField().getAttribute('aria-invalid')).toBe('true');
    button('Só ligar a ela')!.click();
    await settle();
    expect(fresh().length).toBe(0);
    expect(linked).toEqual([{ title: 'Paris', created: false }]);
    expect(dialog().open).toBeFalse();
  });

  it('o título desta mesma anotação não se liga nem se cria', async () => {
    const from = note('nviagem01', 'Diário de viagem', { category: 'Viagens' });
    store.add(from);
    await open('Diário de viagem', from);
    expect(host.querySelector('.gemea')!.textContent).toContain('É o título desta anotação');
    expect(button('Só ligar a ela')).toBeUndefined();
  });

  it('o título vazio ou com colchetes avisa e não cria', async () => {
    const from = note('nviagem01', 'Diário de viagem');
    store.add(from);
    await open('x', from);
    await type(titleField(), '   ');
    button('Criar e ligar')!.click();
    await settle();
    expect(host.querySelector('.falta')!.textContent).toContain('Falta o título');
    await type(titleField(), 'a [b]');
    button('Criar e ligar')!.click();
    await settle();
    expect(host.querySelector('.falta')!.textContent).toContain('colchetes');
    expect(fresh().length).toBe(0);
    expect(linked).toEqual([]);
  });

  it('dentro de uma compartilhada, a nova é só sua, privada', async () => {
    const from = note('nviagem01', 'Diário de viagem', { category: 'Viagens' });
    store.add(from);
    await open('Roma', from, true);
    button('Criar e ligar')!.click();
    await settle();
    expect(fresh()[0].private).toBeTrue();
  });

  it('o Esc com algo escrito avisa antes; o toque fora só fecha sem nada escrito', async () => {
    const from = note('nviagem01', 'Diário de viagem');
    store.add(from);
    await open('Roma', from);
    await type(textField(), 'algo');
    const esc = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(esc);
    await settle();
    expect(esc.defaultPrevented).toBeTrue();
    expect(host.querySelector('.falta')!.textContent).toContain('Esc de novo');
    const again = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(again);
    expect(again.defaultPrevented).toBeFalse();
    expect(fresh().length).toBe(0);
  });

  it('Ctrl+Enter cria de qualquer campo', async () => {
    const from = note('nviagem01', 'Diário de viagem');
    store.add(from);
    await open('Roma', from);
    titleField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await settle();
    expect(fresh().map((n) => n.game.name)).toEqual(['Roma']);
  });
});
