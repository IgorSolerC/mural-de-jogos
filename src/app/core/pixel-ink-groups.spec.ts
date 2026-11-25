import { INK_GROUPS_MAX, InkGroup, cleanGroupName, drawingInks, parseInkGroups, readPixelArt, sanitizeInkGroups, writeInkGroups, writePixelArt } from './pixel-art';
import { addGroup, groupOfInk, groupsByHue, inkFamily, inkOrder, looseInks, moveGroup, moveToGroup, probeRow, remapInkGroups, removeGroup, suggestGroupName } from './pixel-ink-groups';
import { draftKey } from './pixel-drafts';
import { artValues, cleanArt, valuesArt } from './pixel-gallery';
import { moveInk, removeInk, removeInks, sortInks } from './pixel-tools';
import { widgetDef } from './widgets';

/** Os grupos das cores (PLANO-GRUPOS-CORES.md, rodada 1): o formato na linha e as contas. */
describe('pixel art: os grupos das cores', () => {
  const g = (name: string, ...inks: number[]): InkGroup => ({ name, inks });

  describe('na linha do {{pixel}}', () => {
    it('lê "grupos [Cinzas]1567 [Quentes]89a [Vazio]" em qualquer lugar da linha, com o grupo vazio', () => {
      const art = readPixelArt(['8x1', '123', 'pico8', 'grupos [Cinzas]1567 [Quentes]89a [Vazio]', 'Gato']);
      expect(art.groups).toEqual([g('Cinzas', 1, 5, 6, 7), g('Quentes', 8, 9, 10), g('Vazio')]);
      expect(art.caption).toBe('Gato');
      expect(art.palette).toBe('pico8');
    });

    it('escreve depois das cores trocadas e antes do jeito e da legenda; sem grupo, nada', () => {
      const base = readPixelArt(['4x1', '1234', '3#ff0000', 'figurinha', 'Gato']);
      expect(writePixelArt(base)).toEqual(['4x1', '1234', '3#ff0000', 'figurinha', 'Gato']);
      expect(writePixelArt({ ...base, groups: [g('Quentes', 3, 4), g('Contorno', 1)] })).toEqual(['4x1', '1234', '3#ff0000', 'grupos [Quentes]34 [Contorno]1', 'figurinha', 'Gato']);
    });

    it('vai e volta igual, com letras (a, Z) e o nome com espaços', () => {
      const art = readPixelArt(['2x1', 'aZ/', 'completa']);
      const line = writePixelArt({ ...art, groups: [g('Tons de pele', 10, 61)] })!;
      expect(line).toContain('grupos [Tons de pele]aZ');
      expect(readPixelArt(line).groups).toEqual([g('Tons de pele', 10, 61)]);
    });

    it('a cor que a paleta não tem e a repetida saem; o nome perde os colchetes, as chaves e a barra', () => {
      // a clássica tem 9 cores: a "a" (10) não existe; o 2 já está no primeiro grupo
      const line = writePixelArt({ ...readPixelArt(['2x1', '12']), groups: [g('[Um] {x}|', 2, 1), g('Dois', 2, 10)] })!;
      expect(line).toContain('grupos [Um x]12 [Dois]');
      expect(sanitizeInkGroups([g('  ', 1)], 9)).toEqual([g('Grupo 1', 1)]);
      expect(cleanGroupName('a'.repeat(40)).length).toBe(24);
    });

    it(`até ${INK_GROUPS_MAX} grupos`, () => {
      const many = Array.from({ length: INK_GROUPS_MAX + 4 }, (_, i) => g(`G${i}`));
      expect(sanitizeInkGroups(many, 9).length).toBe(INK_GROUPS_MAX);
    });

    it('a legenda "Grupos" continua legenda; a com cara de grupos faz ir um "grupos" vazio antes dela', () => {
      expect(readPixelArt(['1x1', '1', 'Grupos']).caption).toBe('Grupos');
      const odd = writePixelArt({ ...readPixelArt(['1x1', '1']), caption: 'grupos [x]1' })!;
      expect(odd).toEqual(['1x1', '1', 'grupos', 'grupos [x]1']);
      const back = readPixelArt(odd);
      expect(back.caption).toBe('grupos [x]1');
      expect(back.groups).toEqual([]);
      expect(parseInkGroups('grupos de cor')).toBeNull();
    });

    it('uma linha comprida que não fecha não trava a leitura', () => {
      const t = performance.now();
      expect(parseInkGroups('grupos' + ' [a]  '.repeat(40) + '!')).toBeNull();
      expect(performance.now() - t).toBeLessThan(200);
    });

    it('o widget leva os grupos nos valores (sem campo na folha) e escreve de volta', () => {
      const def = widgetDef('pixel')!;
      const v = def.read(['2x1', '12', 'grupos [A]2']);
      expect(v['groups']).toBe('grupos [A]2');
      expect(def.write({ ...v, caption: 'Oi' })).toEqual(['2x1', '12', 'grupos [A]2', 'Oi']);
      // o texto falado e a cópia não leem os grupos
      expect(def.plain!(['2x1', '12', 'grupos [A]2'])).toBe('');
    });

    it('a obra da galeria guarda os grupos (cleanArt, os valores do ateliê)', () => {
      expect(cleanArt(['2x1', '12', 'grupos [A]2'])).toEqual(['2x1', '12', 'grupos [A]2']);
      expect(valuesArt({ ...artValues(['2x1', '12']), groups: 'grupos [B]1' })).toEqual(['2x1', '12', 'grupos [B]1']);
    });

    it('a chave do rascunho só muda com grupo (a dos rascunhos de antes continua a mesma)', () => {
      const v = { width: '2', height: '1', pixels: '12', palette: 'classica', colors: '' };
      expect(draftKey({ ...v, groups: '' })).toBe(draftKey(v));
      expect(draftKey({ ...v, groups: 'grupos [A]1' })).not.toBe(draftKey(v));
    });
  });

  describe('as contas', () => {
    const groups = [g('Cinzas', 2, 5), g('Quentes', 3), g('Vazio')];

    it('as soltas vêm primeiro, depois cada grupo; [ e ] andam nessa ordem', () => {
      expect(looseInks(groups, 6)).toEqual([1, 4, 6]);
      expect(inkOrder(groups, 6)).toEqual([0, 1, 4, 6, 2, 5, 3]);
      expect(groupOfInk(groups, 5)).toBe(0);
      expect(groupOfInk(groups, 4)).toBe(-1);
    });

    it('mover para um grupo tira de onde estava; -1 volta para as soltas', () => {
      expect(moveToGroup(groups, [5, 4], 2)).toEqual([g('Cinzas', 2), g('Quentes', 3), g('Vazio', 4, 5)]);
      expect(moveToGroup(groups, [2, 3], -1)).toEqual([g('Cinzas', 5), g('Quentes'), g('Vazio')]);
    });

    it('grupo novo (com cores ou vazio), desfeito e mudado de lugar', () => {
      expect(addGroup(groups, 'Novo', [3])).toEqual([g('Cinzas', 2, 5), g('Quentes'), g('Vazio'), g('Novo', 3)]);
      expect(addGroup(groups, 'Novo')).toEqual([...groups, g('Novo')]);
      expect(removeGroup(groups, 0)).toEqual([g('Quentes', 3), g('Vazio')]);
      expect(moveGroup(groups, 0, 1)).toEqual([g('Quentes', 3), g('Cinzas', 2, 5), g('Vazio')]);
      expect(moveGroup(groups, 0, -1)).toEqual(groups);
    });

    it('a fileira de prova leva os grupos junto quando a paleta renumera', () => {
      const inks = drawingInks('classica', {});
      const probe = probeRow(9);
      expect(probe).toBe('0123456789');
      // tirar a 3: os grupos perdem a 3; a 5 vira a 4
      expect(remapInkGroups(groups, removeInk([probe], inks, 3).rows[0], 8)).toEqual([g('Cinzas', 2, 4), g('Quentes'), g('Vazio')]);
      // levar a 5 para o lugar 1: a 2 vira a 3, a 3 vira a 4
      expect(remapInkGroups(groups, moveInk([probe], inks, 5, 1).rows[0], 9)).toEqual([g('Cinzas', 1, 3), g('Quentes', 4), g('Vazio')]);
      expect(remapInkGroups(groups, removeInks([probe], inks, [1, 4]).rows[0], 7)).toEqual([g('Cinzas', 1, 3), g('Quentes', 2), g('Vazio')]);
      // ordenar: cada cor segue a dela
      const sorted = sortInks([probe], inks, 'luz');
      const after = remapInkGroups(groups, sorted.rows[0], 9);
      expect(after[0].inks.map((n) => sorted.colors[n]).sort()).toEqual([inks[2], inks[5]].sort() as string[]);
    });

    it('a família da cor e o nome sugerido', () => {
      expect(inkFamily('#808080')).toBe('cinza');
      expect(inkFamily('#101010')).toBe('cinza');
      expect(inkFamily('#e43b44')).toBe('vermelho');
      expect(inkFamily('#8b5a2b')).toBe('marrom');
      expect(inkFamily('#ff8c00')).toBe('laranja');
      expect(inkFamily('#ffd700')).toBe('amarelo');
      expect(inkFamily('#3e8948')).toBe('verde');
      expect(inkFamily('#3355aa')).toBe('azul');
      expect(inkFamily('#7e57c2')).toBe('roxo');
      expect(inkFamily('#ffb6c1')).toBe('rosa');
      expect(suggestGroupName(['#808080', '#cccccc'], [])).toBe('Cinzas');
      expect(suggestGroupName(['#e43b44', '#ffd700'], [])).toBe('Quentes');
      expect(suggestGroupName(['#3e8948', '#3355aa'], [])).toBe('Frios');
      expect(suggestGroupName(['#3355aa'], ['Azuis'])).toBe('Azuis 2');
      expect(suggestGroupName(['#e43b44', '#3355aa'], ['Cinzas'])).toBe('Grupo 2');
      expect(suggestGroupName([], [])).toBe('Grupo 1');
    });

    it('agrupar pelo tom: cada cor no grupo da família dela, na ordem do círculo', () => {
      const out = groupsByHue([null, '#000000', '#ffffff', '#e43b44', '#3355aa', '#3e8948', '#ff0000']);
      expect(out).toEqual([g('Cinzas', 1, 2), g('Vermelhos', 3, 6), g('Verdes', 5), g('Azuis', 4)]);
    });
  });
});
