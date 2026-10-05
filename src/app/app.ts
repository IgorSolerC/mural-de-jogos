import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { LucideAngularModule, LucideIconData, NotebookPen, Plus, Scissors, Settings } from 'lucide-angular';
import { filter, map } from 'rxjs';
import { Backup } from './core/backup';
import { Desk } from './core/desk';
import { Mural } from './core/mural';
import { ReviewStore } from './core/review-store';
import { SideBySide } from './core/side-by-side';
import { ViewTransitions } from './core/view-transitions';
import { WallView } from './core/wall-view';
import { KindSwitcher } from './ui/kind-switcher';
import { PaperDefs } from './ui/paper-layer';
import { Pin } from './ui/pin';
import { ReviewEditor, SavedEvent } from './ui/review-editor';
import { ReviewReader } from './ui/review-reader';
import { Confirm, ConfirmDialog } from './ui/confirm';
import { Toast, Toasts } from './ui/toast';
import { WishAdder } from './ui/wish-adder';

interface Tab {
  path: string;
  label: string;
  /** Outras rotas que moram dentro desta aba (o lado a lado é uma vista do mural). */
  also?: string[];
  /** Só o desenho na fita (o nome fica para o leitor de tela e a dica): Ajustes é uma ferramenta, não um lugar. */
  icon?: LucideIconData;
}

const TABS: Tab[] = [
  { path: '/', label: 'Mural', also: ['/lado-a-lado'] },
  { path: '/fila', label: 'Pra depois' },
  { path: '/wishlist', label: 'Wishlist' },
  // o Ranking e o Comparar moram dentro de Extras: a fita de Extras fica acesa neles também
  { path: '/extras', label: 'Extras', also: ['/ranking', '/comparar', '/comparar/mural'] },
  { path: '/ajustes', label: 'Ajustes', icon: Settings },
];

@Component({
  selector: 'app-root',
  imports: [ConfirmDialog, KindSwitcher, LucideAngularModule, PaperDefs, Pin, ReviewEditor, ReviewReader, RouterLink, RouterOutlet, Toast, WishAdder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(document:keydown)': 'onGlobalKey($event)' },
})
export class App {
  protected readonly store = inject(ReviewStore);
  protected readonly mural = inject(Mural);
  private readonly view = inject(WallView);
  protected readonly desk = inject(Desk);
  private readonly vt = inject(ViewTransitions);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly side = inject(SideBySide);
  protected readonly backup = inject(Backup);

  /** O caminho aberto, sem query nem fragmento, para acender a aba certa. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: '/' },
  );

  /** Na fila do Pra depois ou na Wishlist: lá o N e o botão do topo adicionam à lista, não ao mural. */
  protected readonly onList = computed<'fila' | 'wishlist' | null>(() => {
    const p = this.path();
    return p.startsWith('/fila') ? 'fila' : p.startsWith('/wishlist') ? 'wishlist' : null;
  });

  protected readonly PlusIcon = Plus;
  protected readonly NoteIcon = NotebookPen;
  protected readonly CutIcon = Scissors;
  protected readonly tabs = TABS;

  private readonly editor = viewChild.required(ReviewEditor);
  private readonly reader = viewChild.required(ReviewReader);
  private readonly wishAdder = viewChild.required(WishAdder);

  constructor() {
    this.desk.register({
      newReview: () => this.editor().open(),
      openReview: (id) => {
        const r = this.store.get(id);
        if (r) this.reader().open(r);
      },
      openDraft: (id) => {
        const d = this.store.getDraft(id);
        if (d) this.editor().open(undefined, d);
      },
      newWish: () => this.wishAdder().open(),
      newDraft: () => this.wishAdder().open('draft'),
      openWish: (id) => {
        const w = this.store.getWish(id);
        if (w) this.editor().open(undefined, undefined, w);
      },
    });
    // Texturas fotográficas são opcionais: só entram se o arquivo existir.
    afterNextRender(() => {
      this.useTexture('textures/parede-eucatex.png', 'has-wall-texture');
      this.useTexture('textures/cartolina-fibra.png', 'has-paper-texture');
      this.useTexture('textures/tachinhas.png', 'has-pins');
      this.useTexture('textures/holografico.png', 'has-holo');
      this.useTexture('textures/fita-crepe.png', 'has-tape');
    });
  }

  protected isOn(t: Tab): boolean {
    const p = this.path();
    return p === t.path || !!t.also?.includes(p) || (t.path !== '/' && p.startsWith(t.path + '/'));
  }

  protected tabCount(path: string): number | null {
    if (path === '/') return this.mural.count() || null;
    if (path === '/fila') return this.mural.draftCount() || null;
    if (path === '/wishlist') return this.mural.wishCount() || null;
    return null;
  }

  protected newReview(): void {
    this.editor().open();
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

  protected removeWish(id: string): void {
    const w = this.store.getWish(id);
    if (!w) return;
    this.vt.run(() => this.store.removeWish(id));
    this.toasts.show(`“${w.game.name}” saiu da wishlist`, {
      label: 'Desfazer',
      run: () => this.vt.run(() => this.store.restoreWish(w)),
    });
  }

  protected onWished(id: string): void {
    const w = this.store.getWish(id);
    if (!w) return;
    const here = this.router.url.startsWith('/wishlist');
    if (here) this.desk.land(id);
    this.toasts.show(`“${w.game.name}” está na wishlist`, {
      label: here ? 'Desfazer' : 'Ver wishlist',
      run: here ? () => this.vt.run(() => this.store.removeWish(id)) : () => this.goLand('/wishlist', id),
    });
  }

  protected seeWish(id: string): void {
    if (this.router.url.startsWith('/wishlist')) this.desk.land(id);
    else this.goLand('/wishlist', id);
  }

  protected seeDraft(id: string): void {
    if (this.router.url.startsWith('/fila')) this.desk.land(id);
    else this.goLand('/fila', id);
  }

  protected onDrafted(e: SavedEvent): void {
    const name = this.store.getDraft(e.id)?.game.name ?? '';
    const onQueue = this.router.url.startsWith('/fila');
    if (onQueue) this.desk.land(e.id);
    this.toasts.show(
      e.isNew ? `“${name}” guardado pra depois` : 'Pendente atualizado',
      onQueue ? undefined : { label: 'Ver fila', run: () => this.goLand('/fila', e.id) },
    );
  }

  protected editReview(id: string): void {
    const r = this.store.get(id);
    if (!r) return;
    this.reader().close();
    this.editor().open(r);
  }

  protected async removeReview(id: string): Promise<void> {
    // Pega a ficha antes: o callback da view transition roda depois deste método.
    const r = this.store.get(id);
    if (!r) return;
    const sure = await this.confirm.ask({
      text: `“${r.game.name}” sai do mural, com as notas e o texto.`,
      confirm: 'Remover do mural',
    });
    if (!sure || !this.store.get(id)) return;
    this.reader().close();
    // O leitor devolveu o foco à ficha, que vai sumir: o teclado segue para a vizinha (ou o Desfazer)
    const cards = [...document.querySelectorAll<HTMLElement>('[data-ficha]')];
    const at = cards.findIndex((c) => c.dataset['ficha'] === id);
    const neighbour = (cards[at + 1] ?? cards[at - 1])?.dataset['ficha'];
    this.vt.run(() => this.store.remove(id));
    this.toasts.show(`“${r.game.name}” saiu do mural`, {
      label: 'Desfazer',
      run: () => this.vt.run(() => this.store.restore(r)),
    });
    setTimeout(() => {
      const next =
        (neighbour && document.querySelector<HTMLElement>(`[data-ficha="${neighbour}"] button.hit`)) ||
        document.querySelector<HTMLElement>('.bilhete button');
      next?.focus({ preventScroll: true });
    }, 60);
  }

  protected onSaved(e: SavedEvent): void {
    const name = this.store.get(e.id)?.game.name ?? '';
    // Ficha nova vai para o mural: se ela ficaria escondida pelo filtro, limpa o filtro.
    if (e.isNew && !this.view.visible().some((r) => r.id === e.id)) this.view.clearFilters();
    if (e.isNew && this.router.url !== '/') this.goLand('/', e.id);
    else this.desk.land(e.id);
    this.toasts.show(e.isNew ? `“${name}” pregado no mural` : 'Resenha atualizada');
    if (e.isNew) void this.backup.protect();
  }

  protected backupDays(days: number): string {
    return days === 0 ? 'Você ainda não baixou nenhum backup.' : `Seu último backup foi há ${days} dias.`;
  }

  private goLand(path: string, id: string): void {
    void this.router.navigateByUrl(path).then(() => this.desk.land(id));
  }

  protected onGlobalKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Esc encerra a marcação de fichas (com um diálogo aberto, o Esc é dele)
    if (e.key === 'Escape' && this.side.picking() && !document.querySelector('dialog[open]')) {
      this.side.picking.set(false);
      return;
    }
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    if (e.key === '/') {
      // Abre a busca da página, inclusive a gaveta de filtros no celular.
      const search = document.querySelector<HTMLInputElement>('input[data-busca]');
      if (!search) return;
      e.preventDefault();
      const disclosure = search.closest('details');
      if (disclosure) disclosure.open = true;
      search.focus();
      search.select();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      const list = this.onList();
      if (list === 'fila') this.desk.newDraft();
      else if (list === 'wishlist') this.desk.newWish();
      else this.newReview();
    }
  }

  private useTexture(url: string, cls: string): void {
    const img = new Image();
    img.onload = () => document.body.classList.add(cls);
    img.src = url;
  }
}
