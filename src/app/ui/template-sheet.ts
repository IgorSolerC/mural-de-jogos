import { ChangeDetectionStrategy, Component, ElementRef, Injector, forwardRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { MAX_TEMPLATE_TEXT, MAX_TEMPLATE_TITLE, NoteTemplate, cleanTitle, newTemplateId, suggestedTitle, titleTaken, withTemplateFolder } from '../core/note-templates';
import { plainText } from '../core/rich-text';
import { Settings } from '../core/settings';
import { TemplateFolders } from '../core/template-folders';
import { nameKey } from '../core/text';
import { BackdropClose } from './backdrop-close';
import { FolderPicker } from './folder-picker';
import { HeightVar } from './height-var';
import { RichEditor } from './rich-editor';
import { SaveKey } from './save-key';
import { Toasts } from './toast';

const COUNT = new Intl.NumberFormat('pt-BR');

/**
 * A folha de escrever um template do texto (aberta do seletor dos templates, ver ui/template-picker.ts): o nome, a
 * mini-pasta e o texto, escrito no editor das anotações (`app-rich-editor`: o Visual e o Markdown, a régua com o
 * Formatar e o Inserir, os widgets, a Ajuda e a tela cheia), no jeito de escrever deste aparelho. O Visual já mostra
 * como o template entra na anotação; o Markdown, as marcas.
 *
 * Sem nome, o template leva a primeira linha do texto (o campo mostra qual). A Pasta abre a escolha das pastas
 * (ui/folder-picker.ts), num nível só, com a busca e o "Criar". Guardar vale na hora (nas configurações do mural, que
 * vão para os outros aparelhos); mexendo num, dá para apagar (quem abriu oferece o Desfazer).
 *
 * Chega num pedaço à parte, só quando é aberta (ver o seletor).
 */
@Component({
  selector: 'app-template-sheet',
  // o editor das anotações chega pela volta: ele mesmo abre o seletor dos templates, que abre esta folha
  imports: [SaveKey, BackdropClose, FolderPicker, HeightVar, IconModule, forwardRef(() => RichEditor)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet folha-modelo" aria-labelledby="modelo-titulo" aria-describedby="modelo-sub" (close)="closed.emit()" (cancel)="onCancel($event)" (backdropClose)="closeIfUntouched()">
      <div class="ficha cartolina" style="--stock: var(--stock-amarelo)" data-cor="amarelo" (keydown)="onKey($event)">
        <header class="head">
          <div class="titulos">
            <h2 id="modelo-titulo">
              <lucide-icon class="carimbo" [img]="StampIcon" [size]="26" aria-hidden="true" />
              {{ template() ? 'Editar template' : 'Template novo' }}
            </h2>
            <p class="sub" id="modelo-sub">Um texto pronto para pôr no cursor ou copiar</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar sem guardar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="campos">
          <div class="parte-nome">
            <label class="titulo-campo" for="modelo-nome">Nome</label>
            <div class="campo" [class.erro]="problem() === 'nome' || problem() === 'repetido'">
              <input
                #nome
                id="modelo-nome"
                type="text"
                autocomplete="off"
                [attr.maxlength]="maxTitle"
                [placeholder]="suggested() || 'Como ele aparece no seletor'"
                [value]="title()"
                [attr.aria-invalid]="problem() === 'nome' || problem() === 'repetido' || null"
                [attr.aria-describedby]="title().trim() || !suggested() ? null : 'modelo-nome-dica'"
                (input)="title.set($any($event.target).value); tried.set(false); leaving.set(false)"
              />
            </div>
            @if (!title().trim() && suggested()) {
              <p class="dica" id="modelo-nome-dica">Sem nome, ele fica “{{ suggested() }}”.</p>
            }
          </div>
          <div class="parte-pasta">
            <span class="titulo-campo" id="modelo-pasta-rotulo">Pasta</span>
            <button
              type="button"
              class="pasta-botao"
              [class.solta]="!folderName()"
              aria-labelledby="modelo-pasta-rotulo modelo-pasta-valor"
              [attr.aria-expanded]="choosingFolder()"
              aria-controls="modelo-pasta-parte"
              (click)="toggleFolders()"
            >
              <lucide-icon class="pasta-ico" [img]="folderName() ? FolderIcon : LooseIcon" [size]="17" aria-hidden="true" />
              <span class="pasta-valor" id="modelo-pasta-valor">{{ folderName() ?? 'Fora das pastas' }}</span>
              <lucide-icon class="pasta-seta" [img]="choosingFolder() ? UpIcon : DownIcon" [size]="15" aria-hidden="true" />
            </button>
          </div>
          @if (choosingFolder()) {
            <div class="pasta-parte" id="modelo-pasta-parte">
              <app-folder-picker
                #pastas
                [flat]="true"
                [value]="folder()"
                (valueChange)="pickFolder($event)"
                [tree]="folders.tree()"
                [group]="folders.group"
                groupName="Templates"
                rootLabel="Fora das pastas"
                label="Pasta do template"
                emptyHint="Ainda não há mini-pastas: escreva um nome para criar a primeira."
                [units]="['template', 'templates']"
                [counts]="folders.counts()"
                (create)="createFolder($event.name)"
              />
            </div>
          }
        </div>

        <!-- o texto, no editor das anotações: ele cresce com o texto, e quem rola é a folha (uma rolagem só) -->
        <div class="conteudo" appHeightVar="--conteudo-h">
          <app-rich-editor
            #editor
            [class.erro]="problem() === 'texto' || problem() === 'longo'"
            label="Texto do template"
            placeholder="O que você escreve sempre: uma pauta, um diário, uma lista…"
            [onCard]="false"
            [fill]="true"
            [grows]="true"
            [max]="maxText"
            [value]="text()"
            (valueChange)="onText($event)"
          />
        </div>

        <footer class="foot">
          @if (template()) {
            <button type="button" class="btn-quiet apagar" (click)="remove()">
              <lucide-icon [img]="DeleteIcon" [size]="17" aria-hidden="true" />
              <span class="apagar-txt">Apagar</span>
            </button>
          }
          <p class="falta" [class.agora]="(tried() && !!problem()) || leaving()" role="status">{{ leaving() ? 'Ainda não guardado: Esc de novo fecha sem guardar' : tried() ? problemText() : '' }}</p>
          <div class="actions">
            <button type="button" class="btn-quiet" (click)="close()">Cancelar</button>
            <button type="button" class="btn-ink" appSaveKey (click)="save()">Guardar template</button>
          </div>
        </footer>
      </div>
    </dialog>
  `,
  styleUrl: './template-sheet.scss',
})
export class TemplateSheet {
  /** O template que se mexe (null: um novo). */
  readonly template = input<NoteTemplate | null>(null);
  /** O texto com que a folha abre (o do template, ou o trecho selecionado, ou nada). */
  readonly startText = input('');
  /** A mini-pasta com que a folha abre (a do template, ou a pasta onde o novo nasce; null: fora das pastas). */
  readonly startFolder = input<string | null>(null);
  /** Guardou (já nas configurações): quem abriu avisa. */
  readonly saved = output<NoteTemplate>();
  /** Apagou (já das configurações): quem abriu oferece o Desfazer. */
  readonly removed = output<NoteTemplate>();
  readonly closed = output<void>();

  private readonly settings = inject(Settings);
  protected readonly folders = inject(TemplateFolders);
  private readonly toasts = inject(Toasts);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly nameField = viewChild.required<ElementRef<HTMLInputElement>>('nome');
  private readonly editor = viewChild.required<RichEditor>('editor');
  private readonly folderPicker = viewChild<FolderPicker>('pastas');

  protected readonly title = signal('');
  protected readonly text = signal('');
  /** A mini-pasta escolhida aqui (null: fora das pastas). */
  protected readonly folder = signal<string | null>(null);
  /** A escolha da pasta aberta. */
  protected readonly choosingFolder = signal(false);
  /** A pasta foi escolhida nesta folha (sem isso, guardar não mexe na pasta, nem se ela mudou em outro aparelho). */
  private folderTouched = false;
  /** Tentou guardar: o que falta aparece (e fica até mexer no campo). */
  protected readonly tried = signal(false);
  protected readonly maxTitle = MAX_TEMPLATE_TITLE;
  protected readonly maxText = MAX_TEMPLATE_TEXT;

  /** O nome sugerido (só sem nome escrito; o começo do texto basta, sem ler tudo a cada letra). */
  protected readonly suggested = computed(() => (this.title().trim() ? '' : suggestedTitle(plainText(this.text().slice(0, 600)))));
  /** Apertou Esc com algo escrito: o próximo Esc fecha sem guardar. */
  protected readonly leaving = signal(false);
  /** O nome com que ele fica: o escrito ou, sem ele, o sugerido. */
  private readonly finalTitle = computed(() => cleanTitle(this.title()) || this.suggested());
  protected readonly tooLong = computed(() => this.text().length > MAX_TEMPLATE_TEXT);
  /** O nome da pasta escolhida, se ela ainda existe. */
  protected readonly folderName = computed(() => this.folders.tree().live(this.folder())?.name ?? null);

  /** O primeiro problema, na ordem dos campos (null: dá para guardar). */
  protected readonly problem = computed<'nome' | 'repetido' | 'texto' | 'longo' | null>(() => {
    if (!this.tried()) return null;
    const name = this.finalTitle();
    if (!this.text().trim()) return 'texto';
    if (this.tooLong()) return 'longo';
    if (!name) return 'nome';
    if (titleTaken(this.settings.notesConfig().templates, name, this.template()?.id ?? null)) return 'repetido';
    return null;
  });
  protected readonly problemText = computed(() => {
    switch (this.problem()) {
      case 'texto':
        return 'Falta o texto do template';
      case 'longo':
        return `O texto passou de ${COUNT.format(MAX_TEMPLATE_TEXT)} caracteres`;
      case 'nome':
        return 'Falta o nome do template';
      case 'repetido':
        return `Já tem um template “${this.takenBy()}”: escolha outro nome`;
      default:
        return '';
    }
  });

  /** O nome do outro template com o mesmo nome (como ele está escrito lá). */
  private readonly takenBy = computed(() => {
    const key = nameKey(this.finalTitle());
    return this.settings.notesConfig().templates.find((t) => t.id !== this.template()?.id && nameKey(t.title) === key)?.title ?? this.finalTitle();
  });

  protected readonly StampIcon = ICON.templates;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly DeleteIcon = ICON.apagar;
  protected readonly FolderIcon = ICON.pastaDeNotas;
  protected readonly LooseIcon = ICON.tirarDaPasta;
  protected readonly DownIcon = ICON.abrir;
  protected readonly UpIcon = ICON.recolher;

  constructor() {
    afterNextRender(() => {
      this.title.set(this.template()?.title ?? '');
      this.text.set(this.startText());
      this.folder.set(this.startFolder());
      const el = this.dialog().nativeElement;
      el.showModal();
      // novo e com o texto já vindo (o trecho selecionado): falta só o nome; senão, o texto
      if (!this.template() && this.startText().trim()) this.nameField().nativeElement.focus();
      else this.editor().focus();
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected onText(value: string): void {
    if (value === this.text()) return;
    this.text.set(value);
    this.tried.set(false);
    this.leaving.set(false);
  }

  /** Nada mudou desde que a folha abriu. */
  private untouched(): boolean {
    return this.title() === (this.template()?.title ?? '') && this.text() === this.startText() && !this.folderTouched;
  }

  /** Um toque fora da folha fecha só sem nada mudado: o texto escrito não se perde num toque sem querer (o X e o Cancelar fecham sempre). */
  protected closeIfUntouched(): void {
    if (this.untouched()) this.close();
  }

  /** O Esc com algo mudado avisa antes; o segundo fecha sem guardar. Com a escolha da pasta aberta, só a fecha. */
  protected onCancel(e: Event): void {
    if (this.choosingFolder()) {
      e.preventDefault();
      return this.closeFolders();
    }
    if (this.untouched() || this.leaving()) return;
    e.preventDefault();
    this.leaving.set(true);
  }

  /** Ctrl+Enter (ou Cmd+Enter) guarda de qualquer campo; Enter no nome vai para o texto. */
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

  protected toggleFolders(): void {
    if (this.choosingFolder()) return this.closeFolders();
    this.choosingFolder.set(true);
    afterNextRender(() => this.folderPicker()?.focus(), { injector: this.injector });
  }

  private closeFolders(): void {
    this.choosingFolder.set(false);
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>('.pasta-botao')?.focus(), { injector: this.injector });
  }

  protected pickFolder(id: string | null): void {
    this.folder.set(id);
    this.folderTouched = true;
    this.leaving.set(false);
    this.closeFolders();
  }

  /** O "Criar" da escolha: a mini-pasta nova, já escolhida. */
  protected createFolder(name: string): void {
    const made = this.folders.create(name);
    if (!made) return this.toasts.show('Não coube mais pasta');
    this.pickFolder(made.id);
  }

  protected save(): void {
    this.tried.set(true);
    const p = this.problem();
    if (p) {
      if (p === 'nome' || p === 'repetido') this.nameField().nativeElement.focus();
      else this.editor().focus();
      return;
    }
    const id = this.template()?.id ?? newTemplateId();
    // o de agora (outro aparelho pode tê-lo mudado de pasta com a folha aberta): a pasta só muda se foi escolhida aqui
    const now = this.settings.notesConfig().templates.find((t) => t.id === id);
    const base: NoteTemplate = { ...(now ?? { id, title: '', text: '' }), id, title: this.finalTitle(), text: this.text().replace(/\r\n?/g, '\n') };
    const chosen = this.folders.tree().live(this.folder()) ? this.folder() : null;
    const t = this.folderTouched || !now ? withTemplateFolder(base, chosen) : base;
    this.settings.saveTemplate(t);
    this.saved.emit(t);
    this.close();
  }

  protected remove(): void {
    const t = this.template();
    if (!t) return;
    const now = this.settings.notesConfig().templates.find((x) => x.id === t.id) ?? t;
    this.settings.removeTemplate(t.id);
    this.removed.emit(now);
    this.close();
  }
}
