import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FOLDER_DECORS } from '../core/folder-looks';
import { folderDecorSvg, folderStickersSvg } from '../core/folder-art';
import type { NoteFolder } from '../core/folders';
import { FolderCard } from './folder-card';

/**
 * A pasta customizada na parede (PLANO-PASTAS-CUSTOMIZADAS.md, 3): a cor e o enfeite no host, o desenho do
 * enfeite na frente, e a pasta de sempre sem nada a mais (as medidas de antes).
 */

@Component({
  imports: [FolderCard],
  template: `<div style="width: 150px"><app-folder-card [folder]="folder()" [info]="{ notes: 2, folders: 0, peek: [] }" /></div>`,
})
class Host {
  readonly folder = signal<NoteFolder>({ id: 'pcust0000001', group: 'estudos', name: 'Receitas', parent: null });
}

describe('a pasta customizada (FolderCard)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const card = () => fixture.nativeElement.querySelector('app-folder-card') as HTMLElement;
  const set = async (look: NoteFolder['look']) => {
    host.folder.set({ id: 'pcust0000001', group: 'estudos', name: 'Receitas', parent: null, ...(look ? { look } : {}) });
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });
  afterEach(() => fixture.nativeElement.remove());

  it('a pasta de sempre: sem cor, sem enfeite, com a frente e as folgas de antes', () => {
    expect(card().hasAttribute('data-cor')).toBeFalse();
    expect(card().hasAttribute('data-enfeite')).toBeFalse();
    expect(card().querySelector('.enfeite')).toBeNull();
    const frente = getComputedStyle(card().querySelector('.frente')!);
    expect(frente.padding).toBe('9px 12px 10px');
    expect(frente.backgroundColor).toBe('rgb(214, 195, 145)');
    expect(getComputedStyle(card().querySelector('.fundo')!).backgroundColor).toBe('rgb(190, 168, 115)');
  });

  it('a cor muda a frente e o fundo; a grafite escreve em branco', async () => {
    await set({ color: 'azul' });
    // a frente troca de cor com a transição dela
    await new Promise((r) => setTimeout(r, 450));
    expect(card().getAttribute('data-cor')).toBe('azul');
    expect(getComputedStyle(card().querySelector('.frente')!).backgroundColor).toBe('rgb(159, 199, 227)');
    await set({ color: 'grafite' });
    expect(getComputedStyle(card().querySelector('.nome')!).color).toBe('rgb(243, 239, 230)');
  });

  it('cada enfeite aparece na frente, abrindo com ela', async () => {
    for (const d of FOLDER_DECORS) {
      await set({ decor: d.id });
      expect(card().getAttribute('data-enfeite')).withContext(d.id).toBe(d.id);
      expect(card().querySelector('.frente > .enfeite')).withContext(d.id).not.toBeNull();
    }
  });

  it('os adesivos numa camada por cima da frente, fora dela (as máscaras do enfeite não os cortam), com qualquer enfeite', async () => {
    await set({ stickers: ['gatinho', 'dado', 'raio'] });
    expect(card().getAttribute('data-adesivos')).toBe('3');
    expect(card().hasAttribute('data-enfeite')).toBeFalse();
    expect(card().querySelectorAll('.pasta > .adesivos svg.adesivo').length).toBe(3);
    for (const d of FOLDER_DECORS) {
      await set({ decor: d.id, stickers: ['gatinho'] });
      expect(card().getAttribute('data-enfeite')).withContext(d.id).toBe(d.id);
      expect(card().querySelectorAll('.pasta > .adesivos svg.adesivo').length).withContext(d.id).toBe(1);
      expect(card().querySelector('.frente .adesivo')).withContext(d.id).toBeNull();
    }
    // a camada tem o tamanho da frente e fica no mesmo lugar
    const frente = card().querySelector('.frente')!.getBoundingClientRect();
    const camada = card().querySelector('.adesivos')!.getBoundingClientRect();
    expect(camada.height).toBeCloseTo(frente.height, 0);
    expect(camada.bottom).toBeCloseTo(frente.bottom, 0);
    // a fita do canto e a ponta dobrada passam por cima dos adesivos (pedido do dono); nos outros, eles ficam por cima
    for (const decor of ['canto', 'orelha'] as const) {
      await set({ decor });
      expect(getComputedStyle(card().querySelector('.enfeite')!, '::before').content).withContext(decor).not.toBe('none');
      await set({ decor, stickers: ['gatinho'] });
      expect(getComputedStyle(card().querySelector('.enfeite')!, '::before').content).withContext(decor).toBe('none');
      expect(getComputedStyle(card().querySelector('.adesivos .por-cima')!, '::before').content).withContext(decor).not.toBe('none');
    }
    await set({ decor: 'xadrez', stickers: ['gatinho'] });
    expect(getComputedStyle(card().querySelector('.adesivos .por-cima')!, '::before').content).toBe('none');
    await set({ decor: 'costura' });
    expect(card().hasAttribute('data-adesivos')).toBeFalse();
    expect(card().querySelector('.adesivos')).toBeNull();
  });

  it('as estrelas vêm desenhadas; a etiqueta escreve em preto mesmo na grafite', async () => {
    await set({ color: 'rosa', decor: 'estrelas' });
    expect(card().querySelectorAll('.enfeite svg.estrelas polygon, .enfeite svg.estrelas path').length).toBeGreaterThan(3);
    await set({ color: 'grafite', decor: 'etiqueta' });
    expect(getComputedStyle(card().querySelector('.nome')!).color).toBe('rgb(21, 21, 21)');
  });
});

describe('dando nome a uma pasta com adesivos', () => {
  it('os adesivos vão dentro da frente (crescem com ela) e o campo dá lugar a eles', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fx = TestBed.createComponent(FolderCard);
    fx.componentRef.setInput('folder', { id: 'pcust0000001', group: 'estudos', name: 'Receitas', parent: null, look: { decor: 'costura', stickers: ['dado', 'raio'] } });
    fx.componentRef.setInput('naming', true);
    fx.componentRef.setInput('clash', 'Viagem');
    document.body.appendChild(fx.nativeElement);
    await fx.whenStable();
    const el = fx.nativeElement as HTMLElement;
    const frente = el.querySelector('.frente')!;
    expect(frente.querySelectorAll('.adesivos svg.adesivo').length).toBe(2);
    expect(getComputedStyle(el.querySelector('.nome-campo')!).paddingRight).toBe('30px');
    expect(el.querySelector('.adesivos')!.getBoundingClientRect().top).toBeCloseTo(frente.getBoundingClientRect().top, 0);
    fx.nativeElement.remove();
  });
});

describe('o desenho dos enfeites (core/folder-art.ts)', () => {
  it('só as estrelas e a meia-lua são desenho do enfeite; o resto é CSS', () => {
    expect(folderDecorSvg({ decor: 'costura' }, 'pa')).toBe('');
    expect(folderDecorSvg(undefined, 'pa')).toBe('');
    expect(folderDecorSvg({ decor: 'meia-lua' }, 'pa')).toContain('var(--sutil)');
  });

  it('as estrelas têm a cor que combina com o papel (vermelhas na manilha, azuis na amarela, ouro na grafite)', () => {
    expect(folderDecorSvg({ decor: 'estrelas' }, 'pa')).toContain('#e8323f');
    expect(folderDecorSvg({ color: 'amarelo', decor: 'estrelas' }, 'pa')).toContain('#2f7de0');
    expect(folderDecorSvg({ color: 'grafite', decor: 'estrelas' }, 'pa')).toContain('#f2c230');
  });

  it('os adesivos tortos pelo id da pasta: o mesmo em todo aparelho, diferente de outra pasta', () => {
    const a = folderStickersSvg({ stickers: ['coracao', 'dado'] }, 'pcust0000001');
    expect(folderStickersSvg({ decor: 'estrelas', stickers: ['coracao', 'dado'] }, 'pcust0000001')).toBe(a);
    expect(folderStickersSvg({ stickers: ['coracao', 'dado'] }, 'pcust0000002')).not.toBe(a);
    expect(folderStickersSvg({ decor: 'estrelas' }, 'pcust0000001')).toBe('');
  });

  it('o que não é do catálogo (sem saneamento) não derruba o desenho', () => {
    expect(folderStickersSvg({ stickers: ['foguete' as never, 'dado'] }, 'pa').match(/class='adesivo'/g)?.length).toBe(1);
    expect(folderDecorSvg({ color: 'neon' as never, decor: 'estrelas' }, 'pa')).toContain('#e8323f');
  });

  it('os ids dos gradientes são os da pasta desenhada (a mesma pasta duas vezes na página não se mistura)', () => {
    expect(folderDecorSvg({ decor: 'estrelas' }, 'pa-p1')).toContain("id='pasta-pa-p1-folha'");
  });
});
