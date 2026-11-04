import { DestroyRef, Directive, ElementRef, Injectable, OnDestroy, afterNextRender, booleanAttribute, effect, inject, input, signal, untracked } from '@angular/core';
import { Settings } from '../core/settings';
import { HeightMemo } from './height-memo';
import { perFrame, rest, setForcedSlow, struggling, tick } from './pace';

/** Quanto fica montado em volta da tela. Os números `Lite` são a escolha "Menos fichas prontas" dos Ajustes. */
export const NEAR_TUNING = {
  /** A folga, em % da altura de quem rola (a página ou a coluna). */
  zone: 100,
  zoneLite: 50,
  /** A folga para os lados, em % da largura de quem rola (o quadro do Kanban): as colunas são largas. */
  zoneSide: 50,
  zoneSideLite: 25,
  /** Longe por este tempo, o que estava montado sai (a rolagem que vai e volta não desmonta nada). */
  leaveAfter: 1200,
  /** De quanto em quanto a faxina olha quem pode sair. */
  sweepEvery: 600,
  /**
   * Rolando mais rápido que isto (em telas por segundo), ninguém lê nada: as vagas passam, e o que chegou
   * perto só monta quando a rolagem acalma (o mesmo número do mural, ver `WALL_TUNING.rushScreens`).
   */
  rushScreens: 4,
  /** Sem rolar por este tempo, a rolagem acalmou. */
  rushRest: 90,
};

/** Quantas fichas entram por quadro, num aparelho com folga (ver `perFrame`). */
const MOST_PER_FRAME = 4;

/** Só para os testes de outra coisa: tudo montado, sem observador nem fila. */
let everythingNear = false;
export function setEverythingNear(on: boolean): void {
  everythingNear = on;
}

/**
 * O que está perto da tela nas paredes que não são o mural (o mural tem a dele, com o sono das fichas: ver
 * pages/wall-cards.ts). Um observador por caixa que rola, porque a folga do observador só vale na caixa
 * dele: dentro de uma coluna que rola sozinha, o da página veria só o recorte da coluna, sem folga nenhuma.
 *
 * O que está na tela monta na hora, antes da pintura (ver `settle`); o que está na folga monta aos poucos, o
 * mais perto do meio da tela primeiro, no ritmo do aparelho (ver ui/pace.ts).
 */
@Injectable({ providedIn: 'root' })
export class NearPool implements OnDestroy {
  private readonly settings = inject(Settings);
  private readonly all = new Set<NearScreen>();
  private readonly byEl = new WeakMap<Element, NearScreen>();
  private readonly observers = new Map<Element | null, { io: IntersectionObserver; users: number }>();
  private readonly due = new Set<NearScreen>();
  private readonly memo = new HeightMemo();
  /** Mudou quando um tipo de ficha ganhou a primeira medida: as vagas trocam o palpite pela média. */
  private readonly firstMeasure = signal(0);
  private frame = 0;
  private later: ReturnType<typeof setTimeout> | undefined;
  private sweep: ReturnType<typeof setTimeout> | undefined;
  private measureFrame = 0;
  private lite = false;
  /** A rolagem está rápida demais para ler: quem chegou perto espera ela acalmar. */
  private rushing = false;
  private scrolled: EventTarget | null = null;
  private scrolledAt = 0;
  private scrolledTo = 0;
  private calm: ReturnType<typeof setTimeout> | undefined;
  private listening = false;
  private readonly onScroll = (e: Event) => this.scrollSeen(e);

  constructor() {
    effect(() => {
      const lite = this.settings.fewCards();
      untracked(() => {
        setForcedSlow(lite);
        if (lite === this.lite) return;
        this.lite = lite;
        this.reobserve();
      });
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.measureFrame);
    clearTimeout(this.later);
    clearTimeout(this.sweep);
    clearTimeout(this.calm);
    for (const { io } of this.observers.values()) io.disconnect();
    this.observers.clear();
    this.listen(false);
  }

  /** A altura da vaga: a medida da própria ficha, a média das do mesmo tipo ou, sem nenhuma, o palpite. */
  height(kind: string, id: string, guess: number): number {
    this.firstMeasure();
    return this.memo.height(kind, id, guess);
  }

  /** Só para os testes: esquece as alturas medidas. */
  forgetHeights(): void {
    this.memo.forget();
  }

  join(near: NearScreen): void {
    if (everythingNear || typeof IntersectionObserver === 'undefined') {
      near.mount();
      return;
    }
    this.all.add(near);
    this.listen(true);
    this.byEl.set(near.el, near);
    const box = near.box();
    near.root = box ? near.el.closest(box) : null;
    this.observerOf(near).observe(near.el);
    this.check(near);
    this.measureSoon();
  }

  leave(near: NearScreen): void {
    if (!this.all.delete(near)) return;
    this.due.delete(near);
    if (!this.all.size) this.listen(false);
    const watcher = this.observers.get(near.root);
    if (!watcher) return;
    watcher.io.unobserve(near.el);
    if (--watcher.users) return;
    watcher.io.disconnect();
    this.observers.delete(near.root);
  }

  /**
   * Monta agora o que está na tela, sem esperar o observador (que só responde depois da pintura): trocar a
   * ordem, o filtro ou o tamanho nunca mostra a tela só com vagas. Chamar depois do desenho, como
   * `afterRenderEffect`: o que monta aqui entra na mesma passada, antes de a tela ser pintada.
   */
  settle(): void {
    // (quem chama está num efeito: ele não depende de cada ficha montada)
    untracked(() => {
      for (const near of this.all) if (!near.near()) this.check(near);
    });
    this.measureSoon();
  }

  private check(near: NearScreen): void {
    if (typeof innerHeight !== 'number') return;
    const r = near.el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth || (!r.width && !r.height)) return;
    // dentro da caixa que rola, também: o que a coluna corta não está na tela
    const box = near.root?.getBoundingClientRect();
    if (box && (r.bottom <= box.top || r.top >= box.bottom || r.right <= box.left || r.left >= box.right)) return;
    near.far = false;
    this.due.delete(near);
    near.mount();
  }

  private observerOf(near: NearScreen): IntersectionObserver {
    const known = this.observers.get(near.root);
    if (known) {
      known.users++;
      return known.io;
    }
    const io = this.newObserver(near.side(), near.root);
    this.observers.set(near.root, { io, users: 1 });
    return io;
  }

  private newObserver(side: boolean, root: Element | null): IntersectionObserver {
    const zone = side ? (this.lite ? NEAR_TUNING.zoneSideLite : NEAR_TUNING.zoneSide) : this.lite ? NEAR_TUNING.zoneLite : NEAR_TUNING.zone;
    return new IntersectionObserver((entries) => this.onNear(entries), { root, rootMargin: side ? `0px ${zone}%` : `${zone}% 0px` });
  }

  /** "Menos fichas prontas" mudou: a folga é outra, e cada caixa ganha um observador novo. */
  private reobserve(): void {
    const old = [...this.observers.keys()];
    for (const root of old) {
      const watcher = this.observers.get(root)!;
      watcher.io.disconnect();
      const users = [...this.all].filter((n) => n.root === root);
      watcher.io = this.newObserver(users[0]?.side() ?? false, root);
      for (const near of users) watcher.io.observe(near.el);
    }
  }

  private onNear(entries: IntersectionObserverEntry[]): void {
    const now = performance.now();
    let far = false;
    for (const e of entries) {
      const near = this.byEl.get(e.target);
      if (!near) continue;
      near.far = !e.isIntersecting;
      if (near.far) {
        near.farSince = now;
        this.due.delete(near);
        far ||= near.near();
      } else if (!near.near()) {
        this.due.add(near);
      }
    }
    if (this.due.size) this.pumpSoon();
    if (far) this.sweepSoon();
  }

  private pumpSoon(): void {
    // na correria, quem chama de volta é a calma (ver `scrollSeen`)
    if (this.frame || this.later || this.rushing) return;
    this.frame = requestAnimationFrame((now) => this.pump(now));
  }

  /** Só ouve a rolagem com alguma parede na página. Na descida: o aviso de rolagem não sobe da coluna. */
  private listen(on: boolean): void {
    if (on === this.listening || typeof addEventListener !== 'function') return;
    this.listening = on;
    if (on) addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    else {
      removeEventListener('scroll', this.onScroll, { capture: true });
      this.scrolled = null;
    }
  }

  /**
   * Algo rolou (a página, o quadro, uma coluna). Rápido demais para ler, o que chega perto não é montado:
   * sairia da tela antes de ficar pronto, e montar é o que engasgaria a rolagem. As vagas passam, e o que
   * ficou perto entra quando a rolagem acalma.
   */
  private scrollSeen(e: Event): void {
    const now = performance.now();
    const box = e.target instanceof Element ? e.target : document.documentElement;
    // (cada caixa daqui rola num sentido só: a soma é a posição nele)
    const at = box.scrollLeft + box.scrollTop;
    const dt = now - this.scrolledAt;
    // (outra caixa rolando, ou rolando depois de um tempo parada: ainda não dá para dizer a velocidade)
    const speed = e.target === this.scrolled && dt > 0 && dt < 200 ? (Math.abs(at - this.scrolledTo) / dt) * 1000 : 0;
    this.scrolled = e.target;
    this.scrolledAt = now;
    this.scrolledTo = at;
    const rushing = speed > innerHeight * NEAR_TUNING.rushScreens;
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
    }, NEAR_TUNING.rushRest);
  }

  /** Monta as que chegaram perto, as mais perto do meio da tela primeiro, poucas por quadro. */
  private pump(now: number): void {
    this.frame = 0;
    if (this.rushing) return;
    tick(now);
    const midY = innerHeight / 2;
    const midX = innerWidth / 2;
    const order = [...this.due]
      .filter((near) => {
        const ok = near.el.isConnected && !near.far && !near.near();
        if (!ok) this.due.delete(near);
        return ok;
      })
      .map((near) => {
        const r = near.el.getBoundingClientRect();
        return { near, dist: Math.hypot((r.top + r.bottom) / 2 - midY, (r.left + r.right) / 2 - midX) };
      })
      .sort((a, b) => a.dist - b.dist);
    const most = perFrame(MOST_PER_FRAME);
    for (const { near } of order.slice(0, most)) {
      this.due.delete(near);
      near.mount();
    }
    this.measureSoon();
    if (!this.due.size) {
      rest();
      return;
    }
    if (!struggling()) {
      this.pumpSoon();
      return;
    }
    // o aparelho não dá conta: um quadro de folga entre uma leva e outra
    rest();
    this.later = setTimeout(() => {
      this.later = undefined;
      this.pumpSoon();
    }, 34);
  }

  private sweepSoon(): void {
    if (this.sweep) return;
    this.sweep = setTimeout(() => {
      this.sweep = undefined;
      this.tidy();
    }, NEAR_TUNING.sweepEvery);
  }

  /** A faxina: o que está longe há um tempo sai (menos o que tem o foco, que o teclado ainda usa). */
  private tidy(): void {
    const now = performance.now();
    let pending = false;
    const out: NearScreen[] = [];
    for (const near of this.all) {
      if (!near.far || !near.near()) continue;
      if (now - near.farSince < NEAR_TUNING.leaveAfter || near.el.matches(':focus-within')) pending = true;
      else out.push(near);
    }
    // primeiro só lê as alturas de todas; as escritas vêm depois
    for (const near of out) this.measure(near);
    for (const near of out) near.unmount();
    if (pending) this.sweepSoon();
  }

  private measureSoon(): void {
    if (this.measureFrame) return;
    this.measureFrame = requestAnimationFrame(() => {
      this.measureFrame = 0;
      for (const near of this.all) if (near.near() && !this.memo.knows(near.kind() ?? '', near.id())) this.measure(near);
    });
  }

  /** Mede a ficha montada, para a vaga dela (e as do mesmo tipo) ter uma altura parecida. */
  private measure(near: NearScreen): void {
    const kind = near.kind();
    // (a coluna longe deixa a vaga no lugar da ficha, mesmo com a ficha perto na coluna dela)
    if (!kind || near.el.querySelector(':scope > [data-vaga]')) return;
    const first = !this.memo.measured(kind);
    // a altura como o layout a calculou: a coluna é torta, e a caixa em volta da ficha girada seria maior
    this.memo.remember(kind, near.id(), parseFloat(getComputedStyle(near.el).height) || near.el.offsetHeight);
    if (first && this.memo.measured(kind)) this.firstMeasure.update((n) => n + 1);
  }
}

/**
 * Diz se o elemento está perto da tela, para o molde montar o que pesa só nessa hora e deixar uma vaga no
 * resto: `<li appPerto #perto="perto"> @if (perto.near()) { a ficha } @else { a vaga } </li>`. Longe de novo
 * por um tempo, a ficha volta a ser vaga.
 */
@Directive({ selector: '[appPerto]', exportAs: 'perto' })
export class NearScreen {
  /** A caixa que rola em volta (um seletor, ver `closest`); sem nada, a página. */
  readonly box = input('', { alias: 'appPerto' });
  /** Essa caixa rola para os lados (o quadro do Kanban), e não para baixo. */
  readonly side = input(false, { alias: 'appPertoLados', transform: booleanAttribute });
  /** Fichas de altura variável: o tipo dela (a vaga pergunta ao `NearPool.height`); sem tipo, não mede. */
  readonly kind = input<string | null>(null, { alias: 'appPertoMede' });
  /** De quem é a medida. */
  readonly id = input('', { alias: 'appPertoId' });

  readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly shown = signal(false);
  /** Montado: perto da tela, ou longe há pouco tempo. */
  readonly near = this.shown.asReadonly();
  /** A caixa de verdade (a do seletor, ou null: a página), guardada para sair dela. */
  root: Element | null = null;
  /** Fora da folga, pelo que o observador disse por último. */
  far = false;
  farSince = 0;

  constructor() {
    const pool = inject(NearPool);
    afterNextRender(() => pool.join(this));
    inject(DestroyRef).onDestroy(() => pool.leave(this));
  }

  mount(): void {
    this.shown.set(true);
  }

  unmount(): void {
    this.shown.set(false);
  }
}
