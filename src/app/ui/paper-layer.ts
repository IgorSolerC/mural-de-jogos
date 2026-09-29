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
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Damage, Scribble } from '../core/paper';
import { PaperArt as Art, cutMask, paperArt } from '../core/paper-art';

let uids = 0;

/**
 * Os filtros do lápis, da fibra, das manchas, da fumaça e da brasa, uma vez só na página: os
 * desenhos de todas as fichas apontam para eles (`url(#papel-lapis)`).
 */
@Component({
  selector: 'app-paper-defs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg width="0" height="0" focusable="false">
      <!-- grafite: o traço treme um pouco e o papel aparece entre os grãos -->
      <filter id="papel-lapis" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="3" result="g" />
        <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.2 1.45" result="ga" />
        <feComposite in="d" in2="ga" operator="in" />
      </filter>
      <!-- a fibra branca da cartolina onde ela rasgou -->
      <filter id="papel-fibra" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="11" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <!-- beirada de mancha que secou: nada é redondo de verdade -->
      <filter id="papel-mancha" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="5" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="papel-agua" x="-12%" y="-12%" width="124%" height="124%">
        <feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="3" seed="9" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.5" xChannelSelector="R" yChannelSelector="G" result="b" />
        <feTurbulence type="fractalNoise" baseFrequency=".035 .09" numOctaves="3" seed="14" result="grain" />
        <feColorMatrix in="grain" type="luminanceToAlpha" result="light" />
        <feComponentTransfer in="light" result="mottle"><feFuncA type="linear" slope=".85" intercept=".55" /></feComponentTransfer>
        <feComposite in="b" in2="mottle" operator="in" result="pigment" />
        <feGaussianBlur in="pigment" stdDeviation=".8" />
      </filter>
      <filter id="papel-borra" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.8" />
      </filter>
      <!-- o chamuscado em volta do queimado: fumaça que não é redonda -->
      <filter id="papel-fumaca" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="8" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feGaussianBlur in="d" stdDeviation="5" />
      </filter>
      <filter id="papel-brasa" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation=".9" />
      </filter>
      <!-- o relevo miúdo do papel amassado, por cima das facetas -->
      <filter id="papel-relevo" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="12" />
        <feColorMatrix type="luminanceToAlpha" />
        <feDiffuseLighting surfaceScale="4" lighting-color="#fff" diffuseConstant=".64">
          <feDistantLight azimuth="225" elevation="50" />
        </feDiffuseLighting>
      </filter>
    </svg>
  `,
  styles: `
    :host {
      position: absolute;
      width: 0;
      height: 0;
      overflow: hidden;
    }
  `,
})
export class PaperDefs {}

/**
 * O papel de uma ficha, desenhado por baixo do que está nela: a cartolina (cor, textura, estampa),
 * o rabisco e o estrago. Mede a ficha e desenha tudo no tamanho dela. O estrago leva o papel e o
 * que está escrito (os elementos com `data-queima` recebem o mesmo recorte), mas não a foto nem os
 * adesivos, que foram colados depois e ficam por cima, inteiros.
 */
@Component({
  selector: 'app-paper-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    @if (art()?.core?.length) {
      <!-- o miolo da cartolina: aparece onde a cor soltou no rasgo; só o recorte do papel o corta -->
      <div class="miolo camada" [style.mask-image]="outer()" [style.-webkit-mask-image]="outer()"></div>
    }
    <div class="papel camada" [style.mask-image]="mask()" [style.-webkit-mask-image]="mask()"></div>
    @if (glitter()) {
      <div class="faisca camada" [style.mask-image]="mask()" [style.-webkit-mask-image]="mask()"></div>
    }
    @if (art(); as a) {
      @if (a.fundo) {
        <div class="camada fundo" [style.mask-image]="mask()" [style.-webkit-mask-image]="mask()" [innerHTML]="html().fundo"></div>
      }
      @if (a.clareia) {
        <div class="camada clareia" [style.mask-image]="mask()" [style.-webkit-mask-image]="mask()" [innerHTML]="html().clareia"></div>
      }
      @if (a.relevo) {
        <div class="camada relevo" [style.mask-image]="mask()" [style.-webkit-mask-image]="mask()" [innerHTML]="html().relevo"></div>
      }
      @if (a.frente) {
        <div class="camada frente" [class.por-cima]="damage() === 'orelha'" [style.mask-image]="mask()" [style.-webkit-mask-image]="mask()" [innerHTML]="html().frente"></div>
      }
      @if (a.fita) {
        <div class="camada frente" [innerHTML]="html().fita"></div>
      }
    }
  `,
  styles: `
    /* sem caixa própria: as camadas ficam na ficha, abaixo e acima da tinta dela */
    :host {
      display: contents;
    }
    .camada {
      position: absolute;
      inset: 0;
      overflow: hidden;
      border-radius: inherit;
      pointer-events: none;
      mask-size: 100% 100%;
      -webkit-mask-size: 100% 100%;
      mask-repeat: no-repeat;
      -webkit-mask-repeat: no-repeat;
    }
    .papel {
      z-index: -2;
    }
    /* o miolo da cartolina neon é quase branco: a cor fica só na superfície */
    .miolo {
      z-index: -3;
      background-color: color-mix(in oklab, var(--stock) 14%, #fbf8f0);
      background-image: var(--grao, var(--grao-img));
      background-size: var(--grao-tam);
      background-blend-mode: var(--grao-mistura);
    }
    .fundo {
      z-index: -1;
      mix-blend-mode: multiply;
      --lapis: rgb(36 34 42);
    }
    .clareia {
      z-index: -1;
    }
    /* o relevo e o estrago ficam por cima do que está escrito, e por baixo da foto e dos adesivos */
    /* overlay, não soft-light: na cartolina clara (amarelo, cinza) o soft-light quase não fazia sombra */
    .relevo {
      z-index: 2;
      mix-blend-mode: overlay;
      opacity: 0.85;
    }
    .frente {
      z-index: 2;
      overflow: visible;
    }
    /* A orelha dobra a ficha inteira, com a foto e os adesivos colados nela: a aba vem por cima de
       tudo (a ficha abaixa a foto e os adesivos para 2 quando tem orelha); a tachinha continua acima */
    .frente.por-cima {
      z-index: 3;
    }
    .camada ::ng-deep svg {
      position: absolute;
      inset: 0;
      overflow: visible;
    }
    .camada ::ng-deep .rabisco * {
      fill: none;
      stroke: var(--lapis);
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .camada ::ng-deep .rabisco .f {
      fill: var(--lapis);
      fill-opacity: 0.55;
      stroke: none;
    }
    .camada ::ng-deep .rabisco .h {
      opacity: 0.7;
    }
    /* purpurina que acende onde a luz bate, com a ficha levantada */
    .faisca {
      z-index: -1;
      background: var(--textura) 0 0 / 140px 140px;
      mix-blend-mode: screen;
      opacity: calc(var(--luz, 0) * 0.9);
      transition: opacity 600ms var(--ease-physical);
    }
  `,
})
export class PaperArtLayer {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly sanitizer = inject(DomSanitizer);

  readonly id = input.required<string>();
  readonly scribble = input<Scribble | undefined>(undefined);
  readonly damage = input<Damage | undefined>(undefined);
  /** O sorteio do estrago (Review.damageSeed). */
  readonly seed = input<number | null | undefined>(undefined);
  readonly glitter = input(false);
  /** Sem o filtro de lápis: as amostras miúdas do editor. */
  readonly plain = input(false);
  /** Muda quando o que está escrito na ficha muda: hora de medir de novo onde cada texto está. */
  readonly content = input<unknown>(null);

  private readonly uid = `pa${++uids}`;
  private readonly size = signal<{ W: number; H: number } | null>(null);

  protected readonly art = computed<Art | null>(() => {
    const s = this.size();
    if (!s || (!this.scribble() && !this.damage())) return null;
    return paperArt({ id: this.id(), W: s.W, H: s.H, scribble: this.scribble(), damage: this.damage(), seed: this.seed() ?? undefined, uid: this.uid, plain: this.plain() });
  });

  /** A máscara da cor e do que está escrito: o papel que foi embora e a faixa em que a cor soltou. */
  protected readonly mask = computed(() => {
    const a = this.art(),
      s = this.size();
    return a && s ? cutMask(a, s.W, s.H) : null;
  });
  /** A máscara do papel inteiro, para o miolo. */
  protected readonly outer = computed(() => {
    const a = this.art(),
      s = this.size();
    return a && s ? cutMask(a, s.W, s.H, 'miolo') : null;
  });

  protected readonly html = computed(() => {
    const a = this.art(),
      s = this.size();
    const wrap = (body: string): SafeHtml =>
      // só desenhos nossos e números: nada que a pessoa escreveu entra aqui
      this.sanitizer.bypassSecurityTrustHtml(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${s?.W ?? 0}" height="${s?.H ?? 0}" viewBox="0 0 ${s?.W ?? 0} ${s?.H ?? 0}">${body}</svg>`,
      );
    return {
      fundo: wrap(a?.fundo ?? ''),
      clareia: wrap(a?.clareia ?? ''),
      relevo: wrap(a?.relevo ?? ''),
      frente: wrap(a?.frente ?? ''),
      fita: wrap(a?.fita ?? ''),
    };
  });

  constructor() {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        this.measure();
        this.burnText();
      });
    };
    // o estrago mudou, ou o que está escrito mudou de lugar: o recorte dos textos acompanha
    effect(() => {
      this.mask();
      this.content();
      schedule();
    });
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const paper = this.host.parentElement;
      if (!paper) return;
      const ro = new ResizeObserver(schedule);
      ro.observe(paper);
      document.fonts?.ready.then(schedule);
      destroy.onDestroy(() => {
        ro.disconnect();
        cancelAnimationFrame(frame);
      });
    });
  }

  private measure(): void {
    const paper = this.host.parentElement;
    if (!paper) return;
    const W = paper.offsetWidth,
      H = paper.offsetHeight;
    if (!W || !H) return;
    const prev = this.size();
    if (!prev || prev.W !== W || prev.H !== H) this.size.set({ W, H });
  }

  private burnt = new Set<HTMLElement>();

  /**
   * O que está escrito queima junto com o papel: cada texto recebe o mesmo recorte, deslocado para
   * onde ele está na ficha (em px de layout, sem a inclinação). Os adesivos (o selo do 10, a fita
   * do 0, os bônus) foram colados depois e ficam inteiros: o recorte desce pelo texto e pula cada
   * um deles. Só a orelha, que dobra a ficha com tudo o que está colado, leva também a foto e os
   * adesivos (`[data-colado]`).
   */
  private burnText(): void {
    const paper = this.host.parentElement;
    if (!paper) return;
    const mask = this.mask();
    const s = this.size();
    const next = new Set<HTMLElement>();
    if (mask && s) {
      const all = this.damage() === 'orelha';
      const burn = (el: HTMLElement) => {
        if (all || !el.querySelector(STICKERS)) {
          next.add(el);
          return;
        }
        for (const child of Array.from(el.children) as HTMLElement[]) if (!child.matches(STICKERS)) burn(child);
      };
      paper.querySelectorAll<HTMLElement>('[data-queima]').forEach(burn);
      if (all) paper.querySelectorAll<HTMLElement>('[data-colado]').forEach((el) => next.add(el));
    }
    for (const el of this.burnt) if (!next.has(el)) clearMask(el);
    for (const el of next) {
      let x = 0,
        y = 0;
      for (let n: HTMLElement | null = el; n && n !== paper; n = n.offsetParent as HTMLElement | null) {
        x += n.offsetLeft;
        y += n.offsetTop;
        if (n.offsetParent === null) break;
      }
      const set = (p: string, v: string) => el.style.setProperty(p, v);
      set('mask-image', mask!);
      set('-webkit-mask-image', mask!);
      set('mask-size', `${s!.W}px ${s!.H}px`);
      set('-webkit-mask-size', `${s!.W}px ${s!.H}px`);
      set('mask-position', `${-x}px ${-y}px`);
      set('-webkit-mask-position', `${-x}px ${-y}px`);
      set('mask-repeat', 'no-repeat');
      set('-webkit-mask-repeat', 'no-repeat');
      // o que passa da caixa do elemento (o selo que sobra da casa, a sombra) não é cortado na caixa
      set('mask-clip', 'no-clip');
    }
    this.burnt = next;
  }
}

/** Os adesivos colados por cima do que está escrito: não queimam com o texto. */
const STICKERS = '[data-colado], .selo-dez, .fita-rasgada, app-bonus-tally, app-bonus-sticker';

function clearMask(el: HTMLElement): void {
  for (const p of ['mask-image', '-webkit-mask-image', 'mask-size', '-webkit-mask-size', 'mask-position', '-webkit-mask-position', 'mask-repeat', '-webkit-mask-repeat', 'mask-clip'])
    el.style.removeProperty(p);
}
