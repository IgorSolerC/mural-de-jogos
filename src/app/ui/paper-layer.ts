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
import { DEFAULT_SCRIBBLE_INK, Damage, DecorMark, InkTone, Paper, SCRIBBLE_INK, Scribble, StainMark, inkStepFor, isAgedPaper, lightInk } from '../core/paper';
import { DecorArt, decorArt } from '../core/decor-art';
import { PaperArt as Art, cutMask, paperArt } from '../core/paper-art';
import { budget, idleFits, perFrame, rest, spend, struggling, tick } from './pace';
import { dropMask, holdMask, maskClass } from './mask-rules';
import { isVeiled, reveal, veil } from './veil';
import { reducedMotion } from '../core/motion';
import { IdleDeadlineLike, whenIdle } from '../core/idle';
import { Assada, FORNO_VERSAO, Fornada, Grupo, assinaturaDaPagina, calma, desenfornar, enfornar, fornoEpoca, fornoLigado, grupos, pegar, pegarGuardada, pegarSombra, receita, resumoDe, retomar, soltar, trocarIds } from './forno';
import { guardarAtalho, lerAtalho } from '../core/forno-store';

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
    <!-- o desenho só entra na página na vez dele (ver desenhar): até lá, só a cor lisa da ficha -->
    @if (desenhada() && art()?.core?.length) {
      <!-- o miolo da cartolina: aparece onde a cor soltou no rasgo; só o recorte do papel o corta -->
      <div class="miolo camada" [class]="outerCls()"></div>
    }
    <div class="papel camada" [class]="maskCls()"></div>
    @if (glitter()) {
      <!-- acende com o mouse: fica viva, fora do forno -->
      <div class="faisca camada" data-forno-viva [class]="maskCls()"></div>
    }
    @if (desenhada() ? art() : null; as a) {
      @if (a.fundo) {
        <div class="camada fundo" [class]="maskCls()" [class.sem-lapis]="!!lapisHtml()" [innerHTML]="html().fundo"></div>
      }
      @if (lapisHtml(); as l) {
        <!-- na cartolina escura o rabisco é de lápis claro: clareia o papel em vez de escurecer -->
        <div class="camada fundo lapis" [class]="maskCls()" [innerHTML]="l"></div>
      }
      @if (a.clareia) {
        <div class="camada clareia" [class]="maskCls()" [innerHTML]="html().clareia"></div>
      }
      @if (a.relevo) {
        <div class="camada relevo" [class]="maskCls()" [innerHTML]="html().relevo"></div>
      }
      @if (a.frente) {
        <div class="camada frente" [class]="burnDamage() ? burnCls() : maskCls()" [class.por-cima]="dogEar()" [innerHTML]="html().frente"></div>
      }
      @if (a.fita) {
        <div class="camada frente" [innerHTML]="html().fita"></div>
      }
      @if (a.topo) {
        <!-- o que caiu na ficha depois de pronta (a gosma): por cima de tudo, até da foto e da nota -->
        <div class="camada topo" [class]="maskCls()" [innerHTML]="html().topo"></div>
      }
    }
    @if (desenhada() ? decorHtml() : null; as d) {
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
       tudo (a ficha abaixa a foto e os adesivos para 2 quando tem orelha) */
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
    /* purpurina que acende onde a luz bate, com a ficha levantada (na cartolina escura, outros grãos,
       de meio ladrilho adiante, e mais de leve: ver darkGlitterVars em core/paper-art.ts) */
    .faisca {
      z-index: -1;
      background: var(--textura) var(--faisca-pos, 0 0) / var(--textura-tam, 140px 140px);
      mix-blend-mode: screen;
      opacity: calc(var(--luz, 0) * var(--faisca-forca, 0.9));
      transition: opacity 600ms var(--ease-physical);
    }
    /* Assada (ver ui/forno.ts): a camada mostra a imagem do grupo dela, que já traz o recorte, o
       desenho e o que passa da beirada; as outras camadas do grupo e o desenho vivo saem de cena (e
       voltam na hora em que a imagem deixa de valer). A que tem a mistura assada junto entra por cima,
       sem misturar de novo; a que mistura sozinha (o relevo) continua misturando ao vivo. */
    .camada.assada {
      inset: var(--assada-inset) !important;
      background: var(--assada) 0 0 / 100% 100% no-repeat !important;
      background-blend-mode: normal !important;
      mask: none !important;
      -webkit-mask: none !important;
      border-radius: 0 !important;
      overflow: visible !important;
    }
    .camada.assada.fundida {
      mix-blend-mode: normal !important;
      opacity: 1 !important;
    }
    /* (o desenho entra pelo innerHTML, sem o atributo do componente: daí o ::ng-deep) */
    .camada.assada > ::ng-deep *,
    .camada.assada-junto {
      display: none !important;
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
  /** O estrago estético quando a ficha tem os dois (Review.wear), por baixo do destrutivo, e o sorteio dele. */
  readonly wear = input<Damage | undefined>(undefined);
  readonly wearSeed = input<number | null | undefined>(undefined);
  /** A orelha, em qualquer um dos dois estragos: ela dobra a ficha com a foto e os adesivos. */
  protected readonly dogEar = computed(() => this.damage() === 'orelha' || this.wear() === 'orelha');
  /** O papel (Review.paper): só o marcado pelo tempo (desbotado, carregando) é desenhado aqui, igual em toda ficha. */
  readonly paper = input<Paper | undefined>(undefined);
  /** As manchas por cima do papel (Review.stains), com os sorteios, na ordem do desenho. */
  readonly stains = input<readonly StainMark[] | undefined>(undefined);
  /** As decorações por cima de tudo (Review.decors), com os sorteios, na ordem do desenho. */
  readonly decors = input<readonly DecorMark[] | undefined>(undefined);
  /** O sorteio do rabisco (Review.scribbleSeed). */
  readonly scribbleSeed = input<number | null | undefined>(undefined);
  /** A força do lápis do rabisco (Review.scribbleInk). */
  readonly scribbleInk = input<number | null | undefined>(undefined);
  readonly glitter = input(false);
  /** Sem o filtro de lápis: as amostras miúdas do editor. */
  readonly plain = input(false);
  /** Cartolina escura: o rabisco sai em lápis claro. */
  readonly dark = input(false);
  /** A cor do lápis do rabisco escolhida (Review.scribbleTone); sem ela, a automática: claro só na escura. */
  readonly scribbleTone = input<InkTone | null | undefined>(undefined);
  /** Muda quando o que está escrito na ficha muda: hora de medir de novo onde cada texto está. */
  readonly content = input<unknown>(null);
  /**
   * O que pinta o papel por fora destas camadas (a cor, a textura e a estampa, que chegam por
   * variáveis de CSS da ficha): quando muda, a imagem do forno deixa de valer.
   */
  readonly look = input<string>('');

  // o carvão dos queimados (e do furinho do raio) cobre a beirada do recorte, sem vazar para o buraco
  protected readonly burnDamage = computed(() => this.damage() === 'furado' || this.damage() === 'queimado' || this.damage() === 'raio');

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
  /**
   * O desenho do papel está na página. A ficha do mural só o põe na vez dela no forno (ver `desenhar`):
   * montar o SVG do papel (milhares de nós a calcular e medir) era o que pesava na rolagem, e a ficha
   * entra antes, com o conteúdo sobre a cor lisa. As outras (a prévia do editor, a miniatura) desenham
   * logo.
   */
  protected readonly desenhada = signal(false);
  /** O papel marcado pelo tempo, que tem desenho; os outros são só textura. */
  private readonly aged = computed(() => (isAgedPaper(this.paper()) ? this.paper() : undefined));
  /** Tem algo desenhado no papel (rabisco, papel marcado, estrago, mancha, decoração): mudar de tamanho custa. */
  readonly needsArt = computed(() => !!(this.scribble() || this.aged() || this.damage() || this.wear() || this.stains()?.length || this.decors()?.length));
  /** A ficha (o elemento em volta do papel), conhecida depois da primeira renderização. */
  card: HTMLElement | null = null;
  /**
   * A ficha some até o papel ficar pronto e entra com fade. A prévia no editor não: lá o papel muda
   * a cada clique e precisa responder na hora.
   */
  veils = false;
  /**
   * A ficha acabou de acordar (ver pages/wall-cards.ts): o papel já está desenhado, mas o navegador
   * vai calcular e pintar a ficha inteira de novo. Para a fila, pesa como uma ficha com desenho.
   */
  waking = false;

  /**
   * As decorações, desenhadas à parte, uma por cima da outra na ordem em que foram escolhidas: os
   * furos delas entram no recorte do papel. Da segunda em diante, os ids do SVG ganham outro nome.
   */
  private readonly decorDrawing = computed<DecorArt | null>(() => {
    const s = this.size(),
      list = this.decors() ?? [];
    if (!s || !list.length) return null;
    const drawn = list.map(({ decor, seed }, i) => this.memo('decor', decorArt, { id: this.id(), W: s.W, H: s.H, decor, seed, uid: i ? `${this.uid}e${i}` : this.uid }));
    if (drawn.length === 1) return drawn[0];
    const under = drawn.map((d) => d.under ?? '').join('');
    return { cut: drawn.flatMap((d) => d.cut), front: drawn.map((d) => d.front).join(''), ...(under ? { under } : {}) };
  });

  protected readonly art = computed<Art | null>(() => {
    const s = this.size();
    const holes = this.decorDrawing()?.cut ?? [];
    const stains = this.stains() ?? [];
    if (!s || (!this.scribble() && !this.aged() && !this.damage() && !this.wear() && !stains.length && !holes.length)) return null;
    const art = this.memo('papel', paperArt, { id: this.id(), W: s.W, H: s.H, scribble: this.scribble(), scribbleSeed: this.scribbleSeed() ?? undefined, scribbleInk: this.scribbleTone() ? inkStepFor(this.scribbleInk() ?? DEFAULT_SCRIBBLE_INK, this.scribbleTone(), this.dark(), SCRIBBLE_INK.length) : (this.scribbleInk() ?? undefined), paper: this.aged(), damage: this.damage(), seed: this.seed() ?? undefined, wear: this.wear(), wearSeed: this.wearSeed() ?? undefined, stains, uid: this.uid, plain: this.plain() });
    return holes.length ? { ...art, cut: [...art.cut, ...holes] } : art;
  });

  /**
   * O rabisco sozinho, para a camada do lápis claro (o da cartolina escura, ou o escolhido): o mesmo desenho (o sorteio é
   * pelo id), desenhado sem o estrago e a mancha, que continuam no fundo, multiplicando.
   */
  protected readonly lapisHtml = computed(() => {
    const s = this.size(),
      scribble = this.scribble();
    if (!lightInk(this.scribbleTone(), this.dark()) || !s || !scribble) return null;
    // o lápis branco na cartolina clara (o contrário do de sempre) sai mais forte: ver inkStepFor
    const ink = inkStepFor(this.scribbleInk() ?? DEFAULT_SCRIBBLE_INK, this.scribbleTone(), this.dark(), SCRIBBLE_INK.length);
    const art = this.memo('papel', paperArt, { id: this.id(), W: s.W, H: s.H, scribble, scribbleSeed: this.scribbleSeed() ?? undefined, scribbleInk: ink, uid: `${this.uid}l`, plain: this.plain() });
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

  /**
   * As classes dos três recortes: a máscara vai numa regra de CSS, uma por recorte, e não no `style`
   * de cada camada (ver ui/mask-rules.ts).
   */
  protected readonly maskCls = computed(() => classFor(this.mask()));
  protected readonly burnCls = computed(() => classFor(this.burnMask()));
  protected readonly outerCls = computed(() => classFor(this.outer()));
  /** Os recortes que este papel está segurando. */
  private held: string[] = [];

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
    // as regras dos recortes em uso ficam seguras enquanto este papel as usar
    effect(() => {
      const now = [this.mask(), this.burnMask(), this.outer()].filter((v): v is string => !!v);
      untracked(() => {
        for (const v of now) holdMask(v);
        for (const v of this.held) dropMask(v);
        this.held = now;
      });
    });
    // o desenho ou o que o pinta por fora mudou (a pessoa trocou o papel, a outra pessoa da anotação
    // compartilhada também, a página trocou de classe ou de densidade): a imagem do forno sai na hora,
    // antes de o molde mostrar o desenho novo, e a ficha assa de novo quando der
    effect(() => {
      this.html();
      this.decorHtml();
      this.lapisHtml();
      this.maskCls();
      this.burnCls();
      this.outerCls();
      this.look();
      this.dark();
      this.glitter();
      fornoEpoca();
      untracked(() => {
        this.lembrada = null;
        this.desassar();
        this.querAssar();
      });
    });
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      // (os avisos e as voltas à fila que ainda estão por vir não a põem de volta no forno)
      this.destruida = true;
      this.avisarAssada();
      forget(this);
      desenfornar(this.fornada);
      this.desassar();
      for (const v of this.held) dropMask(v);
      this.held = [];
    });
    afterNextRender(() => {
      // a ficha do mural guarda tudo num corpo (ver ReviewCard): o papel é medido pela ficha
      const card = (this.host.parentElement?.closest('app-review-card') as HTMLElement | null) ?? this.host.parentElement;
      if (!card) return;
      this.card = card;
      this.veils = card.matches('app-review-card') && !card.closest('app-review-editor');
      if (!this.veils) this.desenhada.set(true);
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
    if (this.veils && this.needsArt() && s && big && !settling()) veil(card);
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
    // (o papel ainda não desenhado não custa nada: só o tamanho muda, e o desenho entra na vez do forno)
    return this.waking || (this.desenhada() && this.needsArt() && (!s || s.W !== at.W || s.H !== at.H));
  }

  /**
   * Desenha no tamanho dado, já: atualiza o papel fora do ciclo do Angular, para o desenho novo sair
   * no mesmo quadro em que a fila chegou nesta ficha.
   */
  drawAt(at: Size, crossfade: boolean): void {
    const s = this.size();
    const changed = !s || s.W !== at.W || s.H !== at.H;
    const ghosts = crossfade && changed && s && this.needsArt() ? this.ghost() : [];
    // a imagem do forno era do tamanho velho (a cópia que some leva a imagem junto)
    if (changed) this.desassar();
    if (changed) this.size.set(at);
    this.waking = false;
    this.cdr.detectChanges();
    for (const { el, from } of ghosts) {
      const a = el.animate([{ opacity: from }, { opacity: 0 }], { duration: CROSSFADE, easing: 'ease-in-out', fill: 'forwards' });
      a.finished.then(
        () => {
          el.remove();
          // o papel velho sumiu: agora dá para assar o novo
          this.querAssar();
        },
        () => el.remove(),
      );
    }
  }

  // ===== o forno (ver ui/forno.ts) =====

  /** As imagens assadas em uso, cada uma na camada que a mostra, e as camadas que ela esconde. */
  private assadas: { lider: HTMLElement; juntas: HTMLElement[]; assada: Assada }[] = [];
  /** Muda a cada vez que a imagem deixa de valer: o que estava assando para isso é jogado fora. */
  private fornadas = 0;
  /**
   * As imagens da última fornada, no tamanho e na densidade em que foram assadas: a ficha que dormiu
   * e acordou pega de volta do cache do forno, sem refazer a receita. Some quando o papel muda.
   */
  private lembrada: { W: number; H: number; escala: number; assadas: Assada[]; sombra: Assada | null } | null = null;
  /** A sombra assada em uso (só nas recortadas): a imagem por baixo da ficha. */
  private sombra: { el: HTMLElement; assada: Assada } | null = null;
  /** A última distância medida da ficha à tela, e quando (ver `fornada.distancia`). */
  private medida = 0;
  private medidaEm = -Infinity;

  /** O papel desta ficha no forno: assa quando a ficha está quieta na página. */
  private readonly fornada: Fornada = {
    pronta: () => {
      const card = this.card;
      return (
        !!card &&
        card.isConnected &&
        this.veils &&
        !this.assadas.length &&
        !!this.size() &&
        !card.hasAttribute(ASLEEP) &&
        !this.ghosts.some((g) => g.isConnected) &&
        !waiting.has(this) &&
        // levantada pelo mouse, a sombra da ficha é outra: espera ela assentar
        !card.matches(':hover, :active')
      );
    },
    // (a fila pergunta várias vezes na mesma volta: a medida vale por um instante, sem ler o layout de novo)
    distancia: () => {
      const agora = performance.now();
      if (agora - this.medidaEm > MEDIDA_VALE) {
        const r = this.card!.getBoundingClientRect();
        this.medida = r.bottom < 0 ? -r.bottom : r.top > innerHeight ? r.top - innerHeight : 0;
        this.medidaEm = agora;
      }
      return this.medida;
    },
    assar: () => this.assar(),
    // (só a que está na tela: a que já passou, ou ainda não chegou, espera a rolagem acalmar)
    urgente: () => !!this.aoAssar && !!this.card && this.card.hasAttribute(REVELANDO) && this.fornada.distancia() === 0,
    desistiu: () => this.avisarAssada(),
  };

  /** Pede ao forno que asse esta ficha (só as do mural: a prévia do editor muda a cada clique). */
  querAssar(): void {
    // (a que entrou assada pelo atalho não tem o que fazer no forno)
    if (this.veils && !this.assadas.length && !this.destruida) enfornar(this.fornada);
  }

  /** Saiu da página: nada mais a fazer no forno (ver o DestroyRef no construtor). */
  private destruida = false;

  /** As camadas voltam a ser desenhadas ao vivo, e as imagens são devolvidas ao forno. */
  desassar(): void {
    this.fornadas++;
    for (const { lider, juntas, assada } of this.assadas) {
      lider.classList.remove('assada', 'fundida');
      lider.style.removeProperty('--assada');
      lider.style.removeProperty('--assada-inset');
      for (const el of juntas) el.classList.remove('assada-junto');
      soltar(assada);
    }
    this.assadas = [];
    this.tirarSombra();
  }

  /** Conta as vezes em que a fila esperou esta ficha aparecer (só a última vale, ver a fila). */
  vezDoVeu = 0;
  /** Conta as vezes em que a ficha começou a se revelar (só a última vale, ver `revelar`). */
  private revelacoes = 0;
  /** Quem espera a ficha escondida ficar assada para tirar o véu (ver `aparecerAssada`). */
  private aoAssar: (() => void) | null = null;

  /**
   * Espera a ficha que está se revelando (ver `revelar`) ficar assada: pelo atalho, se já foi assada
   * noutra visita, ou pelo forno, com o papel escondido, na frente das outras. Resolve também quando não
   * dá para assar (sem forno, ou o forno desistiu): aí o papel aparece vivo, como antes.
   */
  private async aparecerAssada(): Promise<void> {
    if (!this.veils) return;
    await this.porAtalho().catch(() => undefined);
    if (this.assadas.length || !fornoLigado() || this.destruida || !this.card || !this.card.hasAttribute(REVELANDO)) return;
    await new Promise<void>((resolve) => {
      // (a que foi redesenhada no meio deixa de esperar: quem a chamou já não vale, ver a fila do papel)
      this.avisarAssada();
      this.aoAssar = resolve;
      enfornar(this.fornada);
    });
  }

  private avisarAssada(): void {
    const aviso = this.aoAssar;
    this.aoAssar = null;
    aviso?.();
  }

  /** Põe o desenho do papel na página, já (ver `desenhada`). */
  private desenhar(): void {
    if (this.desenhada() || this.destruida) return;
    this.desenhada.set(true);
    this.cdr.detectChanges();
  }

  private async assar(): Promise<void> {
    if (!this.desenhada()) {
      // a vez desta ficha: o desenho entra na página com a rolagem calma (ou logo depois de um quadro,
      // se ela está à vista), e o navegador o calcula num quadro dele antes de o forno ler as camadas
      await calma();
      if (this.destruida || !this.card?.isConnected || this.assadas.length) return;
      this.desenhar();
      await calma();
    }
    await this.assarAgora();
    if (this.assadas.length) {
      this.avisarAssada();
      return;
    }
    // não deu agora (o tamanho mudou, foi redesenhada, dormiu): a escondida volta para a fila
    const card = this.card;
    if (this.aoAssar && card?.isConnected && card.hasAttribute(REVELANDO)) setTimeout(() => this.aoAssar && !this.destruida && enfornar(this.fornada), 100);
  }

  /**
   * A ficha entra antes de o papel ficar pronto: o conteúdo (a capa, o título, as notas, o texto) sobre a
   * cor lisa da cartolina, que não custa nada desenhar (`data-revelando`, ver review-card.ts). O papel é
   * assado escondido e se revela por cima: a cor lisa some num fade sobre a base dele, e o que vai por
   * cima do texto (o relevo, o estrago, o enfeite) e a sombra entram num fade cada um, na altura dele.
   * Antes a ficha esperava inteira com a vaga no lugar, e a parede ficava vazia um bom tempo.
   */
  async revelar(): Promise<void> {
    const card = this.card;
    if (!card) return;
    const minha = ++this.revelacoes;
    if (!this.assadas.length) {
      card.setAttribute(REVELANDO, '');
      const assada = this.aparecerAssada().then(() => true);
      // Se o forno demorar, a que está à vista ganha o papel vivo; a que está longe da tela (ou dormindo)
      // continua esperando, sem custar nada (o papel nem está desenhado): todas de uma vez, com o forno
      // atrasado, desenhariam o papel vivo juntas.
      for (;;) {
        const veio = await Promise.race([assada, new Promise<boolean>((r) => setTimeout(() => r(false), ESPERA_MAXIMA))]);
        if (veio || this.destruida || this.card !== card || !card.isConnected || !card.hasAttribute(REVELANDO)) break;
        if (!card.hasAttribute(ASLEEP) && this.fornada.distancia() === 0) break;
      }
    }
    // (acordou ou foi redesenhada no meio: quem a revela é a vez nova, que continua esperando o forno)
    if (minha !== this.revelacoes || this.destruida || this.card !== card || !card.hasAttribute(REVELANDO)) return;
    // não assou (sem forno, ou ele desistiu, ou demorou com ela à vista): o papel entra vivo
    if (!this.assadas.length) this.desenhar();
    card.removeAttribute(REVELANDO);
    if (!reducedMotion() && card.isConnected) {
      const vem = Array.from(this.host.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && (el.classList.contains('sombra-assada') || (el.classList.contains('camada') && Number.parseFloat(getComputedStyle(el).zIndex) > 0)),
      );
      for (const el of vem) el.animate([{ opacity: 0 }, {}], { duration: REVELA, easing: 'ease-out' });
    }
    // não assou a tempo (sem forno, ou ele desistiu): o papel fica vivo, e o forno o assa depois
    if (!this.assadas.length) this.querAssar();
  }

  private async assarAgora(): Promise<void> {
    const s = this.size();
    const card = this.card;
    if (!s || !card || !this.fornada.pronta()) return;
    // o tamanho mudou e a fila ainda não redesenhou: depois
    const now = this.readSize();
    if (!now || now.W !== s.W || now.H !== s.H) return;
    const vez = ++this.fornadas;
    // a chave barata, lida antes de qualquer imagem entrar (a sombra assada tira o filtro da ficha)
    const atalho = this.chaveBarata(s, devicePixelRatio);
    const camadas = Array.from(this.host.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('camada') && !el.hasAttribute('data-fantasma'),
    );
    const prontas: { grupo: Grupo; assada: Assada }[] = [];
    const larga = () => {
      for (const p of prontas) soltar(p.assada);
    };
    const escala = devicePixelRatio;
    const todos = grupos(camadas);
    // acordou sem nada mudar: as mesmas imagens, se o forno ainda as tem
    const l = this.lembrada;
    if (l && l.W === s.W && l.H === s.H && l.escala === escala && l.assadas.length === todos.length) {
      for (let i = 0; i < todos.length; i++) {
        const de = retomar(l.assadas[i]);
        if (!de) break;
        prontas.push({ grupo: todos[i], assada: de });
      }
      if (prontas.length === todos.length) {
        this.aplicar(prontas, s, escala);
        return this.assarSombra(escala, vez);
      }
      larga();
      prontas.length = 0;
    }
    try {
      for (const grupo of todos) {
        const r = await receita(grupo, s.W, s.H);
        if (vez !== this.fornadas) return larga();
        prontas.push({ grupo, assada: await pegar(r, escala, grupo.fundida) });
        // mudou enquanto assava (o tamanho, o papel, a ficha saiu da página), ou entrou pelo atalho: a
        // imagem já não vale, ou já não faz falta
        if (vez !== this.fornadas || !card.isConnected || this.assadas.length) return larga();
      }
    } catch (err) {
      larga();
      throw err;
    }
    this.aplicar(prontas, s, escala);
    await this.assarSombra(escala, vez);
    // da próxima vez (outra visita, a ficha montada de novo), ela entra já assada (ver porAtalho)
    if (vez === this.fornadas && this.assadas.length) {
      const chave = await atalho;
      if (chave)
        void guardarAtalho({
          atalho: chave,
          grupos: this.assadas.map(({ assada }) => ({ chave: assada.chave, inset: assada.inset, fundida: assada.fundida })),
          sombra: this.sombra ? { chave: this.sombra.assada.chave, inset: this.sombra.assada.inset } : null,
        });
    }
  }

  /**
   * A chave barata desta ficha: o desenho que ela já calculou (sem o número dela na página), o que pinta
   * o papel por fora, a sombra, o tamanho, a densidade e o que a página dá ao papel. Não lê as camadas
   * nem monta a receita: dá para procurar com a ficha ainda escondida, antes de ela aparecer.
   */
  private async chaveBarata(s: Size, escala: number): Promise<string | null> {
    const card = this.card;
    if (!card) return null;
    const desenho = JSON.stringify([this.art(), this.decorDrawing(), !!this.lapisHtml(), this.mask(), this.burnMask(), this.outer(), this.glitter(), this.dark(), this.plain()]).split(this.uid).join('§');
    const componente = Array.from(this.host.attributes).find((a) => a.name.startsWith('_nghost'))?.name ?? '';
    const sombra = card.classList.contains('recortada') ? filtroParado(card) : '';
    return resumoDe(`${FORNO_VERSAO}|${escala}|${s.W}x${s.H}|${this.look()}|${sombra}|${componente}|${assinaturaDaPagina()}|${desenho}`);
  }

  /**
   * A ficha que já foi assada noutra visita entra assada: pelo atalho guardado, as imagens vêm do
   * aparelho sem desenhar nada, antes de a ficha aparecer (a fila do papel espera um instante por
   * isto). Sem atalho, ou faltando uma imagem, nada muda: a ficha entra viva e o forno assa depois.
   */
  async porAtalho(): Promise<void> {
    const s = this.size();
    const card = this.card;
    if (!this.veils || !s || !card || this.assadas.length || !fornoLigado()) return;
    const escala = devicePixelRatio;
    const chave = await this.chaveBarata(s, escala);
    const a = chave ? await lerAtalho(chave) : null;
    if (!a || this.assadas.length || this.destruida) return;
    // (as imagens guardadas vão nas camadas do desenho, que sai de cena embaixo delas)
    this.desenhar();
    const camadas = Array.from(this.host.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('camada') && !el.hasAttribute('data-fantasma'),
    );
    const todos = grupos(camadas);
    if (todos.length !== a.grupos.length) return;
    const prontas: { grupo: Grupo; assada: Assada }[] = [];
    const larga = (extra?: Assada | null) => {
      for (const p of prontas) soltar(p.assada);
      if (extra) soltar(extra);
    };
    for (let i = 0; i < todos.length; i++) {
      const g = a.grupos[i];
      const x = await pegarGuardada(g.chave, g.inset, g.fundida);
      if (!x) return larga();
      prontas.push({ grupo: todos[i], assada: x });
    }
    const sombra = a.sombra ? await pegarGuardada(a.sombra.chave, a.sombra.inset, false) : null;
    // (o componente pode ter rodado de novo no meio, sem mudar nada: vale se o desenho continua o mesmo)
    const agora = this.size();
    const mesma = !!agora && agora.W === s.W && agora.H === s.H && (await this.chaveBarata(agora, escala)) === chave;
    if ((a.sombra && !sombra) || !mesma || this.assadas.length || !card.isConnected) return larga(sombra);
    this.aplicar(prontas, s, escala);
    if (sombra) {
      this.lembrada!.sombra = sombra;
      await this.assarSombra(escala, this.fornadas);
      // (a sombra posta pegou a dela; esta é a do atalho)
      soltar(sombra);
    }
  }

  /** Põe as imagens nas camadas: a líder mostra a do grupo, as outras saem de cena. */
  private aplicar(prontas: { grupo: Grupo; assada: Assada }[], s: Size, escala: number): void {
    // assada (pelo forno ou pelo atalho): nada mais a fazer na fila dele
    desenfornar(this.fornada);
    this.lembrada = { W: s.W, H: s.H, escala, assadas: prontas.map((p) => p.assada), sombra: this.lembrada?.sombra ?? null };
    for (const { grupo, assada } of prontas) {
      const [lider, ...juntas] = grupo.camadas;
      lider.style.setProperty('--assada', `url("${assada.url}")`);
      lider.style.setProperty('--assada-inset', assada.inset);
      lider.classList.add('assada');
      if (assada.fundida) lider.classList.add('fundida');
      for (const el of juntas) el.classList.add('assada-junto');
      this.assadas.push({ lider, juntas, assada });
    }
  }

  /**
   * A sombra da ficha recortada, assada a partir do papel assado e das peças que passam da beirada (a
   * orelha): fica por baixo de tudo, e a ficha parada perde o filtro (ver review-card.ts,
   * `[data-sombra-assada]`). Levantada pelo mouse ou pelo foco, a ficha volta ao filtro de sempre.
   */
  private async assarSombra(escala: number, vez: number): Promise<void> {
    const card = this.card;
    const s = this.size();
    if (!card || !s || vez !== this.fornadas || !card.classList.contains('recortada')) return;
    const filtro = filtroParado(card);
    if (!filtro || filtro === 'none') return;
    const imagens = this.assadas.map((a) => a.assada);
    const pecas = Array.from(card.querySelectorAll(':scope > .corpo > .aba-cat'));
    const l = this.lembrada;
    let assada: Assada | null = l?.sombra ? retomar(l.sombra) : null;
    if (!assada) assada = await pegarSombra({ imagens, pecas, filtro, W: s.W, H: s.H }, escala);
    if (vez !== this.fornadas || !card.isConnected || card.matches(':hover, :active')) {
      soltar(assada);
      return;
    }
    if (l) l.sombra = assada;
    const el = document.createElement('div');
    el.className = 'sombra-assada';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = `position:absolute;inset:${assada.inset};z-index:-10;pointer-events:none;background:url("${assada.url}") 0 0 / 100% 100% no-repeat`;
    semTransicao(card, () => {
      this.host.prepend(el);
      card.setAttribute(SOMBRA_ASSADA, '');
    });
    this.sombra = { el, assada };
  }

  /** A ficha volta à sombra viva (o filtro), na mesma hora, sem as duas sombras juntas. */
  private tirarSombra(): void {
    const sombra = this.sombra;
    if (!sombra) return;
    this.sombra = null;
    const card = this.card;
    if (card) semTransicao(card, () => card.removeAttribute(SOMBRA_ASSADA));
    sombra.el.remove();
    soltar(sombra.assada);
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

  private rasgosMedidos: { art: Art; caixas: DOMRect[] } | null = null;

  /** As caixas dos pedaços que o recorte tira (o rasgo, o furo, a faixa em que a cor soltou), em px da ficha. */
  private caixasDoRasgo(): DOMRect[] {
    const art = this.art();
    if (!art) return [];
    if (this.rasgosMedidos?.art !== art) this.rasgosMedidos = { art, caixas: [...art.cut, ...art.core].map(medirTraco) };
    return this.rasgosMedidos.caixas;
  }

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
      const all = this.dogEar();
      const burn = (el: HTMLElement) => {
        if (all || !el.querySelector(STICKERS)) {
          next.add(el);
          return;
        }
        for (const child of Array.from(el.children) as HTMLElement[]) if (!child.matches(STICKERS)) burn(child);
      };
      // a ficha colada no texto (o widget Nota) tem o papel e o estrago dela: nada dela é desta
      const own = (el: HTMLElement) => {
        const glued = el.closest('app-linked-card');
        return !glued || !paper.contains(glued);
      };
      paper.querySelectorAll<HTMLElement>('[data-queima]').forEach((el) => own(el) && burn(el));
      if (all) paper.querySelectorAll<HTMLElement>('[data-colado]').forEach((el) => own(el) && next.add(el));
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
    // Só leva o recorte o texto que ele alcança: com folga, longe do rasgo e dentro da ficha (o recorte
    // também apara o que passa da beirada), a máscara é branca em cima dele inteiro e não muda nenhum
    // pixel, mas cada texto mascarado custava ao navegador refazer as camadas da página a cada quadro.
    if (s && next.size) {
      const rasgos = this.caixasDoRasgo();
      for (const el of next) {
        const [x, y] = at.get(el)!;
        const w = Math.max(el.offsetWidth, el.scrollWidth),
          h = Math.max(el.offsetHeight, el.scrollHeight);
        const l = x - FOLGA_DO_RASGO,
          t = y - FOLGA_DO_RASGO,
          r = x + w + FOLGA_DO_RASGO,
          b = y + h + FOLGA_DO_RASGO;
        const dentro = l >= 0 && t >= 0 && r <= s.W && b <= s.H;
        const longe = rasgos.every((c) => c.x > r || c.x + c.width < l || c.y > b || c.y + c.height < t);
        if (dentro && longe) {
          next.delete(el);
          at.delete(el);
        }
      }
    }
    const prev = this.burnt;
    this.burnt = next;
    const cls = mask ? maskClass(mask) : '';
    return () => {
      for (const el of prev) if (!next.has(el)) clearMask(el);
      for (const [el, [x, y]] of at) {
        const set = (p: string, v: string) => el.style.setProperty(p, v);
        // o recorte vem pela classe (ver ui/mask-rules.ts); aqui, só onde ele cai neste texto
        setMaskClass(el, cls);
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

/**
 * As imagens já carregadas da ficha, decodificadas. A ficha que dormia (ver `data-dorme`) não tinha a capa
 * pintada, e o navegador pode ter jogado fora a capa decodificada: tirando o véu na hora, a capa ficava
 * preta por um quadro. As que ainda estão chegando entram como sempre (ver a capa que se revela).
 */
function decodificadas(card: HTMLElement): Promise<unknown> {
  const imgs = Array.from(card.querySelectorAll('img')).filter((img) => img.complete && img.naturalWidth > 0);
  return Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
}

/** Quem quer saber quando uma ficha com véu aparece (a esteira do mural monta a próxima, ver wall-cards.ts). */
const aoAparecer = new Set<() => void>();

/** Avisa quando uma ficha com véu aparece. Devolve como parar de avisar. */
export function onPaperShown(cb: () => void): () => void {
  aoAparecer.add(cb);
  return () => aoAparecer.delete(cb);
}

/** O máximo que a ficha escondida espera o atalho (a imagem guardada noutra visita) antes de entrar. */
const ESPERA_DO_ATALHO = 300;

/**
 * O máximo que a ficha se revelando, à vista, espera o papel assado. Assar uma ficha leva bem menos; isto
 * é só para ela nunca ficar sem o papel se algo prender o forno (o papel aparece vivo, e ele o assa
 * depois). A que está longe da tela espera sem prazo (ver `revelar`).
 */
const ESPERA_MAXIMA = 5000;

/** Por quanto tempo a distância da ficha à tela (ver `Fornada.distancia`) vale sem medir de novo, em ms. */
const MEDIDA_VALE = 50;

/** Na ficha com a sombra assada por baixo (ver PaperArtLayer.assarSombra). */
export const SOMBRA_ASSADA = 'data-sombra-assada';
/** A ficha que entrou com o conteúdo sobre a cor lisa, com o papel sendo assado escondido (ver `revelar`). */
export const REVELANDO = 'data-revelando';
/** Lendo o filtro que a ficha revelando vai ter (ver `filtroParado`). */
const LENDO_SOMBRA = 'data-lendo-sombra';
/** O fade do papel se revelando, em ms. */
const REVELA = 320;

/**
 * O filtro da ficha parada (a sombra das recortadas). A que está se revelando fica sem ele (a sombra
 * entra assada, no fade): ele é lido como vai ficar.
 */
export function filtroParado(card: HTMLElement): string {
  if (!card.hasAttribute(REVELANDO)) return getComputedStyle(card).filter;
  // sem a transição do filtro (a da ficha que levanta): com ela, o que se lia era o começo da animação,
  // uma sombra de força zero, e o forno assava uma sombra vazia
  let filtro = '';
  semTransicao(card, () => {
    card.setAttribute(LENDO_SOMBRA, '');
    filtro = getComputedStyle(card).filter;
    card.removeAttribute(LENDO_SOMBRA);
  });
  return filtro;
}

/**
 * Troca a sombra viva pela assada (ou o contrário) sem a transição do filtro da ficha: com ela, o
 * filtro sumia (ou voltava) devagar e as duas sombras ficavam juntas um instante.
 */
function semTransicao(card: HTMLElement, mudar: () => void): void {
  const antes = card.style.getPropertyValue('transition'),
    peso = card.style.getPropertyPriority('transition');
  card.style.setProperty('transition', 'none', 'important');
  mudar();
  // o estilo novo é calculado aqui, ainda sem transição; devolver a de antes não começa nenhuma
  void getComputedStyle(card).filter;
  if (antes) card.style.setProperty('transition', antes, peso);
  else card.style.removeProperty('transition');
}

/**
 * A folga em volta do texto para ele ficar sem o recorte: o desenho da letra que passa da caixa (o
 * itálico, a sombra) e o serrilhado da beirada do rasgo.
 */
const FOLGA_DO_RASGO = 12;

let regua: SVGPathElement | null = null;

/** A caixa de um traço de SVG (um pedaço do recorte), medida num SVG escondido. */
function medirTraco(d: string): DOMRect {
  if (!regua || !regua.isConnected) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
    regua = document.createElementNS(ns, 'path');
    svg.append(regua);
    document.body.append(svg);
  }
  regua.setAttribute('d', d);
  const b = regua.getBBox();
  return new DOMRect(b.x, b.y, b.width, b.height);
}

/** Os adesivos colados por cima do que está escrito: não queimam com o texto. Os widgets do texto também são adesivos. */
const STICKERS = '[data-colado], .selo-dez, .fita-rasgada, app-bonus-tally, app-bonus-sticker, app-note-widget';

function clearMask(el: HTMLElement): void {
  setMaskClass(el, '');
  for (const p of ['mask-size', '-webkit-mask-size', 'mask-position', '-webkit-mask-position', 'mask-repeat', '-webkit-mask-repeat', 'mask-clip'])
    el.style.removeProperty(p);
}

/** A classe do recorte de cada texto queimado, para trocar pela nova ou tirar. */
const burnClass = new WeakMap<HTMLElement, string>();

function setMaskClass(el: HTMLElement, cls: string): void {
  const old = burnClass.get(el) ?? '';
  if (old === cls) return;
  if (old) el.classList.remove(old);
  if (cls) el.classList.add(cls);
  if (cls) burnClass.set(el, cls);
  else burnClass.delete(el);
}

function classFor(mask: string | null): string {
  return mask ? maskClass(mask) : '';
}

type Size = { W: number; H: number };

/** Mudança de tamanho a partir da qual a ficha some e entra de novo, em vez de trocar o papel com fade. */
const BIG_CHANGE = 0.12;
/** O fade do papel velho para o novo, com a ficha na tela. */
const CROSSFADE = 320;
let ghostIds = 0;

/** Renomeia os ids da cópia e tudo o que aponta para eles dentro dela (url(#id), href="#id"). */
function renameIds(root: Element, suffix: string): void {
  trocarIds(root, (id) => id + suffix);
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
/** Quanto de cada quadro a fila pode usar: perto da metade (8ms a 60 Hz; ver ui/pace.ts). */
const BUDGET = 0.48;
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

/**
 * A ficha que dormia longe da tela acordou (ver pages/wall-cards.ts): entra na fila como as outras, e
 * tira o véu na vez dela, de cima para baixo. Devolve se a ficha tem papel para a fila olhar (a que
 * ainda nem foi desenhada pela primeira vez entra sozinha).
 */
export function wakePaper(card: Element): boolean {
  const layer = layers.get(card);
  if (!layer) return false;
  layer.waking = true;
  waiting.add(layer);
  kick();
  return true;
}

/** A ficha dorme longe da tela: sem conteúdo calculado nem pintado (ver `data-dorme` em review-card.ts). */
export const ASLEEP = 'data-dorme';

let resizedAt = -Infinity;
if (typeof window !== 'undefined') {
  addEventListener('resize', () => (resizedAt = performance.now()), { passive: true });
  // Rolando, fichas que estavam longe chegam perto e passam na frente da fila. Sem isto a fila só
  // olhava de novo quando algo entrava nela: se ela estava esperando o navegador ficar à toa (o que
  // pode demorar muito, ou nunca acontecer com a página ocupada), as fichas que chegavam à tela
  // ficavam na vaga sem papel até alguma outra coisa acordar a fila.
  addEventListener('scroll', () => waiting.size && kick(), { passive: true, capture: true });
}

/**
 * Vale esperar: a janela ainda está mudando de tamanho, e as fichas mudam de tamanho a cada quadro.
 * (Esperar as fontes chegarem travava a fila inteira enquanto qualquer fonte estivesse carregando; se
 * o texto muda de lugar quando ela chega, o ResizeObserver avisa e a ficha é redesenhada.)
 */
function settling(): boolean {
  return performance.now() - resizedAt < 250;
}

function onFrame(now: number): void {
  frame = 0;
  if (settling()) {
    later = setTimeout(() => {
      later = undefined;
      kick();
    }, 120);
    return;
  }
  // o aparelho que não dá conta leva uma ficha por quadro (ver ui/pace.ts)
  tick(now);
  const t0 = performance.now();
  const left = step(false, budget(BUDGET, now), perFrame(MAX_COSTLY));
  spend(now, performance.now() - t0);
  if (left.urgent) breathe();
  else {
    rest();
    if (left.far) idleSoon();
  }
}

/** O próximo passo da fila: no quadro seguinte ou, com o aparelho sem fôlego, um quadro depois. */
function breathe(): void {
  if (!struggling()) {
    kick();
    return;
  }
  if (frame || later) return;
  rest();
  later = setTimeout(() => {
    later = undefined;
    kick();
  }, 34);
}

/** O máximo que as fichas longe esperam o navegador ficar à toa. */
const IDLE_TIMEOUT = 600;

function idleSoon(): void {
  if (idle !== undefined) return;
  // com prazo: numa página que nunca fica à toa, as fichas longe ainda ficam prontas
  idle = whenIdle(onIdle, IDLE_TIMEOUT, { after: 80, deadline: { timeRemaining: () => 8, didTimeout: true } });
}

/** As fichas longe da tela, uma de cada vez, quando o navegador não tem mais nada para fazer. */
function onIdle(deadline: IdleDeadlineLike): void {
  idle = undefined;
  // tem quadro marcado: ele cuida das da tela e chama de volta quando acabar
  if (frame || later) return;
  if (settling()) {
    kick();
    return;
  }
  // o prazo venceu sem o navegador ficar à toa: uma ficha só, para não pesar no quadro
  const late = !!deadline.didTimeout;
  if (!late && !idleFits(deadline, 6)) {
    idleSoon();
    return;
  }
  const left = late ? step(true, 6, 1) : step(true, Math.max(1, deadline.timeRemaining() - 3), perFrame(MAX_COSTLY_IDLE));
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
    // dormindo: quem a acordar põe de volta na fila (ver wakePaper)
    if (card.hasAttribute(ASLEEP)) {
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
    const mostrar = () => {
      reveal(job.card, job.onScreen);
      // desenhada e à vista: a vez do forno, com o navegador à toa
      job.layer.querAssar();
    };
    // a ficha escondida entra num instante: a que já foi assada noutra visita entra assada (o atalho), e
    // a capa chega decodificada, sem um quadro vazio no lugar; as outras entram com o conteúdo sobre a cor
    // lisa, e o papel se revela quando ficar assado (ver revelar). A esteira (wall-cards.ts) anda quando
    // ele se revela.
    if (job.layer.veils && isVeiled(job.card)) {
      const vez = ++job.layer.vezDoVeu;
      const pronta = Promise.all([job.layer.porAtalho().catch(() => undefined), decodificadas(job.card)]);
      Promise.race([pronta, new Promise((r) => setTimeout(r, ESPERA_DO_ATALHO))]).then(async () => {
        // (redesenhada no meio: quem a mostra é a vez nova; fora da página, nada a mostrar)
        if (job.layer.vezDoVeu !== vez || !job.card.isConnected) return;
        reveal(job.card, job.onScreen);
        const revelada = job.layer.revelar();
        // o conteúdo apareceu (a esteira solta a próxima), e de novo quando o papel se revelar, se ele
        // ainda não veio (a esteira de uma por vez espera até aqui)
        const esperando = job.card.hasAttribute(REVELANDO);
        for (const cb of aoAparecer) cb();
        await revelada;
        if (esperando) for (const cb of aoAparecer) cb();
      });
    } else mostrar();
  }
  const rest = list.filter((job) => waiting.has(job.layer));
  return { urgent: rest.some((job) => job.urgent), far: rest.some((job) => !job.urgent) };
}
