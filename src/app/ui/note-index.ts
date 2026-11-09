import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NoteFolders } from '../core/note-folders';
import { FolderTree, folderNameOf } from '../core/folders';
import { ICON, IconModule } from './icons';
import { CategoryLabel } from './category-label';
import { CategoryLook, CategoryLooks, categoryColorHex, lookKey } from '../core/category-looks';
import { Review, isDone, isPinnedNote } from '../core/review';
import { checkCount } from '../core/rich-text';
import { notebookDate } from '../core/notebook';
import { pinningFor } from '../core/wall-physics';

interface Row {
  id: string;
  title: string;
  /** A orelhinha da linha: o grupo (em Tudo, Fixadas, Compartilhadas) ou o assunto (num grupo). */
  ear: { label: string; look: CategoryLook; color: string | null; subject: boolean } | null;
  /** A cor da cartolina da anotação, na tirinha do começo da linha: a mesma ficha, de longe. */
  stock: string;
  date: string;
  tasks: { done: number; total: number } | null;
  pinned: boolean;
  done: boolean;
  /** Só no Kanban (à mostra no mural pelo "Mostrar" da pasta). */
  board: boolean;
  /** Fora do mural só por causa dos Estudos. */
  study: boolean;
}

/**
 * A lista do mural de anotações (o tipo de ficha "Lista"): o índice do caderno, para achar uma
 * anotação entre muitas. Cada seção é uma folha pautada, e as linhas correm em colunas, como o índice
 * de um caderno grosso (três numa tela cheia, uma no celular), com a margem vermelha dupla entre as
 * colunas: muito mais anotações por tela que as fichas. Cada linha só com o que ajuda a achar: a
 * tirinha da cor da cartolina, o título, a orelhinha (o grupo, ou o assunto numa aba de grupo), as
 * tarefas e a data; as tags ficam nas fichas (numa coluna estreita, elas só cortariam o título). Tocar
 * na linha abre a leitura, como a ficha; as setas andam entre as linhas (ver WallBoard).
 */
@Component({
  selector: 'app-note-index',
  imports: [CategoryLabel, IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="folha">
      @for (r of rows(); track r.id) {
        <li class="linha" [attr.data-ficha]="r.id" [class.feita]="r.done" [style.--cor]="r.stock">
          <button type="button" class="hit" (click)="opened.emit(r.id)">
            <span class="cor" aria-hidden="true"></span>
            <span class="nome-linha">
              <span class="titulo">{{ r.title }}</span>
              @if (r.pinned) {
                <lucide-icon class="marca" [img]="PinIcon" [size]="14" aria-hidden="true" />
                <span class="sr-only">, fixada</span>
              }
              @if (r.done) {
                <lucide-icon class="marca" [img]="CheckIcon" [size]="15" aria-hidden="true" />
                <span class="sr-only">, finalizada</span>
              }
              @if (r.board) {
                <lucide-icon class="marca" [img]="r.study ? StudyIcon : BoardIcon" [size]="14" aria-hidden="true" />
                <span class="sr-only">{{ r.study ? ', só nos Flashcards' : ', só no Kanban' }}</span>
              }
            </span>
            <!-- a orelha da ficha, deitada na linha (a mesma: o papel claro com a borda da cor do grupo
                 por dentro, ou o manilha sem cor), numa trilha à direita: as orelhas da coluna se
                 alinham, para correr o olho por elas -->
            @if (r.ear; as e) {
              <span class="orelha" [class.orelha-cor]="!!e.color" [class.do-assunto]="e.subject" [style.--cat-cor]="e.color">
                <span class="sr-only">, {{ e.subject ? 'pasta' : 'grupo' }} </span>
                <app-cat-label [label]="e.label" [look]="e.look" [glyph]="e.subject ? SubjectIcon : null" [iconSize]="12" />
              </span>
            } @else {
              <span aria-hidden="true"></span>
            }
            <span class="meta">
              <span class="tarefas" [class.todas]="r.tasks && r.tasks.done === r.tasks.total">
                @if (r.tasks; as k) {
                  {{ k.done }}/{{ k.total }}<span class="sr-only"> tarefas feitas</span>
                }
              </span>
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

    /* a folha pautada do índice: as linhas azuis a cada --pauta, a margem vermelha dupla na beirada e
       entre as colunas (a de cada coluna é a beirada da que vem antes) */
    .folha {
      --pauta: 34px;
      --vao: 44px;
      --margem-cor: rgb(229 83 83 / 0.55);
      position: relative;
      margin: 0;
      padding: 8px 18px 10px 26px;
      columns: 21rem auto;
      column-gap: var(--vao);
      column-rule: 4px double var(--margem-cor);
      list-style: none;
      border-radius: 2px;
      background-color: var(--paper);
      background-image:
        linear-gradient(to right, transparent 9px, var(--margem-cor) 9px, var(--margem-cor) 10px, transparent 10px, transparent 12px, var(--margem-cor) 12px, var(--margem-cor) 13px, transparent 13px),
        var(--paper-grain);
      background-blend-mode: normal, multiply;
      box-shadow: var(--shadow-card);
      color: var(--ink);
    }

    .linha {
      break-inside: avoid;
      border-bottom: 1px solid rgb(90 140 200 / 0.38);
      container-type: inline-size;
    }

    /* a tirinha, o nome (o título e as marcas), a orelha e a conta: a orelha e a conta têm trilhas
       à direita, de largura que não varia com a linha, então as da coluna ficam umas embaixo das outras */
    .hit {
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: var(--pauta);
      padding: 4px 4px 2px 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;

      &:hover {
        background: rgb(255 218 66 / 0.24);
      }
      &:focus-visible {
        outline: 3px solid var(--focus);
        outline-offset: -3px;
      }
    }

    /* a tirinha da cor da cartolina, como um marcador de página */
    .cor {
      flex: none;
      width: 14px;
      height: 10px;
      border-radius: 0 2px 2px 0;
      background: var(--cor);
      box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.18);
    }

    .nome-linha {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .titulo {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.06rem;
      line-height: 1.2;
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

    /* a orelha da ficha, em miniatura: o manilha, ou, com a cor do grupo, o papel claro com a borda da
       cor correndo por dentro (o .orelha-cor do styles.scss, mais fina aqui) e o desenho na cor */
    .orelha {
      position: relative;
      isolation: isolate;
      display: inline-flex;
      max-width: 18ch;
      padding: 3px 8px 1px 7px;
      border-radius: 5px 5px 0 0;
      background-color: var(--manilha);
      font-family: var(--f-marker);
      font-size: 0.74rem;
      line-height: 1.3;
      color: #151515;
    }
    .orelha.orelha-cor {
      background-color: var(--papel-orelha);
    }
    .orelha.orelha-cor::before {
      inset: 2px 2px 0;
      border-width: 2px;
      border-radius: 4px 4px 0 0;
    }
    /* coluna estreita (o celular pequeno): o grupo fica só com o desenho; o assunto, que não tem
       desenho próprio, continua escrito */
    @container (max-width: 300px) {
      .orelha:not(.do-assunto) ::ng-deep .nome {
        display: none;
      }
      .orelha.do-assunto {
        max-width: 11ch;
      }
    }

    .meta {
      display: grid;
      grid-template-columns: 3.4ch 5ch;
      align-items: baseline;
      gap: 8px;
      padding-left: 2px;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.88rem;
      letter-spacing: 0.04em;
      font-variant-numeric: tabular-nums;
    }

    .tarefas {
      text-align: right;
      opacity: 0.7;
      &.todas {
        color: #1f7a3c;
        opacity: 1;
      }
    }

    .data {
      text-align: right;
      opacity: 0.75;
    }

    /* arrastando para organizar as pastas (ver pages/wall-drag.ts): a pega fica apagada, e a linha alvo
       (soltar ali cria a pasta com as duas) ganha o tracejado de marca-texto */
    .linha[data-arrastada] {
      opacity: 0.35;
    }
    .linha[data-alvo] .hit {
      outline: 3px dashed var(--hi);
      outline-offset: -3px;
    }

    /* marcada para copiar (Ctrl+clique, ver pages/wall-select.ts): o tracejado a caneta em volta da
       linha e, no fim dela, o adesivo com a ordem em que ela entra na cópia, como nas fichas */
    .linha[data-marcada] {
      counter-reset: marca var(--marca-n);
      .hit {
        /* o adesivo é mais uma trilha da linha, no fim (senão desceria para uma segunda fileira) */
        grid-template-columns: 14px minmax(0, 1fr) auto auto auto;
        outline: 2px dashed var(--ink);
        outline-offset: -4px;
        &::after {
          content: counter(marca);
          flex: none;
          display: grid;
          place-items: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--ink);
          color: var(--hi);
          font-family: var(--f-marker);
          font-size: 0.9rem;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          rotate: -8deg;
          animation: marca-cola 280ms var(--ease-physical);
        }
      }
    }
    @keyframes marca-cola {
      from {
        scale: 0.6;
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .linha[data-marcada] .hit::after {
        animation: none;
      }
    }

    /* com cores forçadas, a margem continua riscando a folha, a tirinha guarda a cor da cartolina e a
       orelha ganha contorno */
    @media (forced-colors: active) {
      .folha {
        column-rule-color: CanvasText;
      }
      .cor {
        forced-color-adjust: none;
        border: 1px solid CanvasText;
      }
      .orelha {
        border: 1px solid CanvasText;
        border-bottom: 0;
      }
      .hit:hover {
        outline: 1px solid Highlight;
        outline-offset: -2px;
      }
    }

    /* no celular, uma coluna só, as linhas mais altas para o dedo, e a orelha mais curta */
    @media (max-width: 720px) {
      .folha {
        --pauta: 42px;
        padding: 6px 10px 8px 20px;
      }
      .hit {
        gap: 6px;
      }
      .orelha,
      .orelha.do-assunto {
        max-width: 9ch;
      }
    }
  `,
})
export class NoteIndex {
  readonly reviews = input.required<readonly Review[]>();
  /**
   * O que a orelhinha de cada linha diz: o grupo (em Tudo, nas Fixadas e nas Compartilhadas) ou o
   * assunto (numa aba de grupo, onde o grupo seria o mesmo em todas; sem assunto, sem orelha).
   */
  readonly ear = input<'grupo' | 'assunto'>('grupo');
  /** O desenho e a cor dos grupos do dono do mural. */
  readonly looks = input<CategoryLooks>({});
  /** As pastas do dono do mural (o nome na orelha do assunto); null, as suas. */
  readonly folders = input<FolderTree | null>(null);
  private readonly ownFolders = inject(NoteFolders);
  /** As que estão só no Kanban, à mostra no mural: a linha leva o desenho do quadro. */
  readonly boardOnly = input<ReadonlySet<string>>(new Set());
  /** Das de cima, as fora do mural só por causa dos Estudos. */
  readonly studyOnly = input<ReadonlySet<string>>(new Set());
  readonly opened = output<string>();

  protected readonly PinIcon = ICON.fixar;
  protected readonly BoardIcon = ICON.colunas;
  protected readonly StudyIcon = ICON.camadas;
  protected readonly CheckIcon = ICON.pronto;
  protected readonly SubjectIcon = ICON.pastaDeNotas;

  protected readonly rows = computed<Row[]>(() => {
    const tree = this.folders() ?? this.ownFolders.tree();
    return this.reviews().map((r) => {
      const tasks = checkCount(r.text);
      const look = r.category ? (this.looks()[lookKey(r.category)] ?? {}) : {};
      const label = this.ear() === 'assunto' ? folderNameOf(tree, r) : r.category;
      return {
        id: r.id,
        title: r.game.name,
        ear: label ? { label, look, color: categoryColorHex(look.color), subject: this.ear() === 'assunto' } : null,
        stock: `var(--stock-${pinningFor(r.id, r.stock).stock})`,
        date: shortDay(r.completedAt),
        tasks: tasks.total ? tasks : null,
        pinned: isPinnedNote(r),
        done: isDone(r),
        board: this.boardOnly().has(r.id),
        study: this.studyOnly().has(r.id),
      };
    });
  });
}

/** A data da linha, curta como no caderno: 07/10 (o ano só quando não é este), 10/26 só com o mês, 2025 só com o ano. */
export function shortDay(day: string | null): string {
  if (!day) return '';
  if (day.length === 10) return notebookDate(`${day}T12:00:00`);
  if (day.length === 7) return `${day.slice(5, 7)}/${day.slice(2, 4)}`;
  return day;
}
