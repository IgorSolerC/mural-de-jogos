import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  BellRing,
  Bookmark,
  BookOpen,
  Brain,
  Briefcase,
  Bug,
  Camera,
  ChefHat,
  Clock,
  Coins,
  Cpu,
  Crown,
  Earth,
  Feather,
  Film,
  Flag,
  FolderOpen,
  GraduationCap,
  Heart,
  Landmark,
  Lightbulb,
  ListTodo,
  LucideAngularModule,
  LucideIconData,
  Megaphone,
  Microscope,
  Music,
  NotebookPen,
  Palette,
  Plane,
  Puzzle,
  ShoppingCart,
  Sparkles,
  Tag,
  Target,
  Users,
  Zap,
} from 'lucide-angular';
import { CategoryIconId, CategoryLook, categoryColorHex } from '../core/category-looks';
import { categoryBonus } from '../core/note-labels';
import { bonusIcon } from './bonus';

/** O desenho de cada escolha (todos já vêm no site pelos adesivos de bônus: não pesam nada a mais). */
export const CATEGORY_ICON: Record<CategoryIconId, LucideIconData> = {
  maleta: Briefcase,
  capelo: GraduationCap,
  carrinho: ShoppingCart,
  lista: ListTodo,
  lampada: Lightbulb,
  sino: BellRing,
  chapeu: ChefHat,
  alvo: Target,
  aviao: Plane,
  caderno: NotebookPen,
  coracao: Heart,
  musica: Music,
  filme: Film,
  pessoas: Users,
  cerebro: Brain,
  paleta: Palette,
  moedas: Coins,
  mundo: Earth,
  predio: Landmark,
  coroa: Crown,
  brilho: Sparkles,
  marcador: Bookmark,
  livro: BookOpen,
  pena: Feather,
  camera: Camera,
  'quebra-cabeca': Puzzle,
  bandeira: Flag,
  relogio: Clock,
  microscopio: Microscope,
  megafone: Megaphone,
  etiqueta: Tag,
  chip: Cpu,
  inseto: Bug,
  raio: Zap,
  pasta: FolderOpen,
};

/** O desenho da categoria: o escolhido, ou o de sempre (o da cartela, ou a pasta). */
export function categoryIcon(category: string, look: CategoryLook = {}): LucideIconData {
  return look.icon ? CATEGORY_ICON[look.icon] : bonusIcon(categoryBonus(category));
}

/**
 * O desenho e o nome da categoria, como na orelha da ficha e na aba da pasta. Com cor, os dois vão
 * numa etiqueta de borda colorida fina, solta da beirada da orelha (a etiqueta de fichário). A letra
 * e o tamanho vêm de quem usa (herdados).
 */
@Component({
  selector: 'app-cat-label',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.com-cor]': '!!color()',
    '[style.--cat-cor]': 'color()',
  },
  template: `<lucide-icon class="icone" [img]="icon()" [size]="iconSize()" [strokeWidth]="2.6" aria-hidden="true" /><span class="nome">{{ label() }}</span>`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      max-width: 100%;
    }
    .icone {
      flex: none;
      display: inline-flex;
      opacity: 0.8;
    }
    /* a linha de base do rótulo é a do nome: ao lado de um número (nas abas), os dois se alinham */
    .nome {
      align-self: baseline;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    /* a etiqueta: papel claro com a borda de tinta fina, um pouco para dentro da orelha */
    :host(.com-cor) {
      padding: 1px 7px 1px 6px;
      border: 2px solid var(--cat-cor);
      border-radius: 6px;
      background-color: #fffcf2;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.12);
    }
    :host(.com-cor) .icone {
      opacity: 1;
    }
  `,
})
export class CategoryLabel {
  readonly label = input.required<string>();
  readonly look = input<CategoryLook>({});
  readonly iconSize = input(13);

  protected readonly icon = computed(() => categoryIcon(this.label(), this.look()));
  protected readonly color = computed(() => categoryColorHex(this.look().color));
}
