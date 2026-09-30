import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  LucideAngularModule,
  Upload,
  X,
  Rows3,
  LayoutGrid,
  Search,
  ChevronDown,
} from 'lucide-angular';
import { ColleagueStore } from '../core/colleague-store';
import { ReviewPair, commonReviews } from '../core/comparison';
import { KINDS, Kind, profileOf } from '../core/kinds';
import {
  Review,
  SCORE_LABEL,
  fold,
  formatScore,
  ratedKeys,
  scoreOf,
  weightOf,
  WEIGHT_LABEL,
} from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Pin } from '../ui/pin';
import { ReviewCard } from '../ui/review-card';
import { ReviewReader } from '../ui/review-reader';
import { Toasts } from '../ui/toast';

const collator = new Intl.Collator('pt-BR', {
  sensitivity: 'base',
  numeric: true,
});
const exportedFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
type Order = 'nome' | 'diferenca' | 'minha' | 'colega';

@Component({
  selector: 'app-comparison-page',
  imports: [
    NgTemplateOutlet,
    LucideAngularModule,
    Pin,
    ReviewCard,
    ReviewReader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comparison-page.html',
  styleUrl: './comparison-page.scss',
})
export class ComparisonPage {
  protected readonly colleagues = inject(ColleagueStore);
  protected readonly store = inject(ReviewStore);
  private readonly toasts = inject(Toasts);
  private readonly destroy = inject(DestroyRef);
  private readonly reader = viewChild.required(ReviewReader);
  protected readonly selectedId = signal('');
  protected readonly selected = computed(
    () =>
      this.colleagues.colleagues().find((c) => c.id === this.selectedId()) ??
      this.colleagues.colleagues()[0] ??
      null,
  );
  protected readonly adding = signal(false);
  protected readonly managing = signal(false);
  protected readonly name = signal('');
  protected readonly renaming = signal(false);
  protected readonly renameText = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly kind = signal<Kind | 'todos'>('todos');
  protected readonly order = signal<Order>('nome');
  protected readonly activeFilters = computed(
    () =>
      Number(!!this.query().trim()) +
      Number(this.kind() !== 'todos') +
      Number(this.order() !== 'nome'),
  );
  protected readonly compact = signal(false);
  protected readonly phone = signal(false);
  protected readonly simple = computed(() => this.compact() || this.phone());
  protected readonly limit = signal(20);
  protected readonly UploadIcon = Upload;
  protected readonly RemoveIcon = X;
  protected readonly FullIcon = Rows3;
  protected readonly CompactIcon = LayoutGrid;
  protected readonly SearchIcon = Search;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly fmt = formatScore;
  protected readonly profile = profileOf;
  protected readonly labels = SCORE_LABEL;
  protected readonly scoreOf = scoreOf;
  protected readonly ratedKeys = ratedKeys;
  protected readonly weightOf = weightOf;
  protected readonly weightLabels = WEIGHT_LABEL;
  protected readonly pairs = computed(() =>
    commonReviews(this.store.reviews(), this.selected()?.reviews ?? []),
  );
  protected readonly kinds = computed(() =>
    KINDS.map((kind) => ({
      kind,
      label: profileOf(kind).plural,
      count: this.pairs().filter((p) => p.mine.kind === kind).length,
    })),
  );
  protected readonly filtered = computed(() => {
    const q = fold(this.query().trim());
    return this.pairs()
      .filter(
        (p) =>
          (this.kind() === 'todos' || p.mine.kind === this.kind()) &&
          (!q ||
            fold(
              `${p.mine.game.name} ${p.theirs.game.name} ${p.mine.game.by ?? ''} ${p.theirs.game.by ?? ''}`,
            ).includes(q)),
      )
      .sort((a, b) => {
        const byName =
          collator.compare(a.mine.game.name, b.mine.game.name) ||
          a.key.localeCompare(b.key);
        switch (this.order()) {
          case 'diferenca':
            return Math.abs(b.difference) - Math.abs(a.difference) || byName;
          case 'minha':
            return b.mine.scores.final - a.mine.scores.final || byName;
          case 'colega':
            return b.theirs.scores.final - a.theirs.scores.final || byName;
          default:
            return byName;
        }
      });
  });
  protected readonly visible = computed(() =>
    this.filtered().slice(0, this.limit()),
  );
  protected readonly backupDate = computed(() => {
    const date = this.selected()?.exportedAt;
    return date ? exportedFmt.format(new Date(date)) : null;
  });

  constructor() {
    const mq = matchMedia('(max-width: 699px)');
    const sync = () => this.phone.set(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    this.destroy.onDestroy(() => mq.removeEventListener('change', sync));
  }

  protected difference(pair: ReviewPair): string {
    if (pair.difference === 0) return 'Mesma nota';
    return `Sua nota é ${formatScore(Math.abs(pair.difference))} ${pair.difference > 0 ? 'maior' : 'menor'}`;
  }

  protected async load(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const c = await this.colleagues.add(
        file,
        this.name() ||
          `Colega${this.colleagues.colleagues().length ? ' ' + (this.colleagues.colleagues().length + 1) : ''}`,
      );
      if (this.destroy.destroyed) return;
      this.selectedId.set(c.id);
      this.adding.set(false);
      this.managing.set(false);
      this.name.set('');
      this.resetFilters();
      this.toasts.show(`Backup de ${c.name} carregado`);
    } catch (e) {
      if (!this.destroy.destroyed)
        this.error.set(
          e instanceof Error
            ? e.message
            : 'Não consegui abrir o backup. Tente outro arquivo.',
        );
    } finally {
      if (!this.destroy.destroyed) this.busy.set(false);
    }
  }

  protected choose(id: string): void {
    this.selectedId.set(id);
    this.error.set('');
    this.renaming.set(false);
    this.managing.set(false);
    this.resetFilters();
  }

  protected resetFilters(): void {
    this.query.set('');
    this.kind.set('todos');
    this.order.set('nome');
    this.limit.set(20);
  }

  protected more(): void {
    this.limit.update((n) => n + 20);
  }

  protected async rename(): Promise<void> {
    const c = this.selected();
    if (!c || !this.renameText().trim() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.colleagues.rename(c.id, this.renameText());
      this.renaming.set(false);
      this.managing.set(false);
    } catch (e) {
      this.error.set(
        e instanceof Error
          ? e.message
          : 'Não consegui salvar o nome. Tente novamente.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const c = this.selected();
    if (!c || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.colleagues.remove(c.id);
      this.renaming.set(false);
      this.managing.set(false);
      this.resetFilters();
      this.toasts.show(`Backup de ${c.name} removido da comparação`, {
        label: 'Desfazer',
        run: () => {
          void this.colleagues
            .restore(c)
            .then(() => this.selectedId.set(c.id))
            .catch(() =>
              this.error.set(
                'Não consegui recuperar o backup. Carregue o arquivo novamente.',
              ),
            );
        },
      });
    } catch {
      this.error.set('Não consegui remover esse backup. Tente novamente.');
    } finally {
      this.busy.set(false);
    }
  }

  protected open(review: Review, owner: string): void {
    this.reader().open(review, owner);
  }
}
