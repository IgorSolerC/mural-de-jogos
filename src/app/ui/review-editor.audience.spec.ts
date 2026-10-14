import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cloud } from '../core/cloud-config';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { ReviewEditor } from './review-editor';

function note(extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: 'nquem001',
    kind: 'anotacoes',
    game: { name: 'Ideias de viagem', coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    stock: 'amarelo',
    text: '',
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...extra,
  })!;
}

/**
 * Quem vê: só Público e Privado. Pregar a pública publica (o mural e o Feed); o outro caminho mora
 * na setinha colada ao botão, do outro lado do picote.
 */
describe('o editor: público ou privado, e o Feed na setinha', () => {
  let fixture: ComponentFixture<ReviewEditor>;
  let el: HTMLElement;
  let store: ReviewStore;
  let closed: number;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(Cloud).config.set({ api: 'https://api.teste', googleClientId: 'x.apps.googleusercontent.com' });
    store = TestBed.inject(ReviewStore);
    // a pergunta de anotação sem categoria ou tag tem o seu teste (review-editor.labels.spec.ts)
    TestBed.inject(Settings).askNoCategory.set(false);
    TestBed.inject(Settings).askNoTag.set(false);
    fixture = TestBed.createComponent(ReviewEditor);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  /** O bloco de quem vê (a anotação tem outro bloco do mesmo jeito antes dele: o lugar no mural). */
  const block = () => el.querySelector<HTMLFieldSetElement>('fieldset:has(input[name="editor-quem"])');
  const options = () => Array.from(block()!.querySelectorAll<HTMLLabelElement>('label.quem')).map((l) => l.textContent!.trim());
  const choose = async (label: string) => {
    const opt = Array.from(block()!.querySelectorAll<HTMLLabelElement>('label.quem')).find((l) => l.textContent!.includes(label))!;
    opt.querySelector('input')!.click();
    await fixture.whenStable();
  };
  const arrow = () => el.querySelector<HTMLButtonElement>('app-feed-menu .seta');
  const hint = () => el.querySelector('#editor-quem-dica')!.textContent!.trim();
  const submit = () => el.querySelector<HTMLButtonElement>('.pregar .btn-ink')!;
  /** Espera o diálogo fechar depois de `act`. */
  const closing = async (act: () => void) => {
    const dialog = el.querySelector('dialog')!;
    const closeEvent = new Promise((r) => dialog.addEventListener('close', r, { once: true }));
    act();
    await closeEvent;
    await fixture.whenStable();
  };
  /** A setinha chega num pedaço à parte (@defer, quando o navegador folga): espera por ela. */
  const arrived = async () => {
    for (let i = 0; i < 100 && !arrow(); i++) {
      await new Promise((r) => setTimeout(r, 10));
      await fixture.whenStable();
    }
    return arrow();
  };
  const openMenu = async () => {
    (await arrived())!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    return el.querySelector<HTMLButtonElement>('app-feed-menu [role="menuitem"]')!;
  };

  it('tem só Público e Privado, sem Visível', async () => {
    fixture.componentInstance.openNote('Ideias de viagem');
    await fixture.whenStable();
    expect(options()).toEqual(['Público', 'Privado']);
    expect(block()!.querySelector('legend')!.textContent!.trim()).toBe('Público ou privado?');
    expect(block()!.textContent).not.toContain('Visível');
  });

  it('a privada não tem setinha; a pública tem, colada ao botão', async () => {
    fixture.componentInstance.openNote('Ideias de viagem');
    await fixture.whenStable();
    // a anotação nasce privada
    expect(arrow()).toBeNull();
    expect(submit().textContent).toContain('Pregar só pra mim');
    await choose('Público');
    expect(await arrived()).not.toBeNull();
    expect(arrow()!.getAttribute('aria-haspopup')).toBe('menu');
    expect(arrow()!.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.pregar')!.classList).toContain('dividido');
    expect(submit().textContent).toContain('Pregar no mural');
    expect(hint()).toContain('aparece no Feed');
  });

  it('pregar no mural publica: vai para o Feed', async () => {
    fixture.componentInstance.openNote('Ideias de viagem');
    await fixture.whenStable();
    await choose('Público');
    await closing(() => submit().click());
    const saved = store.reviews().find((r) => r.game.name === 'Ideias de viagem')!;
    expect(saved.private).toBeUndefined();
    expect(saved.quiet).toBeUndefined();
    expect(closed).toBe(1);
  });

  it('a setinha prega sem publicar no Feed', async () => {
    fixture.componentInstance.openNote('Ideias de viagem');
    await fixture.whenStable();
    await choose('Público');
    const item = await openMenu();
    expect(arrow()!.getAttribute('aria-expanded')).toBe('true');
    expect(item.textContent).toContain('Pregar sem publicar no Feed');
    expect(document.activeElement).toBe(item);
    await closing(() => item.click());
    const saved = store.reviews().find((r) => r.game.name === 'Ideias de viagem')!;
    expect(saved.quiet).toBeTrue();
    expect(saved.private).toBeUndefined();
  });

  it('o Esc fecha só o bilhete da setinha, não a ficha', async () => {
    fixture.componentInstance.openNote('Ideias de viagem');
    await fixture.whenStable();
    await choose('Público');
    const item = await openMenu();
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    item.dispatchEvent(esc);
    await fixture.whenStable();
    expect(esc.defaultPrevented).toBeTrue();
    expect(el.querySelector('app-feed-menu [role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(arrow());
    expect(el.querySelector('dialog')!.open).toBeTrue();
  });

  it('a que está fora do Feed continua fora ao salvar; a setinha a publica no Feed', async () => {
    const quiet = note({ quiet: true });
    store.add(quiet);
    fixture.componentInstance.open(quiet);
    await fixture.whenStable();
    expect(options()).toEqual(['Público', 'Privado']);
    expect(block()!.querySelector<HTMLInputElement>('input')!.checked).toBeTrue();
    expect(hint()).toContain('não foi para o Feed');
    expect(submit().textContent).toContain('Salvar alterações');
    const item = await openMenu();
    expect(item.textContent).toContain('Salvar e publicar no Feed');
    await closing(() => item.click());
    const saved = store.get('nquem001')!;
    expect(saved.quiet).toBeUndefined();
    // para quem segue, é nova a partir de hoje
    expect(saved.publishedAt).toBeDefined();
  });

  it('salvar a que está fora do Feed não a publica', async () => {
    const quiet = note({ quiet: true });
    store.add(quiet);
    fixture.componentInstance.open(quiet);
    await fixture.whenStable();
    await closing(() => submit().click());
    expect(store.get('nquem001')!.quiet).toBeTrue();
  });

  it('a que já foi para o Feed não tem setinha', async () => {
    const published = note();
    store.add(published);
    fixture.componentInstance.open(published);
    await fixture.whenStable();
    expect(arrow()).toBeNull();
    expect(el.querySelector('.pregar')!.classList).not.toContain('dividido');
    expect(hint()).toContain('já foi para o Feed');
  });

  it('a privada que passa a pública ganha a setinha para salvar sem o Feed', async () => {
    const hidden = note({ private: true });
    store.add(hidden);
    fixture.componentInstance.open(hidden);
    await fixture.whenStable();
    expect(arrow()).toBeNull();
    await choose('Público');
    const item = await openMenu();
    expect(item.textContent).toContain('Salvar sem publicar no Feed');
    await closing(() => item.click());
    const saved = store.get('nquem001')!;
    expect(saved.private).toBeUndefined();
    expect(saved.quiet).toBeTrue();
  });

  it('sem a nuvem, não há quem vê nem setinha', async () => {
    TestBed.inject(Cloud).config.set(null);
    fixture.componentInstance.openNote('Ideias de viagem');
    await fixture.whenStable();
    expect(block()).toBeNull();
    expect(arrow()).toBeNull();
  });
});
