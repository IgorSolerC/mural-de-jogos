import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { studyPath } from '../core/areas';
import { Deck, studyGroupId } from '../core/study';
import { DeckCopy, DeckCopyProblem, DeckCopyRequest, DeckCopyResult } from '../core/study-copy';
import { StudyStore } from '../core/study-store';
import { StudyCopySheet } from './study-copy-sheet';
import { Toasts } from './toast';

/** A folha do "Copiar baralho" (PLANO-BARALHOS-PUBLICOS.md, 4.5): o nome, o grupo e o que acontece ao copiar. */

const T = '2026-10-20T12:00:00.000Z';
const deck: Deck = { id: 'dkanji', name: 'Kanji N5', icon: null, color: 'vermelho', newPerDay: 5, group: 'Japonês', order: 0, at: T, public: true };
const request: DeckCopyRequest = {
  deck,
  cards: [{ note: 'nsol1', decks: ['dkanji'], front: { title: '日' }, srs: { state: 'nova', step: 0, s: 0, d: 0, due: T, last: null, reps: 0 }, stats: { seen: 0, right: 0, wrong: 0, marks: '' }, added: T, at: T }],
  notes: [{ id: 'nsol1' } as DeckCopyRequest['notes'][number]],
};

describe('A folha do Copiar baralho (StudyCopySheet)', () => {
  let fixture: ComponentFixture<StudyCopySheet>;
  let el: HTMLElement;
  const limit = signal<string | null>(null);
  let copy: jasmine.Spy<DeckCopy['copy']>;
  let closed: number;

  const dialog = () => el.querySelector('dialog')!;
  const submit = () => el.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const groupInput = () => el.querySelector<HTMLInputElement>('app-group-picker input')!;
  /** Escreve na busca do grupo e dá Enter: o que bate, ou o novo. */
  const typeGroup = async (text: string) => {
    groupInput().value = text;
    groupInput().dispatchEvent(new Event('input'));
    await fixture.whenStable();
    groupInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await fixture.whenStable();
  };
  const send = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };
  /** O `close` do `<dialog>` chega numa tarefa à parte. */
  const settled = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    localStorage.clear();
    limit.set(null);
    closed = 0;
    copy = jasmine.createSpy('copy');
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([{ path: '**', children: [] }]), { provide: DeckCopy, useValue: { limit: () => limit(), copy } }],
    });
    TestBed.inject(StudyStore).addDeck('Verbos', 'azul', null, undefined, 'Inglês');
    fixture = TestBed.createComponent(StudyCopySheet);
    fixture.componentRef.setInput('request', request);
    fixture.componentRef.setInput('owner', 'Marina');
    fixture.componentInstance.closed.subscribe(() => closed++);
    el = fixture.nativeElement;
    document.body.appendChild(el);
    await fixture.whenStable();
  });

  afterEach(() => {
    if (dialog()?.open) dialog().close();
    fixture.destroy();
    el.remove();
    localStorage.clear();
  });

  it('abre com o nome do dono já escrito e o grupo vazio, sem "Sem grupo"; sem grupo, não copia e diz o porquê', () => {
    expect(dialog().open).toBeTrue();
    expect(el.querySelector('.sub')!.textContent).toContain('Kanji N5, de Marina · 1 flashcard');
    expect(el.querySelector<HTMLInputElement>('#cb-nome')!.value).toBe('Kanji N5');
    expect(groupInput().value).toBe('');
    expect(el.querySelector('app-group-picker .nenhum')).toBeNull();
    expect(el.querySelector('app-group-picker [aria-checked="true"]')).toBeNull();
    expect(el.querySelector('.copia-dica')!.textContent).toContain('Escolha um grupo');
    if (matchMedia('(pointer: fine)').matches) expect(document.activeElement).toBe(groupInput());
    expect(submit().disabled).toBeTrue();
    expect(el.querySelector('#cb-frase')!.textContent).toContain('O flashcard vira uma anotação sua, privada, só nos Flashcards');
  });

  it('o grupo: um dos seus (sem acento ou com outra caixa, fica como você escreve) ou um novo', async () => {
    // o grupo só de baralho também aparece
    expect([...el.querySelectorAll('app-group-picker .op')].map((o) => o.textContent!.trim())).toContain('Inglês');
    await typeGroup('ingles');
    expect(el.querySelector('app-group-picker [aria-checked="true"]')!.textContent).toContain('Inglês');
    expect(el.querySelector('.copia-dica')!.textContent).toContain('Vai para o seu grupo Inglês.');
    expect(submit().disabled).toBeFalse();
    await typeGroup('Japonês');
    expect(el.querySelector('.copia-dica')!.textContent).toContain('Japonês é um grupo novo');
    expect(submit().disabled).toBeFalse();
  });

  it('sem lugar: a frase vira o aviso e o botão apaga', async () => {
    limit.set('Você já tem 100 baralhos, o máximo. Apague um para copiar este.');
    await typeGroup('Inglês');
    expect(el.querySelector('[role=alert]')!.textContent).toContain('100 baralhos');
    expect(el.querySelector('#cb-frase')!.textContent).toContain('O flashcard vira');
    expect(submit().disabled).toBeTrue();
  });

  it('sem nome, não copia e diz o porquê', async () => {
    await typeGroup('Inglês');
    const name = el.querySelector<HTMLInputElement>('#cb-nome')!;
    name.value = '   ';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(submit().disabled).toBeTrue();
    expect(el.querySelector('.copia-dica')!.textContent).toContain('Dê um nome ao baralho');
    await send();
    expect(copy).not.toHaveBeenCalled();
  });

  it('copiar fecha a folha, abre o baralho novo e avisa com Desfazer (e quantas imagens não vieram)', async () => {
    const undo = jasmine.createSpy('undo');
    copy.and.resolveTo({ id: 'dnovo', name: 'Kanji N5', cards: 1, lostImages: 2, undo });
    const router = TestBed.inject(Router);
    const go = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    await typeGroup('ingles');
    await send();
    await settled();
    expect(copy.calls.mostRecent().args.slice(1)).toEqual(['Kanji N5', 'Inglês']);
    expect(closed).toBe(1);
    expect(go).toHaveBeenCalledWith(studyPath(studyGroupId('Inglês'), 'dnovo'));
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('Baralho copiado: Kanji N5, com 1 flashcard. 2 imagens não vieram.');
    toast.action!.run();
    expect(undo).toHaveBeenCalled();
  });

  it('não deu para copiar: a folha fica, diz o porquê e deixa tentar de novo', async () => {
    copy.and.rejectWith(new DeckCopyProblem('As cartas passariam de 5000, o máximo dos Estudos.'));
    await typeGroup('Inglês');
    await send();
    await settled();
    expect(dialog().open).toBeTrue();
    expect(closed).toBe(0);
    expect(el.querySelector('[role=alert]')!.textContent).toContain('passariam de 5000');
    expect(submit().disabled).toBeFalse();
    // um erro que não é para a tela (do navegador, em inglês) vira a frase de sempre
    copy.and.rejectWith(new Error('QuotaExceededError: internals'));
    await send();
    await settled();
    expect(el.querySelector('[role=alert]')!.textContent).toContain('Não deu para copiar o baralho. Tente de novo.');
    // mudar o grupo já é outra tentativa: o erro sai
    await typeGroup('Viagens');
    expect(el.querySelector('[role=alert]')).toBeNull();
  });

  it('copiando, nada fecha a folha: nem o Cancelar, nem o X, nem o Esc (a cópia não para)', async () => {
    let finish!: (r: DeckCopyResult) => void;
    copy.and.returnValue(new Promise((resolve) => (finish = resolve)));
    const go = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    await typeGroup('Inglês');
    await send();
    expect(submit().textContent).toContain('Copiando');
    expect(el.querySelector<HTMLButtonElement>('button.papel')!.disabled).toBeTrue();
    expect(el.querySelector<HTMLButtonElement>('button.fecha')!.disabled).toBeTrue();
    // o Copiar fica no Tab enquanto espera (ver Busy), e um segundo envio não copia duas vezes
    expect(submit().disabled).toBeFalse();
    await send();
    expect(copy).toHaveBeenCalledTimes(1);
    const esc = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(esc);
    expect(esc.defaultPrevented).toBeTrue();
    fixture.componentInstance.close();
    await settled();
    expect(dialog().open).toBeTrue();
    expect(closed).toBe(0);

    finish({ id: 'dnovo', name: 'Kanji N5', cards: 1, lostImages: 0, undo: () => undefined });
    await settled();
    expect(closed).toBe(1);
    expect(go).toHaveBeenCalled();
  });

  it('quem saiu da página enquanto copiava não é levado ao baralho: fica só o aviso, com Desfazer', async () => {
    let finish!: (r: DeckCopyResult) => void;
    copy.and.returnValue(new Promise((resolve) => (finish = resolve)));
    const go = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    await typeGroup('Inglês');
    await send();
    const toasts = TestBed.inject(Toasts);
    fixture.destroy();
    finish({ id: 'dnovo', name: 'Kanji N5', cards: 1, lostImages: 0, undo: () => undefined });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(go).not.toHaveBeenCalled();
    expect(toasts.current()!.text).toContain('Baralho copiado');
  });

  it('sem estar copiando, o Esc fecha como sempre (o molde não cancela o evento)', () => {
    const esc = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(esc);
    expect(esc.defaultPrevented).toBeFalse();
  });
});
