import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, PenLine } from 'lucide-angular';
import { profileOf } from '../core/kinds';
import { ProfileSection } from '../core/profile';
import { CategoryLooks } from '../core/category-looks';
import { Review, Stock, formatScore, isNote } from '../core/review';
import { pinningFor } from '../core/wall-physics';
import { MiniPolaroid } from './mini-polaroid';
import { ReviewCard } from './review-card';

/**
 * Uma seção do perfil: a fita com o nome, a linha à mão e as fichas no tipo escolhido, na parede ou
 * num quadro (com o fundo escolhido dentro da moldura). É a mesma no perfil e na prévia das
 * Configurações (sem o "Arrumar").
 */
@Component({
  selector: 'app-profile-section',
  imports: [LucideAngularModule, MiniPolaroid, ReviewCard, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-section.html',
  styleUrl: './profile-section.scss',
})
export class ProfileSectionView {
  readonly section = input.required<ProfileSection>();
  /** As fichas da seção que existem e estão à mostra, na ordem dela. */
  readonly cards = input.required<readonly Review[]>();
  /** As fichas de outra pessoa que ficam em segredo (Ajustes › Mural). */
  readonly hidden = input<ReadonlySet<string>>(new Set());
  readonly reactCode = input<string | null>(null);
  readonly looks = input<CategoryLooks>({});
  /** O "Arrumar" e o convite da seção vazia, que levam às Configurações (só no seu perfil, fora da prévia). */
  readonly editable = input(false);
  readonly opened = output<Review>();

  protected readonly EditIcon = PenLine;

  protected readonly fill = computed(() => {
    const s = this.section();
    if (s.frame !== 'quadro') return null;
    return s.fill.kind === 'cartolina' ? { material: null, stock: s.fill.stock } : { material: s.fill.material, stock: null };
  });

  protected score(r: Review): string {
    return isNote(r) ? '' : formatScore(r.scores.final);
  }

  /** A cartolina da ficha (a mesma do mural): o fundo da polaroid sem capa. */
  protected stockOf(r: Review): Stock {
    return pinningFor(r.id, r.stock).stock;
  }

  protected kindLabel(r: Review): string {
    return profileOf(r.kind).singular;
  }
}
