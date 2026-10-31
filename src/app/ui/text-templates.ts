import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { ICON, IconModule } from './icons';
import { MAX_TEMPLATES, NoteTemplate, sortedTemplates } from '../core/note-templates';
import { plainText } from '../core/rich-text';
import { Settings } from '../core/settings';
import { fold } from '../core/text';

let seq = 0;

/** O que o menu pede para a folha do template: um novo (com o texto que já vem, como o trecho selecionado) ou mexer num. */
export interface TemplateAsk {
  template: NoteTemplate | null;
  text: string;
}

/**
 * O menu "Templates" da régua do texto (ver ui/rich-editor.ts, que o põe no cartão de papel dos menus): os
 * templates guardados, pelo nome, cada um com o começo do texto embaixo. A linha inteira põe o template
 * no cursor; ao lado, Copiar (para o Ctrl+V) e Editar. Embaixo, "Guardar o trecho selecionado" (com uma
 * seleção na folha) e "Novo template", que abrem a folha do template (ui/template-sheet.ts).
 *
 * Teclado, como o menu de duas colunas da régua: as setas para cima e para baixo andam pelas linhas (na
 * mesma coluna: Pôr, Copiar ou Editar), as do lado pela linha; Home e End; uma letra pula para o próximo
 * nome com ela; Esc e Tab saem (quem fecha é a régua, pelo `leave`).
 */
@Component({
  selector: 'app-text-templates',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'menu', tabindex: '-1', 'aria-label': 'Templates', '[attr.aria-describedby]': 'note()', '(keydown)': 'onKey($event)' },
  template: `
    <p class="secao" aria-hidden="true">Templates</p>
    @if (list().length) {
      <div class="lista" role="group" aria-label="Seus templates">
        @for (t of list(); track t.id) {
          <div class="linha" role="none">
            <button
              type="button"
              role="menuitem"
              tabindex="-1"
              class="menu-op por"
              [attr.aria-label]="'Pôr “' + t.title + '” no texto'"
              [title]="'Pôr no texto, onde está o cursor'"
              (pointerdown)="$event.preventDefault()"
              (pointerenter)="$any($event.currentTarget).focus()"
              (click)="put.emit(t)"
            >
              <span class="nome">{{ t.title }}</span>
              @if (previews().get(t.id); as p) {
                <span class="previa" aria-hidden="true">{{ p }}</span>
              }
            </button>
            <button type="button" role="menuitem" tabindex="-1" class="mini" [attr.aria-label]="'Copiar “' + t.title + '”'" title="Copiar, para colar com Ctrl+V" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="copy.emit(t)">
              <lucide-icon [img]="CopyIcon" [size]="17" aria-hidden="true" />
            </button>
            <button type="button" role="menuitem" tabindex="-1" class="mini" [attr.aria-label]="'Editar “' + t.title + '”'" title="Editar ou apagar" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="edit.emit({ template: t, text: t.text })">
              <lucide-icon [img]="EditIcon" [size]="16" aria-hidden="true" />
            </button>
          </div>
        }
      </div>
    } @else {
      <p class="vazio" [id]="uid + '-vazio'">Guarde um texto que você escreve sempre: ele entra onde está o cursor, ou vai para o Ctrl+C.</p>
    }
    <span class="fio" role="separator"></span>
    @if (full()) {
      <p class="cheio" [id]="uid + '-cheio'">Chegou a {{ max }} templates: apague um para guardar outro.</p>
    } @else {
      @if (hasSelection()) {
        <button type="button" role="menuitem" tabindex="-1" class="menu-op acao" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="edit.emit({ template: null, text: selection() })">
          <lucide-icon [img]="SaveIcon" [size]="17" aria-hidden="true" />
          <span>Guardar o trecho selecionado</span>
        </button>
      }
      <button type="button" role="menuitem" tabindex="-1" class="menu-op acao" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="edit.emit({ template: null, text: '' })">
        <lucide-icon [img]="NewIcon" [size]="17" aria-hidden="true" />
        <span>Novo template</span>
      </button>
    }
  `,
  styles: `
    :host {
      display: grid;
      align-content: start;
    }
    .secao {
      margin: 3px 8px 4px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.76rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    .lista {
      display: grid;
    }
    /* uma linha: o template (o nome à mão e o começo do texto embaixo), e Copiar e Editar quietos na ponta */
    .linha {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 2px;
      border-radius: 3px;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    /* acesa, uma linha só: a do foco, que segue o ponteiro (cada botão pega o foco quando ele entra, como
       nos outros menus da régua) */
    .linha:focus-within {
      background: rgb(21 21 21 / 0.07);
    }
    button {
      border: 0;
      background: transparent;
      color: var(--ink);
      text-align: left;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -1px;
    }
    .por {
      display: grid;
      gap: 1px;
      min-width: 0;
      min-height: 44px;
      padding: 5px 6px 5px 10px;
      border-radius: 3px;
    }
    .nome {
      overflow: hidden;
      font-family: var(--f-hand);
      font-size: 1.08rem;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .previa {
      overflow: hidden;
      font-size: 0.82rem;
      line-height: 1.3;
      color: var(--ink-2);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Copiar e Editar: só o desenho, a 60% até a linha acender (no toque, sempre inteiros) */
    .mini {
      display: grid;
      place-items: center;
      width: 34px;
      height: 36px;
      border-radius: 3px;
      color: rgb(21 21 21 / 0.6);
      transition:
        color var(--t-ui) var(--ease-ui),
        background-color var(--t-ui) var(--ease-ui);
    }
    .mini lucide-icon ::ng-deep svg {
      display: block;
    }
    .linha:focus-within .mini {
      color: var(--ink);
    }
    .mini:focus {
      background: rgb(21 21 21 / 0.09);
    }
    .vazio,
    .cheio {
      max-width: 19rem;
      margin: 0 8px 6px;
      font-family: var(--f-hand);
      font-size: 1rem;
      line-height: 1.3;
      color: var(--ink-2);
    }
    .fio {
      margin: 4px 8px;
      border-top: 2px dashed rgb(21 21 21 / 0.16);
    }
    .acao {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      min-height: 36px;
      padding: 2px 10px 2px 8px;
      border-radius: 3px;
      font-family: var(--f-hand);
      font-size: 1.08rem;
      line-height: 1.2;
    }
    .acao:focus {
      background: rgb(21 21 21 / 0.07);
    }
    .acao lucide-icon ::ng-deep svg {
      display: block;
    }
    @media (pointer: coarse) {
      .mini {
        width: 44px;
        height: 44px;
        color: var(--ink);
      }
      .acao {
        min-height: 44px;
      }
    }
    @media (forced-colors: active) {
      .linha:focus-within {
        outline: 1px solid CanvasText;
      }
    }
  `,
})
export class TextTemplates {
  /** O trecho selecionado na folha agora (com ele, "Guardar o trecho selecionado"). */
  readonly selection = input('');
  /** Pôr o template no cursor. */
  readonly put = output<NoteTemplate>();
  /** Copiar o template para a área de transferência. */
  readonly copy = output<NoteTemplate>();
  /** Abrir a folha do template (novo ou para mexer). */
  readonly edit = output<TemplateAsk>();
  /** O teclado saiu do menu: Esc (volta para quem abriu) ou Tab (segue adiante). */
  readonly leave = output<'escape' | 'tab'>();

  private readonly settings = inject(Settings);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly list = computed(() => sortedTemplates(this.settings.notesConfig().templates));
  /**
   * O começo de cada um, sem as marcas, numa linha (o "·" no lugar das quebras). A primeira linha igual ao
   * nome (o nome sugerido vem dela) não se repete embaixo dele; sem mais nada, sem a linha.
   */
  protected readonly previews = computed(
    () =>
      new Map(
        this.list().map((t) => {
          const lines = plainText(t.text)
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
          if (lines.length && fold(lines[0]) === fold(t.title)) lines.shift();
          return [t.id, lines.join(' · ').slice(0, 160)];
        }),
      ),
  );
  protected readonly hasSelection = computed(() => !!this.selection().trim());
  protected readonly full = computed(() => this.settings.notesConfig().templates.length >= MAX_TEMPLATES);
  protected readonly max = MAX_TEMPLATES;
  protected readonly uid = 'modelos-' + ++seq;
  /** O aviso do menu (sem nenhum, ou cheio), para o leitor de tela, que no menu só ouve os itens. */
  protected readonly note = computed(() => (this.full() ? this.uid + '-cheio' : this.list().length ? null : this.uid + '-vazio'));

  protected readonly CopyIcon = ICON.copiar;
  protected readonly EditIcon = ICON.editar;
  protected readonly NewIcon = ICON.adicionar;
  protected readonly SaveIcon = ICON.guardarTrecho;

  /** As linhas do menu, cada uma com os botões dela na ordem (um template: Pôr, Copiar, Editar; uma ação: ela só). */
  private rows(): HTMLElement[][] {
    const el = this.host.nativeElement;
    return Array.from(el.querySelectorAll<HTMLElement>('.linha, .acao')).map((r) => (r.classList.contains('linha') ? Array.from(r.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [r]));
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return this.leave.emit('escape');
    }
    if (e.key === 'Tab') return this.leave.emit('tab');
    const rows = this.rows();
    if (!rows.length) return;
    const active = document.activeElement as HTMLElement | null;
    let row = rows.findIndex((r) => r.includes(active!));
    const col = row < 0 ? 0 : rows[row].indexOf(active!);
    const go = (r: number, c: number) => {
      e.preventDefault();
      const to = rows[(r + rows.length) % rows.length];
      to[Math.min(c, to.length - 1)]?.focus();
    };
    if (e.key === 'ArrowDown') go(row + 1, col);
    else if (e.key === 'ArrowUp') go(row < 0 ? rows.length - 1 : row - 1, col);
    else if (e.key === 'Home') go(0, 0);
    else if (e.key === 'End') go(rows.length - 1, 0);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (row < 0) return go(0, 0);
      e.preventDefault();
      rows[row][Math.max(0, Math.min(col + (e.key === 'ArrowRight' ? 1 : -1), rows[row].length - 1))]?.focus();
    } else if (e.key.length === 1 && /\p{L}|\p{N}/u.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // uma letra: o próximo template cujo nome começa com ela (sem ligar para acento)
      const want = fold(e.key);
      const list = this.list();
      if (row >= list.length) row = -1;
      for (let i = 1; i <= list.length; i++) {
        const at = (row + i + list.length) % list.length;
        if (fold(list[at].title).startsWith(want)) return go(at, 0);
      }
    }
  }
}
