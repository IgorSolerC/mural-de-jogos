import { ChangeDetectionStrategy, Component, ElementRef, Injectable, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { LucideAngularModule, SmilePlus, X } from 'lucide-angular';
import { REACTIONS, Reaction, ReactionId, ReactionTarget, Reactions, reactionOf, spokenReactions, tally } from '../core/reactions';
import { dayLabel, localDayOf } from '../core/follow';

/**
 * As reações nas fichas, como as do WhatsApp (ver core/reactions.ts): o balãozinho colado na quina
 * da ficha com as reações dadas, a fileira de emojis para reagir e a folha com quem reagiu.
 */

/** A folha de quem reagiu: uma só no site, aberta por qualquer balão (ver ReactionSheetView, no app). */
@Injectable({ providedIn: 'root' })
export class ReactionSheet {
  readonly target = signal<ReactionTarget | null>(null);
  open(target: ReactionTarget): void {
    this.target.set(target);
  }
}

/**
 * O balão: as reações mais dadas (até três) e o total, num adesivo redondo colado na quina de baixo
 * da ficha. Sem reação nenhuma, não aparece. Tocar abre a folha com quem reagiu.
 */
@Component({
  selector: 'app-reaction-bubble',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (list().length) {
      <button type="button" class="balao" [attr.aria-label]="'Reações: ' + spoken() + '. Ver quem reagiu'" [title]="spoken()" (click)="open($event)">
        <span class="emojis" aria-hidden="true">
          @for (t of top(); track t.kind.id) {
            <span class="emoji">{{ t.kind.emoji }}</span>
          }
        </span>
        @if (list().length > 1) {
          <span class="n" aria-hidden="true">{{ list().length }}</span>
        }
      </button>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .balao {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      height: 28px;
      padding: 0 8px 0 5px;
      border: 0;
      border-radius: 14px;
      background: #fbf9f3;
      color: #151515;
      box-shadow:
        0 0 0 1px rgb(21 21 21 / 0.12),
        0 1px 2px rgb(0 0 0 / 0.3),
        0 4px 8px -4px rgb(0 0 0 / 0.4);
      cursor: pointer;
      transition:
        translate var(--t-ui) var(--ease-ui),
        box-shadow var(--t-ui) var(--ease-ui);
    }
    .balao:hover {
      translate: 0 -1px;
    }
    .balao:focus-visible {
      outline: 3px solid var(--hi, #ffd84d);
      outline-offset: 2px;
    }
    .emojis {
      display: inline-flex;
    }
    /* um emoji encosta um pouco no outro, como no WhatsApp */
    .emoji {
      font-size: 15px;
      line-height: 1;
    }
    .emoji + .emoji {
      margin-left: -2px;
    }
    .n {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class ReactionBubble {
  readonly target = input.required<ReactionTarget>();
  private readonly reactions = inject(Reactions);
  private readonly sheet = inject(ReactionSheet);
  protected readonly list = computed(() => this.reactions.of(this.target().code, this.target().ref));
  protected readonly top = computed(() => tally(this.list()).slice(0, 3));
  protected readonly spoken = computed(() => spokenReactions(this.list()));

  protected open(e: MouseEvent): void {
    // o balão fica por cima da ficha: o toque é dele, não abre a ficha
    e.stopPropagation();
    this.sheet.open(this.target());
  }
}

/**
 * Reagir: o botão abre a fileira dos sete emojis por cima dele (como segurar a mensagem no WhatsApp).
 * O escolhido vale; o mesmo de novo tira. Com uma reação dada, o botão mostra ela.
 */
@Component({
  selector: 'app-reaction-picker',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      #trigger
      type="button"
      class="acao-caneta reagir"
      [attr.aria-expanded]="open()"
      aria-haspopup="true"
      [attr.aria-label]="mine() ? 'Sua reação: ' + mineKind()!.label + '. Trocar' : 'Reagir'"
      (click)="toggle()"
    >
      @if (mineKind(); as k) {
        <span class="minha" aria-hidden="true">{{ k.emoji }}</span>
        <span aria-hidden="true">{{ k.label }}</span>
      } @else {
        <lucide-icon [img]="ReactIcon" [size]="17" [strokeWidth]="2.4" aria-hidden="true" />
        <span aria-hidden="true">Reagir</span>
      }
    </button>
    @if (open()) {
      <div class="fileira" role="group" aria-label="Escolha uma reação" (keydown.escape)="close(true)">
        @for (k of kinds; track k.id; let i = $index) {
          <button
            type="button"
            class="opcao"
            [class.escolhida]="mine() === k.id"
            [attr.aria-pressed]="mine() === k.id"
            [attr.aria-label]="k.label"
            [title]="k.label"
            [style.--i]="i"
            (click)="pick(k.id)"
          >{{ k.emoji }}</button>
        }
      </div>
    }
  `,
  host: { '(document:pointerdown)': 'outside($event)' },
  styles: `
    :host {
      position: relative;
      display: inline-flex;
    }
    .reagir {
      font-size: 0.98rem;
    }
    .minha {
      font-size: 1.05rem;
      text-decoration: none;
    }
    /* a fileira: uma tira de papel com os emojis, saindo de cima do botão */
    .fileira {
      position: absolute;
      bottom: calc(100% + 6px);
      left: -10px;
      z-index: 20;
      display: flex;
      gap: 2px;
      padding: 5px 6px;
      border-radius: 24px;
      background: #fbf9f3;
      box-shadow:
        0 0 0 1px rgb(21 21 21 / 0.12),
        0 2px 4px rgb(0 0 0 / 0.3),
        0 10px 20px -6px rgb(0 0 0 / 0.45);
      animation: sobe 160ms var(--ease-physical, ease-out);
    }
    @keyframes sobe {
      from {
        opacity: 0;
        translate: 0 6px;
        scale: 0.94;
      }
    }
    .opcao {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
      transition:
        scale 120ms ease-out,
        background-color 120ms ease-out;
      animation: pula 220ms calc(var(--i) * 25ms) var(--ease-physical, ease-out) both;
    }
    @keyframes pula {
      from {
        scale: 0.4;
        opacity: 0;
      }
    }
    .opcao:hover,
    .opcao:focus-visible {
      scale: 1.22;
      outline: none;
    }
    .opcao:focus-visible {
      background: rgb(21 21 21 / 0.1);
    }
    .opcao.escolhida {
      background: rgb(21 21 21 / 0.12);
    }
    @media (prefers-reduced-motion: reduce) {
      .fileira,
      .opcao {
        animation: none;
      }
    }
    @media (max-width: 420px) {
      .opcao {
        width: 34px;
        height: 34px;
        font-size: 21px;
      }
    }
  `,
})
export class ReactionPicker {
  readonly target = input.required<ReactionTarget>();
  protected readonly ReactIcon = SmilePlus;
  protected readonly kinds = REACTIONS;
  private readonly reactions = inject(Reactions);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  protected readonly open = signal(false);
  protected readonly mine = computed(() => this.reactions.mineOn(this.target().code, this.target().ref));
  protected readonly mineKind = computed(() => (this.mine() ? reactionOf(this.mine()!) : null));

  protected toggle(): void {
    this.open.update((v) => !v);
    // pelo teclado, o foco vai para a reação dada (ou a primeira)
    if (this.open()) setTimeout(() => (this.host.nativeElement.querySelector<HTMLElement>('.opcao.escolhida') ?? this.host.nativeElement.querySelector<HTMLElement>('.opcao'))?.focus());
  }

  protected pick(id: ReactionId): void {
    void this.reactions.react(this.target(), this.mine() === id ? null : id);
    this.close(true);
  }

  protected close(refocus = false): void {
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }

  protected outside(e: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }
}

/** A folha de quem reagiu, aberta pelo balão: abas por reação e a lista, como no WhatsApp. */
@Component({
  selector: 'app-reaction-sheet',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet reacoes" aria-labelledby="reacoes-titulo" (close)="sheet.target.set(null)" (click)="onBackdrop($event)">
      @if (sheet.target(); as t) {
        <div class="folha">
          <header class="topo">
            <h2 id="reacoes-titulo">Reações <span class="obra">{{ t.titulo }}</span></h2>
            <button type="button" class="fechar" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="20" [strokeWidth]="2.6" />
            </button>
          </header>

          @if (canReact()) {
            <div class="sua" role="group" aria-label="Sua reação">
              @for (k of kinds; track k.id) {
                <button type="button" class="opcao" [class.escolhida]="mine() === k.id" [attr.aria-pressed]="mine() === k.id" [attr.aria-label]="k.label" [title]="k.label" (click)="pick(k.id)">{{ k.emoji }}</button>
              }
            </div>
          }

          @if (list().length) {
            <div class="abas" role="tablist" aria-label="Filtrar por reação">
              <button type="button" role="tab" class="aba" [attr.aria-selected]="tab() === null" (click)="tab.set(null)">Todas <span class="n">{{ list().length }}</span></button>
              @for (c of counts(); track c.kind.id) {
                <button type="button" role="tab" class="aba" [attr.aria-selected]="tab() === c.kind.id" [attr.aria-label]="c.kind.label + ', ' + c.n" (click)="tab.set(c.kind.id)">
                  <span aria-hidden="true">{{ c.kind.emoji }}</span> <span class="n" aria-hidden="true">{{ c.n }}</span>
                </button>
              }
            </div>
            <ul class="pessoas">
              @for (r of shown(); track r.codigo) {
                <li class="pessoa" [class.eu]="r.codigo === me()">
                  <span class="cracha-mini" aria-hidden="true">{{ initial(r.nome) }}</span>
                  <span class="quem">
                    <span class="nome">{{ r.codigo === me() ? 'Você' : r.nome }}</span>
                    <span class="quando">{{ when(r.em) }}</span>
                  </span>
                  @if (r.codigo === me() && canReact()) {
                    <button type="button" class="acao-caneta tirar" (click)="pick(r.reacao)">Tirar</button>
                  }
                  <span class="emoji" [attr.aria-label]="label(r.reacao)" role="img">{{ emoji(r.reacao) }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="ninguem">Ninguém reagiu ainda.</p>
          }
        </div>
      }
    </dialog>
  `,
  styles: `
    .reacoes {
      max-width: min(420px, calc(100vw - 24px));
    }
    .folha {
      display: flex;
      flex-direction: column;
      max-height: calc(100dvh - 24px);
      padding: 18px 20px 20px;
      border-radius: 2px;
      background: var(--paper);
      box-shadow: var(--shadow-lift);
    }
    .topo {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    h2 {
      display: grid;
      gap: 4px;
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.5rem;
      line-height: 1.05;
    }
    .obra {
      font-family: var(--f-hand);
      font-size: 1.05rem;
      line-height: 1.2;
      color: var(--ink-2);
      overflow-wrap: anywhere;
    }
    .fechar {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      margin: -6px -8px 0 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--ink);
    }
    .fechar:hover {
      background: rgb(21 21 21 / 0.08);
    }
    /* a sua reação: a fileira dos emojis, a escolhida com o fundo de lápis */
    .sua {
      display: flex;
      justify-content: space-between;
      gap: 2px;
      margin: 0 0 14px;
      padding: 6px;
      border-radius: 26px;
      background: #fbf9f3;
      box-shadow: 0 0 0 1px rgb(21 21 21 / 0.12), 0 1px 3px rgb(0 0 0 / 0.2);
    }
    .opcao {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
      transition: scale 120ms ease-out;
    }
    .opcao:hover {
      scale: 1.18;
    }
    .opcao:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -2px;
    }
    .opcao.escolhida {
      background: rgb(21 21 21 / 0.12);
    }
    .abas {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 6px;
      padding-bottom: 8px;
      border-bottom: 2px solid rgb(21 21 21 / 0.15);
    }
    .aba {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 36px;
      padding: 4px 10px;
      border: 0;
      border-radius: 18px;
      background: transparent;
      color: var(--ink);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.95rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .aba[aria-selected='true'] {
      background: var(--ink);
      color: var(--hi);
    }
    .aba:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 1px;
    }
    .n {
      font-variant-numeric: tabular-nums;
    }
    .pessoas {
      margin: 0;
      padding: 6px 0 0;
      list-style: none;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .pessoa {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 6px 2px;
    }
    .pessoa + .pessoa {
      border-top: 1px dashed rgb(21 21 21 / 0.2);
    }
    .cracha-mini {
      flex: none;
      display: grid;
      place-items: center;
      width: 34px;
      height: 36px;
      padding-top: 7px;
      border-radius: 4px;
      background:
        linear-gradient(to bottom, var(--caneta-azul, #2b4fa8) 0 7px, transparent 7px),
        #fdfcf8;
      color: var(--caneta-azul, #2b4fa8);
      font-family: var(--f-marker);
      font-size: 1.1rem;
      line-height: 1;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
      rotate: -3deg;
    }
    .eu .cracha-mini {
      background:
        linear-gradient(to bottom, var(--ink) 0 7px, transparent 7px),
        #fdfcf8;
      color: var(--ink);
    }
    .quem {
      flex: 1;
      display: grid;
      min-width: 0;
    }
    .nome {
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.12rem;
      overflow-wrap: anywhere;
    }
    .quando {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.8rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    .tirar {
      font-size: 0.92rem;
    }
    .emoji {
      font-size: 24px;
      line-height: 1;
    }
    .ninguem {
      font-family: var(--f-hand);
      font-size: 1.1rem;
      color: var(--ink-2);
    }
  `,
})
export class ReactionSheetView {
  protected readonly sheet = inject(ReactionSheet);
  private readonly reactions = inject(Reactions);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly CloseIcon = X;
  protected readonly kinds = REACTIONS;
  /** A aba escolhida: todas (null) ou só uma reação. */
  protected readonly tab = signal<ReactionId | null>(null);
  protected readonly me = this.reactions.myCode;

  protected readonly list = computed<readonly Reaction[]>(() => {
    const t = this.sheet.target();
    return t ? this.reactions.of(t.code, t.ref) : [];
  });
  protected readonly counts = computed(() => tally(this.list()));
  /** A sua primeiro (como no WhatsApp), depois as mais novas. */
  protected readonly shown = computed(() => {
    const me = this.me();
    const tab = this.tab();
    return this.list()
      .filter((r) => tab === null || r.reacao === tab)
      .slice()
      .sort((a, b) => (a.codigo === me ? -1 : b.codigo === me ? 1 : b.em.localeCompare(a.em)));
  });
  protected readonly canReact = computed(() => {
    const t = this.sheet.target();
    return !!t && this.reactions.canReact(t.code);
  });
  protected readonly mine = computed(() => {
    const t = this.sheet.target();
    return t ? this.reactions.mineOn(t.code, t.ref) : null;
  });

  constructor() {
    effect(() => {
      const t = this.sheet.target();
      const el = this.dialog().nativeElement;
      if (t && !el.open) {
        this.tab.set(null);
        el.showModal();
        void this.reactions.load(t.code);
      }
    });
    // a aba de uma reação que acabou (a sua, tirada) volta para Todas
    effect(() => {
      const tab = this.tab();
      if (tab && !this.counts().some((c) => c.kind.id === tab)) this.tab.set(null);
    });
  }

  protected pick(id: ReactionId): void {
    const t = this.sheet.target();
    if (t) void this.reactions.react(t, this.mine() === id ? null : id);
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === this.dialog().nativeElement) this.close();
  }

  protected emoji(id: ReactionId): string {
    return reactionOf(id).emoji;
  }

  protected label(id: ReactionId): string {
    return reactionOf(id).label;
  }

  protected initial(name: string): string {
    return (name.trim()[0] ?? '?').toUpperCase();
  }

  /** "hoje", "ontem", "3 de outubro". */
  protected when(iso: string): string {
    return dayLabel(localDayOf(iso));
  }
}

