import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { Bold, Eye, Italic, Link2, List, ListChecks, ListOrdered, LucideAngularModule, Maximize2, Minimize2, PenLine, Plus } from 'lucide-angular';
import { lineKind, toggleCheck } from '../core/rich-text';
import { NoteLinks, linkKey, resolveNote } from '../core/note-links';
import { Review, formatReviewDate } from '../core/review';
import { RichText } from './rich-text';

type ListKind = 'ul' | 'ol' | 'check';

/**
 * O campo do texto da ficha: a folha pautada de sempre, com uma régua de formatação em cima
 * (negrito, itálico, lista, lista numerada, tarefas) e "Maximizar", que abre a mesma folha na tela
 * inteira para os textos longos. O que a régua faz são as marcas de core/rich-text.ts, escritas no
 * próprio texto; atalhos: Ctrl+B, Ctrl+I, e Enter continua a lista (num item vazio, termina).
 *
 * As mudanças passam por `insertText`, então o Ctrl+Z do navegador desfaz cada uma.
 *
 * Com `notes` (o editor da anotação), a régua ganha "Link para outra anotação": escreve
 * "[[Título]]" no texto (ver core/note-links.ts). Escrever "[[" direto na folha abre a mesma lista,
 * filtrando pelo que vem depois; setas escolhem, Enter (ou Tab) põe, Esc fecha.
 */
@Component({
  selector: 'app-rich-editor',
  imports: [LucideAngularModule, NgTemplateOutlet, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #campo let-big="big">
      <div class="regua" role="toolbar" aria-label="Formatação do texto" [attr.aria-controls]="big ? areaId + '-grande' : areaId">
        <button type="button" class="ferramenta" [disabled]="seeing()" title="Negrito (Ctrl+B)" aria-label="Negrito" (pointerdown)="$event.preventDefault()" (click)="wrap(area, '**')">
          <lucide-icon [img]="BoldIcon" [size]="18" [strokeWidth]="2.8" aria-hidden="true" />
        </button>
        <button type="button" class="ferramenta" [disabled]="seeing()" title="Itálico (Ctrl+I)" aria-label="Itálico" (pointerdown)="$event.preventDefault()" (click)="wrap(area, '*')">
          <lucide-icon [img]="ItalicIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
        </button>
        <span class="fio" aria-hidden="true"></span>
        <button type="button" class="ferramenta" [disabled]="seeing()" title="Lista" aria-label="Lista" (pointerdown)="$event.preventDefault()" (click)="list(area, 'ul')">
          <lucide-icon [img]="ListIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
        </button>
        <button type="button" class="ferramenta" [disabled]="seeing()" title="Lista numerada" aria-label="Lista numerada" (pointerdown)="$event.preventDefault()" (click)="list(area, 'ol')">
          <lucide-icon [img]="OrderedIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
        </button>
        <button type="button" class="ferramenta" [disabled]="seeing()" title="Tarefas (checklist)" aria-label="Tarefas" (pointerdown)="$event.preventDefault()" (click)="list(area, 'check')">
          <lucide-icon [img]="ChecksIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
        </button>
        @if (notes()) {
          <span class="fio" aria-hidden="true"></span>
          <button
            type="button"
            class="ferramenta"
            [disabled]="seeing()"
            title="Link para outra anotação (ou escreva [[)"
            aria-label="Link para outra anotação"
            [attr.aria-expanded]="linking()?.big === big && !linking()?.auto"
            (pointerdown)="$event.preventDefault()"
            (click)="startLink(area, big)"
          >
            <lucide-icon [img]="LinkIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
          </button>
        }
        <!-- as marcas ficam no texto: "Ver como fica" mostra a folha formatada (e marca as tarefas) -->
        <button type="button" class="acao-caneta ver" [attr.aria-pressed]="seeing()" (click)="see(!seeing(), big)">
          <lucide-icon [img]="seeing() ? WriteIcon : SeeIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
          <span class="acao-txt">{{ seeing() ? 'Escrever' : 'Ver como fica' }}</span>
        </button>
        @if (big) {
          <button type="button" class="acao-caneta tamanho" (click)="shrink()">
            <lucide-icon [img]="ShrinkIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
            <span class="acao-txt">Diminuir</span>
          </button>
        } @else {
          <button type="button" class="acao-caneta tamanho" (click)="grow(area)" aria-haspopup="dialog" aria-label="Maximizar">
            <lucide-icon [img]="GrowIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
            <span class="acao-txt">Maximizar</span>
          </button>
        }
      </div>
      @if (seeing()) {
        <div class="previa" [class.grande]="big" tabindex="0" [attr.aria-label]="'Como fica: ' + label()">
          @if (value().trim()) {
            <app-rich-text [text]="value()" [checkable]="true" [links]="previewLinks()" (toggled)="value.set(toggle(value(), $event))" />
          } @else {
            <p class="vazio">Nada escrito ainda.</p>
          }
        </div>
      }
      <textarea
        [hidden]="seeing()"
        #area
        [id]="big ? areaId + '-grande' : areaId"
        [class.grande]="big"
        [placeholder]="placeholder()"
        [attr.aria-label]="big ? label() : null"
        [value]="value()"
        [attr.aria-autocomplete]="notes() ? 'list' : null"
        [attr.aria-expanded]="notes() ? linking()?.auto === true && linking()?.big === big : null"
        [attr.aria-controls]="notes() ? areaId + '-elos' : null"
        [attr.aria-activedescendant]="linking()?.auto && linking()?.big === big ? areaId + '-elo-' + active() : null"
        (input)="value.set(area.value); watchLink(area, big)"
        (click)="watchLink(area, big)"
        (keyup)="onKeyUp($event, area, big)"
        (keydown)="onKey($event, area)"
        (blur)="onAreaBlur()"
      ></textarea>
      <!-- a lista das anotações para o link: embaixo da folha, sem cobrir o que se escreve -->
      @if (linking(); as k) {
        @if (k.big === big) {
          <div class="elos" [class.grande]="big">
            @if (!k.auto) {
              <label class="elos-busca">
                <span class="sr-only">Procurar anotação</span>
                <input
                  type="search"
                  class="elos-campo"
                  placeholder="Procurar anotação pelo título"
                  autocomplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded="true"
                  [attr.aria-controls]="areaId + '-elos'"
                  [attr.aria-activedescendant]="areaId + '-elo-' + active()"
                  [value]="k.query"
                  (input)="setQuery($any($event.target).value)"
                  (keydown)="onListKey($event)"
                />
              </label>
            } @else {
              <p class="elos-dica" aria-hidden="true">Link para…</p>
            }
            <ul class="elos-lista" role="listbox" [id]="areaId + '-elos'" aria-label="Anotações">
              @for (n of linkOptions(); track n.id; let i = $index) {
                <li
                  role="option"
                  class="elo-op"
                  [id]="areaId + '-elo-' + i"
                  [class.ativa]="active() === i"
                  [attr.aria-selected]="active() === i"
                  (pointerdown)="$event.preventDefault()"
                  (click)="pick(n.game.name)"
                >
                  <span class="elo-nome">{{ n.game.name }}</span>
                  <span class="elo-meta">{{ metaOf(n) }}</span>
                </li>
              }
              @if (newLink(); as t) {
                <li
                  role="option"
                  class="elo-op nova"
                  [id]="areaId + '-elo-' + linkOptions().length"
                  [class.ativa]="active() === linkOptions().length"
                  [attr.aria-selected]="active() === linkOptions().length"
                  (pointerdown)="$event.preventDefault()"
                  (click)="pick(t)"
                >
                  <lucide-icon [img]="PlusIcon" [size]="16" [strokeWidth]="2.8" aria-hidden="true" />
                  <span class="elo-nome">Link para “{{ t }}”</span>
                  <span class="elo-meta">a anotação ainda não existe: toque no link depois para criar</span>
                </li>
              }
              @if (!linkOptions().length && !newLink()) {
                <li class="elos-vazio" role="presentation">{{ notes()!.length ? 'Nenhuma anotação com esse título.' : 'Você ainda não tem outras anotações. Escreva um título para criar o link.' }}</li>
              }
            </ul>
          </div>
        }
      }
    </ng-template>

    <ng-container *ngTemplateOutlet="campo; context: { big: false }" />

    <!-- A mesma folha na tela inteira: o mesmo texto, para ler e escrever os longos sem rolar num cantinho -->
    <dialog #grande class="tela-cheia" [attr.aria-labelledby]="areaId + '-titulo'" (close)="onClosed()">
      <div class="folha">
        <h2 class="titulo" [id]="areaId + '-titulo'">{{ label() }}</h2>
        @if (big()) {
          <ng-container *ngTemplateOutlet="campo; context: { big: true }" />
        }
      </div>
    </dialog>
  `,
  styles: `
    :host {
      display: block;
    }

    /* ===== A régua: os botões de formatação numa tira só, encostada no alto da folha ===== */
    .regua {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-bottom: 6px;
    }
    .ferramenta {
      display: grid;
      place-items: center;
      width: 38px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--ink);
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .ferramenta:hover {
      background: rgb(21 21 21 / 0.08);
    }
    .ferramenta:active {
      background: rgb(21 21 21 / 0.16);
    }
    .ferramenta:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -1px;
    }
    .fio {
      width: 2px;
      height: 20px;
      margin: 0 5px;
      border-radius: 1px;
      background: rgb(21 21 21 / 0.25);
    }
    .ferramenta:disabled {
      opacity: 0.35;
      cursor: default;
      background: transparent;
    }
    .ver {
      margin: 0 0 0 auto;
      font-size: 0.95rem;
    }
    .tamanho {
      margin: 0 -8px 0 12px;
      font-size: 0.95rem;
    }
    /* no celular a régua é estreita: as duas ações ficam só no desenho (o nome vai para o leitor de tela) */
    @media (max-width: 559px) {
      .acao-txt {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .ferramenta {
        width: 34px;
      }
      .tamanho {
        margin-left: 4px;
      }
    }

    /* ===== Como fica: a mesma folha, já formatada ===== */
    .previa {
      --line: 1.75rem;
      min-height: calc(var(--line) * var(--linhas, 6) + 8px);
      max-height: 22rem;
      overflow-y: auto;
      padding: 4px 10px;
      border-radius: 2px;
      background:
        repeating-linear-gradient(to bottom, transparent 0 calc(var(--line) - 2px), rgb(64 110 190 / 0.32) calc(var(--line) - 2px) var(--line))
          0 4px,
        rgb(255 255 255 / 0.55);
      background-attachment: local;
      box-shadow:
        inset 0 0 0 2px rgb(21 21 21 / 0.45),
        0 1px 3px rgb(0 0 0 / 0.2);
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1.14rem;
      line-height: var(--line);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      outline: none;
    }
    .previa:focus-visible {
      box-shadow:
        inset 0 0 0 3px var(--ink),
        0 0 0 4px rgb(21 21 21 / 0.16);
    }
    .previa.grande {
      --line: 2rem;
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
      padding: 4px 18px;
      font-size: 1.3rem;
    }
    .vazio {
      margin: 0;
      font-style: italic;
      color: rgb(21 21 21 / 0.55);
    }
    textarea[hidden] {
      display: none;
    }

    /* ===== A lista do link: uma tira de fichário presa embaixo da folha ===== */
    .elos {
      margin-top: 8px;
      padding: 8px;
      border-radius: 2px;
      background: #fbf9f2;
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 6px 14px -6px rgb(0 0 0 / 0.45);
    }
    .elos.grande {
      flex: 0 0 auto;
      max-height: 40%;
      overflow-y: auto;
    }
    .elos-busca {
      display: block;
      margin-bottom: 6px;
    }
    .elos-campo {
      width: 100%;
      padding: 7px 10px;
      border: 0;
      border-bottom: 2px solid var(--ink);
      background: transparent;
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1.1rem;
      outline: none;

      &::placeholder {
        color: rgb(21 21 21 / 0.66);
      }
      &:focus-visible {
        border-bottom-width: 3px;
      }
    }
    .elos-dica {
      margin: 0 0 4px 6px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    .elos-lista {
      max-height: 15rem;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      list-style: none;
    }
    .elo-op {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: baseline;
      gap: 2px 12px;
      padding: 7px 10px;
      border-radius: 3px;
      cursor: pointer;
    }
    .elo-op:hover {
      background: rgb(21 21 21 / 0.06);
    }
    /* a escolhida: o marca-texto amarelo, o mesmo do link na leitura */
    .elo-op.ativa {
      background: rgb(255 218 66 / 0.55);
    }
    .elo-nome {
      overflow: hidden;
      font-family: var(--f-hand);
      font-size: 1.12rem;
      color: var(--caneta-azul);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .elo-meta {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.82rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink-2);
      white-space: nowrap;
    }
    .elo-op.nova {
      grid-template-columns: auto minmax(0, 1fr);
      color: var(--ink);

      .elo-nome {
        color: var(--ink);
      }
      .elo-meta {
        grid-column: 2;
        white-space: normal;
        text-transform: none;
        letter-spacing: 0;
        font-family: var(--f-ui);
        font-weight: 500;
      }
    }
    .elos-vazio {
      padding: 6px 10px;
      font-style: italic;
      color: rgb(21 21 21 / 0.66);
    }
    @media (max-width: 559px) {
      .elo-op {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    /* ===== A folha pautada (a mesma de antes da régua) ===== */
    textarea {
      --line: 1.75rem;
      field-sizing: content;
      max-height: 22rem;
      display: block;
      width: 100%;
      /* as linhas da folha vazia: 6, ou o que o pai pedir em --linhas */
      min-height: calc(var(--line) * var(--linhas, 6) + 8px);
      padding: 4px 10px;
      border: 0;
      border-radius: 2px;
      resize: vertical;
      background:
        /* pauta azul de fichário, a mesma das folhas do Pra depois */
        repeating-linear-gradient(to bottom, transparent 0 calc(var(--line) - 2px), rgb(64 110 190 / 0.32) calc(var(--line) - 2px) var(--line))
          0 4px,
        rgb(255 255 255 / 0.55);
      background-attachment: local;
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1.14rem;
      line-height: var(--line);
      caret-color: var(--red);
      outline: none;
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 1px 3px rgb(0 0 0 / 0.2);
      transition: box-shadow var(--t-ui) var(--ease-ui);

      &::placeholder {
        color: rgb(21 21 21 / 0.7);
      }

      &:focus {
        box-shadow:
          inset 0 0 0 3px var(--ink),
          0 0 0 4px rgb(21 21 21 / 0.16);
      }
    }

    /* ===== Na tela inteira: uma folha grande de fichário, com a letra maior ===== */
    .tela-cheia {
      width: min(980px, calc(100vw - 24px));
      max-width: none;
      height: calc(100dvh - 24px);
      max-height: none;
      padding: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--ink);
      overflow: visible;
    }
    .tela-cheia::backdrop {
      background: rgb(8 8 10 / 0.78);
    }
    .tela-cheia[open] {
      animation: folha-sobe var(--t-physical) var(--ease-physical);
    }
    @keyframes folha-sobe {
      from {
        opacity: 0;
        transform: translateY(18px) scale(0.98);
      }
    }
    .folha {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 20px 24px 22px;
      border-radius: 2px;
      background: var(--paper);
      box-shadow: var(--shadow-lift);
    }
    .titulo {
      margin: 0 0 12px;
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.6rem;
      line-height: 1.05;
    }
    textarea.grande {
      --line: 2rem;
      flex: 1 1 auto;
      field-sizing: fixed;
      min-height: 0;
      max-height: none;
      padding: 4px 18px;
      resize: none;
      font-size: 1.3rem;
      overflow-y: auto;
    }
    @media (prefers-reduced-motion: reduce) {
      .tela-cheia[open] {
        animation: none;
      }
    }
    @media (max-width: 559px) {
      .tela-cheia {
        width: 100vw;
        height: 100dvh;
      }
      .folha {
        padding: 14px 12px 12px;
      }
      textarea.grande {
        padding: 4px 10px;
        font-size: 1.18rem;
      }
    }
  `,
})
export class RichEditor {
  readonly value = model('');
  readonly placeholder = input('');
  /** O nome do campo: o título da tela inteira ("O que achou?"). */
  readonly label = input('');
  /** O id do campo pequeno, para o rótulo de fora apontar para ele. */
  readonly areaId = 'texto-' + ++uid;
  /** As outras anotações, para os links "[[Título]]"; null, sem links (a resenha). */
  readonly notes = input<readonly Review[] | null>(null);

  protected readonly LinkIcon = Link2;
  protected readonly PlusIcon = Plus;

  /**
   * A lista do link aberta: pela régua (`auto` falso, com a própria busca) ou por "[[" escrito na
   * folha (`auto`, a busca é o que vem depois dos colchetes). `start` e `end` são o trecho do texto
   * que o link vai ocupar; `big`, em qual das folhas (a pequena ou a da tela inteira).
   */
  protected readonly linking = signal<{ auto: boolean; big: boolean; start: number; end: number; query: string } | null>(null);
  /** A opção escolhida da lista (pelas setas). */
  protected readonly active = signal(0);
  /** Onde "[[" foi fechado com Esc: a lista não volta a abrir sozinha ali. */
  private dismissedAt = -1;

  /** As anotações da lista: uma por título (a que o link abre), as que começam com a busca primeiro. */
  protected readonly linkOptions = computed(() => {
    const k = this.linking();
    const notes = this.notes();
    if (!k || !notes) return [];
    const q = linkKey(k.query);
    const seen = new Set<string>();
    const out: Review[] = [];
    for (const n of notes) {
      const key = linkKey(n.game.name);
      // um título com colchetes não cabe num link
      if (seen.has(key) || /[[\]]/.test(n.game.name) || (q && !key.includes(q))) continue;
      seen.add(key);
      out.push(resolveNote(notes, n.game.name) ?? n);
    }
    const starts = (n: Review) => (linkKey(n.game.name).startsWith(q) ? 1 : 0);
    return out.sort((a, b) => starts(b) - starts(a) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  });

  /** O que foi escrito e ainda não é título de nenhuma anotação: dá para criar o link mesmo assim. */
  protected readonly newLink = computed(() => {
    const k = this.linking();
    const t = k?.query.trim().replace(/\s+/g, ' ') ?? '';
    if (!t || /[[\]]/.test(t)) return null;
    const key = linkKey(t);
    return (this.notes() ?? []).some((n) => linkKey(n.game.name) === key) ? null : t;
  });

  private readonly optionCount = computed(() => this.linkOptions().length + (this.newLink() ? 1 : 0));

  /** Os links em "Ver como fica": mostram se a anotação existe, mas não abrem nada. */
  protected readonly previewLinks = computed<NoteLinks | null>(() => {
    const notes = this.notes();
    return notes ? { resolve: (title) => resolveNote(notes, title) } : null;
  });

  protected metaOf(n: Review): string {
    const cat = n.bonuses[0]?.label;
    const when = n.completedAt ? formatReviewDate(n.completedAt) : '';
    return [cat, when].filter(Boolean).join(' · ');
  }

  protected readonly BoldIcon = Bold;
  protected readonly ItalicIcon = Italic;
  protected readonly ListIcon = List;
  protected readonly OrderedIcon = ListOrdered;
  protected readonly ChecksIcon = ListChecks;
  protected readonly GrowIcon = Maximize2;
  protected readonly ShrinkIcon = Minimize2;

  protected readonly SeeIcon = Eye;
  protected readonly WriteIcon = PenLine;
  protected readonly toggle = toggleCheck;
  /** Mostrando a folha formatada no lugar do campo ("Ver como fica"). */
  protected readonly seeing = signal(false);

  /** A tela inteira está aberta. */
  protected readonly big = signal(false);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('grande');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Onde estava o cursor, para o campo que recebe o foco continuar do mesmo ponto. */
  private caret: [number, number] = [0, 0];

  /** O campo pequeno recebe o foco (o "Falta…" do editor, o rótulo clicado). */
  focus(): void {
    this.host.nativeElement.querySelector<HTMLTextAreaElement>(`#${this.areaId}`)?.focus();
  }

  /** Troca entre escrever e ver como fica; voltando a escrever, o foco volta para o campo. */
  protected see(on: boolean, big: boolean): void {
    this.seeing.set(on);
    if (!on) setTimeout(() => this.focusAt(big ? `#${this.areaId}-grande` : `#${this.areaId}`));
  }

  /** Volta a escrever (o editor abre outra ficha). */
  reset(): void {
    this.seeing.set(false);
    this.linking.set(null);
    this.dismissedAt = -1;
  }

  /** "Link para outra anotação" na régua: a busca abre, com o trecho selecionado já escrito nela. */
  protected startLink(area: HTMLTextAreaElement, big: boolean): void {
    if (this.linking() && !this.linking()!.auto) {
      this.closeLink(area);
      return;
    }
    const [start, end] = [area.selectionStart, area.selectionEnd];
    const query = area.value.slice(start, end).split('\n')[0].trim();
    this.linking.set({ auto: false, big, start, end, query });
    this.active.set(0);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLInputElement>('.elos-campo')?.focus());
  }

  protected setQuery(q: string): void {
    const k = this.linking();
    if (!k) return;
    this.linking.set({ ...k, query: q });
    this.active.set(0);
  }

  /** Escreveu na folha: com "[[" aberto antes do cursor (sem fechar), a lista abre e filtra. */
  protected watchLink(area: HTMLTextAreaElement, big: boolean): void {
    if (!this.notes()) return;
    const k = this.linking();
    if (k && !k.auto) return;
    const at = area.selectionStart;
    if (at !== area.selectionEnd) return this.linking.set(null);
    const m = /\[\[([^[\]\n]{0,80})$/.exec(area.value.slice(0, at));
    if (!m || m.index === this.dismissedAt) {
      // o "[[" fechado com Esc saiu de antes do cursor: o próximo abre a lista de novo
      if (!m) this.dismissedAt = -1;
      if (k) this.linking.set(null);
      return;
    }
    if (!k || k.start !== m.index) this.active.set(0);
    this.linking.set({ auto: true, big, start: m.index, end: at, query: m[1] });
  }

  protected onKeyUp(e: KeyboardEvent, area: HTMLTextAreaElement, big: boolean): void {
    // o cursor andou (setas, Home, End): o "[[" pode ter ficado para trás
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) this.watchLink(area, big);
  }

  protected onAreaBlur(): void {
    // saiu da folha (sem ser para a lista, que não pega o foco): a lista automática fecha
    if (this.linking()?.auto) this.linking.set(null);
  }

  /** Setas, Enter, Tab e Esc na lista (pela folha, com "[[", ou pela busca da régua). Devolve se usou a tecla. */
  protected onListKey(e: KeyboardEvent): boolean {
    const k = this.linking();
    if (!k) return false;
    const n = this.optionCount();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) this.active.set((this.active() + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
      return true;
    }
    if ((e.key === 'Enter' || (e.key === 'Tab' && k.auto)) && n) {
      e.preventDefault();
      const opts = this.linkOptions();
      const i = Math.min(this.active(), n - 1);
      this.pick(i < opts.length ? opts[i].game.name : this.newLink()!);
      return true;
    }
    if (e.key === 'Enter' && !k.auto) {
      e.preventDefault();
      return true;
    }
    if (e.key === 'Escape') {
      // só a lista fecha, não o editor inteiro
      e.preventDefault();
      e.stopPropagation();
      if (k.auto) this.dismissedAt = k.start;
      this.closeLink();
      return true;
    }
    return false;
  }

  /** Põe o link "[[título]]" no lugar do trecho (e de um "]]" que já estava logo depois). */
  protected pick(title: string): void {
    const k = this.linking();
    const area = this.areaOf(k?.big ?? false);
    if (!k || !area) return;
    const text = area.value;
    const end = k.auto && text.slice(k.end, k.end + 2) === ']]' ? k.end + 2 : k.end;
    const link = `[[${title}]]`;
    this.linking.set(null);
    this.replace(area, k.start, end, link, k.start + link.length, k.start + link.length);
  }

  private closeLink(area = this.areaOf(this.linking()?.big ?? false)): void {
    const k = this.linking();
    this.linking.set(null);
    if (k && !k.auto && area) {
      area.focus();
      area.setSelectionRange(k.start, k.end);
    }
  }

  private areaOf(big: boolean): HTMLTextAreaElement | null {
    return this.host.nativeElement.querySelector<HTMLTextAreaElement>(big ? `#${this.areaId}-grande` : `#${this.areaId}`);
  }

  protected grow(area: HTMLTextAreaElement): void {
    this.caret = [area.selectionStart, area.selectionEnd];
    this.big.set(true);
    this.dialog().nativeElement.showModal();
    // o campo grande nasce no próximo desenho: o foco vai para ele, no mesmo ponto do texto
    setTimeout(() => this.focusAt(`#${this.areaId}-grande`));
  }

  protected shrink(): void {
    this.dialog().nativeElement.close();
  }

  protected onClosed(): void {
    const big = this.host.nativeElement.querySelector<HTMLTextAreaElement>(`#${this.areaId}-grande`);
    if (big) this.caret = [big.selectionStart, big.selectionEnd];
    this.big.set(false);
    this.focusAt(`#${this.areaId}`);
  }

  private focusAt(selector: string): void {
    const el = this.host.nativeElement.querySelector<HTMLTextAreaElement>(selector);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(...this.caret);
  }

  protected onKey(e: KeyboardEvent, area: HTMLTextAreaElement): void {
    if (this.linking()?.auto && this.onListKey(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      this.wrap(area, '**');
    } else if (mod && !e.altKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      this.wrap(area, '*');
    } else if (e.key === 'Enter' && !e.shiftKey && !mod && !e.isComposing) {
      this.continueList(e, area);
    }
  }

  /**
   * Negrito ou itálico na seleção: põe as marcas em volta (os espaços das pontas ficam de fora); se
   * ela já está marcada, tira. Sem seleção, deixa as marcas com o cursor no meio, pronto para escrever.
   */
  protected wrap(area: HTMLTextAreaElement, mark: string): void {
    const text = area.value;
    let [s, e] = [area.selectionStart, area.selectionEnd];
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    const m = mark.length;
    // já marcada por fora ("**|texto|**"): tira as marcas. Um "*" que é metade de um "**" é negrito,
    // não itálico ("**|texto|**" ganha o itálico por dentro: "***texto***")
    const halfOfBold = m === 1 && text[s - 2] === '*' && text[s - 3] !== '*';
    const outside = text.slice(s - m, s) === mark && text.slice(e, e + m) === mark && !halfOfBold;
    if (s < e && outside) {
      this.replace(area, s - m, e + m, text.slice(s, e), s - m, e - m);
      return;
    }
    // ou por dentro ("|**texto**|")
    const inner = text.slice(s, e);
    if (inner.length > 2 * m && inner.startsWith(mark) && inner.endsWith(mark) && (m === 2 || !inner.startsWith('**') || inner.startsWith('***'))) {
      this.replace(area, s, e, inner.slice(m, -m), s, e - 2 * m);
      return;
    }
    this.replace(area, s, e, mark + inner + mark, s + m, e + m);
  }

  /**
   * Lista nas linhas da seleção: cada linha vira item (tirando o marcador de outro tipo de lista); se
   * todas já são desse tipo, voltam a ser texto. A numerada conta 1, 2, 3 a partir da primeira.
   */
  protected list(area: HTMLTextAreaElement, kind: ListKind): void {
    const text = area.value;
    const from = text.lastIndexOf('\n', area.selectionStart - 1) + 1;
    const endAt = text.indexOf('\n', Math.max(area.selectionEnd - (area.selectionEnd > area.selectionStart && text[area.selectionEnd - 1] === '\n' ? 1 : 0), area.selectionStart));
    const to = endAt === -1 ? text.length : endAt;
    const lines = text.slice(from, to).split('\n');
    const all = lines.every((l) => lineKind(l).kind === kind);
    let n = 0;
    const next = lines.map((l) => {
      const k = lineKind(l);
      const indent = /^\s*/.exec(l)![0];
      const rest = k.kind === 'p' ? l.slice(indent.length) : k.rest;
      if (all) return indent + rest;
      // linha em branco no meio da seleção fica em branco
      if (lines.length > 1 && !l.trim()) return l;
      return indent + prefixOf(kind, ++n) + rest;
    });
    const out = next.join('\n');
    // uma linha só, sem seleção: o cursor vai para o fim dela, pronto para escrever o item
    const single = area.selectionStart === area.selectionEnd && lines.length === 1;
    this.replace(area, from, to, out, single ? from + out.length : from, from + out.length);
  }

  /** Enter num item: o próximo item já vem com o marcador; Enter num item vazio termina a lista. */
  private continueList(e: KeyboardEvent, area: HTMLTextAreaElement): void {
    if (area.selectionStart !== area.selectionEnd) return;
    const text = area.value;
    const at = area.selectionStart;
    const from = text.lastIndexOf('\n', at - 1) + 1;
    const lineEnd = text.indexOf('\n', at);
    const line = text.slice(from, lineEnd === -1 ? text.length : lineEnd);
    const k = lineKind(line);
    if (k.kind === 'p') return;
    e.preventDefault();
    const indent = /^\s*/.exec(line)![0];
    if (!k.rest.trim()) {
      // item vazio: o marcador sai e a lista acaba ali
      this.replace(area, from, from + line.length, '', from, from);
      return;
    }
    const prefix = indent + prefixOf(k.kind, k.kind === 'ol' ? k.n + 1 : 1);
    this.replace(area, at, at, '\n' + prefix, at + 1 + prefix.length, at + 1 + prefix.length);
  }

  /**
   * Troca o trecho [start, end) por `text` e seleciona [selStart, selEnd). Pelo `insertText`, que entra
   * no desfazer do navegador; sem ele, troca direto e avisa o campo.
   */
  private replace(area: HTMLTextAreaElement, start: number, end: number, text: string, selStart: number, selEnd: number): void {
    area.focus();
    area.setSelectionRange(start, end);
    const ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete', false);
    if (!ok) {
      area.setRangeText(text, start, end, 'end');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    }
    area.setSelectionRange(selStart, selEnd);
  }
}

let uid = 0;

function prefixOf(kind: ListKind, n: number): string {
  return kind === 'ul' ? '- ' : kind === 'check' ? '- [ ] ' : `${n}. `;
}
