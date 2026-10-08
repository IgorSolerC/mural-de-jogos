import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Check, LucideAngularModule, Pin } from 'lucide-angular';
import { Review, isDone, isPinnedNote } from '../core/review';
import { checkCount } from '../core/rich-text';
import { notebookDate } from '../core/notebook';
import { pinningFor } from '../core/wall-physics';
import { categoryColor } from '../core/note-tabs';

interface Row {
  id: string;
  title: string;
  /** A categoria (só em Tudo: numa aba, ela já está dita). */
  category: string | null;
  /** A cor da etiquetinha da categoria (a mesma da aba do mural e da orelha da ficha). */
  color: string | null;
  /** A cor da cartolina da anotação, numa tirinha na margem: a mesma ficha, de longe. */
  stock: string;
  date: string;
  tags: readonly string[];
  tasks: { done: number; total: number } | null;
  pinned: boolean;
  done: boolean;
  sub: boolean;
}

/**
 * A lista do mural de anotações (o tipo de ficha "Lista"): o índice do caderno. Cada seção vira uma
 * folha pautada com a margem vermelha, e cada anotação, uma linha: a tirinha da cor da cartolina, o
 * título, as tags, as tarefas e a data. Tocar na linha abre a leitura, como a ficha. Feita para os
 * registros em sequência (as dailys): dezenas de anotações cabem numa tela.
 */
@Component({
  selector: 'app-note-index',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="folha">
      @for (r of rows(); track r.id) {
        <li class="linha" [attr.data-ficha]="r.id" [class.feita]="r.done" [class.sub]="r.sub" [style.--cor]="r.stock">
          <button type="button" class="hit" (click)="opened.emit(r.id)">
            <span class="cor" aria-hidden="true"></span>
            <span class="titulo">{{ r.title }}</span>
            @if (r.pinned) {
              <lucide-icon class="marca" [img]="PinIcon" [size]="15" [strokeWidth]="2.6" aria-hidden="true" />
              <span class="sr-only">, fixada</span>
            }
            @if (r.done) {
              <lucide-icon class="marca" [img]="CheckIcon" [size]="16" [strokeWidth]="3" aria-hidden="true" />
              <span class="sr-only">, finalizada</span>
            }
            @if (r.category) {
              <span class="cat" [style.--etiqueta]="r.color">{{ r.category }}</span>
            }
            @if (r.tags.length) {
              <span class="tags">
                @for (t of r.tags; track t) {
                  <span class="tag">#{{ t }}</span>
                }
              </span>
            }
            <span class="meta">
              @if (r.tasks; as k) {
                <span class="tarefas" [class.todas]="k.done === k.total">
                  {{ k.done }}/{{ k.total }}<span class="sr-only"> tarefas feitas</span>
                </span>
              }
              <span class="data">{{ r.date }}</span>
            </span>
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }

    /* a folha pautada: linhas azuis a cada 44px e a margem vermelha dupla */
    .folha {
      --pauta: 44px;
      --margem: 46px;
      position: relative;
      margin: 0;
      padding: 10px 0 12px;
      list-style: none;
      border-radius: 2px;
      background-color: var(--paper);
      background-image:
        linear-gradient(to right, transparent calc(var(--margem) - 4px), rgb(229 83 83 / 0.55) calc(var(--margem) - 4px), rgb(229 83 83 / 0.55) calc(var(--margem) - 3px), transparent calc(var(--margem) - 3px), transparent var(--margem), rgb(229 83 83 / 0.55) var(--margem), rgb(229 83 83 / 0.55) calc(var(--margem) + 1px), transparent calc(var(--margem) + 1px)),
        var(--paper-grain);
      background-blend-mode: normal, multiply;
      box-shadow: var(--shadow-card);
      color: var(--ink);
    }

    .linha {
      border-bottom: 1px solid rgb(90 140 200 / 0.38);
    }

    .hit {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: var(--pauta);
      padding: 6px 16px 4px 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;

      &:hover {
        background: rgb(255 218 66 / 0.22);
      }
      &:focus-visible {
        outline: 3px solid var(--focus);
        outline-offset: -3px;
      }
    }

    /* a tirinha da cor da cartolina, como um marcador de página saindo da margem */
    .cor {
      flex: none;
      width: 22px;
      height: 14px;
      margin-right: calc(var(--margem) - 22px - 4px);
      border-radius: 0 2px 2px 0;
      background: var(--cor);
      box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.18);
    }

    .titulo {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.15rem;
      line-height: 1.2;
    }

    .sub .titulo {
      padding-left: 18px;
      font-weight: 400;
    }

    .feita .titulo {
      text-decoration: line-through 2px rgb(21 21 21 / 0.55);
      opacity: 0.7;
    }

    .marca {
      flex: none;
      display: inline-flex;
      opacity: 0.7;
    }

    /* a categoria: a etiquetinha colorida da orelha da ficha, deitada na linha */
    .cat {
      flex: none;
      max-width: 14ch;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      padding: 2px 8px 1px;
      border-radius: 3px;
      background:
        linear-gradient(to bottom, rgb(255 255 255 / 0.45), rgb(255 255 255 / 0) 55%),
        var(--etiqueta);
      box-shadow: inset 0 0 0 1px rgb(21 21 21 / 0.16);
      font-family: var(--f-marker);
      font-size: 0.78rem;
      line-height: 1.3;
    }

    .tags {
      display: flex;
      gap: 8px;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
    }

    .tag {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.86rem;
      letter-spacing: 0.03em;
      color: #6b5a33;
    }

    .meta {
      flex: none;
      display: flex;
      align-items: baseline;
      gap: 14px;
      margin-left: auto;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.92rem;
      letter-spacing: 0.04em;
      font-variant-numeric: tabular-nums;
    }

    .tarefas {
      opacity: 0.7;
      &.todas {
        color: #1f7a3c;
        opacity: 1;
      }
    }

    .data {
      min-width: 6ch;
      text-align: right;
      opacity: 0.75;
    }

    @media (max-width: 720px) {
      .folha {
        --margem: 30px;
      }
      .cor {
        width: 14px;
        margin-right: calc(var(--margem) - 14px - 2px);
      }
      .tags,
      .cat {
        display: none;
      }
      .hit {
        padding-right: 10px;
      }
    }
  `,
})
export class NoteIndex {
  readonly reviews = input.required<readonly Review[]>();
  /** Mostrar a categoria de cada linha (em Tudo; numa aba de categoria, seria a mesma em todas). */
  readonly showCategory = input(false);
  readonly opened = output<string>();

  protected readonly PinIcon = Pin;
  protected readonly CheckIcon = Check;

  protected readonly rows = computed<Row[]>(() =>
    this.reviews().map((r) => {
      const tasks = checkCount(r.text);
      return {
        id: r.id,
        title: r.game.name,
        category: this.showCategory() ? (r.category ?? null) : null,
        color: r.category ? categoryColor(r.category) : null,
        stock: `var(--stock-${pinningFor(r.id, r.stock).stock})`,
        date: shortDay(r.completedAt),
        tags: r.tags ?? [],
        tasks: tasks.total ? tasks : null,
        pinned: isPinnedNote(r),
        done: isDone(r),
        sub: r.noteRank === 'sub',
      };
    }),
  );
}

/** A data da linha, curta como no caderno: 07/10 (o ano só quando não é este), 10/26 só com o mês, 2025 só com o ano. */
function shortDay(day: string | null): string {
  if (!day) return '';
  if (day.length === 10) return notebookDate(`${day}T12:00:00`);
  if (day.length === 7) return `${day.slice(5, 7)}/${day.slice(2, 4)}`;
  return day;
}
