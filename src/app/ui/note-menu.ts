import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { CopyContexts } from '../core/copy-context';
import { CloudSync } from '../core/cloud-sync';
import { Desk } from '../core/desk';
import { StudyStore } from '../core/study-store';
import { LINK_START_KEY, fichaLink, hasLink } from '../core/ficha-link';
import { isNotes } from '../core/kinds';
import { NoteDone } from '../core/note-done';
import { notesAsText } from '../core/note-copy';
import { NotePin } from '../core/note-pin';
import { Reactions } from '../core/reactions';
import { Review, isDone, isPinnedNote } from '../core/review';
import { canManage, canWrite, removalOf } from '../core/shared-notes';
import { SharedStore } from '../core/shared-store';
import { readText } from '../core/storage';
import { ContextMenu, ContextMenuTrigger, MenuBy, MenuItem, MenuSections } from './context-menu';
import { ICON } from './icons';
import { NoteSelection } from './note-selection';
import { Toasts } from './toast';
// só usada dentro do @defer do molde, e num import só dela: a folha de compartilhar chega num pedaço à parte
import { ShareSheet } from './share-sheet';

export { HOLD_MS } from './context-menu';

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
  by?: MenuBy;
  board?: NoteMenuBoard | null;
}

/**
 * O menu do botão direito numa ficha (no mural, em todas as vistas, e no quadro do Kanban): o remendo de
 * feltro do site (ui/context-menu.ts), com o nome da ficha no alto e as ações dela em levas separadas
 * pela costura: abrir e editar; copiar o texto, as marcadas e o link; fixar, finalizar, o que o quadro
 * faz, o flashcard, compartilhar; e, sozinho no fim, em vermelho, apagar (ou sair, na compartilhada de
 * outra pessoa). Só aparece o que vale para aquela ficha e para quem a vê: a visita só abre e copia; quem
 * só lê a compartilhada não edita nem finaliza; numa resenha (jogos, livros…), o que é só das anotações
 * (fixar, finalizar, o flashcard, compartilhar) não aparece. Quem abre é o `NoteMenuTrigger` da página.
 */
@Component({
  selector: 'app-note-menu',
  imports: [ContextMenu, ShareSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-context-menu #menu [caption]="caption()" [sections]="sections()" (closed)="at.set(null)" />
    @if (shareFor(); as id) {
      @defer (on immediate) {
        <app-share-sheet [noteId]="id" (closed)="closeShare()" (left)="closeShare()" />
      }
    }
  `,
  styles: [':host { display: contents; }'],
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
  /** Abrir: a leitura da ficha (cada página abre do jeito dela). */
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
  private readonly menu = viewChild.required<ContextMenu>('menu');

  /** A ficha do menu aberto (e onde ele abriu). */
  protected readonly at = signal<NoteMenuAt | null>(null);
  /** O nome da ficha, no alto do menu. */
  protected readonly caption = computed(() => this.at()?.review.game.name ?? '');
  /** A anotação da folha de compartilhar aberta pelo menu. */
  protected readonly shareFor = signal<string | null>(null);
  /** O botão da ficha da folha de compartilhar: o foco volta para ele quando ela fecha. */
  private shareBack: HTMLElement | null = null;

  /** As levas de opções da ficha aberta, só as que valem para ela e para quem a vê. */
  protected readonly sections = computed<MenuSections>(() => {
    const a = this.at();
    if (!a) return [];
    const r = a.review;
    const id = r.id;
    const mine = this.owner() === null;
    const note = isNotes(r.kind);
    const entry = mine && note ? (this.shared.get(id) ?? null) : null;
    const writes = mine && (!entry || canWrite(entry.papel));
    const first: MenuItem[] = [{ id: 'abrir', label: 'Abrir', icon: ICON.aumentar, dialog: true, run: () => this.opened.emit(id) }];
    if (writes) first.push({ id: 'editar', label: 'Editar', icon: ICON.editar, dialog: true, run: () => this.desk.editReview(id) });

    const copy: MenuItem[] = [];
    // a resenha de outra pessoa pode estar coberta (Evitar spoilers): o texto dela não se copia daqui
    if (!this.secret().has(id) && (note || mine)) {
      copy.push({ id: 'copiar', label: 'Copiar o conteúdo', icon: ICON.copiar, hint: 'O título e o texto, sem as marcas', run: () => void this.copy(r) });
    }
    // a anotação é uma das marcadas (Ctrl+clique): copiar todas, como o Ctrl+C
    const sel = this.selection();
    const marked = sel?.ids() ?? [];
    if (sel && marked.length > 1 && marked.includes(id)) {
      copy.push({ id: 'copiar-marcadas', label: `Copiar as ${marked.length} marcadas`, icon: ICON.camadas, keys: COPY_KEY, ariaKeys: COPY_KEY === '⌘C' ? 'Meta+C' : 'Control+C', run: () => void sel.copy() });
    }
    const code = this.linkCode(r, entry);
    // (a ficha em segredo de quem se visita não dá nada dela, nem o link)
    if (code && hasLink(r) && !this.secret().has(id)) {
      copy.push({ id: 'link', label: 'Copiar o link', icon: ICON.link, hint: `O endereço que abre só esta ${note ? 'anotação' : 'ficha'}`, run: () => void this.copyLink(code, r, mine && !entry) });
    }

    const act: MenuItem[] = [];
    if (mine && note) {
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
        label: card ? 'Editar o flashcard' : 'Transformar em flashcard…',
        icon: ICON.camadas,
        dialog: true,
        hint: 'A frente, os baralhos e o mural, na aba Flashcard',
        run: () => this.desk.editReview(id, 'flashcard'),
      });
      // dividir com outras pessoas (ou ver quem está, para quem não gere a anotação)
      act.push({ id: 'compartilhar', label: !entry || canManage(entry.papel) ? 'Compartilhar' : 'Pessoas', icon: ICON.pessoas, dialog: true, run: () => this.openShare(id, a.back) });
    }

    const end: MenuItem[] = [];
    if (mine) {
      const { label, leaves } = removalOf(entry, note);
      end.push({ id: 'apagar', label, icon: leaves ? ICON.sair : ICON.apagar, danger: true, dialog: true, run: () => this.desk.removeReview(id) });
    }
    return [first, copy, act, end];
  });

  /** O menu está aberto para esta ficha. */
  isOpenFor(id: string): boolean {
    return this.menu().isOpenFor(id);
  }

  /** Abre o menu da ficha no ponto dado (outro aberto fecha antes). */
  show(at: NoteMenuAt): void {
    this.at.set(at);
    this.menu().show({ key: at.review.id, x: at.x, y: at.y, back: at.back, by: at.by });
  }

  /** Fecha; `focus`: o foco volta para a ficha (o Esc, o Tab, a escolha). */
  close(focus: boolean): void {
    this.menu().close(focus);
  }

  /** O código do link: o do dono da compartilhada de outra pessoa, o seu, ou o de quem se visita. */
  private linkCode(r: Review, entry: ReturnType<SharedStore['get']> | null): string | null {
    if (entry && entry.papel !== 'dono') return entry.dono.codigo;
    if (this.owner() === null) return this.reactions.myCode();
    return r.sharedBy?.codigo ?? this.ownerCode();
  }

  /** O texto de uma ficha só, como o Ctrl+C das marcadas copia (ver core/note-copy.ts). */
  private copy(r: Review): Promise<void> {
    const text = notesAsText([r], this.copyContexts.now());
    return this.toasts.copy(text, isNotes(r.kind) ? 'Copiei o texto da anotação.' : 'Copiei o texto da ficha.', 'Não deu para copiar. Tente de novo.');
  }

  /**
   * O link que abre só esta ficha, começando como o último que a pessoa escolheu (ver ui/link-sheet.ts).
   * A sua que mudou depois do último envio avisa, como a folha do link: quem abrir agora ainda vê a de antes.
   */
  private copyLink(code: string, r: Review, own: boolean): Promise<void> {
    const open = readText(LINK_START_KEY) !== 'nao';
    const at = this.sync.lastSyncAt();
    const pending = own && this.sync.status() !== 'fora' && (at === null || Date.parse(r.updatedAt) > at);
    const what = isNotes(r.kind) ? 'anotação' : 'ficha';
    const done = pending ? `Copiei o link. A ${what} ainda vai para a nuvem: até lá, quem abrir vê a de antes.` : `Copiei o link da ${what}.`;
    return this.toasts.copy(fichaLink(code, r.id, undefined, open), done, 'Não deu para copiar o link. Tente de novo.');
  }

  private openShare(id: string, back: HTMLElement | null): void {
    this.shareBack = back;
    this.shareFor.set(id);
  }

  protected closeShare(): void {
    this.shareFor.set(null);
    if (this.shareBack?.isConnected) this.shareBack.focus({ preventScroll: true });
    this.shareBack = null;
  }
}

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
  /** Se o menu abre agora (não marcando para o lado a lado). */
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
 * Quem abre o menu de uma ficha (ver NoteMenu): o `ContextMenuTrigger` do site, com as fichas da página e
 * a ficha que cada caixa mostra.
 */
export class NoteMenuTrigger extends ContextMenuTrigger {
  constructor(cfg: NoteMenuTriggerConfig) {
    super({
      host: cfg.host,
      targets: cfg.markable,
      keyOf: (box) => {
        const id = cfg.idOf(box);
        return id && cfg.notes().has(id) ? id : null;
      },
      on: cfg.on,
      hold: cfg.hold,
      isOpenFor: (id) => !!cfg.menu()?.isOpenFor(id),
      open: (id, box, x, y, by) => {
        const review = cfg.notes().get(id);
        if (review) cfg.menu()?.show({ review, x, y, by, back: box.querySelector<HTMLElement>('.hit'), board: cfg.board?.(id) ?? null });
      },
    });
  }
}
