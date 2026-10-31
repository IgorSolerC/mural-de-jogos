import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { MAX_TEMPLATE_TEXT, MAX_TEMPLATE_TITLE, NoteTemplate, cleanTitle, newTemplateId, suggestedTitle, titleTaken } from '../core/note-templates';
import { plainText } from '../core/rich-text';
import { Settings } from '../core/settings';
import { nameKey } from '../core/text';
import { BackdropClose } from './backdrop-close';
import { RichText } from './rich-text';

const COUNT = new Intl.NumberFormat('pt-BR');

/**
 * A folha de um template do texto (aberta do menu "Templates" da régua, ver ui/text-templates.ts): o nome
 * e o texto, com o markdown à vista, e ao lado (embaixo, no estreito) como ele fica. Sem nome, o template
 * leva a primeira linha do texto (o campo mostra qual). Guardar vale na hora (nas configurações do mural,
 * que vão para os outros aparelhos); mexendo num, dá para apagar (quem abriu oferece o Desfazer).
 *
 * Chega num pedaço à parte, só quando é aberta (ver o rich-editor).
 */
@Component({
  selector: 'app-template-sheet',
  imports: [BackdropClose, IconModule, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet folha-modelo" aria-labelledby="modelo-titulo" aria-describedby="modelo-sub" (close)="closed.emit()" (cancel)="onCancel($event)" (backdropClose)="closeIfUntouched()">
      <div class="ficha cartolina" style="--stock: var(--stock-amarelo)" data-cor="amarelo">
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

        <div class="body" (keydown)="onKey($event)">
          <div class="parte-nome">
            <label class="titulo-campo" for="modelo-nome">Nome</label>
            <div class="campo" [class.erro]="problem() === 'nome' || problem() === 'repetido'">
              <input
                #nome
                id="modelo-nome"
                type="text"
                autocomplete="off"
                [attr.maxlength]="maxTitle"
                [placeholder]="suggested() || 'Como ele aparece no menu'"
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

          <div class="partes">
            <div class="parte">
              <label class="titulo-campo" for="modelo-texto">Texto</label>
              <textarea
                #texto
                id="modelo-texto"
                spellcheck="true"
                placeholder="O que você escreve sempre…"
                [class.erro]="problem() === 'texto' || problem() === 'longo'"
                [attr.aria-invalid]="problem() === 'texto' || problem() === 'longo' || null"
                aria-describedby="modelo-texto-dica"
                [value]="text()"
                (input)="text.set($any($event.target).value); tried.set(false); leaving.set(false)"
              ></textarea>
              <p class="dica" id="modelo-texto-dica">
                Com as marcas do Markdown: <code>**negrito**</code>, <code>- [ ] tarefa</code>, <code>## título</code>.
                @if (nearLimit()) {
                  <span class="conta" [class.passou]="tooLong()">{{ count() }}</span>
                }
              </p>
            </div>
            <div class="parte">
              <p class="titulo-campo" aria-hidden="true">Como fica</p>
              <div class="previa" role="region" aria-label="Como o template fica no texto" tabindex="0">
                @if (text().trim()) {
                  <app-rich-text [text]="text()" />
                } @else {
                  <p class="previa-vazia">O texto aparece aqui do jeito que entra na anotação.</p>
                }
              </div>
            </div>
          </div>
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
            <button type="button" class="btn-ink" (click)="save()">Guardar template</button>
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
  /** Guardou (já nas configurações): quem abriu avisa. */
  readonly saved = output<NoteTemplate>();
  /** Apagou (já das configurações): quem abriu oferece o Desfazer. */
  readonly removed = output<NoteTemplate>();
  readonly closed = output<void>();

  private readonly settings = inject(Settings);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly nameField = viewChild.required<ElementRef<HTMLInputElement>>('nome');
  private readonly textField = viewChild.required<ElementRef<HTMLTextAreaElement>>('texto');

  protected readonly title = signal('');
  protected readonly text = signal('');
  /** Tentou guardar: o que falta aparece (e fica até mexer no campo). */
  protected readonly tried = signal(false);
  protected readonly maxTitle = MAX_TEMPLATE_TITLE;

  /** O nome sugerido (só sem nome escrito; o começo do texto basta, sem ler tudo a cada letra). */
  protected readonly suggested = computed(() => (this.title().trim() ? '' : suggestedTitle(plainText(this.text().slice(0, 600)))));
  /** Apertou Esc com algo escrito: o próximo Esc fecha sem guardar. */
  protected readonly leaving = signal(false);
  /** O nome com que ele fica: o escrito ou, sem ele, o sugerido. */
  private readonly finalTitle = computed(() => cleanTitle(this.title()) || this.suggested());
  protected readonly tooLong = computed(() => this.text().length > MAX_TEMPLATE_TEXT);
  protected readonly nearLimit = computed(() => this.text().length > MAX_TEMPLATE_TEXT * 0.8);
  protected readonly count = computed(() => `${COUNT.format(this.text().length)} de ${COUNT.format(MAX_TEMPLATE_TEXT)}`);

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

  constructor() {
    afterNextRender(() => {
      this.title.set(this.template()?.title ?? '');
      this.text.set(this.startText());
      const el = this.dialog().nativeElement;
      el.showModal();
      // novo e com o texto já vindo (o trecho selecionado): falta só o nome; senão, o texto
      const first = this.template() || !this.startText().trim() ? this.textField() : this.nameField();
      first.nativeElement.focus();
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  /** Nada mudou desde que a folha abriu. */
  private untouched(): boolean {
    return this.title() === (this.template()?.title ?? '') && this.text() === this.startText();
  }

  /** Um toque fora da folha fecha só sem nada mudado: o texto escrito não se perde num toque sem querer (o X e o Cancelar fecham sempre). */
  protected closeIfUntouched(): void {
    if (this.untouched()) this.close();
  }

  /** O Esc com algo mudado avisa antes; o segundo fecha sem guardar. */
  protected onCancel(e: Event): void {
    if (this.untouched() || this.leaving()) return;
    e.preventDefault();
    this.leaving.set(true);
  }

  /** Ctrl+Enter (ou Cmd+Enter) guarda de qualquer campo; Enter no nome vai para o texto. */
  protected onKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.isComposing) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.save();
    } else if (e.target === this.nameField().nativeElement) {
      e.preventDefault();
      this.textField().nativeElement.focus();
    }
  }

  protected save(): void {
    this.tried.set(true);
    const p = this.problem();
    if (p) {
      (p === 'nome' || p === 'repetido' ? this.nameField() : this.textField()).nativeElement.focus();
      return;
    }
    const t: NoteTemplate = { id: this.template()?.id ?? newTemplateId(), title: this.finalTitle(), text: this.text().replace(/\r\n?/g, '\n') };
    this.settings.saveTemplate(t);
    this.saved.emit(t);
    this.close();
  }

  protected remove(): void {
    const t = this.template();
    if (!t) return;
    this.settings.removeTemplate(t.id);
    this.removed.emit(t);
    this.close();
  }
}
