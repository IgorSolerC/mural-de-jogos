import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal, viewChild } from '@angular/core';
import {
  Blocks,
  Bold,
  Check,
  ChevronDown,
  CircleHelp,
  Code,
  CornerDownRight,
  Eye,
  EyeOff,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Hourglass,
  CassetteTape,
  Clapperboard,
  Image,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  LucideAngularModule,
  LucideIconData,
  Maximize2,
  Minimize2,
  Minus,
  PenLine,
  Pilcrow,
  Plus,
  SquareCode,
  Strikethrough,
  Table,
  Quote,
  StickyNote,
  Type,
  X,
} from 'lucide-angular';
import { bodyIndent, isTableSep, itemEnd, lineKind, linesOf, linkAt, ownerItem, tableCells, toggleCheck } from '../core/rich-text';
import { NoteLinks, linkKey, resolveNote } from '../core/note-links';
import { cap, profileOf } from '../core/kinds';
import { Review, formatReviewDate, isNote } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { RichText } from './rich-text';
import { NoteWidget } from './note-widget';
import { CardPicker } from './card-picker';
import { MarkupGuide } from './markup-guide';
import { WIDGETS, WIDGET_SIZES, WidgetDef, WidgetSize, WidgetValues, fieldsFor, parseWidgetLine, widgetDef, widgetLine } from '../core/widgets';
import { watchVisualViewport } from './visual-viewport';

type ListKind = 'ul' | 'ol' | 'check';
/** Os menus da régua: "Formatar", "Inserir" e a caixa do estilo do parágrafo. */
type MenuName = 'formatar' | 'inserir' | 'estilo';
/** O que a régua (e os menus) fazem no texto. */
type Action = 'bold' | 'italic' | 'strike' | 'mark' | 'spoiler' | 'code' | ListKind | 'inside' | 'url' | 'note' | 'table' | 'rule';
/** O estilo do parágrafo, como a caixa "Texto normal" dos editores: o da linha do cursor. */
export type LineStyle = 'texto' | 't1' | 't2' | 't3' | 'citacao' | 'codigo';

/**
 * Onde a régua desce para cima do teclado: no toque, com a tela estreita (o celular em pé) ou baixa
 * (deitado). Tablet e computador ficam com a régua no alto da folha.
 */
export const DOCK_MEDIA = '(pointer: coarse) and (max-width: 767px), (pointer: coarse) and (max-height: 500px)';

/**
 * O campo do texto da ficha: a folha pautada de sempre, organizada como os editores que todo mundo
 * conhece (Word, Docs). No alto, as abas "Escrever" e "Ver como fica" e, na outra ponta, "Ajuda" e
 * "Tela cheia". Na folha, em cima da margem vermelha do caderno, a régua:
 *
 * - "Formatar": o texto (negrito, itálico, riscado, marca-texto, spoiler, código, com o atalho de
 *   cada um) e o parágrafo (os estilos e as listas);
 * - "Inserir": link para um endereço, link para outra anotação, tabela, divisória e os widgets;
 * - a caixa do estilo do parágrafo ("Texto normal", "Título 1"…), que diz o da linha do cursor;
 * - os botões de toda hora (negrito, itálico, riscado, marca-texto, as listas, o link). Sem lugar,
 *   os que também estão nos menus saem primeiro, e no fim os que sobram rolam de lado; nada some,
 *   tudo continua no "Formatar" e no "Inserir".
 *
 * O que a régua faz são as marcas de core/rich-text.ts, escritas no próprio texto. A "Ajuda"
 * (ui/markup-guide.ts) lista todas, em partes, com o jeito de escrever e o atalho.
 *
 * Atalhos: Ctrl+B, Ctrl+I, Ctrl+K (link), Ctrl+E (código), Ctrl+Shift+X (riscado), Ctrl+Shift+H
 * (marca-texto), Ctrl+Shift+7, 8 e 9 (listas, como no Docs), Ctrl+/ (Ajuda); Enter continua a
 * lista (num item vazio, termina).
 *
 * As mudanças passam por `insertText`, então o Ctrl+Z do navegador desfaz cada uma.
 *
 * Com `notes` (o editor da anotação), o "Inserir" ganha "Link para outra anotação": escreve
 * "[[Título]]" no texto (ver core/note-links.ts). Escrever "[[" direto na folha abre a mesma lista,
 * filtrando pelo que vem depois; setas escolhem, Enter (ou Tab) põe, Esc fecha.
 *
 * Cada widget do "Inserir" abre um painel com os campos dele (o contador: para quê, se repete, o
 * dia, a hora) e ele mesmo, vivo, embaixo. "Pôr" escreve a marca ("{{contador: …}}") numa linha só
 * dela. Com o cursor na linha de um widget, o painel abre com o que está escrito e troca a linha.
 *
 * Um clique na linha de um widget já abre o painel dele assim; num link (de anotação ou de
 * endereço), o painel do link, com o que está escrito, para trocar.
 */
/**
 * O link para outra anotação: a folhinha (com a dobra no canto) e o elo de corrente dentro dela. Um
 * desenho só, no traço dos outros da régua; o link para um endereço é o elo sozinho.
 */
const NOTE_LINK_ICON: LucideIconData = [
  ['path', { d: 'M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z', key: 'folha' }],
  ['path', { d: 'M15 3v5a1 1 0 0 0 1 1h5', key: 'dobra' }],
  ['path', { d: 'M10 15.5H8.5a2.5 2.5 0 0 1 0-5H10', key: 'elo-esq' }],
  ['path', { d: 'M14 10.5h1.5a2.5 2.5 0 0 1 0 5H14', key: 'elo-dir' }],
  ['path', { d: 'M10 13h4', key: 'elo-meio' }],
];

/** O desenho de cada widget no menu "Widgets" (ver core/widgets.ts). */
const WIDGET_ICONS: Record<string, LucideIconData> = {
  contador: Hourglass,
  imagem: Image,
  video: Clapperboard,
  audio: CassetteTape,
  nota: StickyNote,
};

const COUNT_FMT = new Intl.NumberFormat('pt-BR');

@Component({
  selector: 'app-rich-editor',
  imports: [LucideAngularModule, NgTemplateOutlet, RichText, NoteWidget, CardPicker, MarkupGuide],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // presa, a régua sai da folha para a tela: a folha deixa de ser a medida dela (ver "presa")
  host: { '[class.presa]': 'docked() !== null' },
  template: `
    <ng-template #campo let-big="big">
      <!-- O alto da folha, como nos editores de sempre: as duas abas (escrever e ver como fica) e, na
           outra ponta, "Ajuda" e "Tela cheia", sempre com o nome (no celular, só o desenho) -->
      <div class="cabeca">
        <div class="abas" role="tablist" aria-label="Escrever ou ver como fica">
          <button
            type="button"
            role="tab"
            class="aba"
            [id]="areaId + (big ? '-aba-escrever-g' : '-aba-escrever')"
            [attr.aria-selected]="!seeing()"
            [attr.aria-controls]="areaId + (big ? '-papel-g' : '-papel')"
            [attr.tabindex]="seeing() ? -1 : 0"
            (click)="see(false, big)"
            (keydown)="onTabKey($event, big)"
          >
            <lucide-icon [img]="WriteIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
            <span>Escrever</span>
          </button>
          <button
            type="button"
            role="tab"
            class="aba"
            [id]="areaId + (big ? '-aba-ver-g' : '-aba-ver')"
            [attr.aria-selected]="seeing()"
            [attr.aria-controls]="areaId + (big ? '-papel-g' : '-papel')"
            [attr.tabindex]="seeing() ? 0 : -1"
            (click)="see(true, big)"
            (keydown)="onTabKey($event, big)"
          >
            <lucide-icon [img]="SeeIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
            <span>Ver como fica</span>
          </button>
        </div>
        <button
          type="button"
          class="acao-folha ajuda"
          [attr.aria-expanded]="guide() === big"
          [attr.aria-controls]="guide() === big ? areaId + '-guia' : null"
          aria-label="Ajuda: como escrever cada marca"
          title="Ajuda: como escrever cada marca (Ctrl+/)"
          (click)="toggleGuide(big)"
        >
          <lucide-icon [img]="HelpIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
          <span class="acao-txt" aria-hidden="true">Ajuda</span>
        </button>
        @if (big) {
          <button type="button" class="acao-folha tamanho" aria-label="Sair da tela cheia" title="Sair da tela cheia" (click)="shrink()">
            <lucide-icon [img]="ShrinkIcon" [size]="18" [strokeWidth]="2.5" aria-hidden="true" />
            <span class="acao-txt" aria-hidden="true">Sair da tela cheia</span>
          </button>
        } @else {
          <button type="button" class="acao-folha tamanho" aria-haspopup="dialog" aria-label="Tela cheia" title="Tela cheia: escrever na tela inteira" (click)="grow(area)">
            <lucide-icon [img]="GrowIcon" [size]="18" [strokeWidth]="2.5" aria-hidden="true" />
            <span class="acao-txt" aria-hidden="true">Tela cheia</span>
          </button>
        }
      </div>
      <!-- a folha: no alto dela, acima da margem vermelha do caderno, a régua; embaixo, as linhas -->
      <div
        class="papel"
        [class.grande]="big"
        role="tabpanel"
        [id]="areaId + (big ? '-papel-g' : '-papel')"
        [attr.aria-labelledby]="areaId + (big ? (seeing() ? '-aba-ver-g' : '-aba-escrever-g') : seeing() ? '-aba-ver' : '-aba-escrever')"
      >
        <!-- no celular, enquanto se escreve, a régua desce e fica presa em cima do teclado (ver "presa") -->
        <div
          #regua
          class="regua"
          [hidden]="seeing()"
          [class.presa]="docked() === big"
          role="toolbar"
          aria-label="Formatação do texto"
          [attr.aria-controls]="big ? areaId + '-grande' : areaId"
          (focusout)="onRulerFocusOut($event, area)"
        >
          <!-- Os dois menus com nome, onde mora tudo (como os do Word e do Docs): "Formatar" (o texto
               e o parágrafo) e "Inserir" (links, tabela, divisória e os widgets) -->
          <span class="menu-ancora" (focusout)="onMenuFocusOut($event)">
            <button
              type="button"
              class="menu-botao"
              data-menu="formatar"
              aria-haspopup="menu"
              [attr.aria-expanded]="isOpen('formatar', big)"
              [attr.aria-controls]="isOpen('formatar', big) ? areaId + '-formatar' : null"
              title="Formatar: negrito, títulos, listas e o resto"
              (pointerdown)="$event.preventDefault()"
              (click)="toggleMenu('formatar', big, $event, area)"
              (keydown.arrowdown)="$event.preventDefault(); openMenu('formatar', big, true)"
            >
              <lucide-icon [img]="FormatIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
              <span class="menu-nome">Formatar</span>
              <lucide-icon class="seta" [img]="ChevronIcon" [size]="13" [strokeWidth]="3" aria-hidden="true" />
            </button>
            @if (isOpen('formatar', big)) {
              <div class="menu" [class.duas]="docked() !== big" role="menu" tabindex="-1" [id]="areaId + '-formatar'" aria-label="Formatar" (keydown)="onMenuKey($event, area)">
                <div class="menu-coluna" role="group" [attr.aria-labelledby]="areaId + '-sec-texto'">
                  <p class="menu-secao" [id]="areaId + '-sec-texto'" aria-hidden="true">Texto</p>
                  @for (t of textMarks; track t.act) {
                    <button type="button" role="menuitem" tabindex="-1" class="menu-op" [attr.aria-keyshortcuts]="t.aria" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="act(area, big, t.act)">
                      <lucide-icon [img]="t.icon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
                      <span class="menu-op-nome">
                        @switch (t.act) {
                          @case ('bold') { <b>Negrito</b> }
                          @case ('italic') { <i>Itálico</i> }
                          @case ('strike') { <s>Riscado</s> }
                          @case ('mark') { <mark>Marca-texto</mark> }
                          @case ('spoiler') { <span class="tarja-amostra">Spoiler</span> }
                          @default { <code>Código</code> }
                        }
                      </span>
                      @if (t.keys) {
                        <kbd class="atalho" aria-hidden="true">{{ t.keys }}</kbd>
                      }
                    </button>
                  }
                </div>
                <div class="menu-coluna" role="group" [attr.aria-labelledby]="areaId + '-sec-paragrafo'">
                  <p class="menu-secao" [id]="areaId + '-sec-paragrafo'" aria-hidden="true">Parágrafo</p>
                  <ng-container *ngTemplateOutlet="estilos; context: { area, big }" />
                  <span class="menu-fio" role="separator"></span>
                  @for (l of lists; track l.act) {
                    <button type="button" role="menuitem" tabindex="-1" class="menu-op" [attr.aria-keyshortcuts]="l.aria" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="act(area, big, l.act)">
                      <lucide-icon [img]="l.icon" [size]="17" [strokeWidth]="2.4" aria-hidden="true" />
                      <span class="menu-op-nome">{{ l.name }}</span>
                      <kbd class="atalho" aria-hidden="true">{{ l.keys }}</kbd>
                    </button>
                  }
                  <!-- a descrição de um item: uma linha recuada que continua dele (no celular, o único jeito
                       fácil, sem Shift+Enter) -->
                  <button type="button" role="menuitem" tabindex="-1" class="menu-op" aria-keyshortcuts="Shift+Enter" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="act(area, big, 'inside')">
                    <lucide-icon [img]="InsideIcon" [size]="17" [strokeWidth]="2.4" aria-hidden="true" />
                    <span class="menu-op-nome">Linha dentro do item</span>
                    <kbd class="atalho" aria-hidden="true">Shift+Enter</kbd>
                  </button>
                </div>
              </div>
            }
          </span>
          <span class="menu-ancora" (focusout)="onMenuFocusOut($event)">
            <button
              type="button"
              class="menu-botao"
              data-menu="inserir"
              aria-haspopup="menu"
              [attr.aria-expanded]="isOpen('inserir', big)"
              [attr.aria-controls]="isOpen('inserir', big) ? areaId + '-inserir' : null"
              title="Inserir: link, tabela, divisória e widgets (contador, imagem, vídeo…)"
              (pointerdown)="$event.preventDefault()"
              (click)="toggleMenu('inserir', big, $event, area)"
              (keydown.arrowdown)="$event.preventDefault(); openMenu('inserir', big, true)"
            >
              <lucide-icon [img]="PlusIcon" [size]="17" [strokeWidth]="2.8" aria-hidden="true" />
              <span class="menu-nome">Inserir</span>
              <lucide-icon class="seta" [img]="ChevronIcon" [size]="13" [strokeWidth]="3" aria-hidden="true" />
            </button>
            @if (isOpen('inserir', big)) {
              <div class="menu" [class.duas]="docked() !== big" role="menu" tabindex="-1" [id]="areaId + '-inserir'" aria-label="Inserir" (keydown)="onMenuKey($event, area)">
                <div class="menu-coluna" role="group" [attr.aria-labelledby]="areaId + '-sec-links'">
                  <p class="menu-secao" [id]="areaId + '-sec-links'" aria-hidden="true">Links e tabelas</p>
                  @for (o of inserts(); track o.act) {
                    <button type="button" role="menuitem" tabindex="-1" class="menu-op" [attr.aria-keyshortcuts]="o.aria" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="act(area, big, o.act)">
                      <lucide-icon [img]="o.icon" [size]="17" [strokeWidth]="2.5" aria-hidden="true" />
                      <span class="menu-op-nome">{{ o.name }}</span>
                      @if (o.keys) {
                        <kbd class="atalho" aria-hidden="true">{{ o.keys }}</kbd>
                      } @else if (o.typed) {
                        <kbd class="jeito" [title]="'Ou escreva ' + o.typed + ' no texto'">{{ o.typed }}</kbd>
                      }
                    </button>
                  }
                </div>
                <div class="menu-coluna" role="group" [attr.aria-labelledby]="areaId + '-sec-widgets'">
                  <p class="menu-secao" [id]="areaId + '-sec-widgets'" aria-hidden="true">Widgets</p>
                  @for (d of widgets; track d.name) {
                    <button type="button" role="menuitem" tabindex="-1" class="menu-op widget-op" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="chooseWidget(area, big, d)">
                      <lucide-icon [img]="iconOf(d.name)" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
                      <span class="widget-op-texto">
                        <span class="menu-op-nome">{{ d.label }}</span>
                        <span class="widget-op-sobre">{{ d.about }}</span>
                      </span>
                    </button>
                  }
                </div>
              </div>
            }
          </span>
          <!-- o estilo do parágrafo, como a caixa "Texto normal" do Docs: diz o da linha do cursor e troca -->
          <span class="menu-ancora estilo-ancora" (focusout)="onMenuFocusOut($event)">
            <button
              type="button"
              class="menu-botao estilo"
              data-menu="estilo"
              aria-haspopup="menu"
              [attr.aria-expanded]="isOpen('estilo', big)"
              [attr.aria-controls]="isOpen('estilo', big) ? areaId + '-estilo' : null"
              [attr.aria-label]="'Estilo do parágrafo: ' + styleName()"
              title="Estilo do parágrafo: texto, títulos, citação, código"
              (pointerdown)="$event.preventDefault()"
              (click)="toggleMenu('estilo', big, $event, area)"
              (keydown.arrowdown)="$event.preventDefault(); openMenu('estilo', big, true)"
            >
              <span class="menu-nome">{{ styleName() }}</span>
              <lucide-icon class="seta" [img]="ChevronIcon" [size]="13" [strokeWidth]="3" aria-hidden="true" />
            </button>
            @if (isOpen('estilo', big)) {
              <div class="menu" role="menu" tabindex="-1" [id]="areaId + '-estilo'" aria-label="Estilo do parágrafo" (keydown)="onMenuKey($event, area)">
                <ng-container *ngTemplateOutlet="estilos; context: { area, big }" />
              </div>
            }
          </span>
          <span class="fio estilo-fio" aria-hidden="true"></span>
          <!-- os botões de sempre, à mão (no estreito, rolam de lado; tudo também está nos menus) -->
          <div class="ferramentas">
            <button type="button" class="ferramenta" title="Negrito (Ctrl+B)" aria-label="Negrito" aria-keyshortcuts="Control+B" (pointerdown)="$event.preventDefault()" (click)="act(area, big, 'bold')">
              <lucide-icon [img]="BoldIcon" [size]="18" [strokeWidth]="2.8" aria-hidden="true" />
            </button>
            <button type="button" class="ferramenta" title="Itálico (Ctrl+I)" aria-label="Itálico" aria-keyshortcuts="Control+I" (pointerdown)="$event.preventDefault()" (click)="act(area, big, 'italic')">
              <lucide-icon [img]="ItalicIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
            <button type="button" class="ferramenta extra" title="Riscado (Ctrl+Shift+X)" aria-label="Riscado" aria-keyshortcuts="Control+Shift+X" (pointerdown)="$event.preventDefault()" (click)="act(area, big, 'strike')">
              <lucide-icon [img]="StrikeIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
            <button type="button" class="ferramenta extra" title="Marca-texto (Ctrl+Shift+H)" aria-label="Marca-texto" aria-keyshortcuts="Control+Shift+H" (pointerdown)="$event.preventDefault()" (click)="act(area, big, 'mark')">
              <lucide-icon [img]="MarkIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
            <span class="fio" aria-hidden="true"></span>
            @for (l of lists; track l.act) {
              <button type="button" class="ferramenta" [title]="l.name + ' (' + l.keys + ')'" [attr.aria-label]="l.name" [attr.aria-keyshortcuts]="l.aria" (pointerdown)="$event.preventDefault()" (click)="act(area, big, l.act)">
                <lucide-icon [img]="l.icon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
              </button>
            }
            <span class="fio link-fio" aria-hidden="true"></span>
            <button
              type="button"
              class="ferramenta link"
              title="Link para um endereço (Ctrl+K)"
              aria-label="Link para um endereço"
              aria-keyshortcuts="Control+K"
              [attr.aria-expanded]="urlLink()?.big === big"
              (pointerdown)="$event.preventDefault()"
              (click)="act(area, big, 'url')"
            >
              <lucide-icon [img]="UrlIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
            @if (notes()) {
              <button
                type="button"
                class="ferramenta extra"
                title="Link para outra anotação (ou escreva [[)"
                aria-label="Link para outra anotação"
                [attr.aria-expanded]="linking()?.big === big && !linking()?.auto"
                (pointerdown)="$event.preventDefault()"
                (click)="act(area, big, 'note')"
              >
                <lucide-icon [img]="LinkIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
              </button>
            }
          </div>
          <!-- presa em cima do teclado: "Pronto" fecha o teclado (e a régua volta para o alto da folha) -->
          <button type="button" class="pronto" aria-label="Pronto: fechar o teclado" title="Pronto" (pointerdown)="$event.preventDefault()" (click)="area.blur()">
            <lucide-icon [img]="DoneIcon" [size]="20" [strokeWidth]="3" aria-hidden="true" />
          </button>
        </div>
        @if (seeing()) {
          <div class="previa" [class.grande]="big" tabindex="0" [attr.aria-label]="'Como fica: ' + label()">
            @if (value().trim()) {
              <app-rich-text [text]="value()" [checkable]="true" [links]="previewLinks()" (toggled)="value.set(toggle(value(), $event))" />
            } @else {
              <p class="vazio">Nada escrito ainda.</p>
            }
          </div>
        }
        <textarea
          [hidden]="seeing()"
          #area
          [id]="big ? areaId + '-grande' : areaId"
          [class.grande]="big"
          [placeholder]="placeholder()"
          [attr.aria-label]="big ? label() : null"
          [value]="value()"
          [attr.maxlength]="max()"
          [attr.aria-describedby]="max() ? areaId + '-conta' + (big ? '-grande' : '') : null"
          [attr.aria-autocomplete]="notes() ? 'list' : null"
          [attr.aria-expanded]="notes() ? linking()?.auto === true && linking()?.big === big : null"
          [attr.aria-controls]="notes() ? areaId + '-elos' : null"
          [attr.aria-activedescendant]="linking()?.auto && linking()?.big === big && optionCount() ? areaId + '-elo-' + active() : null"
          (input)="value.set(area.value); dropPassive(); watchLink(area, big); track(area)"
          (focus)="onAreaFocus(big); track(area)"
          (click)="watchLink(area, big); onAreaClick($event, area, big); track(area)"
          (select)="track(area)"
          (keyup)="onKeyUp($event, area, big)"
          (keydown)="onKey($event, area, big)"
          (paste)="onPaste($event, area)"
          (blur)="onAreaBlur($event, regua)"
        ></textarea>
      </div>
      @if (max(); as m) {
        <!-- quanto já foi escrito, perto do limite em tinta, passou (por um atalho) em vermelho -->
        <p class="contagem" [id]="areaId + '-conta' + (big ? '-grande' : '')" [class.perto]="value().length > m * 0.9" [class.passou]="value().length > m">
          {{ counted(value().length) }} / {{ counted(m) }} caracteres
        </p>
      }
      <!-- o link para um endereço: o texto e o endereço, embaixo da folha -->
      @if (urlLink(); as u) {
        @if (u.big === big) {
          <div class="painel url-painel" role="group" aria-label="Link para um endereço" (keydown.escape)="closeUrl($event, area)">
            <div class="painel-topo">
              <p class="painel-titulo">Link para um endereço</p>
              <button type="button" class="painel-fechar" aria-label="Fechar" title="Fechar" (click)="closeUrl(null, area)"><lucide-icon [img]="CloseIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" /></button>
            </div>
            <label class="painel-campo">
              <span>Texto</span>
              <input type="text" autocomplete="off" placeholder="O que aparece (ou deixe o endereço)" (keydown.enter)="$event.preventDefault(); putUrl(area)" [value]="u.text" (input)="setUrl('text', $any($event.target).value)" />
            </label>
            <label class="painel-campo">
              <span>Endereço</span>
              <input
                class="url-campo"
                type="url"
                inputmode="url"
                autocomplete="off"
                placeholder="https://…"
                (keydown.enter)="$event.preventDefault(); putUrl(area)"
                [value]="u.url"
                (input)="setUrl('url', $any($event.target).value)"
              />
            </label>
            <div class="painel-acoes">
              <button type="button" class="acao-caneta" (click)="closeUrl(null, area)">Cancelar</button>
              <button type="button" class="painel-ok" [disabled]="!urlOk()" (click)="putUrl(area)">{{ u.swap ? 'Trocar o link' : 'Pôr o link' }}</button>
            </div>
          </div>
        }
      }
      <!-- a tabela: escolhida numa grade, como numa folha quadriculada -->
      @if (tablePick(); as t) {
        @if (t.big === big) {
          <div class="painel tabela-painel" (keydown.escape)="closeTable($event, area)">
            <div class="painel-topo">
              <p class="painel-titulo" aria-live="polite">Tabela {{ t.cols }} × {{ t.rows }}</p>
              <button type="button" class="painel-fechar" aria-label="Fechar" title="Fechar" (click)="closeTable(null, area)"><lucide-icon [img]="CloseIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" /></button>
            </div>
            <div class="grade" role="grid" aria-label="Tamanho da tabela: colunas por linhas" (keydown)="onGridKey($event)">
              @for (r of gridRows; track r) {
                <div class="grade-linha" role="row">
                  @for (c of gridCols; track c) {
                    <button
                      type="button"
                      role="gridcell"
                      class="quadrado"
                      [class.dentro]="c <= t.cols && r <= t.rows"
                      [attr.aria-label]="c + ' colunas e ' + r + ' linhas'"
                      [attr.tabindex]="c === t.cols && r === t.rows ? 0 : -1"
                      (pointerenter)="tablePick.set({ big: t.big, cols: c, rows: r })"
                      (focus)="tablePick.set({ big: t.big, cols: c, rows: r })"
                      (click)="putTable(area, c, r)"
                    ></button>
                  }
                </div>
              }
            </div>
            <p class="painel-dica">Na tabela, Tab anda entre as células e Enter no fim de uma linha cria a próxima.</p>
          </div>
        }
      }
      <!-- o widget: os campos dele e ele mesmo, vivo, como vai ficar na anotação -->
      @if (widgetPick(); as w) {
        @if (w.big === big) {
          @let def = widgetOf(w.name);
          <div class="painel widget-painel" role="group" [attr.aria-label]="(w.swap ? 'Trocar o widget: ' : 'Widget: ') + def.label" (keydown.escape)="closeWidget($event, area)">
            <div class="painel-topo">
              <p class="painel-titulo">{{ w.swap ? def.swap : 'Widget · ' + def.label }}</p>
              <button type="button" class="painel-fechar" aria-label="Fechar" title="Fechar" (click)="closeWidget(null, area)"><lucide-icon [img]="CloseIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" /></button>
            </div>
            @if (widgets.length > 1 && !w.swap) {
              <div class="widget-tipos" role="radiogroup" aria-label="Qual widget">
                @for (d of widgets; track d.name) {
                  <button type="button" role="radio" class="widget-tipo" [attr.aria-checked]="d.name === w.name" (click)="pickWidget(d)">{{ d.label }}</button>
                }
              </div>
            }
            <p class="widget-sobre">{{ def.about }}</p>
            @for (f of fieldsFor(def, w.values); track f.key) {
              @if (f.kind === 'toggle') {
                <label class="widget-caixa">
                  <input type="checkbox" [attr.data-campo]="f.key" [checked]="!!w.values[f.key]" (change)="setWidgetValue(f.key, $any($event.target).checked ? '1' : '')" (keydown.enter)="$event.preventDefault(); putWidget(area)" />
                  <span class="widget-caixa-nome">{{ f.label }}</span>
                  @if (f.hint) {
                    <small>{{ f.hint }}</small>
                  }
                </label>
              } @else if (f.kind === 'choice') {
                <div class="painel-campo" role="radiogroup" [attr.aria-label]="f.label">
                  <span>{{ f.label }}</span>
                  <span class="widget-escolhas">
                    @for (o of f.options ?? []; track o.value; let first = $first) {
                      @let on = (w.values[f.key] || (f.options ?? [])[0]?.value) === o.value;
                      <button type="button" role="radio" class="widget-tipo" [attr.aria-checked]="on" [attr.tabindex]="on ? 0 : -1" [attr.data-campo]="first ? f.key : null" (click)="setWidgetValue(f.key, o.value)" (keydown)="onChoiceKey($event, f.key, f.options ?? [])">{{ o.label }}</button>
                    }
                  </span>
                </div>
              } @else if (f.kind === 'card') {
                <!-- a Nota: qual ficha. O botão abre a lista de todas (ver ui/card-picker.ts); a ficha
                     escolhida aparece de verdade logo embaixo, em "Como fica" -->
                @let card = chosenCard();
                <div class="painel-campo">
                  <span [id]="areaId + '-qual'">{{ f.label }}</span>
                  <span class="widget-campo">
                    <button
                      type="button"
                      class="ficha-escolher"
                      [class.vazia]="!card"
                      [attr.data-campo]="f.key"
                      [attr.aria-labelledby]="areaId + '-qual ' + areaId + '-qual-nome'"
                      aria-haspopup="dialog"
                      (click)="cardPickerOpen.set(true)"
                    >
                      @if (card) {
                        <span class="ficha-escolher-texto" [id]="areaId + '-qual-nome'">
                          <span class="ficha-escolher-nome">{{ card.game.name }}</span>
                          <span class="ficha-escolher-mural">{{ kindOf(card) }}</span>
                        </span>
                        <span class="ficha-escolher-acao">Trocar</span>
                      } @else {
                        <lucide-icon [img]="CardIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
                        <span class="ficha-escolher-texto" [id]="areaId + '-qual-nome'">
                          <span class="ficha-escolher-nome">{{ w.values['title'] || 'Escolher a ficha' }}</span>
                          @if (w.values['title']) {
                            <span class="ficha-escolher-mural">Não está mais no seu mural</span>
                          }
                        </span>
                        @if (w.values['title']) {
                          <span class="ficha-escolher-acao">Trocar</span>
                        }
                      }
                    </button>
                  </span>
                </div>
                <!-- a lista vem num pedaço à parte, quando abre pela primeira vez -->
                @defer (when cardPickerOpen()) {
                  <app-card-picker [open]="cardPickerOpen()" (openChange)="cardPickerOpened($event, big)" [chosen]="card?.id ?? ''" [selfId]="selfId()" (picked)="pickCard($event)" />
                }
              } @else {
                <label class="painel-campo">
                  <span>{{ f.label }}</span>
                  <span class="widget-campo">
                    <input
                      [class]="'widget-' + f.kind"
                      [type]="f.kind"
                      [attr.inputmode]="f.kind === 'url' ? 'url' : f.kind === 'number' ? 'numeric' : null"
                      [attr.min]="f.range?.[0] ?? null"
                      [attr.max]="f.range?.[1] ?? null"
                      autocomplete="off"
                      [attr.maxlength]="f.max ?? null"
                      [attr.placeholder]="f.placeholder ?? null"
                      [attr.data-campo]="f.key"
                      [value]="w.values[f.key] ?? ''"
                      (input)="setWidgetValue(f.key, $any($event.target).value)"
                      (keydown.enter)="$event.preventDefault(); putWidget(area)"
                    />
                    @if (f.hint) {
                      <small>{{ f.hint }}</small>
                    }
                  </span>
                </label>
              }
            }
            @if (widgetProblem(); as pr) {
              <p class="widget-problema" role="alert">{{ pr }}</p>
            }
            <!-- o tamanho, de todo widget: cada um com o desenho de quanto ele ocupa da ficha -->
            <div class="painel-campo widget-tamanho-campo">
              <span [id]="areaId + '-tamanho'">Tamanho</span>
              <span class="widget-tamanho-lado">
                <span class="widget-tamanhos" role="radiogroup" [attr.aria-labelledby]="areaId + '-tamanho'" [attr.aria-describedby]="areaId + '-tamanho-dica'">
                  @for (o of sizes; track o.value; let first = $first) {
                    @let on = widgetSize() === o.value;
                    <button
                      type="button"
                      role="radio"
                      class="widget-tamanho"
                      [attr.aria-checked]="on"
                      [attr.tabindex]="on ? 0 : -1"
                      [attr.data-campo]="first ? 'size' : null"
                      (click)="setWidgetValue('size', o.value)"
                      (keydown)="onChoiceKey($event, 'size', sizes)"
                      (keydown.enter)="$event.preventDefault(); putWidget(area)"
                    >
                      <svg class="tamanho-desenho" viewBox="0 0 36 28" aria-hidden="true">
                        <rect class="tamanho-ficha" x="1" y="1" width="34" height="26" rx="2.5" />
                        <line class="tamanho-linha" x1="5.5" y1="6.5" x2="30.5" y2="6.5" />
                        <rect class="tamanho-peca" x="5.5" y="10.5" [attr.width]="sizeArt[o.value].w" [attr.height]="sizeArt[o.value].h" rx="1" />
                      </svg>
                      <span>{{ o.label }}</span>
                    </button>
                  }
                </span>
                <small [id]="areaId + '-tamanho-dica'">{{ sizeHint() }}</small>
              </span>
            </div>
            <!-- como vai ficar: o widget de verdade, andando, do tamanho escolhido, na ficha do mural ou
                 aberta (a folha pautada da leitura) -->
            <div class="widget-previa-topo">
              <span class="widget-previa-nome" [id]="areaId + '-previa'">Como fica</span>
              @if (onCard()) {
                <span class="widget-vistas" role="radiogroup" [attr.aria-labelledby]="areaId + '-previa'">
                  @for (v of previewViews; track v.value) {
                    @let on = widgetView() === v.value;
                    <button type="button" role="radio" class="widget-vista" [attr.aria-checked]="on" [attr.tabindex]="on ? 0 : -1" (click)="widgetView.set(v.value)" (keydown)="onViewKey($event)">{{ v.label }}</button>
                  }
                </span>
              }
            </div>
            <div class="widget-previa" [class.na-ficha]="cardPreview()" [attr.data-widget-teto]="cardPreview() ? '' : null">
              @if (widgetArgs(); as args) {
                <app-note-widget [name]="w.name" [args]="args" [size]="widgetSize()" [links]="previewLinks()" />
              } @else {
                <p class="widget-previa-vazia">{{ def.name === 'contador' ? 'Escolha o dia (ou a hora) para ver o contador andando.' : def.name === 'nota' ? 'Escolha a ficha para ver como ela fica colada.' : 'Cole o link para ver como fica.' }}</p>
              }
            </div>
            <div class="painel-acoes">
              <button type="button" class="acao-caneta" (click)="closeWidget(null, area)">Cancelar</button>
              <button type="button" class="painel-ok" [disabled]="!widgetArgs()" (click)="putWidget(area)">{{ w.swap ? def.swap : def.put }}</button>
            </div>
          </div>
        }
      }
      <!-- a Ajuda: todas as marcas, em partes (como a lista de atalhos do Docs), com o jeito de escrever
           cada uma e o atalho de teclado -->
      @if (guide() === big) {
        <div class="painel guia" [id]="areaId + '-guia'" role="region" aria-label="Ajuda: como escrever" (keydown.escape)="closeGuide($event, area)">
          <div class="painel-topo">
            <p class="painel-titulo">Como escrever</p>
            <button type="button" class="painel-fechar" aria-label="Fechar a ajuda" title="Fechar" (click)="closeGuide(null, area)"><lucide-icon [img]="CloseIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" /></button>
          </div>
          <!-- a lista vem num pedaço à parte, quando a Ajuda abre pela primeira vez -->
          @defer {
            <app-markup-guide [noteLinks]="!!notes()" [idPrefix]="areaId + '-guia'" />
          }
        </div>
      }
      <!-- o link para outra anotação, embaixo da folha, sem cobrir o que se escreve: por "[[" na
           folha, só a lista (a busca é o que se escreve depois dos colchetes); pela régua, o painel
           do mesmo jeito do link para um endereço (o texto, a anotação e "Pôr o link") -->
      @if (linking(); as k) {
        @if (k.big === big) {
          @if (k.auto) {
            <div class="elos" [class.grande]="big" [class.presa]="docked() === big">
              <p class="elos-dica" aria-hidden="true">Link para…</p>
              <ng-container *ngTemplateOutlet="eloLista" />
            </div>
          } @else {
            <div class="painel elo-painel" role="group" aria-label="Link para outra anotação" (keydown.escape)="closeLinkKey($event)">
              <div class="painel-topo">
                <p class="painel-titulo">Link para outra anotação</p>
                <button type="button" class="painel-fechar" aria-label="Fechar" title="Fechar" (click)="closeLink(area)"><lucide-icon [img]="CloseIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" /></button>
              </div>
              <label class="painel-campo">
                <span>Texto</span>
                <input type="text" autocomplete="off" placeholder="O que aparece (ou deixe o título)" [value]="k.label ?? ''" (input)="setLinkLabel($any($event.target).value)" (keydown.enter)="$event.preventDefault(); putLink()" />
              </label>
              <div class="painel-campo">
                <label [for]="areaId + '-elo-busca'">Anotação</label>
                <div class="elo-busca">
                  <input
                    type="text"
                    class="elos-campo"
                    [id]="areaId + '-elo-busca'"
                    placeholder="Procure pelo título"
                    autocomplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    [attr.aria-expanded]="!k.chosen"
                    [attr.aria-controls]="areaId + '-elos'"
                    [attr.aria-activedescendant]="!k.chosen && optionCount() ? areaId + '-elo-' + active() : null"
                    [value]="k.query"
                    (input)="setQuery($any($event.target).value)"
                    (keydown)="onSearchKey($event)"
                  />
                  @if (k.chosen) {
                    <!-- escolhida: a lista fecha e fica o que o link vai abrir (escrever ou ↓ reabre) -->
                    <p class="elo-escolhida" aria-live="polite">
                      @if (chosenNote(); as n) {
                        <lucide-icon [img]="ChosenIcon" [size]="16" [strokeWidth]="3" aria-hidden="true" />
                        <span>{{ metaOf(n) || 'Sua anotação' }}</span>
                      } @else {
                        <lucide-icon [img]="PlusIcon" [size]="16" [strokeWidth]="3" aria-hidden="true" />
                        <span>Ainda não existe: abra o link depois para criar</span>
                      }
                    </p>
                  } @else {
                    <ng-container *ngTemplateOutlet="eloLista" />
                  }
                </div>
              </div>
              <div class="painel-acoes">
                <button type="button" class="acao-caneta" (click)="closeLink(area)">Cancelar</button>
                <button type="button" class="painel-ok" [disabled]="!k.chosen" (click)="putLink()">{{ k.swap ? 'Trocar o link' : 'Pôr o link' }}</button>
              </div>
            </div>
          }
        }
      }
    </ng-template>

    <!-- as anotações da lista (a de "[[" e a do painel): tocar numa põe o link ("[[") ou a escolhe (painel) -->
    <ng-template #eloLista>
      <ul class="elos-lista" role="listbox" [id]="areaId + '-elos'" aria-label="Anotações">
        @for (n of linkOptions(); track n.id; let i = $index) {
          <li
            role="option"
            class="elo-op"
            [id]="areaId + '-elo-' + i"
            [class.ativa]="active() === i"
            [attr.aria-selected]="active() === i"
            (pointerdown)="$event.preventDefault()"
            (click)="take(n.game.name)"
          >
            <span class="elo-nome">{{ n.game.name }}</span>
            <span class="elo-meta">{{ metaOf(n) }}</span>
          </li>
        }
        @if (newLink(); as t) {
          <li
            role="option"
            class="elo-op nova"
            [id]="areaId + '-elo-' + linkOptions().length"
            [class.ativa]="active() === linkOptions().length"
            [attr.aria-selected]="active() === linkOptions().length"
            (pointerdown)="$event.preventDefault()"
            (click)="take(t)"
          >
            <lucide-icon [img]="PlusIcon" [size]="16" [strokeWidth]="2.8" aria-hidden="true" />
            <span class="elo-nome">Link para “{{ t }}”</span>
            <span class="elo-meta">a anotação ainda não existe: abra o link depois para criar</span>
          </li>
        }
        @if (!linkOptions().length && !newLink()) {
          <li class="elos-vazio" role="presentation">{{ notes()!.length ? 'Nenhuma anotação com esse título.' : 'Você ainda não tem outras anotações. Escreva um título para criar o link.' }}</li>
        }
      </ul>
    </ng-template>

    <!-- os estilos do parágrafo (no "Formatar" e na caixa do estilo): cada um escrito do jeito que fica,
         com o tique no da linha do cursor -->
    <ng-template #estilos let-area="area" let-big="big">
      @for (s of styles; track s.value) {
        <button
          type="button"
          role="menuitemradio"
          tabindex="-1"
          class="menu-op estilo-op"
          [attr.aria-checked]="lineStyle() === s.value"
          (pointerdown)="$event.preventDefault()"
          (pointerenter)="$any($event.currentTarget).focus()"
          (click)="pickStyle(area, s.value)"
        >
          <lucide-icon [img]="s.icon" [size]="17" [strokeWidth]="2.4" aria-hidden="true" />
          <span class="menu-op-nome" [attr.data-estilo]="s.value">{{ s.name }}</span>
          @if (lineStyle() === s.value) {
            <lucide-icon class="marcado" [img]="ChosenIcon" [size]="16" [strokeWidth]="3" aria-hidden="true" />
          }
        </button>
      }
    </ng-template>

    <ng-container *ngTemplateOutlet="campo; context: { big: false }" />

    <!-- A mesma folha na tela inteira: o mesmo texto, para ler e escrever os longos sem rolar num cantinho -->
    <dialog #grande class="tela-cheia" [attr.aria-labelledby]="areaId + '-titulo'" (close)="onClosed()">
      <div class="folha">
        <h2 class="titulo" [id]="areaId + '-titulo'">{{ label() }}</h2>
        @if (big()) {
          <ng-container *ngTemplateOutlet="campo; context: { big: true }" />
        }
      </div>
    </dialog>
  `,
  styles: `
    @use 'a11y';

    :host {
      display: block;
      container: folha / inline-size;
    }

    /* ===== O alto da folha, como nos editores de sempre: as abas "Escrever" e "Ver como fica" à
       esquerda; "Ajuda" e "Tela cheia" na outra ponta, com o nome (no estreito, só o desenho) ===== */
    /* o alto mede a si mesmo (não a folha): com a régua presa, a folha deixa de ser medida */
    .cabeca {
      container: cabeca / inline-size;
      display: flex;
      align-items: flex-end;
      gap: 2px;
      min-width: 0;
    }
    .abas {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      min-width: 0;
      margin-right: auto;
    }
    /* a de trás é só o nome; a escolhida é um pedaço da própria folha, emendado nela (cobre o fio de
       cima dela, sem a sombra embaixo) */
    .aba {
      position: relative;
      z-index: 1;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 38px;
      margin-bottom: -1px;
      padding: 0 13px 1px;
      border: 0;
      border-radius: 3px 3px 0 0;
      background: transparent;
      color: var(--ink-2);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.9rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
      cursor: pointer;
      transition:
        color var(--t-ui) var(--ease-ui),
        background-color var(--t-ui) var(--ease-ui);
    }
    .aba:hover {
      color: var(--ink);
      background: rgb(21 21 21 / 0.06);
    }
    .aba[aria-selected='true'] {
      color: var(--ink);
      background: var(--campo-papel);
      box-shadow: 0 0 0 1px rgb(21 21 21 / 0.1);
      clip-path: inset(-2px -2px 0 -2px);
      cursor: default;
    }
    .aba:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -3px;
    }
    /* Os botões da régua e do alto da folha: tinta no papel, um tom por baixo no mouse e aberto */
    .acao-folha,
    .ferramenta,
    .menu-botao {
      flex: none;
      align-items: center;
      padding: 0;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--ink);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.9rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .acao-folha:hover,
    .ferramenta:hover,
    .menu-botao:hover {
      background: rgb(21 21 21 / 0.08);
    }
    .ferramenta:active {
      background: rgb(21 21 21 / 0.16);
    }
    [aria-expanded='true']:is(.acao-folha, .ferramenta, .menu-botao) {
      background: rgb(21 21 21 / 0.1);
    }
    :is(.acao-folha, .ferramenta, .menu-botao):focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -1px;
    }
    /* "Ajuda" e "Tela cheia": o desenho e o nome impresso, quietos ao lado das abas */
    .acao-folha {
      display: inline-flex;
      gap: 6px;
      min-height: 36px;
      margin-bottom: 3px;
      padding: 0 8px;
      font-size: 0.86rem;
    }
    /* sem lugar, as ações ficam só no desenho (o nome vai para o leitor de tela e para a dica) */
    @container cabeca (max-width: 520px) {
      .acao-txt {
        @include a11y.escondido;
      }
      .acao-folha {
        justify-content: center;
        min-width: 40px;
        padding: 0;
      }
    }
    @container cabeca (max-width: 340px) {
      .aba {
        padding-inline: 9px;
      }
    }

    /* ===== A folha: papel colado como um campo, com a régua no alto dela, em cima da margem vermelha
       do caderno, e as linhas azuis embaixo ===== */
    .papel {
      border-radius: 0 2px 2px 2px;
      background: var(--campo-papel);
      box-shadow: var(--campo-sombra);
      transition: box-shadow var(--t-physical) var(--ease-physical);
    }
    .papel:focus-within {
      box-shadow: var(--campo-sombra-foco);
    }

    /* ===== A régua: os dois menus com nome ("Formatar", "Inserir"), a caixa do estilo e os botões de
       sempre, numa linha só ===== */
    .regua {
      position: relative;
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 2px;
      padding: 4px 6px 5px;
      border-bottom: 1.5px solid rgb(214 76 76 / 0.5);
    }
    .regua[hidden] {
      display: none;
    }
    /* o que não couber (letra ou zoom maiores) rola de lado, em vez de passar da folha */
    .ferramentas {
      display: flex;
      flex: 1 1 auto;
      flex-wrap: nowrap;
      align-items: center;
      gap: 2px;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .ferramenta {
      display: grid;
      place-items: center;
      width: 34px;
      height: 36px;
    }
    .fio {
      flex: none;
      width: 2px;
      height: 20px;
      margin: 0 5px;
      border-radius: 1px;
      background: rgb(21 21 21 / 0.2);
    }
    /* os menus: o nome impresso e a setinha de quem abre uma lista; o menu se ancora no botão */
    .menu-ancora {
      position: relative;
      display: inline-flex;
      flex: none;
    }
    .menu-botao {
      display: inline-flex;
      gap: 5px;
      height: 36px;
      padding: 0 6px 0 7px;
    }
    .menu-botao .seta {
      opacity: 0.7;
      transition: rotate var(--t-ui) var(--ease-ui);
    }
    .menu-botao[aria-expanded='true'] .seta {
      rotate: 180deg;
    }
    /* a caixa do estilo: o nome do estilo da linha na letra do texto, de largura fixa (a régua não
       pula quando ele troca) */
    .menu-botao.estilo {
      justify-content: space-between;
      width: 7.6rem;
      padding-inline: 9px 7px;
      font-family: var(--f-ui);
      font-weight: 600;
      font-size: 0.92rem;
      letter-spacing: 0;
      text-transform: none;
      background: rgb(21 21 21 / 0.045);
    }
    .menu-botao.estilo:hover {
      background: rgb(21 21 21 / 0.09);
    }
    .menu-botao.estilo .menu-nome {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .estilo-ancora {
      margin-left: 4px;
    }

    /* Sem lugar, os botões que também estão nos menus saem da régua (como a régua do Docs): primeiro o
       riscado, o marca-texto e o link de anotação; depois o link (Ctrl+K); por fim a caixa do estilo.
       Nada some: tudo continua no "Formatar" e no "Inserir". Os cortes têm folga sobre a medida da
       régua (medida: uns 720px com tudo, 615 sem os primeiros, 560 sem o link, 425 sem a caixa), para a letra
       e o zoom de cada computador */
    @container folha (max-width: 819px) {
      .ferramenta.extra {
        display: none;
      }
    }
    @container folha (max-width: 699px) {
      .link,
      .link-fio {
        display: none;
      }
    }
    @container folha (max-width: 599px) {
      .estilo-ancora,
      .estilo-fio {
        display: none;
      }
      /* o menu se alinha às bordas da régua */
      .menu-ancora {
        position: static;
      }
      .menu {
        left: 6px;
        right: 6px;
        width: auto;
        min-width: 0;
      }
    }
    /* apertada mesmo assim, a régua não quebra em duas: os botões rolam de lado, com o esmaecido na
       ponta dizendo que tem mais, e os menus ficam fixos */
    @container folha (max-width: 479px) {
      .ferramentas {
        flex: 1 1 0;
        contain: inline-size;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scrollbar-width: none;
        -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 36px), transparent);
        mask-image: linear-gradient(to right, #000 calc(100% - 36px), transparent);
      }
      .ferramentas::-webkit-scrollbar {
        display: none;
      }
    }
    /* dedo não é cursor: no toque, todo botão da régua com 44px */
    @media (pointer: coarse) {
      .ferramenta {
        width: 40px;
        height: 44px;
      }
      .menu-botao,
      .acao-folha {
        height: 44px;
      }
      .aba {
        min-height: 44px;
      }
    }
    /* "Pronto" só existe com a régua presa em cima do teclado */
    .pronto {
      display: none;
    }

    /* ===== Presa em cima do teclado (no celular, enquanto se escreve): a régua sai do alto da folha e
       vira uma tira de fichário colada no teclado, da largura da tela, onde o polegar alcança. Os botões
       rolam de lado; "Formatar", "Inserir" e "Pronto" ficam fixos. A tira mede 54px (o editor da
       ficha guarda esse espaço embaixo dele, ver review-editor.scss) ===== */
    :host(.presa) {
      /* a folha medida por container prenderia a régua dentro dela */
      container-type: normal;
    }
    .regua.presa {
      position: fixed;
      z-index: 40;
      left: 0;
      right: 0;
      top: calc(var(--vv-top, 0px) + var(--vv-h, 100dvh));
      translate: 0 -100%;
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 2px;
      box-sizing: border-box;
      height: 54px;
      margin: 0;
      padding: 5px max(6px, env(safe-area-inset-right)) 3px max(6px, env(safe-area-inset-left));
      border-bottom: 0;
      background: var(--papel-ficha);
      box-shadow:
        inset 0 2px 0 var(--ink),
        0 -10px 20px -12px rgb(0 0 0 / 0.55);
      animation: regua-desce var(--t-ui) var(--ease-ui);
    }
    @keyframes regua-desce {
      from {
        opacity: 0;
        translate: 0 calc(-100% + 8px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .regua.presa {
        animation: none;
      }
    }
    .regua.presa .ferramentas {
      flex: 1 1 0;
      contain: inline-size;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
      mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
    }
    .regua.presa .ferramentas::-webkit-scrollbar {
      display: none;
    }
    .regua.presa .ferramenta.extra,
    .regua.presa .estilo-ancora,
    .regua.presa .estilo-fio {
      display: none;
    }
    .regua.presa .menu-ancora {
      position: static;
    }
    /* os menus abrem para cima, por cima da folha (embaixo é o teclado) */
    .regua.presa .menu {
      top: auto;
      bottom: calc(100% + 6px);
      left: 6px;
      right: 6px;
      width: auto;
      min-width: 0;
      max-width: none;
      max-height: calc(var(--vv-h, 100dvh) - 96px);
      transform-origin: bottom center;
    }

    /* "Pronto": a etiqueta de tinta com o tique amarelo, o mesmo "Pôr" dos painéis */
    .regua.presa .pronto {
      display: grid;
      place-items: center;
      flex: none;
      width: 44px;
      height: 44px;
      margin-left: 2px;
      padding: 0;
      border: 0;
      border-radius: 3px;
      background: var(--ink);
      color: var(--hi);
      cursor: pointer;
    }
    .regua.presa .pronto:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 2px;
    }
    /* a lista da "[[" com a régua presa: logo acima dela, onde se está escrevendo (embaixo do texto
       inteiro ela ficaria fora da tela) */
    .elos.presa {
      position: fixed;
      z-index: 41;
      left: 6px;
      right: 6px;
      top: calc(var(--vv-top, 0px) + var(--vv-h, 100dvh) - 60px);
      translate: 0 -100%;
      max-height: min(15rem, calc(var(--vv-h, 100dvh) - 140px));
      margin: 0;
      overflow-y: auto;
    }

    /* ===== Como fica: a mesma folha, já formatada ===== */
    .previa {
      --line: 1.75rem;
      min-height: calc(var(--line) * var(--linhas, 6) + 8px);
      max-height: 22rem;
      overflow-y: auto;
      padding: 4px 10px;
      border-radius: 2px;
      background:
        repeating-linear-gradient(to bottom, transparent 0 calc(var(--line) - 2px), rgb(64 110 190 / 0.32) calc(var(--line) - 2px) var(--line))
          0 4px;
      background-attachment: local;
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1.14rem;
      line-height: var(--line);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      outline: none;
    }
    .previa:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -3px;
    }
    .previa.grande {
      --line: 2rem;
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
      padding: 4px 18px;
      font-size: 1.3rem;
    }
    .vazio {
      margin: 0;
      font-style: italic;
      color: rgb(21 21 21 / 0.55);
    }
    textarea[hidden] {
      display: none;
    }

    /* ===== Os painéis da régua (link, tabela, guia): uma tira de fichário embaixo da folha ===== */
    .painel {
      margin-top: 8px;
      padding: 10px 12px 12px;
      border-radius: 2px;
      background: var(--papel-ficha);
      box-shadow: var(--papel-solto-sombra);
      animation: painel-desce var(--t-physical) var(--ease-physical);
    }
    @keyframes painel-desce {
      from {
        opacity: 0;
        translate: 0 -6px;
      }
    }
    /* o alto de todo painel: o nome à esquerda, o fechar à direita (no toque não tem Esc) */
    .painel-topo {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: -2px -4px 6px 0;
    }
    .painel-topo .painel-titulo {
      margin: 0;
    }
    .painel-fechar {
      display: grid;
      place-items: center;
      flex: none;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--ink);
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .painel-fechar:hover {
      background: rgb(21 21 21 / 0.07);
    }
    .painel-fechar:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -2px;
    }
    @media (pointer: coarse) {
      .painel-fechar {
        width: 44px;
        height: 44px;
      }
    }
    .painel-titulo {
      margin: 0 0 8px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.82rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    .painel-dica {
      margin: 8px 0 0;
      font-size: 0.86rem;
      color: var(--ink-2);
    }
    .painel-campo {
      display: grid;
      grid-template-columns: 6.5em minmax(0, 1fr);
      align-items: baseline;
      gap: 8px;
      margin-bottom: 6px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .painel-campo input {
      width: 100%;
      padding: 6px 4px;
      border: 0;
      border-bottom: 2px solid var(--ink);
      background: transparent;
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1.1rem;
      letter-spacing: 0;
      text-transform: none;
      outline: none;
    }
    /* o campo com o foco: a moldura de caneta em volta, não só o risco mais grosso */
    .painel-campo input:focus-visible,
    .elos-campo:focus-visible {
      outline: 2.5px solid var(--ink);
      outline-offset: 3px;
      border-radius: 2px;
    }
    .painel-campo input::placeholder {
      /* 4,5:1 no papel do painel */
      color: rgb(21 21 21 / 0.64);
    }
    .painel-campo small {
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: none;
      color: var(--ink-2);
    }
    .painel-acoes {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 14px;
      margin-top: 8px;
    }
    .painel-ok {
      min-height: 44px;
      padding: 6px 14px;
      border: 0;
      border-radius: 2px;
      background: var(--ink);
      color: var(--hi);
      font-family: var(--f-marker);
      font-size: 1rem;
      cursor: pointer;
    }
    .painel-ok:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .painel-ok:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 2px;
    }
    @media (max-width: 559px) {
      .painel-campo {
        grid-template-columns: minmax(0, 1fr);
        gap: 2px;
      }
      /* no celular o painel é comprido: "Cancelar" e "Pôr" grudam no pé da tela enquanto ele rola */
      .painel-acoes {
        position: sticky;
        bottom: 0;
        z-index: 2;
        /* até a borda de tinta do painel, sem cobrir ela */
        margin: 10px -10px -10px;
        padding: 8px 10px;
        background: var(--papel-ficha);
        box-shadow:
          inset 0 2px 0 rgb(21 21 21 / 0.12),
          0 -10px 14px -12px rgb(0 0 0 / 0.4);
      }
      .painel-acoes .painel-ok {
        flex: 1;
      }
      /* os cinco widgets em três colunas iguais (não um sozinho na segunda fileira) */
      .widget-painel .widget-tipos {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .widget-painel .widget-tipo {
        padding-inline: 6px;
      }
    }
    @media (pointer: coarse) {
      .widget-tipo,
      .widget-tamanho,
      .widget-vista {
        min-height: 44px;
      }
      .elo-op {
        padding-block: 11px;
      }
    }
    /* a grade da tabela: papel quadriculado, os quadrados escolhidos em marca-texto */
    .grade {
      display: inline-grid;
      gap: 3px;
    }
    .grade-linha {
      display: flex;
      gap: 3px;
    }
    .quadrado {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1.5px solid rgb(21 21 21 / 0.35);
      border-radius: 2px;
      background: #fff;
      cursor: pointer;
    }
    .quadrado.dentro {
      border-color: var(--ink);
      background: rgb(255 218 66 / 0.75);
    }
    .quadrado:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 1px;
    }
    @media (pointer: coarse) {
      .quadrado {
        width: 32px;
        height: 32px;
      }
    }
    /* ===== O painel do widget: os campos impressos à esquerda, como os do link, e o widget vivo
       embaixo, num pedaço da folha pautada ===== */
    .widget-sobre {
      margin: -2px 0 10px;
      font-size: 0.9rem;
      color: var(--ink-2);
    }
    .widget-campo {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    /* o campo com o foco: sem a moldura em volta, só o risco de baixo mais grosso (a altura não muda) */
    .widget-painel .painel-campo input:focus-visible {
      outline: none;
      padding-bottom: 4.5px;
      border-bottom-width: 3.5px;
    }
    .painel-campo .widget-date,
    .painel-campo .widget-time {
      max-width: 13rem;
      min-height: 38px;
      color-scheme: light;
      font-variant-numeric: tabular-nums;
      cursor: text;
    }
    .painel-campo .widget-time {
      max-width: 9rem;
    }
    /* o dia do mês do contador de todo mês: um número de dois algarismos */
    .painel-campo .widget-number {
      max-width: 6rem;
      min-height: 38px;
      font-variant-numeric: tabular-nums;
    }
    /* o ícone do calendário e do relógio do navegador, na tinta da folha */
    .painel-campo input::-webkit-calendar-picker-indicator {
      opacity: 0.75;
      cursor: pointer;
    }
    .widget-escolhas {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      letter-spacing: normal;
    }
    .widget-problema {
      margin: 2px 0 4px;
      font-weight: 600;
      font-size: 0.9rem;
      color: var(--error-ink);
    }
    .widget-tipos {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }
    /* os tipos e os tamanhos: recortes tracejados na cartela; o escolhido, a etiqueta de tinta */
    .widget-tipo,
    .widget-tamanho {
      min-height: 36px;
      padding: 0 12px;
      border: 1.5px dashed rgb(21 21 21 / 0.42);
      border-radius: 6px;
      background: transparent;
      color: var(--ink);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
    }
    [aria-checked='true']:is(.widget-tipo, .widget-tamanho) {
      border: 1.5px solid var(--ink);
      background: var(--ink);
      color: var(--hi);
    }
    :is(.widget-tipo, .widget-tamanho):focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 2px;
    }
    /* "Todo ano": a caixinha de tarefa, na coluna dos campos, com o nome impresso no lugar do rótulo */
    .widget-caixa {
      display: grid;
      grid-template-columns: 6.5em 1.4em minmax(0, 1fr);
      align-items: center;
      gap: 4px 8px;
      min-height: 40px;
      margin-bottom: 4px;
      cursor: pointer;
    }
    .widget-caixa-nome {
      grid-column: 1;
      grid-row: 1;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .widget-caixa input {
      grid-column: 2;
      grid-row: 1;
      appearance: none;
      width: 20px;
      height: 20px;
      margin: 0;
      border: 2px solid var(--ink);
      border-radius: 2px 3px 2px 4px;
      rotate: -3deg;
      background: transparent;
      cursor: pointer;
    }
    .widget-caixa input:checked {
      background: no-repeat center / 120% 120%
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M3 10.5 8 15.5 18 2' fill='none' stroke='%23c4302b' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }
    .widget-caixa input:focus-visible {
      outline: 2.5px solid var(--ink);
      outline-offset: 3px;
    }
    .widget-caixa small {
      grid-column: 3;
      grid-row: 1;
      font-size: 0.86rem;
      line-height: 1.3;
      color: var(--ink-2);
    }
    @media (max-width: 559px) {
      .widget-caixa {
        grid-template-columns: 1.4em minmax(0, 1fr);
      }
      .widget-caixa input {
        grid-column: 1;
      }
      .widget-caixa-nome {
        grid-column: 2;
      }
      .widget-caixa small {
        grid-column: 1 / -1;
        grid-row: 2;
      }
    }
    .widget-previa {
      --line: 1.75rem;
      margin-top: 10px;
      padding: 0 12px;
      border-radius: 2px;
      background:
        repeating-linear-gradient(to bottom, transparent 0 calc(var(--line) - 2px), rgb(64 110 190 / 0.32) calc(var(--line) - 2px) var(--line)),
        rgb(255 255 255 / 0.55);
      box-shadow: inset 0 0 0 1.5px rgb(21 21 21 / 0.3);
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1.14rem;
      line-height: var(--line);
    }
    .widget-previa-vazia {
      display: flex;
      align-items: center;
      min-height: calc(var(--line) * 4);
      margin: 0;
      font-style: italic;
      color: rgb(21 21 21 / 0.64);
    }
    /* na ficha: o pedaço do texto da ficha do mural, da largura e da altura dela, com o mesmo corte
       (as medidas são as de .nota-texto, em review-card.ts) */
    .widget-previa.na-ficha {
      --line: 1.4rem;
      --linhas: 8;
      --widget-teto: calc(var(--line) * var(--linhas));
      box-sizing: content-box;
      width: min(100% - 24px, 17.5rem);
      height: calc(var(--line) * var(--linhas));
      overflow: clip;
      font-size: 1.04rem;
    }
    .widget-previa.na-ficha .widget-previa-vazia {
      min-height: 100%;
    }
    /* "Como fica": o nome e, do lado, onde (na ficha, aberta) */
    .widget-previa-topo {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 6px 10px;
      margin-top: 12px;
    }
    .widget-previa-nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .widget-vistas {
      display: inline-flex;
      gap: 2px;
      padding: 2px;
      border-radius: 6px;
      box-shadow: inset 0 0 0 1.5px rgb(21 21 21 / 0.3);
    }
    .widget-vista {
      min-height: 30px;
      padding: 0 10px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--ink);
      font-family: var(--f-ui);
      font-weight: 600;
      font-size: 0.84rem;
      cursor: pointer;
    }
    .widget-vista[aria-checked='true'] {
      background: var(--ink);
      color: var(--hi);
    }
    .widget-vista:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 2px;
    }
    .widget-previa-topo + .widget-previa {
      margin-top: 6px;
    }

    /* ===== A Nota: qual ficha. Sem ela, o botão tracejado de escolher; com ela, o nome a pincel, o
       mural e o "Trocar" (a ficha de verdade aparece em "Como fica") ===== */
    /* escolhida, é a etiqueta de papel dos botões (botao-papel em ui/_paper-kit.scss): colada rente,
       com o meio-corte por dentro; sem ficha, só o recorte tracejado na cartela */
    .ficha-escolher {
      position: relative;
      isolation: isolate;
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 48px;
      padding: 8px 12px;
      border: 0;
      border-radius: 2px;
      background-color: #fffdf8;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      box-shadow:
        0 0 0 1px rgb(21 21 21 / 0.08),
        0 1px 1px rgb(0 0 0 / 0.24),
        0 3px 6px -3px rgb(0 0 0 / 0.32);
      color: var(--ink);
      font: inherit;
      letter-spacing: 0;
      text-transform: none;
      text-align: left;
      cursor: pointer;
      transition:
        background-color var(--t-ui) var(--ease-ui),
        box-shadow var(--t-physical) var(--ease-physical),
        translate var(--t-physical) var(--ease-physical);
    }
    .ficha-escolher::after {
      content: '';
      position: absolute;
      inset: 3px;
      z-index: -1;
      border: 1.5px dashed rgb(21 21 21 / 0.42);
      border-radius: 1px;
      pointer-events: none;
      transition: border-color var(--t-ui) var(--ease-ui);
    }
    .ficha-escolher:not(.vazia):hover {
      background-color: #fff;
      translate: 0 -1px;
      box-shadow:
        0 0 0 1px rgb(21 21 21 / 0.08),
        0 2px 2px rgb(0 0 0 / 0.2),
        0 7px 12px -5px rgb(0 0 0 / 0.4);
    }
    .ficha-escolher:hover::after {
      border-color: rgb(21 21 21 / 0.72);
    }
    .ficha-escolher:not(.vazia):active {
      translate: 0 1px;
    }
    .ficha-escolher:focus-visible {
      outline: 2.5px solid var(--ink);
      outline-offset: 3px;
    }
    .ficha-escolher.vazia {
      padding: 6px 10px;
      border: 1.5px dashed var(--ink);
      background: transparent;
      box-shadow: none;
    }
    .ficha-escolher.vazia::after {
      content: none;
    }
    .ficha-escolher.vazia:hover {
      background: rgb(21 21 21 / 0.06);
    }
    .ficha-escolher lucide-icon {
      flex: none;
    }
    .ficha-escolher-texto {
      display: grid;
      flex: 1;
      min-width: 0;
      gap: 1px;
    }
    .ficha-escolher-nome {
      font-family: var(--f-marker);
      font-size: 1.05rem;
      line-height: 1.15;
      overflow-wrap: anywhere;
    }
    .ficha-escolher-mural {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.78rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    /* o "Trocar": a etiqueta de tinta do lado, como as ações do painel */
    .ficha-escolher-acao {
      flex: none;
      padding: 3px 9px 2px;
      border-radius: 2px;
      background: var(--ink);
      color: var(--hi);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    /* ===== O tamanho: quatro botões com o desenho de uma ficha e quanto o widget ocupa dela ===== */
    .widget-tamanho-lado {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .widget-tamanho-lado small {
      font-size: 0.86rem;
      line-height: 1.3;
      color: var(--ink-2);
    }
    .widget-tamanhos {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      letter-spacing: normal;
    }
    .widget-tamanho {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 40px;
      padding: 0 12px 0 8px;
    }
    .tamanho-desenho {
      flex: none;
      width: 32px;
      height: 25px;
    }
    .tamanho-ficha {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
    }
    .tamanho-linha {
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
      opacity: 0.45;
    }
    .tamanho-peca {
      fill: currentColor;
    }

    /* ===== Os menus ("Formatar", "Inserir", o estilo): um cartão de papel que cai do botão, por cima
       da folha; os de duas colunas com o nome de cada parte em cima e um risco tracejado entre elas ===== */
    .menu {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      z-index: 30;
      display: grid;
      align-items: start;
      width: max-content;
      min-width: 14rem;
      max-width: calc(100vw - 32px);
      max-height: min(34rem, 72vh);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 6px;
      border-radius: 3px;
      background: var(--papel-ficha);
      box-shadow:
        0 0 0 1px rgb(21 21 21 / 0.14),
        0 2px 4px rgb(0 0 0 / 0.16),
        0 14px 28px -12px rgb(0 0 0 / 0.55);
      transform-origin: top left;
      animation: menu-cai var(--t-ui) var(--ease-ui);
    }
    .menu:focus {
      outline: none;
    }
    /* no celular, o menu que cai cabe entre a régua e o pé do editor (rola por dentro) */
    @media (max-width: 559px) {
      .menu {
        max-height: 46dvh;
      }
    }
    /* os de duas colunas saem do começo da régua, sem passar da folha */
    .menu-ancora:has(> .menu.duas) {
      position: static;
    }
    .menu.duas {
      left: 6px;
      max-width: calc(100% - 12px);
    }
    .menu-coluna {
      display: grid;
      align-content: start;
      min-width: 0;
    }
    /* numa coluna só (estreita, ou presa em cima do teclado), as partes uma embaixo da outra */
    .menu-coluna + .menu-coluna {
      margin-top: 4px;
      padding-top: 6px;
      background: linear-gradient(to right, rgb(21 21 21 / 0.16) 50%, transparent 50%) left top / 8px 1.5px repeat-x;
    }
    .menu-secao {
      margin: 3px 8px 4px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.76rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    @container folha (min-width: 520px) {
      .menu.duas {
        grid-template-columns: repeat(2, minmax(13rem, max-content));
        column-gap: 8px;
      }
      .menu.duas .menu-coluna + .menu-coluna {
        margin-top: 0;
        padding: 0 0 0 8px;
        background: linear-gradient(rgb(21 21 21 / 0.16) 50%, transparent 50%) left top / 1.5px 8px repeat-y;
      }
    }
    @keyframes menu-cai {
      from {
        opacity: 0;
        translate: 0 -4px;
        scale: 0.98;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .menu {
        animation: none;
      }
    }
    .menu-fio {
      margin: 4px 8px;
      border-top: 2px dashed rgb(21 21 21 / 0.16);
    }
    .menu-op {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      min-height: 36px;
      padding: 2px 10px 2px 8px;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: var(--ink);
      text-align: left;
      cursor: pointer;
    }
    .menu-op:hover,
    .menu-op:focus-visible {
      background: rgb(21 21 21 / 0.07);
    }
    .menu-op:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -1px;
    }
    .menu-op-nome {
      font-family: var(--f-hand);
      font-size: 1.08rem;
      line-height: 1.2;
    }
    .menu-op-nome b {
      font-weight: 700;
    }
    .menu-op-nome s {
      text-decoration-thickness: 2px;
    }
    .menu-op-nome mark {
      background: linear-gradient(transparent 4%, rgb(255 218 66 / 0.62) 4%, rgb(255 218 66 / 0.62) 96%, transparent 96%);
      color: inherit;
    }
    /* a amostra do spoiler: a palavra na tarja preta, em claro para ler o nome */
    .tarja-amostra {
      padding: 0 5px;
      border-radius: 3px 2px 3px 2px;
      background: #151515;
      color: #f1f1ec;
    }
    .menu-op-nome code {
      padding: 0 4px;
      border-radius: 2px;
      background: rgb(21 21 21 / 0.08);
      font-family: var(--f-mono);
      font-weight: 700;
      font-size: 0.92em;
    }
    /* os estilos, cada um do jeito que fica no texto (as medidas dos títulos são as da leitura) */
    [data-estilo='t1'],
    [data-estilo='t2'] {
      font-family: var(--f-marker);
      font-size: 1.12rem;
    }
    [data-estilo='t1'] {
      font-size: 1.3rem;
    }
    [data-estilo='t3'] {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.92rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    [data-estilo='citacao'] {
      font-style: italic;
    }
    [data-estilo='codigo'] {
      font-family: var(--f-mono);
      font-weight: 700;
      font-size: 0.95rem;
    }
    /* o estilo da linha: o marca-texto amarelo e o tique, no lugar do atalho */
    .menu-op[aria-checked='true'] {
      background: rgb(255 218 66 / 0.4);
    }
    .menu-op kbd {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      color: var(--ink-2);
      white-space: nowrap;
    }
    /* o jeito de escrever ("[[", "---") é texto da folha: a letra de máquina, como na Ajuda */
    .menu-op .jeito {
      padding: 1px 5px;
      border-radius: 2px;
      background: rgb(21 21 21 / 0.07);
      font-family: var(--f-mono);
      font-weight: 700;
      font-size: 0.86rem;
      letter-spacing: 0;
      color: var(--ink);
    }
    /* cada widget: o desenho, o nome à mão e, embaixo, o que ele faz */
    .widget-op {
      grid-template-columns: 22px minmax(0, 1fr);
      align-items: start;
      padding-block: 6px;
    }
    .widget-op lucide-icon {
      margin-top: 3px;
    }
    .widget-op-texto {
      display: grid;
      gap: 1px;
    }
    .widget-op-sobre {
      max-width: 17rem;
      font-size: 0.82rem;
      line-height: 1.3;
      color: var(--ink-2);
    }
    /* no toque não tem atalho de teclado: fica só o jeito de escrever, quando tem */
    @media (pointer: coarse) {
      .menu-op .atalho {
        display: none;
      }
      .menu-op {
        min-height: 44px;
      }
    }

    /* ===== A Ajuda: as marcas em partes; cada uma com o nome, o jeito de escrever na letra de
       máquina (que quebra a linha, por mais comprida que seja) e o atalho na ponta ===== */
    .guia {
      max-height: min(34rem, 72vh);
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    /* ===== A lista do link: uma tira de fichário presa embaixo da folha ===== */
    .elos {
      margin-top: 8px;
      padding: 8px;
      border-radius: 2px;
      background: var(--papel-ficha);
      box-shadow: var(--papel-solto-sombra);
    }
    .elos.grande {
      flex: 0 0 auto;
      max-height: 40%;
      overflow-y: auto;
    }
    /* ===== O painel do link para outra anotação: os campos do link para um endereço, com a
       lista das anotações logo embaixo da busca ===== */
    .elo-busca {
      min-width: 0;
      /* a lista e a escolhida, na letra delas (o rótulo do campo é que vai em caixa alta) */
      font-family: var(--f-ui);
      font-weight: 500;
      letter-spacing: 0;
      text-transform: none;
    }
    .elo-busca .elos-lista {
      max-height: 12.5rem;
      margin-top: 6px;
    }
    /* a escolhida: o que o link vai abrir, num tique de caneta embaixo do título */
    .elo-escolhida {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 6px 0 0 4px;
      font-size: 0.9rem;
      color: var(--ink-2);
    }
    .elo-escolhida lucide-icon {
      flex: none;
      color: var(--ink);
    }
    .elos-campo {
      width: 100%;
      padding: 7px 10px;
      border: 0;
      border-bottom: 2px solid var(--ink);
      background: transparent;
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1.1rem;
      outline: none;

      &::placeholder {
        color: rgb(21 21 21 / 0.66);
      }
      &:focus-visible {
        border-bottom-width: 3px;
      }
    }
    .elos-dica {
      margin: 0 0 4px 6px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    .elos-lista {
      max-height: 15rem;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      list-style: none;
    }
    .elo-op {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: baseline;
      gap: 2px 12px;
      padding: 7px 10px;
      border-radius: 3px;
      cursor: pointer;
    }
    .elo-op:hover {
      background: rgb(21 21 21 / 0.06);
    }
    /* a escolhida: o marca-texto amarelo, o mesmo do link na leitura */
    .elo-op.ativa {
      background: rgb(255 218 66 / 0.55);
    }
    .elo-nome {
      overflow: hidden;
      font-family: var(--f-hand);
      font-size: 1.12rem;
      color: var(--ink);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .elo-meta {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.82rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink-2);
      white-space: nowrap;
    }
    .elo-op.nova {
      grid-template-columns: auto minmax(0, 1fr);
      color: var(--ink);

      .elo-nome {
        color: var(--ink);
      }
      .elo-meta {
        grid-column: 2;
        white-space: normal;
        text-transform: none;
        letter-spacing: 0;
        font-family: var(--f-ui);
        font-weight: 500;
      }
    }
    .elos-vazio {
      padding: 6px 10px;
      font-style: italic;
      color: rgb(21 21 21 / 0.66);
    }
    @media (max-width: 559px) {
      .elo-op {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    /* ===== A folha pautada (o papel, a sombra e o foco são do .papel em volta dela) ===== */
    textarea {
      --line: 1.75rem;
      field-sizing: content;
      max-height: 22rem;
      display: block;
      width: 100%;
      /* as linhas da folha vazia: 6, ou o que o pai pedir em --linhas */
      min-height: calc(var(--line) * var(--linhas, 6) + 8px);
      padding: 4px 10px;
      border: 0;
      border-radius: 2px;
      resize: vertical;
      background:
        /* pauta azul de fichário, a mesma das folhas do Pra depois */
        repeating-linear-gradient(to bottom, transparent 0 calc(var(--line) - 2px), rgb(64 110 190 / 0.32) calc(var(--line) - 2px) var(--line))
          0 4px;
      background-attachment: local;
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1.14rem;
      line-height: var(--line);
      caret-color: var(--red);
      outline: none;

      &::placeholder {
        color: rgb(21 21 21 / 0.7);
      }
    }

    /* ===== Na tela inteira: uma folha grande de fichário, com a letra maior ===== */
    .tela-cheia {
      width: min(980px, calc(100vw - 24px));
      max-width: none;
      height: calc(100dvh - 24px);
      max-height: none;
      padding: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--ink);
      overflow: visible;
    }
    .tela-cheia::backdrop {
      background: rgb(8 8 10 / 0.78);
    }
    .tela-cheia[open] {
      animation: folha-sobe var(--t-physical) var(--ease-physical);
    }
    @keyframes folha-sobe {
      from {
        opacity: 0;
        transform: translateY(18px) scale(0.98);
      }
    }
    .folha {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 20px 24px 22px;
      border-radius: 2px;
      background: var(--paper);
      box-shadow: var(--shadow-lift);
    }
    .titulo {
      margin: 0 0 12px;
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.6rem;
      line-height: 1.05;
    }
    .contagem {
      flex: none;
      margin: 4px 2px 0;
      text-align: right;
      font-family: var(--f-ui);
      font-size: 0.8rem;
      color: var(--ink-2);
      font-variant-numeric: tabular-nums;
    }
    .contagem.perto {
      color: var(--ink);
      font-weight: 700;
    }
    .contagem.passou {
      color: var(--error-ink);
    }
    textarea.grande {
      --line: 2rem;
      flex: 1 1 auto;
      field-sizing: fixed;
      min-height: 0;
      max-height: none;
      padding: 4px 18px;
      resize: none;
      font-size: 1.3rem;
      overflow-y: auto;
    }
    @media (prefers-reduced-motion: reduce) {
      .tela-cheia[open] {
        animation: none;
      }
    }
    @media (max-width: 559px) {
      .tela-cheia {
        width: 100vw;
        height: 100dvh;
      }
      .folha {
        padding: 14px 12px 12px;
      }
      textarea.grande {
        padding: 4px 10px;
        font-size: 1.18rem;
      }
      /* no celular a folha cresce com o texto e quem rola é o editor: uma rolagem só, não uma folha
         rolando dentro de outra (no toque, a de dentro prendia o dedo) */
      textarea:not(.grande),
      .previa:not(.grande) {
        max-height: none;
      }
    }
    /* no celular (em pé ou deitado), a tela inteira é a parte que o teclado deixa à vista: o alto da
       folha não some quando o teclado abre */
    @media (pointer: coarse) and (max-width: 767px), (pointer: coarse) and (max-height: 500px) {
      .tela-cheia {
        width: 100vw;
        height: var(--vv-h, 100dvh);
        margin: 0;
        inset: var(--vv-top, 0px) 0 auto;
      }
      .folha {
        padding: 12px 12px 10px;
      }
      .titulo {
        margin-bottom: 8px;
        font-size: 1.35rem;
      }
    }
    /* na tela inteira, o papel enche a folha e o texto enche o papel */
    .papel.grande {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 5rem;
    }
    /* com a régua presa embaixo, a folha termina em cima dela */
    .folha:has(.regua.presa) {
      padding-bottom: 60px;
    }
    /* os painéis na tela inteira: no máximo um bom pedaço da folha, rolando por dentro (sem empurrar
       a folha para fora do diálogo) */
    .folha > .painel {
      flex: 0 1 auto;
      min-height: 0;
      max-height: 62%;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    /* rolando por dentro, o pé grudado do painel encosta na borda de baixo (e redesenha a tinta dela) */
    @media (max-width: 559px) {
      .folha > .painel {
        padding-bottom: 0;
      }
      .folha > .painel .painel-acoes {
        margin-bottom: 0;
        box-shadow:
          inset 0 2px 0 rgb(21 21 21 / 0.12),
          inset 0 -2px 0 var(--ink),
          0 -10px 14px -12px rgb(0 0 0 / 0.4);
      }
    }
    .papel > textarea.grande,
    .papel > .previa.grande {
      min-height: 5rem;
    }
  `,
})
export class RichEditor {
  readonly value = model('');
  /** O máximo de caracteres (com o contador embaixo da folha); sem ele, nem limite nem contador. */
  readonly max = input<number | null>(null);
  protected readonly counted = (n: number) => COUNT_FMT.format(n);
  readonly placeholder = input('');
  /** O nome do campo: o título da tela inteira ("O que achou?"). */
  readonly label = input('');
  /** O id do campo pequeno, para o rótulo de fora apontar para ele. */
  readonly areaId = 'texto-' + ++uid;
  /** As anotações que os links "[[Título]]" podem abrir; null, sem links. */
  readonly notes = input<readonly Review[] | null>(null);
  /**
   * O texto aparece na ficha do mural (a anotação): a prévia do widget mostra "Na ficha" e "Aberta".
   * Na resenha, a ficha do mural mostra só o começo do texto, e a prévia é a da leitura.
   */
  readonly onCard = input(true);
  /** A ficha deste texto: a Nota (a ficha colada) não oferece colar ela nela mesma. */
  readonly selfId = input<string | null>(null);
  /**
   * No celular, a régua da folha pequena desce para cima do teclado enquanto se escreve (a da tela
   * inteira desce sempre). Só onde a folha mora num diálogo que acompanha o teclado (o editor da
   * ficha); num lugar que gira ou rola com a página, ela fica no alto da folha.
   */
  readonly dock = input(false);

  /** Em qual folha a régua está presa em cima do teclado (null: no alto da folha, como sempre). */
  protected readonly docked = signal<boolean | null>(null);
  protected readonly DoneIcon = Check;
  private readonly dockMedia = typeof matchMedia === 'function' ? matchMedia(DOCK_MEDIA) : null;

  constructor() {
    watchVisualViewport();
  }

  protected readonly LinkIcon = NOTE_LINK_ICON;
  protected readonly UrlIcon = Link;
  protected readonly PlusIcon = Plus;
  protected readonly StrikeIcon = Strikethrough;
  protected readonly MarkIcon = Highlighter;
  protected readonly CloseIcon = X;
  protected readonly HelpIcon = CircleHelp;
  protected readonly FormatIcon = Type;

  /**
   * O painel do link para um endereço: o trecho que ele vai ocupar, o texto e o endereço (`swap`: o
   * link que já estava lá, que ele troca).
   */
  protected readonly urlLink = signal<{ big: boolean; start: number; end: number; text: string; url: string; swap?: boolean } | null>(null);
  /** O endereço do painel serve (com "https://" se faltou). */
  protected readonly urlOk = computed(() => !!normalizeUrl(this.urlLink()?.url ?? ''));
  /** A grade da tabela aberta, com o tamanho apontado. */
  protected readonly tablePick = signal<{ big: boolean; cols: number; rows: number } | null>(null);
  protected readonly gridCols = [1, 2, 3, 4, 5, 6];
  protected readonly gridRows = [1, 2, 3, 4, 5, 6];

  /** O painel que acabou de abrir entra na tela (no celular, a régua pode já ter saído dela). */
  private showPanel(selector: string): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  // ===== Os menus: "Formatar", "Inserir" e a caixa do estilo =====

  /** As marcas do texto, no "Formatar" (o nome vai escrito do jeito que fica), com o atalho. */
  protected readonly textMarks: readonly { act: Action; icon: LucideIconData; keys: string; aria: string | null }[] = [
    { act: 'bold', icon: Bold, keys: 'Ctrl+B', aria: 'Control+B' },
    { act: 'italic', icon: Italic, keys: 'Ctrl+I', aria: 'Control+I' },
    { act: 'strike', icon: Strikethrough, keys: 'Ctrl+Shift+X', aria: 'Control+Shift+X' },
    { act: 'mark', icon: Highlighter, keys: 'Ctrl+Shift+H', aria: 'Control+Shift+H' },
    { act: 'spoiler', icon: EyeOff, keys: '', aria: null },
    { act: 'code', icon: Code, keys: 'Ctrl+E', aria: 'Control+E' },
  ];
  protected readonly InsideIcon = CornerDownRight;
  /** As listas: no "Formatar" e na régua, com os atalhos do Docs. */
  protected readonly lists: readonly { act: ListKind; name: string; icon: LucideIconData; keys: string; aria: string }[] = [
    { act: 'check', name: 'Tarefas', icon: ListChecks, keys: 'Ctrl+Shift+9', aria: 'Control+Shift+9' },
    { act: 'ul', name: 'Lista', icon: List, keys: 'Ctrl+Shift+8', aria: 'Control+Shift+8' },
    { act: 'ol', name: 'Lista numerada', icon: ListOrdered, keys: 'Ctrl+Shift+7', aria: 'Control+Shift+7' },
  ];
  /** Os estilos do parágrafo. */
  protected readonly styles: readonly { value: LineStyle; name: string; icon: LucideIconData }[] = [
    { value: 'texto', name: 'Texto normal', icon: Pilcrow },
    { value: 't1', name: 'Título 1', icon: Heading1 },
    { value: 't2', name: 'Título 2', icon: Heading2 },
    { value: 't3', name: 'Título 3', icon: Heading3 },
    { value: 'citacao', name: 'Citação', icon: Quote },
    { value: 'codigo', name: 'Bloco de código', icon: SquareCode },
  ];
  /** O que o "Inserir" tem antes dos widgets (o link para outra anotação, só onde ele abre alguma). */
  protected readonly inserts = computed(() => {
    const all: { act: Action; name: string; icon: LucideIconData; keys: string; aria: string | null; typed: string }[] = [
      { act: 'url', name: 'Link para um endereço', icon: Link, keys: 'Ctrl+K', aria: 'Control+K', typed: '' },
      { act: 'note', name: 'Link para outra anotação', icon: NOTE_LINK_ICON, keys: '', aria: null, typed: '[[' },
      { act: 'table', name: 'Tabela', icon: Table, keys: '', aria: null, typed: '' },
      { act: 'rule', name: 'Divisória', icon: Minus, keys: '', aria: null, typed: '---' },
    ];
    return this.notes() ? all : all.filter((o) => o.act !== 'note');
  });

  /** O menu aberto (qual, e em qual das folhas), ou null. */
  protected readonly menu = signal<{ name: MenuName; big: boolean } | null>(null);
  /** O menu foi aberto pelo teclado: o Esc volta para o botão dele (o lugar de quem estava na régua). */
  private menuByKeyboard = false;

  protected isOpen(name: MenuName, big: boolean): boolean {
    const m = this.menu();
    return !!m && m.name === name && m.big === big;
  }

  /** Abre ou fecha um menu (e fecha os painéis da régua). */
  protected toggleMenu(name: MenuName, big: boolean, e: MouseEvent, area: HTMLTextAreaElement): void {
    // fechar pelo próprio botão: o foco volta para o texto (o menu, com o foco, sai da tela)
    if (this.isOpen(name, big)) this.closeMenu(null, area);
    // pelo teclado (Enter, espaço: um clique sem ponteiro), o foco já vai para o primeiro item
    else this.openMenu(name, big, e.detail === 0);
  }

  /**
   * Abre um menu. Pelo teclado, o foco vai para o primeiro item (na caixa do estilo, para o estilo da
   * linha); pelo mouse, fica no menu (sem marcar nenhum de cara), e as setas, Esc e Tab já valem.
   */
  protected openMenu(name: MenuName, big: boolean, first: boolean): void {
    this.menuByKeyboard = first;
    this.closePanels();
    this.menu.set({ name, big });
    setTimeout(() => {
      const menu = this.host.nativeElement.querySelector<HTMLElement>('.menu');
      const chosen = name === 'estilo' ? menu?.querySelector<HTMLElement>('.menu-op[aria-checked="true"]') : null;
      (first ? (chosen ?? this.menuItems()[0]) : menu)?.focus({ preventScroll: true });
      // o menu inteiro na tela (embaixo da folha, ele pode cair atrás do pé do editor); preso em cima
      // do teclado, ele já abre para cima, à vista
      if (this.docked() === null) menu?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  private menuItems(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.menu .menu-op'));
  }

  /**
   * No menu: setas para cima e para baixo, Home e End andam pelos itens; nos de duas colunas, as
   * setas do lado passam para a outra, na mesma altura. Esc fecha e volta para o texto (pelo
   * teclado, para o botão); Tab sai e fecha.
   */
  protected onMenuKey(e: KeyboardEvent, area: HTMLTextAreaElement): void {
    const items = this.menuItems();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    // com o foco no menu (aberto pelo mouse), a seta para baixo vai para o primeiro e a para cima, o último
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const cols = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.menu .menu-coluna'));
      if (cols.length < 2) return;
      const col = Math.max(0, cols.findIndex((c) => c.contains(document.activeElement)));
      const row = at < 0 ? 0 : Array.from(cols[col].querySelectorAll('.menu-op')).indexOf(items[at]);
      const next = Array.from(cols[(col + (e.key === 'ArrowRight' ? 1 : cols.length - 1)) % cols.length].querySelectorAll<HTMLElement>('.menu-op'));
      e.preventDefault();
      next[Math.min(Math.max(row, 0), next.length - 1)]?.focus();
    } else if (e.key === 'Escape') {
      if (!this.menuByKeyboard) return this.closeMenu(e, area);
      e.preventDefault();
      e.stopPropagation();
      const m = this.menu();
      this.menu.set(null);
      const buttons = this.host.nativeElement.querySelectorAll<HTMLElement>(`.menu-botao[data-menu="${m?.name}"]`);
      // a régua da folha grande (no diálogo) é a segunda
      buttons[m?.big ? buttons.length - 1 : 0]?.focus();
    } else if (e.key === 'Tab') this.menu.set(null);
  }

  /** O foco saiu do menu (um toque fora, outro campo): ele fecha. */
  protected onMenuFocusOut(e: FocusEvent): void {
    const to = e.relatedTarget as Node | null;
    if (!to || !(e.currentTarget as HTMLElement).contains(to)) this.menu.set(null);
  }

  protected closeMenu(e: Event | null, area: HTMLTextAreaElement): void {
    e?.preventDefault();
    e?.stopPropagation();
    this.menu.set(null);
    area.focus();
  }

  /** O que um botão da régua ou um item dos menus faz (o menu fecha antes). */
  protected act(area: HTMLTextAreaElement, big: boolean, what: Action): void {
    this.menu.set(null);
    switch (what) {
      case 'bold':
        return this.wrap(area, '**');
      case 'italic':
        return this.wrap(area, '*');
      case 'strike':
        return this.wrap(area, '~~');
      case 'mark':
        return this.wrap(area, '==');
      case 'spoiler':
        return this.wrap(area, '||');
      case 'code':
        return this.code(area);
      case 'url':
        return this.startUrl(area, big);
      case 'note':
        return this.startLink(area, big);
      case 'table':
        return this.startTable(big);
      case 'rule':
        return this.rule(area);
      case 'inside':
        return this.lineInItem(area);
      default:
        return this.list(area, what);
    }
  }

  // ===== O estilo do parágrafo =====

  /** O estilo da linha do cursor: a caixa do estilo diz qual é, e os menus marcam. */
  protected readonly lineStyle = signal<LineStyle>('texto');
  protected readonly styleName = computed(() => this.styles.find((s) => s.value === this.lineStyle())?.name ?? 'Texto normal');

  /** O cursor andou (ou o texto mudou): o estilo da linha dele. */
  protected track(area: HTMLTextAreaElement): void {
    this.lineStyle.set(styleAt(area.value, area.selectionStart));
  }

  protected pickStyle(area: HTMLTextAreaElement, style: LineStyle): void {
    this.menu.set(null);
    this.setStyle(area, style);
  }

  /**
   * Troca o estilo das linhas da seleção (ou da linha do cursor), como a caixa de estilos do Word:
   * o título e a citação trocam a marca do começo de cada linha; o bloco de código cerca as linhas
   * com "```" (e sair dele tira as cercas, o que estava dentro fica).
   */
  protected setStyle(area: HTMLTextAreaElement, style: LineStyle): void {
    const now = styleAt(area.value, area.selectionStart);
    if (now === 'codigo') {
      if (style === 'codigo') return area.focus();
      this.unfence(area);
      if (style === 'texto') return this.track(area);
    }
    if (style === 'codigo') return this.fence(area);
    const prefix = STYLE_PREFIX[style];
    const { from, to, lines } = this.linesAt(area);
    const single = lines.length === 1;
    const caret = area.selectionStart - from;
    let shift = 0;
    const out = lines.map((l, i) => {
      // linha em branco no meio da seleção fica em branco
      if (!single && !l.trim()) return l;
      const bare = l.replace(QUOTE_MARK, '').replace(HEADING_MARK, '');
      if (i === 0) shift = prefix.length - (l.length - bare.length);
      return prefix + bare;
    }).join('\n');
    // uma linha só, sem seleção: o cursor fica no mesmo ponto do texto dela
    const at = single && area.selectionStart === area.selectionEnd ? Math.max(from + prefix.length, from + caret + shift) : -1;
    if (at >= 0) this.replace(area, from, to, out, at, at);
    else this.replace(area, from, to, out, from, from + out.length);
    this.track(area);
  }

  /** O bloco de código em volta das linhas (numa linha vazia, o bloco vazio com o cursor dentro). */
  private fence(area: HTMLTextAreaElement): void {
    const { from, to } = this.linesAt(area);
    const inner = area.value.slice(from, to);
    const piece = '```\n' + inner + '\n```';
    this.replace(area, from, to, piece, from + 4, from + 4 + inner.length);
    this.track(area);
  }

  /** Tira as cercas "```" do bloco de código em que o cursor está (a de baixo pode faltar). */
  private unfence(area: HTMLTextAreaElement): void {
    const text = area.value;
    const lines = text.split('\n');
    const here = text.slice(0, area.selectionStart).split('\n').length - 1;
    const fences = lines.map((l, i) => (FENCE_MARK.test(l) ? i : -1)).filter((i) => i >= 0);
    // as cercas abrem e fecham aos pares: a que abre o bloco do cursor é a última de número par até ele
    const k = fences.filter((i) => i <= here).length - 1;
    const open = fences[k - (k % 2)];
    const close = fences[k - (k % 2) + 1];
    if (open === undefined) return;
    const offset = (i: number) => lines.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
    let caret = area.selectionStart;
    const drop = (i: number) => {
      const start = offset(i);
      // a linha com a quebra depois dela; a última, com a de antes
      const [s, e] = i < lines.length - 1 ? [start, start + lines[i].length + 1] : [Math.max(0, start - 1), start + lines[i].length];
      if (caret > s) caret = Math.max(s, caret - (e - s));
      this.replace(area, s, e, '', s, s);
    };
    // a de baixo primeiro: a de cima continua no mesmo lugar
    if (close !== undefined) drop(close);
    drop(open);
    area.setSelectionRange(caret, caret);
  }

  // ===== A Ajuda =====

  /** A Ajuda aberta (em qual das folhas), ou null. */
  protected readonly guide = signal<boolean | null>(null);
  /** "Ajuda" (ou Ctrl+/): abre a lista de todas as marcas embaixo da folha; de novo, fecha. */
  protected toggleGuide(big: boolean): void {
    const open = this.guide() === big;
    this.closePanels();
    if (open) return;
    this.guide.set(big);
    this.showPanel('.guia');
  }

  /** As abas: as setas do lado (e Home, End) trocam entre escrever e ver como fica. */
  protected onTabKey(e: KeyboardEvent, big: boolean): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const on = e.key === 'Home' ? false : e.key === 'End' ? true : !this.seeing();
    this.seeing.set(on);
    if (on) this.docked.set(null);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`#${this.areaId}${on ? '-aba-ver' : '-aba-escrever'}${big ? '-g' : ''}`)?.focus());
  }

  /**
   * A lista do link aberta: pela régua (`auto` falso, com a própria busca) ou por "[[" escrito na
   * folha (`auto`, a busca é o que vem depois dos colchetes). `start` e `end` são o trecho do texto
   * que o link vai ocupar; `big`, em qual das folhas (a pequena ou a da tela inteira). No painel da
   * régua, `chosen` é o título escolhido na lista (null: a lista está aberta, nada escolhido).
   */
  protected readonly linking = signal<{ auto: boolean; big: boolean; start: number; end: number; query: string; label?: string; chosen?: string | null; swap?: boolean } | null>(null);
  /** A opção escolhida da lista (pelas setas). */
  protected readonly active = signal(0);
  /** Onde "[[" foi fechado com Esc: a lista não volta a abrir sozinha ali. */
  private dismissedAt = -1;

  /** As anotações da lista: uma por título (a que o link abre), as que começam com a busca primeiro. */
  protected readonly linkOptions = computed(() => {
    const k = this.linking();
    const notes = this.notes();
    if (!k || !notes) return [];
    const q = linkKey(k.query);
    const seen = new Set<string>();
    const out: Review[] = [];
    for (const n of notes) {
      const key = linkKey(n.game.name);
      // um título com colchetes não cabe num link
      if (seen.has(key) || /[[\]]/.test(n.game.name) || (q && !key.includes(q))) continue;
      seen.add(key);
      out.push(resolveNote(notes, n.game.name) ?? n);
    }
    const starts = (n: Review) => (linkKey(n.game.name).startsWith(q) ? 1 : 0);
    return out.sort((a, b) => starts(b) - starts(a) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  });

  /** O que foi escrito e ainda não é título de nenhuma anotação: dá para criar o link mesmo assim. */
  protected readonly newLink = computed(() => {
    const k = this.linking();
    const t = k?.query.trim().replace(/\s+/g, ' ') ?? '';
    if (!t || /[[\]]/.test(t)) return null;
    const key = linkKey(t);
    return (this.notes() ?? []).some((n) => linkKey(n.game.name) === key) ? null : t;
  });

  protected readonly optionCount = computed(() => this.linkOptions().length + (this.newLink() ? 1 : 0));

  /** A anotação que o link escolhido no painel abre (null: ainda não existe, o link a cria depois). */
  protected readonly chosenNote = computed(() => {
    const t = this.linking()?.chosen;
    return t ? resolveNote(this.notes() ?? [], t) : null;
  });
  protected readonly ChosenIcon = Check;

  /** Os links em "Ver como fica": mostram se a anotação existe, mas não abrem nada. */
  protected readonly previewLinks = computed<NoteLinks | null>(() => {
    const notes = this.notes();
    return notes ? { resolve: (title) => resolveNote(notes, title) } : null;
  });

  protected metaOf(n: Review): string {
    const cat = n.category;
    const when = n.completedAt ? formatReviewDate(n.completedAt) : '';
    return [cat, when].filter(Boolean).join(' · ');
  }

  protected readonly BoldIcon = Bold;
  protected readonly ItalicIcon = Italic;
  protected readonly GrowIcon = Maximize2;
  protected readonly ShrinkIcon = Minimize2;

  protected readonly SeeIcon = Eye;
  protected readonly WriteIcon = PenLine;
  protected readonly toggle = toggleCheck;
  /** Mostrando a folha formatada no lugar do campo (a aba "Ver como fica"). */
  protected readonly seeing = signal(false);

  /** A tela inteira está aberta. */
  protected readonly big = signal(false);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('grande');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Onde estava o cursor, para o campo que recebe o foco continuar do mesmo ponto. */
  private caret: [number, number] = [0, 0];

  /** O campo pequeno recebe o foco (o "Falta…" do editor, o rótulo clicado). */
  focus(): void {
    this.host.nativeElement.querySelector<HTMLTextAreaElement>(`#${this.areaId}`)?.focus();
  }

  /** Troca entre escrever e ver como fica; voltando a escrever, o foco volta para o campo. */
  protected see(on: boolean, big: boolean): void {
    this.seeing.set(on);
    // o campo some: a régua presa volta para o alto (o foco que sai de um campo escondido nem sempre avisa)
    if (on) this.docked.set(null);
    if (!on) setTimeout(() => this.focusAt(big ? `#${this.areaId}-grande` : `#${this.areaId}`));
  }

  /** Volta a escrever (o editor abre outra ficha). */
  reset(): void {
    this.seeing.set(false);
    this.docked.set(null);
    this.linking.set(null);
    this.dismissedAt = -1;
    // os painéis da régua (link, tabela, mais marcas, guia) eram da ficha de antes: fecham
    this.closePanels();
    // e a folha na tela inteira, se tinha ficado aberta
    const big = this.dialog().nativeElement;
    if (big.open) big.close();
  }

  /** "Link para outra anotação" na régua: a busca abre, com o trecho selecionado já escrito nela. */
  protected startLink(area: HTMLTextAreaElement, big: boolean): void {
    if (this.linking() && !this.linking()!.auto) {
      this.closeLink(area);
      return;
    }
    this.closePanels();
    const [start, end] = [area.selectionStart, area.selectionEnd];
    const query = area.value.slice(start, end).split('\n')[0].trim();
    // o trecho selecionado é o texto que aparece; a busca começa por ele (o título de uma anotação já
    // vem escolhido), e a anotação é a que for escolhida
    const same = query ? resolveNote(this.notes() ?? [], query) : null;
    this.linking.set({ auto: false, big, start, end, query: same?.game.name ?? query, label: query, chosen: same?.game.name ?? null });
    this.active.set(0);
    // a busca vem marcada: escrever troca o trecho que veio nela
    setTimeout(() => {
      const search = this.panelInput(big, '.elos-campo');
      search?.focus();
      search?.select();
    });
    this.showPanel('.elo-painel');
  }

  protected setLinkLabel(label: string): void {
    const k = this.linking();
    if (k) this.linking.set({ ...k, label });
  }

  protected setQuery(q: string): void {
    const k = this.linking();
    if (!k) return;
    // escrever de novo desfaz a escolha: a lista volta
    this.linking.set({ ...k, query: q, chosen: null });
    this.active.set(0);
  }

  /** Tocou numa anotação da lista: pela "[[", o link entra; no painel, ela fica escolhida. */
  protected take(title: string): void {
    if (this.linking()?.auto) this.pick(title);
    else this.choose(title);
  }

  /** No painel: a anotação escolhida vai para o campo e a lista fecha (falta só "Pôr o link"). */
  private choose(title: string): void {
    const k = this.linking();
    if (k) this.linking.set({ ...k, query: title, chosen: title });
  }

  /** "Pôr o link" no painel; sem anotação escolhida, o foco volta para a busca. */
  protected putLink(): void {
    const k = this.linking();
    if (!k) return;
    if (k.chosen) this.pick(k.chosen);
    else this.panelInput(k.big, '.elos-campo')?.focus();
  }

  /**
   * As teclas da busca do painel: as setas andam na lista (com uma escolhida, reabrem a lista),
   * Enter escolhe a anotação apontada e, com ela escolhida, põe o link. As letras seguem para o campo
   * (o handler não devolve nada: um `false` devolvido faria o Angular cancelar a tecla).
   */
  protected onSearchKey(e: KeyboardEvent): void {
    const k = this.linking();
    if (!k || k.auto) return;
    const n = this.optionCount();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (k.chosen) {
        this.linking.set({ ...k, chosen: null });
        this.active.set(0);
      } else if (n) this.active.set((this.active() + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (k.chosen) this.putLink();
      else if (n) {
        const opts = this.linkOptions();
        const i = Math.min(this.active(), n - 1);
        this.choose(i < opts.length ? opts[i].game.name : this.newLink()!);
      }
    }
  }

  /** Esc no painel fecha só ele (não o editor) e devolve o foco ao trecho. */
  protected closeLinkKey(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.closeLink();
  }

  /** Escreveu na folha: com "[[" aberto antes do cursor (sem fechar), a lista abre e filtra. */
  protected watchLink(area: HTMLTextAreaElement, big: boolean): void {
    if (!this.notes()) return;
    const k = this.linking();
    if (k && !k.auto) return;
    const at = area.selectionStart;
    if (at !== area.selectionEnd) return this.linking.set(null);
    // depois de um "|" é o texto do link, escrito à mão: a lista não abre
    const m = /\[\[([^[\]\n|]{0,80})$/.exec(area.value.slice(0, at));
    if (!m || m.index === this.dismissedAt) {
      // o "[[" fechado com Esc saiu de antes do cursor: o próximo abre a lista de novo
      if (!m) this.dismissedAt = -1;
      if (k) this.linking.set(null);
      return;
    }
    if (!k || k.start !== m.index) this.active.set(0);
    this.linking.set({ auto: true, big, start: m.index, end: at, query: m[1] });
  }

  protected onKeyUp(e: KeyboardEvent, area: HTMLTextAreaElement, big: boolean): void {
    // o cursor andou (setas, Home, End): o "[[" pode ter ficado para trás
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) this.watchLink(area, big);
    // e pode ter saído do link ou do widget cujo painel abriu pelo clique
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) this.leavePassive(area);
    this.track(area);
  }

  /**
   * Voltou para a folha com a busca da régua aberta: a busca fecha (Esc na folha seria o do editor).
   * No celular, a régua desce para cima do teclado (o lugar dela na folha não fica guardado: com o
   * teclado aberto, cada linha de folha conta).
   */
  protected onAreaFocus(big: boolean): void {
    if (this.linking() && !this.linking()!.auto) this.linking.set(null);
    if ((big || this.dock()) && this.dockMedia?.matches) this.docked.set(big);
  }

  protected onAreaBlur(e: FocusEvent, ruler: HTMLElement): void {
    // saiu da folha (sem ser para a lista, que não pega o foco): a lista automática fecha
    if (this.linking()?.auto) this.linking.set(null);
    // para um menu da própria régua (o "Mais", os widgets), ela continua presa
    if (!ruler.contains(e.relatedTarget as Node | null)) this.docked.set(null);
  }

  /** O foco saiu da régua presa (de um menu dela) para fora da folha: ela volta para o lugar dela. */
  protected onRulerFocusOut(e: FocusEvent, area: HTMLTextAreaElement): void {
    const to = e.relatedTarget as Node | null;
    if (to !== area && !(e.currentTarget as HTMLElement).contains(to)) this.docked.set(null);
  }

  /** Setas, Enter, Tab e Esc na lista da "[[" (pela folha). Devolve se usou a tecla. */
  protected onListKey(e: KeyboardEvent): boolean {
    const k = this.linking();
    if (!k) return false;
    const n = this.optionCount();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) this.active.set((this.active() + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
      return true;
    }
    if ((e.key === 'Enter' || (e.key === 'Tab' && k.auto)) && n) {
      e.preventDefault();
      const opts = this.linkOptions();
      const i = Math.min(this.active(), n - 1);
      this.pick(i < opts.length ? opts[i].game.name : this.newLink()!);
      return true;
    }
    if (e.key === 'Escape') {
      // só a lista fecha, não o editor inteiro
      e.preventDefault();
      e.stopPropagation();
      if (k.auto) this.dismissedAt = k.start;
      this.closeLink();
      return true;
    }
    return false;
  }

  /** Põe o link "[[título]]" no lugar do trecho (e de um "]]" que já estava logo depois). */
  protected pick(title: string): void {
    const k = this.linking();
    const area = this.areaOf(k?.big ?? false);
    if (!k || !area) return;
    const text = area.value;
    const end = k.auto && text.slice(k.end, k.end + 2) === ']]' ? k.end + 2 : k.end;
    // pelo painel, com um texto diferente do título: "[[Título|texto]]" (o link abre a anotação e mostra o texto)
    const label = (k.label ?? '').replace(/[[\]|]/g, '').replace(/\s+/g, ' ').trim();
    const link = !k.auto && label && linkKey(label) !== linkKey(title) ? `[[${title}|${label}]]` : `[[${title}]]`;
    this.linking.set(null);
    this.replace(area, k.start, end, link, k.start + link.length, k.start + link.length);
  }

  protected closeLink(area = this.areaOf(this.linking()?.big ?? false)): void {
    const k = this.linking();
    this.linking.set(null);
    if (k && !k.auto && area) {
      area.focus();
      area.setSelectionRange(k.start, k.end);
    }
  }

  private areaOf(big: boolean): HTMLTextAreaElement | null {
    return this.host.nativeElement.querySelector<HTMLTextAreaElement>(big ? `#${this.areaId}-grande` : `#${this.areaId}`);
  }

  protected grow(area: HTMLTextAreaElement): void {
    this.caret = [area.selectionStart, area.selectionEnd];
    this.big.set(true);
    this.dialog().nativeElement.showModal();
    // o campo grande nasce no próximo desenho: o foco vai para ele, no mesmo ponto do texto
    setTimeout(() => this.focusAt(`#${this.areaId}-grande`));
  }

  protected shrink(): void {
    this.dialog().nativeElement.close();
  }

  protected onClosed(): void {
    const big = this.host.nativeElement.querySelector<HTMLTextAreaElement>(`#${this.areaId}-grande`);
    if (big) this.caret = [big.selectionStart, big.selectionEnd];
    this.big.set(false);
    this.docked.set(null);
    this.focusAt(`#${this.areaId}`);
  }

  private focusAt(selector: string): void {
    const el = this.host.nativeElement.querySelector<HTMLTextAreaElement>(selector);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(...this.caret);
  }

  protected onKey(e: KeyboardEvent, area: HTMLTextAreaElement, big = false): void {
    // o painel aberto pelo clique (com o cursor ainda na folha): o Esc fecha só ele, não o editor
    if (e.key === 'Escape' && this.passive && this.panelRange()) {
      e.preventDefault();
      e.stopPropagation();
      this.closePanels();
      return;
    }
    // a Ajuda aberta: o Esc na folha fecha só ela
    if (e.key === 'Escape' && this.guide() !== null) {
      e.preventDefault();
      e.stopPropagation();
      this.guide.set(null);
      return;
    }
    // com a lista aberta, as setas, o Enter e o Esc são dela (o Esc fecha só a lista, não o editor)
    if (this.linking() && (this.linking()!.auto || e.key === 'Escape') && this.onListKey(e)) return;
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const key = e.key.toLowerCase();
    if (mod && !e.shiftKey && key === 'b') {
      e.preventDefault();
      this.wrap(area, '**');
    } else if (mod && !e.shiftKey && key === 'i') {
      e.preventDefault();
      this.wrap(area, '*');
    } else if (mod && !e.shiftKey && key === 'k') {
      e.preventDefault();
      this.startUrl(area, big);
    } else if (mod && !e.shiftKey && key === 'e') {
      e.preventDefault();
      this.code(area);
    } else if (mod && e.shiftKey && key === 'x') {
      e.preventDefault();
      this.wrap(area, '~~');
    } else if (mod && e.shiftKey && key === 'h') {
      e.preventDefault();
      this.wrap(area, '==');
    } else if (mod && e.shiftKey && LIST_KEYS[e.code]) {
      // Ctrl+Shift+7, 8 e 9, como no Docs (pela tecla, não pelo que ela escreve com o Shift)
      e.preventDefault();
      this.list(area, LIST_KEYS[e.code]);
    } else if (mod && !e.shiftKey && (e.key === '/' || e.code === 'Slash')) {
      e.preventDefault();
      this.toggleGuide(big);
    } else if (e.key === 'Tab' && !mod && !e.altKey && this.tableLine(area)) {
      this.tableTab(e, area);
    } else if (e.key === 'Enter' && !e.shiftKey && !mod && !e.isComposing) {
      if (this.tableLine(area)) this.tableEnter(e, area);
      else this.continueList(e, area);
    } else if (e.key === 'Enter' && e.shiftKey && !mod && !e.altKey && !e.isComposing && this.inItem(area)) {
      // Shift+Enter num item (ou no que vem embaixo dele): uma linha nova dentro do mesmo item
      e.preventDefault();
      this.lineInItem(area);
    }
  }

  // ===== Código e divisória =====

  /** A linha do cursor (ou as da seleção): onde começa, onde termina e o texto. */
  private linesAt(area: HTMLTextAreaElement): { from: number; to: number; lines: string[] } {
    const text = area.value;
    const from = text.lastIndexOf('\n', area.selectionStart - 1) + 1;
    const endAt = text.indexOf('\n', Math.max(area.selectionEnd - (area.selectionEnd > area.selectionStart && text[area.selectionEnd - 1] === '\n' ? 1 : 0), area.selectionStart));
    const to = endAt === -1 ? text.length : endAt;
    return { from, to, lines: text.slice(from, to).split('\n') };
  }

  /** Código: na seleção de uma linha, entre crases; em várias linhas (ou numa linha vazia), o bloco entre "```". */
  protected code(area: HTMLTextAreaElement): void {
    const text = area.value;
    const sel = text.slice(area.selectionStart, area.selectionEnd);
    const { from, to, lines } = this.linesAt(area);
    if (sel.includes('\n') || (!sel && !lines[0].trim())) {
      const body = sel || '';
      const before = from > 0 && text[from - 1] !== '\n' ? '\n' : '';
      const block = `${before}\`\`\`\n${body}\n\`\`\``;
      const start = sel ? area.selectionStart : from;
      const end = sel ? area.selectionEnd : to;
      const caret = start + before.length + 4;
      this.replace(area, start, end, block, caret, caret + body.length);
      return;
    }
    this.wrap(area, '`');
  }

  /** A divisória numa linha só dela, depois da linha do cursor. */
  protected rule(area: HTMLTextAreaElement): void {
    const text = area.value;
    const { to } = this.linesAt(area);
    const line = text.slice(text.lastIndexOf('\n', to - 1) + 1, to);
    const piece = (line.trim() ? '\n' : '') + '---\n';
    this.replace(area, to, to, piece, to + piece.length, to + piece.length);
  }

  // ===== O link para um endereço =====

  /** Abre o painel do link com o trecho selecionado (um endereço selecionado já vai no campo dele). */
  protected startUrl(area: HTMLTextAreaElement, big: boolean): void {
    this.closePanels();
    const sel = area.value.slice(area.selectionStart, area.selectionEnd);
    const isUrl = !!normalizeUrl(sel.trim()) && /^(https?:\/\/|www\.|mailto:)/i.test(sel.trim());
    this.urlLink.set({ big, start: area.selectionStart, end: area.selectionEnd, text: isUrl ? '' : sel.replace(/\s+/g, ' ').trim(), url: isUrl ? sel.trim() : '' });
    setTimeout(() => this.panelInput(big, isUrl || !sel ? '.url-campo' : 'input')?.focus());
    this.showPanel('.url-painel');
  }

  /**
   * Um clique na folha (um só: dois escolhem a palavra) na linha de um widget abre o painel dele com
   * o que está escrito, para trocar; num link, o painel do link, com o texto e para onde ele vai.
   * O cursor fica onde a pessoa clicou: o painel só abre embaixo (é "passivo", ver `passive`), e um
   * clique fora do link, o cursor saindo dele ou escrever na folha o fecham.
   */
  protected onAreaClick(e: MouseEvent, area: HTMLTextAreaElement, big: boolean): void {
    if (e.detail !== 1 || area.selectionStart !== area.selectionEnd) return;
    const text = area.value;
    const at = area.selectionStart;
    const from = text.lastIndexOf('\n', at - 1) + 1;
    const endAt = text.indexOf('\n', at);
    const line = text.slice(from, endAt === -1 ? text.length : endAt);
    const w = parseWidgetLine(line);
    const def = w && widgetDef(w.name);
    if (def) {
      this.startWidget(area, big, def, false);
      return;
    }
    const link = linkAt(line, at - from);
    if (!link) {
      if (this.passive) this.closePanels();
      return;
    }
    const [start, end] = [from + link.start, from + link.end];
    if (link.kind === 'url') {
      this.closePanels();
      this.urlLink.set({ big, start, end, text: link.text, url: link.href, swap: true });
      this.passive = true;
      this.showPanel('.url-painel');
    } else if (this.notes()) {
      this.closePanels();
      const title = resolveNote(this.notes() ?? [], link.title)?.game.name ?? link.title;
      // o texto só vem quando é outro ("[[Título|texto]]"): trocar a anotação não leva o título de antes
      const label = linkKey(link.label) === linkKey(link.title) ? '' : link.label;
      this.linking.set({ auto: false, big, start, end, query: title, label, chosen: title, swap: true });
      this.active.set(0);
      this.passive = true;
      this.showPanel('.elo-painel');
    }
  }

  /**
   * O painel aberto por um clique na folha, com o cursor ainda nela: ele só mostra o link ou o widget
   * para trocar. Quem quiser mexer vai até ele (Tab ou clique); escrever na folha o fecha, porque o
   * trecho que ele marcou mudou de lugar.
   */
  private passive = false;

  /** O trecho que o painel aberto marcou (o link ou a linha do widget). */
  private panelRange(): [number, number] | null {
    const r = this.urlLink() ?? this.linking() ?? this.widgetPick();
    return r ? [r.start, r.end] : null;
  }

  /** Escreveu na folha com um painel passivo aberto: ele fecha. */
  protected dropPassive(): void {
    if (this.passive && this.panelRange()) this.closePanels();
  }

  /** O cursor saiu (pelas setas) do link ou do widget do painel passivo: ele fecha. */
  private leavePassive(area: HTMLTextAreaElement): void {
    const range = this.passive ? this.panelRange() : null;
    if (!range) return;
    const at = area.selectionStart;
    // a linha do widget conta até o fim (o cursor no fim da linha ainda está nele)
    if (at < range[0] || at > range[1]) this.closePanels();
  }

  /** Fecha os painéis e menus da régua (antes de abrir outro). */
  private closePanels(): void {
    this.passive = false;
    this.linking.set(null);
    this.urlLink.set(null);
    this.tablePick.set(null);
    this.menu.set(null);
    this.guide.set(null);
    this.widgetPick.set(null);
  }

  protected setUrl(field: 'text' | 'url', value: string): void {
    const u = this.urlLink();
    if (u) this.urlLink.set({ ...u, [field]: value });
  }

  /** Põe "[texto](endereço)" no lugar do trecho (sem texto, o endereço sozinho). */
  protected putUrl(area: HTMLTextAreaElement): void {
    const u = this.urlLink();
    const href = normalizeUrl(u?.url ?? '');
    if (!u || !href) return;
    const label = u.text.replace(/[[\]]/g, '').trim();
    const piece = label ? `[${label}](${href})` : href;
    this.urlLink.set(null);
    this.replace(area, u.start, u.end, piece, u.start + piece.length, u.start + piece.length);
  }

  protected closeUrl(e: Event | null, area: HTMLTextAreaElement): void {
    // Esc fecha só o painel, não o editor
    e?.preventDefault();
    e?.stopPropagation();
    const u = this.urlLink();
    this.urlLink.set(null);
    if (u) {
      area.focus();
      area.setSelectionRange(u.start, u.end);
    }
  }

  /** Colou um endereço com um texto selecionado: o texto vira o link. */
  protected onPaste(e: ClipboardEvent, area: HTMLTextAreaElement): void {
    const pasted = e.clipboardData?.getData('text/plain')?.trim() ?? '';
    const sel = area.value.slice(area.selectionStart, area.selectionEnd);
    if (!sel.trim() || sel.includes('\n') || !/^(https?:\/\/|mailto:)\S+$/i.test(pasted)) return;
    e.preventDefault();
    const piece = `[${sel.trim().replace(/[[\]]/g, '')}](${pasted})`;
    const start = area.selectionStart;
    this.replace(area, start, area.selectionEnd, piece, start + piece.length, start + piece.length);
  }

  private panelInput(big: boolean, selector: string): HTMLInputElement | null {
    const panels = this.host.nativeElement.querySelectorAll<HTMLElement>('.painel');
    for (const p of Array.from(panels)) {
      const inBig = !!p.closest('.tela-cheia');
      if (inBig === big) return p.querySelector<HTMLInputElement>(selector);
    }
    return null;
  }

  // ===== Os widgets =====

  protected readonly widgets = WIDGETS;
  protected readonly fieldsFor = fieldsFor;
  protected readonly ChevronIcon = ChevronDown;
  /** O desenho de cada widget no menu. */
  protected iconOf(name: string): LucideIconData {
    return WIDGET_ICONS[name] ?? Blocks;
  }

  /** Escolheu um widget no menu: o painel dele abre. */
  protected chooseWidget(area: HTMLTextAreaElement, big: boolean, def: WidgetDef): void {
    this.menu.set(null);
    this.startWidget(area, big, def);
    this.askCard();
  }
  /**
   * O painel do widget aberto: em qual folha, qual widget, os valores dos campos e o trecho que ele
   * vai ocupar (`swap`: a linha de um widget que já estava lá, que ele troca).
   */
  protected readonly widgetPick = signal<{ big: boolean; name: string; values: WidgetValues; start: number; end: number; swap: boolean } | null>(null);
  /** Os tamanhos, de todo widget (o valor fica em `values.size`). */
  protected readonly sizes = WIDGET_SIZES;
  /** O desenho de cada tamanho: a peça na ficha, da altura das linhas dele (3, 5, 7, 10), larga como um vídeo. */
  protected readonly sizeArt: Record<WidgetSize, { w: number; h: number }> = {
    mini: { w: 7, h: 4 },
    pequeno: { w: 12, h: 6.5 },
    medio: { w: 17, h: 9.5 },
    grande: { w: 25, h: 13.5 },
  };
  protected readonly widgetSize = computed<WidgetSize>(() => (this.widgetPick()?.values['size'] as WidgetSize | undefined) || 'medio');
  protected readonly sizeHint = computed(() => WIDGET_SIZES.find((o) => o.value === this.widgetSize())?.hint ?? '');
  /** Onde a prévia mostra o widget: na ficha do mural (do tamanho dela) ou aberta (a leitura). */
  protected readonly previewViews = [
    { value: 'ficha', label: 'Na ficha' },
    { value: 'aberta', label: 'Aberta' },
  ] as const;
  protected readonly widgetView = signal<'ficha' | 'aberta'>('ficha');
  /** A prévia na ficha do mural: só onde o texto aparece nela (a anotação). */
  protected readonly cardPreview = computed(() => this.onCard() && this.widgetView() === 'ficha');

  protected onViewKey(e: KeyboardEvent): void {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    this.widgetView.update((v) => (v === 'ficha' ? 'aberta' : 'ficha'));
    const group = (e.currentTarget as HTMLElement).parentElement;
    setTimeout(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }

  /** Os parâmetros do widget do painel; null, falta o que ele precisa (o dia do contador). */
  protected readonly widgetArgs = computed(() => {
    const w = this.widgetPick();
    return w ? this.widgetOf(w.name).write(w.values) : null;
  });

  /** O que está errado no que já foi escrito no painel (um link que não serve). */
  protected readonly widgetProblem = computed(() => {
    const w = this.widgetPick();
    return w ? (this.widgetOf(w.name).problem?.(w.values) ?? null) : null;
  });

  /** Nas escolhas (a moldura): as setas trocam, como num grupo de rádios. */
  protected onChoiceKey(e: KeyboardEvent, key: string, options: readonly { value: string }[]): void {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const w = this.widgetPick();
    if (!w) return;
    const at = Math.max(0, options.findIndex((o) => o.value === (w.values[key] || options[0]?.value)));
    const next = options[(at + step + options.length) % options.length];
    this.setWidgetValue(key, next.value);
    const group = (e.currentTarget as HTMLElement).parentElement;
    setTimeout(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }

  protected widgetOf(name: string): WidgetDef {
    return widgetDef(name) ?? WIDGETS[0];
  }

  /**
   * O painel do widget escolhido: com o cursor na linha de um widget desse tipo, ele abre com o que
   * está escrito, para trocar; senão, um novo.
   */
  private startWidget(area: HTMLTextAreaElement, big: boolean, def: WidgetDef, focusPanel = true): void {
    this.closePanels();
    const { from, lines } = this.linesAt(area);
    const here = lines.length === 1 ? parseWidgetLine(lines[0]) : null;
    if (here && here.name === def.name) {
      this.widgetPick.set({ big, name: def.name, values: { ...def.read(here.args), size: here.size }, start: from, end: from + lines[0].length, swap: true });
    } else {
      this.widgetPick.set({ big, name: def.name, values: { size: 'medio' }, start: area.selectionStart, end: area.selectionEnd, swap: false });
    }
    this.showPanel('.widget-painel');
    // pela régua, o foco vai para o painel; pelo clique na linha do widget, o cursor fica na folha
    if (focusPanel) setTimeout(() => this.panelInput(big, 'input')?.focus());
    else this.passive = true;
  }

  protected pickWidget(def: WidgetDef): void {
    const w = this.widgetPick();
    // o tamanho fica: ele vale para todo widget
    if (w) this.widgetPick.set({ ...w, name: def.name, values: { size: w.values['size'] ?? 'medio' } });
    this.askCard();
  }

  // ===== A Nota: a ficha colada =====

  protected readonly CardIcon = StickyNote;
  private readonly store = inject(ReviewStore);
  /** A lista das fichas (ver ui/card-picker.ts) aberta. */
  protected readonly cardPickerOpen = signal(false);
  /** A ficha que a Nota do painel cola: pelo id; escrita à mão, a anotação do título. */
  protected readonly chosenCard = computed<Review | null>(() => {
    const w = this.widgetPick();
    if (w?.name !== 'nota') return null;
    const id = w.values['id'];
    if (id) return this.store.get(id) ?? null;
    const title = w.values['title'];
    return title ? resolveNote(this.notes() ?? this.store.notes(), title) : null;
  });

  /** A Nota nova (ainda sem ficha) abre já a lista: escolher a ficha é a primeira coisa a fazer. */
  private askCard(): void {
    const w = this.widgetPick();
    if (w?.name === 'nota' && !w.swap && !w.values['id'] && !w.values['title']) this.cardPickerOpen.set(true);
  }

  /** Escolheu a ficha: ela vai para o painel (o id e o nome). */
  protected pickCard(card: Review): void {
    const w = this.widgetPick();
    if (!w) return;
    this.widgetPick.set({ ...w, values: { ...w.values, id: card.id, title: card.game.name } });
    this.cardJustPicked = true;
  }
  private cardJustPicked = false;

  /** A lista fechou: o foco vai para "Colar a nota", se escolheu uma; senão, de volta para o "Qual". */
  protected cardPickerOpened(open: boolean, big: boolean): void {
    this.cardPickerOpen.set(open);
    if (open) return;
    const picked = this.cardJustPicked;
    this.cardJustPicked = false;
    setTimeout(() => this.panelInput(big, picked ? '.painel-ok' : '[data-campo="id"]')?.focus());
  }

  /** "Anotação", "Jogo"… o mural da ficha, no campo. */
  protected kindOf(r: Review): string {
    return isNote(r) ? `Anotação${r.category ? ' · ' + r.category : ''}` : cap(profileOf(r.kind).singular);
  }

  protected setWidgetValue(key: string, value: string): void {
    const w = this.widgetPick();
    if (w) this.widgetPick.set({ ...w, values: { ...w.values, [key]: value } });
  }

  /**
   * Põe o widget numa linha só dele: no lugar da linha que ele troca, numa linha vazia onde está o
   * cursor, ou numa linha nova logo depois da do cursor. Sem o que ele precisa, o foco vai para o
   * primeiro campo de data vazio.
   */
  protected putWidget(area: HTMLTextAreaElement): void {
    const w = this.widgetPick();
    if (!w) return;
    const args = this.widgetArgs();
    if (!args) {
      const def = this.widgetOf(w.name);
      const fields = fieldsFor(def, w.values);
      const missing = fields.find((f) => f.required && !w.values[f.key]?.trim()) ?? fields.find((f) => f.required) ?? fields[0];
      this.panelInput(w.big, `[data-campo="${missing.key}"]`)?.focus();
      return;
    }
    const line = widgetLine(w.name, args, this.widgetSize());
    this.widgetPick.set(null);
    if (w.swap) {
      this.replace(area, w.start, w.end, line, w.start + line.length, w.start + line.length);
      return;
    }
    const text = area.value;
    const lineStart = text.lastIndexOf('\n', w.start - 1) + 1;
    const lineEndAt = text.indexOf('\n', w.end);
    const lineEnd = lineEndAt === -1 ? text.length : lineEndAt;
    // num item (ou embaixo dele), o widget entra recuado: fica dele, como a descrição
    const indent = bodyIndent(linesOf(text), text.slice(0, lineStart).split('\n').length - 1) ?? '';
    if (!text.slice(lineStart, lineEnd).trim()) {
      // na linha vazia, com o recuo que ela já tinha
      const own = /^[ \t]*/.exec(text.slice(lineStart, lineEnd))![0] + line;
      this.replace(area, lineStart, lineEnd, own, lineStart + own.length, lineStart + own.length);
      return;
    }
    const piece = '\n' + indent + line;
    this.replace(area, lineEnd, lineEnd, piece, lineEnd + piece.length, lineEnd + piece.length);
  }

  protected closeWidget(e: Event | null, area: HTMLTextAreaElement): void {
    e?.preventDefault();
    e?.stopPropagation();
    const w = this.widgetPick();
    this.widgetPick.set(null);
    area.focus();
    if (w) area.setSelectionRange(w.start, w.end);
  }

  // ===== A tabela =====

  protected startTable(big: boolean): void {
    // a grade aberta nesta folha: o botão fecha
    const open = this.tablePick()?.big === big;
    this.closePanels();
    if (open) return;
    this.tablePick.set({ big, cols: 2, rows: 2 });
    this.showPanel('.tabela-painel');
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.quadrado[tabindex="0"]')?.focus());
  }

  /** Setas andam na grade, Enter (ou espaço) põe a tabela do tamanho apontado. */
  protected onGridKey(e: KeyboardEvent): void {
    const t = this.tablePick();
    if (!t) return;
    const move: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    const cols = Math.min(6, Math.max(1, t.cols + d[0]));
    const rows = Math.min(6, Math.max(1, t.rows + d[1]));
    this.tablePick.set({ ...t, cols, rows });
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.quadrado[tabindex="0"]')?.focus());
  }

  protected closeTable(e: Event | null, area: HTMLTextAreaElement): void {
    e?.preventDefault();
    e?.stopPropagation();
    this.tablePick.set(null);
    area.focus();
  }

  protected closeGuide(e: Event | null, area: HTMLTextAreaElement): void {
    e?.preventDefault();
    e?.stopPropagation();
    this.guide.set(null);
    area.focus();
  }

  /**
   * Põe a tabela (colunas × linhas, sem contar o cabeçalho) numa linha só dela, com o cabeçalho
   * "Coluna 1, Coluna 2…" e o primeiro nome já selecionado para ser trocado.
   */
  protected putTable(area: HTMLTextAreaElement, cols: number, rows: number): void {
    this.tablePick.set(null);
    const text = area.value;
    const at = area.selectionEnd;
    const lineStart = text.lastIndexOf('\n', at - 1) + 1;
    const lineEndAt = text.indexOf('\n', at);
    const lineEnd = lineEndAt === -1 ? text.length : lineEndAt;
    const onEmpty = !text.slice(lineStart, lineEnd).trim();
    const pos = onEmpty ? lineStart : lineEnd;
    const head = '| ' + Array.from({ length: cols }, (_, i) => `Coluna ${i + 1}`).join(' | ') + ' |';
    const sep = '|' + ' --- |'.repeat(cols);
    const row = '|' + '   |'.repeat(cols);
    const before = onEmpty ? '' : '\n';
    const piece = before + [head, sep, ...Array.from({ length: rows }, () => row)].join('\n') + (onEmpty ? '' : '\n');
    const first = pos + before.length + 2;
    this.replace(area, pos, onEmpty ? lineEnd : pos, piece, first, first + 'Coluna 1'.length);
  }

  /** A linha do cursor é uma linha de tabela ("| … |")? */
  private tableLine(area: HTMLTextAreaElement): boolean {
    if (area.selectionStart !== area.selectionEnd && area.value.slice(area.selectionStart, area.selectionEnd).includes('\n')) return false;
    const { lines } = this.linesAt(area);
    const t = lines[0].trim();
    return t.length > 1 && t.startsWith('|') && t.endsWith('|');
  }

  /** As células da linha: onde começa e termina o conteúdo de cada uma (sem os espaços). */
  private cellsOf(line: string, offset: number): { start: number; end: number }[] {
    const bars: number[] = [];
    for (let i = 0; i < line.length; i++) if (line[i] === '|' && line[i - 1] !== '\\') bars.push(i);
    const out: { start: number; end: number }[] = [];
    for (let b = 0; b < bars.length - 1; b++) {
      let s = bars[b] + 1;
      let e = bars[b + 1];
      while (s < e && line[s] === ' ') s++;
      while (e > s && line[e - 1] === ' ') e--;
      // a célula vazia: o cursor fica no meio dos espaços
      if (s === e) s = e = Math.min(bars[b] + 2, bars[b + 1]);
      out.push({ start: offset + s, end: offset + e });
    }
    return out;
  }

  /** Tab vai para a próxima célula (Shift+Tab, a anterior), passando de linha; depois da última, cria uma linha. */
  private tableTab(e: KeyboardEvent, area: HTMLTextAreaElement): void {
    e.preventDefault();
    const text = area.value;
    const caret = area.selectionStart;
    const { from } = this.linesAt(area);
    const lineEndAt = text.indexOf('\n', from);
    const line = text.slice(from, lineEndAt === -1 ? text.length : lineEndAt);
    const cells = this.cellsOf(line, from);
    const i = cells.findIndex((c, k) => caret <= c.end || k === cells.length - 1);
    const go = (c: { start: number; end: number }) => area.setSelectionRange(c.start, c.end);
    if (e.shiftKey) {
      if (i > 0) return go(cells[i - 1]);
      // a primeira célula: a última da linha de cima (se ela é da tabela e não é a de traços)
      const prevEnd = from - 1;
      if (prevEnd < 0) return;
      const prevFrom = text.lastIndexOf('\n', prevEnd - 1) + 1;
      let prev = text.slice(prevFrom, prevEnd);
      let pFrom = prevFrom;
      if (isTableSep(prev)) {
        const pp = text.lastIndexOf('\n', prevFrom - 2) + 1;
        prev = text.slice(pp, prevFrom - 1);
        pFrom = pp;
      }
      if (!prev.trim().startsWith('|')) return;
      const pc = this.cellsOf(prev, pFrom);
      if (pc.length) go(pc[pc.length - 1]);
      return;
    }
    if (i < cells.length - 1) return go(cells[i + 1]);
    // a última célula: a primeira da linha de baixo (pulando a de traços), ou uma linha nova
    let nextFrom = (lineEndAt === -1 ? text.length : lineEndAt) + 1;
    let next = lineEndAt === -1 ? '' : text.slice(nextFrom, (text.indexOf('\n', nextFrom) + 1 || text.length + 1) - 1);
    if (isTableSep(next)) {
      nextFrom += next.length + 1;
      const nEnd = text.indexOf('\n', nextFrom);
      next = text.slice(nextFrom, nEnd === -1 ? text.length : nEnd);
    }
    if (next.trim().startsWith('|')) {
      const nc = this.cellsOf(next, nextFrom);
      if (nc.length) go(nc[0]);
      return;
    }
    this.addRow(area, from, line);
  }

  /** Enter no fim de uma linha da tabela cria a próxima; numa linha toda vazia, a tabela acaba ali. */
  private tableEnter(e: KeyboardEvent, area: HTMLTextAreaElement): void {
    const text = area.value;
    const { from } = this.linesAt(area);
    const lineEndAt = text.indexOf('\n', from);
    const lineEnd = lineEndAt === -1 ? text.length : lineEndAt;
    if (area.selectionStart !== lineEnd) return;
    const line = text.slice(from, lineEnd);
    e.preventDefault();
    if (tableCells(line).every((c) => !c)) {
      this.replace(area, from, lineEnd, '', from, from);
      return;
    }
    this.addRow(area, from, line);
  }

  private addRow(area: HTMLTextAreaElement, from: number, line: string): void {
    const n = Math.max(1, tableCells(line).length);
    const row = '\n|' + '   |'.repeat(n);
    const end = from + line.length;
    this.replace(area, end, end, row, end + 3, end + 3);
  }

  /**
   * Negrito ou itálico na seleção: põe as marcas em volta (os espaços das pontas ficam de fora); se
   * ela já está marcada, tira. Sem seleção, deixa as marcas com o cursor no meio, pronto para escrever.
   */
  protected wrap(area: HTMLTextAreaElement, mark: string): void {
    const text = area.value;
    let [s, e] = [area.selectionStart, area.selectionEnd];
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    const m = mark.length;
    // já marcada por fora ("**|texto|**"): tira as marcas. Um "*" que é metade de um "**" é negrito,
    // não itálico ("**|texto|**" ganha o itálico por dentro: "***texto***")
    const halfOfBold = m === 1 && text[s - 2] === '*' && text[s - 3] !== '*';
    const outside = text.slice(s - m, s) === mark && text.slice(e, e + m) === mark && !halfOfBold;
    if (s < e && outside) {
      this.replace(area, s - m, e + m, text.slice(s, e), s - m, e - m);
      return;
    }
    // ou por dentro ("|**texto**|")
    const inner = text.slice(s, e);
    if (inner.length > 2 * m && inner.startsWith(mark) && inner.endsWith(mark) && (m === 2 || !inner.startsWith('**') || inner.startsWith('***'))) {
      this.replace(area, s, e, inner.slice(m, -m), s, e - 2 * m);
      return;
    }
    this.replace(area, s, e, mark + inner + mark, s + m, e + m);
  }

  /**
   * Lista nas linhas da seleção: cada linha vira item (tirando o marcador de outro tipo de lista); se
   * todas já são desse tipo, voltam a ser texto. A numerada conta 1, 2, 3 a partir da primeira.
   */
  protected list(area: HTMLTextAreaElement, kind: ListKind): void {
    const { from, to, lines } = this.linesAt(area);
    const all = lines.every((l) => lineKind(l).kind === kind);
    let n = 0;
    const next = lines.map((l) => {
      const k = lineKind(l);
      const indent = /^\s*/.exec(l)![0];
      const rest = k.kind === 'p' ? l.slice(indent.length) : k.rest;
      if (all) return indent + rest;
      // linha em branco no meio da seleção fica em branco
      if (lines.length > 1 && !l.trim()) return l;
      return indent + prefixOf(kind, ++n) + rest;
    });
    const out = next.join('\n');
    // uma linha só, sem seleção: o cursor vai para o fim dela, pronto para escrever o item
    const single = area.selectionStart === area.selectionEnd && lines.length === 1;
    this.replace(area, from, to, out, single ? from + out.length : from, from + out.length);
  }

  /** Enter num item: o próximo item já vem com o marcador; Enter num item vazio termina a lista. */
  private continueList(e: KeyboardEvent, area: HTMLTextAreaElement): void {
    if (area.selectionStart !== area.selectionEnd) return;
    const text = area.value;
    const at = area.selectionStart;
    const from = text.lastIndexOf('\n', at - 1) + 1;
    const lineEnd = text.indexOf('\n', at);
    const line = text.slice(from, lineEnd === -1 ? text.length : lineEnd);
    const k = lineKind(line);
    if (k.kind === 'p') {
      this.itemAfterBody(e, area, from, line);
      return;
    }
    e.preventDefault();
    const indent = /^\s*/.exec(line)![0];
    if (!k.rest.trim()) {
      // item vazio: o marcador sai e a lista acaba ali
      this.replace(area, from, from + line.length, '', from, from);
      return;
    }
    const marker = line.length - k.rest.length;
    if (at - from <= marker) {
      // no começo do item (antes do texto, até no meio do marcador): um item vazio entra em cima e
      // este desce inteiro, com o seu marcador, como num editor de texto. Antes, o marcador novo
      // entrava no cursor, na frente do que já estava lá ("- [ ] - [ ] item").
      // o de cima no mesmo jeito deste ("*", "1)"), a tarefa por fazer; o numerado desce com o número seguinte
      const mark = line.slice(0, marker);
      const above = k.kind === 'check' ? mark.replace(/\[[xX]\]/, '[ ]') : mark;
      const own = k.kind === 'ol' ? mark.replace(/\d+/, String(k.n + 1)) : mark;
      const caret = from + above.length + 1 + own.length;
      this.replace(area, from, from + marker, `${above}\n${own}`, caret, caret);
      return;
    }
    const prefix = indent + prefixOf(k.kind, k.kind === 'ol' ? k.n + 1 : 1);
    // no fim de um item com o que vem embaixo dele: o item novo entra depois disso, que continua dele
    const { lines, at: here } = this.cursorLine(area);
    const end = at === from + line.length ? itemEnd(lines, here) : here;
    const put = end === here ? at : from + lines.slice(here, end + 1).join('\n').length;
    this.replace(area, put, put, '\n' + prefix, put + 1 + prefix.length, put + 1 + prefix.length);
  }

  /** A linha do cursor: o número dela no texto, e as linhas todas. */
  private cursorLine(area: HTMLTextAreaElement): { lines: string[]; at: number } {
    return { lines: linesOf(area.value), at: area.value.slice(0, area.selectionStart).split('\n').length - 1 };
  }

  /** O cursor está num item de lista (ou no que vem embaixo dele, recuado)? */
  private inItem(area: HTMLTextAreaElement): boolean {
    const { lines, at } = this.cursorLine(area);
    return ownerItem(lines, at) !== null;
  }

  /**
   * Uma linha nova dentro do mesmo item (Shift+Enter, ou "Linha dentro do item" no Formatar): recuada
   * até a coluna do texto dele, ela é a descrição, a foto, a lista de dentro. Fora de lista, só a
   * linha nova.
   */
  protected lineInItem(area: HTMLTextAreaElement): void {
    const { lines, at } = this.cursorLine(area);
    const piece = '\n' + (bodyIndent(lines, at) ?? '');
    const [s, e] = [area.selectionStart, area.selectionEnd];
    this.replace(area, s, e, piece, s + piece.length, s + piece.length);
  }

  /**
   * Enter numa linha que é de um item (a descrição embaixo dele): um item novo da mesma lista, como
   * no Docs depois do Shift+Enter. Na linha do corpo só de espaços, o item novo fica no lugar dela.
   */
  private itemAfterBody(e: KeyboardEvent, area: HTMLTextAreaElement, from: number, line: string): void {
    const { lines, at } = this.cursorLine(area);
    const owner = ownerItem(lines, at);
    if (owner === null || owner === at) return;
    e.preventDefault();
    const top = lines[owner];
    const k = lineKind(top);
    const prefix = /^\s*/.exec(top)![0] + prefixOf(k.kind as ListKind, k.kind === 'ol' ? k.n + 1 : 1);
    if (!line.trim()) {
      this.replace(area, from, from + line.length, prefix, from + prefix.length, from + prefix.length);
      return;
    }
    const cur = area.selectionStart;
    this.replace(area, cur, cur, '\n' + prefix, cur + 1 + prefix.length, cur + 1 + prefix.length);
  }

  /**
   * Troca o trecho [start, end) por `text` e seleciona [selStart, selEnd). Pelo `insertText`, que entra
   * no desfazer do navegador; sem ele, troca direto e avisa o campo.
   */
  private replace(area: HTMLTextAreaElement, start: number, end: number, text: string, selStart: number, selEnd: number): void {
    area.focus();
    // nada a trocar: o "delete" num cursor sem seleção apagaria a letra de antes, como o Backspace
    if (!text && start === end) {
      area.setSelectionRange(selStart, selEnd);
      return;
    }
    area.setSelectionRange(start, end);
    const ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete', false);
    if (!ok) {
      area.setRangeText(text, start, end, 'end');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    }
    area.setSelectionRange(selStart, selEnd);
  }
}

let uid = 0;

/** A marca do começo da linha de cada estilo do parágrafo (o bloco de código são as cercas). */
const STYLE_PREFIX: Record<Exclude<LineStyle, 'codigo'>, string> = { texto: '', t1: '# ', t2: '## ', t3: '### ', citacao: '> ' };
const HEADING_MARK = /^#{1,3}\s+/;
/** A citação ("> "), não o spoiler ">!texto!<". */
const QUOTE_MARK = /^\s*>(?!!\S.*!<)\s?/;
const FENCE_MARK = /^\s*```/;
/** Ctrl+Shift+7, 8 e 9: as listas, pela tecla (com o Shift, ela escreve outra coisa). */
const LIST_KEYS: Record<string, ListKind> = { Digit7: 'ol', Digit8: 'ul', Digit9: 'check' };

/** O estilo do parágrafo da linha em que cai a posição `at`: dentro das cercas "```", o bloco de código. */
export function styleAt(text: string, at: number): LineStyle {
  const lines = text.split('\n');
  const here = text.slice(0, at).split('\n').length - 1;
  const line = lines[here] ?? '';
  let open = false;
  for (let i = 0; i < here; i++) if (FENCE_MARK.test(lines[i])) open = !open;
  if (open || FENCE_MARK.test(line)) return 'codigo';
  const h = /^(#{1,3})\s/.exec(line);
  if (h) return `t${h[1].length}` as LineStyle;
  return QUOTE_MARK.test(line) && !/^\s*>!/.test(line) ? 'citacao' : 'texto';
}

/** O endereço do link, se serve: com "https://" quando faltou ("site.com"); null se não parece endereço. */
export function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return null;
  if (/^(https?:\/\/|mailto:)\S+$/i.test(t)) return t;
  // "www.site.com" ou "site.com/x": vira https
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(t)) return 'https://' + t;
  return null;
}

function prefixOf(kind: ListKind, n: number): string {
  return kind === 'ul' ? '- ' : kind === 'check' ? '- [ ] ' : `${n}. `;
}
