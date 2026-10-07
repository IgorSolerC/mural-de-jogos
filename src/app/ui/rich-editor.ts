import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject, input, model, signal, viewChild } from '@angular/core';
import { Bold, Eye, Italic, List, ListChecks, ListOrdered, LucideAngularModule, Maximize2, Minimize2, PenLine } from 'lucide-angular';
import { lineKind, toggleCheck } from '../core/rich-text';
import { RichText } from './rich-text';

type ListKind = 'ul' | 'ol' | 'check';

/**
 * O campo do texto da ficha: a folha pautada de sempre, com uma régua de formatação em cima
 * (negrito, itálico, lista, lista numerada, tarefas) e "Maximizar", que abre a mesma folha na tela
 * inteira para os textos longos. O que a régua faz são as marcas de core/rich-text.ts, escritas no
 * próprio texto; atalhos: Ctrl+B, Ctrl+I, e Enter continua a lista (num item vazio, termina).
 *
 * As mudanças passam por `insertText`, então o Ctrl+Z do navegador desfaz cada uma.
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
            <app-rich-text [text]="value()" [checkable]="true" (toggled)="value.set(toggle(value(), $event))" />
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
        (input)="value.set(area.value)"
        (keydown)="onKey($event, area)"
      ></textarea>
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
