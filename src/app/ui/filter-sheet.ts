import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { ICON, IconModule } from './icons';
import { Kind, Status, Verdict } from '../core/review';
import { Facet, FacetKey, GRADE_SHORT, GradeBand } from '../core/wall-filter';
import { Skulls } from './difficulty';
import { statusIcon } from './status-label';
import { VERDICT_ICON } from './verdict';

export interface FilterToggle {
  key: FacetKey;
  value: string;
}

/** O que cada linha faz, embaixo do nome dela (como nos filtros das Anotações). */
const DESC: Partial<Record<FacetKey, string>> = {
  verdict: 'O que você achou, numa palavra.',
  status: 'Em que pé está cada uma.',
  form: 'O álbum inteiro ou a música solta.',
  text: 'Com a resenha escrita, ou só as notas.',
  look: 'Com estampa, rabisco, mancha, estrago ou enfeite, ou a cartolina lisa.',
  grade: 'A média de cada ficha, por faixa.',
  difficulty: 'As caveiras de cada ficha.',
  year: 'O ano da data de cada ficha.',
};

/**
 * A folha dos filtros dos murais de resenhas: a mesma dos filtros das Anotações (ui/filter-card.ts),
 * presa com fita-crepe embaixo da pasta. Cada filtro uma linha, o nome e o que ele faz à esquerda, os
 * recortes à direita (o escolhido, o adesivo de tinta, com o desenho dele: o do status, o do veredito,
 * as caveiras). Dentro de uma linha vale qualquer um dos escolhidos; entre as linhas, todos juntos. Ao
 * lado de cada recorte, quantas fichas ele mostraria; o que não mostraria nenhuma fica desbotado. No pé,
 * quantas mostra, Limpar tudo e Pronto.
 */
@Component({
  selector: 'app-filter-sheet',
  imports: [IconModule, Skulls],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'region', 'aria-label': 'Filtros', '(keydown.escape)': 'onEscape($event)' },
  template: `
    <span class="fita fita-l" aria-hidden="true"></span>
    <span class="fita fita-r" aria-hidden="true"></span>

    @for (f of facets(); track f.key) {
      <div class="linha" role="group" [attr.aria-labelledby]="'cf-' + f.key">
        <div class="linha-texto">
          <p class="linha-titulo" [id]="'cf-' + f.key">{{ f.title }}</p>
          @if (desc[f.key]; as d) {
            <p class="linha-desc">{{ d }}</p>
          }
        </div>
        <div class="recortes">
          @for (o of f.options; track o.value) {
            <label class="recorte" [class.zero]="!o.n && !o.on" [class.sem]="o.value === 'sem'" [title]="o.label">
              <input type="checkbox" [checked]="o.on" (change)="toggle.emit({ key: f.key, value: o.value })" />
              @switch (f.key) {
                @case ('status') {
                  <lucide-icon [img]="statusIconOf(o.value)" [size]="15" aria-hidden="true" />
                  <span class="recorte-nome">{{ o.label }}</span>
                }
                @case ('verdict') {
                  <lucide-icon [img]="verdictIconOf(o.value)" [size]="15" aria-hidden="true" />
                  <span class="recorte-nome">{{ o.label }}</span>
                }
                @case ('grade') {
                  <!-- a faixa da Média: o número em itálico, como na etiqueta da ficha -->
                  <span class="recorte-nome nota" aria-hidden="true">{{ gradeShort(o.value) }}</span>
                  <span class="sr-only">{{ o.label }}</span>
                }
                @case ('difficulty') {
                  @if (o.value === 'nenhuma') {
                    <lucide-icon [img]="NoneIcon" [size]="15" aria-hidden="true" />
                    <span class="recorte-nome">Nenhuma</span>
                  } @else {
                    <app-skulls [value]="$any(o.value)" [size]="15" [showLabel]="false" [ghosts]="false" />
                  }
                }
                @case ('text') {
                  <lucide-icon [img]="o.value === 'com' ? WithTextIcon : NoTextIcon" [size]="15" aria-hidden="true" />
                  <span class="recorte-nome">{{ o.label }}</span>
                }
                @case ('look') {
                  <lucide-icon [img]="o.value === 'com' ? DecoratedIcon : PlainIcon" [size]="15" aria-hidden="true" />
                  <span class="recorte-nome">{{ o.label }}</span>
                }
                @case ('form') {
                  <lucide-icon [img]="o.value === 'album' ? AlbumIcon : SongIcon" [size]="15" aria-hidden="true" />
                  <span class="recorte-nome">{{ o.label }}</span>
                }
                @default {
                  <span class="recorte-nome">{{ o.label }}</span>
                }
              }
              <span class="recorte-n"><span class="sr-only">, </span>{{ o.n }}</span>
            </label>
          }
        </div>
      </div>
    }

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
    @use 'paper-kit' as kit;
    @use 'filtro-linhas' as fl;

    :host {
      @include kit.cartela;
      padding-top: 12px;
    }

    @include kit.cartela-fitas('.fita-l', '.fita-r');

    .pe {
      @include kit.cartela-pe;
      margin-top: 6px;
    }

    @include fl.linhas;
    @include fl.recorte-desenho;

    /* a faixa da Média: o número em itálico condensado, como na etiqueta da ficha */
    .nota {
      font-size: 1rem;
      font-style: italic;
      letter-spacing: 0;
      font-variant-numeric: tabular-nums;
    }

    /* as caveiras: no adesivo de tinta, em papel */
    app-skulls {
      gap: 0;
      align-self: center;
    }
    .recorte:has(input:checked) app-skulls {
      color: var(--paper);
    }

    /* "Sem veredito", "Sem data": o resto, na mesma letra, mais leve */
    .sem:not(:has(input:checked)) .recorte-nome {
      font-weight: 600;
      color: var(--ink-2);
    }
  `,
})
export class FilterSheet {
  readonly facets = input.required<Facet[]>();
  readonly kind = input.required<Kind>();
  /** "Mostrando 12 de 40 jogos". */
  readonly summary = input.required<string>();

  readonly toggle = output<FilterToggle>();
  /** (Mantido para quem ainda ouve: a folha nova limpa pelos adesivos embaixo da pasta e pelo Limpar tudo.) */
  readonly clearFacet = output<FacetKey>();
  readonly clearAll = output<void>();
  readonly done = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly desc = DESC;
  protected readonly NoneIcon = ICON.nenhum;
  protected readonly WithTextIcon = ICON.escrever;
  protected readonly NoTextIcon = ICON.semTexto;
  protected readonly DecoratedIcon = ICON.brilho;
  protected readonly PlainIcon = ICON.desmarcado;
  protected readonly AlbumIcon = ICON.musicas;
  protected readonly SongIcon = ICON.musica;

  protected anyChosen(): boolean {
    return this.facets().some((f) => f.options.some((o) => o.on));
  }

  protected statusIconOf(v: string): LucideIconData {
    return statusIcon(this.kind(), v as Status);
  }

  protected verdictIconOf(v: string): LucideIconData {
    return v === 'sem' ? ICON.semNada : VERDICT_ICON[v as Verdict];
  }

  protected gradeShort(v: string): string {
    return GRADE_SHORT[v as GradeBand];
  }

  /** Esc dentro da folha fecha a folha (e não o modo Marcar, que também ouve o Esc). */
  protected onEscape(e: Event): void {
    e.stopPropagation();
    this.done.emit();
  }

  /** Leva o foco para o primeiro recorte, quando a folha abre pelo teclado. */
  focusFirst(): void {
    this.host.nativeElement.querySelector<HTMLInputElement>('input')?.focus();
  }
}

/** Um filtro ligado, embaixo da régua: o grupo dele (o da cartela, ou o que quem usa escolher), o valor e como aparece. */
export interface FilterChip {
  key: string;
  value: string;
  label: string;
}

/**
 * Os filtros ligados, como adesivos de papel colados na parede logo embaixo da régua: cada um com o
 * seu X, para tirar um sem abrir a cartela. Os da cartela das resenhas e os da ficha dos filtros das
 * anotações e do Kanban (ver `activeFilters` em ui/filter-card.ts).
 */
@Component({
  selector: 'app-filter-tags',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'list', 'aria-label': 'Filtros ligados' },
  template: `
    @for (t of tags(); track t.key + ':' + t.value; let i = $index) {
      <span class="tag" role="listitem" [style.--tilt]="tilt(i)">
        <span class="txt">{{ t.label }}</span>
        <button type="button" class="tirar" (click)="remove.emit(t)" [attr.aria-label]="'Tirar o filtro ' + t.label">
          <lucide-icon [img]="XIcon" [size]="14" aria-hidden="true" />
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
  readonly tags = input.required<readonly FilterChip[]>();
  readonly remove = output<FilterChip>();
  protected readonly XIcon = ICON.fechar;

  protected tilt(i: number): string {
    return `${[-1.2, 0.9, -0.6, 1.3, -1, 0.7][i % 6]}deg`;
  }
}
