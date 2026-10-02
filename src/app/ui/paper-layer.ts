import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Damage, Decor, Scribble, Stain } from '../core/paper';
import { decorArt } from '../core/decor-art';
import { PaperArt as Art, cutMask, paperArt } from '../core/paper-art';
import { isVeiled, reveal, veil } from './veil';

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
      <!-- o calor tinge a fibra; faixas contínuas de fuligem escurecem o próprio contorno -->
      <filter id="papel-tostado" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".055" numOctaves="3" seed="8" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feTurbulence type="fractalNoise" baseFrequency=".12" numOctaves="3" seed="27" result="grain" />
        <feColorMatrix in="grain" type="luminanceToAlpha" result="light" />
        <feComponentTransfer in="light" result="mottle"><feFuncA type="linear" slope="1.2" intercept=".35" /></feComponentTransfer>
        <feComposite in="d" in2="mottle" operator="in" result="pigment" />
        <feGaussianBlur in="pigment" stdDeviation="8" />
      </filter>
      <filter id="papel-tostado-pequeno" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="3" seed="8" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.5" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feGaussianBlur in="d" stdDeviation="4" />
      </filter>
      <filter id="papel-fuligem-larga" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="5.5" />
      </filter>
      <filter id="papel-fuligem-estreita" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="2.8" />
      </filter>
      <filter id="papel-fuligem-larga-pequena" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="2.5" />
      </filter>
      <filter id="papel-fuligem-estreita-pequena" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="1.4" />
      </filter>
      <filter id="papel-borda-queimada" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="1" />
      </filter>
      <!-- o relevo miúdo do papel amassado, por cima das facetas -->
      <filter id="papel-relevo" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="12" />
        <feColorMatrix type="luminanceToAlpha" />
        <feDiffuseLighting surfaceScale="4" lighting-color="#fff" diffuseConstant=".64">
          <feDistantLight azimuth="225" elevation="50" />
        </feDiffuseLighting>
      </filter>
      <!-- a sombra curta da linha de costura, das linguetas e da fita crepe -->
      <filter id="papel-fio" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation=".7" />
      </filter>
      <!-- terra seca de sola: falha em grãos e pega mais onde o pé pesou -->
      <filter id="papel-poeira" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="17" result="grao" />
        <feColorMatrix in="grao" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 2" result="poeira" />
        <feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="3" seed="31" result="peso" />
        <feColorMatrix in="peso" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.6 -.75" result="pisada" />
        <feComposite in="SourceGraphic" in2="poeira" operator="in" result="p" />
        <feComposite in="p" in2="pisada" operator="in" />
      </filter>
      <!-- lama de pata: a beirada borrada e o miolo salpicado -->
      <filter id="papel-lama" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="2" seed="23" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="4" result="g" />
        <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.55" result="ga" />
        <feComposite in="d" in2="ga" operator="in" />
      </filter>
      <!-- a trama neotribal: os fios finos que se cruzam fundem em membranas, como tinta que escorreu -->
      <filter id="papel-teia" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.1" result="b" />
        <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 14 -4.6" />
      </filter>
      <!-- o mofo é felpudo: a beirada vira pelinhos -->
      <filter id="papel-mofo" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".35" numOctaves="3" seed="19" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feGaussianBlur in="d" stdDeviation=".5" />
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
        <div class="camada fundo" [class.sem-lapis]="!!lapisHtml()" [style.mask-image]="mask()" [style.-webkit-mask-image]="mask()" [innerHTML]="html().fundo"></div>
      }
      @if (lapisHtml(); as l) {
        <!-- na cartolina escura o rabisco é de lápis claro: clareia o papel em vez de escurecer -->
        <div class="camada fundo lapis" [style.mask-image]="mask()" [style.-webkit-mask-image]="mask()" [innerHTML]="l"></div>
      }
      @if (a.clareia) {
        <div class="camada clareia" [style.mask-image]="mask()" [style.-webkit-mask-image]="mask()" [innerHTML]="html().clareia"></div>
      }
      @if (a.relevo) {
        <div class="camada relevo" [style.mask-image]="mask()" [style.-webkit-mask-image]="mask()" [innerHTML]="html().relevo"></div>
      }
      @if (a.frente) {
        <div class="camada frente" [class.por-cima]="damage() === 'orelha'" [style.mask-image]="burnDamage() ? burnMask() : mask()" [style.-webkit-mask-image]="burnDamage() ? burnMask() : mask()" [innerHTML]="html().frente"></div>
      }
      @if (a.fita) {
        <div class="camada frente" [innerHTML]="html().fita"></div>
      }
      @if (a.topo) {
        <!-- o que caiu na ficha depois de pronta (a gosma): por cima de tudo, até da foto e da nota -->
        <div class="camada topo" [style.mask-image]="mask()" [style.-webkit-mask-image]="mask()" [innerHTML]="html().topo"></div>
      }
    }
    @if (decorHtml(); as d) {
      @if (d.under) {
        <!-- o que foi jogado na ficha (a purpurina, o confete): por cima do texto, por baixo da foto e da nota -->
        <div class="camada enfeite por-baixo" [innerHTML]="d.under"></div>
      }
      @if (d.front) {
        <!-- a decoração: por cima de tudo, até da foto e dos adesivos, e pode passar da beirada -->
        <div class="camada enfeite" [innerHTML]="d.front"></div>
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
    /* o lápis claro, sozinho numa camada que clareia; o do fundo (que multiplica) fica escondido */
    .fundo.lapis {
      mix-blend-mode: screen;
      --lapis: rgb(240 235 226);
    }
    .fundo.sem-lapis ::ng-deep .rabisco {
      display: none;
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
    /* a gosma: acima da foto e da nota (3), como a decoração; abaixo do botão invisível da ficha */
    .topo {
      z-index: 4;
    }
    /* acima da foto (3), abaixo do botão invisível da ficha (4, que vem depois) */
    .enfeite {
      z-index: 4;
      overflow: visible;
    }
    /* acima do texto e do estrago (2), abaixo da foto, da nota e dos adesivos de bônus (3) */
    .enfeite.por-baixo {
      z-index: 2;
    }
    /* as decorações ficam paradas, como coisa de papel: nada pisca nem rola (as faíscas da purpurina
       ainda levam a classe pisca, sem animação) */
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
  /** A mancha por cima do papel (Review.stain) e o sorteio dela. */
  readonly stain = input<Stain | undefined>(undefined);
  readonly stainSeed = input<number | null | undefined>(undefined);
  /** A decoração por cima de tudo (Review.decor) e o sorteio dela. */
  readonly decor = input<Decor | undefined>(undefined);
  readonly decorSeed = input<number | null | undefined>(undefined);
  /** O sorteio do rabisco (Review.scribbleSeed). */
  readonly scribbleSeed = input<number | null | undefined>(undefined);
  /** A força do lápis do rabisco (Review.scribbleInk). */
  readonly scribbleInk = input<number | null | undefined>(undefined);
  readonly glitter = input(false);
  /** Sem o filtro de lápis: as amostras miúdas do editor. */
  readonly plain = input(false);
  /** Cartolina escura: o rabisco sai em lápis claro. */
  readonly dark = input(false);
  /** Muda quando o que está escrito na ficha muda: hora de medir de novo onde cada texto está. */
  readonly content = input<unknown>(null);

  protected readonly burnDamage = computed(() => this.damage() === 'furado' || this.damage() === 'queimado');

  private readonly uid = `pa${++uids}`;
  /**
   * Os últimos desenhos feitos, pelo que entrou neles: trocar o tipo de ficha e voltar não desenha o
   * papel de novo (o desenho só depende das entradas, e é sempre o mesmo para as mesmas entradas).
   */
  private readonly drawn = new Map<string, unknown>();
  private memo<A, R>(kind: string, draw: (a: A) => R, a: A): R {
    const key = `${kind}|${JSON.stringify(a)}`;
    if (this.drawn.has(key)) return this.drawn.get(key) as R;
    const out = draw(a);
    this.drawn.set(key, out);
    if (this.drawn.size > 9) this.drawn.delete(this.drawn.keys().next().value!);
    return out;
  }
  /**
   * O tamanho em que o papel está desenhado. Só a fila do papel muda (ver `drawAt`), quando chega a
   * vez desta ficha; até lá o desenho fica no tamanho antigo, com a ficha escondida (ver veil.ts).
   * O desenho continua com a ficha longe da tela: voltar a ela não desenha de novo.
   */
  private readonly size = signal<Size | null>(null);
  /** Tem algo desenhado no papel (rabisco, estrago, mancha, decoração): mudar de tamanho custa. */
  readonly needsArt = computed(() => !!(this.scribble() || this.damage() || this.stain() || this.decor()));
  /** A ficha (o elemento em volta do papel), conhecida depois da primeira renderização. */
  card: HTMLElement | null = null;
  /**
   * A ficha some até o papel ficar pronto e entra com fade. A prévia no editor não: lá o papel muda
   * a cada clique e precisa responder na hora.
   */
  veils = false;

  /** A decoração, desenhada à parte: os furos dela entram no recorte do papel. */
  private readonly decorDrawing = computed(() => {
    const s = this.size(),
      d = this.decor();
    return s && d ? this.memo('decor', decorArt, { id: this.id(), W: s.W, H: s.H, decor: d, seed: this.decorSeed() ?? undefined, uid: this.uid }) : null;
  });

  protected readonly art = computed<Art | null>(() => {
    const s = this.size();
    const holes = this.decorDrawing()?.cut ?? [];
    if (!s || (!this.scribble() && !this.damage() && !this.stain() && !holes.length)) return null;
    const art = this.memo('papel', paperArt, { id: this.id(), W: s.W, H: s.H, scribble: this.scribble(), scribbleSeed: this.scribbleSeed() ?? undefined, scribbleInk: this.scribbleInk() ?? undefined, damage: this.damage(), seed: this.seed() ?? undefined, stain: this.stain(), stainSeed: this.stainSeed() ?? undefined, uid: this.uid, plain: this.plain() });
    return holes.length ? { ...art, cut: [...art.cut, ...holes] } : art;
  });

  /**
   * O rabisco sozinho, para a camada do lápis claro da cartolina escura: o mesmo desenho (o sorteio é
   * pelo id), desenhado sem o estrago e a mancha, que continuam no fundo, multiplicando.
   */
  protected readonly lapisHtml = computed(() => {
    const s = this.size(),
      scribble = this.scribble();
    if (!this.dark() || !s || !scribble) return null;
    const art = this.memo('papel', paperArt, { id: this.id(), W: s.W, H: s.H, scribble, scribbleSeed: this.scribbleSeed() ?? undefined, scribbleInk: this.scribbleInk() ?? undefined, uid: `${this.uid}l`, plain: this.plain() });
    // só desenhos nossos e números: nada que a pessoa escreveu entra aqui
    return this.sanitizer.bypassSecurityTrustHtml(`${svgOpen(s)}${art.fundo}</svg>`);
  });

  protected readonly decorHtml = computed(() => {
    const d = this.decorDrawing(),
      s = this.size();
    if (!d || !s || (!d.front && !d.under)) return null;
    // só desenhos nossos e números: nada que a pessoa escreveu entra aqui
    const wrap = (body: string | undefined) =>
      body ? this.sanitizer.bypassSecurityTrustHtml(`${svgOpen(s)}${body}</svg>`) : null;
    return { front: wrap(d.front), under: wrap(d.under) };
  });

  /** A máscara da cor e do que está escrito: o papel que foi embora e a faixa em que a cor soltou. */
  protected readonly mask = computed(() => {
    const a = this.art(),
      s = this.size();
    return a && s ? cutMask(a, s.W, s.H) : null;
  });
  protected readonly burnMask = computed(() => {
    const a = this.art(),
      s = this.size();
    return a && s ? cutMask(a, s.W, s.H, 'queima') : null;
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
        `${svgOpen(s ?? { W: 0, H: 0 })}${body}</svg>`,
      );
    return {
      fundo: wrap(a?.fundo ?? ''),
      clareia: wrap(a?.clareia ?? ''),
      relevo: wrap(a?.relevo ?? ''),
      frente: wrap(a?.frente ?? ''),
      fita: wrap(a?.fita ?? ''),
      topo: wrap(a?.topo ?? ''),
    };
  });

  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    // o estrago mudou, ou o que está escrito mudou de lugar: o recorte dos textos acompanha
    effect(() => {
      this.mask();
      this.content();
      untracked(() => enqueue(this));
    });
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => forget(this));
    afterNextRender(() => {
      // a ficha do mural guarda tudo num corpo (ver ReviewCard): o papel é medido pela ficha
      const card = (this.host.parentElement?.closest('app-review-card') as HTMLElement | null) ?? this.host.parentElement;
      if (!card) return;
      this.card = card;
      this.veils = card.matches('app-review-card') && !card.closest('app-review-editor');
      // a ficha acabou de entrar na página: só aparece com o papel pronto. Ainda antes da pintura,
      // então ela nunca aparece lisa para ganhar o papel um instante depois.
      if (this.veils) veil(card);
      layers.set(card, this);
      enqueue(this);
      const ro = new ResizeObserver(() => this.resized());
      ro.observe(card);
      destroy.onDestroy(() => {
        ro.disconnect();
        layers.delete(card);
      });
    });
  }

  /**
   * A ficha mudou de tamanho. O ResizeObserver avisa depois do layout e antes da pintura: a ficha
   * cujo papel ficou velho some já neste quadro, e nunca é vista com o desenho no tamanho errado.
   */
  private resized(): void {
    const card = this.card;
    if (!card) return;
    const W = card.offsetWidth,
      H = card.offsetHeight;
    if (!W || !H) return;
    const s = this.size();
    if (s && s.W === W && s.H === H && !isVeiled(card)) return;
    // Mudou muito (outro tipo de ficha, outra coluna): o desenho velho esticado ficaria torto, então
    // a ficha some e entra de novo com o papel pronto. Mudou pouco (a data encurtou e a linha subiu):
    // o desenho velho, esticado uns pixels, nem se nota; a ficha fica, e o papel novo entra por
    // baixo do velho com um fade (ver drawAt). Arrastando a borda da janela, a ficha muda de tamanho
    // a cada quadro: fica com o desenho esticado até a janela parar, em vez de piscar.
    const big = !s || Math.abs(W - s.W) > s.W * BIG_CHANGE || Math.abs(H - s.H) > s.H * BIG_CHANGE;
    if (this.veils && this.needsArt() && s && big && !windowResizing()) veil(card);
    enqueue(this);
  }

  /** O tamanho da ficha agora (só lê). */
  readSize(): Size | null {
    const card = this.card;
    if (!card) return null;
    const W = card.offsetWidth,
      H = card.offsetHeight;
    return W && H ? { W, H } : null;
  }

  /** Desenhar neste tamanho dá trabalho: o papel tem desenho e o tamanho mudou. */
  costly(at: Size): boolean {
    const s = this.size();
    return this.needsArt() && (!s || s.W !== at.W || s.H !== at.H);
  }

  /**
   * Desenha no tamanho dado, já: atualiza o papel fora do ciclo do Angular, para o desenho novo sair
   * no mesmo quadro em que a fila chegou nesta ficha.
   */
  drawAt(at: Size, crossfade: boolean): void {
    const s = this.size();
    const changed = !s || s.W !== at.W || s.H !== at.H;
    const ghosts = crossfade && changed && s && this.needsArt() ? this.ghost() : [];
    if (changed) this.size.set(at);
    this.cdr.detectChanges();
    for (const { el, from } of ghosts) {
      const a = el.animate([{ opacity: from }, { opacity: 0 }], { duration: CROSSFADE, easing: 'ease-in-out', fill: 'forwards' });
      a.finished.then(
        () => el.remove(),
        () => el.remove(),
      );
    }
  }

  /** As cópias do desenho anterior que ainda estão sumindo (ver ghost). */
  private ghosts: HTMLElement[] = [];

  /**
   * Copia as camadas desenhadas agora para cima delas mesmas: o desenho novo entra por baixo e a
   * cópia some num fade, como uma ficha trocada por outra. Na mesma camada (o mesmo z-index), a
   * cópia vem depois no documento e fica por cima. Os ids de dentro do desenho (gradientes,
   * recortes) ganham outro nome na cópia, para não se confundirem com os do desenho novo.
   */
  private ghost(): { el: HTMLElement; from: string }[] {
    for (const g of this.ghosts) g.remove();
    const out: { el: HTMLElement; from: string }[] = [];
    const n = ++ghostIds;
    for (const el of Array.from(this.host.children)) {
      if (!(el instanceof HTMLElement) || !el.classList.contains('camada') || el.hasAttribute('data-fantasma')) continue;
      const copy = el.cloneNode(true) as HTMLElement;
      copy.setAttribute('data-fantasma', '');
      renameIds(copy, `-f${n}`);
      out.push({ el: copy, from: getComputedStyle(el).opacity });
    }
    for (const { el } of out) this.host.append(el);
    this.ghosts = out.map((g) => g.el);
    return out;
  }

  /** Lê onde está cada texto e devolve as escritas do recorte (ver a fila). */
  readBurn(): () => void {
    return this.burnText();
  }

  private burnt = new Set<HTMLElement>();

  /**
   * O que está escrito queima junto com o papel: cada texto recebe o mesmo recorte, deslocado para
   * onde ele está na ficha (em px de layout, sem a inclinação). Os adesivos (o selo do 10, a fita
   * do 0, os bônus) foram colados depois e ficam inteiros: o recorte desce pelo texto e pula cada
   * um deles. Só a orelha, que dobra a ficha com tudo o que está colado, leva também a foto e os
   * adesivos (`[data-colado]`).
   */
  private burnText(): () => void {
    const paper = this.card;
    if (!paper) return () => {};
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
    // primeiro só lê onde cada texto está; as escritas vêm depois, junto com as das outras fichas
    const at = new Map<HTMLElement, [number, number]>();
    for (const el of next) {
      let x = 0,
        y = 0;
      for (let n: HTMLElement | null = el; n && n !== paper; n = n.offsetParent as HTMLElement | null) {
        x += n.offsetLeft;
        y += n.offsetTop;
        if (n.offsetParent === null) break;
      }
      at.set(el, [x, y]);
    }
    const prev = this.burnt;
    this.burnt = next;
    return () => {
      for (const el of prev) if (!next.has(el)) clearMask(el);
      for (const [el, [x, y]] of at) {
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
    };
  }
}

/** Os adesivos colados por cima do que está escrito: não queimam com o texto. */
const STICKERS = '[data-colado], .selo-dez, .fita-rasgada, app-bonus-tally, app-bonus-sticker';

function clearMask(el: HTMLElement): void {
  for (const p of ['mask-image', '-webkit-mask-image', 'mask-size', '-webkit-mask-size', 'mask-position', '-webkit-mask-position', 'mask-repeat', '-webkit-mask-repeat', 'mask-clip'])
    el.style.removeProperty(p);
}

type Size = { W: number; H: number };

/** Mudança de tamanho a partir da qual a ficha some e entra de novo, em vez de trocar o papel com fade. */
const BIG_CHANGE = 0.12;
/** O fade do papel velho para o novo, com a ficha na tela. */
const CROSSFADE = 320;
let ghostIds = 0;

/** Renomeia os ids da cópia e tudo o que aponta para eles dentro dela (url(#id), href="#id"). */
function renameIds(root: Element, suffix: string): void {
  const ids = new Set<string>();
  for (const el of Array.from(root.querySelectorAll('[id]'))) {
    ids.add(el.id);
    el.id += suffix;
  }
  if (!ids.size) return;
  const fix = (v: string) => v.replace(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g, (m, id: string) => (ids.has(id) ? `url(#${id}${suffix})` : m));
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      const v = attr.value;
      if (v.includes('url(')) {
        const w = fix(v);
        if (w !== v) el.setAttribute(attr.name, w);
      } else if ((attr.name === 'href' || attr.name === 'xlink:href') && v.startsWith('#') && ids.has(v.slice(1))) {
        el.setAttribute(attr.name, v + suffix);
      }
    }
  }
}

/**
 * A abertura do <svg> de cada camada. O desenho ocupa a camada inteira e estica junto com ela: se
 * a ficha muda de tamanho antes de a fila redesenhar o papel, o desenho velho fica esticado na
 * ficha (e escondido, ver veil.ts), em vez de encolhido no meio dela ou passando da beirada.
 */
function svgOpen(s: Size): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${s.W} ${s.H}" preserveAspectRatio="none">`;
}

/*
 * A fila do papel: as fichas que precisam desenhar o papel de novo (mudaram de tamanho, acabaram de
 * entrar na página, o que está escrito mudou de lugar). Desenhar o papel é caro (o desenho, o recorte
 * do texto e, depois, rasterizar os filtros), e trocar o tipo de ficha pedia isso para todas as
 * fichas da tela no mesmo quadro: o mural travava e mostrava o papel velho até acabar.
 *
 * Agora a fila desenha poucas por quadro, dentro de um orçamento de tempo, e na ordem em que importam:
 * primeiro as da tela, de cima para baixo, depois as que estão a uma tela de distância; as longes
 * esperam o navegador ficar ocioso. Cada ficha fica escondida até o papel dela ficar pronto e entra
 * com fade (ver veil.ts): nunca aparece com o desenho no tamanho errado.
 */
const layers = new WeakMap<Element, PaperArtLayer>();
const waiting = new Set<PaperArtLayer>();
/** Quanto tempo de cada quadro a fila pode usar. */
const BUDGET = 8;
/** Quantas fichas com desenho a fila redesenha num quadro, no máximo. */
const MAX_COSTLY = 3;
/** Longe da tela ninguém vê o quadro: com o navegador à toa, a fila pode redesenhar mais de uma. */
const MAX_COSTLY_IDLE = 3;
/** Quantas fichas a fila olha num quadro (as sem desenho custam quase nada). */
const MAX_PER_FRAME = 16;

let frame = 0;
let later: ReturnType<typeof setTimeout> | undefined;
let idle: number | undefined;

function enqueue(layer: PaperArtLayer): void {
  waiting.add(layer);
  kick();
}

function forget(layer: PaperArtLayer): void {
  waiting.delete(layer);
}

function kick(): void {
  if (!frame && !later) frame = requestAnimationFrame(onFrame);
}

/** Pede à fila que olhe de novo estas fichas (depois de uma troca feita às escondidas). */
export function repaint(cards: Iterable<Element>): void {
  for (const card of cards) {
    const layer = layers.get(card);
    if (layer) waiting.add(layer);
  }
  kick();
}

let resizedAt = -Infinity;
if (typeof window !== 'undefined') {
  addEventListener('resize', () => (resizedAt = performance.now()), { passive: true });
  // Rolando, fichas que estavam longe chegam perto e passam na frente da fila. Sem isto a fila só
  // olhava de novo quando algo entrava nela: se ela estava esperando o navegador ficar à toa (o que
  // pode demorar muito, ou nunca acontecer com a página ocupada), as fichas que chegavam à tela
  // ficavam na vaga sem papel até alguma outra coisa acordar a fila.
  addEventListener('scroll', () => waiting.size && kick(), { passive: true, capture: true });
}

/** A janela está sendo redimensionada: as fichas mudam de tamanho a cada quadro. */
function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function windowResizing(): boolean {
  return performance.now() - resizedAt < 250;
}

/**
 * Vale esperar: a janela ainda está mudando de tamanho. (Esperar as fontes chegarem travava a fila
 * inteira enquanto qualquer fonte estivesse carregando; se o texto muda de lugar quando ela chega, o
 * ResizeObserver avisa e a ficha é redesenhada.)
 */
function settling(): boolean {
  return windowResizing();
}

function onFrame(): void {
  frame = 0;
  if (settling()) {
    later = setTimeout(() => {
      later = undefined;
      kick();
    }, 120);
    return;
  }
  const left = step(false, BUDGET, MAX_COSTLY);
  if (left.urgent) kick();
  else if (left.far) idleSoon();
}

type Deadline = { timeRemaining(): number; didTimeout?: boolean };
/** O máximo que as fichas longe esperam o navegador ficar à toa. */
const IDLE_TIMEOUT = 600;

function idleSoon(): void {
  if (idle !== undefined) return;
  const ric = (globalThis as { requestIdleCallback?: (cb: (d: Deadline) => void, o?: { timeout: number }) => number }).requestIdleCallback;
  // com prazo: numa página que nunca fica à toa, as fichas longe ainda ficam prontas
  idle = ric ? ric(onIdle, { timeout: IDLE_TIMEOUT }) : (setTimeout(() => onIdle({ timeRemaining: () => 8, didTimeout: true }), 80) as unknown as number);
}

/** As fichas longe da tela, uma de cada vez, quando o navegador não tem mais nada para fazer. */
function onIdle(deadline: Deadline): void {
  idle = undefined;
  // tem quadro marcado: ele cuida das da tela e chama de volta quando acabar
  if (frame || later) return;
  if (settling()) {
    kick();
    return;
  }
  // o prazo venceu sem o navegador ficar à toa: uma ficha só, para não pesar no quadro
  const late = !!deadline.didTimeout;
  if (!late && deadline.timeRemaining() < 6) {
    idleSoon();
    return;
  }
  const left = late ? step(true, 6, 1) : step(true, deadline.timeRemaining() - 3, MAX_COSTLY_IDLE);
  if (left.urgent) kick();
  else if (left.far) idleSoon();
}

interface Job {
  layer: PaperArtLayer;
  card: HTMLElement;
  top: number;
  onScreen: boolean;
  /** A distância até a tela, em px (0 na tela). */
  dist: number;
  /** Na tela, a uma tela de distância, ou a prévia do editor: não espera o navegador ficar ocioso. */
  urgent: boolean;
}

/** As fichas esperando, na ordem em que a fila as desenha. */
function jobs(): Job[] {
  const vh = innerHeight,
    vw = innerWidth;
  const out: Job[] = [];
  for (const layer of waiting) {
    const card = layer.card;
    // ainda sem a ficha (o primeiro desenho põe na fila de novo), fora da página ou escondida pelo
    // layout (o ResizeObserver põe de volta quando ela voltar a ter tamanho)
    if (!card || !card.isConnected) {
      waiting.delete(layer);
      continue;
    }
    const r = card.getBoundingClientRect();
    if (!r.width && !r.height) {
      waiting.delete(layer);
      continue;
    }
    const onScreen = r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    const dist = onScreen ? 0 : Math.max(r.top - vh, -r.bottom, 0);
    out.push({ layer, card, top: r.top, onScreen, dist, urgent: !layer.veils || dist < vh });
  }
  // a prévia do editor primeiro; depois a tela, na ordem de leitura (a do documento); depois as mais perto
  return out.sort(
    (a, b) =>
      Number(a.layer.veils) - Number(b.layer.veils) ||
      Number(b.onScreen) - Number(a.onScreen) ||
      (a.onScreen ? (a.card.compareDocumentPosition(b.card) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1) : a.dist - b.dist),
  );
}

/**
 * Um passo da fila: lê o tamanho das próximas fichas (tudo lido de uma vez, um cálculo de layout
 * só), desenha as que couberem no orçamento, lê onde está o texto delas e só então escreve os
 * recortes. As prontas tiram o véu, na ordem.
 */
function step(far: boolean, budget: number, maxCostly: number): { urgent: boolean; far: boolean } {
  const list = jobs();
  const t0 = performance.now();
  const picked: { job: Job; at: Size }[] = [];
  let costly = 0;
  for (const job of list) {
    if (!job.urgent && !far) break;
    if (picked.length >= MAX_PER_FRAME && job.layer.veils) break;
    const at = job.layer.readSize();
    if (!at) {
      waiting.delete(job.layer);
      continue;
    }
    const heavy = job.layer.costly(at);
    // a próxima com desenho não cabe neste quadro: para aqui, para as fichas entrarem na ordem
    if (heavy && job.layer.veils && costly >= maxCostly) break;
    if (heavy) costly++;
    picked.push({ job, at });
  }
  const done: Job[] = [];
  for (const { job, at } of picked) {
    if (done.length && job.layer.veils && performance.now() - t0 > budget) break;
    // na tela e à vista: o papel novo entra com fade por baixo do velho
    job.layer.drawAt(at, job.onScreen && !isVeiled(job.card) && !reducedMotion());
    done.push(job);
  }
  const writes = done.map((job) => job.layer.readBurn());
  for (const write of writes) write();
  for (const job of done) {
    waiting.delete(job.layer);
    reveal(job.card, job.onScreen);
  }
  const rest = list.filter((job) => waiting.has(job.layer));
  return { urgent: rest.some((job) => job.urgent), far: rest.some((job) => !job.urgent) };
}
