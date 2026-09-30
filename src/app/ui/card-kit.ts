import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  DAMAGES,
  DAMAGE_LABEL,
  DECORS,
  DECOR_LABEL,
  Damage,
  Decor,
  LOOK_KEYS,
  LOOK_LABEL,
  LOOK_STEP_LABEL,
  LookKey,
  PAPERS,
  PAPER_LABEL,
  PATTERNS,
  PATTERN_LABEL,
  Paper,
  Pattern,
  PatternLook,
  SCRIBBLES,
  SCRIBBLE_INK_LABEL,
  SCRIBBLE_LABEL,
  STAINS,
  STAIN_LABEL,
  Scribble,
  Stain,
  newSeed,
} from '../core/paper';
import { motifIcon, paperVars } from '../core/paper-art';
import { STOCKS, STOCK_LABEL, Stock, isDarkStock } from '../core/review';
import { PaperArtLayer } from './paper-layer';
import { Pin } from './pin';

type Tab = 'cor' | 'papel' | 'estampa' | 'rabisco' | 'estrago' | 'mancha' | 'decoracao';

interface Option {
  value: string | null;
  label: string;
  paper?: Paper;
  pattern?: Pattern;
  scribble?: Scribble;
  damage?: Damage;
  stain?: Stain;
  decor?: Decor;
}

/**
 * O estojo da ficha, na bancada do editor: a cor da cartolina, o papel, a estampa, o rabisco, o
 * estrago, a mancha e a decoração, um de cada. Abas de fichário em pé em réguas, como os filtros do
 * mural: sete numa fileira só, com um desenho em cima do nome, e um respiro entre o que é a cartolina
 * (cor, papel, estampa) e o que vem por cima dela (rabisco, estrago, mancha, decoração). Cada opção é
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
          <svg class="aba-icone" viewBox="0 0 24 24" aria-hidden="true" [innerHTML]="tabIcons[t.id]"></svg>
          <span>{{ t.label }}</span>
        </button>
      }
      <!-- as duas réguas: a da cartolina e a do que vem por cima dela -->
      <span class="regua um" aria-hidden="true"></span>
      <span class="regua dois" aria-hidden="true"></span>
    </div>

    <div class="painel" role="tabpanel" id="kit-painel" [attr.aria-labelledby]="'kit-aba-' + tab()">
      @if (tab() === 'cor') {
        <fieldset>
          <legend class="giz">Cor da cartolina <b>{{ stockLabels[stock()] }}</b></legend>
          <div class="amostras">
            @for (s of stocks; track s) {
              <label class="cor" [class.on]="stock() === s">
                <input type="radio" name="kit-cor" [value]="s" [checked]="stock() === s" [attr.aria-label]="stockLabels[s]" (change)="stock.set(s)" />
                <span class="amostra cartolina" [style]="isDark(s) ? currentDark() : current()" [style.--stock]="'var(--stock-' + s + ')'" [attr.data-cor]="s"></span>
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
          <!-- os ajustes da estampa, logo à vista; na Lisa ficam apagados, para a grade não pular ao escolher -->
          @if (tab() === 'estampa') {
            <div class="ajustes" [class.apagados]="!pattern()">
              @for (k of lookKeys; track k) {
                <label class="ajuste">
                  <span class="giz">{{ lookLabels[k] }} <b>{{ lookSteps[k][patternLook()[k]] }}</b></span>
                  <input
                    type="range"
                    min="0"
                    [max]="lookSteps[k].length - 1"
                    step="1"
                    [disabled]="!pattern()"
                    [value]="patternLook()[k]"
                    [attr.aria-valuetext]="lookSteps[k][patternLook()[k]]"
                    (input)="setLook(k, +$any($event.target).value)"
                  />
                </label>
              }
            </div>
          }
          <!-- a força do lápis do rabisco, logo à vista; sem rabisco fica apagada, como os ajustes da estampa -->
          @if (tab() === 'rabisco') {
            <div class="ajustes um" [class.apagados]="!scribble()">
              <label class="ajuste">
                <span class="giz">Opacidade <b>{{ inkSteps[scribbleInk()] }}</b></span>
                <input
                  type="range"
                  min="0"
                  [max]="inkSteps.length - 1"
                  step="1"
                  [disabled]="!scribble()"
                  [value]="scribbleInk()"
                  [attr.aria-valuetext]="inkSteps[scribbleInk()]"
                  (input)="scribbleInk.set(+$any($event.target).value)"
                />
              </label>
            </div>
          }
          @if (tab() === 'estampa') {
            <!-- são muitas: um desenho só de cada, sem o retalho de cartolina, para caberem à vista -->
            <div class="carimbos">
              @for (o of options(); track o.value) {
                <label class="carimbo" [class.on]="o.value === value()">
                  <input type="radio" name="kit-estampa" [checked]="o.value === value()" (click)="choose(o.value)" [attr.aria-label]="o.label" />
                  @if (o.pattern) {
                    <span class="icone" [innerHTML]="icons[o.pattern]"></span>
                  } @else {
                    <span class="icone lisa"></span>
                  }
                  <span class="nome">{{ o.label }}</span>
                </label>
              }
            </div>
          } @else {
          <div class="retalhos" [class.largos]="tab() !== 'papel'">
            @for (o of options(); track o.value) {
              <label class="retalho" [class.on]="o.value === value()">
                <input type="radio" [name]="'kit-' + tab()" [checked]="o.value === value()" (click)="choose(o.value)" [attr.aria-label]="o.label" />
                <span class="mini" [style]="miniVars(o)" [style.--stock]="'var(--stock-' + stock() + ')'" [attr.data-cor]="stock()">
                  <app-paper-art
                    [id]="id()"
                    [scribble]="o.scribble"
                    [scribbleSeed]="o.scribble && o.value === value() ? scribbleSeed() : null"
                    [scribbleInk]="scribbleInk()"
                    [damage]="o.damage"
                    [seed]="o.damage && o.value === value() ? damageSeed() : null"
                    [stain]="o.stain"
                    [stainSeed]="o.stain && o.value === value() ? stainSeed() : null"
                    [dark]="isDark(stock())"
                    [decor]="o.decor"
                    [decorSeed]="o.decor && o.value === value() ? decorSeed() : null"
                    [plain]="true"
                  />
                  @if (o.value === null) {
                    <span class="nada">nenhum</span>
                  }
                </span>
                <span class="nome">{{ o.label }}</span>
              </label>
            }
          </div>
          }
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

    /* ===== Abas de fichário em pé em duas réguas de alumínio: sete numa fileira, em dois grupos ===== */
    .abas {
      display: grid;
      /* a Decoração tem o nome mais comprido: a coluna dela é um pouco mais larga */
      grid-template-columns: repeat(3, minmax(0, 1fr)) 10px repeat(3, minmax(0, 1fr)) minmax(0, 1.4fr);
      grid-template-rows: auto 7px;
      column-gap: 3px;
      padding: 0 4px;
      margin-bottom: 11px;
    }
    .regua {
      grid-row: 2;
      border-radius: 1px;
      background: #76726b;
      box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.28),
        inset 0 -2px 0 rgb(0 0 0 / 0.3),
        0 5px 8px -3px rgb(0 0 0 / 0.6);
    }
    .regua.um {
      grid-column: 1 / 4;
      margin-left: -4px;
    }
    .regua.dois {
      grid-column: 5 / 9;
      margin-right: -4px;
    }
    /* o desenho em cima, o nome embaixo: a fileira cabe inteira até no celular */
    .plate {
      flex-direction: column;
      justify-content: center;
      gap: 3px;
      min-width: 0;
      min-height: 50px;
      padding: 7px 2px 5px;
      font-size: 0.7rem;
      letter-spacing: 0.03em;
      cursor: pointer;

      span {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
    .plate:nth-child(4) {
      grid-column: 5;
    }
    .aba-icone {
      width: 20px;
      height: 20px;
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    /* a aba de uma escolha já feita ganha um pontinho, para saber o que a ficha tem sem abrir */
    .plate.usada::after {
      content: '';
      position: absolute;
      top: 6px;
      right: 9px;
      width: 6px;
      height: 6px;
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
    input[type='radio'] {
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
      grid-template-columns: repeat(9, minmax(0, 1fr));
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
      --estampa-zoom: 0.5;
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
    /* no retalho de cartolina escura, a palavra em tinta clara */
    .mini:is([data-cor$='-escuro'], [data-cor='preto']) .nada {
      color: rgb(243 236 224 / 0.6);
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

    /* ===== Estampas: um desenho a giz de cada, em grade miúda; a escolhida acende em amarelo ===== */
    .carimbos {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
      gap: 10px 4px;
    }
    .carimbo {
      display: grid;
      justify-items: center;
      align-content: start;
      gap: 5px;
      padding: 6px 2px 4px;
      border-radius: 4px;
      color: var(--wall-ink-2);
      cursor: pointer;
      transition: color var(--t-ui) var(--ease-ui);

      &:has(input:focus-visible) {
        outline: 3px solid var(--hi);
        outline-offset: 1px;
      }
      &:hover {
        color: var(--wall-ink);
      }
      &.on {
        color: var(--hi);
      }
    }
    .icone {
      display: grid;
      width: 40px;
      height: 40px;
      filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.6));
      transition: translate var(--t-physical) var(--ease-physical);
    }
    .carimbo:hover .icone,
    .carimbo.on .icone {
      translate: 0 -2px;
    }
    .icone ::ng-deep svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .icone ::ng-deep .l * {
      fill: none;
      stroke: currentColor;
      stroke-width: 2.3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .icone ::ng-deep .l .f,
    .icone ::ng-deep .l .f * {
      fill: currentColor;
      stroke: none;
    }
    /* a Lisa: o quadrado vazio, tracejado */
    .icone.lisa {
      width: 34px;
      height: 34px;
      margin: 3px;
      border: 2px dashed currentColor;
      border-radius: 3px;
    }
    .carimbo .nome {
      font-size: 0.64rem;
    }
    .carimbo.on .nome {
      color: var(--wall-ink);
      text-decoration: underline 2px var(--hi);
      text-underline-offset: 4px;
    }

    /* ===== Ajustes da estampa: três réguas de cinco degraus, lado a lado acima dos retalhos ===== */
    .ajustes {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin: 0 0 16px;
      padding-bottom: 14px;
      border-bottom: 2px dashed rgb(255 255 255 / 0.16);
      transition: opacity var(--t-ui) var(--ease-ui);
    }
    .ajustes.um {
      grid-template-columns: minmax(0, 1fr);
    }
    .ajustes.apagados {
      opacity: 0.4;

      input {
        cursor: not-allowed;
      }
    }
    .ajuste {
      display: grid;
      align-content: start;
      gap: 2px;
      min-width: 0;

      .giz {
        margin: 0;
        font-size: 0.7rem;

        b {
          display: block;
          font-size: 0.78rem;
        }
      }

      input {
        width: 100%;
        height: 28px;
        margin: 0;
        cursor: pointer;
      }

      input:focus-visible {
        outline: 3px solid var(--hi);
        outline-offset: 2px;
      }
    }

    @media (max-width: 400px) {
      .abas {
        grid-template-columns: repeat(3, minmax(0, 1fr)) 6px repeat(3, minmax(0, 1fr)) minmax(0, 1.4fr);
        column-gap: 2px;
        padding: 0;
      }
      .regua.um {
        margin-left: 0;
      }
      .regua.dois {
        margin-right: 0;
      }
      .plate {
        font-size: 0.58rem;
        letter-spacing: 0;
      }
      .retalhos {
        gap: 12px 10px;
      }
    }
  `,
})
export class CardKit {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** O desenho de cada estampa: só desenhos nossos, nada que a pessoa escreveu. */
  protected readonly icons: Record<Pattern, SafeHtml> = (() => {
    const sanitizer = inject(DomSanitizer);
    return Object.fromEntries(PATTERNS.map((p) => [p, sanitizer.bypassSecurityTrustHtml(motifIcon(p))])) as Record<Pattern, SafeHtml>;
  })();

  readonly id = input.required<string>();
  readonly pinColor = input.required<string>();
  readonly stock = model.required<Stock>();
  readonly paper = model.required<Paper>();
  readonly pattern = model.required<Pattern | null>();
  readonly scribble = model.required<Scribble | null>();
  readonly damage = model.required<Damage | null>();
  /** O sorteio do estrago: cada clique num estrago, mesmo no que já está, rasga de outro jeito. */
  readonly damageSeed = model.required<number | null>();
  /** A mancha por cima do papel, e o sorteio dela (como o do estrago). */
  readonly stain = model.required<Stain | null>();
  readonly stainSeed = model.required<number | null>();
  /** A decoração por cima de tudo, e o sorteio dela (como o do estrago). */
  readonly decor = model.required<Decor | null>();
  readonly decorSeed = model.required<number | null>();
  /** O sorteio do rabisco, como o do estrago: cada clique rabisca de outro jeito. */
  readonly scribbleSeed = model.required<number | null>();
  /** A força do lápis do rabisco, um degrau de SCRIBBLE_INK. */
  readonly scribbleInk = model.required<number>();
  /** O espaço, o tamanho e o alinhamento dos desenhos da estampa. */
  readonly patternLook = model.required<PatternLook>();
  /** O sorteio da estampa: cada clique nela desloca e bagunça de outro jeito. */
  readonly patternSeed = model.required<number | null>();

  protected readonly tab = signal<Tab>('cor');
  protected readonly tabs: readonly { id: Tab; label: string }[] = [
    { id: 'cor', label: 'Cor' },
    { id: 'papel', label: 'Papel' },
    { id: 'estampa', label: 'Estampa' },
    { id: 'rabisco', label: 'Rabisco' },
    { id: 'estrago', label: 'Estrago' },
    { id: 'mancha', label: 'Mancha' },
    { id: 'decoracao', label: 'Decoração' },
  ];
  /** O desenho de cada aba, a traço: a amostra, a folha, o carimbo, o rabisco, o rasgo e a mancha. */
  protected readonly tabIcons: Record<Tab, SafeHtml> = (() => {
    const sanitizer = inject(DomSanitizer);
    const icons: Record<Tab, string> = {
      cor: `<path d='M12 3.5C8.6 8.4 6.5 11.4 6.5 14.6a5.5 5.5 0 0 0 11 0c0-3.2-2.1-6.2-5.5-11.1Z'/><path d='M9.6 15.2a2.6 2.6 0 0 0 2.2 2.4'/>`,
      papel: `<path d='M6 3.5h8.5l3.5 3.5v13.5H6Z'/><path d='M14.5 3.5V7H18M8.8 11h6.4M8.8 14h6.4M8.8 17h4'/>`,
      estampa: `<path d='M12 3.8l2.3 4.9 5.3.6-3.9 3.6 1 5.3-4.7-2.7-4.7 2.7 1-5.3-3.9-3.6 5.3-.6Z'/>`,
      rabisco: `<path d='M3.5 16.5c2.4-5.4 5.2-8.8 6.6-7.2 1.6 1.8-3.4 6.6-1.4 7.8 2.2 1.3 5.4-8.6 8.2-7.6 2 .7-.6 5.2 1.2 5.6 1 .2 1.8-.8 2.4-1.8'/>`,
      estrago: `<path d='M6 3.5h12v8.2l-2.2 1.3.9 2.2-2.6.6.5 2.6-2.8.8.4 2.3H6Z'/><path d='M9 7.5h6M9 10.5h4'/>`,
      decoracao: `<path d='M12 3.6l1.9 4.2 4.5.4-3.4 3 1 4.5L12 13.3l-4 2.4 1-4.5-3.4-3 4.5-.4Z'/><path d='M5 19.4l.9 1.8M19 18.2l-.4 2M12 18.6v2.6M3.6 14.6l1.8.4M20.4 13.6l-1.8.6'/>`,
      mancha: `<path d='M12 5.2a6.8 6.8 0 1 1-6.8 6.8'/><path d='M5.2 12a6.8 6.8 0 0 1 3.4-5.9' stroke-dasharray='2 2.4'/><path d='M12 9.3a2.7 2.7 0 1 1-2.7 2.7'/><circle cx='19.6' cy='19.4' r='1.1'/>`,
    };
    return Object.fromEntries(Object.entries(icons).map(([k, v]) => [k, sanitizer.bypassSecurityTrustHtml(v)])) as Record<Tab, SafeHtml>;
  })();
  protected readonly stocks = STOCKS;
  protected readonly stockLabels = STOCK_LABEL;
  protected readonly lookKeys = LOOK_KEYS;
  protected readonly lookLabels = LOOK_LABEL;
  protected readonly lookSteps = LOOK_STEP_LABEL;
  protected readonly inkSteps = SCRIBBLE_INK_LABEL;

  /** O papel e a estampa da ficha, para as amostras de cor. */
  protected readonly current = computed(() => paperVars(this.paper(), this.pattern() ?? undefined, this.patternLook(), this.patternSeed()));
  /** A amostra da cartolina escura: a estampa em branco. */
  protected readonly currentDark = computed(() => paperVars(this.paper(), this.pattern() ?? undefined, this.patternLook(), this.patternSeed(), true));
  protected readonly isDark = isDarkStock;

  private readonly all: Record<Exclude<Tab, 'cor'>, Option[]> = {
    papel: PAPERS.map((p) => ({ value: p, label: PAPER_LABEL[p], paper: p })),
    estampa: [{ value: null, label: 'Lisa' }, ...PATTERNS.map((p) => ({ value: p, label: PATTERN_LABEL[p], pattern: p }))],
    rabisco: [{ value: null, label: 'Nenhum' }, ...SCRIBBLES.map((s) => ({ value: s, label: SCRIBBLE_LABEL[s], scribble: s }))],
    estrago: [{ value: null, label: 'Nenhum' }, ...DAMAGES.map((d) => ({ value: d, label: DAMAGE_LABEL[d], damage: d }))],
    mancha: [{ value: null, label: 'Nenhuma' }, ...STAINS.map((m) => ({ value: m, label: STAIN_LABEL[m], stain: m }))],
    decoracao: [{ value: null, label: 'Nenhuma' }, ...DECORS.map((d) => ({ value: d, label: DECOR_LABEL[d], decor: d }))],
  };

  protected readonly options = computed(() => (this.tab() === 'cor' ? [] : this.all[this.tab() as Exclude<Tab, 'cor'>]));
  protected readonly tabLabel = computed(() => ({ cor: 'Cor', papel: 'Papel', estampa: 'Estampa', rabisco: 'Rabisco', estrago: 'Estrago', mancha: 'Mancha', decoracao: 'Decoração' })[this.tab()]);
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
      case 'mancha':
        return this.stain();
      case 'decoracao':
        return this.decor();
      default:
        return null;
    }
  });
  protected readonly chosen = computed(() => this.options().find((o) => o.value === this.value()) ?? this.options()[0] ?? { label: '' });

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
    return t === 'papel' ? this.paper() !== 'cartolina' : t === 'estampa' ? !!this.pattern() : t === 'rabisco' ? !!this.scribble() : t === 'estrago' ? !!this.damage() : t === 'mancha' ? !!this.stain() : t === 'decoracao' ? !!this.decor() : false;
  }

  /** O retalho mostra só o que a opção muda, sobre o que a ficha já tem nas outras abas. */
  protected miniVars(o: Option): Record<string, string | null> {
    const paper = this.tab() === 'papel' ? o.paper : this.paper();
    const pattern = this.tab() === 'estampa' ? o.pattern : (this.pattern() ?? undefined);
    // o sorteio vale para a estampa escolhida; as outras aparecem centradas
    return paperVars(paper, pattern, this.patternLook(), pattern === this.pattern() ? this.patternSeed() : null, isDarkStock(this.stock()));
  }

  protected choose(v: string | null): void {
    switch (this.tab()) {
      case 'papel':
        this.paper.set((v ?? 'cartolina') as Paper);
        break;
      case 'estampa':
        this.pattern.set(v as Pattern | null);
        this.patternSeed.set(v ? newSeed(this.patternSeed()) : null);
        break;
      case 'rabisco':
        this.scribble.set(v as Scribble | null);
        this.scribbleSeed.set(v ? newSeed(this.scribbleSeed()) : null);
        break;
      case 'estrago':
        this.damage.set(v as Damage | null);
        this.damageSeed.set(v ? newSeed(this.damageSeed()) : null);
        break;
      case 'mancha':
        this.stain.set(v as Stain | null);
        this.stainSeed.set(v ? newSeed(this.stainSeed()) : null);
        break;
      case 'decoracao':
        this.decor.set(v as Decor | null);
        this.decorSeed.set(v ? newSeed(this.decorSeed()) : null);
        break;
    }
  }

  protected setLook(k: LookKey, step: number): void {
    this.patternLook.update((cur) => ({ ...cur, [k]: step }));
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
