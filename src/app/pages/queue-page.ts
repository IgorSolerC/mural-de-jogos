import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { LucideAngularModule, NotebookPen } from 'lucide-angular';
import { collage } from '../core/clipping';
import { Desk } from '../core/desk';
import { countOf, g } from '../core/kinds';
import { Mural } from '../core/mural';
import { ageOf, daysWaiting, pageHeight } from '../core/notebook';
import { fold } from '../core/review';
import { ViewTransitions } from '../core/view-transitions';
import { DraftCard } from '../ui/draft-card';
import { SearchStrip } from '../ui/search-strip';

type Order = 'recentes' | 'antigos' | 'az';

/**
 * Pra depois: o que foi guardado só com nome e capa, no mural aberto, esperando a opinião. Cada um é
 * uma folha arrancada e presa na parede, com o dia em que foi guardado no cabeçalho; as folhas
 * amarelam com o tempo, então quem espera há mais tempo aparece sozinho. Aqui cada folha tem lugar e
 * o mural fica só com o que já foi resenhado.
 */
@Component({
  selector: 'app-queue-page',
  imports: [DraftCard, LucideAngularModule, SearchStrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <div class="titulo-linha">
        <!-- a etiqueta da capa do caderno, preenchida à mão -->
        <h1 class="etiqueta">
          <span class="etiqueta-campo">
            <span class="etiqueta-rotulo" aria-hidden="true">Matéria</span>
            <span class="etiqueta-escrito">Pra resenhar depois</span>
          </span>
        </h1>
        @if (mural.draftCount(); as n) {
          <p class="sub">{{ countOf(mural.profile(), n) }} esperando a sua opinião</p>
        }
      </div>
    </header>

    @if (mural.draftCount()) {
      <div class="prateleira">
        <app-search-strip
          class="prateleira-busca"
          inputId="busca-fila"
          label="Procurar na fila"
          placeholder="Procurar na fila…"
          [value]="query()"
          (valueChange)="query.set($event)"
        />
        <p class="prateleira-giz">
          Toque numa folha para terminar a resenha.
          @if (anyAged()) {
            As mais amarelas estão esperando há mais tempo.
          }
        </p>
        <span class="prateleira-quebra" aria-hidden="true"></span>

        <div class="prateleira-abas" role="group" aria-label="Ordenar">
          <button type="button" class="plate" [attr.aria-pressed]="order() === 'recentes'" (click)="sort('recentes')">Mais novos</button>
          <button type="button" class="plate" [attr.aria-pressed]="order() === 'antigos'" (click)="sort('antigos')">Mais antigos</button>
          <button type="button" class="plate" [attr.aria-pressed]="order() === 'az'" (click)="sort('az')" aria-label="De A a Z">A–Z</button>
        </div>
      </div>

      @if (query().trim()) {
        <p class="showing" aria-live="polite">
          Mostrando {{ visible().length }} de {{ mural.draftCount() }}
          <button type="button" class="showing-clear" (click)="query.set('')">Limpar busca</button>
        </p>
      }

      @if (!visible().length) {
        <p class="none">{{ g(mural.profile(), 'Nenhum', 'Nenhuma') }} {{ mural.profile().singular }} da fila tem “{{ query().trim() }}” no nome.</p>
      }

      <h2 class="sr-only">Folhas</h2>
      <div class="sheets" [style.--colunas]="cols()">
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
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 18px 24px;
      margin-bottom: 30px;
    }
    .titulo-linha {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 26px;
    }

    .sub {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--wall-ink-2);
      font-variant-numeric: tabular-nums;
    }

    /* ===== A etiqueta escolar: moldura impressa em azul, o campo pautado, o nome a pincel ===== */
    .etiqueta {
      position: relative;
      margin: 0;
      padding: 9px 12px 10px;
      rotate: -1.6deg;
      background: #fdfcf7;
      border-radius: 6px;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 6px 8px rgb(0 0 0 / 0.4));
    }
    /* a moldura impressa: fio duplo, com os cantinhos recortados para dentro */
    .etiqueta::before {
      content: '';
      position: absolute;
      inset: 4px;
      border: 2px solid #3a67b8;
      border-radius: 4px;
      box-shadow: inset 0 0 0 2px #fdfcf7, inset 0 0 0 3px rgb(58 103 184 / 0.55);
      pointer-events: none;
    }
    .etiqueta-campo {
      position: relative;
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 6px 14px 4px;
    }
    .etiqueta-rotulo {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #3a67b8;
    }
    /* escrito na linha pontilhada do campo */
    .etiqueta-escrito {
      padding: 0 4px 2px;
      background: radial-gradient(circle, rgb(58 103 184 / 0.6) 0.9px, transparent 1.2px) 0 100% / 5px 3px repeat-x;
      color: var(--ink);
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.7rem;
      line-height: 1.1;
    }

    .showing {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;
      margin: -28px 0 22px;
      font-family: var(--f-label);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--wall-ink-2);
      font-variant-numeric: tabular-nums;
    }
    .showing-clear {
      min-height: 36px;
      padding: 4px 8px;
      border: 0;
      border-radius: 4px;
      background: none;
      color: var(--wall-ink);
      font: inherit;
      letter-spacing: inherit;
      text-decoration: underline 2px var(--hi);
      text-underline-offset: 4px;
    }
    .showing-clear:hover {
      background: rgb(255 255 255 / 0.08);
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
      .etiqueta-escrito {
        font-size: 1.35rem;
      }
      .etiqueta-campo {
        padding-inline: 10px;
      }
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
  protected readonly countOf = countOf;
  protected readonly g = g;
  protected readonly NoteIcon = NotebookPen;

  /** Busca pelo nome, sem ligar para acento nem maiúscula; some ao sair da página. */
  protected readonly query = signal('');
  protected readonly order = signal<Order>('recentes');
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
        return [...found].sort((a, b) => a.game.name.localeCompare(b.game.name, 'pt-BR', { sensitivity: 'base', numeric: true }));
    }
  });
  /** Alguma folha já amarelou: vale explicar o que o amarelo quer dizer. */
  protected readonly anyAged = computed(() => this.mural.drafts().some((d) => ageOf(daysWaiting(d.createdAt)) !== 'nova'));

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
