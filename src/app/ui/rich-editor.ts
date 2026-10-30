import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, model, signal, untracked, viewChild } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { ICON, IconModule } from './icons';
import { bodyIndent, isTableSep, itemEnd, lineKind, linesOf, linkAt, marksAt, nextNumber, ownerItem, renumberAfter, tableBlockAt, tableCells, withNumber } from '../core/rich-text';
import { DEFAULT_TABLE_LOOK, emptyTable, readTable, tableText } from '../core/tables';
import { NoteLinks, linkKey, resolveNote } from '../core/note-links';
import { Review, formatReviewDate } from '../core/review';
import { RichText } from './rich-text';
import { WidgetSheet } from './widget-sheet';
import type { WidgetDone } from './widget-sheet';
import { WIDGET_ICONS } from './widget-icons';
import { MarkupGuide } from './markup-guide';
import { WIDGETS, WidgetDef, WidgetValues, hostOf, parseWidgetLine, widgetDef, widgetLines } from '../core/widgets';
import { watchVisualViewport } from './visual-viewport';
import { ImageProblem, imageFileOf, localImageIds, localImageUrl } from '../core/images';
import { ImageStore } from '../core/image-store';
import { ImageSync } from '../core/image-sync';
import { Toasts } from './toast';
import { Settings } from '../core/settings';
import { VisualEditor } from './visual-editor/visual-editor';
import { ESTADO_VAZIO } from './visual-editor/visual-api';
import type { AcaoVisual, EstadoVisual, ImagemVisual, MarcaVisual, PedidoLink, VisualApi } from './visual-editor/visual-api';

type ListKind = 'ul' | 'ol' | 'check';
/** Os menus da régua: "Formatar" e "Inserir". */
type MenuName = 'formatar' | 'inserir';
/** O que a régua (e os menus) fazem no texto. */
type Action = 'bold' | 'italic' | 'strike' | 'mark' | 'spoiler' | 'subtle' | 'code' | ListKind | 'inside' | 'url' | 'note' | 'rule';
/** O estilo do parágrafo (o "Formatar" marca o da linha do cursor). */
export type LineStyle = 'texto' | 't1' | 't2' | 't3' | 'citacao' | 'sutil' | 'codigo';

/**
 * Onde a régua desce para cima do teclado: no toque, com a tela estreita (o celular em pé) ou baixa
 * (deitado). Tablet e computador ficam com a régua no alto da folha.
 */
export const DOCK_MEDIA = '(pointer: coarse) and (max-width: 767px), (pointer: coarse) and (max-height: 500px)';

/**
 * O campo do texto da ficha: a folha pautada de sempre, organizada como os editores que todo mundo
 * conhece (Word, Docs). No alto, as abas "Visual" (escrever vendo como fica, sem as marcas: o
 * ui/visual-editor/, num pedaço à parte, em teste) e "Markdown" (as marcas à vista, a <textarea> de
 * sempre); a que abre primeiro é a dos Ajustes ("Jeito de escrever"). Na outra ponta, "Ajuda" e
 * "Tela cheia". Na folha, em cima da margem vermelha do caderno, a régua:
 *
 * - "Formatar": o texto (negrito, itálico, riscado, marca-texto, spoiler, código, com o atalho de
 *   cada um) e o parágrafo (os estilos e as listas);
 * - "Inserir": link para um endereço, link para outra anotação, divisória e os widgets (a tabela é um deles);
 * - os botões de toda hora (desfazer e refazer, negrito, itálico, riscado, marca-texto, as listas, o
 *   link). Sem lugar, os que também estão nos menus saem primeiro, e no fim os que sobram rolam de
 *   lado; nada some, tudo continua no "Formatar" e no "Inserir".
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

const COUNT_FMT = new Intl.NumberFormat('pt-BR');
/** O que o Visual ainda não sabe pôr (a tabela). */
const NOT_YET = 'Ainda não no Visual: use a aba Markdown';
/** O que a régua faz no Visual nesta rodada (o resto avisa `NOT_YET`). */
const VISUAL_ACTS = ['bold', 'italic', 'strike', 'mark', 'spoiler', 'subtle', 'code', 'ul', 'ol', 'check', 'inside', 'rule', 'undo', 'redo'] as const;

@Component({
  selector: 'app-rich-editor',
  imports: [IconModule, NgTemplateOutlet, RichText, WidgetSheet, MarkupGuide, VisualEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // presa, a régua sai da folha para a tela: a folha deixa de ser a medida dela (ver "presa")
  host: { '[class.presa]': 'docked() !== null', '[class.encher]': 'fill()' },
  template: `
    <ng-template #campo let-big="big">
      <!-- O alto da folha, como nos editores de sempre: os dois jeitos de escrever (o Visual, vendo
           como fica, e o Markdown, com as marcas à vista) e, na outra ponta, "Ajuda" e "Tela cheia",
           sempre com o nome (no celular, só o desenho) -->
      <div class="cabeca">
        <div class="abas" role="tablist" aria-label="Jeito de escrever">
          <button
            type="button"
            role="tab"
            class="aba"
            [id]="areaId + (big ? '-aba-visual-g' : '-aba-visual')"
            [attr.aria-selected]="visual()"
            [attr.aria-controls]="areaId + (big ? '-papel-g' : '-papel')"
            [attr.tabindex]="visual() ? 0 : -1"
            aria-label="Visual (em teste)"
            title="Visual (em teste): escrever vendo como fica, sem as marcas"
            (click)="switchMode(true, big)"
            (keydown)="onTabKey($event, big)"
          >
            <lucide-icon [img]="VisualIcon" [size]="16" aria-hidden="true" />
            <span>Visual</span>
            <span class="carimbo-teste em-teste" aria-hidden="true">teste</span>
          </button>
          <button
            type="button"
            role="tab"
            class="aba"
            [id]="areaId + (big ? '-aba-markdown-g' : '-aba-markdown')"
            [attr.aria-selected]="!visual()"
            [attr.aria-controls]="areaId + (big ? '-papel-g' : '-papel')"
            [attr.tabindex]="visual() ? -1 : 0"
            title="Markdown: o texto com as marcas à vista"
            (click)="switchMode(false, big)"
            (keydown)="onTabKey($event, big)"
          >
            <lucide-icon [img]="MarkdownIcon" [size]="16" aria-hidden="true" />
            <span>Markdown</span>
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
          <lucide-icon [img]="HelpIcon" [size]="18" aria-hidden="true" />
          <span class="acao-txt" aria-hidden="true">Ajuda</span>
        </button>
        @if (big) {
          <button type="button" class="acao-folha tamanho" aria-label="Sair da tela cheia" title="Sair da tela cheia" (click)="shrink()">
            <lucide-icon [img]="ShrinkIcon" [size]="18" aria-hidden="true" />
            <span class="acao-txt" aria-hidden="true">Sair da tela cheia</span>
          </button>
        } @else {
          <button type="button" class="acao-folha tamanho" aria-haspopup="dialog" aria-label="Tela cheia" title="Tela cheia: escrever na tela inteira" (click)="grow(area)">
            <lucide-icon [img]="GrowIcon" [size]="18" aria-hidden="true" />
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
        [attr.aria-labelledby]="areaId + (visual() ? '-aba-visual' : '-aba-markdown') + (big ? '-g' : '')"
      >
        <!-- no celular, enquanto se escreve, a régua desce e fica presa em cima do teclado (ver "presa") -->
        <div
          #regua
          class="regua"
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
              <lucide-icon [img]="FormatIcon" [size]="17" aria-hidden="true" />
              <span class="menu-nome">Formatar</span>
              <lucide-icon class="seta" [img]="ChevronIcon" [size]="13" aria-hidden="true" />
            </button>
            @if (isOpen('formatar', big)) {
              <div class="menu" [class.duas]="docked() !== big" role="menu" tabindex="-1" [id]="areaId + '-formatar'" aria-label="Formatar" (keydown)="onMenuKey($event, area)">
                <div class="menu-coluna" role="group" [attr.aria-labelledby]="areaId + '-sec-texto'">
                  <p class="menu-secao" [id]="areaId + '-sec-texto'" aria-hidden="true">Texto</p>
                  @for (t of textMarks; track t.act) {
                    <button type="button" role="menuitem" tabindex="-1" class="menu-op" [attr.aria-keyshortcuts]="t.aria" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="act(area, big, t.act)">
                      <lucide-icon [img]="t.icon" [size]="17" aria-hidden="true" />
                      <span class="menu-op-nome">
                        @switch (t.act) {
                          @case ('bold') { <b>Negrito</b> }
                          @case ('italic') { <i>Itálico</i> }
                          @case ('strike') { <s>Riscado</s> }
                          @case ('mark') { <mark>Marca-texto</mark> }
                          @case ('spoiler') { <span class="tarja-amostra">Spoiler</span> }
                          @case ('subtle') { <span data-estilo="sutil">Sutil</span> }
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
                      <lucide-icon [img]="l.icon" [size]="17" aria-hidden="true" />
                      <span class="menu-op-nome">{{ l.name }}</span>
                      <kbd class="atalho" aria-hidden="true">{{ l.keys }}</kbd>
                    </button>
                  }
                  <!-- a descrição de um item: uma linha recuada que continua dele (no celular, o único jeito
                       fácil, sem Shift+Enter) -->
                  <button type="button" role="menuitem" tabindex="-1" class="menu-op" aria-keyshortcuts="Shift+Enter" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="act(area, big, 'inside')">
                    <lucide-icon [img]="InsideIcon" [size]="17" aria-hidden="true" />
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
              title="Inserir: link, divisória e widgets (contador, imagem, tabela…)"
              (pointerdown)="$event.preventDefault()"
              (click)="toggleMenu('inserir', big, $event, area)"
              (keydown.arrowdown)="$event.preventDefault(); openMenu('inserir', big, true)"
            >
              <lucide-icon [img]="PlusIcon" [size]="17" aria-hidden="true" />
              <span class="menu-nome">Inserir</span>
              <lucide-icon class="seta" [img]="ChevronIcon" [size]="13" aria-hidden="true" />
            </button>
            @if (isOpen('inserir', big)) {
              <div class="menu" [class.duas]="docked() !== big" role="menu" tabindex="-1" [id]="areaId + '-inserir'" aria-label="Inserir" (keydown)="onMenuKey($event, area)">
                <div class="menu-coluna" role="group" [attr.aria-labelledby]="areaId + '-sec-links'">
                  <p class="menu-secao" [id]="areaId + '-sec-links'" aria-hidden="true">Links e divisória</p>
                  @for (o of inserts(); track o.act) {
                    <button type="button" role="menuitem" tabindex="-1" class="menu-op" [attr.aria-keyshortcuts]="o.aria" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="act(area, big, o.act)">
                      <lucide-icon [img]="o.icon" [size]="17" aria-hidden="true" />
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
                    <button type="button" role="menuitem" tabindex="-1" class="menu-op widget-op" [class.apagado]="visual() && d.name === 'tabela'" [attr.aria-disabled]="(visual() && d.name === 'tabela') || null" [attr.title]="visual() && d.name === 'tabela' ? NOT_YET : null" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="chooseWidget(area, big, d)">
                      <lucide-icon [img]="iconOf(d.name)" [size]="18" aria-hidden="true" />
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
          <span class="fio menus-fio" aria-hidden="true"></span>
          <!-- os botões de sempre, à mão (no estreito, rolam de lado; tudo também está nos menus). Primeiro
               desfazer e refazer, como no Docs: no celular não tem Ctrl+Z -->
          <div class="ferramentas">
            <button type="button" class="ferramenta" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" aria-keyshortcuts="Control+Z" (pointerdown)="$event.preventDefault()" (click)="history(area, 'undo')">
              <lucide-icon [img]="UndoIcon" [size]="18" aria-hidden="true" />
            </button>
            <button type="button" class="ferramenta" title="Refazer (Ctrl+Y)" aria-label="Refazer" aria-keyshortcuts="Control+Y Control+Shift+Z" (pointerdown)="$event.preventDefault()" (click)="history(area, 'redo')">
              <lucide-icon [img]="RedoIcon" [size]="18" aria-hidden="true" />
            </button>
            <span class="fio" aria-hidden="true"></span>
            <button type="button" class="ferramenta" title="Negrito (Ctrl+B)" aria-label="Negrito" aria-keyshortcuts="Control+B" [attr.aria-pressed]="pressed('bold')" (pointerdown)="$event.preventDefault()" (click)="act(area, big, 'bold')">
              <lucide-icon [img]="BoldIcon" [size]="18" aria-hidden="true" />
            </button>
            <button type="button" class="ferramenta" title="Itálico (Ctrl+I)" aria-label="Itálico" aria-keyshortcuts="Control+I" [attr.aria-pressed]="pressed('italic')" (pointerdown)="$event.preventDefault()" (click)="act(area, big, 'italic')">
              <lucide-icon [img]="ItalicIcon" [size]="18" aria-hidden="true" />
            </button>
            <button type="button" class="ferramenta extra" title="Riscado (Ctrl+Shift+X)" aria-label="Riscado" aria-keyshortcuts="Control+Shift+X" [attr.aria-pressed]="pressed('strike')" (pointerdown)="$event.preventDefault()" (click)="act(area, big, 'strike')">
              <lucide-icon [img]="StrikeIcon" [size]="18" aria-hidden="true" />
            </button>
            <button type="button" class="ferramenta extra" title="Marca-texto (Ctrl+Shift+H)" aria-label="Marca-texto" aria-keyshortcuts="Control+Shift+H" [attr.aria-pressed]="pressed('mark')" (pointerdown)="$event.preventDefault()" (click)="act(area, big, 'mark')">
              <lucide-icon [img]="MarkIcon" [size]="18" aria-hidden="true" />
            </button>
            <span class="fio" aria-hidden="true"></span>
            @for (l of lists; track l.act) {
              <button type="button" class="ferramenta" [title]="l.name + ' (' + l.keys + ')'" [attr.aria-label]="l.name" [attr.aria-keyshortcuts]="l.aria" [attr.aria-pressed]="listPressed(l.act)" (pointerdown)="$event.preventDefault()" (click)="act(area, big, l.act)">
                <lucide-icon [img]="l.icon" [size]="19" aria-hidden="true" />
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
              <lucide-icon [img]="UrlIcon" [size]="18" aria-hidden="true" />
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
                <lucide-icon [img]="LinkIcon" [size]="19" aria-hidden="true" />
              </button>
            }
          </div>
          <!-- presa em cima do teclado: "Pronto" fecha o teclado (e a régua volta para o alto da folha) -->
          <button type="button" class="pronto" aria-label="Pronto: fechar o teclado" title="Pronto" (pointerdown)="$event.preventDefault()" (click)="blurSheet(area, big)">
            <lucide-icon [img]="DoneIcon" [size]="20" aria-hidden="true" />
          </button>
        </div>
        <!-- O Visual: a folha escrita como a leitura (ver ui/visual-editor/). Vem num pedaço à parte, na
             primeira vez que a aba abre, e fica (escondido na aba Markdown, guardando o desfazer dele);
             enquanto ele chega, a folha mostra o texto pela leitura, no mesmo lugar -->
        @if (visualOpened()) {
          <div class="visual" [class.grande]="big" [hidden]="!visual()" (keydown)="onVisualKey($event, big)" (paste)="onVisualPaste($event, big)" (dragover)="onDragOver($event)" (drop)="onVisualDrop($event)">
            @defer (on immediate) {
              <app-visual-editor
                [texto]="value()"
                [ativo]="visual() && (big || !bigOpen())"
                [grande]="big"
                [encher]="fill()"
                [placeholder]="placeholder()"
                [rotulo]="label() || placeholder()"
                [descrito]="max() ? areaId + '-conta' + (big ? '-grande' : '') : null"
                [max]="max()"
                [links]="previewLinks()"
                [lista]="linking()?.auto === true && linking()?.big === big && optionCount() > 0"
                (mudou)="value.set($event); dropPassive()"
                (estado)="onVisualState($event, big)"
                (pedeLink)="onVisualLink($event, big)"
                (pronto)="onVisualReady($event, big)"
                (foco)="onAreaFocus(big)"
                (desfoco)="onAreaBlur($event, regua)"
                (pedeMarkdown)="switchMode(false, big, $event)"
                (aviso)="toasts.show($event)"
                (imagem)="putVisualImage(big, $event)"
              />
            } @placeholder {
              <div class="visual-chegando" [class.grande]="big" aria-busy="true">
                <app-rich-text [text]="value()" [links]="previewLinks()" />
              </div>
            }
          </div>
        }
        <textarea
          [hidden]="visual()"
          #area
          [id]="big ? areaId + '-grande' : areaId"
          [class.grande]="big"
          [placeholder]="placeholder()"
          [attr.aria-label]="big ? label() : null"
          [value]="areaValue()"
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
          (dragover)="onDragOver($event)"
          (drop)="onDrop($event, area)"
          (blur)="onAreaBlur($event, regua)"
        ></textarea>
      </div>
      @if (savingImage()) {
        <!-- a imagem colada (ou solta) sendo encolhida e guardada: logo vira a linha do widget -->
        <p class="guardando" [class.sr-only]="visual()" role="status">Guardando a imagem…</p>
      }
      @if (max(); as m) {
        <!-- quanto já foi escrito, perto do limite em tinta, passou (por um atalho) em vermelho -->
        <p class="contagem" [id]="areaId + '-conta' + (big ? '-grande' : '')" [attr.title]="visual() ? 'Conta também as marcas que o Markdown guarda (o negrito são 4 a mais)' : null" [class.perto]="value().length > m * 0.9" [class.passou]="value().length > m">
          {{ counted(value().length) }} / {{ counted(m) }} caracteres
        </p>
      }
      <!-- o link para um endereço: o texto e o endereço, embaixo da folha -->
      @if (urlLink(); as u) {
        @if (u.big === big) {
          <div class="painel url-painel" role="group" aria-label="Link para um endereço" (keydown.escape)="closeUrl($event, area)">
            <div class="painel-topo">
              <p class="painel-titulo">Link para um endereço</p>
              <button type="button" class="painel-fechar" aria-label="Fechar" title="Fechar" (click)="closeUrl(null, area)"><lucide-icon [img]="CloseIcon" [size]="17" aria-hidden="true" /></button>
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
              @if (visual() && u.swap) {
                <!-- no Visual o link não abre pela folha: o painel dele abre (e tira) -->
                <span class="painel-mais">
                  @if (urlHref(); as href) {
                    <a class="acao-caneta" [href]="href" target="_blank" rel="noopener noreferrer" title="Abrir o link numa aba nova (ou Ctrl+clique nele)"><lucide-icon [img]="OpenIcon" [size]="16" aria-hidden="true" />Abrir</a>
                  }
                  <button type="button" class="acao-caneta" (click)="unlink()"><lucide-icon [img]="UnlinkIcon" [size]="16" aria-hidden="true" />Tirar o link</button>
                </span>
              }
              <button type="button" class="acao-caneta" (click)="closeUrl(null, area)">Cancelar</button>
              <button type="button" class="painel-ok" [disabled]="!urlOk()" (click)="putUrl(area)">{{ u.swap ? 'Trocar o link' : 'Pôr o link' }}</button>
            </div>
          </div>
        }
      }
      <!-- o widget tocado na folha: uma tirinha com o que ele é, Editar (abre a folha dele) e Tirar.
           Ela é passiva, como o painel do link: o cursor fica na folha, e escrever ou sair da linha fecha -->
      @if (widgetPick(); as w) {
        @if (w.big === big && !widgetSheet()) {
          @let def = widgetOf(w.name);
          <div class="painel widget-tira" role="group" [attr.aria-label]="'Widget: ' + def.label" (keydown.escape)="closeWidget($event, area)">
            <lucide-icon class="widget-tira-icone" [img]="iconOf(w.name)" [size]="20" aria-hidden="true" />
            <span class="widget-tira-texto">
              <span class="widget-tira-nome">{{ def.label }}</span>
              @if (widgetSummary(); as resumo) {
                <span class="widget-tira-resumo">{{ resumo }}</span>
              }
            </span>
            <span class="widget-tira-acoes">
              <button type="button" class="acao-caneta widget-tira-tirar" (click)="removeWidget(area)">
                <lucide-icon [img]="RemoveIcon" [size]="16" aria-hidden="true" />
                Tirar
              </button>
              <button type="button" class="painel-ok widget-tira-editar" (click)="openWidgetSheet()">
                <lucide-icon [img]="EditIcon" [size]="16" aria-hidden="true" />
                Editar
              </button>
            </span>
          </div>
        }
      }
      <!-- a Ajuda: todas as marcas, em partes (como a lista de atalhos do Docs), com o jeito de escrever
           cada uma e o atalho de teclado -->
      @if (guide() === big) {
        <div class="painel guia" [id]="areaId + '-guia'" role="region" aria-label="Ajuda: como escrever" (keydown.escape)="closeGuide($event, area)">
          <div class="painel-topo">
            <p class="painel-titulo">Como escrever</p>
            <button type="button" class="painel-fechar" aria-label="Fechar a ajuda" title="Fechar" (click)="closeGuide(null, area)"><lucide-icon [img]="CloseIcon" [size]="17" aria-hidden="true" /></button>
          </div>
          <!-- a lista vem num pedaço à parte, quando a Ajuda abre pela primeira vez -->
          @defer {
            <app-markup-guide [noteLinks]="!!notes()" [idPrefix]="areaId + '-guia'" [visual]="visual()" />
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
                <button type="button" class="painel-fechar" aria-label="Fechar" title="Fechar" (click)="closeLink(area)"><lucide-icon [img]="CloseIcon" [size]="17" aria-hidden="true" /></button>
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
                        <lucide-icon [img]="ChosenIcon" [size]="16" aria-hidden="true" />
                        <span>{{ metaOf(n) || 'Sua anotação' }}</span>
                      } @else {
                        <lucide-icon [img]="PlusIcon" [size]="16" aria-hidden="true" />
                        <span>Ainda não existe: abra o link depois para criar</span>
                      }
                    </p>
                  } @else {
                    <ng-container *ngTemplateOutlet="eloLista" />
                  }
                </div>
              </div>
              <div class="painel-acoes">
                @if (visual() && k.swap) {
                  <span class="painel-mais">
                    <button type="button" class="acao-caneta" (click)="unlink()"><lucide-icon [img]="UnlinkIcon" [size]="16" aria-hidden="true" />Tirar o link</button>
                  </span>
                }
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
            <lucide-icon [img]="PlusIcon" [size]="16" aria-hidden="true" />
            <span class="elo-nome">Link para “{{ t }}”</span>
            <span class="elo-meta">a anotação ainda não existe: abra o link depois para criar</span>
          </li>
        }
        @if (!linkOptions().length && !newLink()) {
          <li class="elos-vazio" role="presentation">{{ notes()!.length ? 'Nenhuma anotação com esse título.' : 'Você ainda não tem outras anotações. Escreva um título para criar o link.' }}</li>
        }
      </ul>
    </ng-template>

    <!-- os estilos do parágrafo (no "Formatar"): cada um escrito do jeito que fica, com o tique no da
         linha do cursor -->
    <ng-template #estilos let-area="area" let-big="big">
      @for (s of styles; track s.value) {
        <button
          type="button"
          role="menuitemradio"
          tabindex="-1"
          class="menu-op estilo-op"
          [attr.aria-checked]="styleNow() === s.value"
          (pointerdown)="$event.preventDefault()"
          (pointerenter)="$any($event.currentTarget).focus()"
          (click)="pickStyle(area, s.value)"
        >
          <lucide-icon [img]="s.icon" [size]="17" aria-hidden="true" />
          <span class="menu-op-nome" [attr.data-estilo]="s.value">{{ s.name }}</span>
          @if (styleNow() === s.value) {
            <lucide-icon class="marcado" [img]="ChosenIcon" [size]="16" aria-hidden="true" />
          }
        </button>
      }
    </ng-template>

    <ng-container *ngTemplateOutlet="campo; context: { big: false }" />

    <!-- a folha do widget: vem num pedaço à parte, quando um widget é posto ou editado -->
    @if (widgetSheet() && widgetPick(); as w) {
      @defer (on immediate) {
        <app-widget-sheet
          [start]="{ name: w.name, values: w.values }"
          [swap]="w.swap"
          [onCard]="onCard()"
          [stock]="stock()"
          [links]="previewLinks()"
          [notes]="notes()"
          [selfId]="selfId()"
          (done)="onWidgetDone($event)"
          (removed)="onWidgetRemoved()"
          (closed)="onWidgetClosed()"
        />
      }
    }

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

    /* ===== O alto da folha, como nos editores de sempre: as abas "Visual" e "Markdown" à
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
    /* o Visual em teste: o carimbo de caneta azul (styles.scss), miúdo ao lado do nome */
    .em-teste {
      padding: 0 4px;
      border-width: 1.5px;
      font-size: 0.6rem;
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
    /* ligado (a marca vale onde está o cursor): o botão apertado do site (o chip da pasta, em
       _paper-kit.scss), em tinta cheia com o desenho no papel, torto de leve */
    .ferramenta[aria-pressed='true'] {
      background: var(--ink);
      color: var(--paper);
      rotate: -2deg;
      box-shadow:
        0 1px 2px rgb(0 0 0 / 0.3),
        0 3px 6px -3px rgb(0 0 0 / 0.35);
      transition:
        background-color var(--t-ui) var(--ease-ui),
        rotate var(--t-physical) var(--ease-physical);
    }
    @media (prefers-reduced-motion: reduce) {
      .ferramenta[aria-pressed='true'] {
        rotate: 0deg;
      }
    }
    /* o que o Visual ainda não sabe pôr: apagado, e o toque diz para usar o Markdown */
    .apagado {
      opacity: 0.4;
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

    /* ===== A régua: os dois menus com nome ("Formatar", "Inserir") e os botões de sempre, numa linha
       só ===== */
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

    /* Sem lugar, os botões que também estão nos menus saem da régua (como a régua do Docs): primeiro o
       riscado, o marca-texto e o link de anotação; depois o link (Ctrl+K). Nada some: tudo continua no
       "Formatar" e no "Inserir" (desfazer e refazer, que não estão neles, nunca saem). Os cortes têm
       folga sobre a medida da régua (medida: uns 700px com tudo, 590 sem os primeiros, 540 sem o
       link), para a letra e o zoom de cada computador */
    @container folha (max-width: 739px) {
      .ferramenta.extra {
        display: none;
      }
    }
    @container folha (max-width: 629px) {
      .link,
      .link-fio {
        display: none;
      }
    }
    @container folha (max-width: 599px) {
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
    @container folha (max-width: 579px) {
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
    .regua.presa .menus-fio {
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

    /* ===== O Visual (ver ui/visual-editor/): a folha dele desenha a pauta. Enquanto ele chega (a
       primeira vez), o texto pela leitura, na mesma folha, no mesmo tamanho ===== */
    .visual {
      display: flex;
      flex-direction: column;
    }
    .visual[hidden] {
      display: none;
    }
    .visual > app-visual-editor {
      flex: 1 0 auto;
    }
    .visual.grande,
    .visual.grande > app-visual-editor {
      flex: 1 1 auto;
      min-height: 0;
    }
    .visual-chegando {
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
    .visual-chegando.grande {
      --line: 2rem;
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
      padding: 4px 18px;
      font-size: 1.3rem;
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
    /* no Visual, o link tocado: "Abrir" e "Tirar o link" do outro lado, longe do "Trocar" */
    .painel-mais {
      display: flex;
      flex-wrap: wrap;
      gap: 0 14px;
      margin-right: auto;
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
      /* o "Abrir" e o "Tirar o link" numa fileira só deles, em cima do "Cancelar" e do "Trocar" */
      .painel-acoes:has(.painel-mais) {
        flex-wrap: wrap;
      }
      .painel-mais {
        flex-basis: 100%;
      }
    }
    @media (pointer: coarse) {
      .elo-op {
        padding-block: 11px;
      }
    }
    /* ===== O widget tocado na folha: uma tirinha só, com o desenho, o nome, o que ele mostra e as duas
       ações (Tirar, à caneta; Editar, a etiqueta de tinta), como o menu de um bloco nos editores ===== */
    .widget-tira {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 14px;
      padding: 8px 10px 8px 14px;
      container: tira / inline-size;
    }
    .widget-tira-icone {
      flex: none;
      display: inline-flex;
    }
    /* a largura dele não conta para a da folha: o resumo comprido corta com reticências, nunca alarga o editor */
    .widget-tira-texto {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      flex: 1 1 10rem;
      min-width: 0;
      gap: 1px;
      contain: inline-size;
    }
    .widget-tira-nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .widget-tira-resumo {
      overflow: hidden;
      font-family: var(--f-hand);
      font-size: 1.04rem;
      line-height: 1.25;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--ink-2);
    }
    /* as duas ações juntas: sem lugar ao lado do nome, descem inteiras, à direita */
    .widget-tira-acoes {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-left: auto;
    }
    .widget-tira-tirar,
    .widget-tira-editar {
      flex: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 44px;
    }
    .widget-tira-tirar {
      color: var(--red-deep);
    }

    /* ===== Os menus ("Formatar", "Inserir"): um cartão de papel que cai do botão, por cima
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
    [data-estilo='sutil'] {
      font-size: 0.84em;
      opacity: 0.64;
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
    .guardando {
      flex: none;
      margin: 4px 2px 0;
      font-family: var(--f-ui);
      font-size: 0.8rem;
      color: var(--ink-2);
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
      .visual-chegando:not(.grande) {
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
    .papel > .visual.grande {
      min-height: 5rem;
    }

    /* ===== Enchendo o lugar (ver \`fill\`): a folha vai até embaixo, sem alça de esticar ===== */
    :host(.encher) {
      display: flex;
      flex-direction: column;
    }
    :host(.encher) > .papel:not(.grande) {
      display: flex;
      flex: 1 0 auto;
      flex-direction: column;
    }
    :host(.encher) > .papel > textarea:not(.grande),
    :host(.encher) > .papel > .visual:not(.grande) {
      flex: 1 0 auto;
      min-height: calc(var(--line) * 6 + 8px);
      max-height: none;
      resize: none;
    }
    :host(.encher) .visual-chegando:not(.grande) {
      flex: 1 0 auto;
      max-height: none;
    }
  `,
})
export class RichEditor {
  readonly value = model('');
  /** O máximo de caracteres (com o contador embaixo da folha); sem ele, nem limite nem contador. */
  readonly max = input<number | null>(null);
  /**
   * Colar um texto com a imagem de outra pessoa guarda uma cópia sua (o padrão: o seu mural, o perfil).
   * Na anotação compartilhada, não: quem está nela já vê a imagem de quem também está. No comentário,
   * também não: a cópia sua não apareceria para quem lê.
   */
  readonly copyTheirImages = input(true);
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
  /**
   * A folha enche o lugar que o pai der (o pai em coluna, com altura): a anotação, que é quase só o
   * texto, vai até o pé da página. Cresce com o texto; passou, quem rola é a página, não a folha.
   */
  readonly fill = input(false);

  /** Em qual folha a régua está presa em cima do teclado (null: no alto da folha, como sempre). */
  protected readonly docked = signal<boolean | null>(null);
  protected readonly DoneIcon = ICON.pronto;
  private readonly dockMedia = typeof matchMedia === 'function' ? matchMedia(DOCK_MEDIA) : null;

  constructor() {
    watchVisualViewport();
    // aberto no Visual: a folha do Markdown fica no texto de quando ele abriu (ver `areaFrozen`)
    effect(() => {
      if (this.visual() && this.areaFrozen() === null) this.areaFrozen.set(untracked(this.value));
    });
  }

  protected readonly LinkIcon = ICON.linkNota;
  protected readonly UrlIcon = ICON.link;
  protected readonly PlusIcon = ICON.adicionar;
  protected readonly StrikeIcon = ICON.riscado;
  protected readonly MarkIcon = ICON.marcaTexto;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly HelpIcon = ICON.ajuda;
  protected readonly FormatIcon = ICON.letra;

  /**
   * O painel do link para um endereço: o trecho que ele vai ocupar, o texto e o endereço (`swap`: o
   * link que já estava lá, que ele troca).
   */
  protected readonly urlLink = signal<{ big: boolean; start: number; end: number; text: string; url: string; swap?: boolean } | null>(null);
  /** O endereço do painel serve (com "https://" se faltou). */
  protected readonly urlOk = computed(() => !!this.urlHref());
  /** O endereço do painel como vai para o link (no Visual, os espaços em %20 e os parênteses sem par escapados). */
  protected readonly urlHref = computed(() => {
    const url = this.urlLink()?.url ?? '';
    return this.visual() ? linkHref(url) : normalizeUrl(url);
  });
  protected readonly OpenIcon = ICON.abrirFora;
  protected readonly UnlinkIcon = ICON.tirarLink;

  /** O painel que acabou de abrir entra na tela (no celular, a régua pode já ter saído dela). */
  private showPanel(selector: string): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  // ===== Os menus: "Formatar" e "Inserir" =====

  /** As marcas do texto, no "Formatar" (o nome vai escrito do jeito que fica), com o atalho. */
  protected readonly textMarks: readonly { act: Action; icon: LucideIconData; keys: string; aria: string | null }[] = [
    { act: 'bold', icon: ICON.negrito, keys: 'Ctrl+B', aria: 'Control+B' },
    { act: 'italic', icon: ICON.italico, keys: 'Ctrl+I', aria: 'Control+I' },
    { act: 'strike', icon: ICON.riscado, keys: 'Ctrl+Shift+X', aria: 'Control+Shift+X' },
    { act: 'mark', icon: ICON.marcaTexto, keys: 'Ctrl+Shift+H', aria: 'Control+Shift+H' },
    { act: 'spoiler', icon: ICON.esconder, keys: '', aria: null },
    { act: 'subtle', icon: ICON.sutil, keys: '', aria: null },
    { act: 'code', icon: ICON.codigo, keys: 'Ctrl+E', aria: 'Control+E' },
  ];
  protected readonly InsideIcon = ICON.dentro;
  /** As listas: no "Formatar" e na régua, com os atalhos do Docs. */
  protected readonly lists: readonly { act: ListKind; name: string; icon: LucideIconData; keys: string; aria: string }[] = [
    { act: 'check', name: 'Tarefas', icon: ICON.tarefas, keys: 'Ctrl+Shift+9', aria: 'Control+Shift+9' },
    { act: 'ul', name: 'Lista', icon: ICON.lista, keys: 'Ctrl+Shift+8', aria: 'Control+Shift+8' },
    { act: 'ol', name: 'Lista numerada', icon: ICON.listaNumerada, keys: 'Ctrl+Shift+7', aria: 'Control+Shift+7' },
  ];
  /** Os estilos do parágrafo. */
  protected readonly styles: readonly { value: LineStyle; name: string; icon: LucideIconData }[] = [
    { value: 'texto', name: 'Texto normal', icon: ICON.paragrafo },
    { value: 't1', name: 'Título 1', icon: ICON.titulo1 },
    { value: 't2', name: 'Título 2', icon: ICON.titulo2 },
    { value: 't3', name: 'Título 3', icon: ICON.titulo3 },
    { value: 'citacao', name: 'Citação', icon: ICON.aspas },
    { value: 'sutil', name: 'Texto sutil', icon: ICON.sutil },
    { value: 'codigo', name: 'Bloco de código', icon: ICON.blocoDeCodigo },
  ];
  /** O que o "Inserir" tem antes dos widgets (o link para outra anotação, só onde ele abre alguma). */
  protected readonly inserts = computed(() => {
    const all: { act: Action; name: string; icon: LucideIconData; keys: string; aria: string | null; typed: string }[] = [
      { act: 'url', name: 'Link para um endereço', icon: ICON.link, keys: 'Ctrl+K', aria: 'Control+K', typed: '' },
      { act: 'note', name: 'Link para outra anotação', icon: ICON.linkNota, keys: '', aria: null, typed: '[[' },
      { act: 'rule', name: 'Divisória', icon: ICON.tirar, keys: '', aria: null, typed: '---' },
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
   * Abre um menu. Pelo teclado, o foco vai para o primeiro item; pelo mouse, fica no menu (sem marcar
   * nenhum de cara), e as setas, Esc e Tab já valem.
   */
  protected openMenu(name: MenuName, big: boolean, first: boolean): void {
    this.menuByKeyboard = first;
    this.closePanels();
    this.menu.set({ name, big });
    setTimeout(() => {
      const menu = this.host.nativeElement.querySelector<HTMLElement>('.menu');
      (first ? this.menuItems()[0] : menu)?.focus({ preventScroll: true });
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
    if (this.visual()) return this.visualAct(big, what);
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
      case 'subtle':
        return this.wrap(area, '((', '))');
      case 'code':
        return this.code(area);
      case 'url':
        return this.startUrl(area, big);
      case 'note':
        return this.startLink(area, big);
      case 'rule':
        return this.rule(area);
      case 'inside':
        return this.lineInItem(area);
      default:
        return this.list(area, what);
    }
  }

  // ===== Desfazer e refazer =====

  protected readonly UndoIcon = ICON.desfazer;
  protected readonly RedoIcon = ICON.refazer;

  /**
   * Desfazer e refazer da régua: os do próprio navegador (o Ctrl+Z e o Ctrl+Y), que já guardam cada
   * marca posta pela régua (ver `replace`). O campo avisa a mudança pelo `input` de sempre.
   */
  protected history(area: HTMLTextAreaElement, what: 'undo' | 'redo'): void {
    this.menu.set(null);
    if (this.visual()) return this.visualAct(this.big(), what);
    area.focus();
    document.execCommand(what);
    this.track(area);
  }

  // ===== O estilo do parágrafo =====

  /** O estilo da linha do cursor: o "Formatar" marca qual é. */
  protected readonly lineStyle = signal<LineStyle>('texto');

  /** O cursor andou (ou o texto mudou): o estilo da linha dele. */
  protected track(area: HTMLTextAreaElement): void {
    const style = styleAt(area.value, area.selectionStart);
    this.lineStyle.set(style);
    // no bloco de código, o que está escrito é só texto: nenhuma marca vale
    const m = style === 'codigo' ? { marks: [], list: null } : marksAt(area.value, area.selectionStart);
    const was = this.markdownMarks();
    if (m.list !== was.list || m.marks.join() !== was.marks.join()) this.markdownMarks.set(m);
  }

  /** As marcas e a lista no cursor do Markdown: os botões da régua afundam como no Visual. */
  protected readonly markdownMarks = signal<ReturnType<typeof marksAt>>({ marks: [], list: null });

  protected pickStyle(area: HTMLTextAreaElement, style: LineStyle): void {
    this.menu.set(null);
    if (this.visual()) return this.visualAct(this.big(), { estilo: style });
    this.setStyle(area, style);
  }

  /**
   * Troca o estilo das linhas da seleção (ou da linha do cursor), como os estilos do Word:
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
      const bare = l.replace(QUOTE_MARK, '').replace(SUBTLE_MARK, '').replace(HEADING_MARK, '');
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

  /** As abas: as setas do lado (e Home, End) trocam entre o Visual e o Markdown. */
  protected onTabKey(e: KeyboardEvent, big: boolean): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const visual = e.key === 'Home' ? true : e.key === 'End' ? false : !this.visual();
    this.switchMode(visual, big, undefined, false);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`#${this.areaId}${visual ? '-aba-visual' : '-aba-markdown'}${big ? '-g' : ''}`)?.focus());
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
  protected readonly ChosenIcon = ICON.pronto;

  /** Os links na folha do Visual e nas prévias: mostram se a anotação existe, mas não abrem nada. */
  protected readonly previewLinks = computed<NoteLinks | null>(() => {
    const notes = this.notes();
    return notes ? { resolve: (title) => resolveNote(notes, title) } : null;
  });

  protected metaOf(n: Review): string {
    const cat = n.category;
    const when = n.completedAt ? formatReviewDate(n.completedAt) : '';
    return [cat, when].filter(Boolean).join(' · ');
  }

  protected readonly BoldIcon = ICON.negrito;
  protected readonly ItalicIcon = ICON.italico;
  protected readonly GrowIcon = ICON.aumentar;
  protected readonly ShrinkIcon = ICON.diminuir;

  protected readonly VisualIcon = ICON.documento;
  protected readonly MarkdownIcon = ICON.markdown;

  /** A tela inteira está aberta. */
  protected readonly big = signal(false);
  /** O mesmo, com outro nome no molde (lá, `big` é de qual das folhas se fala). */
  protected readonly bigOpen = this.big;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('grande');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Onde estava o cursor (no texto), para a folha que recebe o foco continuar do mesmo ponto. */
  private caret: [number, number] = [0, 0];

  // ===== Os dois jeitos de escrever: o Visual e o Markdown =====

  private readonly settings = inject(Settings);
  /**
   * Escrevendo no Visual (vendo como fica) ou no Markdown (as marcas à vista). Abre como os Ajustes
   * mandam (o "Jeito de escrever", por aparelho); trocar de aba vale só para este editor, até ele abrir
   * outra ficha (como no Docs, a preferência não muda por um clique).
   */
  protected readonly visual = signal(this.settings.writingMode() === 'visual');
  /** O Visual já abriu alguma vez: ele fica (escondido no Markdown), com o desfazer dele. */
  protected readonly visualOpened = signal(this.visual());
  /** O que o Visual conta para a régua: as marcas ligadas, o estilo da linha. */
  protected readonly visualState = signal<EstadoVisual>(ESTADO_VAZIO);
  /** As duas folhas do Visual (a pequena e a da tela inteira), quando já chegaram. */
  private readonly visuals = new Map<boolean, VisualApi>();
  /** O que fazer com a folha do Visual quando ela chegar (a seleção do texto, o foco). */
  private visualPending: { big: boolean; sel: [number, number]; focus: boolean } | null = null;
  /**
   * O texto do Markdown enquanto o Visual está aberto: o de quando ele saiu (pôr o valor por fora a
   * cada tecla apagaria o desfazer do navegador). Na volta, o que mudou entra por um `insertText`, e o
   * Ctrl+Z do Markdown desfaz o que o Visual fez de uma vez. Null: ele acompanha o texto.
   */
  private readonly areaFrozen = signal<string | null>(null);
  protected readonly areaValue = computed(() => this.areaFrozen() ?? this.value());
  protected readonly NOT_YET = NOT_YET;

  /** O estilo do parágrafo da linha do cursor, no jeito que está à mostra. */
  protected readonly styleNow = computed<LineStyle | null>(() => (this.visual() ? this.visualState().estilo : this.lineStyle()));

  /** O botão da lista está afundado: a linha do cursor é dela (no Visual e no Markdown). */
  protected listPressed(kind: ListKind): boolean {
    return this.visual() ? this.visualState().lista === kind : this.markdownMarks().list === kind;
  }

  /** O botão da marca está ligado: ela vale onde está o cursor (no Visual e no Markdown). */
  protected pressed(mark: MarcaVisual): boolean {
    return this.visual() ? this.visualState().marcas.includes(mark) : this.markdownMarks().marks.includes(mark);
  }

  private visualOf(big: boolean): VisualApi | null {
    const v = this.visuals.get(big);
    return v?.host.isConnected ? v : null;
  }

  /** A folha do Visual chegou: guardada, e o que esperava por ela (a seleção, o foco) acontece. */
  protected onVisualReady(api: VisualApi, big: boolean): void {
    this.visuals.set(big, api);
    const p = this.visualPending;
    if (p?.big === big && this.visual()) {
      this.visualPending = null;
      api.poeSelecao(...p.sel);
      if (p.focus) api.focus();
    }
  }

  /**
   * Troca de aba, com o cursor e a seleção no mesmo lugar do texto (`sel`: onde abrir, quando quem
   * pede é um trecho cru do Visual). Para o Markdown, a folha aparece e recebe o que o Visual mudou.
   */
  protected switchMode(visual: boolean, big: boolean, sel?: [number, number], focus = true): void {
    if (this.visual() === visual) return;
    this.menu.set(null);
    this.closePanels();
    if (visual) {
      const area = this.areaOf(big);
      const at: [number, number] = sel ?? (area ? [area.selectionStart, area.selectionEnd] : [0, 0]);
      this.areaFrozen.set(area?.value ?? this.value());
      this.visualOpened.set(true);
      this.visual.set(true);
      const api = this.visualOf(big);
      if (api) {
        // a folha volta a valer no próximo desenho (com o texto de agora): depois, a seleção
        setTimeout(() => {
          api.poeSelecao(...at);
          if (focus) api.focus();
        });
      } else this.visualPending = { big, sel: at, focus };
      return;
    }
    const at = sel ?? this.visualOf(big)?.selecaoNoTexto() ?? [this.value().length, this.value().length];
    this.visual.set(false);
    setTimeout(() => {
      const area = this.areaOf(big);
      if (!area) return;
      // o insertText só vale com a folha à mostra e com o foco
      const back = document.activeElement as HTMLElement | null;
      area.focus({ preventScroll: true });
      if (area.value !== this.value()) this.replaceAll(area, this.value(), at[0]);
      this.areaFrozen.set(null);
      area.setSelectionRange(at[0], at[1]);
      this.track(area);
      if (!focus) back?.focus();
    });
  }

  /** O que o Visual ainda não sabe fazer: um aviso curto, e a aba Markdown à mão. */
  private notYet(): void {
    this.toasts.show(NOT_YET);
  }

  /** O que a régua pede, no Visual (o que ele ainda não sabe, avisa). */
  private visualAct(big: boolean, what: AcaoVisual | Action): void {
    const api = this.visualOf(big);
    if (what === 'url' || what === 'note') {
      // o painel do link: o Visual diz o que vai nele (o link de agora, ou a seleção), pelo pedeLink
      if (what === 'note' && this.linking() && !this.linking()!.auto) return this.closeLink();
      return api?.pedeLinkAqui(what === 'url' ? 'url' : 'elo');
    }
    const ok = typeof what === 'object' || (VISUAL_ACTS as readonly string[]).includes(what);
    if (!api || !ok || !api.run(what as AcaoVisual)) this.notYet();
  }

  /** As teclas que a folha do Visual deixa passar: a Ajuda, e as do que ele ainda não sabe fazer. */
  protected onVisualKey(e: KeyboardEvent, big: boolean): void {
    const field = (e.target as Element | null)?.closest?.('input.campo-peca');
    // o Tab com o widget selecionado (ou do campo da legenda dele): a tirinha, com o Editar e o Tirar
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.defaultPrevented && this.visualState().peca && this.widgetPick()) {
      const edit = this.host.nativeElement.querySelectorAll<HTMLElement>('.widget-tira-editar');
      const button = Array.from(edit).find((b) => !!b.closest('.tela-cheia') === big);
      if (button) {
        e.preventDefault();
        button.focus();
        return;
      }
    }
    // o que se escreve no campo da legenda (ou do título) dentro de um widget é dele
    if (field) return;
    // a lista do "[[" aberta: as setas, o Enter, o Tab e o Esc são dela (o Visual os deixou passar)
    if (this.linking()?.auto && this.onListKey(e)) return;
    // o painel aberto pelo clique num link (com o cursor ainda na folha): o Esc fecha só ele
    if (e.key === 'Escape' && this.passive && this.panelRange()) {
      e.preventDefault();
      e.stopPropagation();
      this.closePanels();
      return;
    }
    if (e.key === 'Escape' && this.guide() !== null) {
      e.preventDefault();
      e.stopPropagation();
      this.guide.set(null);
      return;
    }
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    if (mod && !e.shiftKey && (e.key === '/' || e.code === 'Slash')) {
      e.preventDefault();
      this.toggleGuide(big);
    } else if (mod && e.shiftKey && LIST_KEYS[e.code]) {
      // Ctrl+Shift+7, 8 e 9: as listas nas linhas da seleção (pela tecla, como no Markdown)
      e.preventDefault();
      this.visualAct(big, LIST_KEYS[e.code]);
    }
  }

  /**
   * O que o Visual conta: a régua acende; o "[[" antes do cursor abre (e filtra) a lista das anotações,
   * como o `watchLink` do Markdown; o cursor saiu do link do painel passivo, ele fecha.
   */
  protected onVisualState(est: EstadoVisual, big: boolean): void {
    this.visualState.set(est);
    // o painel passivo de um link: o cursor saiu dele, ele fecha (o do widget, a seleção da peça decide)
    const link = this.urlLink() ?? this.linking();
    if (this.passive && link && link.start !== est.link) this.closePanels();
    this.showVisualPiece(est, big);
    if (!this.notes()) return;
    const k = this.linking();
    if (k && !k.auto) return;
    const c = est.colchetes;
    if (!c || c.de === this.dismissedAt) {
      // o "[[" fechado com Esc saiu de antes do cursor: o próximo abre a lista de novo
      if (!c) this.dismissedAt = -1;
      if (k) this.linking.set(null);
      return;
    }
    if (!k || k.start !== c.de) this.active.set(0);
    this.linking.set({ auto: true, big, start: c.de, end: c.de + 2 + c.busca.length, query: c.busca });
  }

  /**
   * O Visual pediu o painel de um link (o Ctrl+K, a régua, um clique num link): o mesmo painel do
   * Markdown, com o que o Visual mandou. O trecho mora no Visual (ele acompanha o texto); aqui, `start`
   * é só onde ele começa, para o painel passivo saber quando o cursor saiu.
   */
  protected onVisualLink(p: PedidoLink, big: boolean): void {
    this.closePanels();
    if (p.tipo === 'url') {
      this.urlLink.set({ big, start: p.de, end: p.de, text: p.texto, url: p.href, swap: p.troca });
      this.passive = p.passivo;
      if (!p.passivo) setTimeout(() => this.panelInput(big, p.texto && !p.href ? 'input' : '.url-campo')?.focus());
      this.showPanel('.url-painel');
      return;
    }
    const notes = this.notes();
    if (!notes) return;
    if (p.troca) {
      const title = resolveNote(notes, p.titulo)?.game.name ?? p.titulo;
      // o texto só vem quando é outro: trocar a anotação não leva o título de antes
      const label = linkKey(p.rotulo) === linkKey(p.titulo) ? '' : p.rotulo;
      this.linking.set({ auto: false, big, start: p.de, end: p.de, query: title, label, chosen: title, swap: true });
    } else {
      const same = p.rotulo ? resolveNote(notes, p.rotulo) : null;
      this.linking.set({ auto: false, big, start: p.de, end: p.de, query: same?.game.name ?? p.rotulo, label: p.rotulo, chosen: same?.game.name ?? null });
    }
    this.active.set(0);
    this.passive = p.passivo;
    if (!p.passivo)
      setTimeout(() => {
        const search = this.panelInput(big, '.elos-campo');
        search?.focus();
        search?.select();
      });
    this.showPanel('.elo-painel');
  }

  /** "Tirar o link" do painel (no Visual): o texto fica, sem o link. */
  protected unlink(): void {
    const big = (this.urlLink() ?? this.linking())?.big ?? false;
    this.closePanels();
    this.visualOf(big)?.tiraLink();
  }

  /**
   * Colou no Visual: a imagem sozinha o próprio Visual recebe (com o marcador, ver `putVisualImage`); o
   * texto com a imagem de outra pessoa entra pelo Visual, e a imagem vira uma cópia sua depois (como no
   * Markdown, `adoptImages`).
   */
  protected onVisualPaste(e: ClipboardEvent, big: boolean): void {
    if ((e.target as Element | null)?.closest?.('input.campo-peca')) return;
    const raw = e.clipboardData?.getData('text/plain') ?? '';
    const ids = this.copyTheirImages() ? localImageIds(raw) : [];
    if (ids.length) void this.adoptImages(ids, (from, to) => this.visualOf(big)?.trocaImagem(from, to) ?? false);
  }

  /** Soltou um arquivo que não é imagem (a imagem, o Visual recebe): não abre por cima do Murall. */
  protected onVisualDrop(e: DragEvent): void {
    if (!e.defaultPrevented && e.dataTransfer?.files.length) e.preventDefault();
  }

  /** A imagem colada ou solta no Visual: encolhida e guardada, ela entra no marcador do lugar dela. */
  protected async putVisualImage(big: boolean, order: ImagemVisual): Promise<void> {
    this.savingImage.set(true);
    try {
      const image = await this.images.add(order.arquivo);
      this.visualOf(big)?.poeImagem(order.marca, localImageUrl(image.id));
    } catch (error) {
      this.visualOf(big)?.tiraMarca(order.marca);
      this.toasts.show(error instanceof ImageProblem ? error.message : 'A imagem não entrou. Tente de novo.');
    } finally {
      this.savingImage.set(false);
    }
  }

  /**
   * O widget selecionado no Visual: a tirinha passiva dele (como o toque na linha do widget no Markdown);
   * a seleção saiu dele, ela fecha. Com a folha do widget aberta, nada muda (ela é dele).
   */
  private showVisualPiece(est: EstadoVisual, big: boolean): void {
    if (this.widgetSheet()) return;
    const p = est.peca;
    if (!p) {
      if (this.widgetPick()?.big === big && this.passive) {
        this.passive = false;
        this.widgetPick.set(null);
      }
      return;
    }
    const known = widgetDef(p.nome);
    if (!known) return;
    const w = this.widgetPick();
    const values = { ...known.read(p.args), size: p.tamanho };
    if (w && w.big === big && w.start === p.de && w.name === known.name && JSON.stringify(w.values) === JSON.stringify(values)) return;
    this.urlLink.set(null);
    if (this.linking() && !this.linking()!.auto) this.linking.set(null);
    this.widgetPick.set({ big, name: known.name, values, start: p.de, end: p.de, swap: true });
    this.passive = true;
  }

  /** "Pronto" (a régua presa no celular): o teclado fecha. */
  protected blurSheet(area: HTMLTextAreaElement, big: boolean): void {
    if (this.visual()) this.visualOf(big)?.blur();
    else area.blur();
  }

  /** A folha pequena recebe o foco (o "Falta…" do editor, o rótulo clicado), no jeito que está à mostra. */
  focus(): void {
    if (!this.visual()) {
      this.host.nativeElement.querySelector<HTMLTextAreaElement>(`#${this.areaId}`)?.focus();
      return;
    }
    const api = this.visualOf(false);
    if (api) api.focus();
    else this.visualPending = { big: false, sel: [this.value().length, this.value().length], focus: true };
  }

  /** O editor abre outra ficha: a aba volta a ser a dos Ajustes, e o resto, ao começo. */
  reset(): void {
    this.visual.set(this.settings.writingMode() === 'visual');
    if (this.visual()) this.visualOpened.set(true);
    this.areaFrozen.set(null);
    this.visualPending = null;
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
    // para a folha (a do Markdown ou a do Visual), ela continua presa
    const sheet = this.visual() ? (e.currentTarget as HTMLElement).parentElement?.querySelector('.visual') : area;
    if (!sheet?.contains(to) && !(e.currentTarget as HTMLElement).contains(to)) this.docked.set(null);
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
    if (k && this.visual()) {
      // no Visual, o link entra no lugar do "[[" (ou do trecho do painel); um título com colchete ou "|" não cabe num link
      const label = k.auto ? '' : (k.label ?? '').replace(/[[\]|]/g, '').replace(/\s+/g, ' ').trim();
      this.linking.set(null);
      this.passive = false;
      if (/[[\]|]/.test(title)) return this.toasts.show('Um título com [, ] ou | não cabe num link');
      this.visualOf(k.big)?.poeElo(title, label && linkKey(label) !== linkKey(title) ? label : title, k.auto);
      return;
    }
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
    if (this.visual()) {
      this.passive = false;
      if (k && !k.auto) this.visualOf(k.big)?.voltaAoTrecho();
      return;
    }
    if (k && !k.auto && area) {
      area.focus();
      area.setSelectionRange(k.start, k.end);
    }
  }

  private areaOf(big: boolean): HTMLTextAreaElement | null {
    return this.host.nativeElement.querySelector<HTMLTextAreaElement>(big ? `#${this.areaId}-grande` : `#${this.areaId}`);
  }

  protected grow(area: HTMLTextAreaElement): void {
    this.caret = this.visual() ? (this.visualOf(false)?.selecaoNoTexto() ?? [0, 0]) : [area.selectionStart, area.selectionEnd];
    this.big.set(true);
    this.dialog().nativeElement.showModal();
    // a folha grande nasce no próximo desenho: o foco vai para ela, no mesmo ponto do texto
    if (this.visual()) this.visualAt(true, this.caret);
    else setTimeout(() => this.focusAt(`#${this.areaId}-grande`));
  }

  /** A folha do Visual recebe o foco no ponto dado do texto (quando chegar, se ainda não chegou). */
  private visualAt(big: boolean, sel: [number, number]): void {
    const api = this.visualOf(big);
    if (!api) {
      this.visualPending = { big, sel, focus: true };
      return;
    }
    setTimeout(() => {
      api.poeSelecao(...sel);
      api.focus();
    });
  }

  protected shrink(): void {
    this.dialog().nativeElement.close();
  }

  protected onClosed(): void {
    const big = this.host.nativeElement.querySelector<HTMLTextAreaElement>(`#${this.areaId}-grande`);
    const visual = this.visual() ? this.visualOf(true) : null;
    if (visual) this.caret = visual.selecaoNoTexto();
    else if (big && !this.visual()) this.caret = [big.selectionStart, big.selectionEnd];
    this.big.set(false);
    this.docked.set(null);
    // a folha pequena do Visual volta a valer com o texto da grande (o histórico fica com a grande:
    // a mesma folha nas duas é da rodada 8)
    if (this.visual()) this.visualAt(false, this.caret);
    else this.focusAt(`#${this.areaId}`);
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
    } else if (e.key === 'Tab' && !mod && !e.altKey) {
      this.indentKey(e, area);
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
    const w = this.tableAt(text, at) ? { name: 'tabela' } : parseWidgetLine(line);
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
    const href = this.urlHref();
    if (!u || !href) return;
    const label = u.text.replace(/[[\]]/g, '').trim();
    if (this.visual()) {
      this.urlLink.set(null);
      this.passive = false;
      this.visualOf(u.big)?.poeLink(label, href);
      return;
    }
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
    if (u && this.visual()) {
      this.passive = false;
      this.visualOf(u.big)?.voltaAoTrecho();
    } else if (u) {
      area.focus();
      area.setSelectionRange(u.start, u.end);
    }
  }

  /**
   * Colou um endereço com um texto selecionado: o texto vira o link. Colou uma imagem (sem texto junto:
   * as células copiadas de uma planilha também trazem a foto delas, e o que vale ali é o texto): ela é
   * encolhida, guardada e vira o widget de imagem numa linha só dela. Colou um texto com a imagem de
   * outra pessoa (copiado de uma compartilhada): o texto entra como sempre, na hora, e depois a imagem
   * vira uma cópia sua (`adoptImages`), onde ela precisa ser sua (ver `copyTheirImages`).
   */
  protected onPaste(e: ClipboardEvent, area: HTMLTextAreaElement): void {
    const raw = e.clipboardData?.getData('text/plain') ?? '';
    const pasted = raw.trim();
    const file = pasted ? null : imageFileOf(e.clipboardData);
    if (file) {
      e.preventDefault();
      void this.putImage(area, file);
      return;
    }
    const ids = this.copyTheirImages() ? localImageIds(raw) : [];
    // o texto entra pelo colar do navegador; as imagens de outra pessoa trocam de id quando a cópia fica pronta
    if (ids.length) void this.adoptImages(ids, (from, to) => swapAddress(area, from, to));
    const sel = area.value.slice(area.selectionStart, area.selectionEnd);
    if (!sel.trim() || sel.includes('\n') || !/^(https?:\/\/|mailto:)\S+$/i.test(pasted)) return;
    e.preventDefault();
    const piece = `[${sel.trim().replace(/[[\]]/g, '')}](${pasted})`;
    const start = area.selectionStart;
    this.replace(area, start, area.selectionEnd, piece, start + piece.length, start + piece.length);
  }

  /** Arrastando um arquivo por cima da folha: ela aceita (sem isto, o navegador abriria o arquivo). */
  protected onDragOver(e: DragEvent): void {
    if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault();
  }

  /** Soltou uma imagem na folha: vira o widget de imagem, como colada. */
  protected onDrop(e: DragEvent, area: HTMLTextAreaElement): void {
    const file = imageFileOf(e.dataTransfer);
    if (!file) {
      // outro arquivo: não abre por cima do Murall (o texto arrastado continua do jeito do navegador)
      if (e.dataTransfer?.files.length) e.preventDefault();
      return;
    }
    e.preventDefault();
    void this.putImage(area, file);
  }

  private readonly images = inject(ImageStore);
  protected readonly toasts = inject(Toasts);
  /** Uma imagem colada sendo encolhida e guardada. */
  protected readonly savingImage = signal(false);

  /**
   * Encolhe e guarda a imagem (core/image-store.ts) e põe o widget dela numa linha só dele, onde estava o
   * cursor; se o texto mudou enquanto ela era guardada, onde o cursor está agora.
   */
  private async putImage(area: HTMLTextAreaElement, file: Blob): Promise<void> {
    const before = area.value;
    let at = { start: area.selectionStart, end: area.selectionEnd, swap: false };
    this.savingImage.set(true);
    try {
      const image = await this.images.add(file);
      if (area.value !== before) at = { start: area.selectionStart, end: area.selectionEnd, swap: false };
      this.writeWidget(area, at, widgetLines('imagem', [localImageUrl(image.id)]).join('\n'));
    } catch (error) {
      this.toasts.show(error instanceof ImageProblem ? error.message : 'A imagem não entrou. Tente de novo.');
    } finally {
      this.savingImage.set(false);
    }
  }

  private readonly imageSync = inject(ImageSync);

  /**
   * Cola o texto com as imagens do Murall que ele traz (PLANO-IMAGENS.md, decisão D3): a de outra pessoa
   * vira uma cópia sua (a que não está aqui desce antes, com a conta), e o texto passa a levar o id da
   * cópia; senão, colada numa anotação sua, ela pararia de abrir quando você saísse da compartilhada. A
   * sua e a que não deu para trazer ficam como vieram. O texto já entrou (o colar do navegador): a troca
   * é do endereço, do mesmo tamanho, então o cursor e o que foi escrito depois ficam onde estão.
   */
  private async adoptImages(ids: readonly string[], swap: (from: string, to: string) => boolean): Promise<void> {
    let copied = 0;
    try {
      for (const id of ids) {
        try {
          const here = await this.images.get(id);
          if (here && !here.alheia) continue;
          // só o que precisa descer ou ser copiado mostra o "Guardando a imagem…"
          this.savingImage.set(true);
          if (!here) await this.imageSync.fetch(id);
          const mine = await this.images.adopt(id);
          if (!mine || mine.id === id) continue;
          if (swap(localImageUrl(id), localImageUrl(mine.id))) copied++;
        } catch {
          // a que não deu para copiar fica como veio
        }
      }
    } finally {
      this.savingImage.set(false);
    }
    if (copied) this.toasts.show(copied === 1 ? 'A imagem era de outra pessoa: guardei uma cópia sua.' : `As ${copied} imagens eram de outra pessoa: guardei cópias suas.`);
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
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly RemoveIcon = ICON.apagar;
  protected readonly EditIcon = ICON.editar;
  /** O desenho de cada widget no menu. */
  protected iconOf(name: string): LucideIconData {
    return WIDGET_ICONS[name] ?? ICON.widgets;
  }

  /** Escolheu um widget no menu: a folha dele abre. */
  protected chooseWidget(area: HTMLTextAreaElement, big: boolean, def: WidgetDef): void {
    this.menu.set(null);
    if (this.visual()) return this.startVisualWidget(big, def);
    this.startWidget(area, big, def);
  }

  /**
   * O widget escolhido no Inserir do Visual: a folha dele abre. Com um widget desse tipo selecionado, ela
   * abre com ele, para trocar; senão, um novo, que entra no lugar do cursor (o Visual guarda o lugar, que
   * anda com o texto). A tabela ainda não (é da rodada 6).
   */
  private startVisualWidget(big: boolean, def: WidgetDef): void {
    const api = this.visualOf(big);
    if (def.name === 'tabela' || !api) return this.notYet();
    this.closePanels();
    const here = api.lugarDaPeca(def.name);
    if (here) this.widgetPick.set({ big, name: def.name, values: { ...def.read(here.args), size: here.tamanho }, start: here.de, end: here.de, swap: true });
    else this.widgetPick.set({ big, name: def.name, values: { size: 'medio' }, start: -1, end: -1, swap: false });
    this.widgetSheet.set(true);
  }
  /**
   * O widget aberto: em qual folha, qual widget, os valores dos campos e o trecho que ele vai ocupar
   * (`swap`: a linha de um widget que já estava lá, que ele troca).
   */
  protected readonly widgetPick = signal<{ big: boolean; name: string; values: WidgetValues; start: number; end: number; swap: boolean } | null>(null);
  /** A folha do widget aberta (sem ela, o widget tocado na folha mostra só a tirinha). */
  protected readonly widgetSheet = signal(false);
  /** A cartolina da anotação, para a prévia do widget na ficha do mural. */
  readonly stock = input<string | null>(null);

  protected widgetOf(name: string): WidgetDef {
    return widgetDef(name) ?? WIDGETS[0];
  }

  /** O que a tirinha diz do widget tocado: o título, a legenda ou o site do link (a tabela: quantas colunas e linhas). */
  protected readonly widgetSummary = computed(() => {
    const w = this.widgetPick();
    if (!w) return '';
    const def = this.widgetOf(w.name);
    if (def.summary) return def.summary(w.values);
    const args = def.write(w.values);
    const words = args ? def.plain(args).trim() : '';
    return words || hostOf(w.values['url'] ?? '');
  });

  /**
   * O widget escolhido: com o cursor na linha de um widget desse tipo, ele abre com o que está
   * escrito, para trocar; senão, um novo. Pela régua, a folha dele abre; pelo clique na linha do
   * widget, só a tirinha, com o cursor na folha.
   */
  private startWidget(area: HTMLTextAreaElement, big: boolean, def: WidgetDef, openSheet = true): void {
    this.closePanels();
    const { from, lines } = this.linesAt(area);
    const table = def.name === 'tabela' || !openSheet ? this.tableAt(area.value, area.selectionStart) : null;
    const here = lines.length === 1 ? parseWidgetLine(lines[0]) : null;
    if (table) {
      // a tabela do cursor (com a marca do jeito em cima, se tiver): ela inteira é o trecho
      this.widgetPick.set({ big, name: 'tabela', values: { look: table.look, table: table.text }, start: table.start, end: table.end, swap: true });
    } else if (here && (here.name === def.name || !openSheet)) {
      const known = this.widgetOf(here.name);
      this.widgetPick.set({ big, name: known.name, values: { ...known.read(here.args), size: here.size }, start: from, end: from + lines[0].length, swap: true });
    } else {
      const fresh: WidgetValues = def.name === 'tabela' ? { look: DEFAULT_TABLE_LOOK, table: tableText(emptyTable()) } : {};
      this.widgetPick.set({ big, name: def.name, values: { size: 'medio', ...fresh }, start: area.selectionStart, end: area.selectionEnd, swap: false });
    }
    // a marca do jeito da tabela sozinha (a tabela de baixo saiu): a folha começa uma tabela nova embaixo dela
    const w = this.widgetPick();
    if (w?.name === 'tabela' && !w.values['table']) this.widgetPick.set({ ...w, values: { ...w.values, table: tableText(emptyTable()) } });
    if (openSheet) this.widgetSheet.set(true);
    else {
      this.passive = true;
      this.showPanel('.widget-tira');
    }
  }

  /** O Editar da tirinha: a folha abre com o widget tocado. */
  protected openWidgetSheet(): void {
    this.passive = false;
    // no Visual, a folha troca o widget selecionado (o Visual guarda qual é)
    const w = this.widgetPick();
    if (this.visual() && w) this.visualOf(w.big)?.lugarDaPeca();
    this.widgetSheet.set(true);
  }

  /**
   * O que a folha pediu para o texto: a linha do widget pronto, ou tirar a dele. Só é feito quando ela
   * fecha: enquanto ela está aberta, a folha do texto fica por baixo e não recebe o foco (e o que se
   * escreve nela, pelo `insertText`, iria parar no campo da folha do widget).
   */
  private widgetOrder: { line: string; done: WidgetDone } | 'tirar' | null = null;

  protected onWidgetDone(done: WidgetDone): void {
    this.widgetOrder = { line: widgetLines(done.name, done.args, done.size, done.body).join('\n'), done };
  }

  /**
   * A tabela onde está a posição `at` do texto (a marca do jeito em cima dela também conta): o trecho
   * dela inteira, do começo da primeira linha ao fim da última, o jeito e a tabela como a folha a lê.
   */
  private tableAt(text: string, at: number): { start: number; end: number; look: string; text: string } | null {
    const line = text.slice(0, at).split('\n').length - 1;
    const block = tableBlockAt(text, line);
    if (!block) return null;
    const lines = linesOf(text);
    const start = lines.slice(0, block.from).reduce((n, l) => n + l.length + 1, 0);
    const end = start + lines.slice(block.from, block.to + 1).join('\n').length;
    const rows = lines.slice(block.from + (block.look ? 1 : 0), block.to + 1);
    return { start, end, look: block.look ?? DEFAULT_TABLE_LOOK, text: tableText(readTable(rows)) };
  }

  protected onWidgetRemoved(): void {
    this.widgetOrder = 'tirar';
  }

  /** A folha fechou: o widget vai para o texto (ou sai dele), e o cursor volta para a folha. */
  protected onWidgetClosed(): void {
    this.widgetSheet.set(false);
    const w = this.widgetPick();
    const order = this.widgetOrder;
    this.widgetOrder = null;
    const api = w && this.visual() ? this.visualOf(w.big) : null;
    if (api) {
      // no Visual, o Visual põe, troca ou tira a peça no lugar que ele guardou
      this.widgetPick.set(null);
      this.passive = false;
      if (order === 'tirar') api.tiraPeca();
      else if (order && !order.done.body) api.poePeca(order.done.name, order.done.args, order.done.size);
      else api.voltaAPeca();
      return;
    }
    const area = w && this.areaOf(w.big);
    if (!w || !area) {
      this.widgetPick.set(null);
      return;
    }
    if (order === 'tirar') {
      this.removeWidget(area);
      return;
    }
    this.widgetPick.set(null);
    if (order) {
      this.writeWidget(area, w, order.line);
      return;
    }
    area.focus({ preventScroll: true });
    area.setSelectionRange(w.start, w.end);
  }

  /** Tira a linha do widget do texto (com a quebra de linha dela, para não sobrar uma linha vazia). */
  protected removeWidget(area: HTMLTextAreaElement): void {
    const w = this.widgetPick();
    this.widgetPick.set(null);
    this.passive = false;
    const api = w && this.visual() ? this.visualOf(w.big) : null;
    if (api) {
      // o Tirar da tirinha no Visual: a peça selecionada sai (o Ctrl+Z volta)
      api.lugarDaPeca();
      api.tiraPeca();
      return;
    }
    if (!w?.swap) return;
    const text = area.value;
    const end = text[w.end] === '\n' ? w.end + 1 : w.end;
    const start = end === w.end && w.start > 0 && text[w.start - 1] === '\n' ? w.start - 1 : w.start;
    this.replace(area, start, end, '', start, start);
  }

  /**
   * Põe o widget numa linha só dele: no lugar da linha que ele troca, numa linha vazia onde está o
   * cursor, ou numa linha nova logo depois da do cursor.
   */
  protected writeWidget(area: HTMLTextAreaElement, w: { start: number; end: number; swap: boolean }, line: string): void {
    const text = area.value;
    // o widget de várias linhas (a tabela): cada uma delas com o recuo
    const indented = (indent: string) => line.split('\n').map((l) => indent + l).join('\n');
    if (w.swap) {
      // a linha trocada fica com o recuo que tinha: o widget embaixo de um item continua no item
      const own = indented(/^[ \t]*/.exec(text.slice(w.start, w.end))![0]);
      this.replace(area, w.start, w.end, own, w.start + own.length, w.start + own.length);
      return;
    }
    const lineStart = text.lastIndexOf('\n', w.start - 1) + 1;
    const lineEndAt = text.indexOf('\n', w.end);
    const lineEnd = lineEndAt === -1 ? text.length : lineEndAt;
    // num item (ou embaixo dele), o widget entra recuado: fica dele, como a descrição
    const indent = bodyIndent(linesOf(text), text.slice(0, lineStart).split('\n').length - 1) ?? '';
    if (!text.slice(lineStart, lineEnd).trim()) {
      // na linha vazia, com o recuo que ela já tinha
      const own = indented(/^[ \t]*/.exec(text.slice(lineStart, lineEnd))![0]);
      this.replace(area, lineStart, lineEnd, own, lineStart + own.length, lineStart + own.length);
      return;
    }
    const piece = '\n' + indented(indent);
    this.replace(area, lineEnd, lineEnd, piece, lineEnd + piece.length, lineEnd + piece.length);
  }

  protected closeWidget(e: Event | null, area: HTMLTextAreaElement): void {
    e?.preventDefault();
    e?.stopPropagation();
    const w = this.widgetPick();
    const api = w && this.visual() ? this.visualOf(w.big) : null;
    if (api) {
      // o Esc na tirinha: de volta à folha, com a peça selecionada (a tirinha continua com ela)
      api.lugarDaPeca();
      api.voltaAPeca();
      return;
    }
    this.widgetPick.set(null);
    area.focus();
    if (w) area.setSelectionRange(w.start, w.end);
  }

  // ===== A tabela =====

  protected closeGuide(e: Event | null, area: HTMLTextAreaElement): void {
    e?.preventDefault();
    e?.stopPropagation();
    this.guide.set(null);
    area.focus();
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
   * `close`: a marca de fechar, quando não é a mesma da de abrir (o sutil, "((" e "))").
   */
  protected wrap(area: HTMLTextAreaElement, mark: string, close = mark): void {
    const text = area.value;
    let [s, e] = [area.selectionStart, area.selectionEnd];
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    const m = mark.length;
    // já marcada por fora ("**|texto|**"): tira as marcas. Um "*" que é metade de um "**" é negrito,
    // não itálico ("**|texto|**" ganha o itálico por dentro: "***texto***")
    const halfOfBold = m === 1 && text[s - 2] === '*' && text[s - 3] !== '*';
    const outside = text.slice(s - m, s) === mark && text.slice(e, e + m) === close && !halfOfBold;
    if (s < e && outside) {
      this.replace(area, s - m, e + m, text.slice(s, e), s - m, e - m);
      return;
    }
    // ou por dentro ("|**texto**|")
    const inner = text.slice(s, e);
    if (inner.length > 2 * m && inner.startsWith(mark) && inner.endsWith(close) && (m === 2 || !inner.startsWith('**') || inner.startsWith('***'))) {
      this.replace(area, s, e, inner.slice(m, -m), s, e - 2 * m);
      return;
    }
    this.replace(area, s, e, mark + inner + close, s + m, e + m);
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
      const own = k.kind === 'ol' ? withNumber(mark, nextNumber(line)) : mark;
      const caret = from + above.length + 1 + own.length;
      // o que desceu leva os de baixo junto: "3." vira "4.", e o "4." de baixo, "5."
      this.putItem(area, text.slice(0, from) + `${above}\n${own}` + text.slice(from + marker), caret, k.kind === 'ol' ? k.pre + k.n : undefined);
      return;
    }
    const prefix = indent + prefixOf(k.kind, nextNumber(line));
    // no fim de um item com o que vem embaixo dele: o item novo entra depois disso, que continua dele
    const { lines, at: here } = this.cursorLine(area);
    const end = at === from + line.length ? itemEnd(lines, here) : here;
    const put = end === here ? at : from + lines.slice(here, end + 1).join('\n').length;
    this.putItem(area, text.slice(0, put) + '\n' + prefix + text.slice(put), put + 1 + prefix.length);
  }

  /**
   * Põe o texto com o item novo (o cursor em `caret`, na linha dele) numa troca só, com os números
   * de baixo da mesma lista acertados (ver `renumberAfter`); `was`, o número que a linha do cursor
   * tinha, quando foi ela que desceu.
   */
  private putItem(area: HTMLTextAreaElement, next: string, caret: number, was?: string): void {
    const row = next.slice(0, caret).split('\n').length - 1;
    this.replaceAll(area, renumberAfter(linesOf(next), row, was).join('\n'), caret);
  }

  /** Troca o texto inteiro por `next` numa troca só (um Ctrl+Z desfaz tudo): só o trecho que mudou. */
  private replaceAll(area: HTMLTextAreaElement, next: string, caret: number): void {
    const old = area.value;
    let s = 0;
    while (s < old.length && s < next.length && old[s] === next[s]) s++;
    let e = 0;
    while (e < old.length - s && e < next.length - s && old[old.length - 1 - e] === next[next.length - 1 - e]) e++;
    this.replace(area, s, old.length - e, next.slice(s, next.length - e), caret, caret);
  }

  /**
   * Tab: o recuo vai até o próximo número par de espaços (um ou dois a mais), o que o texto lê como
   * "dentro" do item de cima, sem nunca parar em três. Num item de lista, com o cursor no recuo ou
   * com várias linhas, a linha toda anda (como no Docs); no meio do texto, os espaços entram no cursor,
   * até a próxima coluna par. Shift+Tab volta ao par de antes; numa linha sem recuo, ele é o de
   * sempre (o foco sai da folha, que é o caminho do teclado para fora dela).
   */
  private indentKey(e: KeyboardEvent, area: HTMLTextAreaElement): void {
    const { from, to, lines } = this.linesAt(area);
    const [s, end] = [area.selectionStart, area.selectionEnd];
    const lead = (l: string) => /^[ \t]*/.exec(l)![0];
    const single = lines.length === 1;
    if (e.shiftKey) {
      const out = lines.map((l) => outdentLine(l));
      if (out.every((l, i) => l === lines[i])) return;
      e.preventDefault();
      const joined = out.join('\n');
      if (single && s === end) {
        const caret = Math.max(from + lead(out[0]).length, s - (lines[0].length - out[0].length));
        this.replace(area, from, to, joined, caret, caret);
      } else this.replace(area, from, to, joined, from, from + joined.length);
      return;
    }
    e.preventDefault();
    const caretCol = s - from;
    if (single && s === end && lineKind(lines[0]).kind === 'p' && caretCol > lead(lines[0]).length) {
      // no meio do texto: os espaços até a próxima coluna par, no cursor
      const pad = ' '.repeat(caretCol % 2 ? 1 : 2);
      this.replace(area, s, s, pad, s + pad.length, s + pad.length);
      return;
    }
    // a linha em branco no meio da seleção fica como está
    const out = lines.map((l) => (!single && !l.trim() ? l : indentLine(l)));
    const joined = out.join('\n');
    if (single && s === end) {
      // o cursor anda junto com o texto (no recuo, vai para o fim dele)
      const grown = out[0].length - lines[0].length;
      const caret = caretCol <= lead(lines[0]).length ? from + lead(out[0]).length : s + grown;
      this.replace(area, from, to, joined, caret, caret);
    } else this.replace(area, from, to, joined, from, from + joined.length);
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
    const prefix = /^\s*/.exec(top)![0] + prefixOf(k.kind as ListKind, nextNumber(top));
    const text = area.value;
    if (!line.trim()) {
      this.putItem(area, text.slice(0, from) + prefix + text.slice(from + line.length), from + prefix.length);
      return;
    }
    const cur = area.selectionStart;
    this.putItem(area, text.slice(0, cur) + '\n' + prefix + text.slice(cur), cur + 1 + prefix.length);
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

/**
 * Troca no texto do campo cada `from` (o endereço inteiro, não o começo de outro) por `to`, do mesmo
 * tamanho, sem mexer no cursor nem no foco; avisa o campo. Devolve se trocou alguma.
 */
export function swapAddress(area: HTMLTextAreaElement, from: string, to: string): boolean {
  const at: number[] = [];
  for (let i = area.value.indexOf(from); i >= 0; i = area.value.indexOf(from, i + from.length)) {
    if (!/[A-Za-z0-9_-]/.test(area.value[i + from.length] ?? '')) at.push(i);
  }
  if (!at.length) return false;
  const { selectionStart, selectionEnd, selectionDirection } = area;
  for (const i of at) area.setRangeText(to, i, i + from.length, 'preserve');
  area.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
  area.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/** A marca do começo da linha de cada estilo do parágrafo (o bloco de código são as cercas). */
const STYLE_PREFIX: Record<Exclude<LineStyle, 'codigo'>, string> = { texto: '', t1: '# ', t2: '## ', t3: '### ', citacao: '> ', sutil: '-# ' };
const HEADING_MARK = /^#{1,3}\s+/;
/** A citação ("> "), não o spoiler ">!texto!<". */
const QUOTE_MARK = /^\s*>(?!!\S.*!<)\s?/;
const FENCE_MARK = /^\s*```/;
/** O texto sutil ("-# ", como no Discord). */
const SUBTLE_MARK = /^\s*-#(?:[ \t]+|$)/;
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
  if (SUBTLE_MARK.test(line)) return 'sutil';
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

/**
 * O endereço de um link posto pelo Visual: o de `normalizeUrl`, com os espaços em %20 e, se os parênteses
 * não fazem par, eles escapados (%28, %29), para a leitura não cortar o link no meio (o F8 do plano).
 */
export function linkHref(raw: string): string | null {
  const href = normalizeUrl(raw.trim().replace(/\s+/g, '%20'));
  if (!href) return null;
  const resto = href.replace(/^(?:https?:\/\/|mailto:)/i, '');
  return /^(?:[^\s()]|\([^\s()]*\))+$/.test(resto) ? href : href.replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/** A largura do recuo da linha, em espaços (o tab vai até a próxima parada de 4, como no markdown). */
function leadWidth(line: string): number {
  let w = 0;
  for (const ch of /^[ \t]*/.exec(line)![0]) w += ch === ' ' ? 1 : 4 - (w % 4);
  return w;
}

/** A linha com o recuo no próximo número par de espaços (2 → 4, 3 → 4). */
export function indentLine(line: string): string {
  const w = leadWidth(line);
  return ' '.repeat(w + (w % 2 ? 1 : 2)) + line.replace(/^[ \t]*/, '');
}

/** A linha com o recuo no número par de antes (4 → 2, 3 → 2); sem recuo, fica como está. */
export function outdentLine(line: string): string {
  const w = leadWidth(line);
  return w ? ' '.repeat(w - (w % 2 ? 1 : 2)) + line.replace(/^[ \t]*/, '') : line;
}

/** O marcador do item novo; na numerada, com o número dele ("3", "1.2"). */
function prefixOf(kind: ListKind, n: number | string): string {
  return kind === 'ul' ? '- ' : kind === 'check' ? '- [ ] ' : `${n}. `;
}
