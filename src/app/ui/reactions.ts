import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injectable, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { BackdropClose } from './backdrop-close';
import { LucideAngularModule, Plus, SmilePlus, X } from 'lucide-angular';
import { Reaction, ReactionTarget, Reactions, spokenReactions, tally } from '../core/reactions';
import { REACTIONS, ReactionId, isQuickReaction, reactionOf } from '../core/reaction-kinds';
import { EmojiPanel } from './emoji-panel';
import { dayLabel, localDayOf } from '../core/follow';
import { ProfileStore } from '../core/profile-store';
import { napWall } from '../core/wall-settle';
import { PersonFace, PersonPhoto } from './person-photo';
import { closeOnOutsidePress } from './outside-press';

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
      <button type="button" class="balao" [style.--torto.deg]="tilt()" [attr.aria-label]="'Reações: ' + spoken() + '. Ver quem reagiu'" [title]="spoken()" (click)="open($event)">
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
    /* Um remendo de pano costurado na quina da ficha: feltro creme com a fibra do papel, a linha de
       costura tracejada por dentro, e torto do seu jeito em cada ficha */
    .balao {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      height: 30px;
      padding: 0 10px 0 7px;
      border: 0;
      border-radius: 15px;
      background-color: var(--remendo);
      /* a trama do feltro: um pontilhado leve na cor da linha */
      background-image: radial-gradient(rgb(122 74 38 / 0.09) 0.8px, transparent 1.1px);
      background-size: 4px 4px;
      color: #151515;
      outline: 1.5px dashed var(--linha);
      outline-offset: -4px;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.35),
        0 3px 6px -3px rgb(0 0 0 / 0.45);
      rotate: var(--torto, -3deg);
      cursor: pointer;
      transition:
        translate var(--t-ui) var(--ease-ui),
        rotate var(--t-ui) var(--ease-ui);
    }
    :host {
      --remendo: #f8f0dc;
      --linha: rgb(122 74 38 / 0.6);
    }
    .balao:hover {
      translate: 0 -1px;
      rotate: calc(var(--torto, -3deg) * 0.4);
    }
    /* o foco não pode usar o contorno (é a costura): um anel amarelo em volta do remendo */
    .balao:focus-visible {
      box-shadow:
        0 0 0 3px var(--hi),
        0 3px 6px -3px rgb(0 0 0 / 0.45);
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
    /* o número escrito a pincel, como o resto da ficha */
    .n {
      font-family: var(--f-marker);
      font-size: 0.95rem;
      line-height: 1;
      translate: 0 1px;
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
  /** Costurado meio torto, sempre do mesmo jeito na mesma ficha (de −5 a +4 graus). */
  protected readonly tilt = computed(() => {
    let h = 0;
    for (const c of this.target().ref) h = (h * 31 + c.charCodeAt(0)) | 0;
    return (Math.abs(h) % 10) - 5;
  });

  protected open(e: MouseEvent): void {
    // o balão fica por cima da ficha: o toque é dele, não abre a ficha
    e.stopPropagation();
    this.sheet.open(this.target());
  }
}

/** O espaço que a fileira e o painel do "+" pedem em cima do botão, numa folha que rola. */
const ROW_ROOM = 60;
const PANEL_ROOM = 330;

/**
 * Reagir: o botão abre a fileira dos sete emojis por cima dele (como segurar a mensagem no WhatsApp).
 * O escolhido vale; o mesmo de novo tira. Com uma reação dada, o botão mostra ela.
 */
@Component({
  selector: 'app-reaction-picker',
  imports: [LucideAngularModule, EmojiPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      #trigger
      type="button"
      class="acao-caneta reagir"
      [attr.aria-expanded]="open()"
      aria-haspopup="true"
      [class.quieto]="quiet()"
      [class.giz]="wall()"
      [class.dada]="wall() && !!mine()"
      [attr.aria-label]="mine() ? 'Sua reação: ' + mineKind()!.label + '. Trocar' : 'Reagir'"
      [title]="quiet() || wall() ? (mineKind()?.label ?? 'Reagir') : ''"
      (click)="toggle()"
    >
      @if (mineKind(); as k) {
        <span class="minha" aria-hidden="true">{{ k.emoji }}</span>
        @if (!quiet()) {
          <span class="rp-nome" aria-hidden="true">{{ k.label }}</span>
        }
      } @else {
        <lucide-icon [img]="ReactIcon" [size]="wall() ? 19 : 17" [strokeWidth]="2.4" aria-hidden="true" />
        @if (!quiet()) {
          <span aria-hidden="true">Reagir</span>
        }
      }
    </button>
    @if (open() && more()) {
      <!-- o "+": todos os emojis, numa folha de feltro que sai do mesmo lugar -->
      <div class="fileira painel" [class.para-baixo]="below()" role="dialog" aria-label="Escolha qualquer emoji" (keydown.escape)="keep($event); fewerEmojis()">
        <!-- o catálogo de emojis só vem quando alguém abre o "+": fica fora do pacote inicial do site -->
        @defer (on immediate) {
          <app-emoji-panel [current]="mine()" (picked)="pick($event)" />
        } @placeholder {
          <span class="emoji-esperando" role="status">Abrindo os emojis…</span>
        }
      </div>
    } @else if (open()) {
      <div class="fileira" [class.para-baixo]="below()" role="group" aria-label="Escolha uma reação" (keydown.escape)="keep($event); close(true)">
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
        <!-- a sua, se veio do "+" -->
        @if (mine() && !quick(mine()!)) {
          <button type="button" class="opcao escolhida" aria-pressed="true" [attr.aria-label]="'Sua reação: ' + mine() + '. Tirar'" (click)="pick(mine()!)">{{ mine() }}</button>
        }
        <button type="button" class="opcao mais" aria-label="Outro emoji" title="Outro emoji" [style.--i]="kinds.length" (click)="moreEmojis()">
          <lucide-icon [img]="MoreIcon" [size]="20" [strokeWidth]="2.6" aria-hidden="true" />
        </button>
      </div>
    }
  `,
  host: { '[class.rp-quieto]': 'quiet()' },
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
    /* quieto (no pé de um comentário): só o desenho, num botão redondo que não disputa com o texto */
    .reagir.quieto {
      justify-content: center;
      width: 36px;
      min-height: 36px;
      margin: 0;
      padding: 0;
      border-radius: 50%;
      /* quem usa escolhe a força da tinta em repouso (--quieto) */
      color: var(--quieto, var(--ink-2));
      text-decoration: none;
    }
    .reagir.quieto:hover,
    .reagir.quieto[aria-expanded='true'] {
      color: var(--ink);
    }
    /* na parede (o pé de um post do Feed): giz em vez de caneta, num botão do tamanho do dedo */
    .reagir.giz {
      gap: 7px;
      min-height: 44px;
      margin: 0;
      padding: 0 12px;
      border-radius: 22px;
      color: var(--wall-ink);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.95rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      text-decoration: none;
    }
    .reagir.giz:hover {
      background: rgb(243 239 230 / 0.1);
    }
    .reagir.giz:focus-visible {
      outline-color: var(--hi);
    }
    /* a reação que você deu fica à mostra: o botão vira o remendo de feltro, com o seu emoji */
    .reagir.giz.dada {
      background-color: #f8f0dc;
      background-image: radial-gradient(rgb(122 74 38 / 0.09) 0.8px, transparent 1.1px);
      background-size: 4px 4px;
      color: #151515;
      outline: 1.5px dashed rgb(122 74 38 / 0.6);
      outline-offset: -5px;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.35),
        0 3px 6px -3px rgb(0 0 0 / 0.45);
      rotate: -1.5deg;
    }
    .reagir.giz.dada:focus-visible {
      box-shadow:
        0 0 0 3px var(--hi),
        0 3px 6px -3px rgb(0 0 0 / 0.45);
    }
    /* num post estreito (o Feed no celular) a reação dada fica só com o emoji, para o bilhete da nota
       caber na mesma linha; o nome continua no botão, para o leitor de tela e no mouse parado */
    @container (max-width: 400px) {
      .reagir.giz.dada .rp-nome {
        display: none;
      }
      .reagir.giz.dada {
        padding: 0 11px;
      }
    }
    /* o botão quieto mora na ponta direita da linha: a fileira cresce para a esquerda dele */
    :host(.rp-quieto) .fileira {
      left: auto;
      right: -6px;
    }
    /* sem lugar em cima (o primeiro comentário da folha): a fileira sai por baixo do botão */
    .fileira.para-baixo {
      top: calc(100% + 6px);
      bottom: auto;
    }
    /* a fileira: o mesmo feltro costurado do remendo, saindo de cima do botão */
    .fileira {
      position: absolute;
      bottom: calc(100% + 6px);
      left: -10px;
      z-index: 20;
      display: flex;
      gap: 2px;
      padding: 7px 8px;
      border-radius: 28px;
      background-color: #f8f0dc;
      /* a trama do feltro: um pontilhado leve na cor da linha */
      background-image: radial-gradient(rgb(122 74 38 / 0.09) 0.8px, transparent 1.1px);
      background-size: 4px 4px;
      outline: 1.5px dashed rgb(122 74 38 / 0.6);
      outline-offset: -5px;
      box-shadow:
        0 1px 2px rgb(0 0 0 / 0.35),
        0 10px 20px -6px rgb(0 0 0 / 0.45);
      rotate: -1.2deg;
      animation: sobe 160ms var(--ease-physical);
    }
    /* o painel do "+": a mesma folha de feltro, maior */
    /* o instante em que o catálogo de emojis ainda está chegando */
    .emoji-esperando {
      display: block;
      padding: 10px 6px;
      font-family: var(--f-hand);
      font-size: 1rem;
      color: rgb(21 21 21 / 0.7);
    }
    .fileira.painel {
      padding: 12px;
      border-radius: 18px;
      outline-offset: -6px;
      rotate: 0deg;
    }
    .opcao.mais {
      color: #151515;
      background: rgb(21 21 21 / 0.07);
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
      animation: pula 220ms calc(var(--i) * 25ms) var(--ease-physical) both;
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
  /** A ficha que recebe a reação. Sem ela (a reação a um comentário), valem `current` e `picked`. */
  readonly target = input<ReactionTarget | null>(null);
  /** Sem ficha: a reação de agora, que vem de quem usa. */
  readonly current = input<ReactionId | null>(null);
  /** Sem ficha: a reação escolhida (null: tirou a que tinha). */
  readonly picked = output<ReactionId | null>();
  /** Só o desenho no botão, sem a palavra. */
  readonly quiet = input(false);
  /** O botão escrito a giz, direto na parede (o pé de um post do Feed). */
  readonly wall = input(false);
  /** A fileira abre por baixo do botão (não cabia em cima, dentro da folha que rola). */
  protected readonly below = signal(false);
  protected readonly ReactIcon = SmilePlus;
  protected readonly kinds = REACTIONS;
  private readonly reactions = inject(Reactions);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  protected readonly MoreIcon = Plus;
  protected readonly open = signal(false);

  /** O painel do "+" aberto, no lugar da fileira. */
  protected readonly more = signal(false);
  protected readonly quick = isQuickReaction;
  protected readonly mine = computed(() => {
    const t = this.target();
    return t ? this.reactions.mineOn(t.code, t.ref) : this.current();
  });
  protected readonly mineKind = computed(() => (this.mine() ? reactionOf(this.mine()!) : null));

  constructor() {
    closeOnOutsidePress(this.open, this.host, () => this.close());
  }

  protected toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) {
      this.below.set(this.cramped(ROW_ROOM));
      this.guardSheet();
    }
    // pelo teclado, o foco vai para a reação dada (ou a primeira)
    if (this.open()) setTimeout(() => (this.host.nativeElement.querySelector<HTMLElement>('.opcao.escolhida') ?? this.host.nativeElement.querySelector<HTMLElement>('.opcao'))?.focus());
  }

  /**
   * O Esc que fecha a fileira é só dela. Dentro de uma leitura (um `<dialog>`), o navegador também manda
   * fechar o diálogo, num evento à parte (`cancel`): ele é recusado enquanto a fileira está aberta, ou
   * acabou de fechar por esse mesmo Esc.
   */
  protected keep(e: Event): void {
    e.stopPropagation();
    this.escapedAt = performance.now();
  }
  private escapedAt = -Infinity;
  private sheet: HTMLDialogElement | null = null;
  private readonly onSheetCancel = (e: Event) => {
    const escaped = performance.now() - this.escapedAt < 250;
    if (!this.open() && !escaped) return;
    e.preventDefault();
    // o Esc não passou pela fileira (o foco estava no botão): fecha por aqui
    if (this.open()) this.more() ? this.fewerEmojis() : this.close(true);
  };
  private readonly dropSheet = inject(DestroyRef).onDestroy(() => this.sheet?.removeEventListener('cancel', this.onSheetCancel));

  /** Passa a ouvir o `cancel` do diálogo em volta (uma vez só). */
  private guardSheet(): void {
    if (this.sheet) return;
    this.sheet = this.host.nativeElement.closest('dialog');
    this.sheet?.addEventListener('cancel', this.onSheetCancel);
  }

  /** O "+": o painel de todos os emojis no lugar da fileira (ele é alto: sem lugar em cima, sai por baixo). */
  protected moreEmojis(): void {
    this.below.set(this.cramped(PANEL_ROOM));
    this.more.set(true);
  }

  /** Esc no painel de todos os emojis: volta para a fileira, com o foco no "+" de onde ele abriu. */
  protected fewerEmojis(): void {
    this.below.set(this.cramped(ROW_ROOM));
    this.more.set(false);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.opcao.mais')?.focus());
  }

  protected pick(id: ReactionId): void {
    const next = this.mine() === id ? null : id;
    const t = this.target();
    if (t) void this.reactions.react(t, next);
    else this.picked.emit(next);
    this.close(true);
  }

  /**
   * Dentro de uma folha que rola (`data-rola`), o que sai por cima do botão pode ficar cortado pela
   * borda de cima, se não houver `room` px até ela: aí sai por baixo. Fora de uma folha dessas, sempre
   * por cima, como sempre foi.
   */
  private cramped(room: number): boolean {
    const box = this.host.nativeElement.closest<HTMLElement>('[data-rola]');
    if (!box) return false;
    return this.trigger().nativeElement.getBoundingClientRect().top - box.getBoundingClientRect().top < room;
  }

  protected close(refocus = false): void {
    this.open.set(false);
    this.more.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }

}

/** A folha de quem reagiu, aberta pelo balão: abas por reação e a lista, como no WhatsApp. */
@Component({
  selector: 'app-reaction-sheet',
  imports: [BackdropClose, LucideAngularModule, EmojiPanel, PersonPhoto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet reacoes" aria-labelledby="reacoes-titulo" (close)="sheet.target.set(null)" (backdropClose)="close()">
      @if (sheet.target(); as t) {
        <div class="folha">
          <header class="topo">
            <h2 id="reacoes-titulo">Reações <span class="obra">{{ t.titulo }}</span></h2>
            <button type="button" class="fechar" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="20" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
          </header>

          @if (canReact()) {
            <div class="sua" role="group" aria-label="Sua reação">
              @for (k of kinds; track k.id) {
                <button type="button" class="opcao" [class.escolhida]="mine() === k.id" [attr.aria-pressed]="mine() === k.id" [attr.aria-label]="k.label" [title]="k.label" (click)="pick(k.id)">{{ k.emoji }}</button>
              }
              @if (mine() && !quick(mine()!)) {
                <button type="button" class="opcao escolhida" aria-pressed="true" [attr.aria-label]="'Sua reação: ' + mine() + '. Tirar'" (click)="pick(mine()!)">{{ mine() }}</button>
              }
              <button type="button" class="opcao mais" [attr.aria-expanded]="more()" aria-label="Outro emoji" title="Outro emoji" (click)="more.set(!more())">
                <lucide-icon [img]="MoreIcon" [size]="20" [strokeWidth]="2.6" aria-hidden="true" />
              </button>
            </div>
            @if (more()) {
              <div class="mais-painel">
                @defer (on immediate) {
                  <app-emoji-panel [current]="mine()" (picked)="pick($event); more.set(false)" />
                } @placeholder {
                  <span class="emoji-esperando" role="status">Abrindo os emojis…</span>
                }
              </div>
            }
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
                <li class="pessoa">
                  <!-- a foto do perfil de quem reagiu e o nome: os dois levam ao perfil da pessoa -->
                  <button type="button" class="foto-perfil" tabindex="-1" aria-hidden="true" (click)="openProfile(r.codigo)">
                    <app-person-photo [code]="r.codigo" [name]="r.nome" [face]="faceOf(r)" />
                  </button>
                  <span class="quem">
                    @if (r.codigo === me()) {
                      <button type="button" class="nome nome-link" aria-label="Você: ver o seu perfil" (click)="openProfile(r.codigo)">Você</button>
                    } @else {
                      <button type="button" class="nome nome-link" [attr.aria-label]="'Ver o perfil de ' + r.nome" (click)="openProfile(r.codigo)">{{ r.nome }}</button>
                    }
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
    /* a sua reação: a fileira de feltro costurado, a escolhida com o fundo de lápis */
    .sua {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 2px;
      margin: 0 0 14px;
      padding: 7px 8px;
      border-radius: 28px;
      background-color: #f8f0dc;
      /* a trama do feltro: um pontilhado leve na cor da linha */
      background-image: radial-gradient(rgb(122 74 38 / 0.09) 0.8px, transparent 1.1px);
      background-size: 4px 4px;
      outline: 1.5px dashed rgb(122 74 38 / 0.6);
      outline-offset: -5px;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
    }
    .opcao.mais {
      color: var(--ink);
      background: rgb(21 21 21 / 0.07);
    }
    /* o instante em que o catálogo de emojis ainda está chegando */
    .emoji-esperando {
      display: block;
      padding: 10px 6px;
      font-family: var(--f-hand);
      font-size: 1rem;
      color: rgb(21 21 21 / 0.7);
    }
    .mais-painel {
      display: flex;
      justify-content: center;
      margin: -6px 0 14px;
      padding: 12px;
      border-radius: 18px;
      background-color: #f8f0dc;
      background-image: radial-gradient(rgb(122 74 38 / 0.09) 0.8px, transparent 1.1px);
      background-size: 4px 4px;
      outline: 1.5px dashed rgb(122 74 38 / 0.6);
      outline-offset: -6px;
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
      --foto: 40px;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 6px 2px;
    }
    .pessoa + .pessoa {
      border-top: 1px dashed rgb(21 21 21 / 0.2);
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
    .nome-link {
      justify-self: start;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      text-align: left;
      text-decoration: underline 1.5px;
      text-underline-offset: 3px;
      cursor: pointer;

      &:hover {
        text-decoration-thickness: 2.5px;
      }
      &:focus-visible {
        outline: 3px solid var(--ink);
        outline-offset: 2px;
      }
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
  private readonly profiles = inject(ProfileStore);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly CloseIcon = X;
  protected readonly MoreIcon = Plus;
  protected readonly kinds = REACTIONS;
  protected readonly quick = isQuickReaction;
  /** O painel do "+" aberto embaixo da fileira. */
  protected readonly more = signal(false);
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
        this.more.set(false);
        napWall();
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

  /** O perfil de quem reagiu: a folha fecha e a página dele abre. */
  protected openProfile(code: string): void {
    this.close();
    void this.router.navigate(['/perfil', code]);
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected emoji(id: ReactionId): string {
    return reactionOf(id).emoji;
  }

  protected label(id: ReactionId): string {
    return reactionOf(id).label;
  }

  /** A foto do perfil de quem reagiu: a que veio da nuvem; a minha é a do perfil daqui (a mais nova). */
  protected faceOf(r: Reaction): PersonFace | null {
    if (r.codigo !== this.me()) return r.foto ?? null;
    const mine = this.profiles.profile();
    return { emoji: mine.emoji, cor: mine.photo };
  }

  /** "hoje", "ontem", "3 de outubro". */
  protected when(iso: string): string {
    return dayLabel(localDayOf(iso));
  }
}

