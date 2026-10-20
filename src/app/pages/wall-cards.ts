import type { CategoryLooks } from '../core/category-looks';
import {
  ApplicationRef,
  ComponentRef,
  DestroyRef,
  Directive,
  ElementRef,
  EnvironmentInjector,
  Injectable,
  OnDestroy,
  createComponent,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { Review, ScoreKey } from '../core/review';
import { Settings } from '../core/settings';
import { pinningFor } from '../core/wall-physics';
import { onWallSettle } from '../core/wall-settle';
import { budget, perFrame, rest, setForcedSlow, slow, spend, struggling, tick } from '../ui/pace';
import { ASLEEP, wakePaper } from '../ui/paper-layer';
import { ReviewCard } from '../ui/review-card';
import { isVeiled, veil } from '../ui/veil';
import { cancelIdle, IdleDeadlineLike, whenIdle } from '../core/idle';

/** O que todas as fichas do mural recebem igual; o resto é a própria resenha. */
export interface WallCardProps {
  landingId: string | null;
  highlight: ScoreKey | null;
  compact: boolean;
  capas: boolean;
  /** As fichas inteiras: o texto todo, encaixadas em colagem. */
  full: boolean;
  dayOnly: boolean;
  picking: boolean;
  /** A ordem das fichas marcadas para o lado a lado (id → 1, 2, 3…). */
  picked: ReadonlyMap<string, number>;
  /** Sem spoilers: notas, veredito, bônus e texto escondidos. */
  masked: boolean;
  /** As fichas em segredo uma a uma (o mural de alguém, com "Evitar spoilers de outros murais"). */
  secret: ReadonlySet<string>;
  /** Quantas vezes cada obra jogada mais de uma vez está no mural (id da original → vezes). */
  times: ReadonlyMap<string, number>;
  /** O meu código na nuvem, para as fichas mostrarem as reações que receberam (null: sem conta). */
  reactCode: string | null;
  /** As tarefas das anotações se marcam na ficha (o seu mural). */
  checkable: boolean;
  /** O ícone e a cor das categorias do dono do mural, nas orelhas. */
  looks: CategoryLooks;
  /** As anotações à mostra que estão só no Kanban (ver `WallState.showBoard`): levam a etiqueta. */
  boardOnly: ReadonlySet<string>;
}

const NO_PROPS: WallCardProps = {
  landingId: null,
  highlight: null,
  compact: false,
  capas: false,
  full: false,
  dayOnly: false,
  picking: false,
  picked: new Map(),
  masked: false,
  secret: new Set(),
  times: new Map(),
  reactCode: null,
  checkable: false,
  looks: {},
  boardOnly: new Set(),
};

/** O tipo de ficha, pelo que muda a altura dela. */
type Shape = 'completa' | 'inteira' | 'simples' | 'capas';

function shapeOf(p: WallCardProps): Shape {
  return p.capas ? 'capas' : p.compact ? 'simples' : p.full ? 'inteira' : 'completa';
}

/**
 * Quanto do mural fica montado e quando. Os números `Lite` (a escolha "Menos fichas prontas" dos
 * Ajustes) deixam menos fichas em volta da tela: mais vagas à vista numa rolagem rápida, e bem menos trabalho para o aparelho.
 */
export const WALL_TUNING = {
  /** A folga em volta da tela onde as fichas ficam montadas e acordadas, em % da altura da tela. */
  zone: 100,
  zoneLite: 50,
  /** Longe da tela por este tempo, a ficha dorme. Mais que o deslizar da troca de ordem (380ms). */
  sleepAfter: 1200,
  /** De quanto em quanto a faxina olha quem pode dormir. */
  sweepEvery: 600,
  /** Quantas fichas ficam montadas (acordadas e dormindo); passou disso, as mais longes voltam a ser vaga. */
  maxLive: 96,
  maxLiveLite: 40,
  /** Quanto de um quadro vai para montar fichas (5ms a 60 Hz); pelo menos uma é montada por quadro. */
  spawnShare: 0.3,
  /** Por quanto tempo (ms) montar de uma vez, sem esperar o quadro, as fichas que já estão na tela. */
  settleBudget: 28,
  /**
   * Rolando mais rápido que isto (em telas por segundo), ninguém lê nada: as vagas passam e as fichas
   * só são montadas quando a rolagem acalma, em vez de montar fichas que já saíram da tela.
   */
  rushScreens: 4,
  /** Sem rolar por este tempo, a rolagem parou. */
  rushRest: 90,
  /**
   * Com o navegador à toa, as fichas de mais adiante (no sentido em que a página rolou por último) vão
   * sendo montadas e postas para dormir, uma de cada vez: quando a rolagem chegar nelas, é só acordar.
   * Até quantas telas além da folga.
   */
  ahead: 3,
  aheadLite: 1,
  /**
   * A rolagem parou quando passaram este tempo e estes quadros seguidos sem a página rolar: só então
   * o mouse volta a levantar as fichas (ver `[data-quieta]`). Os quadros contam porque, num aparelho
   * lento, um tempo sozinho vence entre um quadro e outro com a página ainda rolando.
   */
  quietRest: 200,
  quietFrames: 4,
};

/** A altura de uma ficha ainda não montada, até a primeira do mesmo tipo ser medida. */
const GUESS: Record<Shape, number> = { completa: 320, inteira: 460, simples: 132, capas: 236 };

/**
 * As alturas já medidas nesta visita (tipo de ficha + id), para a vaga da ficha que voltou a ser vaga,
 * ou do mural aberto de novo, ter a altura certa: a página não muda de tamanho quando ela é montada
 * outra vez. Valem para a largura de janela em que foram medidas.
 */
const seen = new Map<string, number>();
const mean = new Map<Shape, { sum: number; n: number }>();
let seenAt = 0;

function fresh(): void {
  const w = typeof innerWidth === 'number' ? innerWidth : 0;
  if (w === seenAt) return;
  seenAt = w;
  seen.clear();
  mean.clear();
}

function remember(shape: Shape, id: string, height: number): void {
  if (height <= 0) return;
  fresh();
  const key = `${shape}|${id}`;
  const before = seen.get(key);
  seen.set(key, height);
  const m = mean.get(shape) ?? { sum: 0, n: 0 };
  m.sum += height - (before ?? 0);
  if (before === undefined) m.n++;
  mean.set(shape, m);
}

/** A altura da vaga: a medida da própria ficha, a média das do mesmo tipo ou, sem nenhuma, um palpite. */
function heightFor(shape: Shape, id: string): number {
  fresh();
  const known = seen.get(`${shape}|${id}`);
  if (known) return known;
  const m = mean.get(shape);
  return m?.n ? Math.round(m.sum / m.n) : GUESS[shape];
}

/** Só para os testes: esquece as alturas medidas. */
export function forgetHeights(): void {
  seen.clear();
  mean.clear();
  seenAt = 0;
}

/**
 * Um lugar na parede: a caixa reta que fica sempre lá (`box`) e, dentro dela, a vaga tracejada ou a
 * ficha montada (acordada ou dormindo).
 */
interface Slot {
  id: string;
  review: Review;
  /**
   * A caixa do lugar (`.lugar`): é ela que a seção arruma na parede e que os observadores olham. Reta,
   * com a ficha torta dentro: quando a ficha está acordada, a caixa vira uma camada só dela no
   * compositor (ver `LIVE`), desenhada uma vez, e a inclinação vai desenhada na própria camada.
   */
  box: HTMLElement;
  /** O que está na caixa: a vaga ou a ficha. */
  el: HTMLElement;
  ref: ComponentRef<ReviewCard> | null;
  asleep: boolean;
  /** Perto da tela (dentro da folga), pelo que o observador disse por último. */
  near: boolean;
  /** Desde quando está longe (para dormir só depois de um tempo). */
  farSince: number;
  /** Dormindo só enquanto um diálogo está aberto por cima do mural (ver `nap`). */
  napping: boolean;
}

/**
 * As fichas do mural. Só as que estão perto da tela ficam montadas: as outras são vagas (a marca
 * tracejada na parede, da altura da ficha) e viram ficha quando a rolagem chega perto, entrando como
 * as fichas sempre entraram (ver ui/veil.ts). A ficha que ficou para trás dorme: continua montada,
 * com o papel desenhado, mas o navegador não calcula nem pinta o que está nela (`data-dorme`); acorda
 * sem redesenhar nada. Com muitas dormindo, as mais longes voltam a ser vaga.
 *
 * Antes, todas as fichas ficavam montadas e pintadas o tempo todo: com 300 anotações o mural tinha
 * 150 mil elementos, abrir a leitura levava meio segundo (o navegador recalcula o estilo da página
 * inteira quando um diálogo abre) e a página travava ao abrir, montando tudo de uma vez.
 *
 * Reordenar ou trocar o agrupamento só muda a ficha de seção (o mesmo elemento vai para outro lugar
 * da parede): o papel já desenhado, a capa já carregada e as medidas continuam lá.
 *
 * Cada ficha acordada tem a própria camada no compositor (a caixa dela, `.lugar[data-viva]`): é
 * desenhada uma vez e só. Na camada da página, cada ficha que chegava (o véu saindo, a capa
 * carregando) fazia o navegador redesenhar o pedaço inteiro da parede, com o papel e os enfeites das
 * vizinhas junto, e era isso que engasgava a rolagem mesmo nos computadores bons.
 */
@Injectable()
export class WallCardPool implements OnDestroy {
  private readonly appRef = inject(ApplicationRef);
  private readonly env = inject(EnvironmentInjector);
  private readonly settings = inject(Settings);
  private readonly slots = new Map<string, Slot>();
  private readonly byEl = new WeakMap<Element, Slot>();
  private wanted = new Set<string>();
  private sweep: ReturnType<typeof setTimeout> | undefined;
  private faxina: ReturnType<typeof setTimeout> | undefined;
  private shape: Shape = 'completa';
  private scope: string[] = [];
  /** As seções em colagem (as fichas inteiras): cada ficha ocupa as linhas da altura dela. */
  private readonly mosaics = new Set<HTMLElement>();
  /** A ficha muda de altura sozinha (a capa chegando, as fontes, uma tarefa marcada): mede de novo. */
  private readonly mosaicRo =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          const slots = entries.map((e) => this.byEl.get(e.target)).filter((s): s is Slot => !!s);
          const fits = slots.map(readMosaic);
          slots.forEach((slot, i) => writeMosaic(slot.box, fits[i]));
        });
  private near: IntersectionObserver | null = null;
  private nearZone = -1;
  /** As vagas e as dorminhocas que chegaram perto da tela, esperando a vez de montar ou acordar. */
  private readonly due = new Set<Slot>();
  private frame = 0;
  private later: ReturnType<typeof setTimeout> | undefined;
  private settleQueued = false;
  private measureFrame = 0;
  private readonly unsettle = onWallSettle({ settle: () => this.settle(), nap: () => this.nap() });
  /** A rolagem está rápida demais para ler (ver `WALL_TUNING.rushScreens`): as fichas esperam ela acalmar. */
  private rushing = false;
  private scrolledAt = 0;
  private scrolledTo = 0;
  private calm: ReturnType<typeof setTimeout> | undefined;
  private napped = false;
  /** Para onde a página rolou por último: 1 para baixo, -1 para cima. */
  private heading = 1;
  private idle: number | undefined;
  /** Rolando: as fichas não levantam com o mouse que passa por cima delas (ver `hush`). */
  private quiet = false;
  private stillFrame = 0;
  private stillFrames = 0;
  private hushedAt = 0;
  private readonly hovers = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;
  private readonly onScroll = () => this.scrolled();
  private readonly onDialogClose = (e: Event) => {
    // (o aviso de que um diálogo fechou não sobe pela página: é ouvido na descida)
    if (this.napped && e.target instanceof HTMLDialogElement && !document.querySelector('dialog[open]')) this.unnap();
  };

  /** Lido pelas seções a cada desenho: o que vale para todas as fichas. */
  props: () => WallCardProps = () => NO_PROPS;
  onOpen: (id: string) => void = () => {};
  onToggle: (id: string) => void = () => {};

  constructor() {
    effect(() => {
      const few = this.settings.fewCards();
      const still = this.settings.stillCards();
      untracked(() => {
        setForcedSlow(few);
        this.watch();
        // com "Fichas paradas" elas não levantam com o mouse: ficam quietas sempre, não só rolando
        for (const slot of this.slots.values()) if (slot.ref) slot.el.toggleAttribute(QUIET, still || this.quiet);
      });
    });
    if (typeof addEventListener === 'function') {
      addEventListener('scroll', this.onScroll, { passive: true });
      document.addEventListener('close', this.onDialogClose, true);
    }
  }

  /** Quantas fichas estão montadas e, delas, quantas acordadas (para os testes e a medição). */
  get counts(): { slots: number; live: number; awake: number } {
    let live = 0,
      awake = 0;
    for (const s of this.slots.values()) {
      if (s.ref) live++;
      if (s.ref && !s.asleep) awake++;
    }
    return { slots: this.slots.size, live, awake };
  }

  /**
   * Põe as fichas da seção dentro dela, na ordem: as que já existem (vaga ou ficha) só mudam de lugar;
   * as novas entram como vaga, e viram ficha se estiverem perto da tela (ver `settle`).
   */
  place(host: HTMLElement, reviews: readonly Review[], p: WallCardProps, mosaic = false): void {
    if (!this.scope.length) this.scope = Array.from(host.attributes, (a) => a.name).filter((n) => n.startsWith('_ngcontent-'));
    this.reshape(shapeOf(p));
    let i = 0;
    for (const r of reviews) {
      let slot = this.slots.get(r.id);
      if (!slot) slot = this.open(r);
      slot.review = r;
      if (slot.ref) this.apply(slot.ref, r, p);
      // a ficha que acabou de ser pregada cai na parede já: a tela vai até ela (ver Desk.land)
      else if (p.landingId === r.id) this.spawn(slot);
      const at = host.children[i] ?? null;
      if (at !== slot.box) host.insertBefore(slot.box, at);
      i++;
    }
    // as que sobraram saíram desta seção: outra seção as pega, ou elas saíram do mural (ver keepOnly)
    while (host.children.length > i) host.lastElementChild!.remove();
    this.setMosaic(host, mosaic);
    this.settleSoon();
  }

  /** A seção saiu da página (fechou, o mural mudou): as fichas dela ficam com quem as pegar. */
  release(host: HTMLElement): void {
    this.setMosaic(host, false);
  }

  /**
   * As fichas que saíram do mural (filtro, apagada) vão embora de vez, como antes. Só um instante
   * depois: a view transition faz a troca às escondidas e volta atrás para medir (ver
   * ViewTransitions.run), e a ficha que sai e volta na mesma hora não precisa ser montada de novo.
   */
  keepOnly(reviews: readonly Review[]): void {
    this.wanted = new Set(reviews.map((r) => r.id));
    if (this.sweep || [...this.slots.keys()].every((id) => this.wanted.has(id))) return;
    this.sweep = setTimeout(() => {
      this.sweep = undefined;
      for (const [id, slot] of this.slots) if (!this.wanted.has(id)) this.drop(id, slot);
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.sweep);
    clearTimeout(this.faxina);
    clearTimeout(this.later);
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.measureFrame);
    clearTimeout(this.calm);
    cancelAnimationFrame(this.stillFrame);
    if (this.idle !== undefined) cancelIdle(this.idle);
    this.unsettle();
    if (typeof removeEventListener === 'function') {
      removeEventListener('scroll', this.onScroll);
      document.removeEventListener('close', this.onDialogClose, true);
    }
    this.near?.disconnect();
    this.mosaicRo?.disconnect();
    for (const [id, slot] of this.slots) this.drop(id, slot);
  }

  // ===== montar as da tela já =====

  private settleSoon(): void {
    if (this.settleQueued) return;
    this.settleQueued = true;
    // depois de todas as seções postas (as seções desenham uma a uma, no mesmo ciclo), e antes da pintura
    queueMicrotask(() => this.settleQueued && this.settle());
  }

  /**
   * Monta (ou acorda) agora as fichas que estão na tela, de cima para baixo, sem esperar o observador:
   * abrir o mural, trocar a ordem ou o filtro nunca mostra a tela só com vagas. As que estão em volta
   * da tela vêm depois, aos poucos (ver `pump`). Se a tela tem fichas demais para montar de uma vez
   * (só capa e nome, num aparelho lento), o resto delas entra nos quadros seguintes, na mesma ordem.
   */
  settle(): void {
    this.settleQueued = false;
    if (typeof innerHeight !== 'number') return;
    const t0 = performance.now();
    const vh = innerHeight,
      vw = innerWidth;
    const now: Slot[] = [];
    for (const slot of this.slots.values()) {
      if ((slot.ref && !slot.asleep) || !slot.box.isConnected) continue;
      const r = slot.box.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && (r.width > 0 || r.height > 0)) now.push(slot);
    }
    const limit = slow() ? WALL_TUNING.settleBudget / 2 : WALL_TUNING.settleBudget;
    let done = 0;
    for (const slot of now) {
      if (done && performance.now() - t0 > limit) {
        // (está na tela: perto, mesmo que o observador ainda não tenha dito)
        slot.near = true;
        this.due.add(slot);
        continue;
      }
      this.rouse(slot);
      done++;
    }
    if (this.due.size) this.pumpSoon();
    else this.aheadSoon();
  }

  // ===== a folga em volta da tela =====

  /** (Re)começa a observar quem está perto da tela, com a folga do modo (leve: menor). */
  private watch(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    const zone = this.settings.fewCards() ? WALL_TUNING.zoneLite : WALL_TUNING.zone;
    if (this.near && zone === this.nearZone) return;
    this.near?.disconnect();
    this.nearZone = zone;
    this.near = new IntersectionObserver((entries) => this.onNear(entries), { rootMargin: `${zone}% 0px` });
    for (const slot of this.slots.values()) this.near.observe(slot.box);
  }

  private onNear(entries: IntersectionObserverEntry[]): void {
    const now = performance.now();
    let far = false;
    for (const e of entries) {
      const slot = this.byEl.get(e.target);
      if (!slot) continue;
      slot.near = e.isIntersecting;
      if (slot.near) {
        if (!slot.ref || slot.asleep) this.due.add(slot);
      } else {
        slot.farSince = now;
        this.due.delete(slot);
        far ||= !!slot.ref;
      }
    }
    if (this.due.size) this.pumpSoon();
    if (far) this.tidySoon();
  }

  private pumpSoon(): void {
    // na correria, quem chama de volta é a calma (ver `scrolled`)
    if (this.frame || this.later || this.rushing) return;
    this.frame = requestAnimationFrame((now) => this.pump(now));
  }

  /**
   * A página rolou. Rápido demais para ler (uma rolagem de arrasto, a barra puxada), as fichas que
   * chegam perto não são montadas: sairiam da tela antes de ficar prontas, e montá-las é o que
   * engasgaria a rolagem. As vagas passam, e as fichas entram quando a rolagem acalma.
   */
  private scrolled(): void {
    // a rolagem também acorda quem dormia por causa de um diálogo que fechou sem avisar
    if (this.napped && !document.querySelector('dialog[open]')) this.unnap();
    const now = performance.now();
    const y = scrollY;
    const dt = now - this.scrolledAt;
    this.hush();
    const speed = dt > 0 && dt < 200 ? (Math.abs(y - this.scrolledTo) / dt) * 1000 : 0;
    if (y !== this.scrolledTo) this.heading = y > this.scrolledTo ? 1 : -1;
    this.scrolledAt = now;
    this.scrolledTo = y;
    const rushing = speed > innerHeight * WALL_TUNING.rushScreens;
    if (!rushing && !this.rushing) return;
    this.rushing = rushing;
    clearTimeout(this.calm);
    if (!rushing) {
      if (this.due.size) this.pumpSoon();
      return;
    }
    this.calm = setTimeout(() => {
      this.rushing = false;
      if (this.due.size) this.pumpSoon();
    }, WALL_TUNING.rushRest);
  }

  /**
   * Rolando, as fichas passam por baixo do mouse parado, e cada uma levantava e assentava de novo (a
   * inclinação, a sombra, o brilho das folhas): o navegador redesenhava ficha por ficha no meio da
   * rolagem. Enquanto a página rola, e um instante depois, as fichas montadas ficam quietas
   * (`data-quieta`, ver review-card.ts); parou, a que está debaixo do mouse levanta como sempre.
   *
   * A rolagem só conta como parada depois de alguns quadros seguidos sem rolar (`quietFrames`), e não
   * só de um tempo: num aparelho lento os avisos de rolagem chegam espaçados, e com um tempo fixo e
   * curto as fichas voltavam a levantar entre um quadro e outro, no meio da rolagem, e a cada vez o
   * navegador redesenhava a ficha inteira.
   */
  private hush(): void {
    if (!this.hovers) return;
    this.stillFrames = 0;
    this.hushedAt = performance.now();
    if (!this.quiet) {
      this.quiet = true;
      // (as que dormem também: acordam no meio da rolagem, já debaixo do mouse)
      for (const slot of this.slots.values()) if (slot.ref) slot.el.setAttribute(QUIET, '');
    }
    if (!this.stillFrame) this.stillFrame = requestAnimationFrame(this.watchStill);
  }

  /** Conta os quadros sem rolar; com quadros e tempo bastantes, a rolagem parou. */
  private readonly watchStill = () => {
    this.stillFrame = 0;
    if (!this.quiet) return;
    this.stillFrames++;
    if (this.stillFrames >= WALL_TUNING.quietFrames && performance.now() - this.hushedAt >= WALL_TUNING.quietRest) {
      this.loosen();
      return;
    }
    this.stillFrame = requestAnimationFrame(this.watchStill);
  };

  private loosen(): void {
    this.quiet = false;
    if (this.settings.stillCards()) return;
    for (const slot of this.slots.values()) if (slot.ref) slot.el.removeAttribute(QUIET);
  }

  // ===== as de mais adiante, com o navegador à toa =====

  private aheadSoon(): void {
    if (this.idle !== undefined || this.rushing) return;
    this.idle = whenIdle(
      (deadline) => {
        this.idle = undefined;
        this.prepareAhead(deadline);
      },
      2000,
      { after: 200, deadline: { timeRemaining: () => 10 } },
    );
  }

  /**
   * Monta uma ficha de mais adiante: a vaga mais perto da tela, no sentido da última rolagem, até
   * `WALL_TUNING.ahead` telas além da folga. Ela é desenhada pela fila do papel (também à toa) e
   * dorme na próxima faxina; quando a rolagem chegar, acorda sem montar nem desenhar nada. Só com o
   * navegador sem mais nada para fazer, e nunca além do limite de fichas montadas.
   */
  private prepareAhead(deadline: IdleDeadlineLike): void {
    if (this.due.size || this.rushing || this.napped || typeof innerHeight !== 'number') return;
    if (deadline.timeRemaining() < 8 && !deadline.didTimeout) {
      this.aheadSoon();
      return;
    }
    const lite = this.settings.fewCards();
    const max = lite ? WALL_TUNING.maxLiveLite : WALL_TUNING.maxLive;
    if (this.counts.live >= max - 6) return;
    const vh = innerHeight;
    const reach = vh * ((this.nearZone / 100) + (lite ? WALL_TUNING.aheadLite : WALL_TUNING.ahead));
    let best: Slot | null = null;
    let bestDist = Infinity;
    for (const slot of this.slots.values()) {
      if (slot.ref || !slot.box.isConnected) continue;
      const r = slot.box.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      // adiante: abaixo da tela rolando para baixo, acima rolando para cima
      const dist = this.heading > 0 ? r.top - vh : -r.bottom;
      if (dist < 0 || dist > reach || dist >= bestDist) continue;
      best = slot;
      bestDist = dist;
    }
    if (!best) return;
    best.farSince = performance.now();
    this.spawn(best);
    this.tidySoon();
    this.aheadSoon();
  }

  /**
   * Um diálogo vai abrir por cima do mural (ver core/wall-settle.ts): as fichas montadas fora da tela
   * dormem já, antes de o navegador recalcular a página inteira por causa dele. As da tela ficam:
   * aparecem por trás do diálogo.
   */
  nap(): void {
    if (typeof innerHeight !== 'number') return;
    const vh = innerHeight;
    const shape = this.shape;
    const out: { slot: Slot; body: number; height: number }[] = [];
    for (const slot of this.slots.values()) {
      if (!slot.ref || slot.asleep || !slot.box.isConnected || busy(slot.el)) continue;
      const r = slot.box.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) continue;
      const body = slot.el.querySelector<HTMLElement>(':scope > .corpo');
      if (body) out.push({ slot, body: heightOf(body), height: heightOf(slot.el) });
    }
    for (const { slot, body, height } of out) {
      remember(shape, slot.id, height);
      this.sleep(slot, body);
      slot.napping = true;
      this.napped = true;
    }
  }

  /** O diálogo fechou: as que dormiam só por causa dele, e continuam perto da tela, acordam aos poucos. */
  private unnap(): void {
    this.napped = false;
    for (const slot of this.slots.values()) {
      if (!slot.napping) continue;
      slot.napping = false;
      if (slot.near && slot.asleep) this.due.add(slot);
      else if (slot.asleep) slot.farSince = performance.now();
    }
    if (this.due.size) this.pumpSoon();
  }

  /**
   * Monta e acorda as que chegaram perto, as mais perto do meio da tela primeiro, poucas por quadro:
   * dentro de um orçamento de tempo que encolhe quando os quadros atrasam (ver ui/pace.ts). O aparelho
   * que não dá conta monta uma por quadro, com um quadro de folga, em vez de travar a cada leva.
   */
  private pump(now: number): void {
    this.frame = 0;
    if (this.rushing) return;
    tick(now);
    const t0 = performance.now();
    const mid = innerHeight / 2;
    const order = [...this.due]
      .filter((slot) => {
        const ok = slot.box.isConnected && slot.near && (!slot.ref || slot.asleep);
        if (!ok) this.due.delete(slot);
        return ok;
      })
      .map((slot) => {
        const r = slot.box.getBoundingClientRect();
        return { slot, dist: Math.abs((r.top + r.bottom) / 2 - mid) };
      })
      .sort((a, b) => a.dist - b.dist);
    const limit = budget(WALL_TUNING.spawnShare, now);
    let done = 0;
    const most = perFrame(4);
    for (const { slot } of order) {
      if (done && (done >= most || performance.now() - t0 > limit)) break;
      this.due.delete(slot);
      this.rouse(slot);
      done++;
    }
    spend(now, performance.now() - t0);
    if (!this.due.size) {
      rest();
      this.aheadSoon();
      return;
    }
    if (!struggling()) {
      this.pumpSoon();
      return;
    }
    rest();
    this.later = setTimeout(() => {
      this.later = undefined;
      this.pumpSoon();
    }, 34);
  }

  /** A vaga vira ficha; a dorminhoca acorda. */
  private rouse(slot: Slot): void {
    this.due.delete(slot);
    if (!slot.ref) this.spawn(slot);
    else if (slot.asleep) this.wake(slot);
  }

  // ===== vaga, ficha, sono =====

  /** Um lugar novo na parede: a caixa e, dentro dela, ainda só a vaga. */
  private open(r: Review): Slot {
    const box = document.createElement('div');
    box.className = 'lugar';
    for (const name of this.scope) box.setAttribute(name, '');
    box.setAttribute('data-lugar', r.id);
    const el = this.vaga(r);
    box.append(el);
    const slot: Slot = { id: r.id, review: r, box, el, ref: null, asleep: false, near: false, farSince: performance.now(), napping: false };
    this.slots.set(r.id, slot);
    this.byEl.set(box, slot);
    this.near?.observe(box);
    return slot;
  }

  /**
   * A vaga: a mesma marca tracejada da ficha que espera o papel (ver review-card.ts), torta como a
   * ficha vai ficar e da altura dela (a medida, se já foi montada nesta visita; senão a média das do
   * mesmo tipo). Não tem nada dentro: custa quase nada.
   */
  private vaga(r: Review): HTMLElement {
    const el = document.createElement('div');
    el.className = 'vaga';
    for (const name of this.scope) el.setAttribute(name, '');
    el.setAttribute('data-ficha', r.id);
    el.setAttribute('data-vaga', '');
    el.setAttribute('aria-hidden', 'true');
    const pin = pinningFor(r.id, r.stock);
    el.style.setProperty('--tilt', String(pin.tilt));
    el.style.setProperty('--drop-y', `${pin.dropY}px`);
    el.style.height = `${heightFor(this.shape, r.id)}px`;
    return el;
  }

  /** A vaga vira ficha: nasce com o véu, no lugar da vaga, e entra quando o papel ficar pronto. */
  private spawn(slot: Slot): void {
    const r = slot.review;
    const p = this.props();
    const ref = createComponent(ReviewCard, { environmentInjector: this.env });
    const el = ref.location.nativeElement as HTMLElement;
    // a ficha recebe o mesmo atributo de escopo que o template do mural daria a ela, para os estilos
    // do mural (largura da ficha, coluna no celular) valerem igual
    for (const name of this.scope) el.setAttribute(name, '');
    el.setAttribute('data-ficha', r.id);
    ref.instance.opened.subscribe((id) => this.onOpen(id));
    ref.instance.toggled.subscribe((id) => this.onToggle(id));
    this.apply(ref, r, p);
    this.appRef.attachView(ref.hostView);
    // escondida desde já: montada fora do ciclo do Angular, a ficha poderia ser pintada lisa um quadro
    // antes de o papel dela pedir o véu
    veil(el);
    if (this.quiet || this.settings.stillCards()) el.setAttribute(QUIET, '');
    slot.el.replaceWith(el);
    slot.el = el;
    slot.box.setAttribute(LIVE, '');
    slot.ref = ref;
    slot.asleep = false;
    // desenha já, no mesmo quadro em que a ficha aparece
    ref.changeDetectorRef.detectChanges();
    this.measureSoon();
  }

  /**
   * A ficha longe da tela dorme: fica montada, do mesmo tamanho, mas o navegador deixa de calcular e
   * pintar o que está nela (ver `[data-dorme]` em review-card.ts). No lugar, a vaga tracejada.
   */
  private sleep(slot: Slot, bodyHeight: number): void {
    const el = slot.el;
    el.style.setProperty('--dorme-h', `${bodyHeight}px`);
    veil(el);
    el.setAttribute(ASLEEP, '');
    // dormindo não há o que desenhar: a camada dela no compositor é devolvida
    slot.box.removeAttribute(LIVE);
    slot.asleep = true;
  }

  /** Acorda: o conteúdo volta, e a ficha entra na vez dela na fila do papel (com fade, se está na tela). */
  private wake(slot: Slot): void {
    const el = slot.el;
    el.removeAttribute(ASLEEP);
    el.style.removeProperty('--dorme-h');
    el.toggleAttribute(QUIET, this.quiet || this.settings.stillCards());
    slot.box.setAttribute(LIVE, '');
    slot.asleep = false;
    slot.napping = false;
    // (sem papel para a fila olhar, a ficha nem foi desenhada ainda: ela mesma entra na fila quando for)
    wakePaper(el);
  }

  /** A ficha volta a ser vaga, da altura que tinha. */
  private despawn(slot: Slot): void {
    const ref = slot.ref;
    if (!ref) return;
    const vaga = this.vaga(slot.review);
    slot.el.replaceWith(vaga);
    slot.el = vaga;
    slot.box.removeAttribute(LIVE);
    slot.ref = null;
    slot.asleep = false;
    slot.napping = false;
    this.retire(ref);
  }

  /** Desmonta a ficha (com o site inteiro já saindo, não há mais de onde tirá-la). */
  private retire(ref: ComponentRef<ReviewCard>): void {
    if (this.appRef.destroyed) return;
    this.appRef.detachView(ref.hostView);
    ref.destroy();
  }

  private drop(id: string, slot: Slot): void {
    this.slots.delete(id);
    this.due.delete(slot);
    this.near?.unobserve(slot.box);
    this.mosaicRo?.unobserve(slot.box);
    if (slot.ref) {
      this.retire(slot.ref);
    }
    slot.box.remove();
  }

  /**
   * O tipo de ficha mudou (completa, simples, só capa, inteira): a altura de todas muda. As vagas
   * ganham a altura do tipo novo; as que dormiam (com a altura do tipo antigo guardada) voltam a ser
   * vaga. As acordadas mudam de forma sozinhas, como sempre.
   */
  private reshape(shape: Shape): void {
    if (shape === this.shape) return;
    this.shape = shape;
    for (const slot of this.slots.values()) {
      if (slot.ref && slot.asleep) this.despawn(slot);
      else if (!slot.ref) slot.el.style.height = `${heightFor(shape, slot.id)}px`;
    }
  }

  // ===== medir e arrumar =====

  /** Mede as fichas recém-montadas, para as vagas do mesmo tipo terem uma altura parecida. */
  private measureSoon(): void {
    if (this.measureFrame) return;
    this.measureFrame = requestAnimationFrame(() => {
      this.measureFrame = 0;
      const shape = this.shape;
      const blind = !mean.get(shape)?.n;
      for (const slot of this.slots.values()) {
        if (slot.ref && !slot.asleep && slot.box.isConnected && !seen.has(`${shape}|${slot.id}`)) remember(shape, slot.id, heightOf(slot.el));
      }
      // as primeiras medidas do tipo: as vagas trocam o palpite pela média (só desta vez, para a
      // página não ficar mudando de tamanho a cada ficha medida)
      if (blind && mean.get(shape)?.n) {
        for (const slot of this.slots.values()) if (!slot.ref) slot.el.style.height = `${heightFor(shape, slot.id)}px`;
      }
    });
  }

  private tidySoon(): void {
    if (this.faxina) return;
    this.faxina = setTimeout(() => {
      this.faxina = undefined;
      this.tidy();
    }, WALL_TUNING.sweepEvery);
  }

  /**
   * A faxina: as fichas longe da tela há um tempo dormem (menos a que tem o foco, a que está no meio
   * de um movimento e a que acabou de ser pregada); e, com fichas montadas demais, as mais longes
   * voltam a ser vaga.
   */
  private tidy(): void {
    const now = performance.now();
    const shape = this.shape;
    let pending = false;
    const sleepy: { slot: Slot; body: number; height: number }[] = [];
    for (const slot of this.slots.values()) {
      if (!slot.ref || slot.asleep || slot.near) continue;
      if (!slot.box.isConnected) {
        // a seção dela fechou: volta a ser vaga (não há o que medir fora da página)
        this.despawn(slot);
        continue;
      }
      // (a que ainda espera o papel, montada de antemão, dorme depois de desenhada: acordar não desenha nada)
      if (now - slot.farSince < WALL_TUNING.sleepAfter || busy(slot.el) || isVeiled(slot.el)) {
        pending = true;
        continue;
      }
      // primeiro só lê as alturas de todas; as escritas vêm depois
      const body = slot.el.querySelector<HTMLElement>(':scope > .corpo');
      if (body) sleepy.push({ slot, body: heightOf(body), height: heightOf(slot.el) });
    }
    for (const { slot, body, height } of sleepy) {
      remember(shape, slot.id, height);
      this.sleep(slot, body);
    }
    const max = this.settings.fewCards() ? WALL_TUNING.maxLiveLite : WALL_TUNING.maxLive;
    const asleep = [...this.slots.values()].filter((s) => s.ref && s.asleep);
    let live = this.counts.live;
    if (live > max && asleep.length) {
      const mid = innerHeight / 2;
      const far = asleep
        .map((slot) => {
          const r = slot.box.getBoundingClientRect();
          return { slot, dist: Math.abs((r.top + r.bottom) / 2 - mid) };
        })
        .sort((a, b) => b.dist - a.dist);
      for (const { slot } of far) {
        if (live <= max) break;
        this.despawn(slot);
        live--;
      }
    }
    if (pending) this.tidySoon();
  }

  private setMosaic(host: HTMLElement, mosaic: boolean): void {
    const boxes = Array.from(host.children) as HTMLElement[];
    if (!mosaic) {
      if (!this.mosaics.delete(host)) return;
      // fora da colagem, a inclinação de sempre
      for (const box of boxes) {
        this.mosaicRo?.unobserve(box);
        box.style.removeProperty('--inclina');
      }
      return;
    }
    this.mosaics.add(host);
    const slots = boxes.map((box) => this.byEl.get(box)).filter((s): s is Slot => !!s);
    // primeiro mede todas, depois escreve em todas: medir e escrever uma a uma refazia o layout a cada ficha
    const fits = slots.map(readMosaic);
    slots.forEach((slot, i) => {
      writeMosaic(slot.box, fits[i]);
      this.mosaicRo?.observe(slot.box);
    });
  }

  private apply(ref: ComponentRef<ReviewCard>, r: Review, p: WallCardProps): void {
    // setInput não faz nada quando o valor não mudou
    ref.setInput('review', r);
    ref.setInput('landing', p.landingId === r.id);
    ref.setInput('highlight', p.highlight);
    ref.setInput('compact', p.compact);
    ref.setInput('capas', p.capas);
    ref.setInput('full', p.full);
    ref.setInput('dayOnly', p.dayOnly);
    ref.setInput('picking', p.picking);
    ref.setInput('pickedAt', p.picked.get(r.id) ?? null);
    ref.setInput('masked', p.masked || p.secret.has(r.id));
    ref.setInput('times', p.times.get(r.id) ?? 1);
    ref.setInput('reactCode', p.reactCode);
    ref.setInput('checkable', p.checkable);
    ref.setInput('looks', p.looks);
    ref.setInput('boardOnly', p.boardOnly.has(r.id));
  }
}

/** A caixa com uma ficha acordada dentro: com a "Rolagem lisa" ligada, uma camada só dela no compositor (ver wall-board.scss). */
const LIVE = 'data-viva';

/** As fichas não levantam com o mouse enquanto a página rola, nem com "Fichas paradas" (ver `WallCardPool.hush` e review-card.ts). */
const QUIET = 'data-quieta';


/**
 * A altura do elemento como o layout a calculou, com a fração (412,5px): `offsetHeight` arredonda, e
 * meio pixel por ficha dormindo, somado parede abaixo, tirava as fichas seguintes do lugar.
 */
function heightOf(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).height) || el.offsetHeight;
}

/** A ficha não pode dormir agora: tem o foco, está deslizando ou sumindo, caindo na parede ou levando o carimbo. */
function busy(el: HTMLElement): boolean {
  return el.matches(':focus-within, .is-landing, .carimbando') || (typeof el.getAnimations === 'function' && el.getAnimations().length > 0);
}

/** A altura de uma linha da grade da colagem: cada ficha ocupa quantas couberem na altura dela. */
const MOSAIC_ROW = 4;
/** Na colagem, até esta altura a ficha fica torta como as outras do mural; daí endireita aos poucos. */
const TILT_FULL = 380;
/** Desta altura para cima, a ficha da colagem fica reta. */
const TILT_NONE = 960;

/** Um número de 0 a 1 tirado do id, sempre o mesmo para a mesma ficha. */
function wobble(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Quanto da inclinação de sempre (`tilt`, em graus, sem o sinal) fica na ficha da colagem, de 0 a 1.
 * A ficha gira em volta da tachinha, 12px abaixo da beirada de cima, então o pé dela anda para o lado
 * (altura − 12) × seno do ângulo: numa ficha comprida, um grau já leva o pé para cima da vizinha. As
 * curtas ficam tortas como sempre; da `TILT_FULL` à `TILT_NONE`, endireitam aos poucos; e nenhuma gira
 * a ponto de o pé passar de `room` (o espaço até o meio do vão, do lado para onde o pé vai), menos 1px
 * do canto de cima, que também anda um tico. Em cima e embaixo, o vão (34px ou mais) já cobre o canto
 * que sobe e o que desce, até na ficha mais larga.
 */
export function keptTilt(height: number, tilt: number, room: number): number {
  if (tilt <= 0) return 1;
  const bySize = Math.min(1, Math.max(0, (TILT_NONE - height) / (TILT_NONE - TILT_FULL)));
  const fits = (Math.asin(Math.min(1, Math.max(0, room - 1) / Math.max(1, height - 12))) * 180) / Math.PI;
  // arredondado para baixo: o arredondamento nunca devolve o pedaço que encostaria
  return Math.floor((Math.min(tilt * bySize, fits) / tilt) * 100) / 100;
}

/**
 * Na colagem (as fichas inteiras), cada ficha ocupa na grade as linhas da altura dela, mais o vão de
 * baixo: a ficha seguinte cai embaixo da mais curta, sem buraco na parede. O vão e o desvio para o
 * lado variam um pouco de ficha para ficha (sempre os mesmos para a mesma ficha), como pregadas à mão.
 * O desvio vai para o lado de onde o pé da ficha foge (torta para a direita, o pé vai para a
 * esquerda, e a ficha anda para a direita), e sobra mais vão para ela continuar torta; a inclinação
 * que fica é a de `keptTilt` (`--inclina`): cada ficha só gira dentro da sua faixa da parede (a
 * coluna e metade do vão de cada lado), então duas fichas nunca se encostam. A vaga é medida igual.
 * Mede a ficha (ou a vaga) e escreve na caixa dela, que é quem está na grade: a inclinação que fica
 * chega à ficha por herança.
 */
interface MosaicFit {
  rows: number;
  shift: number;
  tilt: number;
}

function readMosaic(slot: Slot): MosaicFit {
  const id = slot.id;
  const el = slot.el;
  const gap = 34 + Math.round(wobble(id, 1) * 26);
  const css = getComputedStyle(el);
  const top = parseFloat(css.marginTop) || 0;
  const height = el.offsetHeight;
  const tilt = pinningFor(id).tilt;
  const shift = Math.sign(tilt) * Math.round(wobble(id, 2) * 8);
  const half = (parseFloat(css.getPropertyValue('--in-col')) || 34) / 2;
  return { rows: Math.ceil((height + top + gap) / MOSAIC_ROW), shift, tilt: keptTilt(height, Math.abs(tilt), half + Math.abs(shift)) };
}

function writeMosaic(box: HTMLElement, fit: MosaicFit): void {
  box.style.setProperty('--linhas', String(fit.rows));
  box.style.setProperty('--desvio', `${fit.shift}px`);
  box.style.setProperty('--inclina', String(fit.tilt));
}

/** As fichas de uma seção do mural (ver WallCardPool). */
@Directive({ selector: '[appFichas]' })
export class WallCards {
  readonly reviews = input.required<readonly Review[]>({ alias: 'appFichas' });
  /** As fichas inteiras, em colagem: mede cada ficha para ela ocupar as linhas da altura dela. */
  readonly mosaic = input(false, { alias: 'appFichasMosaico' });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const pool = inject(WallCardPool);
    inject(DestroyRef).onDestroy(() => pool.release(host));
    effect(() => {
      const reviews = this.reviews();
      const props = pool.props();
      const mosaic = this.mosaic();
      untracked(() => pool.place(host, reviews, props, mosaic));
    });
  }
}
