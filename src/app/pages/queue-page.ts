import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { ChevronDown, LucideAngularModule, NotebookPen } from 'lucide-angular';
import { collage } from '../core/clipping';
import { Desk } from '../core/desk';
import { g } from '../core/kinds';
import { Mural } from '../core/mural';
import { pageHeight } from '../core/notebook';
import { fold } from '../core/review';
import { ViewTransitions } from '../core/view-transitions';
import { DraftCard } from '../ui/draft-card';
import { SearchHighlight } from '../ui/search-highlight';
import { SearchStrip } from '../ui/search-strip';
import { nameCollator } from '../core/text';

type Order = 'recentes' | 'antigos' | 'az';
const ORDERS: readonly { value: Order; label: string }[] = [
  { value: 'recentes', label: 'Mais novos' },
  { value: 'antigos', label: 'Mais antigos' },
  { value: 'az', label: 'A–Z' },
];

/**
 * Pra depois: o que foi guardado só com nome e capa, no mural aberto, esperando a opinião. Cada um é
 * uma folha arrancada e presa na parede, com o dia em que foi guardado no cabeçalho; as folhas
 * amarelam com o tempo, então quem espera há mais tempo aparece sozinho. Aqui cada folha tem lugar e
 * o mural fica só com o que já foi resenhado.
 */
@Component({
  selector: 'app-queue-page',
  imports: [DraftCard, LucideAngularModule, SearchHighlight, SearchStrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- o nome e a contagem estão no índice embaixo do topo (ui/area-bar.ts) -->
    <h1 class="sr-only">Pra depois</h1>

    @if (mural.draftCount()) {
      <!-- a pasta, como no mural: a busca, a ordem em tinta e, depois do picote, o que a busca achou -->
      <div class="pasta solta">
        <div class="pasta-linha">
          <app-search-strip
            class="pasta-busca"
            inputId="busca-fila"
            [glued]="true"
            label="Procurar na fila"
            placeholder="Procurar na fila…"
            [value]="query()"
            (valueChange)="query.set($event)"
          />

          <div class="pasta-controles">
            <div class="pasta-grupo" role="group" aria-label="Ordenar">
              <label class="tinta campo">
                <span class="campo-pre">Ordenar</span>
                <span class="campo-val" aria-hidden="true">{{ orderLabel() }}</span>
                <lucide-icon class="campo-chev" [img]="ChevronIcon" [size]="15" [strokeWidth]="2.8" aria-hidden="true" />
                <select aria-label="Ordenar por" (change)="sort($any($event.target).value)">
                  @for (o of orders; track o.value) {
                    <option [value]="o.value" [selected]="o.value === order()">{{ o.label }}</option>
                  }
                </select>
              </label>
            </div>
          </div>
        </div>

        <div class="pasta-linha pasta-baixo">
          @if (query().trim()) {
            <div class="pasta-estado">
              <p class="achados" aria-live="polite">
                <span>Mostrando {{ visible().length }} de {{ mural.draftCount() }}</span>
                <button type="button" class="tinta-link" (click)="query.set('')">Limpar</button>
              </p>
            </div>
          }
        </div>
      </div>

      @if (!visible().length) {
        <p class="none">{{ g(mural.profile(), 'Nenhum', 'Nenhuma') }} {{ mural.profile().singular }} da fila tem “{{ query().trim() }}” no nome.</p>
      }

      <h2 class="sr-only">Folhas</h2>
      <div class="sheets" [style.--colunas]="cols()" [appRealceBusca]="query()" realceEm="app-draft-card .title">
        @for (col of columns(); track $index) {
          <div class="coluna">
            @for (d of col; track d.id) {
              <app-draft-card [attr.data-ficha]="d.id" [draft]="d" [landing]="desk.landingId() === d.id" (opened)="desk.openDraft($event)" />
            }
          </div>
        }
      </div>
    } @else {
      <section class="empty" aria-labelledby="fila-vazia">
        <span class="tape" aria-hidden="true"></span>
        <h2 id="fila-vazia">{{ g(mural.profile(), 'Nenhum', 'Nenhuma') }} {{ mural.profile().singular }} na fila</h2>
        <p>
          {{ mural.profile().finished }} Guarde aqui só o nome e a capa, e escreva a resenha quando der. Na hora de pregar,
          <strong>Salvar pra depois</strong> também manda para cá.
        </p>
        <button type="button" class="btn-ink" (click)="desk.newDraft()" aria-keyshortcuts="n">
          <lucide-icon [img]="NoteIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
          Guardar {{ g(mural.profile(), 'um', 'uma') }} {{ mural.profile().singular }}
        </button>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .pasta {
      margin-bottom: 44px;
    }
    .none {
      font-family: var(--f-hand);
      font-size: 1.2rem;
      color: var(--wall-ink);
      overflow-wrap: anywhere;
    }

    /* ===== As folhas, em colagem: cada uma da sua largura, um tanto fora do prumo ===== */
    .sheets {
      display: grid;
      grid-template-columns: repeat(var(--colunas), minmax(0, 1fr));
      align-items: start;
      column-gap: 32px;
      padding-top: 14px;
    }
    app-draft-card {
      width: calc(var(--largura, 100) * 1%);
      margin-left: calc(var(--desvio, 0) * 1%);
      margin-bottom: var(--vao, 44px);
    }

    /* folha de caderno solta na parede, explicando a fila */
    .empty {
      position: relative;
      max-width: 520px;
      padding: 34px 30px 28px 44px;
      rotate: -1deg;
      color: #2e3036;
      background:
        linear-gradient(90deg, transparent 26px, rgb(230 46 45 / 0.5) 26px 27.5px, transparent 0),
        repeating-linear-gradient(to bottom, transparent 0 26px, rgb(70 120 200 / 0.28) 26px 27.5px, transparent 27.5px 28px),
        #fbfaf3;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 10px 12px rgb(0 0 0 / 0.45));
    }
    .empty .tape {
      position: absolute;
      top: -9px;
      left: calc(50% - 30px);
      width: 60px;
      height: 20px;
      rotate: 4deg;
      background: rgb(222 205 160 / 0.86);
    }
    :host-context(body.has-tape) .empty .tape {
      background: url('textures/fita-crepe.png') center / 100% 100% no-repeat;
    }
    .empty h2 {
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.6rem;
      line-height: 1.1;
      color: var(--ink);
    }
    .empty p {
      margin: 10px 0 20px;
      max-width: 44ch;
      font-family: var(--f-hand);
      font-size: 1.15rem;
      line-height: 28px;
    }
    .empty strong {
      font-weight: 700;
      color: var(--ink);
    }

    @media (max-width: 559px) {
      .sheets {
        column-gap: 18px;
      }
      .empty {
        padding: 30px 20px 24px 40px;
      }
    }
  `,
})
export class QueuePage {
  protected readonly mural = inject(Mural);
  protected readonly desk = inject(Desk);
  private readonly transitions = inject(ViewTransitions);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly g = g;
  protected readonly NoteIcon = NotebookPen;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly orders = ORDERS;

  /** Busca pelo nome, sem ligar para acento nem maiúscula; some ao sair da página. */
  protected readonly query = signal('');
  protected readonly order = signal<Order>('recentes');
  protected readonly orderLabel = computed(() => ORDERS.find((o) => o.value === this.order())!.label);
  protected readonly visible = computed(() => {
    const needle = fold(this.query().trim());
    const list = this.mural.drafts();
    const found = needle ? list.filter((d) => fold(d.game.name).includes(needle)) : list;
    switch (this.order()) {
      case 'recentes':
        return [...found].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      case 'antigos':
        return [...found].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      case 'az':
        return [...found].sort((a, b) => nameCollator.compare(a.game.name, b.game.name));
    }
  });

  /** Quantas colunas cabem: folhas de pelo menos 168px, com 32px entre elas (duas no celular). */
  protected readonly cols = signal(6);
  protected readonly columns = computed(() => collage(this.visible(), this.cols(), pageHeight));

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const measure = () => this.cols.set(innerWidth < 560 ? 2 : Math.max(3, Math.floor((host.clientWidth + 32) / (168 + 32))));
    // "Ver na lista" ou um item novo chegando: se a busca esconde ele, a busca sai da frente
    effect(() => {
      const id = this.desk.landingId();
      if (id && this.query() && !this.visible().some((x) => x.id === id)) this.query.set('');
    });
    afterNextRender(() => {
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(host);
      this.destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  protected sort(o: Order): void {
    if (o === this.order()) return;
    this.transitions.run(() => this.order.set(o));
  }
}
