import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { setSoundVolume, settleSoundVolume, soundVolume, toggleMute } from '../core/volume';

let uid = 0;

/**
 * O botão de volume dos widgets que fazem som (a faixa de áudio, o vídeo, o vinil das músicas): um
 * broche de lata, como os do topo, com o alto-falante desenhado a tinta na estampa, que aparece com o mouse em cima da peça (quem o usa
 * põe a classe `som` no que conta como "em cima") ou com o foco do teclado. O toque abre a tira de
 * papel do volume, presa com fita crepe: o alto-falante que cala e a barra, que valem para todo som
 * do site (ver core/volume.ts).
 *
 * A tira é um `popover`: fica por cima de tudo, fora do corte da ficha e do giro da peça, e fecha
 * tocando fora ou com Esc. Ela é posta embaixo do botão (ou em cima, sem lugar embaixo) e o
 * acompanha enquanto a página rola.
 */
@Component({
  selector: 'app-volume-knob',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.aberto]': 'open()' },
  template: `
    <button
      #knob
      type="button"
      class="botao tocavel"
      [attr.popovertarget]="panelId"
      [attr.aria-label]="'Volume: ' + percent() + '%'"
      [title]="'Volume: ' + percent() + '%'"
      (click)="$event.stopPropagation()"
    >
      <span class="face"><ng-container *ngTemplateOutlet="falante" /></span>
    </button>
    <div
      #panel
      class="folha"
      popover="auto"
      [id]="panelId"
      role="group"
      aria-label="Volume do site"
      [class.posta]="placed()"
      (beforetoggle)="placed.set(false)"
      (toggle)="onToggle($event)"
      (click)="$event.stopPropagation()"
      (pointerdown)="$event.stopPropagation()"
      (keydown)="$event.stopPropagation()"
    >
      <span class="fita" aria-hidden="true"></span>
      <span class="cabeca">
        <span class="titulo">Volume</span>
        <span class="numero" aria-hidden="true">{{ percent() }}%</span>
      </span>
      <span class="linha">
        <button type="button" class="calar" [attr.aria-label]="muted() ? 'Voltar o som' : 'Calar'" [attr.aria-pressed]="muted()" (click)="mute()">
          <ng-container *ngTemplateOutlet="falante" />
        </button>
        <input
          class="nivel"
          type="range"
          min="0"
          max="100"
          step="1"
          [value]="percent()"
          [style.--p]="percent() / 100"
          aria-label="Volume de todo som do site"
          [attr.aria-valuetext]="percent() + '%'"
          (input)="slide($event)"
          (change)="settle()"
        />
      </span>
      <span class="nota">Vale para todo som do site, neste aparelho.</span>
    </div>

    <!-- o alto-falante a tinta: a caixa cheia e as ondas a pena. O desenho inteiro (caixa e ondas)
         fica no meio do quadro, e as ondas não somem: no baixo, a de fora fica clarinha; calado, um
         X no lugar delas. Assim ele não pula de lado quando o volume muda -->
    <ng-template #falante>
      <svg class="falante" viewBox="0 0 24 24" aria-hidden="true">
        <path
          class="caixa"
          d="M3.5 9.5L7.2 9.2L11.7 5.2C12.2 4.8 12.6 5 12.6 5.6L12.4 18.5C12.4 19.2 12 19.3 11.5 18.9L7.2 15L3.6 14.7C3.2 14.7 3.1 14.4 3.1 14L3.1 10C3.1 9.7 3.2 9.5 3.5 9.5Z"
        />
        @switch (level()) {
          @case ('mudo') {
            <path class="pena" d="M15.3 8.9L20.2 15.1M20.2 8.9L15.3 15.1" />
          }
          @default {
            <path class="pena" d="M15.3 9.1C16.9 10.9 17 13.2 15.4 15.1" />
            <path class="pena" [class.fraca]="level() === 'baixo'" d="M17.9 6.4C21 9.7 21.1 14.4 18.1 17.8" />
          }
        }
      </svg>
    </ng-template>
  `,
  styles: `
    @use 'broche';

    /* escondido até o mouse chegar na peça (ou o foco, no botão) */
    :host {
      display: block;
      width: 30px;
      height: 30px;
      @include broche.escondido;
    }
    :host-context(.som:hover),
    :host(:focus-within),
    :host(.aberto) {
      @include broche.a-mostra;
    }
    /* sem mouse (só o toque): o volume é o dos botões do aparelho */
    @media (hover: none) {
      :host {
        display: none;
      }
    }
    button {
      -webkit-tap-highlight-color: transparent;
    }

    /* ===== O broche: lata redonda com a estampa creme sob a cúpula, como os do topo (ui/_broche.scss) ===== */
    .botao {
      @include broche.lata;
    }
    /* 18 de 30: a mesma folga dos dois lados, em pixel inteiro (com 17, o navegador arredonda o meio
       pixel e o desenho escorrega para baixo e para a direita). E meio pixel acima do meio: a sombra da
       cúpula pesa embaixo, e o meio que o olho vê no broche fica mais alto que o da conta */
    .face .falante {
      width: 18px;
      height: 18px;
      translate: 0 -0.5px;
    }
    /* aberto: o aro do broche fica amarelo, a cor de estado (como os do topo) */
    :host(.aberto) .face {
      @include broche.aro-aceso;
    }

    /* o desenho: a caixa cheia de tinta, as ondas a pena, de ponta redonda */
    .falante {
      display: block;
      overflow: visible;
    }
    .caixa {
      fill: currentColor;
      stroke: currentColor;
      stroke-width: 0.9;
      stroke-linejoin: round;
    }
    .pena {
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: opacity var(--t-ui) var(--ease-ui);
    }
    .pena.fraca {
      opacity: 0.25;
    }

    /* ===== A tira do volume: papel branco preso com um pedaço de fita crepe ===== */
    .folha {
      position: fixed;
      inset: auto;
      margin: 0;
      box-sizing: border-box;
      width: 224px;
      padding: 14px 14px 11px;
      overflow: visible;
      border: 0;
      border-radius: 2px;
      background:
        repeating-linear-gradient(94deg, rgb(0 0 0 / 0.018) 0 1px, transparent 1px 4px),
        #fbfaf6;
      color: #151515;
      font-size: 16px;
      line-height: 1.2;
      text-align: left;
      white-space: normal;
      rotate: -0.8deg;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.3),
        0 8px 18px -6px rgb(0 0 0 / 0.42);
      /* dentro da ficha, o texto deixa o toque passar: a tira, não */
      pointer-events: auto;
    }
    .folha:popover-open {
      display: grid;
      gap: 6px;
    }
    /* aberta e ainda sem lugar (o aviso de aberta chega um instante depois): não aparece no canto */
    .folha:popover-open:not(.posta) {
      visibility: hidden;
    }
    .folha.posta {
      animation: tira-chega 200ms var(--ease-ui);
    }
    @keyframes tira-chega {
      from {
        opacity: 0;
        translate: 0 -4px;
      }
    }
    .fita {
      position: absolute;
      top: -9px;
      left: 50%;
      width: 58px;
      height: 18px;
      translate: -50% 0;
      rotate: 3deg;
      background: rgb(222 205 160 / 0.86);
      clip-path: polygon(2% 8%, 98% 0, 100% 92%, 0 100%);
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.08);
    }
    .cabeca {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }
    .titulo {
      font-family: var(--f-hand);
      font-size: 1.15rem;
      line-height: 1;
    }
    .numero {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.95rem;
      letter-spacing: 0.02em;
      font-variant-numeric: tabular-nums;
    }
    .linha {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 10px;
    }
    .calar {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 2px solid #151515;
      border-radius: 50%;
      background: transparent;
      color: #151515;
      cursor: pointer;
      transition:
        background var(--t-ui) var(--ease-ui),
        color var(--t-ui) var(--ease-ui);
    }
    .calar .falante {
      width: 18px;
      height: 18px;
    }
    .calar:hover,
    .calar[aria-pressed='true'] {
      background: #151515;
      color: #fbfaf6;
    }
    .calar:focus-visible {
      outline: 3px solid var(--hi);
      outline-offset: 2px;
    }
    .nota {
      font-family: var(--f-ui);
      font-size: 0.74rem;
      line-height: 1.3;
      color: rgb(21 21 21 / 0.72);
    }

    /* a barra: o mesmo risco de tinta da barra de arrastar da faixa */
    .nivel {
      appearance: none;
      -webkit-appearance: none;
      display: block;
      width: 100%;
      height: 28px;
      margin: 0;
      padding: 0;
      background: transparent;
      color: #151515;
      cursor: pointer;
    }
    .nivel::-webkit-slider-runnable-track {
      height: 4px;
      border-radius: 2px;
      background: linear-gradient(to right, #151515 calc(var(--p) * 100%), rgb(21 21 21 / 0.2) 0);
    }
    .nivel::-moz-range-track {
      height: 4px;
      border-radius: 2px;
      background: rgb(21 21 21 / 0.2);
    }
    .nivel::-moz-range-progress {
      height: 4px;
      border-radius: 2px;
      background: #151515;
    }
    .nivel::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      margin-top: -6px;
      border: 0;
      border-radius: 50%;
      background: #151515;
      transition: scale var(--t-ui) var(--ease-ui);
    }
    .nivel::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border: 0;
      border-radius: 50%;
      background: #151515;
      transition: scale var(--t-ui) var(--ease-ui);
    }
    .nivel:hover::-webkit-slider-thumb,
    .nivel:active::-webkit-slider-thumb {
      scale: 1.2;
    }
    .nivel:hover::-moz-range-thumb,
    .nivel:active::-moz-range-thumb {
      scale: 1.2;
    }
    .nivel:focus-visible {
      outline: 3px solid var(--hi);
      outline-offset: 2px;
      border-radius: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      :host,
      :host-context(.som:hover),
      :host(:focus-within),
      :host(.aberto) {
        scale: 1;
        transition: opacity 120ms linear;
      }
      .folha.posta {
        animation: none;
      }
    }
  `,
})
export class VolumeKnob {
  protected readonly panelId = `volume-${++uid}`;
  protected readonly open = signal(false);
  /** A tira aberta já foi posta no lugar, junto do botão. */
  protected readonly placed = signal(false);
  protected readonly percent = computed(() => Math.round(soundVolume() * 100));
  protected readonly muted = computed(() => soundVolume() === 0);
  /** O desenho do alto-falante: calado (um X), baixo (a onda de fora clarinha) ou alto. */
  protected readonly level = computed(() => (this.muted() ? 'mudo' : soundVolume() < 0.5 ? 'baixo' : 'alto'));

  private readonly knob = viewChild.required<ElementRef<HTMLButtonElement>>('knob');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private frame = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.follow(false));
  }

  protected slide(e: Event): void {
    setSoundVolume(Number((e.target as HTMLInputElement).value) / 100);
  }

  protected settle(): void {
    settleSoundVolume();
  }

  protected mute(): void {
    toggleMute();
  }

  protected onToggle(e: Event): void {
    const open = (e as ToggleEvent).newState === 'open';
    this.open.set(open);
    if (open) this.place();
    this.placed.set(open);
    this.follow(open);
  }

  /** Embaixo do botão, alinhada pela direita dele; sem lugar embaixo, em cima. Sempre dentro da tela. */
  private place(): void {
    const b = this.knob().nativeElement.getBoundingClientRect();
    const panel = this.panel().nativeElement;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const gap = 12;
    const edge = 8;
    const below = b.bottom + gap;
    const top = below + h <= innerHeight - edge || b.top - gap - h < edge ? below : b.top - gap - h;
    const left = Math.min(Math.max(edge, b.right - w), innerWidth - w - edge);
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  }

  private readonly onMove = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.open()) this.place();
    });
  };

  private follow(on: boolean): void {
    if (on) {
      window.addEventListener('scroll', this.onMove, { capture: true, passive: true });
      window.addEventListener('resize', this.onMove);
    } else {
      window.removeEventListener('scroll', this.onMove, { capture: true });
      window.removeEventListener('resize', this.onMove);
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }
}
