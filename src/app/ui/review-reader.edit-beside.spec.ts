import { SPEECH } from '../core/voz';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SHARED_AUTO } from '../core/shared-store';
import { Confirm, ConfirmOptions } from './confirm';
import { ReviewReader } from './review-reader';
import { Toasts } from './toast';

/**
 * Editar ao lado (PLANO-LADO-A-LADO.md, D7 e D8): com duas abertas, o Editar abre o editor no lado daquela anotação,
 * sem o modal; dá para editar as duas; a mesma anotação não se edita nos dois lados; fechar a leitura com algo por
 * salvar pergunta antes; a primeira que fecha sai da frente da segunda que edita.
 */

class MemoryData {
  private readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {
    /* sem outras abas */
  }
  takeForeign(): null {
    return null;
  }
}

function note(id: string, name: string, text: string): Review {
  return sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    text,
    completedAt: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })!;
}

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('Editar ao lado (ReviewReader, PLANO-LADO-A-LADO.md, D7 e D8)', () => {
  let fixture: ComponentFixture<ReviewReader>;
  let reader: ReviewReader;
  let el: HTMLElement;
  let store: ReviewStore;
  let asked: { options: ConfirmOptions; answer: (yes: boolean) => void }[];

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SPEECH, useValue: null },
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: SHARED_AUTO, useValue: false },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        { provide: CloudAccount, useValue: { account: signal(null), signedIn: signal(false), request: async () => ({}) } },
      ],
    });
    asked = [];
    spyOn(TestBed.inject(Confirm), 'ask').and.callFake((options: ConfirmOptions) => new Promise<boolean>((answer) => asked.push({ options, answer })));
    fixture = TestBed.createComponent(ReviewReader);
    reader = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    store = TestBed.inject(ReviewStore);
    store.add(note('nota-a', 'Receita de pão', 'Farinha e água.'));
    store.add(note('nota-b', 'Cronograma', 'Oito horas.'));
    store.add(note('nota-c', 'Com link', 'Veja [[Receita de pão]].'));
  });

  afterEach(() => {
    el.querySelectorAll('dialog').forEach((d) => d.open && d.close());
    localStorage.clear();
  });

  const outer = () => el.querySelector<HTMLDialogElement>('dialog.reader:not(.ao-lado)')!;
  const beside = () => el.querySelector<HTMLDialogElement>('dialog.reader.ao-lado');
  const nameOf = (root: Element | null) => root?.querySelector('.par > article h2')?.textContent?.trim();
  /** O editor da primeira (fora do diálogo da segunda) e o da segunda. */
  const editorA = () => outer().querySelector<HTMLDialogElement>(':scope > app-review-editor dialog.editor');
  const editorB = () => beside()?.querySelector<HTMLDialogElement>(':scope > app-review-editor dialog.editor') ?? null;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await wait(30);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function both(a = 'nota-a', b = 'nota-b'): Promise<void> {
    reader.open(store.get(a)!);
    await settle();
    reader.openBeside(store.get(b)!);
    await settle();
  }

  async function edit(root: Element): Promise<void> {
    const btn = [...root.querySelectorAll<HTMLButtonElement>(':scope > .par .foot .btn-ink')].find((x) => x.textContent?.includes('Editar'));
    expect(btn).withContext('o Editar').toBeDefined();
    btn!.click();
    await settle();
    await wait(30);
    await settle();
  }

  /** Muda o nome da anotação no editor (algo por salvar). */
  function retitle(editor: HTMLDialogElement, title: string): void {
    const field = editor.querySelector<HTMLTextAreaElement>('textarea[id^="editor-titulo-nota"]')!;
    field.value = title;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('o Editar da segunda abre o editor no lado dela, sem o modal, e a primeira continua lendo', async () => {
    await both();
    await edit(beside()!);
    const ed = editorB();
    expect(ed).withContext('o editor no lado da segunda').not.toBeNull();
    expect(ed!.open).toBeTrue();
    expect(ed!.matches(':modal')).toBeFalse();
    expect(beside()!.classList).toContain('editando');
    expect(getComputedStyle(beside()!.querySelector(':scope > .par')!).display).toBe('none');
    // a primeira, à vista e lendo
    expect(nameOf(outer())).toBe('Receita de pão');
    expect(getComputedStyle(outer().querySelector(':scope > .par')!).display).not.toBe('none');
    expect(editorA()).toBeNull();
    // o editor é o da anotação dela
    expect(ed!.querySelector<HTMLTextAreaElement>('textarea[id^="editor-titulo-nota"]')!.value).toBe('Cronograma');
    // o jeito vem do lado: o hospedeiro é o contêiner
    expect(getComputedStyle(beside()!.querySelector('app-review-editor')!).containerType).toBe('inline-size');
  });

  it('as duas editando ao mesmo tempo, cada uma com os seus ids', async () => {
    await both();
    await edit(beside()!);
    await edit(outer());
    expect(editorA()?.open).toBeTrue();
    expect(editorB()?.open).toBeTrue();
    const ids = [...document.querySelectorAll('[id]')].map((x) => x.id).filter(Boolean);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dup).withContext('ids repetidos').toEqual([]);
    retitle(editorA()!, 'Receita de pão integral');
    retitle(editorB()!, 'Cronograma novo');
    await settle();
    editorA()!.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await settle();
    editorB()!.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await settle();
    await wait(50);
    await settle();
    expect(store.get('nota-a')!.game.name).toBe('Receita de pão integral');
    expect(store.get('nota-b')!.game.name).toBe('Cronograma novo');
    // de volta à leitura, as duas, com o que mudou
    expect(editorA()).toBeNull();
    expect(editorB()).toBeNull();
    expect(nameOf(outer())).toBe('Receita de pão integral');
    expect(nameOf(beside())).toBe('Cronograma novo');
  });

  it('salvar ao lado avisa quem usa (como o editor de sempre) e a outra, se lê a mesma, mostra a de agora', async () => {
    await both('nota-b', 'nota-c');
    // a segunda vai pelo link até a mesma da primeira? não: a primeira lê a B, a segunda vai para a A
    beside()!.querySelector<HTMLElement>('.text .elo[role=link]')!.click();
    await settle();
    expect(nameOf(beside())).toBe('Receita de pão');
    const saved: string[] = [];
    reader.saved.subscribe((e) => saved.push(e.id));
    await edit(beside()!);
    retitle(editorB()!, 'Receita salva');
    await settle();
    editorB()!.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await settle();
    await wait(50);
    await settle();
    expect(saved).toEqual(['nota-a']);
    expect(nameOf(beside())).toBe('Receita salva');
  });

  it('a mesma anotação não se edita nos dois lados: o foco vai para o editor que já está aberto, com o aviso', async () => {
    await both('nota-a', 'nota-c');
    await edit(outer());
    expect(editorA()?.open).toBeTrue();
    // a segunda chega à mesma pelo link
    beside()!.querySelector<HTMLElement>('.text .elo[role=link]')!.click();
    await settle();
    expect(nameOf(beside())).toBe('Receita de pão');
    const toasts = TestBed.inject(Toasts);
    const shown = spyOn(toasts, 'show').and.callThrough();
    await edit(beside()!);
    expect(editorB()).toBeNull();
    expect(shown).toHaveBeenCalledWith('Esta anotação já está aberta para editar no outro lado.');
    expect(editorA()!.contains(document.activeElement)).toBeTrue();
  });

  it('a mesma anotação aberta no editor do outro lado só se lê deste: as tarefas não marcam, e Finalizar avisa', async () => {
    store.add(note('nota-t', 'Tarefas', '- [ ] Pão' + String.fromCharCode(10) + 'Veja [[Receita de pão]].'));
    store.update({ ...store.get('nota-a')!, text: '- [ ] Farinha' });
    await both('nota-a', 'nota-t');
    await edit(outer());
    beside()!.querySelector<HTMLElement>('.text .elo[role=link]')!.click();
    await settle();
    expect(nameOf(beside())).toBe('Receita de pão');
    expect(beside()!.querySelector('.text input[type=checkbox]:not([disabled])')).withContext('a tarefa não se marca').toBeNull();
    const toasts = TestBed.inject(Toasts);
    const shown = spyOn(toasts, 'show').and.callThrough();
    beside()!.querySelector<HTMLElement>('.foot .finalizar')!.click();
    await settle();
    expect(store.get('nota-a')!.doneAt).toBeFalsy();
    expect(shown).toHaveBeenCalledWith('Esta anotação está aberta para editar no outro lado: salve ou feche o editor antes.');
  });

  it('o Esc com algo por salvar ao lado pergunta antes; não: a leitura fica; sim: fecha', async () => {
    await both();
    await edit(beside()!);
    retitle(editorB()!, 'Mudou');
    await settle();
    const cancel = new Event('cancel', { cancelable: true });
    outer().dispatchEvent(cancel);
    await settle();
    expect(cancel.defaultPrevented).toBeTrue();
    expect(asked.length).toBe(1);
    expect(asked[0].options.text).toContain('Cronograma');
    asked[0].answer(false);
    await settle();
    expect(outer().open).toBeTrue();
    expect(editorB()?.open).toBeTrue();
    outer().dispatchEvent(new Event('cancel', { cancelable: true }));
    await settle();
    asked[1].answer(true);
    await settle();
    expect(outer().open).toBeFalse();
    expect(store.get('nota-b')!.game.name).toBe('Cronograma');
  });

  it('o Esc dentro do editor ao lado fecha só o editor (a leitura fica)', async () => {
    await both();
    await edit(beside()!);
    const key = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    editorB()!.querySelector('textarea')!.dispatchEvent(key);
    await settle();
    await wait(30);
    await settle();
    expect(key.defaultPrevented).toBeTrue();
    expect(editorB()).toBeNull();
    expect(outer().open).toBeTrue();
    expect(nameOf(beside())).toBe('Cronograma');
  });

  it('o X da primeira com a segunda editando: a segunda fica, com o editor e o que se escrevia; fechando o editor, ela vira a leitura de sempre', async () => {
    await both();
    await edit(beside()!);
    retitle(editorB()!, 'Escrevendo');
    await settle();
    outer().querySelector<HTMLElement>(':scope > .par .faixa-nome .fecha')!.click();
    await settle();
    expect(outer().open).toBeTrue();
    expect(outer().classList).toContain('so-o-lado');
    expect(outer().querySelector(':scope > .par')).toBeNull();
    expect(editorB()?.open).toBeTrue();
    expect(editorB()!.querySelector<HTMLTextAreaElement>('textarea[id^="editor-titulo-nota"]')!.value).toBe('Escrevendo');
    // salvar fecha o editor: ela fica sozinha, lendo, no lugar da primeira
    editorB()!.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await settle();
    await wait(50);
    await settle();
    expect(beside()).toBeNull();
    expect(outer().classList).not.toContain('so-o-lado');
    expect(nameOf(outer())).toBe('Escrevendo');
    expect(outer().querySelector('.etq-trilho[data-trilho="ao-lado"]')).not.toBeNull();
  });

  it('a primeira editando e a segunda fechando: o editor fica, sozinho', async () => {
    await both();
    await edit(outer());
    beside()!.querySelector<HTMLElement>('.faixa-nome .fecha')!.click();
    await settle();
    expect(beside()).toBeNull();
    expect(editorA()?.open).toBeTrue();
  });

  it('o Apagar de uma, com a outra editando, pergunta pelo que não foi salvo antes de pedir para apagar', async () => {
    await both();
    await edit(beside()!);
    retitle(editorB()!, 'Mudou');
    await settle();
    const removed: string[] = [];
    reader.remove.subscribe((id) => removed.push(id));
    (reader as unknown as { onMore(id: string): void }).onMore('remover');
    await settle();
    expect(removed).toEqual([]);
    expect(asked.length).toBe(1);
    asked[0].answer(true);
    await settle();
    expect(removed).toEqual(['nota-a']);
  });

  it('sozinha, o Editar continua pedindo o editor de sempre', async () => {
    reader.open(store.get('nota-a')!);
    await settle();
    const asks: string[] = [];
    reader.edit.subscribe((id) => asks.push(id));
    await edit(outer());
    expect(asks).toEqual(['nota-a']);
    expect(editorA()).toBeNull();
  });
});
