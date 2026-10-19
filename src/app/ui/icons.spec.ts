import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CATEGORY_ICONS, sanitizeCategoryLooks } from '../core/category-looks';
import { ICON_CHOICES, isIconChoice } from '../core/icon-choices';
import { COLUMN_ICONS, sanitizeBoard } from '../core/kanban';
import { KIND_ICON } from './kind-switcher';
import { categoryIcon } from './category-label';
import { ICON, ICON_CHOICE, ICON_CHOICE_LABEL, ICON_STROKE, IconModule } from './icons';

/** As cartelas de antes, uma de cada lugar: todo id guardado nelas tem de continuar valendo. */
const OLD_CATEGORY_IDS = [
  'maleta', 'capelo', 'carrinho', 'lista', 'lampada', 'sino', 'chapeu', 'alvo', 'aviao', 'caderno', 'coracao', 'musica',
  'filme', 'pessoas', 'cerebro', 'paleta', 'moedas', 'mundo', 'predio', 'coroa', 'brilho', 'marcador', 'livro', 'pena',
  'camera', 'quebra-cabeca', 'bandeira', 'relogio', 'microscopio', 'megafone', 'etiqueta', 'chip', 'inseto', 'raio', 'pasta',
];
const OLD_COLUMN_IDS = [
  'circulo', 'lista', 'lapis', 'martelo', 'engrenagem', 'olho', 'ampulheta', 'pausa', 'bloqueio', 'check', 'trofeu',
  'foguete', 'lampada', 'inseto', 'bandeira', 'estrela', 'caixa', 'calendario', 'pessoas', 'chama',
];

@Component({
  selector: 'app-icon-host',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<lucide-icon [img]="icon" [size]="size()" />`,
})
class IconHost {
  readonly icon = ICON.fechar;
  readonly size = signal(13);
}

describe('O acervo de ícones', () => {
  it('a cartela dos grupos e a das colunas são a mesma, sem repetir, com todo id de antes', () => {
    expect(CATEGORY_ICONS).toBe(ICON_CHOICES);
    expect(COLUMN_ICONS).toBe(ICON_CHOICES);
    expect(new Set(ICON_CHOICES).size).toBe(ICON_CHOICES.length);
    for (const id of [...OLD_CATEGORY_IDS, ...OLD_COLUMN_IDS]) expect(isIconChoice(id)).withContext(id).toBeTrue();
    expect(ICON_CHOICES.length as number).toBe(new Set([...OLD_CATEGORY_IDS, ...OLD_COLUMN_IDS]).size);
    expect(isIconChoice('nave')).toBeFalse();
  });

  it('toda escolha tem desenho e nome, e duas escolhas nunca têm o mesmo desenho', () => {
    for (const id of ICON_CHOICES) {
      expect(ICON_CHOICE[id]?.length).withContext(id).toBeGreaterThan(0);
      expect(ICON_CHOICE_LABEL[id]).withContext(id).toBeTruthy();
    }
    expect(new Set(ICON_CHOICES.map((id) => ICON_CHOICE[id])).size).toBe(ICON_CHOICES.length);
  });

  it('a escolha usa o desenho do acervo da mesma ideia (a engrenagem e as pessoas são as do site)', () => {
    expect(ICON_CHOICE.engrenagem).toBe(ICON.configurar);
    expect(ICON_CHOICE.pessoas).toBe(ICON.pessoas);
    expect(ICON_CHOICE.lista).toBe(ICON.tarefas);
    expect(ICON_CHOICE.check).toBe(ICON.feito);
    expect(ICON_CHOICE.lapis).toBe(ICON.editar);
    expect(ICON_CHOICE.livro).toBe(KIND_ICON.livros);
    expect(ICON_CHOICE.filme).toBe(KIND_ICON.filmes);
  });

  it('cada ideia tem um desenho, e um desenho não serve a duas ideias (fora o olho, que também é o da pública)', () => {
    const byGlyph = new Map<unknown, string[]>();
    for (const [name, glyph] of Object.entries(ICON)) {
      expect(glyph.length).withContext(name).toBeGreaterThan(0);
      byGlyph.set(glyph, [...(byGlyph.get(glyph) ?? []), name]);
    }
    const shared = [...byGlyph.values()].filter((names) => names.length > 1);
    expect(shared).toEqual([['ver', 'publica']]);
  });

  it('os murais tiram o desenho do acervo (as orelhas das pastas do perfil)', () => {
    expect(Object.values(KIND_ICON).every((g) => Object.values(ICON).includes(g as never))).toBeTrue();
  });

  it('o grupo pronto sem desenho escolhido mostra o do acervo (a lista é a das tarefas)', () => {
    expect(categoryIcon('A fazer')).toBe(ICON.tarefas);
    expect(categoryIcon('Qualquer coisa', { icon: 'foguete' })).toBe(ICON.foguete);
  });

  it('o grupo aceita um desenho que antes era só das colunas, e a coluna um que era só dos grupos', () => {
    expect(sanitizeCategoryLooks({ trabalho: { icon: 'foguete' }, estudos: { icon: 'nave' } })).toEqual({ trabalho: { icon: 'foguete' } });
    const b = sanitizeBoard({
      category: 'Trabalho',
      at: '2026-10-19T12:00:00.000Z',
      columns: [
        { id: 'a', name: 'A', icon: 'maleta', color: 'cinza' },
        { id: 'b', name: 'B', icon: 'nave', color: 'cinza' },
      ],
      cards: [],
    })!;
    expect(b.columns.map((c) => c.icon)).toEqual(['maleta', 'circulo']);
  });

  it(`todo ícone risca a linha com ${ICON_STROKE}px, de qualquer tamanho`, () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(IconHost);
    const px = () => {
      f.detectChanges();
      const svg = (f.nativeElement as HTMLElement).querySelector('svg')!;
      return (Number(svg.getAttribute('stroke-width')) * Number(svg.getAttribute('width'))) / 24;
    };
    expect(px()).toBeCloseTo(ICON_STROKE, 2);
    f.componentInstance.size.set(26);
    expect(px()).toBeCloseTo(ICON_STROKE, 2);
  });
});
