import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';
import {
  DAMAGES,
  DAMAGE_HINT,
  DAMAGE_LABEL,
  Damage,
  PAPERS,
  PAPER_HINT,
  PAPER_LABEL,
  PATTERNS,
  PATTERN_LABEL,
  Paper,
  Pattern,
  SCRIBBLES,
  SCRIBBLE_HINT,
  SCRIBBLE_LABEL,
  Scribble,
  newSeed,
} from '../core/paper';
import { paperStyle } from '../core/paper-art';
import { STOCKS, STOCK_LABEL, Stock } from '../core/review';
import { PaperArtLayer } from './paper-layer';
import { Pin } from './pin';

type Tab = 'cor' | 'papel' | 'estampa' | 'rabisco' | 'estrago';

interface Option {
  value: string | null;
  label: string;
  hint: string;
  paper?: Paper;
  pattern?: Pattern;
  scribble?: Scribble;
  damage?: Damage;
}

/**
 * O estojo da ficha, na bancada do editor: a cor da cartolina, o papel, a estampa, o rabisco e o
 * estrago, um de cada. Abas de fichário em pé numa régua, como os filtros do mural. Cada opção é
 * um retalho da ficha já com o efeito, na cor dela; a ficha ao lado muda na hora.
 */
@Component({
  selector: 'app-card-kit',
  imports: [PaperArtLayer, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="abas" role="tablist" aria-label="Personalizar a ficha" (keydown)="onTabKey($event)">
      @for (t of tabs; track t.id) {
        <button
          type="button"
          role="tab"
          class="plate"
          [id]="'kit-aba-' + t.id"
          [class.is-active]="tab() === t.id"
          [class.usada]="used(t.id)"
          [attr.aria-selected]="tab() === t.id"
          [attr.aria-controls]="'kit-painel'"
          [attr.tabindex]="tab() === t.id ? 0 : -1"
          (click)="selectTab(t.id)"
        >
          {{ t.label }}
        </button>
      }
    </div>

    <div class="painel" role="tabpanel" id="kit-painel" [attr.aria-labelledby]="'kit-aba-' + tab()">
      @if (tab() === 'cor') {
        <fieldset>
          <legend class="giz">Cor da cartolina <b>{{ stockLabels[stock()] }}</b></legend>
          <div class="amostras">
            @for (s of stocks; track s) {
              <label class="cor" [class.on]="stock() === s">
                <input type="radio" name="kit-cor" [value]="s" [checked]="stock() === s" [attr.aria-label]="stockLabels[s]" (change)="stock.set(s)" />
                <span class="amostra cartolina" [style]="current()" [style.--stock]="'var(--stock-' + s + ')'"></span>
                @if (stock() === s) {
                  <app-pin class="cor-pin" [color]="pinColor()" />
                }
              </label>
            }
          </div>
        </fieldset>
      } @else {
        <fieldset>
          <legend class="giz">{{ tabLabel() }} <b>{{ chosen().label }}</b></legend>
          <div class="retalhos" [class.largos]="tab() === 'estrago' || tab() === 'rabisco'">
            @for (o of options(); track o.value) {
              <label class="retalho" [class.on]="o.value === value()">
                <input type="radio" [name]="'kit-' + tab()" [checked]="o.value === value()" (click)="choose(o.value)" [attr.aria-label]="o.label" />
                <span class="mini" [style]="miniVars(o)" [style.--stock]="'var(--stock-' + stock() + ')'">
                  <app-paper-art [id]="id()" [scribble]="o.scribble" [damage]="o.damage" [seed]="o.damage && o.value === value() ? damageSeed() : null" [plain]="true" />
                  @if (o.value === null) {
                    <span class="nada">nenhum</span>
                  }
                </span>
                <span class="nome">{{ o.label }}</span>
              </label>
            }
          </div>
          <p class="dica" aria-live="polite">
            {{ chosen().hint }}
            @if (tab() === 'estrago' && damage()) {
              <span class="de-novo">Clique de novo e ele sai de outro jeito.</span>
            }
          </p>
        </fieldset>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      width: 100%;
      max-width: 420px;
      min-width: 0;
    }

    :host(.scrollable) {
      height: 100%;
      min-height: 0;
      grid-template-rows: auto minmax(0, 1fr);
    }

    :host(.scrollable) .painel {
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgb(255 255 255 / 0.25) transparent;
    }

    @media (min-width: 1024px) {
      :host(.scrollable) .painel {
        overscroll-behavior: contain;
      }
    }

    /* ===== Abas de fichário em pé numa régua de alumínio ===== */
    .abas {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 0 6px;
      margin-bottom: 18px;

      &::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: -7px;
        height: 7px;
        border-radius: 1px;
        background: #76726b;
        box-shadow:
          inset 0 1px 0 rgb(255 255 255 / 0.28),
          inset 0 -2px 0 rgb(0 0 0 / 0.3),
          0 5px 8px -3px rgb(0 0 0 / 0.6);
      }
    }
    .plate {
      min-height: 34px;
      padding: 6px 11px 5px;
      font-size: 0.88rem;
      cursor: pointer;
    }
    /* a aba de uma escolha já feita ganha um pontinho, para saber o que a ficha tem sem abrir */
    .plate.usada::after {
      content: '';
      width: 6px;
      height: 6px;
      margin-left: 2px;
      border-radius: 50%;
      background: currentColor;
    }
    .plate:focus-visible {
      outline: 3px solid var(--hi);
      outline-offset: 3px;
    }

    fieldset {
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }
    legend {
      padding: 0;
    }
    .giz {
      margin: 0 0 12px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.78rem;
      letter-spacing: 0.12em;
      line-height: 1.2;
      text-transform: uppercase;
      color: var(--wall-ink-2);
      text-shadow: 0 1px 2px rgb(0 0 0 / 0.6);

      b {
        color: var(--wall-ink);
        font-weight: 800;
      }
    }
    .dica {
      margin: 12px 0 0;
      min-height: 1.3em;
      font-family: var(--f-hand);
      font-size: 1rem;
      line-height: 1.3;
      color: var(--wall-ink-2);
    }
    .de-novo {
      display: block;
      color: var(--wall-ink);
    }
    input {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
      margin: 0;
      pointer-events: none;
    }

    /* ===== Cor: as amostras de cartolina; a escolhida é pregada com uma tachinha ===== */
    .amostras {
      display: grid;
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap: 8px;
    }
    .cor {
      position: relative;
      display: grid;
      place-items: center;
      height: 46px;
      border-radius: 3px;
      cursor: pointer;

      &:has(input:focus-visible) {
        outline: 3px solid var(--hi);
        outline-offset: 1px;
      }
    }
    .amostra {
      width: 100%;
      max-width: 36px;
      aspect-ratio: 36 / 28;
      border-radius: 2px;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.35),
        0 5px 8px -3px rgb(0 0 0 / 0.55);
      transition:
        rotate var(--t-physical) var(--ease-physical),
        translate var(--t-physical) var(--ease-physical);
    }
    .cor:hover .amostra {
      translate: 0 -2px;
    }
    .cor.on .amostra {
      rotate: -7deg;
      translate: 0 -3px;
    }
    .cor-pin {
      top: 2px;
      left: calc(50% - 13px);
      scale: 0.6;
      animation: pino 420ms var(--ease-physical);
    }
    @keyframes pino {
      from {
        scale: 1.1;
        opacity: 0;
      }
    }

    /* ===== Retalhos: um pedacinho da ficha com o papel, a estampa, o rabisco ou o estrago ===== */
    .retalhos {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px 10px;
    }
    .retalho {
      display: grid;
      justify-items: center;
      gap: 7px;
      padding: 4px 2px 2px;
      border-radius: 3px;
      cursor: pointer;

      &:has(input:focus-visible) {
        outline: 3px solid var(--hi);
        outline-offset: 1px;
      }
    }
    /* sem fundo próprio: o papel é a camada do app-paper-art, que rasga e queima; a sombra segue o recorte */
    .mini {
      position: relative;
      isolation: isolate;
      display: grid;
      place-items: center;
      width: 100%;
      aspect-ratio: 7 / 5;
      border-radius: 2px;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.4)) drop-shadow(0 4px 4px rgb(0 0 0 / 0.4));
      transition:
        rotate var(--t-physical) var(--ease-physical),
        translate var(--t-physical) var(--ease-physical);
      /* a estampa em miniatura, para caberem vários motivos no retalho */
      --estampa-tam: 64px 64px;
    }
    .retalho:hover .mini {
      translate: 0 -2px;
    }
    .retalho.on .mini {
      rotate: -4deg;
      translate: 0 -3px;
    }
    .nada {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.66rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgb(21 21 21 / 0.5);
    }
    .nome {
      max-width: 100%;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.72rem;
      letter-spacing: 0.06em;
      line-height: 1.15;
      text-align: center;
      text-transform: uppercase;
      color: var(--wall-ink-2);
    }
    .retalho.on .nome {
      color: var(--wall-ink);
      text-decoration: underline 2px var(--hi);
      text-underline-offset: 4px;
    }

    @media (max-width: 400px) {
      .plate {
        padding-inline: 8px;
        font-size: 0.8rem;
      }
      .retalhos {
        gap: 12px 10px;
      }
    }
  `,
})
export class CardKit {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly id = input.required<string>();
  readonly pinColor = input.required<string>();
  readonly stock = model.required<Stock>();
  readonly paper = model.required<Paper>();
  readonly pattern = model.required<Pattern | null>();
  readonly scribble = model.required<Scribble | null>();
  readonly damage = model.required<Damage | null>();
  /** O sorteio do estrago: cada clique num estrago, mesmo no que já está, rasga de outro jeito. */
  readonly damageSeed = model.required<number | null>();

  protected readonly tab = signal<Tab>('cor');
  protected readonly tabs: readonly { id: Tab; label: string }[] = [
    { id: 'cor', label: 'Cor' },
    { id: 'papel', label: 'Papel' },
    { id: 'estampa', label: 'Estampa' },
    { id: 'rabisco', label: 'Rabisco' },
    { id: 'estrago', label: 'Estrago' },
  ];
  protected readonly stocks = STOCKS;
  protected readonly stockLabels = STOCK_LABEL;

  /** O papel e a estampa da ficha, para as amostras de cor. */
  protected readonly current = computed(() => paperStyle(this.paper(), this.pattern() ?? undefined));

  private readonly all: Record<Exclude<Tab, 'cor'>, Option[]> = {
    papel: PAPERS.map((p) => ({ value: p, label: PAPER_LABEL[p], hint: PAPER_HINT[p], paper: p })),
    estampa: [
      { value: null, label: 'Lisa', hint: 'Sem estampa: só a cartolina.' },
      ...PATTERNS.map((p) => ({ value: p, label: PATTERN_LABEL[p], hint: 'Impressa tom sobre tom, como cartolina temática de papelaria.', pattern: p })),
    ],
    rabisco: [
      { value: null, label: 'Nenhum', hint: 'Sem rabisco.' },
      ...SCRIBBLES.map((s) => ({ value: s, label: SCRIBBLE_LABEL[s], hint: SCRIBBLE_HINT[s], scribble: s })),
    ],
    estrago: [
      { value: null, label: 'Nenhum', hint: 'Inteira, como saiu da papelaria.' },
      ...DAMAGES.map((d) => ({ value: d, label: DAMAGE_LABEL[d], hint: DAMAGE_HINT[d], damage: d })),
    ],
  };

  protected readonly options = computed(() => (this.tab() === 'cor' ? [] : this.all[this.tab() as Exclude<Tab, 'cor'>]));
  protected readonly tabLabel = computed(() => ({ cor: 'Cor', papel: 'Papel', estampa: 'Estampa', rabisco: 'Rabisco', estrago: 'Estrago' })[this.tab()]);
  protected readonly value = computed<string | null>(() => {
    switch (this.tab()) {
      case 'papel':
        return this.paper();
      case 'estampa':
        return this.pattern();
      case 'rabisco':
        return this.scribble();
      case 'estrago':
        return this.damage();
      default:
        return null;
    }
  });
  protected readonly chosen = computed(() => this.options().find((o) => o.value === this.value()) ?? this.options()[0] ?? { label: '', hint: '' });

  /** Reset ao abrir outra ficha: a primeira aba de novo. */
  reset(): void {
    this.tab.set('cor');
    this.el.querySelector('.painel')?.scrollTo(0, 0);
  }

  protected selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.el.querySelector('.painel')?.scrollTo(0, 0);
  }

  /** A aba mostra um pontinho quando a ficha tem algo escolhido ali. */
  protected used(t: Tab): boolean {
    return t === 'papel' ? this.paper() !== 'cartolina' : t === 'estampa' ? !!this.pattern() : t === 'rabisco' ? !!this.scribble() : t === 'estrago' ? !!this.damage() : false;
  }

  /** O retalho mostra só o que a opção muda, sobre o que a ficha já tem nas outras abas. */
  protected miniVars(o: Option): Record<string, string | null> {
    const paper = this.tab() === 'papel' ? o.paper : this.paper();
    const pattern = this.tab() === 'estampa' ? o.pattern : (this.pattern() ?? undefined);
    return paperStyle(paper, pattern);
  }

  protected choose(v: string | null): void {
    switch (this.tab()) {
      case 'papel':
        this.paper.set((v ?? 'cartolina') as Paper);
        break;
      case 'estampa':
        this.pattern.set(v as Pattern | null);
        break;
      case 'rabisco':
        this.scribble.set(v as Scribble | null);
        break;
      case 'estrago':
        this.damage.set(v as Damage | null);
        this.damageSeed.set(v ? newSeed(this.damageSeed()) : null);
        break;
    }
  }

  /** Setas trocam de aba, como um tablist. */
  protected onTabKey(e: KeyboardEvent): void {
    const i = this.tabs.findIndex((t) => t.id === this.tab());
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % this.tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + this.tabs.length) % this.tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = this.tabs.length - 1;
    else return;
    e.preventDefault();
    this.selectTab(this.tabs[next].id);
    this.el.querySelector<HTMLElement>(`#kit-aba-${this.tabs[next].id}`)?.focus();
  }
}
