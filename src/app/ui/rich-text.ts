import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { calloutLook, calloutName } from '../core/callouts';
import { Block, blockLine, foldDone, hasFormatting, linesOf, parseRich, reminderLinkId, snapshotDone } from '../core/rich-text';
import { ReminderLinkInfo, reminderLinkTitle } from '../core/reminder-links';
import { NoteLinks } from '../core/note-links';
import { ShownDone } from '../core/shown-done';
import { Review } from '../core/review';
import { calloutIcon } from './callout-looks';
import { codeHighlightReady, codeRanges, codeTokens, CodeToken } from '../core/code-highlight';
import { codeLangName } from '../core/code-langs';
import { ICON, IconModule, iconMask } from './icons';
import { NoteWidget } from './note-widget';
import { PieceLift } from './piece-lift';
import { ZoomKnob } from './zoom-knob';

/**
 * O texto da ficha na leitura, com a formatação do editor (ver core/rich-text.ts): negrito, itálico,
 * listas e checklists. Quem desenha é o Angular, nunca HTML vindo do texto. Sem nenhuma marca, o
 * texto sai como foi escrito, sem ler marca nenhuma; com marcas, formatado. Dos dois jeitos, linha a
 * linha, cada uma numa linha da pauta, e cada linha de texto corrido é um parágrafo, na margem.
 *
 * O pai dá a letra, o tamanho e a altura da linha (`--line`); as tarefas só marcam com `checkable`.
 * Quem não tem pauta (a cartolina do mural) dá também o respiro em volta dos títulos e entre as
 * tarefas (`--titulo-antes`, `--titulo-depois`, `--tarefa-respiro`).
 *
 * Os links "[[título]]" só valem com `links` (nas anotações, ver core/note-links.ts): a caneta azul
 * sublinhada, que abre a outra anotação; tracejado, o que aponta para uma anotação que não existe.
 * Sem `links` (as resenhas), os colchetes ficam como foram escritos. O link para um lembrete do
 * Calendário ("[texto](murall://lembrete/ID)") tem a mesma caneta, com o desenho do calendário (ou o
 * ícone do lembrete) depois, e abre o dia dele no Calendário (com `links.openReminder`); tracejado, o
 * lembrete que não está lá.
 *
 * Os widgets ("{{contador: …}}", ver core/widgets.ts) viram a peça deles, numa linha só.
 *
 * O card ("> [!aviso] Título", ver core/callouts.ts) é um papel colorido colado no texto, com a beirada
 * de baixo rasgada: o desenho do jeito e o título a pincel em cima,
 * e o que tem dentro como o resto do texto. O que fecha ("[!aviso]-") é um <details>: tocar no título
 * abre e fecha (só ele age, a ficha embaixo não abre).
 *
 * O que vem embaixo de um item, recuado (a descrição, a foto, outra lista), fica no alinhamento do
 * texto dele, e o próximo item vem logo embaixo (a linha em branco só se foi escrita). Na tarefa feita, é riscado
 * junto: o texto a lápis, como o da tarefa, e a foto com um risco de caneta vermelha de ponta a ponta.
 *
 * O spoiler ("||texto||") é uma tarja de caneta preta por cima das letras, como num documento
 * censurado: o texto embaixo não aparece, não é lido pelo leitor de tela nem achado pelo teclado
 * (`inert`), e tocar (ou Enter) tira a tarja, como no Discord. Revelado, fica uma sombra clara para
 * dizer que ali era um spoiler, até a página desenhar o texto de novo.
 */
@Component({
  selector: 'app-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // cada linha guarda os próprios espaços: os do molde entre os blocos não contam
  host: { class: 'formatado' },
  template: `
    @if (!formatted()) {
      <!-- sem marcas: as linhas como foram escritas (nada vira link, lista nem negrito) -->
      @for (l of plainLines(); track $index) {
        <div class="linha paragrafo" [attr.data-l]="anchors() ? $index : null">{{ l }}</div>
      }
    } @else {
      <ng-container *ngTemplateOutlet="blocos; context: { $implicit: blocks() }" />
    }
    <!-- os blocos: o texto inteiro e, do mesmo jeito, o que vem embaixo de um item (o corpo dele) -->
    <ng-template #blocos let-bs>
      @for (b of asBlocks(bs); track $index) {
        @switch (b.kind) {
          @case ('p') {
            @for (l of b.lines; track $index) {
              <div class="linha paragrafo" [attr.data-l]="at(b, $index)">@for (s of l; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}</div>
            }
          }
          @case ('ul') {
            <ul class="lista">
              @for (it of b.items; track it.line) {
                <li class="linha" [attr.data-l]="anchors() ? it.line : null">@for (s of it.spans; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}@if (it.body) {<div class="corpo"><ng-container *ngTemplateOutlet="blocos; context: { $implicit: it.body }" /></div>}</li>
              }
            </ul>
          }
          @case ('ol') {
            <!-- a de dentro com o número do pai ("1.1.", "1.2."): ele vai antes do número de cada item -->
            <ol class="lista numerada" [start]="b.start" [style.counter-reset]="'item ' + (b.start - 1)" [style.--pre-n]="b.pre?.length ?? null">
              @for (it of b.items; track it.line) {
                <li class="linha" [attr.data-pre]="b.pre ?? null" [attr.data-l]="anchors() ? it.line : null">@for (s of it.spans; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}@if (it.body) {<div class="corpo"><ng-container *ngTemplateOutlet="blocos; context: { $implicit: it.body }" /></div>}</li>
              }
            </ol>
          }
          @case ('h') {
            <!-- o título: um dos níveis abaixo do título da ficha (4, 5, 6) -->
            <div [class]="'linha titulo t' + b.level" [attr.data-l]="at(b)" role="heading" [attr.aria-level]="3 + b.level">@for (s of b.spans; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}</div>
          }
          @case ('quote') {
            <blockquote class="citacao">
              @for (l of b.lines; track $index) {
                <div class="linha paragrafo" [attr.data-l]="at(b, $index)">@for (s of l; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}</div>
              }
            </blockquote>
          }
          @case ('subtle') {
            <!-- o texto sutil: a letra menor e mais clara, sentada na mesma linha da pauta -->
            @for (l of b.lines; track $index) {
              <div class="linha paragrafo sutil" [attr.data-l]="at(b, $index)"><span class="sutil-texto">@for (s of l; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}</span></div>
            }
          }
          @case ('hr') {
            <div class="linha divisoria" role="separator" [attr.data-l]="at(b)"></div>
          }
          @case ('code') {
            <!-- o bloco de código: a folha de formulário contínuo (o papel fica na peça; as letras rolam de
                 lado por cima dele), a linguagem impressa no alto e Copiar no canto -->
            @let lingua = codeName(b);
            <div class="codigo-peca" [attr.data-l]="at(b)" role="group" [attr.aria-label]="lingua ? 'Código em ' + lingua : 'Código'">
              @if (lingua) {
                <span class="codigo-lingua" aria-hidden="true">{{ lingua }}</span>
              }
              <pre class="codigo" [attr.data-lingua]="b.lang ?? null"><code>@for (t of codeTokens(b); track $index) {@if (t.c) {<span [class]="t.c">{{ t.t }}</span>} @else {{{ t.t }}}}</code></pre>
              <button type="button" class="codigo-copiar tocavel" aria-label="Copiar o código" title="Copiar o código" (click)="copyCode($event, b.text)"><lucide-icon [img]="CopyIcon" [size]="13" aria-hidden="true" /><span class="codigo-copiar-nome" aria-hidden="true">Copiar</span><span class="codigo-copiado" aria-hidden="true">Copiado</span></button>
            </div>
          }
          @case ('widget') {
            <app-note-widget class="widget" [attr.data-l]="at(b)" [name]="b.name" [args]="b.args" [size]="b.size" [links]="links()" />
          }
          @case ('table') {
            <!-- a tabela no jeito dela (sem a marca, a branca): o papel por dentro do rolo, que rola de lado.
                 A peça em volta é do tamanho do papel (até a largura da linha) e leva o broche de ampliar
                 no canto: ela sobe inteira para o meio da tela, a larga com todas as colunas (até 2,5 vezes,
                 como o contador: mais, ela vira letreiro) -->
            @let look = b.look ?? 'branca';
            <div #tabela class="tabela-peca amplia" [attr.data-l]="at(b)" data-zoom-min="1" data-zoom-max="2.5" [attr.data-papel-proprio]="look === 'caneta' ? null : ''">
            <div [class]="'tabela-rolo jeito-' + look">
              <div class="tabela-papel">
              <table class="tabela">
                <thead>
                  <tr>
                    @for (c of b.head; track $index; let i = $index) {
                      <th scope="col" [style.text-align]="b.align[i]"><span class="th-texto">@for (s of c; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}</span></th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (r of b.rows; track $index) {
                    <tr>
                      @for (c of r; track $index; let i = $index) {
                        <td [style.text-align]="b.align[i]">@for (s of c; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
              </div>
            </div>
            <app-zoom-knob class="ampliar" [label]="tableLabel(b)" (pressed)="liftTable(tabela)" />
            </div>
          }
          @case ('callout') {
            <!-- o card: o papel do jeito dele, com o desenho e o título (sem título, o nome do jeito) em
                 cima e o que tem dentro embaixo; o que fecha abre e fecha pelo título -->
            @if (b.fold) {
              <details class="cartao" [attr.data-jeito]="cardLook(b.type)" [open]="b.fold === '+'">
                <summary class="linha cartao-topo tocavel" [attr.data-l]="at(b)" (click)="$event.stopPropagation()">
                  <ng-container *ngTemplateOutlet="cartaoTopo; context: { $implicit: b }" />
                  <span class="cartao-seta" aria-hidden="true"><lucide-icon [img]="ChevronIcon" [size]="16" /></span>
                </summary>
                @if (b.body.length) {
                  <div class="cartao-corpo"><ng-container *ngTemplateOutlet="blocos; context: { $implicit: b.body }" /></div>
                }
              </details>
            } @else {
              <div class="cartao" role="note" [attr.data-jeito]="cardLook(b.type)" [attr.aria-label]="cardTitle(b)">
                <div class="linha cartao-topo" [attr.data-l]="at(b)"><ng-container *ngTemplateOutlet="cartaoTopo; context: { $implicit: b }" /></div>
                @if (b.body.length) {
                  <div class="cartao-corpo"><ng-container *ngTemplateOutlet="blocos; context: { $implicit: b.body }" /></div>
                }
              </div>
            }
          }
          @case ('check') {
            <ul class="lista tarefas">
              @for (it of b.items; track it.line) {
                <li class="linha" [class.feita]="it.done" [attr.data-l]="anchors() ? it.line : null">
                  <label>
                    @if (checkable()) {
                      <input type="checkbox" [checked]="it.done" (change)="tick($event, it)" />
                    } @else {
                      <span class="caixa" [class.marcada]="it.done" aria-hidden="true"></span>
                      <span class="sr-only">{{ it.done ? 'Feito:' : 'A fazer:' }}</span>
                    }
                    <span class="tarefa">@for (s of it.spans; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}</span>
                  </label>
                  <!-- a descrição, a foto, a lista de dentro: fora do rótulo (tocar nelas não marca a
                       tarefa), no alinhamento do texto dela; feita, riscadas junto -->
                  @if (it.body) {
                    <div class="corpo"><ng-container *ngTemplateOutlet="blocos; context: { $implicit: it.body }" /></div>
                  }
                </li>
              }
              <!-- as feitas escondidas: uma linha só, no fim da sequência, com o tique delas; tocar
                   nela mostra as feitas como são (até a página recarregar) -->
              @if (b.folded; as n) {
                <li class="linha resumo">
                  <button type="button" class="resumo-btn tocavel" [title]="n === 1 ? 'Mostrar a tarefa feita' : 'Mostrar as tarefas feitas'" (click)="unfold($event, b.seq)">
                    <span class="tique" aria-hidden="true"></span>
                    <span class="resumo-nome">{{ n === 1 ? '1 tarefa feita' : n + ' tarefas feitas' }}<span class="sr-only">{{ n === 1 ? ' (escondida): mostrar' : ' (escondidas): mostrar' }}</span></span>
                  </button>
                </li>
              }
            </ul>
          }
        }
      }
    </ng-template>
    <!-- a linha de cima do card: o desenho do jeito e o título escrito (com as marcas), ou o nome do jeito -->
    <ng-template #cartaoTopo let-b>
      <span class="cartao-icone" aria-hidden="true"><lucide-icon [img]="cardIcon(b.type)" [size]="18" /></span>
      <span class="cartao-titulo">@if (b.title.length) {@for (s of b.title; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}} @else {{{ cardName(b.type) }}}</span>
    </ng-template>
    <!-- o spoiler: a tarja preta por cima do pedaço (o pedaço por dentro, com as marcas dele, fica inerte até revelar) -->
    <ng-template #span let-s>@if (s.spoiler) {<span class="spoiler" role="button" tabindex="0" aria-label="Spoiler escondido: revelar" title="Spoiler: toque para revelar" (click)="reveal($event)" (keydown.enter)="reveal($event)" (keydown.space)="reveal($event)"><span class="spoiler-texto" inert><ng-container *ngTemplateOutlet="pedaco; context: { $implicit: s }" /></span></span>} @else {<ng-container *ngTemplateOutlet="pedaco; context: { $implicit: s }" />}</ng-template>
    <ng-template #pedaco let-s>@if (s.link) {<ng-container *ngTemplateOutlet="elo; context: { $implicit: s }" />} @else if (s.href) {@let rid = reminderId(s.href); @if (rid) {<ng-container *ngTemplateOutlet="lembrete; context: { $implicit: s, id: rid }" />} @else {<a class="elo url" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" [href]="s.href" target="_blank" rel="noopener noreferrer" [title]="s.href" (click)="$event.stopPropagation()">{{ s.text }}<span class="sr-only"> (abre em outra aba)</span></a>}} @else if (s.code) {<code class="cod" [class.marca]="s.mark" [class.riscado]="s.strike" [class.sutil]="s.subtle">{{ s.text }}</code>} @else if (s.bold || s.italic || s.strike || s.mark || s.subtle) {<span class="enf" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" [class.riscado]="s.strike" [class.marca]="s.mark">{{ s.text }}</span>} @else {{{ s.text }}}</ng-template>
    <!-- o link de lembrete ("[texto](murall://lembrete/ID)", ver core/reminder-links.ts): a caneta do link
         com o desenho do calendário depois; o dia no title e no leitor de tela (e no PDF, pelo data-quando).
         Tracejado, o que não está no seu Calendário; sem como saber (o mural de outra pessoa), só aparece -->
    <ng-template #lembrete let-s let-id="id">@let info = reminderOf(id); @if (info && links()?.openReminder) {<span class="elo lembrete" [style.--lembrete-desenho]="maskOf(info)" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" role="link" tabindex="0" [attr.aria-label]="s.text + ': abrir o lembrete ' + info.title + ', ' + info.when + (info.past ? ', já passou' : '')" [title]="reminderTitle(info)" [attr.data-quando]="info.date" (click)="openReminder($event, id)" (keydown.enter)="openReminder($event, id)"><ng-container *ngTemplateOutlet="lembreteTexto; context: { $implicit: s.text }" /></span>} @else if (info) {<span class="elo lembrete" [style.--lembrete-desenho]="maskOf(info)" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" [title]="reminderTitle(info)" [attr.data-quando]="info.date"><ng-container *ngTemplateOutlet="lembreteTexto; context: { $implicit: s.text }" /><span class="sr-only"> (lembrete: {{ info.when }})</span></span>} @else if (info === null) {<span class="elo lembrete quebrado" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" title="Esse lembrete não está no seu Calendário (foi apagado, ou é de outra pessoa)"><ng-container *ngTemplateOutlet="lembreteTexto; context: { $implicit: s.text }" /><span class="sr-only"> (lembrete que não está no seu Calendário)</span></span>} @else {<span class="elo lembrete" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" title="Um lembrete do Calendário de quem escreveu"><ng-container *ngTemplateOutlet="lembreteTexto; context: { $implicit: s.text }" /><span class="sr-only"> (lembrete do Calendário)</span></span>}</ng-template>
    <!-- o texto do link de lembrete: a última palavra presa ao desenho do calendário (ele não cai sozinho na linha de baixo) -->
    <ng-template #lembreteTexto let-t>@let p = lastWord(t);{{ p[0] }}<span class="elo-fim">{{ p[1] }}</span></ng-template>
    <!-- o link: um span com papel de link (quebra a linha junto com o texto, o que um botão não faz) -->
    <ng-template #elo let-s>@let l = links(); @let title = s.ref ?? s.text; @if (!l) {{{ '[[' + (s.ref ? s.ref + '|' : '') + s.text + ']]' }}} @else if (!l.resolve) {<span class="elo" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" [attr.title]="s.ref ?? null">{{ s.text }}</span>} @else {@let note = l.resolve(title); @if (note && l.open) {<span class="elo" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" role="link" tabindex="0" [attr.aria-label]="(s.ref ? s.text + ': ' : '') + 'abrir a anotação ' + note.game.name" (click)="go($event, note)" (keydown.enter)="go($event, note)">{{ s.text }}</span>} @else if (note) {<span class="elo" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle">{{ s.text }}</span>} @else if (l.create) {<span class="elo quebrado" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" role="button" tabindex="0" [attr.aria-label]="'Criar a anotação ' + title" [title]="'Ainda não tem uma anotação ' + title + '. Toque para criar.'" (click)="make($event, title)" (keydown.enter)="make($event, title)" (keydown.space)="make($event, title)">{{ s.text }}</span>} @else {<span class="elo quebrado" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" title="Essa anotação não existe ou não está à mostra">{{ s.text }}</span>}}</ng-template>
  `,
  imports: [NgTemplateOutlet, NoteWidget, ZoomKnob, IconModule],
  styleUrl: './rich-text-codigo.scss',
  styles: `
    @use 'formatado';

    :host {
      display: block;
    }
    :host(.formatado) {
      white-space: normal;
    }
    @include formatado.linha;
    /* o texto comum desce na linha o quanto quem usa pedir (a leitura, para a letra à mão assentar na
       pauta); o título e a divisória ficam onde estão. Só se vê: o lugar de cada linha não muda. O
       corpo de um item sobe o que o item desceu, e cada linha dele desce por conta própria */
    .linha:where(:not(.titulo, .divisoria, .cartao-topo)) {
      position: relative;
      top: var(--texto-desce, 0px);
    }
    .corpo {
      position: relative;
      top: calc(var(--texto-desce, 0px) * -1);
    }
    /* o parágrafo começa na margem: quem quer o recuo escreve os espaços (a linha os guarda) */
    @include formatado.enfases;
    :host-context(app-review-card[data-cor='amarelo']) .marca:not(.cartao *),
    :host-context(.verso.cartolina[data-cor='amarelo']) .marca:not(.cartao *) {
      --marca-cor: rgb(255 112 168 / 0.45);
    }
    :host-context(app-review-card[data-cor$='-escuro']) .marca:not(.cartao *),
    :host-context(.verso.cartolina[data-cor$='-escuro']) .marca:not(.cartao *),
    :host-context(app-review-card[data-cor='preto']) .marca:not(.cartao *),
    :host-context(.verso.cartolina[data-cor='preto']) .marca:not(.cartao *) {
      --marca-cor: rgb(255 218 66 / 0.32);
    }
    /* o spoiler: a tarja de caneta preta da altura das letras (como a do marca-texto, só que cobrindo
       tudo), cada linha com a sua; o texto embaixo fica transparente, com as marcas dele. Numa
       cartolina escura, a tarja é de corretivo claro */
    .spoiler {
      --tarja: #151515;
      background: linear-gradient(var(--tarja), var(--tarja)) no-repeat 0 56% / 100% 1.08em;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
      padding: 0 0.12em;
      border-radius: 3px 2px 3px 2px;
      cursor: pointer;
      transition: color var(--t-ui, 160ms) var(--ease-ui, ease-out);
    }
    .spoiler:not(.revelado) {
      color: transparent;
      user-select: none;
    }
    /* os pedaços colados do mesmo spoiler (um negrito no meio) são uma tarja só, sem emenda */
    .spoiler:has(+ .spoiler) {
      padding-right: 0;
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
    .spoiler + .spoiler {
      padding-left: 0;
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
    /* o que vem dentro (negrito, marca-texto, link, código) também some embaixo da tarja */
    .spoiler:not(.revelado) .spoiler-texto * {
      color: transparent !important;
      background: none !important;
      box-shadow: none !important;
      text-decoration-color: transparent !important;
    }
    @media (hover: hover) {
      .spoiler:not(.revelado):hover {
        --tarja: #3a3a3a;
      }
    }
    .spoiler:focus-visible {
      outline: 2.5px solid var(--focus, #151515);
      outline-offset: 2px;
    }
    .spoiler.revelado {
      --tarja: rgb(21 21 21 / 0.09);
      cursor: auto;
    }
    /* (no card, o papel é claro em toda cartolina: a tarja, o link e o marca-texto ficam os de sempre) */
    :host-context(app-review-card[data-cor$='-escuro']) .spoiler:not(.cartao *),
    :host-context(.verso.cartolina[data-cor$='-escuro']) .spoiler:not(.cartao *),
    :host-context(app-review-card[data-cor='preto']) .spoiler:not(.cartao *),
    :host-context(.verso.cartolina[data-cor='preto']) .spoiler:not(.cartao *) {
      --tarja: #f1f1ec;
    }
    :host-context(app-review-card[data-cor$='-escuro']) .spoiler:not(.revelado, .cartao *):hover,
    :host-context(.verso.cartolina[data-cor$='-escuro']) .spoiler:not(.revelado, .cartao *):hover,
    :host-context(app-review-card[data-cor='preto']) .spoiler:not(.revelado, .cartao *):hover,
    :host-context(.verso.cartolina[data-cor='preto']) .spoiler:not(.revelado, .cartao *):hover {
      --tarja: #cfcfc8;
    }
    :host-context(app-review-card[data-cor$='-escuro']) .spoiler.revelado:not(.cartao *),
    :host-context(.verso.cartolina[data-cor$='-escuro']) .spoiler.revelado:not(.cartao *),
    :host-context(app-review-card[data-cor='preto']) .spoiler.revelado:not(.cartao *),
    :host-context(.verso.cartolina[data-cor='preto']) .spoiler.revelado:not(.cartao *) {
      --tarja: rgb(241 241 236 / 0.14);
    }
    @media (prefers-reduced-motion: reduce) {
      .spoiler {
        transition: none;
      }
    }
    /* (o código mora em rich-text-codigo.scss: o orçamento de 24 kB por folha de estilo) */

    @include formatado.titulos;

    @include formatado.citacao;

    @include formatado.sutil;

    @include formatado.divisoria;

    /* ===== A tabela, nos cinco jeitos (ver core/tables.ts) =====
       Toda fileira tem a altura de uma linha da pauta (a letra sentada nela), e os fios entre as
       células são fundos, não bordas: não somam à altura. Nos jeitos de papel, o papel tem meia linha
       de cada lado (um par de linhas da pauta a mais), e o texto de baixo continua nas linhas da folha. */
    .tabela-rolo {
      @include formatado.tabela-rolo;
    }
    /* a peça da tabela: do tamanho do papel (a estreita não ocupa a linha toda), no mínimo o do papel
       (min(100%, 16em)) e no máximo a linha, onde a larga rola; o broche de ampliar no canto de cima
       dela, metade para fora, como o do contador */
    .tabela-peca {
      position: relative;
      width: fit-content;
      min-width: min(100%, 16em);
      max-width: 100%;
    }
    .tabela-peca > .ampliar {
      position: absolute;
      z-index: 3;
      top: -11px;
      right: -11px;
    }
    /* a Caneta, sem papel, sobe na folha creme (ui/piece-lift.ts): a tinta é a escura, mesmo vinda
       da cartolina escura, onde ela era clara */
    .tabela-peca.erguida-papel {
      --ink: #151515;
      --ink-2: rgb(21 21 21 / 0.78);
      color: var(--ink);
    }
    /* no alto, a larga que não cabe nem do tamanho do texto rola de lado (a ficha do mural a corta),
       e o papel para na beirada da peça (sem o lugar da sombra à direita, que passaria dela e, na
       peça que rola, daria uma rolagem de lado de uns pixels) */
    .tabela-peca.erguida .tabela-rolo {
      overflow-x: auto;
    }
    .tabela-peca:is(.erguida-estreita, .erguida-rola) .tabela-rolo {
      margin-right: 0;
      padding-right: 0;
    }
    /* a comprida e larga: a peça rola para os dois lados (as duas barras na beirada dela; a de lado
       no rolo ficaria no pé da tabela, depois de todas as fileiras) */
    .tabela-peca.erguida-estreita.erguida-rola .tabela-rolo {
      overflow: visible;
    }
    /* a Caneta no alto: a borda de fora (metade dela passa da tabela) não fica cortada pelo rolo */
    .tabela-peca.erguida .jeito-caneta {
      max-width: none;
      padding: 2px;
      margin: -2px;
    }
    /* os jeitos de papel: o rolo dá espaço para a sombra do papel não ser cortada, sem mudar o lugar dele */
    .jeito-branca,
    .jeito-listrada,
    .jeito-quadriculada,
    .jeito-recibo {
      @include formatado.tabela-rolo-papel;
    }
    .tabela-papel {
      @include formatado.tabela-papel;
    }
    .tabela {
      @include formatado.tabela;
    }
    .tabela th,
    .tabela td {
      @include formatado.tabela-celula;
    }
    .tabela th {
      @include formatado.tabela-cabeca;
    }

    /* --- Branca: a folha de impresso colada na cartolina, o cabeçalho sobre um fio de tinta --- */
    .jeito-branca .tabela-papel,
    .jeito-listrada .tabela-papel {
      @include formatado.branca-listrada-papel;
    }
    .jeito-branca .tabela-papel {
      @include formatado.branca-papel;
    }
    .jeito-branca .tabela,
    .jeito-listrada .tabela {
      @include formatado.branca-listrada-tabela;
    }
    .jeito-branca th {
      @include formatado.branca-cabeca;
    }
    .jeito-branca td {
      @include formatado.branca-celula;
    }
    .jeito-branca tr:last-child td {
      @include formatado.branca-ultima;
    }

    /* --- Listrada: o cabeçalho numa faixa de tinta, as linhas uma sim, uma não num papel mais escuro --- */
    /* a faixa no alto do papel e a última linha no pé: sem margem (a tabela tem as linhas inteiras dela) */
    .jeito-listrada .tabela-papel {
      @include formatado.listrada-papel;
    }
    .jeito-listrada th {
      @include formatado.listrada-cabeca;
    }
    .jeito-listrada tbody tr:nth-child(even) td {
      @include formatado.listrada-par;
    }

    /* --- Quadriculada: a folha do caderno de quadrinhos, o cabeçalho passado com marca-texto --- */
    .jeito-quadriculada .tabela-papel {
      @include formatado.quadriculada-papel;
    }
    .jeito-quadriculada .tabela {
      @include formatado.quadriculada-tabela;
    }
    .jeito-quadriculada :is(th, td) {
      @include formatado.quadriculada-celula;
    }
    .jeito-quadriculada th {
      @include formatado.quadriculada-cabeca;
    }
    /* o marca-texto passado só no que está escrito (como o ==marca-texto== do texto) */
    .jeito-quadriculada .th-texto {
      @include formatado.quadriculada-cabeca-texto;
    }

    /* --- Caneta: riscada direto na cartolina, o cabeçalho em letra de carimbo (o jeito de antes) --- */
    .jeito-caneta .tabela {
      @include formatado.caneta-tabela;
    }
    .jeito-caneta :is(th, td) {
      @include formatado.caneta-celula;
    }
    .jeito-caneta th {
      @include formatado.caneta-cabeca;
    }

    /* --- Recibo: a bobina do cupom, picotada em cima e embaixo, com o tracejado da impressora --- */
    .jeito-recibo {
      @include formatado.recibo-rolo;
    }
    .jeito-recibo .tabela-papel {
      @include formatado.recibo-papel;
    }
    .jeito-recibo .tabela {
      @include formatado.recibo-tabela;
    }
    .jeito-recibo th {
      @include formatado.recibo-cabeca;
    }
    /* o tracejado da impressora embaixo do cabeçalho e da última linha: na fileira inteira, um traço
       só de ponta a ponta (em cada célula, ele recomeçava torto na emenda das colunas) */
    .jeito-recibo :is(thead tr, tbody tr:last-child) {
      @include formatado.recibo-tracejado;
    }

    @include formatado.seta-url;
    @include formatado.marca-lembrete;

    /* ===== O card: o papel colorido colado no texto (ver ui/_formatado.scss), com a beirada de
       baixo rasgada. Meia linha da pauta em cima e embaixo: o card soma uma linha ===== */
    .cartao {
      @include formatado.cartao-papel;
      position: relative;
      margin: 0;
      padding: calc(var(--line, 1.5em) / 2) formatado.$cartao-lado;
      border-radius: 2px 2px 0 0;
    }
    .cartao::after {
      @include formatado.cartao-rasgo;
    }
    .cartao-topo {
      @include formatado.cartao-topo;
    }
    .cartao-icone {
      @include formatado.cartao-icone;
    }
    .cartao-seta {
      @include formatado.cartao-seta;
    }
    /* o que fecha: o título é o botão (sem o triângulo do navegador), a setinha vira com ele fechado */
    summary.cartao-topo {
      list-style: none;
      cursor: pointer;
    }
    summary.cartao-topo::-webkit-details-marker {
      display: none;
    }
    .cartao:not([open]) > summary .cartao-seta {
      rotate: -90deg;
    }
    summary.cartao-topo:focus-visible {
      outline: 2.5px solid var(--c-tinta);
      outline-offset: 1px;
      border-radius: 2px;
    }
    @media (hover: hover) {
      summary.cartao-topo:hover .cartao-seta {
        opacity: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .cartao-seta {
        transition: none;
      }
    }

    .lista {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    /* o que vem embaixo do item: no alinhamento do texto dele; o respiro antes do próximo item só
       quando quem usa pede (o PDF): aqui, a linha em branco só aparece se foi escrita */
    .corpo {
      white-space: normal;
    }
    .tarefas .corpo {
      padding-left: formatado.$item-lugar;
    }
    .lista > li:has(> .corpo):not(:last-child) {
      @include formatado.respiro-do-corpo;
    }
    /* o respiro entre uma tarefa e a seguinte: quem usa diz quanto (a ficha do mural, onde não há
       pauta para seguir); sem dizer, nenhum, e cada tarefa fica na linha dela */
    .tarefas > li + li {
      margin-top: var(--tarefa-respiro, 0);
    }
    /* a tarefa feita risca o que vem embaixo dela: o texto a lápis, como o dela, e a foto ou o vídeo
       com o risco de caneta (ver ui/glued-media.ts, --riscado) */
    .feita > .corpo {
      @include formatado.corpo-feito;
    }
    .feita > .corpo :is(.linha, th, td, .codigo) {
      @include formatado.corpo-feito-risco;
    }
    /* o item fica pendurado: a segunda linha começa onde o texto começa, não embaixo do marcador */
    .lista > li {
      position: relative;
      padding-left: formatado.$item-lugar;
    }
    /* só na lista comum: a numerada tem o número no lugar, e a de tarefas, a caixinha */
    .lista:not(.tarefas, .numerada) > li::before {
      @include formatado.marcador-ponto;
    }
    /* o número do pai na frente ("1.1.") pede mais lugar: um terço de em por sinal dele */
    .numerada > li {
      counter-increment: item;
      @include formatado.numero-lugar;
    }
    .numerada > li::before {
      content: attr(data-pre) counter(item) '.';
      @include formatado.marcador-numero;
    }
    .tarefas > li {
      padding-left: 0;
    }
    .tarefas label {
      display: grid;
      grid-template-columns: formatado.$item-lugar minmax(0, 1fr);
      align-items: start;
    }
    /* a caixinha desenhada a caneta, sentada na linha da pauta; quem usa pode subi-la (--caixa-sobe), para
       ela ficar no meio das letras quando o texto desce na linha (a leitura) */
    .tarefas input,
    .tarefas .caixa {
      @include formatado.caixa;
    }
    .tarefas input:focus-visible {
      /* na cor da tinta: o amarelo sumia na cartolina amarela */
      outline: 3px solid currentColor;
      outline-offset: 2px;
    }
    /* feita: o tique vermelho de caneta por cima da caixinha, e o texto riscado a lápis */
    .tarefas input:checked,
    .tarefas .caixa.marcada {
      @include formatado.caixa-marcada;
    }
    /* as feitas escondidas: o tique vermelho solto (sem caixinha, que ali não há o que marcar) e a
       conta a lápis, miúda e apagada, para não parecer mais uma tarefa */
    .resumo-btn {
      display: grid;
      width: fit-content;
      max-width: 100%;
      grid-template-columns: 1.35em minmax(0, 1fr);
      align-items: start;
      margin: 0;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    /* é um botão: com o mouse em cima, a conta escurece e ganha o risco pontilhado do lápis */
    .resumo-btn:hover .resumo-nome {
      opacity: 0.9;
      text-decoration: underline dotted 1.5px;
      text-underline-offset: 3px;
    }
    .resumo-btn:focus-visible {
      outline: 3px solid currentColor;
      outline-offset: 2px;
      border-radius: 2px;
    }
    .resumo .tique {
      width: 0.86em;
      height: 0.86em;
      margin: calc((var(--line, 1.5em) - 0.86em) / 2 + 0.06em - var(--caixa-sobe, 0px)) 0 0;
      rotate: -3deg;
      background:
        no-repeat center / 120% 120%
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M3 10.5 8 15.5 18 2' fill='none' stroke='%23c4302b' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }
    .resumo-nome {
      font-size: 0.86em;
      font-style: italic;
      opacity: 0.68;
    }
    .feita .tarefa {
      @include formatado.tarefa-feita;
    }
    @include formatado.elo;
    /* nas escuras: a caneta azul-céu, que aparece no escuro, e o marca-texto mais fraco */
    :host-context(app-review-card[data-cor$='-escuro']) .elo:not(.cartao *),
    :host-context(.verso.cartolina[data-cor$='-escuro']) .elo:not(.cartao *),
    :host-context(app-review-card[data-cor='preto']) .elo:not(.cartao *),
    :host-context(.verso.cartolina[data-cor='preto']) .elo:not(.cartao *) {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.4C16 4.9 31 7.3 49 5.7S82 4.6 99 5.9' fill='none' stroke='%238fd3ff' stroke-width='2.4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
      --elo-marca: rgb(143 211 255 / 0.26);
    }
    :host-context(app-review-card[data-cor$='-escuro']) .elo.quebrado:not(.cartao *),
    :host-context(.verso.cartolina[data-cor$='-escuro']) .elo.quebrado:not(.cartao *),
    :host-context(app-review-card[data-cor='preto']) .elo.quebrado:not(.cartao *),
    :host-context(.verso.cartolina[data-cor='preto']) .elo.quebrado:not(.cartao *) {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.2C16 5.2 31 7 49 5.8S82 4.9 99 6' fill='none' stroke='%23f3ece0' stroke-opacity='.6' stroke-width='1.8' stroke-dasharray='5 4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
    }
    :host-context(.cartolina[data-cor$='-escuro']) .feita .tarefa:not(.cartao *),
    :host-context(.cartolina[data-cor='preto']) .feita .tarefa:not(.cartao *),
    :host-context(.cartolina[data-cor$='-escuro']) .feita > .corpo .linha:not(.cartao *),
    :host-context(.cartolina[data-cor='preto']) .feita > .corpo .linha:not(.cartao *) {
      text-decoration-color: rgb(243 236 224 / 0.5);
    }
  `,
})
export class RichText {
  readonly text = input.required<string>();
  /** As tarefas podem ser marcadas aqui (a ficha é sua); senão, a caixinha só mostra. */
  readonly checkable = input(false);
  /** Marcou ou desmarcou a tarefa da linha dada. */
  readonly toggled = output<number>();
  /** Os links para outras anotações; null, os colchetes ficam no texto (as resenhas). */
  readonly links = input<NoteLinks | null>(null);

  /**
   * As tarefas feitas viram uma conta no fim de cada sequência (as anotações, no mural e na leitura).
   * Só as que estavam feitas quando a ficha apareceu: a que você marca agora continua à vista até a
   * página recarregar ou o texto mudar de verdade (não só as marcas).
   */
  readonly fold = input(false);
  /**
   * De quem é o texto (o id da anotação): as feitas que a pessoa abriu tocando na conta ficam abertas
   * em todo lugar onde ela aparece, até a página recarregar (ver core/shown-done.ts). Sem ele, só aqui.
   */
  readonly foldKey = input<string | null>(null);
  /**
   * Cada linha desenhada leva o número da linha do texto de onde saiu (`data-l`): a prévia do editor
   * acha nelas o trecho onde está o cursor (ver ReviewEditor.followCaret). Só lá.
   */
  readonly anchors = input(false);

  /** O número da linha do texto da `i`-ésima linha do bloco (só com `anchors`). */
  protected at(b: Block, i = 0): number | null {
    if (!this.anchors()) return null;
    const start = blockLine(b);
    return start === null ? null : start + i;
  }

  /** A tabela no meio da tela (o broche de ampliar dela): feito só quando uma sobe, não em todo texto. */
  private lift: PieceLift | null = null;
  private readonly destroyRef = inject(DestroyRef);
  protected liftTable(peca: HTMLElement): void {
    if (!this.lift) {
      const lift = (this.lift = new PieceLift());
      this.destroyRef.onDestroy(() => lift.close(true));
    }
    // sobe com a largura do que ela desenha, também a parte que rola: o papel (ele começa no canto
    // da peça), ou na Caneta, sem papel, a tabela (o papel dela é mais largo que ela, até 16em).
    // A do layout: na ficha do mural, a caixa na tela vem torta e maior (o giro e o hover)
    const drawn = peca.querySelector<HTMLElement>(peca.querySelector('.jeito-caneta') ? '.tabela' : '.tabela-papel');
    // a rolagem de lado de quando ela subiu volta quando ela desce (no alto, ela cabe e volta ao começo)
    const rolo = peca.querySelector<HTMLElement>('.tabela-rolo');
    const left = rolo?.scrollLeft ?? 0;
    this.lift.toggle(peca, { width: drawn ? layoutWidth(drawn) : undefined, closed: () => rolo?.scrollTo({ left }) });
  }
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly CopyIcon = ICON.copiar;

  /** O nome da linguagem do bloco ("JavaScript", ou a palavra escrita); "" sem nenhuma. */
  protected codeName(b: Block): string {
    return b.kind === 'code' && b.lang ? codeLangName(b.lang) : '';
  }

  // os pedaços coloridos de cada bloco (refeitos quando o colorir chega: a versão dele vai junto)
  private readonly codeCache = new WeakMap<Block, { v: number; t: CodeToken[] }>();
  /** O texto do bloco em pedaços com a tinta de cada um (sem linguagem, ou com o colorir chegando: um pedaço só). */
  protected codeTokens(b: Block): CodeToken[] {
    if (b.kind !== 'code') return [];
    const v = codeHighlightReady();
    const hit = this.codeCache.get(b);
    if (hit && hit.v === v) return hit.t;
    const t = codeTokens(b.text, b.lang ? codeRanges(b.text, b.lang) : null);
    this.codeCache.set(b, { v, t });
    return t;
  }

  /** Copiar o bloco (só as letras, sem as crases nem a linguagem): o botão diz "Copiado" por um instante. */
  protected async copyCode(e: Event, text: string): Promise<void> {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      btn.setAttribute('aria-label', 'O navegador não deixou copiar');
      return;
    }
    btn.classList.add('copiado');
    btn.setAttribute('aria-label', 'Código copiado');
    // (cada botão com a sua volta: copiar outro bloco logo depois não deixa este preso no "Copiado")
    clearTimeout(this.copiedTimers.get(btn));
    this.copiedTimers.set(
      btn,
      setTimeout(() => {
        btn.classList.remove('copiado');
        btn.setAttribute('aria-label', 'Copiar o código');
      }, 1600),
    );
  }
  private readonly copiedTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
  protected cardLook(type: string): string {
    return calloutLook(type);
  }
  protected cardIcon(type: string): LucideIconData {
    return calloutIcon(type);
  }
  protected cardName(type: string): string {
    return calloutName(type);
  }
  /** O nome do card para o leitor de tela: o título escrito (sem as marcas), ou o nome do jeito. */
  protected cardTitle(b: Block): string {
    if (b.kind !== 'callout') return '';
    return b.title.map((s) => s.text).join('').trim() || calloutName(b.type);
  }

  /** O que o leitor de tela diz no broche: "Ampliar a tabela: Jogo, Horas, Nota". */
  protected tableLabel(b: Block): string {
    if (b.kind !== 'table') return 'Ampliar a tabela';
    const head = b.head.map((c) => c.map((s) => s.text).join('').trim()).filter(Boolean).join(', ');
    return 'Ampliar a tabela' + (head ? ': ' + (head.length > 60 ? head.slice(0, 59).trimEnd() + '…' : head) : '');
  }

  protected readonly formatted = computed(() => hasFormatting(this.text()));
  // contadas como no texto formatado (o "\r" sozinho também quebra a linha, ver core/rich-text.ts)
  protected readonly plainLines = computed(() => linesOf(this.text()));
  private readonly doneThen = linkedSignal({ source: this.text, computation: snapshotDone });
  protected readonly blocks = computed(() => {
    const blocks = parseRich(this.text());
    // lido sempre, mesmo sem recolher: o retrato precisa ver cada marca (a desmarcada sai dele)
    const hide = this.doneThen().lines;
    return this.fold() ? foldDone(blocks, hide, this.shown()) : blocks;
  });

  /** O molde dos blocos recebe a lista sem tipo (é o mesmo para o texto e para o corpo de um item). */
  protected asBlocks(bs: unknown): readonly Block[] {
    return bs as readonly Block[];
  }

  private readonly shownDone = inject(ShownDone);
  /** Só aqui, sem `foldKey`. */
  private readonly shownHere = signal<ReadonlySet<number>>(new Set());
  private readonly shown = computed(() => {
    const key = this.foldKey();
    return key ? this.shownDone.of(key) : this.shownHere();
  });

  /**
   * Tira a tarja do spoiler tocado (e dos pedaços colados a ele do mesmo spoiler, como um negrito no
   * meio). O toque não chega à ficha (não abre a leitura); revelado, ele vira texto comum, fora da
   * ordem do Tab, mas com o foco onde estava.
   */
  protected reveal(e: Event): void {
    const el = e.currentTarget as HTMLElement;
    if (el.classList.contains('revelado')) return;
    e.preventDefault();
    e.stopPropagation();
    const group = [el];
    // entre dois pedaços seguidos, o Angular deixa só comentários
    const next = (n: Node | null, dir: 'previousSibling' | 'nextSibling'): HTMLElement | null => {
      while (n && n.nodeType === Node.COMMENT_NODE) n = n[dir];
      return n instanceof HTMLElement && n.classList.contains('spoiler') ? n : null;
    };
    for (let n = next(el.previousSibling, 'previousSibling'); n; n = next(n.previousSibling, 'previousSibling')) group.push(n);
    for (let n = next(el.nextSibling, 'nextSibling'); n; n = next(n.nextSibling, 'nextSibling')) group.push(n);
    for (const g of group) {
      g.classList.add('revelado');
      g.removeAttribute('role');
      g.removeAttribute('aria-label');
      g.removeAttribute('title');
      g.setAttribute('tabindex', '-1');
      g.querySelector('.spoiler-texto')?.removeAttribute('inert');
    }
  }

  /**
   * Tocou na caixinha: quem usa salva o texto com a tarefa marcada (ou desmarcada), e a caixinha mostra
   * o que o texto diz. Ela volta a como estava até o texto novo chegar: se nada for salvo (a nuvem
   * trocou o texto por baixo, a tarefa sumiu), ela não fica marcada sem estar.
   */
  protected tick(e: Event, it: { line: number; done?: boolean }): void {
    (e.target as HTMLInputElement).checked = !!it.done;
    this.toggled.emit(it.line);
  }

  /** Tocou na conta das feitas: a sequência dela aparece inteira. Só ela age (nada de abrir a ficha). */
  protected unfold(e: Event, seq: number | undefined): void {
    e.preventDefault();
    e.stopPropagation();
    if (seq === undefined) return;
    const key = this.foldKey();
    if (key) this.shownDone.show(key, seq);
    else this.shownHere.set(new Set([...this.shownHere(), seq]));
  }

  /** Tocou num link: só ele age (a ficha embaixo, a caixinha da tarefa, nada mais). */
  protected go(e: Event, note: Review): void {
    e.preventDefault();
    e.stopPropagation();
    this.links()?.open?.(note);
  }

  protected readonly reminderId = reminderLinkId;

  /** O lembrete do link: o que mostrar dele, null se não está no seu Calendário, undefined sem como saber. */
  protected reminderOf(id: string): ReminderLinkInfo | null | undefined {
    const find = this.links()?.reminder;
    return find ? find(id) : undefined;
  }

  /**
   * O texto do link de lembrete partido antes da última palavra, que vai presa ao desenho do calendário.
   * Uma palavra comprida demais leva só as duas últimas letras (presa inteira, ela não quebraria nunca).
   */
  protected lastWord(text: string): [string, string] {
    // (os espaços do fim vão com a última palavra: escrito à mão, "[Reunião ](…)" também vale)
    const at = text.search(/\S+\s*$/);
    if (at < 0) return [text, ''];
    const cut = text.slice(at).trim().length > 16 ? Math.max(at, text.trimEnd().length - 2) : at;
    return [text.slice(0, cut), text.slice(cut)];
  }

  /** O desenho depois do link: o ícone do lembrete, quando ele tem (sem, o calendário do CSS). */
  protected maskOf(info: ReminderLinkInfo): string | null {
    return iconMask(info.icon);
  }

  /** A dica do link de lembrete: o nome e quando ("Lembrete: Reunião · Amanhã, 9h"). */
  protected reminderTitle(info: ReminderLinkInfo): string {
    return reminderLinkTitle(info);
  }

  /** Tocou num link de lembrete: só ele age (o Calendário abre no dia dele). */
  protected openReminder(e: Event, id: string): void {
    e.preventDefault();
    e.stopPropagation();
    this.links()?.openReminder?.(id);
  }

  protected make(e: Event, title: string): void {
    e.preventDefault();
    e.stopPropagation();
    this.links()?.create?.(title);
  }
}


/**
 * A largura do elemento no layout (sem o giro nem a escala de quem está em volta), com a fração para
 * cima: o `offsetWidth` arredonda para baixo, e a tabela no alto rolaria 1px de lado.
 */
function layoutWidth(el: HTMLElement): number | undefined {
  const s = getComputedStyle(el);
  const n = (v: string) => parseFloat(v) || 0;
  const w = s.boxSizing === 'border-box' ? n(s.width) : n(s.width) + n(s.paddingLeft) + n(s.paddingRight) + n(s.borderLeftWidth) + n(s.borderRightWidth);
  return w > 0 ? Math.ceil(w) : undefined;
}
