import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { Block, blockLine, foldDone, hasFormatting, linesOf, parseRich, snapshotDone } from '../core/rich-text';
import { NoteLinks } from '../core/note-links';
import { ShownDone } from '../core/shown-done';
import { Review } from '../core/review';
import { NoteWidget } from './note-widget';

/**
 * O texto da ficha na leitura, com a formatação do editor (ver core/rich-text.ts): negrito, itálico,
 * listas e checklists. Quem desenha é o Angular, nunca HTML vindo do texto. Sem nenhuma marca, o
 * texto sai como foi escrito, sem ler marca nenhuma; com marcas, formatado. Dos dois jeitos, linha a
 * linha, cada uma numa linha da pauta, e cada linha de texto corrido é um parágrafo, com o recuo da
 * primeira linha (como se escreve à mão).
 *
 * O pai dá a letra, o tamanho e a altura da linha (`--line`); as tarefas só marcam com `checkable`.
 *
 * Os links "[[título]]" só valem com `links` (nas anotações, ver core/note-links.ts): a caneta azul
 * sublinhada, que abre a outra anotação; tracejado, o que aponta para uma anotação que não existe.
 * Sem `links` (as resenhas), os colchetes ficam como foram escritos.
 *
 * Os widgets ("{{contador: …}}", ver core/widgets.ts) viram a peça deles, numa linha só.
 *
 * O que vem embaixo de um item, recuado (a descrição, a foto, outra lista), fica no alinhamento do
 * texto dele, com uma linha da pauta de respiro antes do próximo item. Na tarefa feita, é riscado
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
            <pre class="codigo" [attr.data-l]="at(b)"><code>{{ b.text }}</code></pre>
          }
          @case ('widget') {
            <app-note-widget class="widget" [attr.data-l]="at(b)" [name]="b.name" [args]="b.args" [size]="b.size" [links]="links()" />
          }
          @case ('table') {
            <!-- a tabela no jeito dela (sem a marca, a branca): o papel por dentro do rolo, que rola de lado -->
            <div [class]="'tabela-rolo jeito-' + (b.look ?? 'branca')" [attr.data-l]="at(b)">
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
          }
          @case ('check') {
            <ul class="lista tarefas">
              @for (it of b.items; track it.line) {
                <li class="linha" [class.feita]="it.done" [attr.data-l]="anchors() ? it.line : null">
                  <label>
                    @if (checkable()) {
                      <input type="checkbox" [checked]="it.done" (change)="toggled.emit(it.line)" />
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
    <!-- o spoiler: a tarja preta por cima do pedaço (o pedaço por dentro, com as marcas dele, fica inerte até revelar) -->
    <ng-template #span let-s>@if (s.spoiler) {<span class="spoiler" role="button" tabindex="0" aria-label="Spoiler escondido: revelar" title="Spoiler: toque para revelar" (click)="reveal($event)" (keydown.enter)="reveal($event)" (keydown.space)="reveal($event)"><span class="spoiler-texto" inert><ng-container *ngTemplateOutlet="pedaco; context: { $implicit: s }" /></span></span>} @else {<ng-container *ngTemplateOutlet="pedaco; context: { $implicit: s }" />}</ng-template>
    <ng-template #pedaco let-s>@if (s.link) {<ng-container *ngTemplateOutlet="elo; context: { $implicit: s }" />} @else if (s.href) {<a class="elo url" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" [href]="s.href" target="_blank" rel="noopener noreferrer" [title]="s.href" (click)="$event.stopPropagation()">{{ s.text }}<span class="sr-only"> (abre em outra aba)</span></a>} @else if (s.code) {<code class="cod" [class.marca]="s.mark" [class.riscado]="s.strike" [class.sutil]="s.subtle">{{ s.text }}</code>} @else if (s.bold || s.italic || s.strike || s.mark || s.subtle) {<span class="enf" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" [class.riscado]="s.strike" [class.marca]="s.mark">{{ s.text }}</span>} @else {{{ s.text }}}</ng-template>
    <!-- o link: um span com papel de link (quebra a linha junto com o texto, o que um botão não faz) -->
    <ng-template #elo let-s>@let l = links(); @let title = s.ref ?? s.text; @if (!l) {{{ '[[' + (s.ref ? s.ref + '|' : '') + s.text + ']]' }}} @else if (!l.resolve) {<span class="elo" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" [attr.title]="s.ref ?? null">{{ s.text }}</span>} @else {@let note = l.resolve(title); @if (note && l.open) {<span class="elo" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" role="link" tabindex="0" [attr.aria-label]="(s.ref ? s.text + ': ' : '') + 'abrir a anotação ' + note.game.name" (click)="go($event, note)" (keydown.enter)="go($event, note)">{{ s.text }}</span>} @else if (note) {<span class="elo" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle">{{ s.text }}</span>} @else if (l.create) {<span class="elo quebrado" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" role="button" tabindex="0" [attr.aria-label]="'Criar a anotação ' + title" [title]="'Ainda não tem uma anotação ' + title + '. Toque para criar.'" (click)="make($event, title)" (keydown.enter)="make($event, title)" (keydown.space)="make($event, title)">{{ s.text }}</span>} @else {<span class="elo quebrado" [class.negrito]="s.bold" [class.italico]="s.italic" [class.sutil]="s.subtle" title="Essa anotação não existe ou não está à mostra">{{ s.text }}</span>}}</ng-template>
  `,
  imports: [NgTemplateOutlet, NoteWidget],
  styles: `
    :host {
      display: block;
    }
    :host(.formatado) {
      white-space: normal;
    }
    .linha {
      min-height: var(--line, 1.5em);
      white-space: pre-wrap;
    }
    /* cada linha de texto corrido começa um parágrafo: a primeira linha dele entra um pouco, como
       quem escreve à mão (a lista, o título, a tabela e o widget não) */
    .paragrafo {
      /* quem usa pode tirar o recuo (os comentários: cada fala começa na margem) */
      text-indent: var(--recuo, 1em);
    }
    /* ===== As ênfases ===== */
    .negrito {
      font-weight: 700;
    }
    .italico {
      font-style: italic;
    }
    /* riscado a lápis, por cima da letra */
    .riscado {
      text-decoration: line-through 2px;
      text-decoration-color: color-mix(in srgb, currentColor 62%, transparent);
    }
    /* o marca-texto: uma passada da ponta chanfrada, cada linha com a sua, na altura das letras
       baixas e um pouco acima, sem descer nas pernas do g e do p. A faixa tem altura própria (em em),
       e não a da caixa da fonte: a da letra à mão é bem mais alta que a linha e cobria a de cima e a
       de baixo, e as faixas de duas linhas seguidas se encostavam */
    .marca {
      --marca-cor: rgb(255 218 66 / 0.62);
      background: linear-gradient(var(--marca-cor), var(--marca-cor)) no-repeat 0 52% / 100% 0.7em;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
      padding: 0 0.1em;
      border-radius: 2px;
    }
    :host-context(app-review-card[data-cor='amarelo']) .marca {
      --marca-cor: rgb(255 112 168 / 0.45);
    }
    :host-context(app-review-card[data-cor$='-escuro']) .marca,
    :host-context(app-review-card[data-cor='preto']) .marca {
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
    :host-context(app-review-card[data-cor$='-escuro']) .spoiler,
    :host-context(app-review-card[data-cor='preto']) .spoiler {
      --tarja: #f1f1ec;
    }
    :host-context(app-review-card[data-cor$='-escuro']) .spoiler:not(.revelado):hover,
    :host-context(app-review-card[data-cor='preto']) .spoiler:not(.revelado):hover {
      --tarja: #cfcfc8;
    }
    :host-context(app-review-card[data-cor$='-escuro']) .spoiler.revelado,
    :host-context(app-review-card[data-cor='preto']) .spoiler.revelado {
      --tarja: rgb(241 241 236 / 0.14);
    }
    @media (prefers-reduced-motion: reduce) {
      .spoiler {
        transition: none;
      }
    }
    /* o código: letra de máquina de escrever, num retalho de papel mais escuro */
    .cod,
    .codigo {
      font-family: var(--f-mono);
      font-weight: 600;
    }
    .cod {
      padding: 0 0.28em;
      border-radius: 2px;
      background: color-mix(in srgb, currentColor 11%, transparent);
      font-size: 0.92em;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .codigo {
      margin: 0;
      padding: 0 0.6em;
      border-radius: 2px;
      background: color-mix(in srgb, currentColor 9%, transparent);
      box-shadow: inset 2px 0 0 color-mix(in srgb, currentColor 30%, transparent);
      font-size: 0.88em;
      line-height: var(--line, 1.5em);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    /* ===== Os títulos: a letra grossa de pincel; o terceiro, de carimbo ===== */
    .titulo {
      font-family: var(--f-marker);
      font-weight: 400;
      line-height: var(--line, 1.5em);
      overflow-wrap: anywhere;
    }
    .t1 {
      font-size: 1.32em;
    }
    .t2 {
      font-size: 1.12em;
    }
    .t3 {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86em;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    /* ===== A citação: recuada, inclinada, com o fio de tinta do lado ===== */
    .citacao {
      position: relative;
      margin: 0;
      padding-left: 0.95em;
      font-style: italic;
    }
    /* o risco a lápis do lado da citação, ondulado como a divisória (não uma barra reta) */
    .citacao::before {
      content: '';
      position: absolute;
      left: 0.12em;
      /* quem usa pode tirar a folga (os comentários: a citação de uma linha só ficava um toco de risco) */
      top: var(--citacao-folga, 0.3em);
      bottom: var(--citacao-folga, 0.3em);
      width: 7px;
      background: currentColor;
      opacity: 0.45;
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 100' preserveAspectRatio='none'%3E%3Cpath d='M5.5 2C3.4 18 7.4 34 4.8 52S3.6 82 5.6 98' fill='none' stroke='%23000' stroke-width='2.2' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 100' preserveAspectRatio='none'%3E%3Cpath d='M5.5 2C3.4 18 7.4 34 4.8 52S3.6 82 5.6 98' fill='none' stroke='%23000' stroke-width='2.2' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
    }

    /* ===== O texto sutil ("-# "): a letra menor, na tinta da folha mais rala (na cartolina colorida,
       a cor dela aparece por baixo, sem virar cinza). A linha continua com a altura da pauta: só as
       letras diminuem, dentro dela ===== */
    .sutil {
      color: color-mix(in srgb, currentColor 64%, transparent);
    }
    .sutil-texto {
      font-size: 0.84em;
    }
    /* o trecho sutil no meio da frase ("((assim))"): o mesmo, só nele (também no link e no código,
       que têm cor e tamanho próprios) */
    .sutil:not(.linha) {
      color: color-mix(in srgb, currentColor 64%, transparent);
      font-size: 0.84em;
    }
    /* na linha que já é sutil, o trecho não fica mais claro nem menor de novo */
    .sutil .sutil {
      color: inherit;
      font-size: inherit;
    }

    /* ===== A divisória: um risco ondulado à mão, no meio da linha da pauta ===== */
    .divisoria {
      background: currentColor;
      opacity: 0.5;
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 10' preserveAspectRatio='none'%3E%3Cpath d='M2 5.5C20 3 38 7.6 58 5S96 3.2 118 5.6 160 7 198 4.6' fill='none' stroke='%23000' stroke-width='2.2' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 10px no-repeat;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 10' preserveAspectRatio='none'%3E%3Cpath d='M2 5.5C20 3 38 7.6 58 5S96 3.2 118 5.6 160 7 198 4.6' fill='none' stroke='%23000' stroke-width='2.2' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 10px no-repeat;
    }

    /* ===== A tabela, nos cinco jeitos (ver core/tables.ts) =====
       Toda fileira tem a altura de uma linha da pauta (a letra sentada nela), e os fios entre as
       células são fundos, não bordas: não somam à altura. Nos jeitos de papel, o papel tem meia linha
       de cada lado (um par de linhas da pauta a mais), e o texto de baixo continua nas linhas da folha. */
    .tabela-rolo {
      max-width: 100%;
      overflow-x: auto;
      /* só de lado: com overflow-x auto o de cima vira auto também, e a meia linha da borda
         bastava para a tabela ganhar uma barra de rolar de pé */
      overflow-y: hidden;
      scrollbar-width: thin;
    }
    /* os jeitos de papel: o rolo dá espaço para a sombra do papel não ser cortada, sem mudar o lugar dele */
    .jeito-branca,
    .jeito-listrada,
    .jeito-quadriculada,
    .jeito-recibo {
      max-width: none;
      padding: 2px 8px 8px 2px;
      margin: -2px -8px -8px -2px;
    }
    .tabela-papel {
      /* do tamanho da tabela, nunca mais estreito que ela (a larga rola, com o papel junto) */
      width: fit-content;
      min-width: min(100%, 16em);
    }
    .tabela {
      /* do tamanho do que tem dentro (até a largura toda): numa ficha larga, três colunas curtas
         não se esticam de ponta a ponta; o texto longo quebra dentro da célula */
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      font-size: 0.94em;
      line-height: var(--line, 1.5em);
    }
    .tabela th,
    .tabela td {
      line-height: var(--line, 1.5em);
      padding: 0 0.7em;
      text-align: left;
      vertical-align: top;
      /* a palavra não se parte no meio ("Cust/o"): a tabela estreita rola de lado (na ficha, some na
         beirada); só a palavra maior que a célula toda quebra */
      overflow-wrap: break-word;
      white-space: pre-wrap;
      min-width: 3em;
      background-repeat: no-repeat;
    }
    .tabela th {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.86em;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    /* --- Branca: a folha de impresso colada na cartolina, o cabeçalho sobre um fio de tinta --- */
    .jeito-branca .tabela-papel,
    .jeito-listrada .tabela-papel {
      --t-tinta: #1b1916;
      --t-fio: #e3ddd1;
      color: var(--t-tinta);
      background: #fffefb;
      border-radius: 3px;
      box-shadow: 0 0 0 1px rgb(21 21 21 / 0.09), 0 1px 1px rgb(0 0 0 / 0.14), 0 3px 8px -3px rgb(0 0 0 / 0.3);
    }
    .jeito-branca .tabela-papel {
      padding: calc(var(--line, 1.5em) / 2) 0.35em;
    }
    .jeito-branca .tabela,
    .jeito-listrada .tabela {
      font-family: var(--f-ui);
      font-size: 0.86em;
      font-variant-numeric: tabular-nums;
    }
    .jeito-branca th {
      font-size: 0.92em;
      background-image: linear-gradient(var(--t-tinta), var(--t-tinta));
      background-position: bottom;
      background-size: 100% 2px;
    }
    .jeito-branca td {
      background-image: linear-gradient(var(--t-fio), var(--t-fio));
      background-position: bottom;
      background-size: 100% 1px;
    }
    .jeito-branca tr:last-child td {
      background-image: none;
    }

    /* --- Listrada: o cabeçalho numa faixa de tinta, as linhas uma sim, uma não num papel mais escuro --- */
    /* a faixa no alto do papel e a última linha no pé: sem margem (a tabela tem as linhas inteiras dela) */
    .jeito-listrada .tabela-papel {
      overflow: hidden;
    }
    .jeito-listrada th {
      background-color: #22201d;
      color: #fffdf8;
      font-size: 0.92em;
    }
    .jeito-listrada tbody tr:nth-child(even) td {
      background-color: #f1ebde;
    }

    /* --- Quadriculada: a folha do caderno de quadrinhos, o cabeçalho passado com marca-texto --- */
    .jeito-quadriculada .tabela-papel {
      --t-quadro: rgb(64 132 210 / 0.2);
      --t-grade: rgb(48 112 196 / 0.55);
      --q: calc(var(--line, 1.5em) / 2);
      color: #1d2a46;
      background:
        repeating-linear-gradient(to right, var(--t-quadro) 0 1px, transparent 1px var(--q)),
        repeating-linear-gradient(to bottom, var(--t-quadro) 0 1px, transparent 1px var(--q)),
        #fbfdff;
      padding: var(--q);
      border-radius: 1px;
      box-shadow: 0 0 0 1px rgb(21 21 21 / 0.07), 0 1px 1px rgb(0 0 0 / 0.12), 0 3px 7px -3px rgb(0 0 0 / 0.26);
    }
    .jeito-quadriculada .tabela {
      /* o contorno da grade, de caneta azul (uma sombra por dentro: não soma à altura) */
      box-shadow: inset 0 0 0 1.5px var(--t-grade);
    }
    .jeito-quadriculada :is(th, td) {
      background-image: linear-gradient(var(--t-grade), var(--t-grade)), linear-gradient(var(--t-grade), var(--t-grade));
      background-position: right top, left bottom;
      background-size: 1.5px 100%, 100% 1.5px;
    }
    .jeito-quadriculada th {
      font-family: inherit;
      font-weight: 700;
      font-size: 1em;
      letter-spacing: 0;
      text-transform: none;
    }
    /* o marca-texto passado só no que está escrito (como o ==marca-texto== do texto) */
    .jeito-quadriculada .th-texto {
      --marca-cor: rgb(255 218 66 / 0.62);
      background: linear-gradient(var(--marca-cor), var(--marca-cor)) no-repeat 0 56% / 100% 0.72em;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
      padding: 0 0.15em;
      border-radius: 2px;
    }

    /* --- Caneta: riscada direto na cartolina, o cabeçalho em letra de carimbo (o jeito de antes) --- */
    .jeito-caneta .tabela {
      width: auto;
      min-width: min(100%, 16em);
    }
    .jeito-caneta :is(th, td) {
      /* a borda entra na conta da linha: cada fileira da tabela ocupa uma linha da pauta */
      line-height: calc(var(--line, 1.5em) - 1.5px);
      padding: 0 0.45em;
      border: 1.5px solid color-mix(in srgb, currentColor 48%, transparent);
    }
    .jeito-caneta th {
      background: color-mix(in srgb, currentColor 8%, transparent);
      font-weight: 800;
    }

    /* --- Recibo: a bobina do cupom, picotada em cima e embaixo, com o tracejado da impressora --- */
    .jeito-recibo {
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.16)) drop-shadow(0 3px 3px rgb(0 0 0 / 0.14));
    }
    .jeito-recibo .tabela-papel {
      --dente: 7px;
      --t-fio: rgb(43 42 40 / 0.55);
      color: #2b2a28;
      background: #fbfaf4;
      padding: calc(var(--line, 1.5em) / 2) 0.5em;
      /* o picote: os dentes de cima apontam para cima, e os de baixo, para baixo */
      -webkit-mask:
        linear-gradient(#000 0 0) 0 var(--dente) / 100% calc(100% - 2 * var(--dente)) no-repeat,
        conic-gradient(from 135deg at 50% 0, #0000, #000 1deg 89deg, #0000 90deg) 0 0 / calc(2 * var(--dente)) var(--dente) repeat-x,
        conic-gradient(from -45deg at 50% 100%, #0000, #000 1deg 89deg, #0000 90deg) 0 100% / calc(2 * var(--dente)) var(--dente) repeat-x;
      mask:
        linear-gradient(#000 0 0) 0 var(--dente) / 100% calc(100% - 2 * var(--dente)) no-repeat,
        conic-gradient(from 135deg at 50% 0, #0000, #000 1deg 89deg, #0000 90deg) 0 0 / calc(2 * var(--dente)) var(--dente) repeat-x,
        conic-gradient(from -45deg at 50% 100%, #0000, #000 1deg 89deg, #0000 90deg) 0 100% / calc(2 * var(--dente)) var(--dente) repeat-x;
    }
    .jeito-recibo .tabela {
      font-family: var(--f-mono);
      font-size: 0.84em;
      font-variant-numeric: tabular-nums;
    }
    .jeito-recibo th {
      font-family: var(--f-mono);
      font-size: 1em;
      letter-spacing: 0.04em;
    }
    /* o tracejado da impressora embaixo do cabeçalho e da última linha: na fileira inteira, um traço
       só de ponta a ponta (em cada célula, ele recomeçava torto na emenda das colunas) */
    .jeito-recibo :is(thead tr, tbody tr:last-child) {
      background-repeat: no-repeat;
      background-image: repeating-linear-gradient(to right, var(--t-fio) 0 5px, transparent 5px 9px);
      background-position: bottom;
      background-size: 100% 1.5px;
    }

    /* a seta de quem sai daqui: o desenho da família de ícones do site (lucide), no traço da letra */
    .url::after {
      content: '';
      display: inline-block;
      width: 0.62em;
      height: 0.62em;
      margin-left: 0.14em;
      vertical-align: 0.32em;
      background: currentColor;
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 7h10v10M7 17 17 7'/%3E%3C/svg%3E") center / contain no-repeat;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 7h10v10M7 17 17 7'/%3E%3C/svg%3E") center / contain no-repeat;
    }

    .lista {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    /* o que vem embaixo do item: no alinhamento do texto dele, cada linha na margem (sem o recuo de
       parágrafo), e o respiro de uma linha inteira da pauta antes do próximo item (a letra continua
       sentada nas linhas da folha) */
    .corpo {
      --recuo: 0;
      white-space: normal;
    }
    .tarefas .corpo {
      padding-left: 1.35em;
    }
    .lista > li:has(> .corpo):not(:last-child) {
      margin-bottom: var(--corpo-respiro, var(--line, 1.5em));
    }
    /* o respiro entre uma tarefa e a seguinte: quem usa diz quanto (a ficha do mural, onde não há
       pauta para seguir); sem dizer, nenhum, e cada tarefa fica na linha dela */
    .tarefas > li + li {
      margin-top: var(--tarefa-respiro, 0);
    }
    /* a tarefa feita risca o que vem embaixo dela: o texto a lápis, como o dela, e a foto ou o vídeo
       com o risco de caneta (ver ui/glued-media.ts, --riscado) */
    .feita > .corpo {
      --riscado: 1;
      opacity: 0.7;
    }
    .feita > .corpo :is(.linha, th, td, .codigo) {
      text-decoration: line-through 2px rgb(21 21 21 / 0.45);
    }
    /* o item fica pendurado: a segunda linha começa onde o texto começa, não embaixo do marcador */
    .lista > li {
      position: relative;
      padding-left: 1.35em;
    }
    /* só na lista comum: a numerada tem o número no lugar, e a de tarefas, a caixinha */
    .lista:not(.tarefas, .numerada) > li::before {
      content: '•';
      position: absolute;
      left: 0.3em;
      font-weight: 700;
    }
    /* o número do pai na frente ("1.1.") pede mais lugar: um terço de em por sinal dele */
    .numerada > li {
      counter-increment: item;
      padding-left: calc(1.7em + var(--pre-n, 0) * 0.33em);
    }
    .numerada > li::before {
      content: attr(data-pre) counter(item) '.';
      position: absolute;
      left: 0;
      font-variant-numeric: tabular-nums;
    }
    .tarefas > li {
      padding-left: 0;
    }
    .tarefas label {
      display: grid;
      grid-template-columns: 1.35em minmax(0, 1fr);
      align-items: start;
    }
    /* a caixinha desenhada a caneta, sentada na linha da pauta */
    .tarefas input,
    .tarefas .caixa {
      appearance: none;
      width: 0.86em;
      height: 0.86em;
      margin: calc((var(--line, 1.5em) - 0.86em) / 2 + 0.06em) 0 0;
      border: 2px solid currentColor;
      border-radius: 2px 3px 2px 4px;
      rotate: -3deg;
      background: transparent;
      cursor: pointer;
    }
    .tarefas input:focus-visible {
      /* na cor da tinta: o amarelo sumia na cartolina amarela */
      outline: 3px solid currentColor;
      outline-offset: 2px;
    }
    /* feita: o tique vermelho de caneta por cima da caixinha, e o texto riscado a lápis */
    .tarefas input:checked,
    .tarefas .caixa.marcada {
      background:
        no-repeat center / 120% 120%
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M3 10.5 8 15.5 18 2' fill='none' stroke='%23c4302b' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
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
      margin: calc((var(--line, 1.5em) - 0.86em) / 2 + 0.06em) 0 0;
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
      text-decoration: line-through 2px rgb(21 21 21 / 0.45);
      opacity: 0.7;
    }
    /* O link: a letra de sempre, sublinhada à mão com a caneta azul (cada linha com o seu risco,
       levemente torto): azul-marinho nas cartolinas claras e no papel, azul-céu nas escuras. Passando
       por cima, o marca-texto azul, da mesma caneta do risco. A cor segue a cartolina da ficha do mural (ver as variações logo
       abaixo); a leitura é de papel creme, com a caneta azul-marinho. */
    .elo {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.4C16 4.9 31 7.3 49 5.7S82 4.6 99 5.9' fill='none' stroke='%231d3577' stroke-width='2.3' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
      --elo-marca: rgb(96 150 235 / 0.3);
      color: inherit;
      text-decoration: none;
      border-radius: 2px;
      /* o risco logo embaixo da letra (não lá embaixo da caixa, longe do texto); o marca-texto
         passado na palavra inteira, de cima a baixo */
      background:
        var(--elo-traco) no-repeat left 0 bottom 0.1em / 100% 0.34em,
        linear-gradient(transparent 4%, var(--elo-fundo, transparent) 4%, var(--elo-fundo, transparent) 96%, transparent 96%) no-repeat;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .elo[tabindex],
    .url {
      cursor: pointer;
    }
    .elo[tabindex]:hover,
    .elo[tabindex]:focus-visible,
    .url:hover,
    .url:focus-visible {
      --elo-fundo: var(--elo-marca);
    }
    .elo:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
    .elo.negrito {
      font-weight: 700;
    }
    .elo.italico {
      font-style: italic;
    }
    /* a anotação não existe (ainda): o risco tracejado, a lápis, e a letra mais apagada */
    .elo.quebrado {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.2C16 5.2 31 7 49 5.8S82 4.9 99 6' fill='none' stroke='%23151515' stroke-opacity='.55' stroke-width='1.8' stroke-dasharray='5 4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
      opacity: 0.85;
    }
    /* nas escuras: a caneta azul-céu, que aparece no escuro, e o marca-texto mais fraco */
    :host-context(app-review-card[data-cor$='-escuro']) .elo,
    :host-context(app-review-card[data-cor='preto']) .elo {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.4C16 4.9 31 7.3 49 5.7S82 4.6 99 5.9' fill='none' stroke='%238fd3ff' stroke-width='2.4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
      --elo-marca: rgb(143 211 255 / 0.26);
    }
    :host-context(app-review-card[data-cor$='-escuro']) .elo.quebrado,
    :host-context(app-review-card[data-cor='preto']) .elo.quebrado {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.2C16 5.2 31 7 49 5.8S82 4.9 99 6' fill='none' stroke='%23f3ece0' stroke-opacity='.6' stroke-width='1.8' stroke-dasharray='5 4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
    }
    :host-context(.cartolina[data-cor$='-escuro']) .feita .tarefa,
    :host-context(.cartolina[data-cor='preto']) .feita .tarefa,
    :host-context(.cartolina[data-cor$='-escuro']) .feita > .corpo .linha,
    :host-context(.cartolina[data-cor='preto']) .feita > .corpo .linha {
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

  /** Tocou na conta das feitas: a sequência dela aparece inteira. Só ela age (nada de abrir a ficha). */
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

  protected make(e: Event, title: string): void {
    e.preventDefault();
    e.stopPropagation();
    this.links()?.create?.(title);
  }
}

