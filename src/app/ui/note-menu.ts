import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, input, output, signal, untracked, viewChild, viewChildren } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { CopyContexts } from '../core/copy-context';
import { CloudSync } from '../core/cloud-sync';
import { Desk } from '../core/desk';
import { StudyStore } from '../core/study-store';
import { LINK_START_KEY, fichaLink, hasLink } from '../core/ficha-link';
import { NoteDone } from '../core/note-done';
import { notesAsText } from '../core/note-copy';
import { NotePin } from '../core/note-pin';
import { Reactions } from '../core/reactions';
import { Review, isDone, isPinnedNote } from '../core/review';
import { canManage, canWrite } from '../core/shared-notes';
import { SharedStore } from '../core/shared-store';
import { readText } from '../core/storage';
import { fold } from '../core/text';
import { ICON, IconModule } from './icons';
import { NoteSelection } from './note-selection';
import { Toasts } from './toast';
// só usada dentro do @defer do molde, e num import só dela: a folha de compartilhar chega num pedaço à parte
import { ShareSheet } from './share-sheet';

/** Quantos menus já nasceram (o id de cada um). */
let menus = 0;

/** Quanto o dedo segura parado, no mural, até o menu abrir (o mesmo do toque longo do celular). */
export const HOLD_MS = 500;
/** Quanto o dedo pode andar segurando, antes de virar rolagem. */
const HOLD_SLOP = 10;
/** O atalho de copiar, como está escrito no teclado de quem usa. */
const COPY_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘C' : 'Ctrl+C';

/** O que o quadro do Kanban acrescenta ao menu de uma ficha dele. */
export interface NoteMenuBoard {
  /** O nome da coluna seguinte (a da seta da ficha); null, a ficha está na última. */
  next: string | null;
  advance: () => void;
  /** O editor da anotação, na aba Kanban (etapa, importância, observação, dependências). */
  details: () => void;
}

/** Onde o menu abre e para onde o foco volta. */
export interface NoteMenuAt {
  review: Review;
  /** O ponto da tela: o ponteiro, o dedo, ou o canto da ficha (pelo teclado). */
  x: number;
  y: number;
  /** O botão da ficha: o foco volta para ele ao fechar. */
  back: HTMLElement | null;
  /**
   * Quem abriu: o mouse (o menu nasce no ponteiro), o teclado (Shift+F10, a tecla de menu: o foco vai
   * para a primeira opção) ou o dedo (o menu abre acima dele, fora do polegar, centrado nele).
   */
  by?: 'mouse' | 'teclado' | 'toque';
  board?: NoteMenuBoard | null;
}

/** Uma opção do menu. */
interface NoteMenuItem {
  id: string;
  label: string;
  icon: LucideIconData;
  run: () => void;
  /** Apagar, sair: por último, depois da costura, na tinta vermelha. */
  danger?: boolean;
  /** Abre uma folha (Compartilhar, Abrir, Editar). */
  dialog?: boolean;
  /** O atalho que faz o mesmo, impresso miúdo na ponta. */
  keys?: string;
  /** Uma frase a mais, para quem para o mouse em cima. */
  hint?: string;
}

/**
 * O menu do botão direito numa anotação (no mural, em todas as vistas, e no quadro do Kanban): o
 * mesmo remendo de feltro costurado do "Mais" das abas (ui/tab-more.ts), que nasceu do "Citar" da
 * leitura e do painel de emojis das reações, com o nome da anotação no alto e as ações dela em levas
 * separadas pela costura: abrir e editar; copiar o texto, as marcadas e o link; fixar, finalizar, o
 * que o quadro faz, compartilhar; e, sozinho no fim, em vermelho, apagar (ou sair, na compartilhada
 * de outra pessoa). Só aparece o que vale para aquela anotação e para quem a vê: a visita só abre e
 * copia; quem só lê a compartilhada não edita nem finaliza.
 *
 * Fica na camada de cima da página (o popover do navegador: nada o corta), ao lado do ponteiro, sem
 * sair da tela (aberto pelo dedo, em cima dele); o Esc, o toque fora, rolar a página (tirando a ficha do
 * lugar) ou mudar o tamanho dela fecham. É um menu de verdade: as setas andam (parando nas pontas, como
 * no Mais), Home e End vão às pontas, uma letra pula para a próxima opção com ela, Enter ou espaço
 * escolhe, Tab e Esc fecham; o foco volta para a ficha. Quem abre é o `NoteMenuTrigger` da página (o
 * botão direito, o dedo segurado, Shift+F10).
 */
@Component({
  selector: 'app-note-menu',
  imports: [IconModule, ShareSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- fica montado (escondido pelo popover): abrir é só mostrar, medir e pôr o foco. O popover é
         "manual": o "auto" fecharia no dedo que sobe do toque longo que acabou de abri-lo -->
    <div
      #cardapio
      [id]="menuId"
      class="menu-da-nota"
      popover="manual"
      role="menu"
      tabindex="-1"
      [attr.aria-labelledby]="menuId + '-nome'"
      (toggle)="onToggle($event)"
      (keydown)="onKey($event)"
      (contextmenu)="$event.preventDefault()"
    >
      @if (at(); as a) {
        <p class="legenda" [id]="menuId + '-nome'"><span class="sr-only">Ações de </span>{{ a.review.game.name }}</p>
        @for (leva of sections(); track $index) {
          <div role="group" class="leva" [class.costurada]="!$first">
            @for (x of leva; track x.id) {
              <button
                #opcao
                type="button"
                role="menuitem"
                class="escolha"
                [class.perigo]="x.danger"
                [attr.data-k]="x.id"
                [attr.aria-haspopup]="x.dialog ? 'dialog' : null"
                [attr.aria-keyshortcuts]="x.keys ? copyShortcut : null"
                [attr.title]="x.hint ?? null"
                tabindex="-1"
                (click)="choose(x)"
              >
                <lucide-icon class="ico" [img]="x.icon" [size]="18" aria-hidden="true" />
                <span class="nome">{{ x.label }}</span>
                @if (x.keys) {
                  <kbd class="atalho" aria-hidden="true">{{ x.keys }}</kbd>
                }
              </button>
            }
          </div>
        }
      }
    </div>
    @if (shareFor(); as id) {
      @defer (on immediate) {
        <app-share-sheet [noteId]="id" (closed)="closeShare()" (left)="closeShare()" />
      }
    }
  `,
  styleUrl: './note-menu.scss',
})
export class NoteMenu {
  /** De quem é o mural: null, o seu (no de outra pessoa, só abrir e copiar). */
  readonly owner = input<string | null>(null);
  /** O código de quem escreveu, para o link das fichas no mural de outra pessoa. */
  readonly ownerCode = input<string | null>(null);
  /** As fichas em segredo no mural de quem se visita: o texto não se copia. */
  readonly secret = input<ReadonlySet<string>>(new Set());
  /** As marcadas da página (Ctrl+clique): no menu de uma delas, copiar todas. */
  readonly selection = input<NoteSelection | null>(null);
  /** Abrir: a leitura da anotação (cada página abre do jeito dela). */
  readonly opened = output<string>();

  private readonly desk = inject(Desk);
  private readonly study = inject(StudyStore);
  private readonly shared = inject(SharedStore);
  private readonly reactions = inject(Reactions);
  private readonly notePin = inject(NotePin);
  private readonly noteDone = inject(NoteDone);
  private readonly toasts = inject(Toasts);
  private readonly copyContexts = inject(CopyContexts);
  private readonly sync = inject(CloudSync);

  /** A anotação do menu aberto (e onde ele abriu). */
  protected readonly at = signal<NoteMenuAt | null>(null);
  /** A anotação da folha de compartilhar aberta pelo menu. */
  protected readonly shareFor = signal<string | null>(null);
  protected readonly menuId = `menu-da-nota-${++menus}`;
  /** O Ctrl+C (⌘C no Mac) das marcadas, para o leitor de tela. */
  protected readonly copyShortcut = COPY_KEY === '⌘C' ? 'Meta+C' : 'Control+C';
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('cardapio');
  private readonly options = viewChildren<ElementRef<HTMLButtonElement>>('opcao');
  /** O botão da ficha da folha de compartilhar: o foco volta para ele quando ela fecha. */
  private shareBack: HTMLElement | null = null;

  /** As levas de opções da anotação aberta, só as que valem para ela e para quem a vê. */
  protected readonly sections = computed<NoteMenuItem[][]>(() => {
    const a = this.at();
    if (!a) return [];
    const r = a.review;
    const id = r.id;
    const mine = this.owner() === null;
    const entry = mine ? (this.shared.get(id) ?? null) : null;
    const writes = mine && (!entry || canWrite(entry.papel));
    const first: NoteMenuItem[] = [{ id: 'abrir', label: 'Abrir', icon: ICON.aumentar, dialog: true, run: () => this.opened.emit(id) }];
    if (writes) first.push({ id: 'editar', label: 'Editar', icon: ICON.editar, dialog: true, run: () => this.desk.editReview(id) });

    const copy: NoteMenuItem[] = [];
    if (!this.secret().has(id)) copy.push({ id: 'copiar', label: 'Copiar o conteúdo', icon: ICON.copiar, hint: 'O título e o texto, sem as marcas', run: () => void this.copy(r) });
    // a anotação é uma das marcadas (Ctrl+clique): copiar todas, como o Ctrl+C
    const sel = this.selection();
    const marked = sel?.ids() ?? [];
    if (sel && marked.length > 1 && marked.includes(id)) {
      copy.push({ id: 'copiar-marcadas', label: `Copiar as ${marked.length} marcadas`, icon: ICON.camadas, keys: COPY_KEY, run: () => void sel.copy() });
    }
    const code = this.linkCode(r, entry);
    // (a ficha em segredo de quem se visita não dá nada dela, nem o link)
    if (code && hasLink(r) && !this.secret().has(id)) {
      copy.push({ id: 'link', label: 'Copiar o link', icon: ICON.link, hint: 'O endereço que abre só esta anotação', run: () => void this.copyLink(code, r, mine && !entry) });
    }

    const act: NoteMenuItem[] = [];
    if (mine) {
      // fixar é do mural (no quadro não muda nada à vista); de cada um, também na compartilhada
      if (!a.board) {
        const pinned = isPinnedNote(r);
        act.push({ id: 'fixar', label: pinned ? 'Desafixar' : 'Fixar no topo', icon: pinned ? ICON.desafixar : ICON.fixar, run: () => this.notePin.set(id, !pinned) });
      }
      if (writes) {
        const done = isDone(r);
        act.push({ id: 'finalizar', label: done ? 'Reabrir' : 'Finalizar', icon: done ? ICON.recomecar : ICON.pronto, run: () => this.noteDone.finishAsking(id, !done) });
      }
      if (a.board?.next) act.push({ id: 'avancar', label: `Levar para ${a.board.next}`, icon: ICON.proximo, run: a.board.advance });
      if (a.board) {
        act.push({ id: 'quadro', label: 'Ajustes no quadro', icon: ICON.ajustar, dialog: true, hint: 'A etapa, a importância, a observação e as dependências, na aba Kanban', run: a.board.details });
      }
      // a carta é de cada um, também na compartilhada de quem só lê: o editor na aba Flashcard (vira carta, ou muda a frente e os baralhos)
      const card = this.study.cardOf().has(id);
      act.push({
        id: 'estudar',
        label: card ? 'Editar a carta' : 'Estudar com ela…',
        icon: ICON.camadas,
        dialog: true,
        hint: card ? 'A frente, os baralhos e o mural, na aba Flashcard' : 'Dá uma frente a ela, para os Flashcards',
        run: () => this.desk.editReview(id, 'flashcard'),
      });
      // dividir com outras pessoas (ou ver quem está, para quem não gere a anotação)
      act.push({ id: 'compartilhar', label: !entry || canManage(entry.papel) ? 'Compartilhar' : 'Pessoas', icon: ICON.pessoas, dialog: true, run: () => this.openShare(id, a.back) });
    }

    const end: NoteMenuItem[] = [];
    if (mine) {
      // a compartilhada de outra pessoa não se apaga: sai-se dela; o dono dela apaga para todos
      const leaves = !!entry && entry.papel !== 'dono';
      const forAll = !!entry && entry.papel === 'dono' && entry.membros.length > 0;
      end.push({
        id: 'apagar',
        label: leaves ? 'Sair da anotação' : forAll ? 'Apagar para todos' : 'Apagar anotação',
        icon: leaves ? ICON.sair : ICON.apagar,
        danger: true,
        dialog: true,
        run: () => this.desk.removeReview(id),
      });
    }
    return [first, copy, act, end].filter((x) => x.length);
  });

  /** Onde a ficha estava quando o menu abriu (a rolagem que não a tira do lugar não fecha). */
  private anchor: { x: number; y: number } | null = null;
  /** O tamanho da janela quando o menu abriu (o aviso de "mudou o tamanho" sem mudar não fecha). */
  private viewport = { w: 0, h: 0 };
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Rolou a página ou mudou o tamanho: o menu fecha (a ficha saiu do lugar onde ele abriu). A rolagem
   * que não mexe na ficha (a de outra coluna, a que um passo anterior ainda termina) não conta.
   */
  private readonly away = (e: Event) => {
    if (e.type === 'resize') {
      // o tamanho de verdade, um tico depois (a janela que pisca de tamanho e volta não fecha)
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        if (innerWidth !== this.viewport.w || innerHeight !== this.viewport.h) this.close(false);
      }, 120);
      return;
    }
    if (e.type === 'scroll') {
      if (e.target instanceof Node && this.panel().nativeElement.contains(e.target)) return;
      const back = this.at()?.back;
      const was = this.anchor;
      if (back?.isConnected && was) {
        const r = back.getBoundingClientRect();
        if (Math.abs(r.left - was.x) < 2 && Math.abs(r.top - was.y) < 2) return;
      }
    }
    this.close(false);
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unlisten());
    // aberto: mede e põe no lugar, depois de desenhar as opções da anotação
    afterRenderEffect(() => {
      const a = this.at();
      if (!a) return;
      untracked(() => this.place(a));
    });
  }

  /** O menu está aberto para esta anotação. */
  isOpenFor(id: string): boolean {
    return this.at()?.review.id === id;
  }

  /** Abre o menu da anotação no ponto dado (outro aberto fecha antes). */
  show(at: NoteMenuAt): void {
    const el = this.panel().nativeElement;
    if (typeof el.showPopover !== 'function') return;
    this.at.set(at);
    const r = at.back?.getBoundingClientRect();
    this.anchor = r ? { x: r.left, y: r.top } : null;
    this.viewport = { w: innerWidth, h: innerHeight };
    if (!el.matches(':popover-open')) el.showPopover();
    this.listen();
  }

  /** Fecha; `focus`: o foco volta para a ficha (o Esc, o Tab, a escolha). */
  close(focus: boolean): void {
    const a = this.at();
    if (!a) return;
    const el = this.panel().nativeElement;
    const inside = el.contains(document.activeElement);
    this.at.set(null);
    this.unlisten();
    if (typeof el.hidePopover === 'function' && el.matches(':popover-open')) el.hidePopover();
    if (focus || inside) this.focusBack(a.back);
  }

  /**
   * O ponto vira o canto de cima e à esquerda do menu; sem lugar à direita ou embaixo, ele vira para o
   * outro lado do ponto, e nunca sai da tela (o comprido demais rola por dentro).
   */
  private place(a: NoteMenuAt): void {
    const el = this.panel().nativeElement;
    if (!el.matches(':popover-open')) return;
    const margin = 8;
    el.style.maxHeight = `${Math.max(120, innerHeight - margin * 2)}px`;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // do lado do ponto que tem lugar (`gap` longe dele); sem lugar nem de um lado nem do outro, encostado
    // na beirada. O dedo: em cima dele primeiro (o polegar cobriria o menu embaixo), centrado nele
    const side = (at: number, size: number, room: number, gap: number, before = false): number => {
      const after = at + gap + size <= room - margin ? at + gap : null;
      const ahead = at - gap - size >= margin ? at - gap - size : null;
      return (before ? (ahead ?? after) : (after ?? ahead)) ?? Math.max(margin, room - margin - size);
    };
    const touch = a.by === 'toque';
    const left = touch ? Math.max(margin, Math.min(a.x - w / 2, innerWidth - margin - w)) : side(a.x, w, innerWidth, 2);
    const top = touch ? side(a.y, h, innerHeight, 24, true) : side(a.y, h, innerHeight, 2);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    // o feltro brota do canto (no dedo, da beirada) que está do lado do ponto
    const up = top < a.y;
    el.style.transformOrigin = `${touch ? 'center' : left < a.x ? 'right' : 'left'} ${up ? 'bottom' : 'top'}`;
    el.classList.toggle('em-cima', up);
    if (a.by === 'teclado') this.focusAt(0);
    else el.focus({ preventScroll: true });
  }

  /** O aperto fora do menu fecha (o foco fica onde a pessoa apertou). */
  private readonly outside = (e: PointerEvent) => {
    if (!(e.target instanceof Node) || !this.panel().nativeElement.contains(e.target)) this.close(false);
  };

  private listen(): void {
    document.addEventListener('pointerdown', this.outside, true);
    addEventListener('resize', this.away);
    addEventListener('scroll', this.away, { capture: true, passive: true });
  }

  private unlisten(): void {
    clearTimeout(this.resizeTimer);
    document.removeEventListener('pointerdown', this.outside, true);
    removeEventListener('resize', this.away);
    removeEventListener('scroll', this.away, { capture: true });
  }

  /**
   * O popover fechou por fora daqui (a página que o tirou da tela): o menu some, e o foco que estava
   * nele (ou que caiu no nada com ele) volta para a ficha.
   */
  protected onToggle(e: Event): void {
    if ((e as ToggleEvent).newState !== 'closed') return;
    const a = this.at();
    if (!a) return;
    this.at.set(null);
    this.unlisten();
    const now = document.activeElement;
    if (!now || now === document.body || this.panel().nativeElement.contains(now)) this.focusBack(a.back);
  }

  /** Escolheu: o menu fecha com o foco de volta na ficha, e a ação roda (a folha que abrir leva o foco). */
  protected choose(x: NoteMenuItem): void {
    this.close(true);
    x.run();
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'Tab') {
      // fecha aqui, com o foco de volta na ficha (o fechar do popover deixaria o foco no nada)
      e.preventDefault();
      this.close(true);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const list = this.options().map((o) => o.nativeElement);
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    // como no Mais das abas: as setas param nas pontas
    if (e.key === 'ArrowDown') next = at < 0 ? 0 : Math.min(list.length - 1, at + 1);
    else if (e.key === 'ArrowUp') next = at < 0 ? list.length - 1 : Math.max(0, at - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      // a letra: a próxima opção que começa com ela (sem ligar para acento nem caixa)
      const k = fold(e.key);
      for (let i = 1; i <= list.length; i++) {
        const j = (Math.max(at, -1) + i + list.length) % list.length;
        if (fold(list[j].textContent?.trim() ?? '').startsWith(k)) {
          next = j;
          break;
        }
      }
    }
    if (next === null) return;
    e.preventDefault();
    this.focusAt(next);
  }

  private focusAt(i: number): void {
    const el = this.options()[i]?.nativeElement;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  }

  private focusBack(back: HTMLElement | null): void {
    if (back?.isConnected) back.focus({ preventScroll: true });
  }

  /** O código do link: o do dono da compartilhada de outra pessoa, o seu, ou o de quem se visita. */
  private linkCode(r: Review, entry: ReturnType<SharedStore['get']> | null): string | null {
    if (entry && entry.papel !== 'dono') return entry.dono.codigo;
    if (this.owner() === null) return this.reactions.myCode();
    return r.sharedBy?.codigo ?? this.ownerCode();
  }

  /** O texto de uma anotação só, como o Ctrl+C das marcadas copia (ver core/note-copy.ts). */
  private copy(r: Review): Promise<void> {
    const text = notesAsText([r], this.copyContexts.now());
    return this.toasts.copy(text, 'Copiei o texto da anotação.', 'Não deu para copiar. Tente de novo.');
  }

  /**
   * O link que abre só esta anotação, começando como o último que a pessoa escolheu (ver
   * ui/link-sheet.ts). A sua que mudou depois do último envio avisa, como a folha do link: quem abrir
   * agora ainda vê a de antes.
   */
  private copyLink(code: string, r: Review, own: boolean): Promise<void> {
    const open = readText(LINK_START_KEY) !== 'nao';
    const at = this.sync.lastSyncAt();
    const pending = own && this.sync.status() !== 'fora' && (at === null || Date.parse(r.updatedAt) > at);
    const done = pending ? 'Copiei o link. A anotação ainda vai para a nuvem: até lá, quem abrir vê a de antes.' : 'Copiei o link da anotação.';
    return this.toasts.copy(fichaLink(code, r.id, undefined, open), done, 'Não deu para copiar o link. Tente de novo.');
  }

  private openShare(id: string, back: HTMLElement | null): void {
    this.shareBack = back;
    this.shareFor.set(id);
  }

  protected closeShare(): void {
    this.shareFor.set(null);
    this.focusBack(this.shareBack);
    this.shareBack = null;
  }
}

/** O navegador sabe pôr o menu na camada de cima (sem isso, fica o menu do navegador). */
export const popoverSupported = (): boolean => typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

/** As fichas do mural (a caixa de cada uma, ver pages/wall-cards.ts) e as linhas da Lista (ver ui/note-index.ts). */
export const WALL_NOTES = '.lugar[data-lugar], .linha[data-ficha]';
/** O id da anotação de uma ficha do mural ou de uma linha da Lista. */
export const wallNoteId = (el: Element): string | null => el.getAttribute('data-lugar') ?? el.getAttribute('data-ficha');

/** Onde o menu abre: cada página diz quais são as fichas dela. */
export interface NoteMenuTriggerConfig {
  /** A página: só as fichas dentro dela abrem o menu. */
  host: HTMLElement;
  /** As fichas (a caixa de cada uma) e o atributo com o id da anotação. */
  markable: string;
  idOf: (el: Element) => string | null;
  /** Se o menu abre agora (o mural de anotações; não marcando para o lado a lado). */
  on: () => boolean;
  notes: () => ReadonlyMap<string, Review>;
  menu: () => NoteMenu | undefined;
  /**
   * O dedo segurado na ficha abre o menu. Falso onde segurar já é arrastar (o Kanban): lá a página
   * abre o menu quando o dedo segura e solta sem mexer (`openAt`).
   */
  hold: boolean;
  /** O que o quadro acrescenta ao menu daquela ficha. */
  board?: (id: string) => NoteMenuBoard | null;
}

/**
 * Quem abre o menu de uma anotação (ver NoteMenu): o botão direito do mouse, o dedo segurado (no
 * mural; no Kanban, o arrastar decide), Shift+F10 ou a tecla de menu com o foco na ficha. O menu do
 * navegador continua num link do texto e num trecho selecionado (copiar o trecho, abrir o link numa
 * aba), e no navegador sem popover. Criada no construtor da página (precisa do contexto de injeção).
 */
export class NoteMenuTrigger {
  /** O dedo segurando uma ficha (o relógio do toque longo), com a caixa que ele aperta. */
  private hold: { box: HTMLElement; id: string; x: number; y: number; pointer: number; timer: ReturnType<typeof setTimeout> } | null = null;
  /** O toque longo acabou de abrir o menu: o clique de quando o dedo sobe não abre a ficha. */
  private swallowUntil = 0;
  /** O último aperto na página foi de dedo (e o clique dele ainda não veio). */
  private touching = false;
  /** Enquanto o dedo segura: andou (é rolar), subiu ou a página rolou, o relógio para. */
  private readonly move = (e: PointerEvent) => this.onMove(e);
  private readonly stop = () => this.stopHold();

  constructor(private readonly cfg: NoteMenuTriggerConfig) {
    if (typeof document === 'undefined' || !popoverSupported()) return;
    const host = cfg.host;
    const menu = (e: MouseEvent) => this.onMenu(e);
    const key = (e: KeyboardEvent) => this.onKey(e);
    const down = (e: PointerEvent) => this.onDown(e);
    const click = (e: MouseEvent) => this.onClick(e);
    host.addEventListener('contextmenu', menu);
    host.addEventListener('keydown', key);
    host.addEventListener('pointerdown', down);
    host.addEventListener('click', click, true);
    inject(DestroyRef).onDestroy(() => {
      this.stopHold();
      host.removeEventListener('contextmenu', menu);
      host.removeEventListener('keydown', key);
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('click', click, true);
    });
  }

  /** A ficha (a caixa) debaixo do alvo, com a anotação dela, se o menu vale ali. */
  private boxAt(target: EventTarget | null): { box: HTMLElement; review: Review } | null {
    if (!this.cfg.on()) return null;
    const t = target instanceof Element ? target : null;
    const box = t?.closest<HTMLElement>(this.cfg.markable);
    if (!box || !this.cfg.host.contains(box)) return null;
    const id = this.cfg.idOf(box);
    const review = id ? this.cfg.notes().get(id) : undefined;
    return review ? { box, review } : null;
  }

  /**
   * Abre o menu da anotação `id` no ponto, aberto pelo dedo (o Kanban, quando o dedo segura e solta sem
   * arrastar). `box`: a caixa que o dedo apertou (ordenando por tag, a mesma anotação aparece duas vezes).
   */
  openAt(id: string, x: number, y: number, box?: HTMLElement): void {
    const at = box?.isConnected ? box : Array.from(this.cfg.host.querySelectorAll<HTMLElement>(this.cfg.markable)).find((b) => this.cfg.idOf(b) === id);
    const review = this.cfg.notes().get(id);
    if (!at || !review || !this.cfg.on()) return;
    this.open(at, review, x, y, 'toque');
  }

  private open(box: HTMLElement, review: Review, x: number, y: number, by: NoteMenuAt['by']): void {
    const menu = this.cfg.menu();
    if (!menu) return;
    // o toque longo pode ter começado a selecionar o texto da ficha
    const sel = getSelection();
    if (sel && !sel.isCollapsed && box.contains(sel.anchorNode)) sel.removeAllRanges();
    menu.show({ review, x, y, by, back: box.querySelector<HTMLElement>('.hit'), board: this.cfg.board?.(review.id) ?? null });
  }

  private onMenu(e: MouseEvent): void {
    const hit = this.boxAt(e.target);
    if (!hit) return;
    const t = e.target as Element;
    // um link do texto e um trecho selecionado na ficha ficam com o menu do navegador
    const sel = getSelection();
    if (t.closest('a[href]') || (sel && !sel.isCollapsed && hit.box.contains(sel.anchorNode))) return;
    e.preventDefault();
    const menu = this.cfg.menu();
    // aberto pelo teclado agora mesmo (o navegador ainda manda o contextmenu da tecla), ou pelo dedo
    if (!menu || menu.isOpenFor(hit.review.id)) return;
    // segurar o dedo: o Android manda o contextmenu; onde segurar é arrastar (o Kanban), a página decide
    if (this.touching) {
      if (this.cfg.hold) this.fireHold();
      return;
    }
    // sem posição (o contextmenu da tecla de menu, em alguns navegadores): o canto da ficha
    if (!e.clientX && !e.clientY) {
      const r = hit.box.getBoundingClientRect();
      this.open(hit.box, hit.review, r.left + 16, r.top + 16, 'teclado');
      return;
    }
    this.open(hit.box, hit.review, e.clientX, e.clientY, 'mouse');
  }

  private onKey(e: KeyboardEvent): void {
    if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) || e.ctrlKey || e.altKey || e.metaKey) return;
    this.touching = false;
    const hit = this.boxAt(e.target);
    if (!hit) return;
    // num campo (o texto de uma tarefa), a tecla é do campo
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    const r = hit.box.getBoundingClientRect();
    this.open(hit.box, hit.review, r.left + 16, r.top + 16, 'teclado');
  }

  private onDown(e: PointerEvent): void {
    this.stopHold();
    // um aperto novo (num botão do menu, por exemplo) já não é o dedo que subiu do toque longo
    this.swallowUntil = 0;
    this.touching = e.pointerType === 'touch';
    if (!this.touching || !this.cfg.hold || !e.isPrimary) return;
    const hit = this.boxAt(e.target);
    if (!hit || (e.target as Element).closest('a[href], input, textarea, select')) return;
    this.hold = { box: hit.box, id: hit.review.id, x: e.clientX, y: e.clientY, pointer: e.pointerId, timer: setTimeout(() => this.fireHold(), HOLD_MS) };
    addEventListener('pointermove', this.move, { passive: true });
    addEventListener('pointerup', this.stop);
    addEventListener('pointercancel', this.stop);
    addEventListener('scroll', this.stop, { capture: true, passive: true });
  }

  private onMove(e: PointerEvent): void {
    const h = this.hold;
    // o dedo andou: é rolar a tela, não segurar
    if (h && e.pointerId === h.pointer && Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_SLOP) this.stopHold();
  }

  private fireHold(): void {
    const h = this.hold;
    this.stopHold();
    if (!h) return;
    this.swallowUntil = performance.now() + 900;
    this.openAt(h.id, h.x, h.y, h.box);
  }

  private stopHold(): void {
    if (!this.hold) return;
    clearTimeout(this.hold.timer);
    this.hold = null;
    removeEventListener('pointermove', this.move);
    removeEventListener('pointerup', this.stop);
    removeEventListener('pointercancel', this.stop);
    removeEventListener('scroll', this.stop, { capture: true });
  }

  /** O dedo subiu depois do toque longo: esse clique não abre a leitura (o toque no menu, sim). */
  private onClick(e: MouseEvent): void {
    this.touching = false;
    if (performance.now() > this.swallowUntil || (e.target instanceof Element && e.target.closest('.menu-da-nota'))) return;
    this.swallowUntil = 0;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}
