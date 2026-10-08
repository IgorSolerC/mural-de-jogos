import { CloudSync } from './core/cloud-sync';
import { CloudMurals } from './core/cloud-murals';
import { ChangeDetectionStrategy, Component, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { Cloud as CloudIconData, LucideAngularModule, LucideIconData, Megaphone, NotebookPen, Plus, Scissors, Settings as SettingsIcon, UsersRound, X } from 'lucide-angular';
import { filter, map } from 'rxjs';
import { Backup } from './core/backup';
import { Desk } from './core/desk';
import { cap, isNotes, profileOf, revisitCountOf } from './core/kinds';
import { Mural } from './core/mural';
import { News } from './core/news';
import { LoginNudge } from './core/login-nudge';
import { Cloud } from './core/cloud-config';
import { CloudAccount, CloudError } from './core/cloud-account';
import { GoogleButton } from './ui/google-button';
import { Follow } from './core/follow';
import { Settings } from './core/settings';
import { ReviewStore } from './core/review-store';
import { ReactionSheetView } from './ui/reactions';
import { SideBySide } from './core/side-by-side';
import { ViewTransitions } from './core/view-transitions';
import { WallView } from './core/wall-view';
import { KindSwitcher } from './ui/kind-switcher';
import { PaperDefs } from './ui/paper-layer';
import { Pin } from './ui/pin';
import { ReviewEditor, SavedEvent } from './ui/review-editor';
import { ReviewReader } from './ui/review-reader';
import { Confirm, ConfirmDialog } from './ui/confirm';
import { NoteBacklinksDialog } from './ui/note-backlinks';
import { Toast, Toasts } from './ui/toast';
import { WishAdder } from './ui/wish-adder';

interface Tab {
  path: string;
  label: string;
  /** Outras rotas que moram dentro desta aba (o lado a lado é uma vista do mural). */
  also?: string[];
  /** Só o desenho na fita (o nome fica para o leitor de tela e a dica): Ajustes é uma ferramenta, não um lugar. */
  icon?: LucideIconData;
  /** O desenho e o nome (o nome some no celular, onde as fitas são estreitas). */
  named?: boolean;
}

/**
 * Amigos: o que quem você segue pregou. É um lugar (como o Mural e a Wishlist), então leva o nome
 * escrito; o desenho de pessoas diz de quem é, e balança quando chega algo. Só com a conta na nuvem.
 */
const FRIENDS_TAB: Tab = { path: '/amigos', label: 'Amigos', icon: UsersRound, named: true };

/** As abas que não existem no mural de anotações (e para onde ele não deixa ficar). */
const NOT_FOR_NOTES = ['/fila', '/wishlist', '/extras'];
/** As páginas que só fazem sentido com notas: no mural de anotações, voltam para o mural. */
const NOTES_AWAY = [...NOT_FOR_NOTES, '/ranking', '/comparar', '/lado-a-lado'];

const TABS: Tab[] = [
  { path: '/', label: 'Mural', also: ['/lado-a-lado'] },
  { path: '/fila', label: 'Pra depois' },
  { path: '/wishlist', label: 'Wishlist' },
  // o Ranking e o Comparar moram dentro de Extras: a fita de Extras fica acesa neles também
  { path: '/extras', label: 'Extras', also: ['/ranking', '/comparar', '/comparar/mural'] },
  // as Novidades se abrem por Ajustes (e pela faixa do topo)
  { path: '/ajustes', label: 'Ajustes', icon: SettingsIcon, also: ['/novidades'] },
];

@Component({
  selector: 'app-root',
  imports: [ConfirmDialog, GoogleButton, NoteBacklinksDialog, KindSwitcher, LucideAngularModule, PaperDefs, Pin, ReactionSheetView, ReviewEditor, ReviewReader, RouterLink, RouterOutlet, Toast, WishAdder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(document:keydown)': 'onGlobalKey($event)' },
})
export class App {
  protected readonly store = inject(ReviewStore);
  protected readonly mural = inject(Mural);
  private readonly view = inject(WallView);
  protected readonly desk = inject(Desk);
  private readonly vt = inject(ViewTransitions);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly side = inject(SideBySide);
  protected readonly backup = inject(Backup);
  /** A sincronização com a nuvem: só age com a nuvem ligada e a pessoa logada (ver core/cloud-sync.ts). */
  private readonly cloudSync = inject(CloudSync);
  /** O link ?mural=CÓDIGO abre o mural de alguém (ver core/cloud-murals.ts). */
  private readonly cloudMurals = inject(CloudMurals);
  /** As novidades do site e a faixa do topo (ver core/news.ts). */
  protected readonly news = inject(News);
  /** Seguir e a aba Amigos (ver core/follow.ts): a fita mostra quantas novidades dos amigos chegaram. */
  private readonly follow = inject(Follow);
  private readonly settings = inject(Settings);
  /** O convite para entrar com o Google (ver core/login-nudge.ts). */
  protected readonly loginNudge = inject(LoginNudge);
  private readonly account = inject(CloudAccount);
  protected readonly cloudConfig = inject(Cloud).config;

  /** O caminho aberto, sem query nem fragmento, para acender a aba certa. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: '/' },
  );

  /** Na fila do Pra depois ou na Wishlist: lá o N e o botão do topo adicionam à lista, não ao mural. */
  protected readonly onList = computed<'fila' | 'wishlist' | null>(() => {
    const p = this.path();
    return p.startsWith('/fila') ? 'fila' : p.startsWith('/wishlist') ? 'wishlist' : null;
  });

  protected readonly PlusIcon = Plus;
  protected readonly NoteIcon = NotebookPen;
  protected readonly CutIcon = Scissors;
  protected readonly NoticeIcon = Megaphone;
  protected readonly CloudIcon = CloudIconData;
  protected readonly CloseIcon = X;
  /** As abas; Amigos entra antes da engrenagem quando há conta na nuvem. */
  protected readonly tabs = computed(() => {
    // no mural de anotações não há fila, wishlist nem os extras (que são de notas)
    const base = this.notes() ? TABS.filter((t) => !NOT_FOR_NOTES.includes(t.path)) : TABS;
    return this.follow.available() ? [...base.slice(0, -1), FRIENDS_TAB, base[base.length - 1]] : base;
  });
  /** O mural aberto é o de anotações. */
  protected readonly notes = computed(() => isNotes(this.mural.kind()));

  /**
   * Chegou algo dos amigos (o número apareceu ou subiu, inclusive ao abrir o site com novidades
   * guardadas): as pessoas da fita dão uma balançada, uma vez.
   */
  protected readonly nudge = signal(false);
  private lastUnseen: number | null = null;
  private readonly nudgeOnArrival = effect(() => {
    const n = this.settings.mailCount() ? this.follow.unseen() : 0;
    const before = this.lastUnseen;
    this.lastUnseen = n;
    if (before === null || n <= before) return;
    untracked(() => {
      this.nudge.set(false);
      requestAnimationFrame(() => {
        this.nudge.set(true);
        setTimeout(() => this.nudge.set(false), 1600);
      });
    });
  });

  private readonly editor = viewChild.required(ReviewEditor);
  private readonly reader = viewChild.required(ReviewReader);
  private readonly wishAdder = viewChild.required(WishAdder);

  constructor() {
    // trocou para o mural de anotações numa página que ele não tem (a fila, um jogo de Extras, o
    // ranking, o lado a lado): volta para o mural
    effect(() => {
      const p = this.path();
      if (this.notes() && NOTES_AWAY.some((x) => p === x || p.startsWith(x + '/')) && p !== '/comparar/mural') {
        untracked(() => void this.router.navigate(['/']));
      }
    });
    void this.cloudMurals.openFromLink();
    this.desk.register({
      newReview: () => this.newReview(),
      openReview: (id, fromId) => {
        const r = this.store.get(id);
        if (r) this.reader().open(r, null, [], false, null, (fromId && this.store.get(fromId)) || null);
      },
      // da ficha do mural: a nova herda a categoria, e o editor fecha de volta no mural
      newNote: (title, fromId) => this.newNote(title, fromId ?? null, false),
      openDraft: (id) => {
        const d = this.store.getDraft(id);
        if (d) this.editor().open(undefined, d);
      },
      newWish: () => this.wishAdder().open(),
      newDraft: () => this.wishAdder().open('draft'),
      openWish: (id) => {
        const w = this.store.getWish(id);
        if (w) this.editor().open(undefined, undefined, w);
      },
    });
    // Texturas fotográficas são opcionais: só entram se o arquivo existir.
    afterNextRender(() => {
      this.useTexture('textures/parede-eucatex.png', 'has-wall-texture');
      this.useTexture('textures/cartolina-fibra.png', 'has-paper-texture');
      this.useTexture('textures/tachinhas.png', 'has-pins');
      this.useTexture('textures/holografico.png', 'has-holo');
      this.useTexture('textures/fita-crepe.png', 'has-tape');
    });
  }

  protected isOn(t: Tab): boolean {
    const p = this.path();
    return p === t.path || !!t.also?.includes(p) || (t.path !== '/' && p.startsWith(t.path + '/'));
  }

  protected tabCount(path: string): number | null {
    if (path === '/') return this.mural.openCount() || null;
    if (path === '/fila') return this.mural.draftCount() || null;
    if (path === '/wishlist') return this.mural.wishCount() || null;
    if (path === '/amigos') return (this.settings.mailCount() && this.follow.unseen()) || null;
    return null;
  }

  /** Nova ficha; no mural de anotações, dentro de uma aba de categoria, já com a categoria dela. */
  protected newReview(): void {
    const category = this.notes() ? this.view.newNoteCategory() : null;
    if (category) this.editor().openInCategory(category);
    else this.editor().open();
  }

  protected removeDraft(id: string): void {
    const d = this.store.getDraft(id);
    if (!d) return;
    this.vt.run(() => this.store.removeDraft(id));
    this.toasts.show(`“${d.game.name}” saiu da fila`, {
      label: 'Desfazer',
      run: () => this.vt.run(() => this.store.restoreDraft(d)),
    });
  }

  protected removeWish(id: string): void {
    const w = this.store.getWish(id);
    if (!w) return;
    this.vt.run(() => this.store.removeWish(id));
    this.toasts.show(`“${w.game.name}” saiu da wishlist`, {
      label: 'Desfazer',
      run: () => this.vt.run(() => this.store.restoreWish(w)),
    });
  }

  protected onWished(id: string): void {
    const w = this.store.getWish(id);
    if (!w) return;
    const here = this.router.url.startsWith('/wishlist');
    if (here) this.desk.land(id);
    this.toasts.show(`“${w.game.name}” está na wishlist`, {
      label: here ? 'Desfazer' : 'Ver wishlist',
      run: here ? () => this.vt.run(() => this.store.removeWish(id)) : () => this.goLand('/wishlist', id),
    });
  }

  protected seeWish(id: string): void {
    if (this.router.url.startsWith('/wishlist')) this.desk.land(id);
    else this.goLand('/wishlist', id);
  }

  protected seeDraft(id: string): void {
    if (this.router.url.startsWith('/fila')) this.desk.land(id);
    else this.goLand('/fila', id);
  }

  protected onDrafted(e: SavedEvent): void {
    const name = this.store.getDraft(e.id)?.game.name ?? '';
    const onQueue = this.router.url.startsWith('/fila');
    if (onQueue) this.desk.land(e.id);
    this.toasts.show(
      e.isNew ? `“${name}” guardado pra depois` : 'Pendente atualizado',
      onQueue ? undefined : { label: 'Ver fila', run: () => this.goLand('/fila', e.id) },
    );
  }

  /** A anotação que estava aberta na leitura quando um link criou outra: a leitura volta para ela. */
  private returnTo: string | null = null;

  /**
   * O link para uma anotação que ainda não existe: o editor abre com o título já escrito e a
   * categoria da anotação de onde o link saiu (`from`). Veio da leitura (`back`)? Salvando ou não, a
   * leitura volta para aquela anotação.
   */
  protected newNote(title: string, from: string | null = null, back = true): void {
    this.reader().close();
    this.returnTo = back ? from : null;
    this.editor().openNote(title, (from && this.store.get(from)) || null);
  }

  protected onEditorClosed(): void {
    const back = this.returnTo && this.store.get(this.returnTo);
    this.returnTo = null;
    if (back) this.reader().open(back);
  }

  protected editReview(id: string): void {
    const r = this.store.get(id);
    if (!r) return;
    this.reader().close();
    this.editor().open(r);
  }

  /** Mais uma vez da obra: a rejogada (releitura, reassistida) nasce em branco, pronta pra ser escrita. */
  protected writeRevisit(id: string): void {
    const r = this.store.get(id);
    if (!r) return;
    this.reader().close();
    this.editor().open(undefined, undefined, undefined, r);
  }

  protected async removeReview(id: string): Promise<void> {
    // Pega a ficha antes: o callback da view transition roda depois deste método.
    const r = this.store.get(id);
    if (!r) return;
    const p = profileOf(r.kind);
    // a original leva as rejogadas junto; uma rejogada sai sozinha
    const revisits = this.store.revisitsOf(id);
    const what = r.revisitOf ? `A ${p.revisit.one} de “${r.game.name}”` : `“${r.game.name}”`;
    const sure = await this.confirm.ask({
      text: revisits.length
        ? `${what} sai do mural, com as notas e o texto. ${revisits.length === 1 ? `A ${p.revisit.one} dela sai junto.` : `As ${revisitCountOf(p, revisits.length)} dela saem junto.`}`
        : isNotes(r.kind)
          ? `${what} sai do mural, com o texto.`
          : `${what} sai do mural, com as notas e o texto.`,
      confirm: 'Remover do mural',
    });
    if (!sure || !this.store.get(id)) return;
    this.reader().close();
    // O leitor devolveu o foco à ficha, que vai sumir: o teclado segue para a vizinha (ou o Desfazer)
    const cards = [...document.querySelectorAll<HTMLElement>('[data-ficha]')];
    const at = cards.findIndex((c) => c.dataset['ficha'] === id);
    const neighbour = (cards[at + 1] ?? cards[at - 1])?.dataset['ficha'];
    const gone = [r, ...this.store.revisitsOf(id)];
    this.vt.run(() => this.store.remove(id));
    this.toasts.show(`${what} saiu do mural`, {
      label: 'Desfazer',
      run: () => this.vt.run(() => gone.forEach((x) => this.store.restore(x))),
    });
    setTimeout(() => {
      const next =
        (neighbour && document.querySelector<HTMLElement>(`[data-ficha="${neighbour}"] button.hit`)) ||
        document.querySelector<HTMLElement>('.bilhete button');
      next?.focus({ preventScroll: true });
    }, 60);
  }

  protected onSaved(e: SavedEvent): void {
    const saved = this.store.get(e.id);
    const name = saved?.game.name ?? '';
    const revisit = saved?.revisitOf ? profileOf(saved.kind).revisit.one : null;
    // Ficha nova vai para o mural: se ela ficaria escondida pela aba ou pelo filtro, abre a aba dela
    // ou limpa o filtro.
    if (e.isNew && saved && !this.view.visible().some((r) => r.id === e.id)) this.view.reveal(saved);
    if (e.isNew && this.router.url !== '/') this.goLand('/', e.id);
    else this.desk.land(e.id);
    // a vez mais antiga é sempre a original: a marcada para o lado a lado passa a ser a nova original
    if (e.swap && saved) {
      this.side.swap(e.swap.from, e.swap.to);
      const p = profileOf(saved.kind);
      this.toasts.show(
        e.swap.to === e.id
          ? `${cap(p.revisit.one)} mais antiga que a original: agora ela é a original de “${name}”`
          : `“${name}”: a ${p.revisit.one} mais antiga virou a original`,
      );
      if (e.isNew) void this.backup.protect();
      return;
    }
    if (saved && isNotes(saved.kind)) {
      // trocou o título: os links das outras anotações foram junto
      const links = e.relinked ? ` (e os links para ela em ${e.relinked === 1 ? 'outra anotação' : `${e.relinked} anotações`})` : '';
      this.toasts.show(e.isNew ? `“${name}” pregada no mural` : `Anotação atualizada${links}`);
      if (e.isNew) void this.backup.protect();
      return;
    }
    this.toasts.show(
      revisit
        ? e.isNew
          ? `${cap(revisit)} de “${name}” pregada no mural`
          : `${cap(revisit)} atualizada`
        : e.isNew
          ? `“${name}” pregado no mural`
          : 'Resenha atualizada',
    );
    if (e.isNew) void this.backup.protect();
  }

  /** Em Ajustes o convite para entrar não aparece: o botão do Google já está lá, no Perfil. */
  protected readonly onSettings = computed(() => this.path().startsWith('/ajustes'));

  /** Entrou pelo convite da faixa: a sincronização começa sozinha (ver core/cloud-sync.ts). */
  protected readonly signingIn = signal(false);

  protected async signIn(credential: string): Promise<void> {
    if (this.signingIn()) return;
    this.signingIn.set(true);
    try {
      const { nova } = await this.account.signIn(credential);
      this.toasts.show(nova ? 'Conta criada. O seu mural vai para a nuvem.' : 'Você entrou na sua conta.');
    } catch (err) {
      this.toasts.show(err instanceof CloudError ? err.message : 'Não deu para entrar agora. Tente em Ajustes › Perfil.');
    } finally {
      this.signingIn.set(false);
    }
  }

  /** Na própria página de novidades a faixa não aparece: abrir a página já conta como visto. */
  protected readonly onNews = computed(() => this.path().startsWith('/novidades'));

  /** Fecha a faixa; o foco, que estava no X, vai para o conteúdo. */
  protected closeNotice(key: string): void {
    this.news.dismiss(key);
    document.getElementById('conteudo')?.focus({ preventScroll: true });
  }

  protected backupDays(days: number): string {
    return days === 0 ? 'Você ainda não baixou nenhum backup.' : `Seu último backup foi há ${days} dias.`;
  }

  private goLand(path: string, id: string): void {
    void this.router.navigateByUrl(path).then(() => this.desk.land(id));
  }

  protected onGlobalKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Esc encerra a marcação de fichas (com um diálogo aberto, o Esc é dele)
    if (e.key === 'Escape' && this.side.picking() && !document.querySelector('dialog[open]')) {
      this.side.picking.set(false);
      return;
    }
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    if (e.key === '/') {
      // Abre a busca da página, inclusive a gaveta de filtros no celular.
      const search = document.querySelector<HTMLInputElement>('input[data-busca]');
      if (!search) return;
      e.preventDefault();
      const disclosure = search.closest('details');
      if (disclosure) disclosure.open = true;
      search.focus();
      search.select();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      const list = this.notes() ? null : this.onList();
      if (list === 'fila') this.desk.newDraft();
      else if (list === 'wishlist') this.desk.newWish();
      else this.newReview();
    }
  }

  private useTexture(url: string, cls: string): void {
    const img = new Image();
    img.onload = () => document.body.classList.add(cls);
    img.src = url;
  }
}
