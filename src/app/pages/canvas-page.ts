import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { boardIdOfNote } from '../core/canvas-id';
import { CANVAS_DEFAULT_TITLE, CanvasLink } from '../core/canvas-link';
import { Desk } from '../core/desk';
import { FreeBoardStore } from '../core/free-board-store';
import { isCanvas } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { canvasPieces } from '../ui/canvas-card';
import { ICON, IconModule } from '../ui/icons';
import { BoardScreen } from './board-screen';

/**
 * O canvas aberto (PLANO-CANVAS.md, 3.2): `/anotacoes/canvas/:id`, o id da anotação. A tela cheia do quadro
 * (pages/board-screen.ts, a mesma da aba Quadro livre), ver primeiro e Editar depois; o nome no topo se escreve e
 * renomeia a anotação (o elo leva ao quadro), e os Detalhes abrem o editor da anotação (grupo, tags, capa, quem vê).
 * O canvas recém-criado (`?novo=1`) abre já no Editar com o nome selecionado; saindo sem mexer em nada (o nome padrão
 * e nenhuma peça), ele é apagado sem perguntar, como o bilhete vazio do quadro. Fechar volta para onde estava, com o
 * foco na ficha dele.
 */
@Component({
  selector: 'app-canvas-page',
  imports: [BoardScreen, IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="sr-only">Canvas{{ note() ? ": " + note()!.game.name : "" }}</h1>
    <app-board-screen
      [boardId]="boardId()"
      [name]="note()?.game?.name ?? null"
      kind="Canvas"
      [renamable]="!!note()"
      [selectName]="fresh"
      [startEditing]="fresh"
      missing="Este canvas não está aqui. Ele pode ter sido apagado."
      backText="Voltar para o mural"
      (closed)="close()"
      (renamed)="rename($event)"
    >
      @if (note(); as n) {
        <button type="button" class="etiqueta-topo detalhes" aria-haspopup="dialog" (click)="details(n.id)" title="O grupo, a pasta, as tags, a capa e quem vê">
          <lucide-icon [img]="Icons.detalhes" [size]="18" aria-hidden="true" />
          <span class="etiqueta-nome">Detalhes</span>
        </button>
      }
    </app-board-screen>
  `,
  styleUrl: './canvas-page.scss',
})
export class CanvasPage {
  private readonly store = inject(ReviewStore);
  private readonly boards = inject(FreeBoardStore);
  private readonly link = inject(CanvasLink);
  private readonly desk = inject(Desk);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly screen = viewChild(BoardScreen);
  protected readonly Icons = { detalhes: ICON.informacao };

  private readonly route = inject(ActivatedRoute);
  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
  /** O canvas recém-criado (o "Novo canvas aqui"): já no Editar, e some se sair sem mexer. */
  protected readonly fresh = this.route.snapshot.queryParamMap.get('novo') === '1';
  /** De onde veio (o mural, a busca): fechar volta para lá. */
  private readonly from: string | null = (history.state as { voltar?: unknown } | null)?.voltar && typeof history.state.voltar === 'string' ? history.state.voltar : null;
  private closing = false;

  protected readonly note = computed(() => {
    const n = this.store.get(this.id());
    return n && isCanvas(n) ? n : null;
  });
  protected readonly boardId = computed(() => this.note()?.canvas ?? boardIdOfNote(this.id()) ?? '');

  constructor() {
    // o "?novo=1" é só da chegada: recarregar a página não seleciona o nome de novo
    if (this.fresh) void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true, state: history.state });
    // saiu por outro caminho (o voltar do navegador, outro link do topo): o canvas novo em que nada foi feito também sai
    // (depois do que a tela ainda guardava: a peça posta logo antes de sair conta)
    inject(DestroyRef).onDestroy(() => {
      if (this.closing || !this.fresh) return;
      const id = this.id();
      void Promise.resolve(this.screen()?.settled()).then(() => {
        if (this.untouched()) void this.link.remove(id);
      });
    });
    // o título da aba: o nome do canvas
    effect((onCleanup) => {
      const n = this.note();
      if (!n) return;
      const t = setTimeout(() => this.title.setTitle(`${n.game.name} · Canvas · Murall`));
      onCleanup(() => clearTimeout(t));
    });
  }

  protected rename(name: string): void {
    void this.link.rename(this.id(), name);
  }

  protected details(id: string): void {
    this.desk.editReview(id);
  }

  /** Volta para onde estava; o canvas novo em que nada foi feito sai sem perguntar. */
  protected async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    const id = this.id();
    await this.screen()?.settled();
    if (this.fresh && this.untouched()) await this.link.remove(id);
    await this.router.navigateByUrl(this.from ?? '/anotacoes');
    focusCard(id);
  }

  /** O nome padrão e nenhuma peça: o canvas nasceu e ninguém mexeu nele. */
  private untouched(): boolean {
    const n = this.note();
    if (!n) return false;
    const board = this.boards.get(n.canvas!);
    return isDefaultTitle(n.game.name) && !canvasPieces(board) && !n.tags?.length && !n.game.coverUrl;
  }
}

/** O nome com que o canvas nasce ("Canvas sem nome", ou com um número), e não um nome que só começa igual. */
function isDefaultTitle(name: string): boolean {
  return name === CANVAS_DEFAULT_TITLE || (name.startsWith(CANVAS_DEFAULT_TITLE + ' ') && /^\(?\d+\)?$/.test(name.slice(CANVAS_DEFAULT_TITLE.length + 1)));
}

/** O foco volta para a ficha do canvas na parede, quando ela existir (a parede monta as fichas aos poucos). */
function focusCard(id: string): void {
  let tries = 0;
  let scrolled = false;
  const key = CSS.escape(id);
  const seek = () => {
    const hit = document.querySelector<HTMLElement>(`[data-ficha="${key}"] button.hit`);
    if (hit) {
      hit.scrollIntoView({ block: 'nearest' });
      hit.focus({ preventScroll: true });
      return;
    }
    // longe da tela, a ficha ainda é a vaga: a tela vai até ela, e o mural a monta
    const place = document.querySelector<HTMLElement>(`[data-lugar="${key}"]`);
    if (place && !scrolled) {
      scrolled = true;
      place.scrollIntoView({ block: 'center' });
    }
    if (++tries < 150) requestAnimationFrame(seek);
  };
  requestAnimationFrame(seek);
}
