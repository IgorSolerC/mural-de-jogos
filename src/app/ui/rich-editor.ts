import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal, viewChild } from '@angular/core';
import {
  Bold,
  Check,
  CircleHelp,
  Code,
  Ellipsis,
  Eye,
  Heading,
  Highlighter,
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
  Plus,
  Strikethrough,
  Table,
  Quote,
  X,
} from 'lucide-angular';
import { isTableSep, lineKind, tableCells, toggleCheck } from '../core/rich-text';
import { NoteLinks, linkKey, resolveNote } from '../core/note-links';
import { Review, formatReviewDate } from '../core/review';
import { RichText } from './rich-text';

type ListKind = 'ul' | 'ol' | 'check';

/**
 * O campo do texto da ficha: a folha pautada de sempre, com uma régua de formatação em cima e
 * "Maximizar", que abre a mesma folha na tela inteira para os textos longos. O que a régua faz são
 * as marcas de core/rich-text.ts, escritas no próprio texto:
 *
 * - negrito, itálico, riscado e marca-texto em volta da seleção (de novo, tira);
 * - título (cada toque, um nível menor, até voltar a texto), citação, listas e tarefas nas linhas;
 * - link para um endereço (um painelzinho com o texto e o endereço; colar um endereço com texto
 *   selecionado já faz o link), tabela (escolhida numa grade; Tab anda entre as células, Enter no
 *   fim de uma linha cria a próxima), código e a divisória;
 * - "?" abre o guia de todas as marcas.
 *
 * Atalhos: Ctrl+B, Ctrl+I, Ctrl+K (link), Ctrl+E (código), Ctrl+Shift+X (riscado), Ctrl+Shift+H
 * (marca-texto); Enter continua a lista (num item vazio, termina).
 *
 * As mudanças passam por `insertText`, então o Ctrl+Z do navegador desfaz cada uma.
 *
 * Com `notes` (o editor da anotação), a régua ganha "Link para outra anotação": escreve
 * "[[Título]]" no texto (ver core/note-links.ts). Escrever "[[" direto na folha abre a mesma lista,
 * filtrando pelo que vem depois; setas escolhem, Enter (ou Tab) põe, Esc fecha.
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

@Component({
  selector: 'app-rich-editor',
  imports: [LucideAngularModule, NgTemplateOutlet, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #campo let-big="big">
      <div class="regua" role="toolbar" aria-label="Formatação do texto" [attr.aria-controls]="big ? areaId + '-grande' : areaId">
        <div class="ferramentas">
        <!-- Na régua, só o que se usa toda hora, em três grupos (escrever, listar, ligar); o resto mora
             em "Mais", com o nome e o atalho de cada marca -->
        <button type="button" class="ferramenta" [disabled]="seeing()" title="Negrito (Ctrl+B)" aria-label="Negrito" (pointerdown)="$event.preventDefault()" (click)="wrap(area, '**')">
          <lucide-icon [img]="BoldIcon" [size]="18" [strokeWidth]="2.8" aria-hidden="true" />
        </button>
        <button type="button" class="ferramenta" [disabled]="seeing()" title="Itálico (Ctrl+I)" aria-label="Itálico" (pointerdown)="$event.preventDefault()" (click)="wrap(area, '*')">
          <lucide-icon [img]="ItalicIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
        </button>
        <button type="button" class="ferramenta" [disabled]="seeing()" title="Título (de novo: um nível menor)" aria-label="Título" (pointerdown)="$event.preventDefault()" (click)="heading(area)">
          <lucide-icon [img]="HeadingIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
        </button>
        <span class="fio" aria-hidden="true"></span>
        <button type="button" class="ferramenta" [disabled]="seeing()" title="Tarefas (checklist)" aria-label="Tarefas" (pointerdown)="$event.preventDefault()" (click)="list(area, 'check')">
          <lucide-icon [img]="ChecksIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
        </button>
        <button type="button" class="ferramenta" [disabled]="seeing()" title="Lista" aria-label="Lista" (pointerdown)="$event.preventDefault()" (click)="list(area, 'ul')">
          <lucide-icon [img]="ListIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
        </button>
        <button type="button" class="ferramenta" [disabled]="seeing()" title="Lista numerada" aria-label="Lista numerada" (pointerdown)="$event.preventDefault()" (click)="list(area, 'ol')">
          <lucide-icon [img]="OrderedIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
        </button>
        <span class="fio" aria-hidden="true"></span>
        <button
          type="button"
          class="ferramenta"
          [disabled]="seeing()"
          title="Link para um endereço (Ctrl+K)"
          aria-label="Link para um endereço"
          [attr.aria-expanded]="urlLink()?.big === big"
          (pointerdown)="$event.preventDefault()"
          (click)="startUrl(area, big)"
        >
          <lucide-icon [img]="UrlIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
        </button>
        @if (notes()) {
          <button
            type="button"
            class="ferramenta"
            [disabled]="seeing()"
            title="Link para outra anotação (ou escreva [[)"
            aria-label="Link para outra anotação"
            [attr.aria-expanded]="linking()?.big === big && !linking()?.auto"
            (pointerdown)="$event.preventDefault()"
            (click)="startLink(area, big)"
          >
            <lucide-icon [img]="LinkIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
          </button>
        }
        <button
          type="button"
          class="ferramenta"
          [disabled]="seeing()"
          title="Tabela"
          aria-label="Tabela"
          [attr.aria-expanded]="tablePick()?.big === big"
          (pointerdown)="$event.preventDefault()"
          (click)="startTable(area, big)"
        >
          <lucide-icon [img]="TableIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
        </button>
        </div>
        <!-- "Mais": as outras marcas num menu que abre colado no botão, por cima da folha (não empurra
             nada): cada marca com o desenho, o nome escrito do jeito que ela fica e o atalho -->
        <span class="mais-ancora" (focusout)="onMoreFocusOut($event)">
          <button
            type="button"
            class="ferramenta mais"
            [disabled]="seeing()"
            title="Mais marcas: riscado, marca-texto, código, citação, divisória e o guia"
            aria-haspopup="menu"
            [attr.aria-expanded]="moreOpen() === big"
            [attr.aria-controls]="moreOpen() === big ? areaId + '-mais' : null"
            (pointerdown)="$event.preventDefault()"
            (click)="toggleMore(big, $event, area)"
            (keydown.arrowdown)="$event.preventDefault(); openMore(big, true)"
          >
            <lucide-icon [img]="MoreIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
            <span class="mais-txt">Mais</span>
          </button>
          @if (moreOpen() === big) {
            <div class="mais-menu" role="menu" tabindex="-1" [id]="areaId + '-mais'" aria-label="Mais marcas" (keydown)="onMoreKey($event, area)">
              <button type="button" role="menuitem" tabindex="-1" class="mais-op" aria-keyshortcuts="Control+Shift+X" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="moreDo(area, 'strike')">
                <lucide-icon [img]="StrikeIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
                <span class="mais-nome"><s>Riscado</s></span>
                <kbd class="atalho" aria-hidden="true">Ctrl+Shift+X</kbd>
              </button>
              <button type="button" role="menuitem" tabindex="-1" class="mais-op" aria-keyshortcuts="Control+Shift+H" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="moreDo(area, 'mark')">
                <lucide-icon [img]="MarkIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
                <span class="mais-nome"><mark>Marca-texto</mark></span>
                <kbd class="atalho" aria-hidden="true">Ctrl+Shift+H</kbd>
              </button>
              <button type="button" role="menuitem" tabindex="-1" class="mais-op" aria-keyshortcuts="Control+E" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="moreDo(area, 'code')">
                <lucide-icon [img]="CodeIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
                <span class="mais-nome"><code>Código</code></span>
                <kbd class="atalho" aria-hidden="true">Ctrl+E</kbd>
              </button>
              <span class="mais-fio" role="separator"></span>
              <button type="button" role="menuitem" tabindex="-1" class="mais-op" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="moreDo(area, 'quote')">
                <lucide-icon [img]="QuoteIcon" [size]="17" [strokeWidth]="2.4" aria-hidden="true" />
                <span class="mais-nome">Citação</span>
                <kbd class="jeito">&gt; no começo</kbd>
              </button>
              <button type="button" role="menuitem" tabindex="-1" class="mais-op" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="moreDo(area, 'rule')">
                <lucide-icon [img]="RuleIcon" [size]="17" [strokeWidth]="2.8" aria-hidden="true" />
                <span class="mais-nome">Divisória</span>
                <kbd class="jeito">---</kbd>
              </button>
              <span class="mais-fio" role="separator"></span>
              <button type="button" role="menuitem" tabindex="-1" class="mais-op guia-op" (pointerdown)="$event.preventDefault()" (pointerenter)="$any($event.currentTarget).focus()" (click)="moreDo(area, 'guide')">
                <lucide-icon [img]="HelpIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
                <span class="mais-nome">Guia de todas as marcas</span>
              </button>
            </div>
          }
        </span>
        <!-- as marcas ficam no texto: "Ver como fica" mostra a folha formatada (e marca as tarefas) -->
        <button type="button" class="acao-caneta ver" [attr.aria-pressed]="seeing()" [attr.aria-label]="seeing() ? 'Escrever' : 'Ver como fica'" [title]="seeing() ? 'Escrever' : 'Ver como fica'" (click)="see(!seeing(), big)">
          <lucide-icon [img]="seeing() ? WriteIcon : SeeIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
          <span class="acao-txt">{{ seeing() ? 'Escrever' : 'Ver como fica' }}</span>
        </button>
        @if (big) {
          <button type="button" class="acao-caneta tamanho" (click)="shrink()" aria-label="Diminuir" title="Diminuir">
            <lucide-icon [img]="ShrinkIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
            <span class="acao-txt">Diminuir</span>
          </button>
        } @else {
          <button type="button" class="acao-caneta tamanho" (click)="grow(area)" aria-haspopup="dialog" aria-label="Maximizar" title="Maximizar">
            <lucide-icon [img]="GrowIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
            <span class="acao-txt">Maximizar</span>
          </button>
        }
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
        [attr.aria-autocomplete]="notes() ? 'list' : null"
        [attr.aria-expanded]="notes() ? linking()?.auto === true && linking()?.big === big : null"
        [attr.aria-controls]="notes() ? areaId + '-elos' : null"
        [attr.aria-activedescendant]="linking()?.auto && linking()?.big === big && optionCount() ? areaId + '-elo-' + active() : null"
        (input)="value.set(area.value); watchLink(area, big)"
        (focus)="onAreaFocus()"
        (click)="watchLink(area, big)"
        (keyup)="onKeyUp($event, area, big)"
        (keydown)="onKey($event, area, big)"
        (paste)="onPaste($event, area)"
        (blur)="onAreaBlur()"
      ></textarea>
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
              <input type="text" autocomplete="off" placeholder="O que aparece (ou deixe o endereço)" (keydown.enter)="$event.preventDefault(); putUrl(area)" [value]="u.text" (input)="urlLink.set({ big: u.big, start: u.start, end: u.end, url: u.url, text: $any($event.target).value })" />
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
                (input)="urlLink.set({ big: u.big, start: u.start, end: u.end, text: u.text, url: $any($event.target).value })"
              />
            </label>
            <div class="painel-acoes">
              <button type="button" class="acao-caneta" (click)="closeUrl(null, area)">Cancelar</button>
              <button type="button" class="painel-ok" [disabled]="!urlOk()" (click)="putUrl(area)">Pôr o link</button>
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
            <div class="grade" role="grid" aria-label="Tamanho da tabela: colunas por linhas" (keydown)="onGridKey($event, area)">
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
      <!-- o guia: todas as marcas, com o jeito de escrever cada uma -->
      @if (guide() === big) {
        <div class="painel guia" [id]="areaId + '-guia'" role="region" aria-label="Guia das marcas" (keydown.escape)="closeGuide($event, area)">
          <div class="painel-topo">
            <p class="painel-titulo">Como escrever</p>
            <button type="button" class="painel-fechar" aria-label="Fechar" title="Fechar" (click)="closeGuide(null, area)"><lucide-icon [img]="CloseIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" /></button>
          </div>
          <dl class="guia-lista">
            @for (g of guideItems; track g.mark) {
              <div class="guia-item">
                <dt><code>{{ g.mark }}</code></dt>
                <dd>{{ g.what }}</dd>
              </div>
            }
          </dl>
        </div>
      }
      <!-- o link para outra anotação, embaixo da folha, sem cobrir o que se escreve: por "[[" na
           folha, só a lista (a busca é o que se escreve depois dos colchetes); pela régua, o painel
           do mesmo jeito do link para um endereço (o texto, a anotação e "Pôr o link") -->
      @if (linking(); as k) {
        @if (k.big === big) {
          @if (k.auto) {
            <div class="elos" [class.grande]="big">
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
                <button type="button" class="painel-ok" [disabled]="!k.chosen" (click)="putLink()">Pôr o link</button>
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
    :host {
      display: block;
      container: folha / inline-size;
    }

    /* ===== A régua: os botões de formatação encostados no alto da folha; quebram em duas
       fileiras quando não cabem, e as ações (ver, maximizar) ficam sempre na ponta ===== */
    .regua {
      display: flex;
      /* uma linha só: o "Mais" e as ações da folha ficam sempre na ponta; quem se ajeita no espaço que
         sobra (quebrando em duas fileiras, se precisar) são as ferramentas */
      flex-wrap: nowrap;
      align-items: center;
      gap: 4px 2px;
      margin-bottom: 6px;
    }
    .ferramentas {
      display: flex;
      flex: 1 1 auto;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px;
      min-width: 0;
    }
    .regua .ver,
    .regua .tamanho {
      flex: none;
    }
    /* sem lugar para os nomes, "Ver como fica" e "Maximizar" ficam só no desenho (o nome vai para o
       leitor de tela e para a dica): a régua cabe numa linha, sem um botão sozinho embaixo */
    /* sem lugar, "Maximizar" fica só no desenho primeiro; "Ver como fica" (a ação principal da folha)
       só perde o nome quando a régua é bem estreita */
    @container folha (max-width: 720px) {
      .tamanho .acao-txt {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }
    @container folha (max-width: 560px) {
      .ver .acao-txt {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }
    /* o "Mais" e o menu dele: o menu se ancora no botão */
    .mais-ancora {
      position: relative;
      display: inline-flex;
      flex: none;
      margin-left: 4px;
    }
    /* a régua inteira cabe: as ações da folha não passam da borda */
    .regua .tamanho {
      margin-right: 0;
    }
    /* dedo não é cursor: no toque, todo botão da régua com 44px */
    @media (pointer: coarse) {
      .ferramenta,
      .regua .acao-caneta {
        min-width: 44px;
        height: 44px;
      }
      .ferramentas {
        gap: 4px;
      }
    }
    .ferramenta {
      display: grid;
      place-items: center;
      width: 34px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--ink);
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .ferramenta:hover {
      background: rgb(21 21 21 / 0.08);
    }
    .ferramenta:active {
      background: rgb(21 21 21 / 0.16);
    }
    .ferramenta:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -1px;
    }
    .fio {
      width: 2px;
      height: 20px;
      margin: 0 4px;
      border-radius: 1px;
      background: rgb(21 21 21 / 0.25);
    }
    .ferramenta:disabled {
      opacity: 0.35;
      cursor: default;
      background: transparent;
    }
    .ver {
      margin: 0 0 0 auto;
      font-size: 0.95rem;
    }
    .tamanho {
      margin: 0 -8px 0 12px;
      font-size: 0.95rem;
    }
    /* no celular a régua é estreita: as duas ações ficam só no desenho (o nome vai para o leitor de tela) */
    @media (max-width: 559px) {
      .acao-txt {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .ferramenta {
        flex: none;
        width: 36px;
        height: 38px;
      }
      /* no celular, uma fileira só: as ferramentas rolam de lado (o esmaecido na ponta avisa que tem
         mais), e ver e maximizar ficam fixos na ponta */
      .regua {
        flex-wrap: nowrap;
      }
      .ferramentas {
        flex: 1 1 0;
        flex-wrap: nowrap;
        /* a fileira não empurra a coluna do editor: a largura dela vem da coluna, e o resto rola */
        contain: inline-size;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scrollbar-width: none;
        /* o esmaecido corta o próximo botão pela metade: dá para ver que a fileira continua */
        -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 44px), transparent);
        mask-image: linear-gradient(to right, #000 calc(100% - 44px), transparent);
      }
      .ferramentas::-webkit-scrollbar {
        display: none;
      }
      .fio {
        flex: none;
      }
      .tamanho {
        margin-left: 4px;
      }
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
          0 4px,
        rgb(255 255 255 / 0.55);
      background-attachment: local;
      box-shadow:
        inset 0 0 0 2px rgb(21 21 21 / 0.45),
        0 1px 3px rgb(0 0 0 / 0.2);
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1.14rem;
      line-height: var(--line);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      outline: none;
    }
    .previa:focus-visible {
      box-shadow:
        inset 0 0 0 3px var(--ink),
        0 0 0 4px rgb(21 21 21 / 0.16);
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
      background: #fbf9f2;
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 6px 14px -6px rgb(0 0 0 / 0.45);
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
    /* "Mais": o único botão da régua com nome, para dizer que tem mais coisa ali */
    .ferramenta.mais {
      display: inline-flex;
      gap: 4px;
      width: auto;
      padding: 0 9px 0 7px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .ferramenta.mais[aria-expanded='true'] {
      background: rgb(21 21 21 / 0.1);
    }
    /* o jeito de escrever ("---", "> no começo") é texto da folha: a letra de máquina, como no guia */
    .mais-op .jeito {
      padding: 1px 5px;
      border-radius: 2px;
      background: rgb(21 21 21 / 0.07);
      font-family: 'Courier New', ui-monospace, monospace;
      font-weight: 700;
      font-size: 0.86rem;
      letter-spacing: 0;
      color: var(--ink);
    }
    /* o menu do "Mais": um cartão de papel que cai do botão, por cima da folha; as marcas da linha,
       as de bloco e o guia separados por um risco tracejado */
    .mais-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 30;
      display: grid;
      width: max-content;
      min-width: 16rem;
      max-width: calc(100vw - 32px);
      padding: 6px;
      border-radius: 3px;
      background: #fbf9f2;
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 2px 4px rgb(0 0 0 / 0.16),
        0 14px 28px -12px rgb(0 0 0 / 0.55);
      transform-origin: top right;
      animation: menu-cai var(--t-ui) var(--ease-ui);
    }
    .mais-menu:focus {
      outline: none;
    }
    /* folha estreita: o menu se alinha às bordas da régua (não corre o risco de sair da folha) */
    @container folha (max-width: 560px) {
      .regua {
        position: relative;
      }
      .mais-ancora {
        position: static;
      }
      .mais-menu {
        left: 0;
        right: 0;
        width: auto;
        min-width: 0;
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
      .mais-menu {
        animation: none;
      }
    }
    .mais-fio {
      margin: 4px 8px;
      border-top: 2px dashed rgb(21 21 21 / 0.18);
    }
    .mais-op {
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
    .mais-op:hover,
    .mais-op:focus-visible {
      background: rgb(21 21 21 / 0.07);
    }
    .guia-op .mais-nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.84rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .mais-op:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -1px;
    }
    .mais-nome {
      font-family: var(--f-hand);
      font-size: 1.08rem;
    }
    .mais-nome s {
      text-decoration-thickness: 2px;
    }
    .mais-nome mark {
      background: linear-gradient(transparent 4%, rgb(255 218 66 / 0.62) 4%, rgb(255 218 66 / 0.62) 96%, transparent 96%);
      color: inherit;
    }
    .mais-nome code {
      padding: 0 4px;
      border-radius: 2px;
      background: rgb(21 21 21 / 0.08);
      font-family: 'Courier New', ui-monospace, monospace;
      font-weight: 700;
      font-size: 0.92em;
    }
    .mais-op kbd {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      color: var(--ink-2);
      white-space: nowrap;
    }
    /* no toque não tem atalho de teclado: fica só o jeito de escrever, quando tem */
    @media (pointer: coarse) {
      .mais-op .atalho {
        display: none;
      }
      .mais-op {
        min-height: 44px;
      }
      .mais-op:focus-visible {
        outline-width: 2px;
      }
    }

    /* o guia: as marcas na letra de máquina, o que fazem ao lado */
    .guia-lista {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
      gap: 4px 18px;
      margin: 0;
    }
    .guia-item {
      display: grid;
      grid-template-columns: minmax(7.5rem, auto) minmax(0, 1fr);
      align-items: baseline;
      gap: 10px;
      min-height: 30px;
    }
    .guia-item dt code {
      padding: 1px 5px;
      border-radius: 2px;
      background: rgb(21 21 21 / 0.07);
      font-family: 'Courier New', ui-monospace, monospace;
      font-weight: 700;
      font-size: 0.9rem;
      white-space: nowrap;
    }
    .guia-item dd {
      margin: 0;
      font-size: 0.92rem;
      color: var(--ink-2);
    }

    /* ===== A lista do link: uma tira de fichário presa embaixo da folha ===== */
    .elos {
      margin-top: 8px;
      padding: 8px;
      border-radius: 2px;
      background: #fbf9f2;
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 6px 14px -6px rgb(0 0 0 / 0.45);
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

    /* ===== A folha pautada (a mesma de antes da régua) ===== */
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
          0 4px,
        rgb(255 255 255 / 0.55);
      background-attachment: local;
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1.14rem;
      line-height: var(--line);
      caret-color: var(--red);
      outline: none;
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 1px 3px rgb(0 0 0 / 0.2);
      transition: box-shadow var(--t-ui) var(--ease-ui);

      &::placeholder {
        color: rgb(21 21 21 / 0.7);
      }

      &:focus {
        box-shadow:
          inset 0 0 0 3px var(--ink),
          0 0 0 4px rgb(21 21 21 / 0.16);
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
    }
  `,
})
export class RichEditor {
  readonly value = model('');
  readonly placeholder = input('');
  /** O nome do campo: o título da tela inteira ("O que achou?"). */
  readonly label = input('');
  /** O id do campo pequeno, para o rótulo de fora apontar para ele. */
  readonly areaId = 'texto-' + ++uid;
  /** As outras anotações, para os links "[[Título]]"; null, sem links (a resenha). */
  readonly notes = input<readonly Review[] | null>(null);

  protected readonly LinkIcon = NOTE_LINK_ICON;
  protected readonly UrlIcon = Link;
  protected readonly PlusIcon = Plus;
  protected readonly StrikeIcon = Strikethrough;
  protected readonly MarkIcon = Highlighter;
  protected readonly HeadingIcon = Heading;
  protected readonly QuoteIcon = Quote;
  protected readonly CloseIcon = X;
  protected readonly TableIcon = Table;
  protected readonly CodeIcon = Code;
  protected readonly RuleIcon = Minus;
  protected readonly HelpIcon = CircleHelp;

  /** O painel do link para um endereço: o trecho que ele vai ocupar, o texto e o endereço. */
  protected readonly urlLink = signal<{ big: boolean; start: number; end: number; text: string; url: string } | null>(null);
  /** O endereço do painel serve (com "https://" se faltou). */
  protected readonly urlOk = computed(() => !!normalizeUrl(this.urlLink()?.url ?? ''));
  /** A grade da tabela aberta, com o tamanho apontado. */
  protected readonly tablePick = signal<{ big: boolean; cols: number; rows: number } | null>(null);
  protected readonly gridCols = [1, 2, 3, 4, 5, 6];
  protected readonly gridRows = [1, 2, 3, 4, 5, 6];
  /** O painel "Mais" aberto (em qual das folhas), ou null. */
  protected readonly moreOpen = signal<boolean | null>(null);
  protected readonly MoreIcon = Ellipsis;

  /** O painel que acabou de abrir entra na tela (no celular, a régua pode já ter saído dela). */
  private showPanel(selector: string): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  /** Abre ou fecha "Mais" (e fecha os outros painéis da régua). */
  protected toggleMore(big: boolean, e: MouseEvent, area: HTMLTextAreaElement): void {
    // fechar pelo próprio botão: o foco volta para o texto (o menu, com o foco, sai da tela)
    if (this.moreOpen() === big) this.closeMore(null, area);
    // pelo teclado (Enter, espaço: um clique sem ponteiro), o foco já vai para a primeira marca
    else this.openMore(big, e.detail === 0);
  }
  /** O menu foi aberto pelo teclado: o Esc volta para o botão "Mais" (o lugar de quem estava na régua). */
  private moreByKeyboard = false;

  /**
   * Abre o menu do "Mais". Pelo teclado, o foco vai para a primeira marca; pelo mouse, fica no menu
   * (sem marcar nenhuma de cara), e as setas, Esc e Tab já valem.
   */
  protected openMore(big: boolean, first: boolean): void {
    this.moreByKeyboard = first;
    this.linking.set(null);
    this.urlLink.set(null);
    this.tablePick.set(null);
    this.guide.set(null);
    this.moreOpen.set(big);
    setTimeout(() => {
      const target = first ? this.moreItems()[0] : this.host.nativeElement.querySelector<HTMLElement>('.mais-menu');
      target?.focus({ preventScroll: true });
    });
  }

  private moreItems(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.mais-menu .mais-op'));
  }

  /** No menu: setas, Home e End andam pelas marcas; Esc fecha e volta para o texto; Tab sai e fecha. */
  protected onMoreKey(e: KeyboardEvent, area: HTMLTextAreaElement): void {
    const items = this.moreItems();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    // com o foco no menu (aberto pelo mouse), a seta para baixo vai para a primeira e a para cima, a última
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') {
      if (!this.moreByKeyboard) return this.closeMore(e, area);
      e.preventDefault();
      e.stopPropagation();
      const big = this.moreOpen();
      this.moreOpen.set(null);
      const menus = this.host.nativeElement.querySelectorAll<HTMLElement>('.ferramenta.mais');
      // a régua da folha grande (no diálogo) é a segunda
      menus[big ? menus.length - 1 : 0]?.focus();
    }
    else if (e.key === 'Tab') this.moreOpen.set(null);
  }

  /** O foco saiu do "Mais" (um toque fora, outro campo): o menu fecha. */
  protected onMoreFocusOut(e: FocusEvent): void {
    const to = e.relatedTarget as Node | null;
    if (!to || !(e.currentTarget as HTMLElement).contains(to)) this.moreOpen.set(null);
  }

  /** Uma marca do "Mais": põe no texto e fecha o painel (o guia abre no lugar dele). */
  protected moreDo(area: HTMLTextAreaElement, what: 'strike' | 'mark' | 'code' | 'quote' | 'rule' | 'guide'): void {
    const big = this.moreOpen();
    this.moreOpen.set(null);
    if (what === 'guide') {
      this.guide.set(big ?? false);
      this.showPanel('.guia');
      return;
    }
    if (what === 'strike') this.wrap(area, '~~');
    else if (what === 'mark') this.wrap(area, '==');
    else if (what === 'code') this.code(area);
    else if (what === 'quote') this.quote(area);
    else this.rule(area);
  }

  protected closeMore(e: Event | null, area: HTMLTextAreaElement): void {
    e?.preventDefault();
    e?.stopPropagation();
    this.moreOpen.set(null);
    area.focus();
  }

  /** O guia das marcas aberto (em qual das folhas), ou null. */
  protected readonly guide = signal<boolean | null>(null);
  protected readonly guideItems: readonly { mark: string; what: string }[] = [
    { mark: '**negrito**', what: 'Negrito (Ctrl+B)' },
    { mark: '*itálico*', what: 'Itálico (Ctrl+I)' },
    { mark: '~~riscado~~', what: 'Riscado' },
    { mark: '==marca==', what: 'Marca-texto' },
    { mark: '# Título', what: 'Título (## e ### menores)' },
    { mark: '> citação', what: 'Citação' },
    { mark: '- item', what: 'Lista' },
    { mark: '1. item', what: 'Lista numerada' },
    { mark: '- [ ] tarefa', what: 'Tarefa ([x] feita)' },
    { mark: '[texto](https://…)', what: 'Link para um endereço (Ctrl+K)' },
    { mark: '[[Título]]', what: 'Link para outra anotação' },
    { mark: '[[Título|texto]]', what: 'O link abre a anotação e mostra o texto' },
    { mark: '`código`', what: 'Código (Ctrl+E)' },
    { mark: '```', what: 'Bloco de código (abre e fecha)' },
    { mark: '| a | b |', what: 'Tabela (2ª linha: | --- | --- |)' },
    { mark: '---', what: 'Divisória' },
    { mark: '-> <- <-> =>', what: 'Setas: → ← ↔ ⇒ (--> e <-- compridas)' },
    { mark: '!= >= <= ~= +-', what: 'Símbolos: ≠ ≥ ≤ ≈ ±' },
    { mark: '\\*', what: 'A marca como ela é, sem formatar' },
  ];

  /**
   * A lista do link aberta: pela régua (`auto` falso, com a própria busca) ou por "[[" escrito na
   * folha (`auto`, a busca é o que vem depois dos colchetes). `start` e `end` são o trecho do texto
   * que o link vai ocupar; `big`, em qual das folhas (a pequena ou a da tela inteira). No painel da
   * régua, `chosen` é o título escolhido na lista (null: a lista está aberta, nada escolhido).
   */
  protected readonly linking = signal<{ auto: boolean; big: boolean; start: number; end: number; query: string; label?: string; chosen?: string | null } | null>(null);
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
  protected readonly ListIcon = List;
  protected readonly OrderedIcon = ListOrdered;
  protected readonly ChecksIcon = ListChecks;
  protected readonly GrowIcon = Maximize2;
  protected readonly ShrinkIcon = Minimize2;

  protected readonly SeeIcon = Eye;
  protected readonly WriteIcon = PenLine;
  protected readonly toggle = toggleCheck;
  /** Mostrando a folha formatada no lugar do campo ("Ver como fica"). */
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
    if (!on) setTimeout(() => this.focusAt(big ? `#${this.areaId}-grande` : `#${this.areaId}`));
  }

  /** Volta a escrever (o editor abre outra ficha). */
  reset(): void {
    this.seeing.set(false);
    this.linking.set(null);
    this.dismissedAt = -1;
    // os painéis da régua (link, tabela, mais marcas, guia) eram da ficha de antes: fecham
    this.urlLink.set(null);
    this.tablePick.set(null);
    this.guide.set(null);
    this.moreOpen.set(null);
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
    this.urlLink.set(null);
    this.tablePick.set(null);
    this.moreOpen.set(null);
    this.guide.set(null);
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
  }

  /** Voltou para a folha com a busca da régua aberta: a busca fecha (Esc na folha seria o do editor). */
  protected onAreaFocus(): void {
    if (this.linking() && !this.linking()!.auto) this.linking.set(null);
  }

  protected onAreaBlur(): void {
    // saiu da folha (sem ser para a lista, que não pega o foco): a lista automática fecha
    if (this.linking()?.auto) this.linking.set(null);
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
    this.focusAt(`#${this.areaId}`);
  }

  private focusAt(selector: string): void {
    const el = this.host.nativeElement.querySelector<HTMLTextAreaElement>(selector);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(...this.caret);
  }

  protected onKey(e: KeyboardEvent, area: HTMLTextAreaElement, big = false): void {
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
    } else if (e.key === 'Tab' && !mod && !e.altKey && this.tableLine(area)) {
      this.tableTab(e, area);
    } else if (e.key === 'Enter' && !e.shiftKey && !mod && !e.isComposing) {
      if (this.tableLine(area)) this.tableEnter(e, area);
      else this.continueList(e, area);
    }
  }

  // ===== Título, citação, código e divisória =====

  /** A linha do cursor (ou as da seleção): onde começa, onde termina e o texto. */
  private linesAt(area: HTMLTextAreaElement): { from: number; to: number; lines: string[] } {
    const text = area.value;
    const from = text.lastIndexOf('\n', area.selectionStart - 1) + 1;
    const endAt = text.indexOf('\n', Math.max(area.selectionEnd - (area.selectionEnd > area.selectionStart && text[area.selectionEnd - 1] === '\n' ? 1 : 0), area.selectionStart));
    const to = endAt === -1 ? text.length : endAt;
    return { from, to, lines: text.slice(from, to).split('\n') };
  }

  /** Título na linha: texto → "# " → "## " → "### " → texto de novo. */
  protected heading(area: HTMLTextAreaElement): void {
    const { from, to, lines } = this.linesAt(area);
    const line = lines[0];
    const m = /^(#{1,3})\s+/.exec(line);
    const level = m ? m[1].length : 0;
    const rest = m ? line.slice(m[0].length) : line.replace(/^\s+/, '');
    const next = level >= 3 ? rest : '#'.repeat(level + 1) + ' ' + rest;
    const end = from + lines[0].length;
    this.replace(area, from, end, next, from + next.length, from + next.length);
    void to;
  }

  /** Citação nas linhas: cada uma ganha "> "; se todas já têm, tira. */
  protected quote(area: HTMLTextAreaElement): void {
    const { from, to, lines } = this.linesAt(area);
    const all = lines.every((l) => /^\s*>/.test(l) || !l.trim());
    const next = lines.map((l) => (all ? l.replace(/^(\s*)>\s?/, '$1') : !l.trim() && lines.length > 1 ? l : '> ' + l)).join('\n');
    const single = area.selectionStart === area.selectionEnd && lines.length === 1;
    this.replace(area, from, to, next, single ? from + next.length : from, from + next.length);
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
    this.linking.set(null);
    this.tablePick.set(null);
    this.moreOpen.set(null);
    this.guide.set(null);
    const sel = area.value.slice(area.selectionStart, area.selectionEnd);
    const isUrl = !!normalizeUrl(sel.trim()) && /^(https?:\/\/|www\.|mailto:)/i.test(sel.trim());
    this.urlLink.set({ big, start: area.selectionStart, end: area.selectionEnd, text: isUrl ? '' : sel.replace(/\s+/g, ' ').trim(), url: isUrl ? sel.trim() : '' });
    setTimeout(() => this.panelInput(big, isUrl || !sel ? '.url-campo' : 'input')?.focus());
    this.showPanel('.url-painel');
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

  // ===== A tabela =====

  protected startTable(area: HTMLTextAreaElement, big: boolean): void {
    this.linking.set(null);
    this.urlLink.set(null);
    this.moreOpen.set(null);
    this.guide.set(null);
    if (this.tablePick()?.big === big) {
      this.tablePick.set(null);
      return;
    }
    this.tablePick.set({ big, cols: 2, rows: 2 });
    this.showPanel('.tabela-painel');
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.quadrado[tabindex="0"]')?.focus());
    void area;
  }

  /** Setas andam na grade, Enter (ou espaço) põe a tabela do tamanho apontado. */
  protected onGridKey(e: KeyboardEvent, area: HTMLTextAreaElement): void {
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
    void area;
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
    const text = area.value;
    const from = text.lastIndexOf('\n', area.selectionStart - 1) + 1;
    const endAt = text.indexOf('\n', Math.max(area.selectionEnd - (area.selectionEnd > area.selectionStart && text[area.selectionEnd - 1] === '\n' ? 1 : 0), area.selectionStart));
    const to = endAt === -1 ? text.length : endAt;
    const lines = text.slice(from, to).split('\n');
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
    if (k.kind === 'p') return;
    e.preventDefault();
    const indent = /^\s*/.exec(line)![0];
    if (!k.rest.trim()) {
      // item vazio: o marcador sai e a lista acaba ali
      this.replace(area, from, from + line.length, '', from, from);
      return;
    }
    const prefix = indent + prefixOf(k.kind, k.kind === 'ol' ? k.n + 1 : 1);
    this.replace(area, at, at, '\n' + prefix, at + 1 + prefix.length, at + 1 + prefix.length);
  }

  /**
   * Troca o trecho [start, end) por `text` e seleciona [selStart, selEnd). Pelo `insertText`, que entra
   * no desfazer do navegador; sem ele, troca direto e avisa o campo.
   */
  private replace(area: HTMLTextAreaElement, start: number, end: number, text: string, selStart: number, selEnd: number): void {
    area.focus();
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
