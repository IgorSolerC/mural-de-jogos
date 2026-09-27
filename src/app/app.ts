import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { LucideAngularModule, Plus, SlidersHorizontal } from 'lucide-angular';
import { ReviewStore } from './core/review-store';
import { ViewTransitions } from './core/view-transitions';
import { WallView } from './core/wall-view';
import { DraftCard } from './ui/draft-card';
import { Pin } from './ui/pin';
import { ReviewCard } from './ui/review-card';
import { ReviewEditor, SavedEvent } from './ui/review-editor';
import { ReviewReader } from './ui/review-reader';
import { SettingsPanel } from './ui/settings-panel';
import { Toast, Toasts } from './ui/toast';
import { WallToolbar } from './ui/wall-toolbar';

const numberFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

@Component({
  selector: 'app-root',
  imports: [LucideAngularModule, DraftCard, Pin, ReviewCard, ReviewEditor, ReviewReader, SettingsPanel, Toast, WallToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(document:keydown)': 'onGlobalKey($event)' },
})
export class App {
  protected readonly store = inject(ReviewStore);
  protected readonly view = inject(WallView);
  private readonly vt = inject(ViewTransitions);
  private readonly toasts = inject(Toasts);

  protected readonly PlusIcon = Plus;
  protected readonly SettingsIcon = SlidersHorizontal;

  private readonly editor = viewChild.required(ReviewEditor);
  private readonly reader = viewChild.required(ReviewReader);
  private readonly settings = viewChild.required(SettingsPanel);
  private readonly toolbar = viewChild(WallToolbar);

  protected readonly landingId = signal<string | null>(null);
  protected readonly ghosts = [0, 1, 2];

  protected readonly tally = computed(() => {
    const list = this.store.reviews();
    const n = list.length;
    const plat = list.filter((r) => r.status === 'platinado').length;
    const avg = n ? list.reduce((s, r) => s + r.scores.final, 0) / n : 0;
    return {
      games: n ? `${n} ${n === 1 ? 'jogo' : 'jogos'} no mural` : 'Nenhum jogo pregado ainda',
      plat: `${plat} ${plat === 1 ? 'platinado' : 'platinados'}`,
      avg: n ? `nota média ${numberFmt.format(avg)}` : '',
    };
  });

  protected readonly highlight = computed(() => (this.view.sort() === 'nota' ? this.view.scoreKey() : null));

  constructor() {
    // Texturas fotográficas são opcionais: só entram se o arquivo existir.
    afterNextRender(() => {
      this.useTexture('/textures/parede-eucatex.png', 'has-wall-texture');
      this.useTexture('/textures/cartolina-fibra.png', 'has-paper-texture');
      this.useTexture('/textures/tachinhas.png', 'has-pins');
      this.useTexture('/textures/holografico.png', 'has-holo');
      this.useTexture('/textures/fita-crepe.png', 'has-tape');
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.landingTimer));
  }

  protected newReview(): void {
    this.editor().open();
  }

  protected openSettings(): void {
    this.settings().open();
  }

  protected openReview(id: string): void {
    const r = this.store.get(id);
    if (r) this.reader().open(r);
  }

  protected openDraft(id: string): void {
    const d = this.store.getDraft(id);
    if (d) this.editor().open(undefined, d);
  }

  protected removeDraft(id: string): void {
    const d = this.store.getDraft(id);
    if (!d) return;
    this.vt.run(() => this.store.removeDraft(id));
    this.toasts.show(`“${d.game.name}” saiu da fila`, {
      label: 'Desfazer',
      run: () => this.vt.run(() => this.store.restoreDraft(d)),
    });
  }

  protected onDrafted(e: SavedEvent): void {
    const name = this.store.getDraft(e.id)?.game.name ?? '';
    this.land(e.id);
    this.toasts.show(e.isNew ? `“${name}” guardado pra resenhar depois` : 'Pendente atualizado');
  }

  protected editReview(id: string): void {
    const r = this.store.get(id);
    if (!r) return;
    this.reader().close();
    this.editor().open(r);
  }

  protected removeReview(id: string): void {
    this.reader().close();
    // Pega a ficha antes: o callback da view transition roda depois deste método.
    const r = this.store.get(id);
    if (!r) return;
    this.vt.run(() => this.store.remove(id));
    this.toasts.show(`“${r.game.name}” saiu do mural`, {
      label: 'Desfazer',
      run: () => this.vt.run(() => this.store.restore(r)),
    });
  }

  protected onSaved(e: SavedEvent): void {
    const name = this.store.get(e.id)?.game.name ?? '';
    // Se a ficha nova ficaria escondida pelo filtro, limpa o filtro para ela aparecer.
    if (!this.view.visible().some((r) => r.id === e.id)) this.view.clearFilters();
    this.land(e.id);
    this.toasts.show(e.isNew ? `“${name}” pregado no mural` : 'Resenha atualizada');
  }

  /** A ficha (ou folha) recém-salva cai na parede e a tela vai até ela. */
  private land(id: string): void {
    this.landingId.set(id);
    clearTimeout(this.landingTimer);
    this.landingTimer = setTimeout(() => this.landingId.set(null), 1100);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-ficha="${id}"]`);
      el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  }

  protected onImported(n: number): void {
    if (n) this.toasts.show(`${n} ${n === 1 ? 'resenha voltou' : 'resenhas voltaram'} para o mural`);
  }

  protected clearFilters(): void {
    this.vt.run(() => this.view.clearFilters());
  }

  protected onGlobalKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    if (e.key === '/') {
      e.preventDefault();
      this.toolbar()?.focusSearch();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      this.newReview();
    }
  }

  private landingTimer: ReturnType<typeof setTimeout> | undefined;

  private useTexture(url: string, cls: string): void {
    const img = new Image();
    img.onload = () => document.body.classList.add(cls);
    img.src = url;
  }
}
