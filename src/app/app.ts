import { ChangeDetectionStrategy, Component, afterNextRender, inject, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { Desk } from './core/desk';
import { ReviewStore } from './core/review-store';
import { ViewTransitions } from './core/view-transitions';
import { WallView } from './core/wall-view';
import { Pin } from './ui/pin';
import { ReviewEditor, SavedEvent } from './ui/review-editor';
import { ReviewReader } from './ui/review-reader';
import { Toast, Toasts } from './ui/toast';

interface Tab {
  path: string;
  label: string;
  stock: string;
  exact: boolean;
}

const TABS: Tab[] = [
  { path: '/', label: 'Mural', stock: 'laranja', exact: true },
  { path: '/fila', label: 'Pra depois', stock: 'verde', exact: false },
  { path: '/ranking', label: 'Ranking', stock: 'azul', exact: false },
  { path: '/ajustes', label: 'Ajustes', stock: 'lilas', exact: false },
];

@Component({
  selector: 'app-root',
  imports: [LucideAngularModule, Pin, ReviewEditor, ReviewReader, RouterLink, RouterLinkActive, RouterOutlet, Toast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(document:keydown)': 'onGlobalKey($event)' },
})
export class App {
  protected readonly store = inject(ReviewStore);
  private readonly view = inject(WallView);
  private readonly desk = inject(Desk);
  private readonly vt = inject(ViewTransitions);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);

  protected readonly PlusIcon = Plus;
  protected readonly tabs = TABS;

  private readonly editor = viewChild.required(ReviewEditor);
  private readonly reader = viewChild.required(ReviewReader);

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
    });
    // Texturas fotográficas são opcionais: só entram se o arquivo existir.
    afterNextRender(() => {
      this.useTexture('/textures/parede-eucatex.png', 'has-wall-texture');
      this.useTexture('/textures/cartolina-fibra.png', 'has-paper-texture');
      this.useTexture('/textures/tachinhas.png', 'has-pins');
      this.useTexture('/textures/holografico.png', 'has-holo');
      this.useTexture('/textures/fita-crepe.png', 'has-tape');
    });
  }

  protected tabCount(path: string): number | null {
    if (path === '/') return this.store.count() || null;
    if (path === '/fila') return this.store.draftCount() || null;
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
    // Ficha nova vai para o mural: se ela ficaria escondida pelo filtro, limpa o filtro.
    if (e.isNew && !this.view.visible().some((r) => r.id === e.id)) this.view.clearFilters();
    if (e.isNew && this.router.url !== '/') this.goLand('/', e.id);
    else this.desk.land(e.id);
    this.toasts.show(e.isNew ? `“${name}” pregado no mural` : 'Resenha atualizada');
  }

  private goLand(path: string, id: string): void {
    void this.router.navigateByUrl(path).then(() => this.desk.land(id));
  }

  protected onGlobalKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    if (e.key === '/') {
      const search = document.getElementById('busca-mural');
      if (!search) return;
      e.preventDefault();
      (search as HTMLInputElement).focus();
      (search as HTMLInputElement).select();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      this.newReview();
    }
  }

  private useTexture(url: string, cls: string): void {
    const img = new Image();
    img.onload = () => document.body.classList.add(cls);
    img.src = url;
  }
}
