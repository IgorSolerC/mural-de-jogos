import { Component, provideZonelessChangeDetection, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FolderLook } from '../core/folder-looks';
import type { NoteFolder } from '../core/folders';
import { Confirm } from './confirm';
import { FolderSheet, FolderSheetOpen } from './folder-sheet';
import { Toasts } from './toast';

/**
 * A folha Customizar (PLANO-PASTAS-CUSTOMIZADAS.md, 4): o nome, a cor e o enfeite, a pasta ao vivo na mesa, os
 * adesivos (até três), o nome de uma irmã, e salvar só o que mudou, com o Desfazer.
 */

@Component({ imports: [FolderSheet], template: `<app-folder-sheet />` })
class Host {
  readonly sheet = viewChild.required(FolderSheet);
}

const FOLDER: NoteFolder = { id: 'preceitas0001', group: 'estudos', name: 'Receitas', parent: null, look: { color: 'verde', view: 'lista' } };

describe('a folha Customizar (FolderSheet)', () => {
  let fixture: ComponentFixture<Host>;
  let applied: { name?: string; look: FolderLook | undefined }[];
  let undone: number;
  /** A pasta como está agora (outra pessoa pode mudar enquanto a folha está aberta). */
  let live: NoteFolder;
  const el = () => document.querySelector('dialog.pasta-custom') as HTMLDialogElement;
  const q = <T extends HTMLElement>(sel: string) => el().querySelector<T>(sel)!;
  const stable = () => fixture.whenStable();
  const preview = () => q('.previa app-folder-card');

  async function open(over: Partial<FolderSheetOpen> = {}): Promise<void> {
    fixture.componentInstance.sheet().open({
      folder: FOLDER,
      info: { notes: 3, folders: 0, peek: [] },
      current: () => live,
      clash: (name) => (name.toLowerCase() === 'viagem' ? 'Viagem' : null),
      apply: (change) => {
        applied.push(change);
        return () => undone++;
      },
      ...over,
    });
    await stable();
  }
  async function pickProp(id: 'cor' | 'enfeite'): Promise<void> {
    q<HTMLButtonElement>(`.prop[data-prop="${id}"]`).click();
    await stable();
  }
  async function radio(label: string): Promise<void> {
    const input = Array.from(el().querySelectorAll<HTMLInputElement>('.parte input[type="radio"]')).find((i) => i.getAttribute('aria-label') === label)!;
    input.click();
    await stable();
  }
  async function sticker(label: string): Promise<void> {
    Array.from(el().querySelectorAll<HTMLButtonElement>('.adesivo-op')).find((b) => b.getAttribute('aria-label') === label)!.click();
    await stable();
  }
  async function typeName(v: string): Promise<void> {
    const i = q<HTMLInputElement>('#pasta-nome');
    i.value = v;
    i.dispatchEvent(new Event('input'));
    await stable();
  }
  async function save(): Promise<void> {
    q<HTMLButtonElement>('button[type="submit"]').click();
    await stable();
  }

  beforeEach(async () => {
    applied = [];
    live = FOLDER;
    undone = 0;
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await stable();
  });
  afterEach(() => {
    if (el()?.open) el().close();
    fixture.nativeElement.remove();
  });

  it('abre com o nome e o visual da pasta, e a pasta na mesa como está na parede', async () => {
    await open();
    expect(el().open).toBeTrue();
    expect(q<HTMLInputElement>('#pasta-nome').value).toBe('Receitas');
    expect(preview().getAttribute('data-cor')).toBe('verde');
    expect(q('.prop[data-prop="cor"]').textContent).toContain('Cor: Verde');
    expect(q('.masthead').getAttribute('data-cor')).toBe('verde');
  });

  it('a cor e o enfeite mudam a pasta da mesa na hora; salvar grava só isso (a vista fica como estava)', async () => {
    await open();
    await pickProp('cor');
    await radio('Azul');
    await pickProp('enfeite');
    await radio('Pontilhado');
    expect(preview().getAttribute('data-cor')).toBe('azul');
    expect(preview().getAttribute('data-enfeite')).toBe('costura');
    await save();
    expect(applied).toEqual([{ look: { color: 'azul', decor: 'costura', view: 'lista' } }]);
    expect(el().open).toBeFalse();
  });

  it('cada enfeite aparece desenhado numa pasta com o nome dele, na cor escolhida', async () => {
    await open();
    await pickProp('enfeite');
    const names = Array.from(el().querySelectorAll('.enfeite-op .nome')).map((n) => n.textContent!.trim());
    expect(names[0]).toBe('Nenhum');
    expect(names).toContain('Borda picotada');
    expect(names.length).toBe(16);
    expect(Array.from(el().querySelectorAll('.enfeite-op app-folder-card')).every((c) => c.getAttribute('data-cor') === 'verde')).toBeTrue();
  });

  it('os adesivos: até três, na ordem em que foram colados; sem nenhum, não salva e avisa', async () => {
    await open();
    await pickProp('enfeite');
    await radio('Adesivos');
    await save();
    expect(applied).toEqual([]);
    expect(q('.cartela-txt').classList).toContain('forte');
    await sticker('Gatinho');
    await sticker('Dado');
    await sticker('Raio');
    expect(q<HTMLButtonElement>('.adesivo-op[aria-label="Coração"]').disabled).toBeTrue();
    // a ordem de cada um: o raio (3º colado) vem antes na cartela, depois o gatinho (1º) e o dado (2º)
    expect(Array.from(el().querySelectorAll('.adesivo-n')).map((n) => n.textContent!.trim())).toEqual(['3', '1', '2']);
    await sticker('Dado');
    expect(q<HTMLButtonElement>('.adesivo-op[aria-label="Coração"]').disabled).toBeFalse();
    await save();
    expect(applied).toEqual([{ look: { color: 'verde', decor: 'adesivos', stickers: ['gatinho', 'raio'], view: 'lista' } }]);
  });

  it('o nome de uma irmã avisa e para o Salvar; outro nome vai junto, com o Desfazer no bilhete', async () => {
    const shown: { text: string; run?: () => void }[] = [];
    spyOn(TestBed.inject(Toasts), 'show').and.callFake((text: string, action?: { label: string; run: () => void }) => shown.push({ text, run: action?.run }));
    await open();
    await typeName('viagem');
    expect(q('.aviso-nome').textContent).toContain('Já existe a pasta Viagem aqui');
    await save();
    expect(applied).toEqual([]);
    await typeName('Receitas da vó');
    await save();
    expect(applied).toEqual([{ name: 'Receitas da vó', look: { color: 'verde', view: 'lista' } }]);
    expect(shown[0].text).toBe('A pasta Receitas da vó foi customizada.');
    shown[0].run!();
    expect(undone).toBe(1);
  });

  it('só o que se mexeu na folha vai por cima: o enfeite que outra pessoa pôs enquanto ela estava aberta fica', async () => {
    await open();
    live = { ...FOLDER, look: { color: 'verde', decor: 'costura', view: 'inteira' } };
    await pickProp('cor');
    await radio('Azul');
    await save();
    expect(applied).toEqual([{ look: { color: 'azul', decor: 'costura', view: 'inteira' } }]);
  });

  it('fechar sem mudar nada fecha; com algo mudado, pergunta antes de descartar', async () => {
    const ask = spyOn(TestBed.inject(Confirm), 'ask').and.resolveTo(false);
    await open();
    q<HTMLButtonElement>('.fechar').click();
    await stable();
    expect(ask).not.toHaveBeenCalled();
    expect(el().open).toBeFalse();
    await open();
    await pickProp('cor');
    await radio('Rosa');
    q<HTMLButtonElement>('.fechar').click();
    await stable();
    expect(ask).toHaveBeenCalled();
    expect(el().open).toBeTrue();
    expect(applied).toEqual([]);
  });
});
