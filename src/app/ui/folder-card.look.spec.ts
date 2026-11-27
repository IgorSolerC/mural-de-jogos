import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FOLDER_DECORS } from '../core/folder-looks';
import { folderDecorSvg } from '../core/folder-art';
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
      await set(d.id === 'adesivos' ? { decor: 'adesivos', stickers: ['gatinho'] } : { decor: d.id });
      expect(card().getAttribute('data-enfeite')).withContext(d.id).toBe(d.id);
      expect(card().querySelector('.frente > .enfeite')).withContext(d.id).not.toBeNull();
    }
  });

  it('as estrelas e os adesivos vêm desenhados; a etiqueta escreve em preto mesmo na grafite', async () => {
    await set({ decor: 'adesivos', stickers: ['gatinho', 'dado', 'raio'] });
    expect(card().querySelectorAll('.enfeite svg.adesivo').length).toBe(3);
    await set({ color: 'rosa', decor: 'estrelas' });
    expect(card().querySelectorAll('.enfeite svg.estrelas polygon, .enfeite svg.estrelas path').length).toBeGreaterThan(3);
    await set({ color: 'grafite', decor: 'etiqueta' });
    expect(getComputedStyle(card().querySelector('.nome')!).color).toBe('rgb(21, 21, 21)');
  });
});

describe('o desenho dos enfeites (core/folder-art.ts)', () => {
  it('só as estrelas, a meia-lua e os adesivos são desenho; o resto é CSS', () => {
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
    const a = folderDecorSvg({ decor: 'adesivos', stickers: ['coracao', 'dado'] }, 'pcust0000001');
    expect(folderDecorSvg({ decor: 'adesivos', stickers: ['coracao', 'dado'] }, 'pcust0000001')).toBe(a);
    expect(folderDecorSvg({ decor: 'adesivos', stickers: ['coracao', 'dado'] }, 'pcust0000002')).not.toBe(a);
  });

  it('o que não é do catálogo (sem saneamento) não derruba o desenho', () => {
    expect(folderDecorSvg({ decor: 'adesivos', stickers: ['foguete' as never, 'dado'] }, 'pa').match(/class='adesivo'/g)?.length).toBe(1);
    expect(folderDecorSvg({ color: 'neon' as never, decor: 'estrelas' }, 'pa')).toContain('#e8323f');
  });

  it('os ids dos gradientes são os da pasta desenhada (a mesma pasta duas vezes na página não se mistura)', () => {
    expect(folderDecorSvg({ decor: 'estrelas' }, 'pa', 'pa-p1')).toContain("id='pasta-pa-p1-folha'");
  });
});
