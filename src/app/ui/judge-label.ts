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
import { EyeOff, LucideAngularModule } from 'lucide-angular';
import { VERDICT_LABEL, Verdict, formatScore, shownScore } from '../core/review';
import { BRILHO_PATH } from './brilho';
import { VERDICT_ICON } from './verdict';

/**
 * A beirada rasgada à mão da etiqueta em pé: um clip-path com dentes irregulares (fundura de 0,4 a
 * 3,6px, passo de 3 a 6%), sorteados de um jeito fixo pela semente, para cada ficha ter o seu rasgo
 * e ele não mudar de um desenho para o outro. `top` rasga a beira de cima; senão, a de baixo.
 */
function tornEdge(seed: number, top: boolean): string {
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pts: string[] = [];
  for (let x = 0; x < 100; x += 3 + rnd() * 3) {
    const d = (0.4 + rnd() * 3.2).toFixed(1);
    pts.push(`${x.toFixed(1)}% ${top ? `${d}px` : `calc(100% - ${d}px)`}`);
  }
  pts.push(`100% ${top ? '1.6px' : 'calc(100% - 1.6px)'}`);
  return top ? `polygon(${pts.join(', ')}, 100% 100%, 0 100%)` : `polygon(0 0, 100% 0, ${pts.reverse().join(', ')})`;
}

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
  host: { '[class]': 'size()', '[class.fit]': 'fit()', '[class.so-icone]': 'iconOnly()', '[class.stack]': 'stack()' },
  template: `
    <p
      class="grade"
      role="img"
      [attr.aria-label]="masked() ? 'Média escondida' : 'Média ' + grade().text + ' de 10'"
      [class.metal]="grade().metal"
      [class.tarja-rasgada]="grade().ruim"
      [class.mancha-cafe]="grade().cafe"
      [class.split]="!!verdict() || masked()"
      [style.clip-path]="stack() ? torn().top : null"
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
      <!-- sem spoilers: o canhoto preto de sempre, com "Segredo" no lugar do veredito, do mesmo tamanho -->
      <p class="band misterio" role="img" aria-label="Veredito escondido" [style.clip-path]="stack() ? torn().bottom : null">
        <lucide-icon [img]="secretIcon" [size]="iconSize()" [strokeWidth]="2.6" aria-hidden="true" />
        <span class="palavra" aria-hidden="true">Segredo</span>
      </p>
    } @else if (verdict(); as v) {
      <p
        class="band"
        [class.gold]="v === 'masterpiece'"
        [class.tarja-rasgada]="v === 'chato'"
        [class.rasgo-direita]="v === 'chato'"
        role="img" [attr.aria-label]="'Veredito: ' + verdictLabels[v]" [style.--v]="'var(--verdict-' + v + '-lit)'"
        [style.clip-path]="stack() ? torn().bottom : null">
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
        var(--foil-gold-word);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    /* o ícone do segredo na cor do papel, sem a cor de nenhum veredito */
    .band.misterio {
      --v: var(--paper);
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

    /* ===== Ficha de música: a etiqueta em pé, a Média em cima e o canhoto embaixo =====
       O lugar ao lado do vinil é estreito: deitada, a etiqueta só cabia com o ícone. Em pé, as
       duas metades têm a mesma largura (a da maior), e as beiradas de fora, a de cima e a de baixo,
       ficam rasgadas à mão (o clip-path vem de tornEdge, um rasgo por ficha). Entre elas, o picote
       de ingresso de show: os entalhes nas laterais e uma fileira de furinhos de verdade, meio na
       Média, meio no canhoto, por onde a cartolina aparece. */
    :host(.stack) {
      --furo: 1.5px;
      --passo: 6px;
      /* a altura vem de fora (a da fileira do vinil, com align-self: stretch) e não de dentro: as
         metades medem metade dela (cqb), até os 42px de sempre. No vinil da ficha mais estreita,
         mais baixo que 84px, o ingresso encolhe para caber ao lado dele */
      container-type: size;
      align-content: center;
      display: grid;
      /* um Meh não deixa o ingresso magrinho: todos têm pelo menos a largura de um Recomendo */
      grid-template-columns: minmax(128px, max-content);
      justify-content: start;
      min-height: 0;
    }
    :host(.stack.fit) {
      transform-origin: 70px 50%;
    }
    /* as duas metades com a mesma altura, como na etiqueta deitada: o número diminui para caber */
    :host(.stack) .grade,
    :host(.stack) .band {
      height: clamp(34px, 50cqb, 42px);
    }
    :host(.stack) .grade {
      padding: 3px 16px 0;
      border-radius: 0;
    }
    :host(.stack) .int {
      font-size: min(2.15rem, 41cqb);
    }
    :host(.stack) .dec {
      font-size: min(1.45rem, 27.6cqb);
      margin-bottom: 0.16em;
    }
    :host(.stack) .brilho {
      --brilho: 12px;
    }
    :host(.stack) .brilho.b2,
    :host(.stack) .brilho.b3 {
      --brilho: 9px;
    }
    :host(.stack) .grade.split {
      mask:
        radial-gradient(circle at 50% 100%, #0000 var(--furo), #000 calc(var(--furo) + 0.5px)) 50% 0 / var(--passo) 100% repeat-x,
        radial-gradient(circle at 0 100%, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) left / 51% 100% no-repeat,
        radial-gradient(circle at 100% 100%, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) right / 51% 100% no-repeat;
      mask-composite: intersect, add, add;
    }
    :host(.stack) .band {
      justify-content: center;
      padding: 0 14px 2px;
      border-radius: 0;
      border-left: 0;
      font-size: 0.92rem;
      mask:
        radial-gradient(circle at 50% 0, #0000 var(--furo), #000 calc(var(--furo) + 0.5px)) 50% 0 / var(--passo) 100% repeat-x,
        radial-gradient(circle at 0 0, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) left / 51% 100% no-repeat,
        radial-gradient(circle at 100% 0, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) right / 51% 100% no-repeat;
      mask-composite: intersect, add, add;
    }
    :host(.stack) .band.gold::after {
      inset: 5px 4px 6px;
    }
    :host(.stack) .band.tarja-rasgada {
      padding-right: 22px;
    }
    :host(.stack.so-icone) .band {
      padding: 1px 14px 3px;
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
  /** Em pé: a Média em cima e o canhoto embaixo (a ficha de música, ao lado do vinil). */
  readonly stack = input(false);

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
      this.stack();
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
    if (!this.fit() || (!this.verdict() && !this.masked())) {
      this.iconOnly.set(false);
      return;
    }
    if (!this.iconOnly() || !this.full) {
      // deitada, as metades somam; em pé, vale a mais larga
      const widths = Array.from(el.children, (child) => (child as HTMLElement).offsetWidth);
      this.full = this.stack() ? Math.max(0, ...widths) : widths.reduce((a, b) => a + b, 0);
    }
    this.iconOnly.set(this.full > el.clientWidth + 0.5);
  }

  /** "9,4" → inteiro 9 e decimal 4, escritos em tamanhos diferentes, o decimal menor. */
  protected readonly grade = computed(() => {
    if (this.masked()) return { text: 'escondida', int: '?', dec: '', metal: false, brilho: false, cafe: false, ruim: false };
    const v = this.value();
    const text = formatScore(v);
    const [int, dec = ''] = text.split(',');
    // as faixas seguem a nota que aparece: um 8,8 escrito "9" também é de metal
    const n = v === null ? 0 : shownScore(v);
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
  /** Os rasgos de cima e de baixo da etiqueta em pé, sorteados pela nota e pelo veredito. */
  protected readonly torn = computed(() => {
    const seed = Math.round((this.value() ?? 0) * 10) * 7 + (this.verdict()?.length ?? 0);
    return { top: tornEdge(seed, true), bottom: tornEdge(seed + 101, false) };
  });
  protected readonly iconSize = computed(() => (this.iconOnly() ? ICON_ONLY_SIZE : ICON_SIZE)[this.size()]);
  protected readonly verdictLabels = VERDICT_LABEL;
  protected readonly verdictIcons = VERDICT_ICON;
  protected readonly secretIcon = EyeOff;
  protected readonly brilhos = ['b1', 'b2', 'b3'];
  protected readonly brilhoPath = BRILHO_PATH;
}
