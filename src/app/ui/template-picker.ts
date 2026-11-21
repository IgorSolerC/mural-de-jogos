import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injectable, Injector, afterNextRender, afterRenderEffect, computed, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { NoteFolder, siblingNamed } from '../core/folders';
import { MAX_TEMPLATES, NoteTemplate } from '../core/note-templates';
import { plainText } from '../core/rich-text';
import { Settings } from '../core/settings';
import { TemplateFolders } from '../core/template-folders';
import { fold, plural } from '../core/text';
import { BackdropClose } from './backdrop-close';
import { ContextMenu, MenuSections } from './context-menu';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';
import { RichText } from './rich-text';
import { TemplateSheet } from './template-sheet';
import { Toasts } from './toast';

/** O que a folha do template recebe: um novo (com o texto que já vem e a pasta onde nasce) ou um para mexer. */
export interface TemplateAsk {
  template: NoteTemplate | null;
  text: string;
  folder: string | null;
}

/** O que o menu do botão direito mostra: o de uma pasta, ou o de um template. */
type MenuOn = { kind: 'pasta'; folder: NoteFolder } | { kind: 'modelo'; template: NoteTemplate };

/** Um lugar da estante: uma mini-pasta (com os templates dela) ou os de fora das pastas. */
interface Shelf {
  folder: NoteFolder | null;
  templates: NoteTemplate[];
  open: boolean;
}

/**
 * Como a estante ficou, enquanto o site está aberto: as mini-pastas fechadas (reabrir o seletor as acha como
 * ficaram) e o último template posto ou copiado (o seletor reabre nele). Não vai para o navegador nem para a nuvem.
 */
@Injectable({ providedIn: 'root' })
export class TemplateShelfState {
  readonly shut = signal<ReadonlySet<string>>(new Set());
  lastUsed: string | null = null;
}

/**
 * Escolher um template do texto (o botão "Templates" da régua, ver ui/rich-editor.ts): a folha do "Escolher a nota"
 * (ui/card-picker.ts), com o mesmo papel, a busca no alto e a lista com a sua rolagem, só que em duas partes. À
 * esquerda, a estante: as mini-pastas em acordeão (core/template-folders.ts), cada uma abrindo os templates dela, e
 * depois os de fora das pastas; à direita, o template escolhido inteiro, como entra na anotação (grande o bastante
 * para ler um template comprido), com a pasta dele, o Copiar e o Editar. "Pôr no texto" (ou Enter, ou dois toques
 * na linha) o põe onde está o cursor.
 *
 * A busca acha no nome e no texto, e abre as pastas onde achou. A pasta tem o "…" (e o botão direito): um template
 * novo nela, Renomear e Desfazer a pasta (os de dentro ficam soltos; com o Desfazer). No celular, a estante ocupa
 * a folha, e tocar num template mostra ele inteiro, com a volta para a estante.
 *
 * Criar e mexer abrem a folha do template (ui/template-sheet.ts) por cima desta, que continua aberta.
 */
@Component({
  selector: 'app-template-picker',
  imports: [BackdropClose, ContextMenu, IconModule, NgTemplateOutlet, Pin, RichText, TemplateSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- as teclas ficam aqui: o editor por baixo não ouve o Esc nem o que se digita -->
    <dialog
      #dialog
      class="sheet escolher modelos"
      aria-labelledby="modelos-titulo"
      (close)="open.set(false)"
      (cancel)="onCancel($event)"
      (backdropClose)="open.set(false)"
      (keydown)="$event.stopPropagation()"
    >
      @if (open()) {
        <div class="ficha cartolina" data-cor="amarelo">
          <app-pin class="pin" />
          <header class="head">
            <div>
              <h2 id="modelos-titulo" tabindex="-1">
                <lucide-icon class="carimbo" [img]="StampIcon" [size]="26" aria-hidden="true" />
                Templates
              </h2>
              <p class="para">Textos prontos: escolha um para ver inteiro e pôr onde está o cursor.</p>
            </div>
            <button type="button" class="icon-btn" aria-label="Fechar" (click)="open.set(false)">
              <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
            </button>
          </header>

          <div class="ferramentas">
            <label class="busca">
              <lucide-icon [img]="SearchIcon" [size]="18" aria-hidden="true" />
              <span class="sr-only">Procurar no nome e no texto</span>
              <input
                #search
                type="search"
                autocomplete="off"
                placeholder="Procurar templates"
                [value]="query()"
                (input)="onQuery($any($event.target).value)"
                (keydown.enter)="$event.preventDefault(); putChosen()"
                (keydown.arrowdown)="$event.preventDefault(); focusRow(0)"
              />
            </label>
            <button type="button" class="papel" title="Uma mini-pasta para juntar os parecidos" (click)="newFolder()">
              <lucide-icon [img]="NewFolderIcon" [size]="17" aria-hidden="true" />
              <span class="papel-nome">Nova pasta</span>
            </button>
            <button type="button" class="papel" [disabled]="full()" [title]="full() ? fullText : 'Escrever um template novo'" (click)="create(null)">
              <lucide-icon [img]="NewIcon" [size]="17" aria-hidden="true" />
              <span class="papel-nome">Novo template</span>
            </button>
          </div>

          <div class="corpo" [class.detalhe]="detail()" [class.vazio]="!total()">
            <nav class="estante" aria-label="Seus templates" (keydown)="onShelfKey($event)">
              @if (!total()) {
                <div class="nada">
                  <p>Guarde um texto que você escreve sempre (uma pauta, um diário, uma lista): ele entra onde está o cursor, ou vai para o Ctrl+C.</p>
                  @if (hasSelection()) {
                    <button type="button" class="nada-link" (click)="create(null, selection())">Guardar o trecho selecionado</button>
                  } @else {
                    <button type="button" class="nada-link" (click)="create(null)">Escrever o primeiro</button>
                  }
                </div>
              }
              @for (s of shelves(); track s.folder?.id ?? '') {
                @if (s.folder; as f) {
                  <section class="pasta" [class.aberta]="s.open" [attr.aria-labelledby]="'mp-' + f.id">
                    <div class="cabeca" (contextmenu)="folderMenu($event, f)">
                      @if (naming() === f.id) {
                        <span class="seta" aria-hidden="true"></span>
                        <lucide-icon class="pasta-ico" [img]="OpenFolderIcon" [size]="19" aria-hidden="true" />
                        <input
                          #nome
                          class="nome-campo"
                          type="text"
                          autocomplete="off"
                          maxlength="32"
                          aria-label="Nome da pasta"
                          [value]="f.name"
                          (keydown.enter)="$event.preventDefault(); finishRename(f, $any($event.target).value)"
                          (keydown.escape)="$event.preventDefault(); $event.stopPropagation(); cancelRename()"
                          (blur)="finishRename(f, $any($event.target).value)"
                        />
                      } @else {
                        <button
                          type="button"
                          class="abre linha-foco"
                          [id]="'mp-' + f.id"
                          [attr.aria-expanded]="s.open"
                          [attr.aria-controls]="'mpl-' + f.id"
                          (click)="toggle(f.id)"
                        >
                          <lucide-icon class="seta" [img]="s.open ? DownIcon : RightIcon" [size]="15" aria-hidden="true" />
                          <lucide-icon class="pasta-ico" [img]="s.open ? OpenFolderIcon : FolderIcon" [size]="19" aria-hidden="true" />
                          <span class="pasta-nome">{{ f.name }}</span>
                          <span class="n"><span class="sr-only">, </span>{{ s.templates.length }}<span class="sr-only"> {{ s.templates.length === 1 ? 'template' : 'templates' }}</span></span>
                        </button>
                        <button type="button" class="mais" aria-haspopup="menu" [attr.aria-label]="'Mais da pasta ' + f.name" (click)="folderMenu($event, f)">
                          <lucide-icon [img]="MoreIcon" [size]="18" aria-hidden="true" />
                        </button>
                      }
                    </div>
                    @if (s.open) {
                      <ul class="modelos-lista" [id]="'mpl-' + f.id">
                        @for (t of s.templates; track t.id) {
                          <ng-container *ngTemplateOutlet="linha; context: { $implicit: t }" />
                        } @empty {
                          <li class="vazia">
                            Vazia: mova um template para cá, ou
                            <button type="button" class="nada-link" [disabled]="full()" (click)="create(f.id)">escreva um aqui</button>.
                          </li>
                        }
                      </ul>
                    }
                  </section>
                } @else {
                  <section class="soltos" aria-label="Fora das pastas">
                    @if (hasFolders()) {
                      <h3 class="soltos-titulo" aria-hidden="true">Fora das pastas</h3>
                    }
                    <ul class="modelos-lista">
                      @for (t of s.templates; track t.id) {
                        <ng-container *ngTemplateOutlet="linha; context: { $implicit: t }" />
                      }
                    </ul>
                  </section>
                }
              }
              @if (total() && needle() && !found()) {
                <p class="nada">
                  Nenhum template com “{{ query().trim() }}”.
                  <button type="button" class="nada-link" (click)="onQuery('')">Ver todos</button>
                </p>
              }
            </nav>

            @if (total()) {
              <section class="previa-lado" aria-label="O template escolhido" [attr.aria-live]="null">
                @if (chosen(); as t) {
                  <div class="previa-topo">
                    <button type="button" class="volta" (click)="back()">
                      <lucide-icon [img]="BackIcon" [size]="18" aria-hidden="true" />
                      Todos os templates
                    </button>
                    <h3 class="previa-nome">{{ t.title }}</h3>
                    <div class="previa-acoes">
                      <label class="escolha">
                        <lucide-icon [img]="FolderIcon" [size]="16" aria-hidden="true" />
                        <span class="escolha-pre">Pasta:</span>
                        <span class="escolha-val">{{ folderNameOf(t) }}</span>
                        <lucide-icon class="escolha-chev" [img]="DownIcon" [size]="15" aria-hidden="true" />
                        <select [attr.aria-label]="'Pasta de ' + t.title" (change)="moveTo(t, $any($event.target))">
                          <option value="" [selected]="!folderOf(t)">Fora das pastas</option>
                          @for (f of folders.list(); track f.id) {
                            <option [value]="f.id" [selected]="folderOf(t) === f.id">{{ f.name }}</option>
                          }
                          <option value="+">Nova pasta…</option>
                        </select>
                      </label>
                      <span class="previa-botoes">
                        <button type="button" class="papel" (click)="copyChosen()">
                          <lucide-icon [img]="CopyIcon" [size]="16" aria-hidden="true" />
                          Copiar
                        </button>
                        <button type="button" class="papel" (click)="edit(t)">
                          <lucide-icon [img]="EditIcon" [size]="16" aria-hidden="true" />
                          Editar
                        </button>
                      </span>
                    </div>
                  </div>
                  <div class="folha-previa" role="region" [attr.aria-label]="'Como “' + t.title + '” entra no texto'" tabindex="0">
                    <app-rich-text [text]="t.text" />
                  </div>
                } @else {
                  <p class="previa-nada">Escolha um template na estante para ver o texto inteiro aqui.</p>
                }
              </section>
            }
          </div>

          <footer class="foot">
            @if (full()) {
              <p class="conta">{{ fullText }}</p>
            } @else if (hasSelection() && total()) {
              <button type="button" class="btn-quiet guardar" (click)="create(null, selection())">
                <lucide-icon [img]="SaveIcon" [size]="17" aria-hidden="true" />
                Guardar o trecho selecionado
              </button>
            } @else if (total()) {
              <p class="conta">Enter ou dois toques no template também põem no texto.</p>
            }
            <div class="actions">
              <button type="button" class="btn-quiet" (click)="open.set(false)">Cancelar</button>
              @if (total()) {
                <button type="button" class="btn-ink" [disabled]="!chosen()" (click)="putChosen()">Pôr no texto</button>
              }
            </div>
          </footer>
        </div>

        <app-context-menu #menu [caption]="menuCaption()" [sections]="menuSections()" />
      }

      <!-- uma linha da estante: o nome à mão e o começo do texto embaixo; a escolhida, o traço de marca-texto -->
      <ng-template #linha let-t>
        @let on = t.id === chosenId();
        <li>
          <button
            type="button"
            class="modelo linha-foco"
            [class.on]="on"
            [attr.aria-current]="on ? 'true' : null"
            [attr.data-id]="t.id"
            (click)="choose(t, true)"
            (focus)="choose(t, false)"
            (dblclick)="put(t)"
            (keydown.enter)="$event.preventDefault(); put(t)"
            (contextmenu)="templateMenu($event, t)"
          >
            <span class="modelo-nome">{{ t.title }}</span>
            @if (previews().get(t.id); as p) {
              <span class="modelo-previa" aria-hidden="true">{{ p }}</span>
            }
          </button>
        </li>
      </ng-template>
    </dialog>

    <!-- a folha do template: vem num pedaço à parte, por cima desta -->
    @if (asking(); as a) {
      @defer (on immediate) {
        <app-template-sheet [template]="a.template" [startText]="a.text" [startFolder]="a.folder" (saved)="onSaved($event)" (removed)="onRemoved($event)" (closed)="onSheetClosed()" />
      }
    }
  `,
  styleUrls: ['./profile-picker.scss', './template-picker.scss'],
})
export class TemplatePicker {
  readonly open = model(false);
  /** O trecho selecionado na folha quando o seletor abriu ("Guardar o trecho selecionado"). */
  readonly selection = input('');
  /** Pôr o template onde está o cursor (o seletor fecha). */
  readonly picked = output<NoteTemplate>();
  /** Copiar o template para a área de transferência (o seletor fecha). */
  readonly copied = output<NoteTemplate>();

  private readonly settings = inject(Settings);
  protected readonly folders = inject(TemplateFolders);
  private readonly toasts = inject(Toasts);
  private readonly state = inject(TemplateShelfState);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly menu = viewChild<ContextMenu>('menu');

  protected readonly query = signal('');
  protected readonly needle = computed(() => fold(this.query().trim()));
  /** O template à vista na prévia (o id). */
  protected readonly chosenId = signal<string | null>(null);
  /** No celular: a prévia no lugar da estante. */
  protected readonly detail = signal(false);
  /** A pasta com o nome sendo escrito (a nova, ou a do Renomear). */
  protected readonly naming = signal<string | null>(null);
  /** A pasta que acabou de nascer, ainda sem o nome confirmado: desistir dele (o Esc) a desfaz, e o que ela levou volta. */
  private fresh: { id: string; undo: () => void; moved?: string } | null = null;
  /** A folha do template aberta por cima. */
  protected readonly asking = signal<TemplateAsk | null>(null);

  private readonly all = computed(() => this.settings.notesConfig().templates);
  protected readonly total = computed(() => this.all().length);
  protected readonly full = computed(() => this.total() >= MAX_TEMPLATES);
  protected readonly fullText = `Chegou a ${MAX_TEMPLATES} templates: apague um para guardar outro.`;
  protected readonly hasSelection = computed(() => !!this.selection().trim());
  protected readonly hasFolders = computed(() => this.folders.list().length > 0);

  /** O texto de cada um sem as marcas, numa linha (para a busca e para o começo embaixo do nome). */
  private readonly plain = computed(() => new Map(this.all().map((t) => [t.id, plainText(t.text)])));

  /**
   * O começo de cada um, numa linha (o "·" no lugar das quebras). A primeira linha igual ao nome (o nome sugerido
   * vem dela) não se repete embaixo dele; sem mais nada, sem a linha.
   */
  protected readonly previews = computed(() => {
    const out = new Map<string, string>();
    for (const [id, text] of this.plain()) {
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const t = this.all().find((x) => x.id === id);
      if (t && lines.length && fold(lines[0]) === fold(t.title)) lines.shift();
      out.set(id, lines.join(' · ').slice(0, 160));
    }
    return out;
  });

  private matches(t: NoteTemplate): boolean {
    const q = this.needle();
    return !q || fold(t.title).includes(q) || fold(this.plain().get(t.id) ?? '').includes(q);
  }

  /**
   * A estante: as mini-pastas de A a Z (todas, também as vazias; procurando, só as que acharam, abertas) e, no fim,
   * os de fora das pastas.
   */
  protected readonly shelves = computed<Shelf[]>(() => {
    const { shelves, loose } = this.folders.shelves();
    const searching = !!this.needle();
    const closed = this.state.shut();
    const out: Shelf[] = [];
    for (const s of shelves) {
      const templates = s.templates.filter((t) => this.matches(t));
      if (searching && !templates.length) continue;
      out.push({ folder: s.folder, templates, open: searching || !closed.has(s.folder.id) });
    }
    const free = loose.filter((t) => this.matches(t));
    if (free.length) out.push({ folder: null, templates: free, open: true });
    return out;
  });

  /** Os templates à vista na estante, na ordem dela. */
  private readonly visible = computed(() => this.shelves().flatMap((s) => (s.open ? s.templates : [])));
  protected readonly found = computed(() => this.shelves().some((s) => s.templates.length > 0));

  protected readonly chosen = computed(() => this.all().find((t) => t.id === this.chosenId()) ?? null);

  protected readonly StampIcon = ICON.templates;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly SearchIcon = ICON.buscar;
  protected readonly NewIcon = ICON.adicionar;
  protected readonly NewFolderIcon = ICON.novaPasta;
  protected readonly FolderIcon = ICON.pastaDeNotas;
  protected readonly OpenFolderIcon = ICON.pasta;
  protected readonly DownIcon = ICON.abrir;
  protected readonly RightIcon = ICON.proximo;
  protected readonly MoreIcon = ICON.maisOpcoes;
  protected readonly CopyIcon = ICON.copiar;
  protected readonly EditIcon = ICON.editar;
  protected readonly SaveIcon = ICON.guardarTrecho;
  protected readonly BackIcon = ICON.voltar;

  constructor() {
    let wasOpen = false;
    afterRenderEffect(() => {
      const el = this.dialog().nativeElement;
      const open = this.open();
      if (open && !el.open) el.showModal();
      else if (!open && el.open) el.close();
      if (open && !wasOpen) {
        untracked(() => {
          this.query.set('');
          this.detail.set(false);
          this.naming.set(null);
          // reabre no último usado (a pasta dele aberta), ou no primeiro da estante
          const last = this.state.lastUsed ? this.all().find((t) => t.id === this.state.lastUsed) : undefined;
          if (last) this.reveal(last);
          this.chosenId.set(last?.id ?? this.visible()[0]?.id ?? null);
        });
        // no toque, o foco fica no título: o teclado do celular não cobre a estante
        if (matchMedia('(pointer: coarse)').matches) this.host.nativeElement.querySelector<HTMLElement>('#modelos-titulo')?.focus();
        else this.search()?.nativeElement.focus();
      }
      wasOpen = open;
    });
  }

  /** A pasta de verdade do template (null: fora das pastas). */
  protected folderOf(t: NoteTemplate): string | null {
    return this.folders.of(t);
  }

  protected folderNameOf(t: NoteTemplate): string {
    const id = this.folderOf(t);
    return (id && this.folders.tree().live(id)?.name) || 'Fora das pastas';
  }

  /** Procurando: o primeiro que achou fica à vista na prévia. */
  protected onQuery(value: string): void {
    this.query.set(value);
    // procurando, a prévia (e o Enter) é sempre a do primeiro achado; sem nenhum, nenhuma
    if (this.needle()) this.chosenId.set(this.visible()[0]?.id ?? null);
  }

  /** Escolher um template mostra ele inteiro (no celular, no lugar da estante, pelo toque). */
  protected choose(t: NoteTemplate, byTap: boolean): void {
    this.chosenId.set(t.id);
    if (!byTap || !this.narrow()) return;
    this.detail.set(true);
    // a estante sai da tela: o foco vai para a volta, no alto da prévia
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.previa-lado .volta')?.focus(), { injector: this.injector });
  }

  /** De volta para a estante (no celular), com o foco no template que estava à vista. */
  protected back(): void {
    this.detail.set(false);
    const id = this.chosenId();
    afterNextRender(() => this.rowOf(id)?.focus({ preventScroll: false }), { injector: this.injector });
  }

  private narrow(): boolean {
    return matchMedia('(max-width: 720px)').matches;
  }

  protected toggle(id: string): void {
    // procurando, as pastas que acharam ficam abertas (fechar uma escondia o que se procurava)
    if (this.needle()) return;
    const next = new Set(this.state.shut());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.state.shut.set(next);
  }

  /** A pasta do template aberta (para ele aparecer na estante). */
  private reveal(t: NoteTemplate): void {
    const at = this.folders.of(t);
    if (at && this.state.shut().has(at)) {
      const next = new Set(this.state.shut());
      next.delete(at);
      this.state.shut.set(next);
    }
  }

  /** Pôr no texto: a folha fecha antes (com ela aberta, o texto por baixo não recebe o foco nem o colar). */
  protected put(t: NoteTemplate): void {
    this.state.lastUsed = t.id;
    this.shut(() => this.picked.emit(t));
  }

  /**
   * Fecha já (sem esperar a tela se atualizar): quem abriu volta a responder na hora, e recebe o template (`then`)
   * antes de saber que a folha fechou.
   */
  private shut(then: () => void): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
    then();
    this.open.set(false);
  }

  /** Pôr o da prévia (o que a busca escondeu não entra; o da pasta fechada, que continua na prévia, entra). */
  protected putChosen(): void {
    const t = this.chosen();
    if (t && this.matches(t)) this.put(t);
  }

  protected copyChosen(): void {
    const t = this.chosen();
    if (t) this.copy(t);
  }

  private copy(t: NoteTemplate): void {
    this.state.lastUsed = t.id;
    this.shut(() => this.copied.emit(t));
  }

  protected create(folder: string | null, text = ''): void {
    if (this.full()) return;
    this.asking.set({ template: null, text, folder });
  }

  protected edit(t: NoteTemplate): void {
    this.asking.set({ template: t, text: t.text, folder: this.folderOf(t) });
  }

  protected onSaved(t: NoteTemplate): void {
    this.toasts.show(`Template “${t.title}” guardado`);
    this.onQuery('');
    this.reveal(t);
    this.chosenId.set(t.id);
  }

  protected onRemoved(t: NoteTemplate): void {
    if (this.chosenId() === t.id) this.chosenId.set(this.visible()[0]?.id ?? null);
    this.detail.set(false);
    this.toasts.show(`Template “${t.title}” apagado`, {
      label: 'Desfazer',
      run: () => {
        // outro entrou no lugar e a lista encheu: ele não cabe (sumiria na próxima leitura)
        if (this.full()) return this.toasts.show(`Não coube: já são ${MAX_TEMPLATES} templates`);
        this.settings.restoreTemplate(t);
        this.chosenId.set(t.id);
      },
    });
  }

  /** A folha fechou: o foco volta para o template à vista (ou para a busca). */
  protected onSheetClosed(): void {
    this.asking.set(null);
    const id = this.chosenId();
    // no celular, com o template à vista no lugar da estante, o foco volta para a prévia (a volta)
    const back = () => (this.detail() ? this.host.nativeElement.querySelector<HTMLElement>('.previa-lado .volta') : this.rowOf(id)) ?? this.search()?.nativeElement;
    afterNextRender(() => back()?.focus(), { injector: this.injector });
  }

  /** O Esc com o nome de uma pasta sendo escrito só desiste do nome (a folha fica). */
  protected onCancel(e: Event): void {
    if (this.naming() !== null) {
      e.preventDefault();
      this.cancelRename();
    }
  }

  /** Desiste do nome: a pasta que acabou de nascer sai (com o template que foi para ela, de volta onde estava). */
  protected cancelRename(): void {
    const id = this.naming();
    this.naming.set(null);
    const fresh = this.fresh;
    this.fresh = null;
    if (fresh && fresh.id === id) {
      fresh.undo();
      this.folders.dissolve(id);
    }
  }

  // ===== as mini-pastas =====

  /** "Nova pasta": já com o nome para escrever, no lugar dela na estante. */
  protected newFolder(): void {
    const f = this.folders.create('');
    if (!f) return this.toasts.show('Não coube mais pasta');
    this.onQuery('');
    this.fresh = { id: f.id, undo: () => undefined };
    this.startRename(f.id);
  }

  /** O nome se escreve na estante (no celular, ela volta para o lugar da prévia). */
  private startRename(id: string): void {
    this.detail.set(false);
    this.naming.set(id);
    afterNextRender(
      () => {
        const field = this.host.nativeElement.querySelector<HTMLInputElement>('.nome-campo');
        field?.focus();
        field?.select();
      },
      { injector: this.injector },
    );
  }

  protected finishRename(f: NoteFolder, value: string): void {
    if (this.naming() !== f.id) return;
    this.naming.set(null);
    const fresh = this.fresh?.id === f.id ? this.fresh : null;
    this.fresh = null;
    // o nome de outra pasta não vale: duas iguais na estante e no "Pasta:" não se distinguem
    const twin = siblingNamed(this.folders.tree(), f.group, null, value, f.id);
    if (twin) this.toasts.show(`Já tem uma pasta “${twin.name}”: o nome ficou “${f.name}”`);
    else if (value.trim() && value.trim() !== f.name) this.folders.rename(f.id, value);
    // o template que foi para a pasta nova: o aviso com o Desfazer, agora com o nome dela
    if (fresh?.moved) {
      const name = this.folders.tree().live(f.id)?.name ?? f.name;
      this.toasts.show(`“${fresh.moved}” foi para ${name}`, { label: 'Desfazer', run: fresh.undo });
    }
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`#mp-${f.id}`)?.focus(), { injector: this.injector });
  }

  /** Mudar a pasta do template à vista (ou criar uma, com o "Nova pasta…"). */
  protected moveTo(t: NoteTemplate, select: HTMLSelectElement): void {
    const value = select.value;
    let to: string | null = value || null;
    if (value === '+') {
      const made = this.folders.create('');
      if (!made) {
        select.value = this.folderOf(t) ?? '';
        return this.toasts.show('Não coube mais pasta');
      }
      to = made.id;
    }
    const { moved, undo } = this.folders.place([t.id], to);
    this.reveal({ ...t, folder: to ?? undefined });
    if (value === '+' && to) {
      // a pasta nova pede o nome; o aviso com o Desfazer vem depois dele (desistir já desfaz tudo)
      this.fresh = { id: to, undo, moved: t.title };
      return this.startRename(to);
    }
    if (moved) this.toasts.show(to ? `“${t.title}” foi para ${this.folders.tree().live(to)?.name ?? 'a pasta'}` : `“${t.title}” saiu da pasta`, { label: 'Desfazer', run: undo });
  }

  private readonly menuOn = signal<MenuOn | null>(null);
  protected readonly menuCaption = computed(() => {
    const m = this.menuOn();
    return m ? (m.kind === 'pasta' ? m.folder.name : m.template.title) : '';
  });
  protected readonly menuSections = computed<MenuSections>(() => {
    const m = this.menuOn();
    if (!m) return [];
    if (m.kind === 'modelo') {
      const t = m.template;
      return [
        [
          { id: 'por', label: 'Pôr no texto', icon: ICON.templates, run: () => this.put(t) },
          { id: 'copiar', label: 'Copiar', icon: ICON.copiar, run: () => this.copy(t) },
          { id: 'editar', label: 'Editar', icon: ICON.editar, dialog: true, run: () => this.edit(t) },
        ],
      ];
    }
    const f = m.folder;
    return [
      [
        { id: 'novo', label: 'Novo template aqui', icon: ICON.adicionar, dialog: true, disabled: this.full(), run: () => this.create(f.id) },
        { id: 'renomear', label: 'Renomear', icon: ICON.editar, run: () => this.startRename(f.id) },
      ],
      [{ id: 'desfazer', label: 'Desfazer a pasta', icon: ICON.desfazerPasta, danger: true, hint: 'Os templates de dentro ficam fora das pastas; nenhum é apagado', run: () => this.dissolve(f) }],
    ];
  });

  protected folderMenu(e: MouseEvent, f: NoteFolder): void {
    this.openMenu(e, { kind: 'pasta', folder: f }, `pasta:${f.id}`);
  }

  protected templateMenu(e: MouseEvent, t: NoteTemplate): void {
    this.chosenId.set(t.id);
    this.openMenu(e, { kind: 'modelo', template: t }, `modelo:${t.id}`);
  }

  private openMenu(e: MouseEvent, on: MenuOn, key: string): void {
    e.preventDefault();
    const menu = this.menu();
    if (!menu) return;
    if (menu.isOpenFor(key) && e.type === 'click') return menu.close(true);
    this.menuOn.set(on);
    const target = e.currentTarget as HTMLElement;
    const byKey = e.type === 'click' && e.detail === 0;
    const r = target.getBoundingClientRect();
    const x = e.type === 'contextmenu' ? e.clientX : r.left;
    const y = e.type === 'contextmenu' ? e.clientY : r.bottom + 4;
    menu.show({ key, x, y, back: target, by: byKey ? 'teclado' : 'mouse' });
  }

  private dissolve(f: NoteFolder): void {
    const n = this.folders.counts().get(f.id) ?? 0;
    const undo = this.folders.dissolve(f.id);
    this.toasts.show(n ? `A pasta “${f.name}” saiu: ${plural(n, 'template ficou', 'templates ficaram')} fora das pastas` : `A pasta “${f.name}” saiu`, { label: 'Desfazer', run: undo });
  }

  // ===== o teclado da estante =====

  /** As linhas que o teclado anda: as cabeças das pastas e os templates à vista, na ordem da estante. */
  private rows(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.estante .linha-foco'));
  }

  private rowOf(id: string | null): HTMLElement | null {
    return id ? this.host.nativeElement.querySelector<HTMLElement>(`.modelo[data-id="${id}"]`) : null;
  }

  protected focusRow(at: number): void {
    const rows = this.rows();
    rows[Math.max(0, Math.min(at, rows.length - 1))]?.focus();
  }

  /**
   * As setas andam pelas linhas (para cima, da primeira, volta para a busca); na cabeça de uma pasta, a da direita
   * abre e a da esquerda fecha; num template, a da esquerda vai para a cabeça da pasta dele. Home e End.
   */
  protected onShelfKey(e: KeyboardEvent): void {
    const rows = this.rows();
    const active = document.activeElement as HTMLElement | null;
    const at = active ? rows.indexOf(active) : -1;
    if (at < 0) return;
    const head = active!.classList.contains('abre');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.key === 'ArrowUp' && at === 0) this.search()?.nativeElement.focus();
      else this.focusRow(at + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      this.focusRow(e.key === 'Home' ? 0 : rows.length - 1);
    } else if (e.key === 'ArrowRight' && head && active!.getAttribute('aria-expanded') === 'false') {
      e.preventDefault();
      active!.click();
    } else if (e.key === 'ArrowLeft') {
      if (head && active!.getAttribute('aria-expanded') === 'true') {
        e.preventDefault();
        active!.click();
      } else if (!head) {
        const up = active!.closest('.pasta')?.querySelector<HTMLElement>('.abre');
        if (up) {
          e.preventDefault();
          up.focus();
        }
      }
    }
  }
}
