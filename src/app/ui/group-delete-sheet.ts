import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { lookKey } from '../core/category-looks';
import { FreeBoardStore } from '../core/free-board-store';
import { GroupDeleteResult, GroupFate, deletedGroupFolderName } from '../core/group-delete';
import { CloudAccount } from '../core/cloud-account';
import { boardIdFor } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { LabelEdits } from '../core/label-edits';
import { NoteBulk, removalAsk } from '../core/note-bulk';
import { NoteFolders } from '../core/note-folders';
import { pathLabel } from '../core/folders';
import { categoryBonus } from '../core/note-labels';
import { isNote } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SharedGroupsStore } from '../core/shared-groups-store';
import { canWrite } from '../core/shared-notes';
import { inGroup } from '../core/study';
import { StudyStore } from '../core/study-store';
import { listWords, plural } from '../core/text';
import { BackdropClose } from './backdrop-close';
import { Busy } from './busy';
import { FolderPicker } from './folder-picker';
import { GroupPicker } from './group-picker';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';

type Kind = GroupFate['kind'];

/** Os três destinos, do que nunca perde nada ao que apaga (o primeiro é o escolhido ao abrir, D1). */
const KINDS: readonly { kind: Kind; label: string; sub: string }[] = [
  { kind: 'soltar', label: 'Deixar sem grupo', sub: 'Numa pasta nova' },
  { kind: 'levar', label: 'Levar para outro grupo', sub: 'Um grupo do seu mural' },
  { kind: 'apagar', label: 'Apagar tudo', sub: 'Não volta' },
];

/**
 * "As 12 anotações e as 3 pastas", "A anotação", "As 2 pastas": o que está no grupo, para as frases da folha
 * (`many`: o verbo vai no plural). Vazio: ''.
 */
function contentsWords(notes: number, folders: number): { words: string; many: boolean } {
  const parts = [notes ? (notes === 1 ? 'a anotação' : `as ${notes} anotações`) : '', folders ? (folders === 1 ? 'a pasta' : `as ${folders} pastas`) : ''].filter(Boolean);
  const words = parts.join(' e ');
  return { words: words ? words[0].toUpperCase() + words.slice(1) : '', many: notes + folders > 1 };
}

/**
 * Apagar o grupo (PLANO-APAGAR-GRUPO.md): a folha que pergunta para onde vai o que está nele, no lugar do "Tem
 * certeza?". Os três destinos nos segmentos de papel de sempre; levar abre a escolha do grupo; embaixo, o que
 * acontece, com os números de verdade; o botão vermelho diz o destino. Quem faz é `LabelEdits.deleteCategory`.
 * Num grupo compartilhado (só o dono chega aqui), avisa que ele deixa de ser compartilhado antes.
 */
@Component({
  selector: 'app-group-delete-sheet',
  imports: [BackdropClose, Busy, FolderPicker, GroupPicker, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet coluna-ajustes apagar-grupo" aria-labelledby="ag-titulo" aria-describedby="ag-sub" (cancel)="onEscape($event)" (close)="closed.emit()" (backdropClose)="close()">
      <form class="ficha cartolina" data-cor="vermelho" [style.--stock]="'var(--stock-vermelho)'" (submit)="$event.preventDefault(); run()">
        <app-pin class="pin" color="#f4f4f0" />
        <header class="head">
          <div class="titulos">
            <h2 id="ag-titulo">Apagar o grupo {{ name() }}</h2>
            <p class="sub" id="ag-sub">{{ summary() }}</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" [disabled]="busy()" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="body">
          @if (sharedWith(); as who) {
            <p class="compartilhado">
              <lucide-icon [img]="PeopleIcon" [size]="18" aria-hidden="true" />
              <span>{{ who }} Tudo o que está nele, até o que outras pessoas escreveram, segue o destino que você escolher.</span>
            </p>
          }

          <fieldset class="grupo destinos" [disabled]="busy()">
            <legend class="grupo-titulo">Para onde vai o que está nele</legend>
            <div class="segmentos">
              @for (o of kinds; track o.kind) {
                <label class="segmento" [class.perigo]="o.kind === 'apagar'">
                  <input type="radio" name="ag-destino" [value]="o.kind" [checked]="kind() === o.kind" (change)="kind.set(o.kind)" />
                  <span class="seg-nome">{{ o.label }}</span>
                  <span class="seg-sub">{{ o.sub }}</span>
                </label>
              }
            </div>
          </fieldset>

          <section class="grupo" aria-labelledby="ag-acontece">
            <h3 class="grupo-titulo" id="ag-acontece">O que acontece</h3>
            <!-- (o leitor de tela ouve só a primeira frase quando ela muda, não a lista toda de novo) -->
            <p class="sr-only" aria-live="polite">{{ lines()[0]?.text }}</p>
            <ul class="acontece">
              @for (line of lines(); track $index) {
                <li [class.forte]="line.strong">{{ line.text }}</li>
              }
            </ul>
          </section>

          @if (kind() === 'levar') {
            <section class="grupo" aria-labelledby="ag-para">
              <h3 class="grupo-titulo" id="ag-para">Para qual grupo</h3>
              @if (targets().length) {
                <!-- (apagando, a escolha fica parada: o destino já foi) -->
                <fieldset class="sem-moldura" [disabled]="busy()">
                  <app-group-picker [required]="true" [canCreate]="false" groupLabel="Grupo para onde vai tudo" [category]="target()" (categoryChange)="target.set($event)" [categories]="targets()" />
                </fieldset>
              } @else {
                <p class="vazio">Não há outro grupo em que você escreva para onde levar. Escolha deixar sem grupo, ou crie o grupo numa anotação antes.</p>
              }
            </section>
            @if (target(); as to) {
              <section class="grupo" aria-labelledby="ag-pasta">
                <h3 class="grupo-titulo" id="ag-pasta">Em qual pasta de {{ to }}</h3>
                <fieldset class="sem-moldura" [disabled]="busy()">
                  <app-folder-picker
                    [value]="folder()"
                    (valueChange)="folder.set($event)"
                    [tree]="folders.tree()"
                    [group]="targetKey()"
                    [groupName]="to"
                    [counts]="targetCounts()"
                    [rootLabel]="'Direto em ' + to"
                    [label]="'Pasta de ' + to + ' onde tudo entra'"
                    (create)="createFolder($event)"
                  />
                </fieldset>
              </section>
            }
          }

          @if (error(); as e) {
            <p class="erro" role="alert">{{ e }}</p>
          }
        </div>

        <footer class="foot">
          <button type="button" class="papel" [disabled]="busy()" (click)="close()">Cancelar</button>
          <div class="actions">
            <!-- vermelho, com a lixeira, só quando algo não volta; os outros dois destinos não perdem nada -->
            <button type="submit" class="btn-ink" [class.danger]="kind() === 'apagar'" [disabled]="!ready()" [appBusy]="busy()">
              <lucide-icon [img]="kind() === 'apagar' ? DeleteIcon : kind() === 'levar' ? GoIcon : FolderIcon" [size]="18" aria-hidden="true" />
              {{ busy() ? 'Apagando…' : confirmLabel() }}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  `,
  styleUrl: './kanban-column-sheet.scss',
  styles: `
    .destinos,
    .sem-moldura {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    /* os três destinos, com o nome em duas linhas no celular; o de apagar tudo, escolhido, em vermelho */
    .destinos .segmentos {
      max-width: none;
    }
    .destinos .segmento {
      min-height: 62px;
    }
    .destinos .segmento.perigo:has(input:checked) {
      background: var(--red-deep);
    }
    .destinos .segmento:has(input:focus-visible) {
      outline: 3px solid var(--ink);
      outline-offset: 2px;
    }
    .seg-sub {
      font-size: 0.8rem;
      line-height: 1.2;
      color: var(--ink-2);
    }
    .segmento:has(input:checked) .seg-sub {
      color: rgb(247 244 236 / 0.82);
    }
    /* o que acontece: frases curtas, a caneta; a que não volta, em negrito */
    .acontece {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0 0 0 1.1em;
      max-width: 60ch;
      font-size: 0.95rem;
      line-height: 1.45;
      color: var(--ink);
      text-wrap: pretty;
    }
    .acontece li::marker {
      color: var(--red-deep);
    }
    .acontece .forte {
      font-weight: 700;
    }
    .compartilhado {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin: 0;
      max-width: 62ch;
      font-size: 0.95rem;
      line-height: 1.45;
      color: var(--ink);
    }
    .compartilhado lucide-icon {
      flex: none;
      display: inline-flex;
      margin-top: 2px;
      color: var(--red-deep);
    }
    .vazio {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.45;
      color: var(--ink-2);
    }
    .erro {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.4;
      font-weight: 600;
      color: var(--red-deep);
    }
    .btn-ink lucide-icon {
      display: inline-flex;
    }
    .btn-ink:disabled:not(.carregando) {
      opacity: 0.5;
      transform: none;
      cursor: not-allowed;
    }
  `,
})
export class GroupDeleteSheet {
  /** O grupo, pelo nome que ele tem no mural. */
  readonly name = input.required<string>();
  /** Os outros grupos do mural (os nomes), de onde sai a lista de para onde levar. */
  readonly groups = input<readonly string[]>([]);
  /** Apagou: a frase do que aconteceu (para o aviso das configurações). */
  readonly done = output<string>();
  readonly closed = output<void>();

  protected readonly kinds = KINDS;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly DeleteIcon = ICON.apagar;
  protected readonly PeopleIcon = ICON.pessoas;
  protected readonly GoIcon = ICON.ir;
  protected readonly FolderIcon = ICON.pastaDeNotas;

  private readonly edits = inject(LabelEdits);
  private readonly store = inject(ReviewStore);
  protected readonly folders = inject(NoteFolders);
  private readonly study = inject(StudyStore);
  private readonly freeBoards = inject(FreeBoardStore);
  private readonly kanban = inject(KanbanStore);
  private readonly bulk = inject(NoteBulk);
  private readonly sharedGroups = inject(SharedGroupsStore);
  private readonly account = inject(CloudAccount);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly kind = signal<Kind>('soltar');
  protected readonly target = signal<string | null>(null);
  /** A pasta do grupo de destino onde tudo entra (null: direto nele); outro grupo, ela volta para null. */
  protected readonly folder = linkedSignal<string | null, string | null>({ source: () => this.target(), computation: () => null });
  protected readonly targetKey = computed(() => lookKey(this.target() ?? ''));
  protected readonly targetCounts = computed(() => this.folders.countsIn(this.target()));
  /** As pastas criadas aqui (o "Criar" da escolha): se a pessoa desiste, as que ficaram vazias saem. */
  private readonly made = new Set<string>();
  protected readonly busy = signal(false);
  /** O erro da última tentativa; mudar o destino já é outra tentativa, e ele sai. */
  protected readonly error = linkedSignal<unknown, string | null>({ source: () => [this.kind(), this.target(), this.folder()], computation: () => null });
  /** A folha saiu da tela enquanto apagava. */
  private gone = false;

  private readonly key = computed(() => lookKey(this.name()));
  private readonly notes = computed(() => this.store.notes().filter((r) => isNote(r) && !!r.category && lookKey(r.category) === this.key()));
  private readonly folderCount = computed(() => this.folders.tree().all.filter((f) => f.group === this.key() && !f.gone).length);
  private readonly decks = computed(() => this.study.decks().filter((d) => inGroup(d, this.name())));
  /** As cartas que perdem o progresso com os baralhos (as que só estão neles, como na pergunta de antes). */
  private readonly deckCards = computed(() => {
    const ids = new Set(this.decks().map((d) => d.id));
    return this.study.state().cards.filter((c) => c.decks.length && c.decks.every((d) => ids.has(d))).length;
  });
  private readonly boards = computed(() => this.freeBoards.goingWithGroup(this.name()).map((b) => b.nome));
  private readonly kanbanCards = computed(() => this.kanban.get(boardIdFor(this.name()))?.cards.length ?? 0);

  /** O grupo compartilhado (você é o dono: quem não é nem chega aqui) e quem deixa de ver. */
  protected readonly sharedWith = computed(() => {
    const g = this.sharedGroups.ofCategory(this.name());
    if (!g) return null;
    const names = g.membros.map((m) => m.nome);
    const start = `${this.name()} é compartilhado, e antes de apagar ele deixa de ser`;
    const parts = [names.length ? `${listWords(names)} ${names.length > 1 ? 'deixam' : 'deixa'} de ver` : '', g.publico ? 'ele deixa de ser público' : ''].filter(Boolean);
    return parts.length ? `${start}: ${parts.join(', e ')}.` : `${start}.`;
  });

  /** Para onde levar: os outros grupos, sem os compartilhados em que você só lê (PLANO-APAGAR-GRUPO.md, D8). */
  protected readonly targets = computed(() =>
    this.groups()
      .filter((g) => lookKey(g) !== this.key())
      .filter((g) => {
        const s = this.sharedGroups.ofCategory(g);
        return !s || canWrite(s.papel);
      })
      .map(categoryBonus),
  );

  /** "12 anotações · 3 pastas · 2 baralhos": o que está nele, na linha de baixo do título. */
  protected readonly summary = computed(() => {
    const parts = [plural(this.notes().length, 'anotação', 'anotações')];
    if (this.folderCount()) parts.push(plural(this.folderCount(), 'pasta', 'pastas'));
    if (this.decks().length) parts.push(plural(this.decks().length, 'baralho', 'baralhos'));
    if (this.boards().length) parts.push(plural(this.boards().length, 'quadro livre', 'quadros livres'));
    return parts.join(' · ');
  });

  /** Os baralhos, nomeados: "o baralho Kana" / "os baralhos Kana e Kanji". */
  private decksWords(): string {
    const names = this.decks().map((d) => d.name);
    return names.length === 1 ? `O baralho ${names[0]}` : `Os baralhos ${listWords(names)}`;
  }

  private boardsWords(): string {
    const names = this.boards();
    return names.length === 1 ? `O quadro livre ${names[0]}` : `Os quadros livres ${listWords(names)}`;
  }

  /** O que acontece com o destino escolhido, com os números de verdade. `strong`: o que não volta. */
  protected readonly lines = computed<{ text: string; strong?: boolean }[]>(() => {
    const kind = this.kind();
    const n = this.notes().length;
    const { words, many } = contentsWords(n, this.folderCount());
    const decks = this.decks().length;
    const boards = this.boards().length;
    const progress = this.deckCards() ? `, com o progresso de ${plural(this.deckCards(), 'flashcard', 'flashcards')}` : '';
    const out: { text: string; strong?: boolean }[] = [];
    if (kind === 'apagar') {
      const plan = this.bulk.plan(this.notes().map((r) => r.id));
      if (n) out.push({ text: removalAsk(plan, true).text });
      if (this.folderCount()) out.push({ text: `${this.folderCount() === 1 ? 'A pasta some' : `As ${this.folderCount()} pastas somem`}.` });
      if (decks) out.push({ text: `${this.decksWords()} dos Flashcards ${decks > 1 ? 'vão' : 'vai'} embora${progress}.` });
      if (boards) out.push({ text: `${this.boardsWords()} também ${boards > 1 ? 'vão' : 'vai'} embora.` });
      out.push({ text: 'O ícone, a cor, os padrões e o quadro do Kanban vão embora.' });
      out.push({ text: 'Não dá para desfazer.', strong: true });
      return out;
    }
    if (kind === 'levar') {
      const to = this.target();
      if (!to) return [{ text: 'Escolha o grupo para onde tudo vai.' }];
      const path = pathLabel(this.folders.tree().path(this.folder()));
      if (words) out.push({ text: `${words} ${many ? 'vão' : 'vai'} para ${to}${path ? `, dentro da pasta ${path}` : ''}.` });
      // um grupo compartilhado: quem está nele passa a ver o que chega (as privadas também, pelo grupo); no de outra
      // pessoa, ela também (e você não entra na conta)
      const there = this.sharedGroups.ofCategory(to);
      const me = this.account.account()?.codigo ?? null;
      const people = there
        ? [...(there.papel === 'dono' ? [] : [there.dono.nome]), ...there.membros.filter((m) => m.codigo !== me).map((m) => m.nome)]
        : [];
      if (there && (people.length || there.publico)) {
        const who = people.length ? `${listWords(people)} ${people.length > 1 ? 'passam' : 'passa'} a ver o que chega` : 'qualquer pessoa passa a ver o que chega';
        out.push({ text: `${to} é compartilhado: ${who}${people.length && there.publico ? ', e ele é público' : ''}.`, strong: true });
        // as compartilhadas com você por outra pessoa não entram no grupo (só quem é dono da anotação a põe nele)
        const theirs = this.bulk.plan(this.notes().map((r) => r.id)).leave.length;
        if (theirs) out.push({ text: theirs === 1 ? 'A anotação que outra pessoa compartilhou com você fica só no seu mural, sem entrar no grupo.' : `As ${theirs} anotações que outras pessoas compartilharam com você ficam só no seu mural, sem entrar no grupo.` });
      }
      if (this.kanbanCards()) out.push({ text: `Os cartões do quadro do Kanban entram no quadro de ${to}, na coluna de mesmo nome (ou na primeira).` });
      if (decks) out.push({ text: `${this.decksWords()} dos Flashcards ${decks > 1 ? 'vão' : 'vai'} para ${to}, com o progresso.` });
      if (boards) out.push({ text: `${this.boardsWords()} ${boards > 1 ? 'vão' : 'vai'} para ${to}.` });
      out.push({ text: `O ícone, a cor e os padrões de ${this.name()} vão embora: ${to} fica com os dele.` });
      return out;
    }
    if (words) out.push({ text: `${words} ${many ? 'vão' : 'vai'} para a pasta “${deletedGroupFolderName(this.name())}”, nas anotações sem grupo.` });
    else out.push({ text: 'O grupo está vazio: nenhuma pasta nova é criada.' });
    if (decks) out.push({ text: `${this.decksWords()} dos Flashcards ${decks > 1 ? 'vão' : 'vai'} embora${progress}: anotação sem grupo não tem baralho.`, strong: true });
    if (boards) out.push({ text: `${this.boardsWords()} ${boards > 1 ? 'vão' : 'vai'} embora: quadro livre sem grupo não existe.`, strong: true });
    out.push({ text: 'O ícone, a cor, os padrões e o quadro do Kanban vão embora.' });
    return out;
  });

  protected readonly ready = computed(() => !this.busy() && (this.kind() !== 'levar' || !!this.target()));

  /** O botão vermelho diz o destino. */
  protected readonly confirmLabel = computed(() => {
    const kind = this.kind();
    if (kind === 'soltar') return 'Apagar e deixar sem grupo';
    if (kind === 'levar') return this.target() ? `Apagar e levar para ${this.target()}` : 'Apagar e levar';
    const n = this.notes().length;
    return n ? `Apagar o grupo e ${n === 1 ? 'a anotação' : `as ${n} anotações`}` : 'Apagar o grupo';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.gone = true;
      // (apagando, a folha que sai da tela não mexe em nada: a pasta escolhida ainda vai receber tudo)
      if (!this.busy()) this.dropUnused();
    });
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      // começa no destino escolhido (nunca no botão de apagar)
      el.querySelector<HTMLInputElement>('input[name="ag-destino"]:checked')?.focus();
    });
  }

  /** Apagando, a folha não fecha (a nuvem pode estar no meio de parar de compartilhar). */
  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open && !this.busy()) el.close();
  }

  protected onEscape(event: Event): void {
    if (this.busy()) event.preventDefault();
  }

  private fate(): GroupFate | null {
    const kind = this.kind();
    if (kind === 'levar') {
      const to = this.target();
      return to ? { kind, to, folder: this.folder() } : null;
    }
    return { kind };
  }

  protected async run(): Promise<void> {
    const fate = this.fate();
    if (!fate || !this.ready()) return;
    this.busy.set(true);
    this.error.set(null);
    let r: GroupDeleteResult;
    try {
      r = await this.edits.deleteCategory(this.name(), fate);
    } catch {
      r = { ok: false, error: 'Não deu para apagar o grupo agora. Tente de novo.', moved: 0, removed: 0 };
    } finally {
      this.busy.set(false);
    }
    if (!r.ok) {
      this.error.set(r.error ?? 'Não deu para apagar o grupo agora. Tente de novo.');
      return;
    }
    this.done.emit(this.said(fate, r));
    if (!this.gone) this.close();
  }

  /** O "Criar" da escolha da pasta: a pasta nasce no grupo de destino, dentro da escolhida, e fica escolhida. */
  protected createFolder(e: { parent: string | null; name: string }): void {
    const to = this.target();
    if (!to) return;
    const made = this.folders.create(to, e.parent, e.name);
    if (!made) {
      this.error.set('Não cabe mais nenhuma pasta.');
      return;
    }
    this.made.add(made.id);
    this.folder.set(made.id);
  }

  /**
   * Ao fechar: as pastas criadas aqui que ficaram vazias saem (as de dentro primeiro), a pessoa tendo desistido ou
   * escolhido outra no fim.
   */
  private dropUnused(): void {
    for (const id of [...this.made].reverse()) {
      const tree = this.folders.tree();
      const f = tree.live(id);
      if (f && !tree.kids(f.group, id).length && !this.folders.countBelow(id)) this.folders.dissolve(id);
    }
  }

  /** A frase do aviso: "Trabalho foi apagado. 12 anotações foram para Estudos." */
  private said(fate: GroupFate, r: GroupDeleteResult): string {
    const name = this.name();
    if (fate.kind === 'apagar') {
      // a nuvem não tirou alguma compartilhada: o grupo continua, com ela, e apagar de novo tira o resto
      if (r.kept) return `${plural(r.removed, 'anotação saiu', 'anotações saíram')}, mas ${name} continua, com as compartilhadas que ficaram: ${r.failed ?? 'a nuvem não respondeu'}`;
      const rest = r.failed ? ` Algumas compartilhadas ficaram: ${r.failed}` : '';
      return r.removed ? `${name} foi apagado com ${plural(r.removed, 'anotação', 'anotações')}.${rest}` : `${name} foi apagado.${rest}`;
    }
    if (!r.moved) return `${name} foi apagado.`;
    const n = plural(r.moved, 'anotação', 'anotações');
    if (fate.kind === 'levar') {
      const path = pathLabel(this.folders.tree().path(fate.folder));
      return `${name} foi apagado. ${n} ${r.moved === 1 ? 'foi' : 'foram'} para ${fate.to}${path ? `, na pasta ${path}` : ''}.`;
    }
    // (sem lugar para a pasta nova, no teto de pastas, elas ficam soltas)
    if (!r.folder) return `${name} foi apagado. ${n} ${r.moved === 1 ? 'ficou' : 'ficaram'} sem grupo.`;
    return `${name} foi apagado. ${n} ${r.moved === 1 ? 'está' : 'estão'} na pasta “${r.folder}”, nas sem grupo.`;
  }
}
