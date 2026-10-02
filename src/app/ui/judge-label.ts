import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { VERDICT_LABEL, Verdict, formatScore } from '../core/review';
import { BRILHO_PATH } from './brilho';
import { VERDICT_ICON } from './verdict';

const ICON_SIZE = { card: 19, compact: 16, big: 23 } as const;
/** Sozinho no canhoto, sem a palavra, o ícone cresce para segurar o espaço. */
const ICON_ONLY_SIZE = { card: 24, compact: 20, big: 28 } as const;

/**
 * O julgamento: etiqueta adesiva dupla, destacável no picote. À esquerda, a Média impressa em papel
 * branco; à direita, o veredito numa faixa de tinta preta. As duas metades têm a mesma altura e o
 * mesmo peso, unidas por um picote com entalhes. É a mesma etiqueta na ficha do mural e na leitura.
 */
@Component({
  selector: 'app-judge-label',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'size()', '[class.fit]': 'fit()', '[class.so-icone]': 'iconOnly()' },
  template: `
    <p
      class="grade"
      role="img"
      [attr.aria-label]="masked() ? 'Média escondida' : 'Média ' + grade().text + ' de 10'"
      [class.metal]="grade().metal"
      [class.tarja-rasgada]="grade().ruim"
      [class.mancha-cafe]="grade().cafe"
      [class.split]="!!verdict() || masked()"
    >
      @if (grade().brilho) {
        @for (b of brilhos; track b) {
          <!-- o desenho vai dentro de um span: piscando, o span gira e encolhe no compositor; o próprio svg não pode -->
          <span class="brilho" [class]="b" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path class="halo largo" [attr.d]="brilhoPath" /><path class="halo" [attr.d]="brilhoPath" /><path fill="currentColor" [attr.d]="brilhoPath" /></svg>
          </span>
        }
      }
      <span class="int" [class.metal-nota]="grade().metal" aria-hidden="true">{{ grade().int }}</span>
      @if (grade().dec) {
        <span class="dec" [class.metal-nota]="grade().metal" aria-hidden="true">,{{ grade().dec }}</span>
      }
    </p>
    @if (masked()) {
      <!-- sem spoilers: o canhoto preto de sempre, com uma interrogação no lugar do veredito -->
      <p class="band misterio" role="img" aria-label="Veredito escondido">
        <span class="palavra" aria-hidden="true">?</span>
      </p>
    } @else if (verdict(); as v) {
      <p
        class="band"
        [class.gold]="v === 'masterpiece'"
        [class.tarja-rasgada]="v === 'chato'"
        [class.rasgo-direita]="v === 'chato'"
        role="img" [attr.aria-label]="'Veredito: ' + verdictLabels[v]" [style.--v]="'var(--verdict-' + v + '-lit)'">
        <lucide-icon [img]="verdictIcons[v]" [size]="iconSize()" [strokeWidth]="2.6" aria-hidden="true" />
        <span class="palavra" aria-hidden="true">{{ verdictLabels[v] }}</span>
      </p>
    }
  `,
  styles: `
    :host {
      --notch: 5px;
      display: flex;
      align-items: stretch;
      min-height: 58px;
      /* sombra que segue o recorte dos entalhes, colada no papel */
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 5px 6px rgb(0 0 0 / 0.22));
      /* colada meio torta, ao contrário da ficha */
      rotate: calc(var(--tilt, 0) * -0.5deg - 1deg);
    }
    .grade {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 76px;
      padding: 4px 14px 3px 13px;
      border-radius: 3px;
      background: var(--paper);
      color: var(--ink);
      font-family: var(--f-label);
      font-style: italic;
      font-weight: 800;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .int {
      font-size: 2.9rem;
      letter-spacing: -0.03em;
    }
    .dec {
      font-size: 1.9rem;
      letter-spacing: -0.02em;
      /* a vírgula e a casa decimal no mesmo pé do inteiro, só menores */
      align-self: flex-end;
      margin-bottom: 0.2em;
    }
    /* 9 ou mais: o papel continua branco, e o número vira metal (o material vem de .metal-nota,
       no styles.scss), com os mesmos brilhos do 8 */
    /* de 4 a 4,9: a mancha de café vem de .mancha-cafe (styles.scss), por baixo da tinta */
    .grade.mancha-cafe {
      background: var(--mancha-cafe) center / cover no-repeat, var(--paper);
    }
    /* 8 ou mais: brilhos piscando nos cantos, fora do caminho do número. No holográfico eles
       ficam brancos, que acendem sobre o arco-íris; no papel, dourados. */
    .brilho.b1 {
      top: 3px;
      right: 7px;
    }
    .brilho.b2 {
      bottom: 3px;
      left: 4px;
      --brilho: 12px;
      --brilho-delay: 0.8s;
    }
    .brilho.b3 {
      top: 4px;
      left: 6px;
      --brilho: 10px;
      --brilho-delay: 1.6s;
    }
    :host(.compact) .brilho {
      --brilho: 12px;
    }
    :host(.compact) .brilho.b1 {
      top: 2px;
      right: 4px;
    }
    :host(.compact) .brilho.b2,
    :host(.compact) .brilho.b3 {
      --brilho: 9px;
    }
    :host(.big) .brilho {
      --brilho: 20px;
    }
    :host(.big) .brilho.b2,
    :host(.big) .brilho.b3 {
      --brilho: 14px;
    }
    /* abaixo de 2: nota vermelha numa etiqueta preta com a borda de fora arrancada (o material vem
       de .tarja-rasgada, no styles.scss). O rasgo come a beira, então o número anda um pouco para
       dentro, para ficar no meio do que sobrou. */
    .grade.tarja-rasgada {
      --rasgo-w: 24px;
      background: transparent;
      color: var(--nota-vermelha);
      padding-left: 16px;
    }
    .band {
      position: relative;
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 0 18px 0 17px;
      border-radius: 0 3px 3px 0;
      /* picote: a linha pontilhada onde o canhoto se destaca */
      border-left: 2px dotted rgb(255 255 255 / 0.5);
      /* uma tinta só, a do pincel: preto assenta em qualquer uma das seis cartolinas */
      background: var(--ink);
      color: var(--paper);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1.02rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      line-height: 1;
      white-space: nowrap;
      mask:
        radial-gradient(circle at 0 0, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) top / 100% 51% no-repeat,
        radial-gradient(circle at 0 100%, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) bottom / 100% 51% no-repeat;
    }
    /* Chato: o canhoto preto com a borda de fora arrancada, como a Média que reprova (o rasgo vem
       de .tarja-rasgada, no styles.scss, virado para a direita). A palavra anda um pouco para
       dentro, para ficar no meio do que sobrou. */
    .band.tarja-rasgada {
      --rasgo-w: 16px;
      background: transparent;
      color: var(--paper);
      padding-right: 26px;
      border-radius: 0;
    }
    :host(.so-icone) .band.tarja-rasgada {
      padding-right: 28px;
    }
    :host(.compact) .band.tarja-rasgada {
      --rasgo-w: 12px;
      padding-right: 18px;
    }
    :host(.compact.so-icone) .band.tarja-rasgada {
      padding-right: 20px;
    }
    :host(.big) .band.tarja-rasgada {
      --rasgo-w: 20px;
      padding-right: 34px;
    }
    /* Masterpiece: o mesmo canhoto preto, com a palavra e o fio da moldura estampados a quente
       em folha de ouro. O brilho corre pela folha quando a ficha levanta, como no Platinado. */
    .band.gold {
      border-left-color: rgb(243 210 122 / 0.55);
      transition: --shine 900ms var(--ease-physical);
    }
    .band.gold::after {
      content: '';
      position: absolute;
      inset: 4px 4px 4px 5px;
      border: 1.5px solid #d8ab48;
      border-radius: 2px;
      pointer-events: none;
    }
    .band.gold span {
      background:
        linear-gradient(115deg, transparent 25%, rgb(255 255 255 / 0.95) 45%, transparent 60%) calc(var(--shine) * 1.6 - 60%) 0 / 220% 100% no-repeat,
        linear-gradient(100deg, #d8ab48 0%, #f7dc8a 30%, #fff4c4 45%, #e3b857 65%, #f3d27a 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .band.misterio {
      justify-content: center;
      min-width: 52px;
      font-size: 2rem;
      font-style: italic;
      letter-spacing: 0;
    }
    :host(.compact) .band.misterio {
      min-width: 40px;
      font-size: 1.6rem;
    }
    :host(.big) .band.misterio {
      min-width: 64px;
      font-size: 2.6rem;
    }
    .band lucide-icon {
      display: inline-flex;
      margin-top: -1px;
      color: var(--v);
    }
    /* Na ficha, a etiqueta ocupa a largura que tem (para saber quanto cabe) e fica encostada à
       esquerda; quando a palavra do veredito não cabe, o canhoto fica só com o ícone. A palavra
       continua no lugar, invisível, para a etiqueta poder medir de novo quando a janela crescer. */
    :host(.fit) {
      width: 100%;
      /* gira em volta da própria etiqueta, não do meio da coluna */
      transform-origin: 90px 50%;
    }
    :host(.so-icone) .band .palavra {
      position: absolute;
      visibility: hidden;
    }
    :host(.so-icone) .band {
      padding: 0 20px 0 19px;
    }
    :host(.compact.so-icone) .band {
      padding: 0 14px 0 13px;
    }
    /* os entalhes de ticket, em cima e embaixo, onde as duas metades se encontram */
    .grade.split {
      border-radius: 3px 0 0 3px;
      mask:
        radial-gradient(circle at 100% 0, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) top / 100% 51% no-repeat,
        radial-gradient(circle at 100% 100%, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) bottom / 100% 51% no-repeat;
    }

    /* ===== Ficha simples: a etiqueta cabe ao lado da foto ===== */
    :host(.compact) {
      --notch: 4px;
      min-height: 42px;
    }
    :host(.compact) .grade {
      min-width: 56px;
      padding: 3px 10px 2px 9px;
    }
    :host(.compact) .grade.tarja-rasgada {
      --rasgo-w: 18px;
      padding-left: 12px;
    }
    :host(.compact) .int {
      font-size: 2.25rem;
    }
    :host(.compact) .dec {
      font-size: 1.5rem;
    }
    :host(.compact) .band {
      gap: 5px;
      padding: 0 11px 0 10px;
      font-size: 0.84rem;
      letter-spacing: 0.08em;
    }

    /* ===== Leitura: a mesma etiqueta, vista de perto ===== */
    :host(.big) {
      --notch: 6px;
      min-height: 74px;
    }
    :host(.big) .grade {
      min-width: 96px;
      padding: 5px 18px 4px 16px;
    }
    :host(.big) .grade.tarja-rasgada {
      --rasgo-w: 30px;
      padding-left: 21px;
    }
    :host(.big) .int {
      font-size: 3.7rem;
    }
    :host(.big) .dec {
      font-size: 2.4rem;
    }
    :host(.big) .band {
      gap: 9px;
      padding: 0 24px 0 21px;
      font-size: 1.3rem;
    }
    :host(.big) .band.gold::after {
      inset: 5px 5px 5px 6px;
    }
  `,
})
export class JudgeLabel {
  readonly value = input.required<number | null>();
  readonly verdict = input<Verdict | null>(null);
  readonly size = input<'card' | 'compact' | 'big'>('card');
  /** Na ficha do mural: se a palavra do veredito não couber na largura, fica só o ícone. */
  readonly fit = input(false);
  /** Sem spoilers: "?" na Média e no veredito, sempre do mesmo jeito em todas as fichas. */
  readonly masked = input(false);

  /** A palavra do veredito não cabe: o canhoto mostra só o ícone. */
  protected readonly iconOnly = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Largura da etiqueta inteira, medida com a palavra à mostra (0 = medir de novo). */
  private full = 0;

  constructor() {
    const destroy = inject(DestroyRef);
    // outro veredito ou outro tamanho: mostra a palavra e mede de novo, depois de desenhar
    effect(() => {
      this.verdict();
      this.size();
      this.fit();
      this.masked();
      untracked(() => this.remeasure());
    });
    afterNextRender(() => {
      if (!this.fit()) return;
      const ro = new ResizeObserver(() => this.measure());
      ro.observe(this.host.nativeElement);
      destroy.onDestroy(() => ro.disconnect());
      // a fonte do canhoto chegando muda a largura da palavra
      document.fonts?.ready.then(() => this.remeasure());
    });
  }

  private remeasure(): void {
    this.full = 0;
    this.iconOnly.set(false);
    requestAnimationFrame(() => this.measure());
  }

  /** Cabe a etiqueta inteira na largura da coluna? Se não, só o ícone. */
  private measure(): void {
    const el = this.host.nativeElement;
    if (!this.fit() || !this.verdict() || this.masked()) {
      this.iconOnly.set(false);
      return;
    }
    if (!this.iconOnly() || !this.full) {
      let w = 0;
      for (const child of Array.from(el.children)) w += (child as HTMLElement).offsetWidth;
      this.full = w;
    }
    this.iconOnly.set(this.full > el.clientWidth + 0.5);
  }

  /** "9,4" → inteiro 9 e decimal 4, escritos em tamanhos diferentes, o decimal menor. */
  protected readonly grade = computed(() => {
    if (this.masked()) return { text: 'escondida', int: '?', dec: '', metal: false, brilho: false, cafe: false, ruim: false };
    const v = this.value();
    const text = formatScore(v);
    const [int, dec = ''] = text.split(',');
    const n = v ?? 0;
    // 9 ou mais é número em metal, e de 8 para cima a etiqueta ganha brilhos; de 4 a 4,9, o papel
    // manchado de café; abaixo de 4 (até 3,9), nota vermelha na etiqueta preta rasgada. As notas das
    // categorias só rasgam abaixo de 2 (Boletim): a Média é mais pesada, e reprova antes.
    return {
      text,
      int,
      dec,
      metal: n >= 9,
      brilho: v !== null && n >= 8,
      cafe: v !== null && n >= 4 && n < 5,
      ruim: v !== null && n < 4,
    };
  });
  protected readonly iconSize = computed(() => (this.iconOnly() ? ICON_ONLY_SIZE : ICON_SIZE)[this.size()]);
  protected readonly verdictLabels = VERDICT_LABEL;
  protected readonly verdictIcons = VERDICT_ICON;
  protected readonly brilhos = ['b1', 'b2', 'b3'];
  protected readonly brilhoPath = BRILHO_PATH;
}
