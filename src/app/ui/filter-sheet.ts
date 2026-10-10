import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { Ban, CircleSlash2, LucideAngularModule, LucideIconData, PenLine, PenOff, Sparkles, Square, X } from 'lucide-angular';
import { Kind, Status, Verdict } from '../core/review';
import { isNotes } from '../core/kinds';
import { Facet, FacetKey, FilterTag, GRADE_SHORT, GradeBand } from '../core/wall-filter';
import { Skulls } from './difficulty';
import { BonusSticker } from './bonus';
import { NoteTag } from './note-tag';
import { categoryBonus } from '../core/note-labels';
import { StatusLabel, statusIcon } from './status-label';
import { VERDICT_ICON } from './verdict';

export interface FilterToggle {
  key: FacetKey;
  value: string;
}

/** Cada adesivo colado entra com um torto diferente, como colado à mão. */
const TILTS = [-2, 1.6, -1.2, 2.2, -1.8, 1.1, -2.4, 1.4];

/**
 * A cartela de filtros: uma folha de adesivos presa com fita-crepe embaixo da régua. Cada opção é o
 * recorte picotado ainda na folha; a ligada sai colada, igual às escolhas do editor. Dentro de um
 * grupo vale qualquer um dos colados; entre grupos, todos juntos. O número ao lado de cada adesivo
 * diz quantas fichas ele mostraria, e a opção que não mostraria nenhuma fica apagada.
 */
@Component({
  selector: 'app-filter-sheet',
  imports: [LucideAngularModule, BonusSticker, NoteTag, Skulls, StatusLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'region', 'aria-label': 'Filtros', '(keydown.escape)': 'onEscape($event)' },
  template: `
    <span class="fita fita-l" aria-hidden="true"></span>
    <span class="fita fita-r" aria-hidden="true"></span>

    <div class="grupos" [class.sem-dificuldade]="!hasDifficulty() && !notesKind()" [class.sem-julgamento]="!hasVerdict() && !notesKind()" [class.anotacoes]="notesKind()">
      @for (f of facets(); track f.key) {
        <fieldset class="grupo" [class]="'g-' + f.key">
          <legend class="cabeca">
            <span class="rotulo">{{ f.title }}</span>
            @if (chosenIn(f)) {
              <button type="button" class="limpar" (click)="clearFacet.emit(f.key)" [attr.aria-label]="'Limpar ' + f.title">
                limpar
              </button>
            }
          </legend>
          <div class="opts">
            @for (o of f.options; track o.value; let i = $index) {
              <label class="opcao" [class.zerada]="!o.n && !o.on" [title]="hint(f.key, o.value, o.label)">
                <input
                  type="checkbox"
                  [checked]="o.on"
                  [disabled]="!o.n && !o.on"
                  (change)="toggle.emit({ key: f.key, value: o.value })"
                />
                @switch (f.key) {
                  @case ('status') {
                    @if (o.on) {
                      <app-status-label class="adesivo colado" [style.--cola]="tilt(i)" [status]="$any(o.value)" [kind]="kind()" />
                    } @else {
                      <span class="adesivo recorte">
                        <lucide-icon [img]="statusIconOf(o.value)" [size]="15" [strokeWidth]="2.6" aria-hidden="true" />
                        <span>{{ o.label }}</span>
                      </span>
                    }
                  }
                  @case ('verdict') {
                    <span
                      class="adesivo canhoto"
                      [class.recorte]="!o.on"
                      [class.colado]="o.on"
                      [class.gold]="o.value === 'masterpiece'"
                      [style.--cola]="tilt(i)"
                      [style.--v]="o.value === 'sem' ? 'var(--paper)' : 'var(--verdict-' + o.value + '-lit)'"
                    >
                      <lucide-icon [img]="verdictIconOf(o.value)" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
                      <span class="palavra">{{ o.label }}</span>
                    </span>
                  }
                  @case ('grade') {
                    <span class="adesivo tinta nota" [class.recorte]="!o.on" [class.colado]="o.on" [style.--cola]="tilt(i)">
                      <span aria-hidden="true">{{ gradeShort(o.value) }}</span>
                      <span class="sr-only">{{ o.label }}</span>
                    </span>
                  }
                  @case ('difficulty') {
                    <span class="adesivo tinta caveiras" [class.recorte]="!o.on" [class.colado]="o.on" [style.--cola]="tilt(i)">
                      @if (o.value === 'nenhuma') {
                        <lucide-icon [img]="NoneIcon" [size]="15" [strokeWidth]="2.6" aria-hidden="true" />
                        <span>Nenhuma</span>
                      } @else {
                        <app-skulls [value]="$any(o.value)" [size]="15" [showLabel]="false" [ghosts]="false" />
                      }
                    </span>
                  }
                  @case ('text') {
                    <span class="adesivo tinta" [class.recorte]="!o.on" [class.colado]="o.on" [style.--cola]="tilt(i)">
                      <lucide-icon [img]="o.value === 'com' ? WithTextIcon : NoTextIcon" [size]="15" [strokeWidth]="2.6" aria-hidden="true" />
                      <span>{{ o.label }}</span>
                    </span>
                  }
                  @case ('look') {
                    <span class="adesivo tinta" [class.recorte]="!o.on" [class.colado]="o.on" [style.--cola]="tilt(i)">
                      <lucide-icon [img]="o.value === 'com' ? DecoratedIcon : PlainIcon" [size]="15" [strokeWidth]="2.6" aria-hidden="true" />
                      <span>{{ o.label }}</span>
                    </span>
                  }
                  @case ('category') {
                    <!-- a categoria: o adesivo da anotação, picotado na folha ou colado -->
                    @if (o.value === 'sem') {
                      <span class="adesivo tinta" [class.recorte]="!o.on" [class.colado]="o.on" [style.--cola]="tilt(i)">{{ o.label }}</span>
                    } @else {
                      <app-bonus-sticker class="rotulo-nota" [class.colado-nota]="o.on" [bonus]="sticker(o.value)" [ghost]="!o.on" [index]="o.on ? i : null" />
                    }
                  }
                  @case ('tag') {
                    <!-- a tag: a etiqueta de papel pardo, em branco na folha ou amarrada -->
                    @if (o.value === 'sem') {
                      <span class="adesivo tinta" [class.recorte]="!o.on" [class.colado]="o.on" [style.--cola]="tilt(i)">{{ o.label }}</span>
                    } @else {
                      <app-note-tag class="rotulo-nota" [class.colado-nota]="o.on" [label]="o.label" [ghost]="!o.on" [index]="o.on ? i : null" />
                    }
                  }
                  @default {
                    <span class="adesivo tinta ano" [class.recorte]="!o.on" [class.colado]="o.on" [style.--cola]="tilt(i)">
                      {{ o.label }}
                    </span>
                  }
                }
                <span class="n" aria-hidden="true">{{ o.n }}</span>
                <span class="sr-only">({{ o.n }})</span>
              </label>
            }
          </div>
        </fieldset>
      }
    </div>

    <footer class="pe">
      <p class="conta" aria-live="polite">{{ summary() }}</p>
      <div class="pe-acoes">
        @if (anyChosen()) {
          <button type="button" class="acao-caneta" (click)="clearAll.emit()">Limpar tudo</button>
        }
        <button type="button" class="pronto" (click)="done.emit()">Pronto</button>
      </div>
    </footer>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      padding: 26px 28px 0;
      border-radius: 2px;
      background: var(--cartela, #fdfcf8);
      color: var(--ink);
      color-scheme: light;
      box-shadow: var(--shadow-card);
      --focus: var(--ink);
    }

    /* duas tiras de fita-crepe prendem a folha na régua */
    .fita {
      position: absolute;
      top: -15px;
      width: 92px;
      height: 26px;
      background: rgb(222 205 160 / 0.86);
      clip-path: polygon(0 8%, 5px 30%, 1px 52%, 6px 74%, 0 94%, 100% 100%, calc(100% - 4px) 70%, 100% 46%, calc(100% - 6px) 22%, 100% 4%);
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3));
      pointer-events: none;
    }
    .fita-l {
      left: 7%;
      rotate: -4deg;
    }
    .fita-r {
      right: 7%;
      rotate: 3deg;
    }

    /* Veredito e Status em cima, com Resenha e Visual (só dois adesivos cada) empilhados ao lado;
       Média, Dificuldade e Ano embaixo */
    .grupos {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(0, 1.05fr) minmax(0, 1.1fr);
      grid-template-areas:
        'verdict status text'
        'verdict status look'
        'grade difficulty year';
      gap: 22px 44px;
    }
    .grupos.sem-dificuldade {
      grid-template-areas:
        'verdict status text'
        'verdict status look'
        'grade year year';
    }
    /* Sem spoilers não há Veredito nem Média: Status puxa a primeira coluna, Resenha e Visual ficam
       no meio, e o Ano (que tem mais adesivos) ganha a coluna da direita inteira, sem buraco na folha */
    .grupos.sem-julgamento {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.25fr);
      grid-template-areas:
        'status text year'
        'difficulty look year';
    }
    .grupos.sem-julgamento.sem-dificuldade {
      grid-template-areas:
        'status text year'
        'status look year';
    }
    .g-verdict {
      grid-area: verdict;
    }
    .g-status {
      grid-area: status;
    }
    .g-text {
      grid-area: text;
    }
    .g-look {
      grid-area: look;
    }
    .g-grade {
      grid-area: grade;
    }
    .g-difficulty {
      grid-area: difficulty;
    }
    .g-year {
      grid-area: year;
    }
    /* Anotações: os grupos correm lado a lado e quebram a linha sozinhos, porque cada aba tem os seus
       (numa aba de categoria não há o grupo Categoria; Visual e Ano só aparecem quando separam
       alguma coisa). Categoria e Tags, que têm mais opções, ganham mais largura. */
    .grupos.anotacoes {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
    }
    .grupos.anotacoes .grupo {
      flex: 1 1 200px;
      grid-area: auto;
    }
    .grupos.anotacoes :is(.g-category, .g-tag) {
      flex: 3 1 340px;
    }
    /* o adesivo da categoria e a etiqueta da tag, nas medidas dos outros adesivos */
    .rotulo-nota {
      min-height: 30px;
    }
    .rotulo-nota.colado-nota {
      scale: 1.04;
    }
    app-bonus-sticker.colado-nota {
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 2px 3px rgb(0 0 0 / 0.3);
    }

    .grupo {
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .cabeca {
      display: flex;
      align-items: baseline;
      gap: 10px;
      width: 100%;
      min-height: 26px;
      margin: 0 0 10px;
      padding: 0;
    }
    .cabeca .rotulo {
      margin: 0;
    }

    /* "limpar" do grupo: risco de caneta pequeno, como o "tirar" do veredito no editor */
    .limpar {
      min-height: 26px;
      margin: -4px 0;
      padding: 2px 6px;
      border: 0;
      border-radius: 4px;
      background: none;
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1rem;
      line-height: 1;
      text-decoration: underline 1.5px;
      text-underline-offset: 4px;
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .limpar:hover {
      background: rgb(21 21 21 / 0.06);
    }
    .limpar:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 0;
    }

    .opts {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
    }

    /* a opção é o adesivo e, ao lado, quantas fichas ele mostra */
    .opcao {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      padding-right: 2px;
    }
    .opcao.zerada {
      cursor: default;
      opacity: 0.4;
    }
    .opcao.zerada:hover .recorte {
      background: transparent;
      outline-color: rgb(21 21 21 / 0.42);
      color: rgb(21 21 21 / 0.74);
    }

    .n {
      min-width: 1.4ch;
      font-family: var(--f-label);
      font-weight: 600;
      font-size: 0.86rem;
      letter-spacing: 0.02em;
      color: var(--ink-2);
      font-variant-numeric: tabular-nums;
    }

    /* as medidas de todo adesivo: recorte e colado ocupam o mesmo lugar, nada pula ao colar */
    .adesivo {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 11px;
      border-radius: 2px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.88rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      line-height: 1;
      white-space: nowrap;
    }
    .adesivo lucide-icon {
      display: inline-flex;
      margin-top: -1px;
    }

    /* colado em tinta preta: a palavra em papel, como o canhoto da ficha */
    .tinta.colado,
    .canhoto.colado {
      background: var(--ink);
      color: var(--paper);
      box-shadow: 0 2px 3px rgb(0 0 0 / 0.3);
    }
    .canhoto.colado lucide-icon {
      color: var(--v);
    }
    /* Masterpiece: palavra e fio da moldura em folha de ouro, como no editor */
    .canhoto.colado.gold::after {
      content: '';
      position: absolute;
      inset: 3px;
      border: 1.5px solid #d8ab48;
      border-radius: 2px;
      pointer-events: none;
    }
    .canhoto.colado.gold .palavra {
      background: linear-gradient(100deg, #d8ab48 0%, #f7dc8a 30%, #fff4c4 45%, #e3b857 65%, #f3d27a 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    /* a etiqueta de status de verdade, nas medidas do recorte */
    app-status-label.adesivo {
      padding: 0 11px;
    }

    /* a faixa da Média: o número em itálico condensado, como na etiqueta da ficha */
    .nota {
      justify-content: center;
      min-width: 44px;
      padding: 0 8px;
      font-size: 1.12rem;
      font-style: italic;
      letter-spacing: 0;
      font-variant-numeric: tabular-nums;
    }

    .caveiras app-skulls {
      gap: 0;
    }
    .caveiras.colado app-skulls {
      color: var(--paper);
    }

    .ano {
      font-size: 0.95rem;
      letter-spacing: 0.04em;
      font-variant-numeric: tabular-nums;
    }

    /* o pé da folha: quantas fichas sobraram e o Pronto, sempre à mão mesmo com a cartela comprida */
    .pe {
      position: sticky;
      bottom: 0;
      z-index: 1;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 20px;
      margin: 22px -28px 0;
      padding: 12px 28px 14px;
      border-top: 1.5px dashed rgb(21 21 21 / 0.3);
      background: var(--cartela, #fdfcf8);
      border-radius: 0 0 2px 2px;
    }

    .conta {
      margin: 0;
      font-family: var(--f-hand);
      font-size: 1.14rem;
      line-height: 1.3;
    }

    .pe-acoes {
      display: flex;
      align-items: center;
      gap: 18px;
      margin-left: auto;
    }

    .pronto {
      min-height: 44px;
      padding: 9px 20px 8px;
      border: 0;
      border-radius: 3px;
      background: var(--ink);
      color: var(--hi);
      font-family: var(--f-marker);
      font-size: 1.08rem;
      line-height: 1;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.35), 0 6px 12px -4px rgb(0 0 0 / 0.35);
      cursor: pointer;
      transition: transform var(--t-physical) var(--ease-physical);
    }
    .pronto:hover {
      transform: translateY(-2px) rotate(-1deg);
    }
    .pronto:active {
      transform: translateY(1px);
    }
    .pronto:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 3px;
    }

    @media (max-width: 1180px) {
      .grupos,
      .grupos.sem-dificuldade {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-template-areas:
          'verdict status'
          'text look'
          'grade difficulty'
          'year year';
      }
      .grupos.sem-dificuldade {
        grid-template-areas:
          'verdict status'
          'text look'
          'grade year';
      }
      .grupos.sem-julgamento {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-template-areas:
          'status text'
          'difficulty look'
          'year year';
      }
      .grupos.sem-julgamento.sem-dificuldade {
        grid-template-areas:
          'status text'
          'status look'
          'year year';
      }
    }

    @media (max-width: 640px) {
      :host {
        padding: 22px 16px 0;
      }
      .grupos,
      .grupos.sem-dificuldade,
      .grupos.sem-julgamento,
      .grupos.sem-julgamento.sem-dificuldade,
      .grupos.anotacoes {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas: none;
        gap: 18px;
      }
      .grupo {
        grid-area: auto;
      }
      .opts {
        gap: 2px 12px;
      }
      .pe {
        margin-inline: -16px;
        padding: 10px 16px 12px;
      }
      .conta {
        font-size: 1.04rem;
      }
      .pe-acoes {
        gap: 12px;
      }
    }
  `,
})
export class FilterSheet {
  readonly facets = input.required<Facet[]>();
  readonly kind = input.required<Kind>();
  /** "Mostrando 12 de 40 jogos". */
  readonly summary = input.required<string>();

  readonly toggle = output<FilterToggle>();
  readonly clearFacet = output<FacetKey>();
  readonly clearAll = output<void>();
  readonly done = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly NoneIcon = Ban;
  protected readonly WithTextIcon = PenLine;
  protected readonly NoTextIcon = PenOff;
  protected readonly DecoratedIcon = Sparkles;
  protected readonly PlainIcon = Square;

  protected readonly hasDifficulty = computed(() => this.facets().some((f) => f.key === 'difficulty'));
  /** Sem spoilers, Veredito e Média saem da cartela (ver WallView.facets). */
  protected readonly hasVerdict = computed(() => this.facets().some((f) => f.key === 'verdict'));
  /**
   * O mural de anotações: a cartela é das categorias e das tags. Vem do mural, não dos grupos: numa
   * aba de categoria o grupo Categoria não existe, e a cartela caía na disposição das resenhas.
   */
  protected readonly notesKind = computed(() => isNotes(this.kind()));
  protected readonly sticker = categoryBonus;

  protected readonly anyChosen = computed(() => this.facets().some((f) => this.chosenIn(f)));

  protected chosenIn(f: Facet): boolean {
    return f.options.some((o) => o.on);
  }

  protected tilt(i: number): string {
    return `${TILTS[i % TILTS.length]}deg`;
  }

  /** A dica do adesivo: o nome inteiro (a faixa da Média só mostra o número). */
  protected hint(key: FacetKey, value: string, label: string): string {
    if (key === 'look') return value === 'com' ? 'Com estampa, rabisco, mancha, estrago ou enfeite' : 'Cartolina lisa, sem nada por cima';
    return label;
  }

  protected statusIconOf(v: string): LucideIconData {
    return statusIcon(this.kind(), v as Status);
  }

  protected verdictIconOf(v: string): LucideIconData {
    return v === 'sem' ? CircleSlash2 : VERDICT_ICON[v as Verdict];
  }

  protected gradeShort(v: string): string {
    return GRADE_SHORT[v as GradeBand];
  }

  /** Esc dentro da cartela fecha a folha (e não o modo Marcar, que também ouve o Esc). */
  protected onEscape(e: Event): void {
    e.stopPropagation();
    this.done.emit();
  }

  /** Leva o foco para o primeiro adesivo, quando a folha abre pelo teclado. */
  focusFirst(): void {
    this.host.nativeElement.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
  }
}

/**
 * Os filtros ligados, como adesivos de papel colados na parede logo embaixo da régua: cada um com o
 * seu X, para tirar um sem abrir a cartela.
 */
@Component({
  selector: 'app-filter-tags',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'list', 'aria-label': 'Filtros ligados' },
  template: `
    @for (t of tags(); track t.key + ':' + t.value; let i = $index) {
      <span class="tag" role="listitem" [style.--tilt]="tilt(i)">
        <span class="txt">{{ t.label }}</span>
        <button type="button" class="tirar" (click)="remove.emit(t)" [attr.aria-label]="'Tirar o filtro ' + t.label">
          <lucide-icon [img]="XIcon" [size]="14" [strokeWidth]="3" aria-hidden="true" />
        </button>
      </span>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      height: 30px;
      padding: 0 2px 0 10px;
      border-radius: 2px;
      background: var(--paper);
      color: var(--ink);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.84rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      line-height: 1;
      white-space: nowrap;
      rotate: var(--tilt);
      box-shadow: 0 1px 1.5px rgb(0 0 0 / 0.35), 0 4px 8px -3px rgb(0 0 0 / 0.45);
      animation: cola var(--t-physical) var(--ease-physical);
    }
    .tirar {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--ink);
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .tirar:hover {
      background: rgb(21 21 21 / 0.1);
    }
    .tirar:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -3px;
    }
    lucide-icon {
      display: inline-flex;
    }
  `,
})
export class FilterTags {
  readonly tags = input.required<FilterTag[]>();
  readonly remove = output<FilterTag>();
  protected readonly XIcon = X;

  protected tilt(i: number): string {
    return `${[-1.2, 0.9, -0.6, 1.3, -1, 0.7][i % 6]}deg`;
  }
}
