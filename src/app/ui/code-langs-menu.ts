import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { ICON, IconModule } from './icons';
import { CODE_THEMES, CODE_THEME_NAMES, CodeLang, codeLangInfo, codeLangOf, codeLangWord, codeLangsFor, codeThemeOf, typedCodeLang } from '../core/code-langs';
import { Settings } from '../core/settings';

let seq = 0;

/**
 * O menu "Código" da régua do texto (ver ui/rich-editor.ts, que o põe no cartão de papel dos menus),
 * enquanto o cursor está num bloco de código, nos dois modos, como o menu "Card": a linguagem do bloco
 * (as cores do realce) e o que fazer com ele.
 *
 * - "Linguagem": o campo onde se escreve o nome (ou o jeito curto: "js", "py"), filtrando a lista; sem
 *   nada escrito, as comuns e "Sem linguagem". Cada uma mostra, num recorte do formulário, a palavra que
 *   vai depois das crases. O nome que não está na lista também vale ("Usar “elixir”", sem cores).
 * - "Tema": o fundo e as cores deste bloco (ver core/code-langs.ts), com um recorte de cada um; "Padrão" segue os Ajustes.
 * - "Bloco": copiar o código (só as letras) e desfazer o bloco (as letras voltam a ser texto).
 *
 * Teclado: o foco abre no campo; Enter escolhe a primeira da lista (ou o que se escreveu), a seta para
 * baixo desce para a lista; nela, as setas, Home e End andam, a seta para cima do primeiro volta ao campo,
 * e uma letra volta ao campo escrevendo. Esc e Tab saem (quem fecha é a régua, pelo `leave`).
 */
@Component({
  selector: 'app-code-langs',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'menu', tabindex: '-1', 'aria-label': 'Código', '(keydown)': 'onKey($event)' },
  template: `
    <div class="coluna" role="group" [attr.aria-labelledby]="uid + '-l'">
      <p class="secao" [id]="uid + '-l'" aria-hidden="true">Linguagem</p>
      <label class="campo">
        <lucide-icon [img]="SearchIcon" [size]="16" aria-hidden="true" />
        <input
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="js, python, sql…"
          aria-label="A linguagem do bloco: escreva o nome"
          [attr.aria-describedby]="uid + '-dica'"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          (keydown)="onFieldKey($event)"
        />
      </label>
      <p class="dica" [id]="uid + '-dica'">Ou escreva depois das crases: <span class="cod-recorte">\`\`\`js</span></p>
      <div class="lista">
        @if (!query().trim()) {
          <button type="button" role="menuitemradio" tabindex="-1" class="menu-op op" [attr.aria-checked]="!lingua()" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="pick.emit('')">
            <span class="cod-recorte vazio" aria-hidden="true"></span>
            <span class="nome">Sem linguagem</span>
            @if (!lingua()) {
              <lucide-icon class="marcado" [img]="ChosenIcon" [size]="16" aria-hidden="true" />
            }
          </button>
        }
        @for (l of options(); track l.name) {
          <button type="button" role="menuitemradio" tabindex="-1" class="menu-op op" [attr.aria-checked]="current() === l" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="pick.emit(info(l))">
            <span class="cod-recorte" aria-hidden="true">{{ info(l) }}</span>
            <span class="nome">{{ l.name }}</span>
            @if (current() === l) {
              <lucide-icon class="marcado" [img]="ChosenIcon" [size]="16" aria-hidden="true" />
            }
          </button>
        }
        @if (typed(); as t) {
          <button type="button" role="menuitem" tabindex="-1" class="menu-op op" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="pick.emit(t)">
            <span class="cod-recorte" aria-hidden="true">{{ t }}</span>
            <span class="nome">Usar “{{ t }}”<small>sem cores: o site não conhece</small></span>
          </button>
        }
      </div>
    </div>
    <div class="coluna">
      <div class="parte" role="group" [attr.aria-labelledby]="uid + '-t'">
        <p class="secao" [id]="uid + '-t'" aria-hidden="true">Tema</p>
        <button type="button" role="menuitemradio" tabindex="-1" class="menu-op" [attr.aria-checked]="!ownTheme()" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="theme.emit('')">
          <span class="amostra" [attr.data-tema]="defaultTheme()" aria-hidden="true"><b>if</b>&ngsp;<i>"a"</i></span>
          <span class="nome">Padrão<small>{{ themeNames[defaultTheme()] }}, dos Ajustes</small></span>
          @if (!ownTheme()) {
            <lucide-icon class="marcado" [img]="ChosenIcon" [size]="16" aria-hidden="true" />
          }
        </button>
        @for (t of themes; track t) {
          <button type="button" role="menuitemradio" tabindex="-1" class="menu-op" [attr.aria-checked]="ownTheme() === t" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="theme.emit(t)">
            <span class="amostra" [attr.data-tema]="t" aria-hidden="true"><b>if</b>&ngsp;<i>"a"</i></span>
            <span class="nome">{{ themeNames[t] }}</span>
            @if (ownTheme() === t) {
              <lucide-icon class="marcado" [img]="ChosenIcon" [size]="16" aria-hidden="true" />
            }
          </button>
        }
      </div>
      <div class="parte" role="group" [attr.aria-labelledby]="uid + '-b'">
        <p class="secao bloco" [id]="uid + '-b'" aria-hidden="true">Bloco</p>
        <button type="button" role="menuitem" tabindex="-1" class="menu-op acao" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="copy.emit()">
          <lucide-icon [img]="CopyIcon" [size]="17" aria-hidden="true" />
          <span class="nome">Copiar o código</span>
        </button>
        <button type="button" role="menuitem" tabindex="-1" class="menu-op acao" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="undo.emit()">
          <lucide-icon [img]="UnwrapIcon" [size]="17" aria-hidden="true" />
          <span class="nome">Desfazer o bloco</span>
        </button>
      </div>
    </div>
  `,
  styles: `
    @use 'formatado';

    :host {
      display: grid;
      align-content: start;
    }
    /* numa coluna só (estreita, ou presa em cima do teclado), as partes uma embaixo da outra, com o
       risco tracejado entre elas, como nos outros menus de duas partes da régua */
    .coluna,
    .parte {
      display: grid;
      align-content: start;
      min-width: 0;
    }
    .coluna + .coluna {
      margin-top: 4px;
      padding-top: 6px;
      background: linear-gradient(to right, rgb(21 21 21 / 0.16) 50%, transparent 50%) left top / 8px 1.5px repeat-x;
    }
    @container folha (min-width: 520px) {
      :host(.duas) {
        grid-template-columns: minmax(15rem, max-content) minmax(12rem, max-content);
        column-gap: 8px;
      }
      :host(.duas) .coluna + .coluna {
        margin-top: 0;
        padding: 0 0 0 8px;
        background: linear-gradient(rgb(21 21 21 / 0.16) 50%, transparent 50%) left top / 1.5px 8px repeat-y;
      }
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
    /* o campo: a tira branca com o fio de tinta dos campos do site */
    .campo {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 6px 2px;
      padding: 0 8px;
      border-radius: 2px;
      background: #fff;
      box-shadow: inset 0 0 0 1.5px rgb(21 21 21 / 0.55);
      color: var(--ink-2);
    }
    .campo:focus-within {
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 0 0 3px rgb(255 218 66 / 0.6);
    }
    .campo input {
      flex: 1;
      min-width: 0;
      height: 36px;
      padding: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--ink);
      caret-color: var(--red);
      font-family: var(--f-codigo);
      font-size: 0.95rem;
    }
    .campo input::placeholder {
      color: rgb(21 21 21 / 0.55);
    }
    .dica {
      margin: 2px 8px 6px;
      font-size: 0.8rem;
      line-height: 1.3;
      color: var(--ink-2);
    }
    .lista {
      display: grid;
      max-height: min(19rem, 46vh);
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    button {
      border: 0;
      background: transparent;
      color: var(--ink);
      text-align: left;
      cursor: pointer;
    }
    .menu-op {
      display: grid;
      grid-template-columns: 4.2rem minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      min-height: 36px;
      padding: 2px 10px 2px 8px;
      border-radius: 3px;
    }
    .acao {
      grid-template-columns: 22px minmax(0, 1fr);
    }
    .menu-op:hover,
    .menu-op:focus {
      background: rgb(21 21 21 / 0.07);
    }
    .menu-op:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -1px;
    }
    /* a escolhida: o marca-texto amarelo e o tique, como no menu do card */
    .menu-op[aria-checked='true'] {
      background: rgb(255 218 66 / 0.4);
    }
    .nome {
      display: grid;
      font-family: var(--f-hand);
      font-size: 1.08rem;
      line-height: 1.2;
    }
    .nome small {
      font-family: var(--f-ui);
      font-size: 0.78rem;
      color: var(--ink-2);
    }
    /* a palavra que vai depois das crases: o recorte de fita, como o código na linha do texto */
    .cod-recorte {
      justify-self: start;
      max-width: 100%;
      overflow: hidden;
      @include formatado.cod-recorte;
      padding-block: 0 0.06em;
      font-size: 0.82rem;
      line-height: 1.5;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cod-recorte.vazio {
      visibility: hidden;
    }
    .secao.bloco {
      margin-top: 8px;
    }
    /* o tema: um recorte da própria folha, com o fundo e duas tintas dele */
    @include formatado.codigo-temas('.amostra');
    .amostra {
      justify-self: start;
      padding: 0 0.42em 0.06em;
      border-radius: 2px 3px 2px 3px;
      background: var(--cod-fundo, #fbfcf6);
      box-shadow:
        0 0 0 1px var(--cod-beira, rgb(47 107 58 / 0.2)),
        0 1px 1px rgb(0 0 0 / 0.16);
      font-family: var(--f-codigo);
      font-size: 0.82rem;
      line-height: 1.5;
      white-space: nowrap;
    }
    .amostra b {
      color: var(--tk-pal, #5b2d8e);
      font-weight: var(--tk-pal-peso, 400);
    }
    .amostra i {
      color: var(--tk-txt, #0b6b33);
      font-style: normal;
    }
    .marcado {
      color: var(--ink);
    }
    .acao lucide-icon ::ng-deep svg,
    .campo lucide-icon ::ng-deep svg {
      display: block;
    }
    @media (pointer: coarse) {
      .menu-op {
        min-height: 44px;
      }
      .campo input {
        height: 44px;
        font-size: 1rem;
      }
    }
    @media (forced-colors: active) {
      .menu-op[aria-checked='true'] {
        outline: 1px solid CanvasText;
      }
    }
  `,
})
export class CodeLangsMenu {
  /** O que está escrito agora depois das crases do bloco do cursor ("" sem linguagem). */
  readonly lingua = input('');
  /** A linguagem escolhida: o que vai depois das crases ("" tira a que tinha). */
  readonly pick = output<string>();
  /** O tema escolhido ("" volta ao padrão dos Ajustes). */
  readonly theme = output<string>();
  readonly copy = output<void>();
  readonly undo = output<void>();
  /** O teclado saiu do menu: Esc (volta para quem abriu) ou Tab (segue adiante). */
  readonly leave = output<'escape' | 'tab'>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly settings = inject(Settings);

  protected readonly themes = CODE_THEMES;
  protected readonly themeNames = CODE_THEME_NAMES;
  /** O tema escrito no bloco (null: segue o padrão). */
  protected readonly ownTheme = computed(() => codeThemeOf(this.lingua()));
  protected readonly defaultTheme = computed(() => this.settings.notesConfig().codeTheme);

  constructor() {
    // abre com o foco no campo: escrever é o jeito de achar uma entre tantas. No toque, o foco fica no menu: o
    // teclado subindo cobriria o Tema e as ações, e a lista já mostra as comuns
    afterNextRender(() => {
      const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      const target = touch ? this.host.nativeElement : this.host.nativeElement.querySelector<HTMLInputElement>('input');
      target?.focus({ preventScroll: true });
    });
  }

  protected readonly uid = 'codigo-' + ++seq;
  protected readonly query = signal('');
  protected readonly options = computed(() => codeLangsFor(this.query()));
  protected readonly current = computed(() => codeLangOf(this.lingua()));
  /**
   * O que se escreveu e não é jeito de escrever nenhuma da lista: "Usar" vale assim mesmo, sem cores (no fim
   * da lista: "tex" ainda mostra o Texto antes, e o Enter escolhe o primeiro da lista).
   */
  protected readonly typed = computed(() => {
    const t = typedCodeLang(this.query());
    return !t || codeLangOf(t) ? '' : t;
  });

  protected readonly SearchIcon = ICON.buscar;
  protected readonly CopyIcon = ICON.copiar;
  protected readonly UnwrapIcon = ICON.borracha;
  protected readonly ChosenIcon = ICON.pronto;

  protected info(l: CodeLang): string {
    // a do bloco escrita de outro jeito ("javascript"): o menu mostra (e mantém) o jeito de quem escreveu
    const own = codeLangWord(this.lingua());
    return this.current() === l && own ? own : codeLangInfo(l);
  }

  private items(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.menu-op'));
  }

  /** No campo: Enter escolhe, a seta para baixo vai para a lista, Esc e Tab saem. */
  protected onFieldKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const t = typedCodeLang(this.query());
      if (!t) return;
      const known = codeLangOf(t);
      const first = this.options()[0];
      return this.pick.emit(known || !first ? t : codeLangInfo(first));
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      this.items()[0]?.focus();
      return;
    }
    // o resto das teclas é do campo (as setas do lado, Home e End andam no que se escreve)
    if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return this.leave.emit('escape');
    }
    if (e.key === 'Tab') return this.leave.emit('tab');
    const items = this.items();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const field = this.host.nativeElement.querySelector<HTMLInputElement>('input');
    const go = (i: number) => {
      e.preventDefault();
      if (i < 0) field?.focus();
      else items[Math.min(i, items.length - 1)]?.focus();
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ' && at >= 0) {
      // uma letra na lista: volta ao campo, escrevendo nele
      field?.focus();
    }
  }
}
