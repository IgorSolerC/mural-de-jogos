import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { Review, TEXT_MAX, newId } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { NoteFolders } from '../core/note-folders';
import { pathLabel } from '../core/folders';
import { Settings } from '../core/settings';
import { Backup } from '../core/backup';
import { KanbanStore } from '../core/kanban-store';
import { tagLibrary } from '../core/note-labels';
import { lookKey, tagColorHex } from '../core/category-looks';
import { newNoteAudience } from '../core/mural-config';
import { todayISO } from '../core/dates';
import { SPOT_MAX, linkTitleOf, linkedNote, resolveNote } from '../core/note-links';
import { BackdropClose } from './backdrop-close';
import { FolderPicker } from './folder-picker';
import { TagPicker } from './tag-picker';
import { NoteTag } from './note-tag';
import { RichEditor } from './rich-editor';
import { SaveKey } from './save-key';

const COUNT = new Intl.NumberFormat('pt-BR');

/** As etiquetas da folha: só a Pasta e as Tags (o resto é do editor). */
type QuickProp = 'pasta' | 'tags';

/** A folha criou a anotação (`created`) ou só ligou o trecho a uma que já existia: o título que o link leva. */
export interface QuickNoteLinked {
  title: string;
  created: boolean;
}

/**
 * A folhinha da nota nova a partir de um trecho da leitura (PLANO-NOTA-DE-REFERENCIA.md): o trecho selecionado é o
 * título, e a anotação nasce com o texto, a Pasta e as Tags escritos aqui, no grupo da anotação de onde o trecho saiu
 * e como o link do editor cria (`linkedNote`). Quem abriu põe o link no trecho (`linked`).
 *
 * É a ficha de fichário dos diálogos (a do template, ui/template-sheet.ts), pequena e pintada na cartolina que a
 * anotação nova vai ter. As etiquetas são as do editor (ui/_props-editor.scss), só com a Pasta e as Tags, e o texto é
 * o editor das anotações (o Visual), sem a doca e sem os templates. O título que já existe não cria outra (o link
 * abriria a mais antiga): a folha oferece só ligar o trecho a ela.
 *
 * Chega num pedaço à parte, só quando é aberta (ver a leitura).
 */
@Component({
  selector: 'app-quick-note-sheet',
  imports: [SaveKey, BackdropClose, FolderPicker, TagPicker, NoteTag, IconModule, RichEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet folha-nota" aria-labelledby="nota-rapida-titulo" aria-describedby="nota-rapida-sub" (close)="closed.emit()" (cancel)="onCancel($event)" (backdropClose)="closeIfUntouched()">
      <div class="ficha cartolina" [style.--stock]="'var(--stock-' + stock + ')'" [attr.data-cor]="stock" (keydown)="onKey($event)">
        <header class="head">
          <div class="titulos">
            <h2 id="nota-rapida-titulo">
              <lucide-icon class="carimbo" [img]="NoteIcon" [size]="24" aria-hidden="true" />
              Nova anotação
            </h2>
            <p class="sub" id="nota-rapida-sub">O trecho de “{{ from().game.name }}” vira um link para ela</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar sem criar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <!-- o título, as etiquetas e o texto: quem rola é a folha (uma rolagem só) -->
        <div class="body">
        <div class="campos">
          <label class="titulo-campo" for="nota-rapida-nome">Título</label>
          <div class="campo" [class.erro]="problem() === 'nome' || problem() === 'colchete' || problem() === 'repetido'">
            <input
              #nome
              id="nota-rapida-nome"
              type="text"
              autocomplete="off"
              [attr.maxlength]="maxTitle"
              [value]="title()"
              [attr.aria-invalid]="problem() === 'nome' || problem() === 'colchete' || problem() === 'repetido' || null"
              [attr.aria-describedby]="twin() ? 'nota-rapida-gemea' : null"
              (input)="setTitle($any($event.target).value)"
            />
          </div>
          @if (twin(); as t) {
            <p class="gemea" id="nota-rapida-gemea">
              @if (t.id === from().id) {
                É o título desta anotação: troque o título para criar outra.
              } @else {
                Já existe “{{ t.game.name }}”: o link abriria ela.
                <button type="button" class="acao-caneta so-ligar" (click)="linkOnly()">
                  <lucide-icon [img]="LinkIcon" [size]="16" aria-hidden="true" />
                  Só ligar a ela
                </button>
              }
            </p>
          }

          <!-- as etiquetas do editor, só a Pasta e as Tags: cada uma diz o que está escolhido e abre a sua parte -->
          <div class="props-area">
            <div class="props" role="group" aria-label="Detalhes da anotação">
              <button type="button" class="prop" [class.vazia]="!folderName()" data-prop="pasta" [attr.aria-expanded]="prop() === 'pasta'" aria-controls="nota-rapida-parte" [attr.aria-label]="'Pasta: ' + (folderPath() ?? 'sem pasta')" (click)="toggleProp('pasta')">
                <lucide-icon [img]="FolderIcon" [size]="16" aria-hidden="true" /><span class="prop-txt">{{ folderName() ?? 'Pasta' }}</span>
              </button>
              <button type="button" class="prop" [class.vazia]="!tags().length" data-prop="tags" [attr.aria-expanded]="prop() === 'tags'" aria-controls="nota-rapida-parte" [attr.aria-label]="'Tags: ' + (tags().length ? tags().join(', ') : 'nenhuma')" (click)="toggleProp('tags')">
                @if (tags().length) {
                  <span class="prop-tags">
                    @for (t of tags().slice(0, 3); track t) {
                      <app-note-tag [label]="t" size="mini" [color]="tagColor(t)" />
                    }
                    @if (tags().length > 3) {
                      <span class="prop-mais">+{{ tags().length - 3 }}</span>
                    }
                  </span>
                } @else {
                  <lucide-icon [img]="TagsIcon" [size]="16" aria-hidden="true" /><span class="prop-txt">Tags</span>
                }
              </button>
            </div>
            @if (prop(); as p) {
              <div class="parte" id="nota-rapida-parte" role="group" [attr.aria-label]="p === 'pasta' ? 'Pasta' : 'Tags'" (keydown.escape)="closeProp($event)">
                @if (p === 'pasta') {
                  <app-folder-picker
                    #pastas
                    [value]="folder()"
                    (valueChange)="pickFolder($event)"
                    [tree]="folders.tree()"
                    [group]="groupKey()"
                    [groupName]="category() ?? 'Sem grupo'"
                    [counts]="folderCounts()"
                    (create)="createFolder($event)"
                  />
                } @else {
                  <app-tag-picker #etiquetas [(tags)]="tags" [library]="tagLib()" [category]="category()" />
                }
                <button type="button" class="parte-pronto" (click)="closeProp()">
                  <lucide-icon [img]="DoneIcon" [size]="16" aria-hidden="true" />
                  Pronto
                </button>
              </div>
            }
          </div>
        </div>

        <div class="conteudo">
          <app-rich-editor
            #editor
            [class.erro]="problem() === 'longo'"
            label="Anotação"
            placeholder="O que você quer lembrar sobre o trecho…"
            [notes]="notes()"
            [ownTitles]="[title()]"
            [selfId]="id"
            [max]="maxText"
            [value]="text()"
            (valueChange)="onText($event)"
          />
        </div>
        </div>

        <footer class="foot">
          <p class="falta" [class.agora]="(tried() && !!problem()) || leaving()" role="status">{{ leaving() ? 'Ainda não criada: Esc de novo fecha sem criar' : tried() ? problemText() : '' }}</p>
          <div class="actions">
            <button type="button" class="btn-quiet" (click)="close()">Cancelar</button>
            <button type="button" class="btn-ink" appSaveKey (click)="save()">Criar e ligar</button>
          </div>
        </footer>
      </div>
    </dialog>
  `,
  styleUrl: './quick-note-sheet.scss',
})
export class QuickNoteSheet {
  /** O trecho selecionado: o título com que a folha abre. */
  readonly piece = input.required<string>();
  /** A anotação de onde o trecho saiu: a nova nasce no grupo dela, e começa na pasta dela. */
  readonly from = input.required<Review>();
  /** A de onde saiu é compartilhada: a nova é só sua, privada (ver `linkedAudience`). */
  readonly shared = input(false);
  /** Criou (ou escolheu só ligar): quem abriu põe o link no trecho. */
  readonly linked = output<QuickNoteLinked>();
  readonly closed = output<void>();

  private readonly store = inject(ReviewStore);
  protected readonly folders = inject(NoteFolders);
  private readonly settings = inject(Settings);
  private readonly backup = inject(Backup);
  private readonly kanban = inject(KanbanStore);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly nameField = viewChild.required<ElementRef<HTMLInputElement>>('nome');
  private readonly editor = viewChild.required<RichEditor>('editor');
  private readonly folderPicker = viewChild<FolderPicker>('pastas');
  private readonly tagPicker = viewChild<TagPicker>('etiquetas');

  /** O id e a cartolina da anotação que vai nascer (a folha é pintada nela). */
  protected readonly id = newId();
  protected readonly stock = this.store.nextStock('anotacoes');
  protected readonly maxTitle = SPOT_MAX;
  protected readonly maxText = TEXT_MAX;

  protected readonly title = signal('');
  protected readonly text = signal('');
  protected readonly tags = signal<string[]>([]);
  /** A pasta escolhida (o id; null: solta na raiz do grupo). */
  protected readonly folder = signal<string | null>(null);
  protected readonly prop = signal<QuickProp | null>(null);
  /** Tentou criar: o que falta aparece (e some ao mexer). */
  protected readonly tried = signal(false);
  /** Apertou Esc com algo escrito: o próximo Esc fecha sem criar. */
  protected readonly leaving = signal(false);
  /** Mexeu na pasta ou nas tags (o tocar fora não fecha mais). */
  private touched = false;

  protected readonly category = computed(() => this.from().category ?? null);
  protected readonly groupKey = computed(() => lookKey(this.category() ?? ''));
  protected readonly folderCounts = computed(() => this.folders.countsIn(this.category()));
  protected readonly folderName = computed(() => this.folders.nameOf(this.folder()));
  protected readonly folderPath = computed(() => {
    const path = this.folders.tree().path(this.folder());
    return path.length ? pathLabel(path) : null;
  });
  /** As tags à mão, como no editor: as fixas e as das anotações do mesmo grupo no mural. */
  protected readonly tagLib = computed(() => tagLibrary(this.kanban.notesAt({ board: false, wall: true }), this.settings.pinnedTags(), this.category()));
  /** As anotações que os links do texto abrem (o "[[" do editor). */
  protected readonly notes = this.store.notes;
  /** A anotação que já tem este título (o link abriria ela). */
  protected readonly twin = computed(() => {
    const t = linkTitleOf(this.title());
    return t ? resolveNote(this.store.notes(), t) : null;
  });

  /** O primeiro problema, na ordem dos campos (null: dá para criar). */
  protected readonly problem = computed<'nome' | 'colchete' | 'repetido' | 'longo' | null>(() => {
    if (!this.tried()) return null;
    if (!this.title().trim()) return 'nome';
    if (!linkTitleOf(this.title())) return 'colchete';
    if (this.twin()) return 'repetido';
    if (this.text().length > TEXT_MAX) return 'longo';
    return null;
  });
  protected readonly problemText = computed(() => {
    switch (this.problem()) {
      case 'nome':
        return 'Falta o título';
      case 'colchete':
        return 'O título não pode ter colchetes nem “|”';
      case 'repetido':
        return 'Já existe uma anotação com esse título';
      case 'longo':
        return `O texto passou de ${COUNT.format(TEXT_MAX)} caracteres`;
      default:
        return '';
    }
  });

  protected readonly NoteIcon = ICON.novaNota;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly FolderIcon = ICON.pastaDeNotas;
  protected readonly TagsIcon = ICON.etiquetas;
  protected readonly DoneIcon = ICON.pronto;
  protected readonly LinkIcon = ICON.link;

  constructor() {
    afterNextRender(() => {
      this.title.set(this.piece());
      this.folder.set(this.folders.of(this.from()));
      this.dialog().nativeElement.showModal();
      // o título já vem do trecho: falta escrever sobre ele
      this.editor().focus();
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected tagColor(tag: string): string | null {
    return tagColorHex(this.settings.categoryLooks(), tag, this.category() ?? '');
  }

  protected setTitle(value: string): void {
    this.title.set(value);
    this.tried.set(false);
    this.leaving.set(false);
  }

  protected onText(value: string): void {
    if (value === this.text()) return;
    this.text.set(value);
    this.tried.set(false);
    this.leaving.set(false);
  }

  /** Nada mudou desde que a folha abriu. */
  private untouched(): boolean {
    return this.title() === this.piece() && !this.text().trim() && !this.tags().length && !this.touched;
  }

  /** Um toque fora fecha só sem nada escrito: o texto não se perde num toque sem querer (o X e o Cancelar fecham sempre). */
  protected closeIfUntouched(): void {
    if (this.untouched()) this.close();
  }

  /** O Esc com algo escrito avisa antes; o segundo fecha sem criar. Com uma parte aberta, só a fecha. */
  protected onCancel(e: Event): void {
    if (this.prop()) {
      e.preventDefault();
      return this.closeProp();
    }
    if (this.untouched() || this.leaving()) return;
    e.preventDefault();
    this.leaving.set(true);
  }

  /** Ctrl+Enter (ou Cmd+Enter) cria de qualquer campo; Enter no título vai para o texto. */
  protected onKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.isComposing) return;
    // o que vem das folhas do editor (a do widget, a da tabela, a tela cheia) é delas
    if (!(e.target instanceof Element) || e.target.closest('dialog') !== this.dialog().nativeElement) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.save();
    } else if (e.target === this.nameField().nativeElement) {
      e.preventDefault();
      this.editor().focus();
    }
  }

  protected toggleProp(p: QuickProp): void {
    if (this.prop() === p) return this.closeProp();
    this.prop.set(p);
    afterNextRender(() => (p === 'pasta' ? this.folderPicker() : this.tagPicker())?.focus(), { injector: this.injector });
  }

  /** Fecha a parte aberta (Esc, o Pronto, a etiqueta de novo); o foco volta para a etiqueta dela. */
  protected closeProp(e?: Event): void {
    const p = this.prop();
    if (!p) return;
    // o Esc fecha só a parte, não a folha
    e?.preventDefault();
    e?.stopPropagation();
    this.prop.set(null);
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>(`.prop[data-prop="${p}"]`)?.focus(), { injector: this.injector });
  }

  protected pickFolder(id: string | null): void {
    this.folder.set(id);
    this.touched = true;
    this.leaving.set(false);
    this.closeProp();
  }

  /** "Criar 'Scripts' em Programação" na parte Pasta: a pasta nasce agora, já escolhida. */
  protected createFolder(e: { parent: string | null; name: string }): void {
    const made = this.folders.create(this.category(), e.parent, e.name);
    if (made) this.pickFolder(made.id);
  }

  /** O título já é de outra anotação: o trecho só vira link para ela, sem criar nada. */
  protected linkOnly(): void {
    const t = this.twin();
    if (!t || t.id === this.from().id) return;
    this.linked.emit({ title: t.game.name, created: false });
    this.close();
  }

  /** "Criar e ligar": a anotação nasce (como a do link do editor), e quem abriu põe o link no trecho. */
  protected save(): void {
    this.tried.set(true);
    const p = this.problem();
    if (p) {
      if (p === 'longo') this.editor().focus();
      else this.nameField().nativeElement.focus();
      return;
    }
    const category = this.category();
    const now = new Date().toISOString();
    const folder = this.folders.tree().live(this.folder()) ? this.folder() : null;
    const note = linkedNote(
      this.title(),
      { category, folder, audience: newNoteAudience(this.settings.notesConfig(), category), shared: this.shared() },
      this.id,
      now,
      todayISO(),
      { text: this.text().replace(/\r\n?/g, '\n'), tags: this.tags(), stock: this.stock },
    );
    if (!note) return;
    this.store.add(note);
    // como toda ficha nova pregada: o navegador não apaga o mural quando faltar espaço
    void this.backup.protect();
    this.touched = false;
    this.linked.emit({ title: note.game.name, created: true });
    this.close();
  }
}
