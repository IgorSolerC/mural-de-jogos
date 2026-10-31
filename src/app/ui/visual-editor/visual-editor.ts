import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  ElementRef,
  EnvironmentInjector,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  createComponent,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { dropCursor } from 'prosemirror-dropcursor';
import { GapCursor, gapCursor } from 'prosemirror-gapcursor';
import { history, redo, redoDepth, undo, undoDepth } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { Fragment, Mark, MarkType, Node as PMNode, Slice } from 'prosemirror-model';
import { Command, EditorState, NodeSelection, Plugin, Selection, TextSelection, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView, NodeView } from 'prosemirror-view';
import { Escrita, Fonte, LinhaDoc, chave, docToText, normalizarLinha, posicaoNaTabela, posicaoNoDoc, posicaoNoTexto, textToDoc } from '../../core/rich-doc';
import { commonPairs } from '../../core/merge3';
import { NoteLinks } from '../../core/note-links';
import { RichText } from '../rich-text';
import type { LineStyle } from '../rich-editor';
import { chainCommands } from 'prosemirror-commands';
import { semQuebras } from './ajustes';
import { colchetesAntes, eloView, faixaDaMarca, linkEm, linksInteiros } from './links';
import { apagarPeloBeforeinput, enterPeloBeforeinput } from './entrada';
import { atalhos } from './input-rules';
import { apagarParaFrente, apagarParaTras, codigo, divisoria, enter, estilo, marca, teclas } from './keymap';
import { ItemView, desenhoDasListas, escritor, linhaNoItem, lista, marcarTarefa } from './listas';
import { Lugar, WidgetView, depoisDaPeca, envio, lugarDoCursor, marcaEnvio, pecas, poeBlocoNoLugar, poeNoLugar, tiraEm, tiraEnvio } from './pecas';
import { ICON } from '../icons';
import { acaoTabela, alcasDaTabela, celulaEm, colarNaCelula, edicaoDaTabela, estadoTabela, posDaCelula, protegeTabela, sliceNaCelula, tabelaEm, tabelaVazia, tabelasRetas, tiraTabela } from './tabela';
import { docDe, linhaDaPeca, linhaDe, noDe, schema, sliceDoTexto, textoDoCru } from './schema';
import { AcaoVisual, EstadoVisual, ImagemVisual, ListaVisual, MalaVisual, MarcaVisual, PecaVisual, PedidoLink, VisualApi } from './visual-api';
import { CopyContext, WidgetSize, widgetLines } from '../../core/widgets';
import { CardFinder } from '../../core/card-finder';
import { colar, sliceDaPlanilha } from './colar';
import { copiar } from './copiar';

/**
 * O modo Visual do texto (PLANO-EDITOR-VISUAL.md): escrever vendo como fica, como no Docs, sem ver o
 * markdown. Por baixo continua a mesma string de sempre: o documento do ProseMirror é a lista das
 * linhas do texto (ver schema.ts), lida e escrita pelo tradutor (core/rich-doc.ts), que nunca muda uma
 * linha que a pessoa não mexeu (cada uma guarda a fonte) e confere pelo próprio leitor o que escreve.
 *
 * Recebe o texto (`texto`) e devolve o que a pessoa escreveu (`mudou`); a régua do editor
 * (ui/rich-editor.ts) manda as ações (`run`) e lê o estado (`estado`: as marcas ligadas, o estilo da
 * linha, o desfazer). O texto que chega de fora (a colega da compartilhada, outro aparelho, a AI, o
 * Markdown) troca só os nós dos blocos mudados, fora do desfazer, com o cursor no lugar (`chega`).
 *
 * As promessas, na tela: o que aparece é o que a leitura vai mostrar (se a escrita não consegue ser
 * exata, a tela passa a mostrar o que o leitor leu); nada some (o que o Visual não sabe mudar é um
 * trecho cru, que mostra como a leitura e sai igual); o limite de caracteres é o da string guardada.
 *
 * O desenho: o da leitura (ui/_formatado.scss), na folha pautada do editor. Sem o encapsulamento do
 * Angular (o DOM é do ProseMirror), tudo debaixo de `.vis-folha`, com as classes próprias em `vis-`.
 */

const N = schema.nodes;
const M = schema.marks;

/** A transação que veio de fora (o texto de outra ficha, o limite cortando): não passa pelo limite. */
const FORA = 'vis-fora';
/** O ajuste da tela ao que o leitor leu: não volta a ser ajustado. */
const AJUSTE = 'vis-ajuste';
/** O texto que chegou de fora (`chega`): já é o valor de agora, não volta como `mudou`. */
const CHEGOU = 'vis-chegou';

/** O que vai na `MalaVisual`: o estado da folha e o que a escrita dela guarda. */
interface Mala extends MalaVisual {
  state: EditorState;
  fontes: WeakMap<PMNode, Fonte>;
  quebra: string;
  ultimo: string;
}

const MARCAS: readonly (readonly [MarcaVisual, MarkType])[] = [
  ['bold', M['negrito']],
  ['italic', M['italico']],
  ['strike', M['riscado']],
  ['mark', M['marca']],
  ['spoiler', M['spoiler']],
  ['subtle', M['trechoSutil']],
  ['code', M['codigo']],
];

const ESTILOS: Partial<Record<LineStyle, Command>> = {
  texto: estilo(N['linha']),
  t1: estilo(N['titulo'], 1),
  t2: estilo(N['titulo'], 2),
  t3: estilo(N['titulo'], 3),
  citacao: estilo(N['citacao']),
  sutil: estilo(N['sutil']),
  codigo: estilo(N['blocoCodigo']),
};

/** A marca vale na seleção inteira (ou, sem seleção, na próxima letra). */
function ligada(state: EditorState, tipo: MarkType): boolean {
  const { empty, $from, ranges } = state.selection;
  if (empty) return !!tipo.isInSet(state.storedMarks || $from.marks());
  let algum = false;
  let todos = true;
  // cada faixa da seleção (na de várias células da tabela, uma por célula)
  for (const r of ranges)
    state.doc.nodesBetween(r.$from.pos, r.$to.pos, (n) => {
      if (!n.isText) return;
      algum = true;
      if (!tipo.isInSet(n.marks)) todos = false;
    });
  return algum && todos;
}

function estiloDe(state: EditorState): LineStyle | null {
  const sel = state.selection;
  const n = sel instanceof NodeSelection ? sel.node : sel.$from.depth ? sel.$from.node(1) : null;
  if (!n) return null;
  switch (n.type) {
    case N['linha']:
      return 'texto';
    case N['titulo']:
      return `t${n.attrs['nivel']}` as LineStyle;
    case N['citacao']:
      return 'citacao';
    case N['sutil']:
      return 'sutil';
    case N['blocoCodigo']:
      return 'codigo';
    // o item: o "Texto normal" do Markdown (que deixa a lista como está)
    case N['item']:
      return 'texto';
    case N['cru']:
      return (n.attrs['linha'] as LinhaDoc).kind === 'codigo' ? 'codigo' : null;
    default:
      return null;
  }
}

/** O widget selecionado (a peça inteira), ou null. */
function pecaDe(state: EditorState): PecaVisual | null {
  const sel = state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type !== N['widget']) return null;
  const a = sel.node.attrs;
  return { de: sel.from, nome: a['nome'], args: a['args'], tamanho: a['tamanho'] };
}

/** A lista da linha do cursor (para o botão dela ficar afundado). */
function listaDe(state: EditorState): ListaVisual | null {
  const { $from } = state.selection;
  return $from.depth && $from.parent.type === N['item'] ? ($from.parent.attrs['tipo'] as ListaVisual) : null;
}

interface Contexto {
  appRef: ApplicationRef;
  injector: EnvironmentInjector;
  links: () => NoteLinks | null;
  pedeMarkdown: (pos: number) => void;
}

/**
 * O trecho cru: o que o Visual ainda não sabe mudar (a tabela), mostrado
 * como a leitura mostra (o mesmo `app-rich-text`), com uma borda tracejada discreta. Tocado, fica
 * selecionado como uma peça e mostra "Este trecho só se muda no Markdown", com o botão que leva até ele.
 * O botão segura o foco no `pointerdown` e age no `click` (o `touchstart` cancelado mataria o click).
 */
class CruView implements NodeView {
  readonly dom: HTMLElement;
  private readonly ref: ComponentRef<RichText>;
  private readonly etiqueta: HTMLElement;

  constructor(
    private node: PMNode,
    getPos: () => number | undefined,
    private readonly ctx: Contexto,
  ) {
    this.dom = document.createElement('div');
    this.dom.className = 'vis-cru';
    this.dom.setAttribute('role', 'group');
    this.dom.setAttribute('aria-label', 'Trecho que só se muda no Markdown');
    const corpo = document.createElement('div');
    corpo.className = 'vis-cru-corpo';
    this.ref = createComponent(RichText, { environmentInjector: ctx.injector, hostElement: corpo });
    this.ref.setInput('text', textoDoCru(node));
    this.ref.setInput('links', ctx.links());
    ctx.appRef.attachView(this.ref.hostView);
    this.etiqueta = document.createElement('div');
    this.etiqueta.className = 'vis-cru-etiqueta';
    const aviso = document.createElement('span');
    aviso.className = 'vis-cru-aviso';
    aviso.textContent = 'Este trecho só se muda no Markdown';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'acao-caneta vis-cru-botao';
    botao.textContent = 'Mudar no Markdown';
    const segura = (e: Event) => e.preventDefault();
    botao.addEventListener('pointerdown', segura);
    botao.addEventListener('mousedown', segura);
    botao.addEventListener('click', (e) => {
      e.preventDefault();
      const pos = getPos();
      if (pos !== undefined) ctx.pedeMarkdown(pos);
    });
    this.etiqueta.append(aviso, botao);
    this.dom.append(corpo, this.etiqueta);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    if (textoDoCru(node) !== textoDoCru(this.node)) this.ref.setInput('text', textoDoCru(node));
    this.node = node;
    return true;
  }

  /** O botão e o que se toca dentro da leitura (os controles de um vídeo, um link) ficam com eles. */
  stopEvent(e: Event): boolean {
    const t = e.target as Element | null;
    return !!t && (this.etiqueta.contains(t) || !!t.closest?.('button, a, input, video, audio, select, [role=button], [role=link]'));
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.ctx.appRef.detachView(this.ref.hostView);
    this.ref.destroy();
  }
}

@Component({
  selector: 'app-visual-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'vis-folha', '[class.vis-grande]': 'grande()', '[class.vis-encher]': 'encher()' },
  template: '',
  styleUrl: './visual-editor.scss',
})
export class VisualEditor implements OnInit, OnDestroy, VisualApi {
  /** O texto de agora (o `value` do editor). */
  readonly texto = input.required<string>();
  /** À mostra e valendo: escondido (na aba Markdown, ou atrás da tela cheia), não acompanha o texto. */
  readonly ativo = input(true);
  readonly grande = input(false);
  /** A folha enche o lugar que o pai der (a anotação), como a do Markdown. */
  readonly encher = input(false);
  readonly placeholder = input('');
  /** O nome da folha para o leitor de tela. */
  readonly rotulo = input('');
  /** O id do contador embaixo da folha (`aria-describedby`). */
  readonly descrito = input<string | null>(null);
  /** O máximo de caracteres da string guardada. */
  readonly max = input<number | null>(null);
  /** Os links para outras anotações: os da folha (tracejados quando a anotação não existe) e os dos trechos crus. */
  readonly links = input<NoteLinks | null>(null);
  /**
   * A lista das anotações do "[[" está aberta, com opções: as setas, o Enter, o Tab e o Esc ficam com ela
   * (passam adiante, para o editor, sem o Visual mexer no texto).
   */
  readonly lista = input(false);

  /** O texto que a pessoa escreveu. */
  readonly mudou = output<string>();
  readonly estado = output<EstadoVisual>();
  /** O Visual está pronto: a régua fala com ele por aqui. */
  readonly pronto = output<VisualApi>();
  readonly foco = output<FocusEvent>();
  readonly desfoco = output<FocusEvent>();
  /** "Mudar no Markdown" num trecho cru: a seleção (no texto) onde o Markdown abre. */
  readonly pedeMarkdown = output<[number, number]>();
  /** Um aviso curto para a pessoa (o limite de caracteres). */
  readonly aviso = output<string>();
  /** O painel de um link: o Ctrl+K, a régua ou um clique num link (ver `PedidoLink`). */
  readonly pedeLink = output<PedidoLink>();
  /** Uma imagem colada ou solta (sem texto junto): o editor a encolhe, guarda e põe no marcador (`poeImagem`). */
  readonly imagem = output<ImagemVisual>();
  /** Onde está o cursor (a ponta da seleção que anda), no texto guardado: a prévia da ficha vai até ele. */
  readonly cursor = output<number>();

  readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private view?: EditorView;
  /** O último texto escrito (ou recebido): o que chega igual a ele não refaz nada. */
  private ultimo = '';
  private quebra = '\n';
  /**
   * A fonte nova de cada nó escrito de novo: a próxima escrita sai por ela, sem refazer a linha. Vai junto
   * com o estado para a outra folha (a tela cheia): os nós são os mesmos.
   */
  private fontes = new WeakMap<PMNode, Fonte>();
  /** A linha de cada nó com a fonte nova (a mesma enquanto a fonte for a mesma: a chave dela fica contada). */
  private readonly comFonte = new WeakMap<PMNode, LinhaDoc>();
  private docEscrito?: PMNode;
  private escrita?: Escrita;
  private ultimoEstado = '';
  private avisadoEm = 0;
  /**
   * O trecho do último pedido de link (o link de agora, ou a seleção): acompanha as mudanças do
   * documento até o painel pôr, trocar ou tirar o link (ou fechar).
   */
  private trecho: { from: number; to: number } | null = null;
  /**
   * Onde o widget da folha vai ficar (o pedido `lugarDaPeca`): o widget que ela troca (`troca`) ou o lugar
   * de um novo. Acompanha as mudanças do documento até a folha pôr, tirar ou fechar.
   */
  private alvo: (Lugar & { troca: boolean; sel?: number }) | null = null;
  /** O número do próximo marcador de imagem. */
  private marcas = 0;

  constructor() {
    // o texto mudou por fora (o Markdown, a colega da compartilhada, a AI): só os blocos mudados trocam
    effect(() => {
      const texto = this.texto();
      const ativo = this.ativo();
      if (!this.view || !ativo || texto === this.ultimo) return;
      untracked(() => this.chega(texto));
    });
    // o nome, o placeholder e o contador vão para os atributos e a decoração da folha
    effect(() => {
      this.rotulo();
      this.placeholder();
      this.descrito();
      untracked(() => this.view?.setProps({}));
    });
    effect(() => {
      this.grande();
      untracked(() => requestAnimationFrame(() => this.mede()));
    });
    // as anotações mudaram: os links de anotação se desenham de novo (tracejado o da que não existe)
    effect(() => {
      this.links();
      untracked(() => this.view?.setProps({ markViews: this.markViews() }));
    });
  }

  /** O link de anotação, tracejado quando a anotação não existe (sem as anotações, como existe). */
  private markViews() {
    const resolve = this.links()?.resolve;
    return { elo: eloView((titulo) => (resolve ? !!resolve(titulo) : null)) };
  }

  ngOnInit(): void {
    const texto = this.texto();
    this.view = new EditorView(this.host, {
      state: this.estadoDe(texto),
      dispatchTransaction: (tr) => this.aplica(tr),
      nodeViews: {
        item: (node, view, getPos) => new ItemView(node, view, getPos),
        widget: (node, view, getPos) => new WidgetView(node, view, getPos, { appRef: this.appRef, injector: this.injector, links: () => this.links() }),
        cru: (node, _view, getPos) =>
          new CruView(node, getPos, {
            appRef: this.appRef,
            injector: this.injector,
            links: () => this.links(),
            pedeMarkdown: (pos) => {
              const at = this.noTexto(this.escrever(this.view!.state.doc), pos);
              this.pedeMarkdown.emit([at, at]);
            },
          }),
      },
      markViews: this.markViews(),
      attributes: () => {
        const d = this.descrito();
        return {
          class: 'vis-texto',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': this.rotulo() || this.placeholder() || 'Texto',
          ...(d ? { 'aria-describedby': d } : {}),
          spellcheck: 'true',
          autocapitalize: 'sentences',
          lang: 'pt-BR',
        };
      },
      // o cursor nunca atrás da régua presa em cima do teclado (no celular: 54px da régua e uma linha)
      scrollMargin: { top: 24, bottom: 120, left: 8, right: 8 },
      scrollThreshold: { top: 24, bottom: 120, left: 8, right: 8 },
      // na célula da tabela, as células de uma planilha se espalham; as linhas se juntam com espaço. Fora
      // dela, a planilha (com tab, em várias linhas) vira uma tabela nova; o resto é lido como markdown
      clipboardTextParser: (text, $ctx, plain) => sliceNaCelula(text, plain, $ctx) ?? sliceDaPlanilha(text, plain) ?? sliceDoTexto(text, plain),
      transformPasted: (slice, view) => colarNaCelula(slice, view),
      clipboardTextSerializer: (slice) => textoDoSlice(slice),
    });
    this.ultimo = texto;
    this.mede();
    document.fonts?.ready.then(() => this.mede());
    this.emiteEstado();
    this.pronto.emit(this);
  }

  ngOnDestroy(): void {
    this.view?.destroy();
    this.view = undefined;
  }

  // ===== O que a régua pede =====

  run(acao: AcaoVisual): boolean {
    const v = this.view;
    if (!v) return false;
    const cmd = this.comando(acao);
    if (!cmd) return false;
    cmd(v.state, v.dispatch, v);
    v.focus();
    return true;
  }

  private comando(acao: AcaoVisual): Command | null {
    if (typeof acao === 'object' && 'estilo' in acao) return ESTILOS[acao.estilo] ?? null;
    if (acao === 'undo') return undo;
    if (acao === 'redo') return redo;
    if (acao === 'rule') return divisoria;
    if (acao === 'tabela') return poeTabela();
    if (typeof acao === 'object' && 'tabelaNova' in acao) return poeTabela(acao.tabelaNova.colunas, acao.tabelaNova.fileiras);
    if (typeof acao === 'object' && 'tabela' in acao) return acaoTabela(acao.tabela);
    // o código: na linha, a marca; numa linha vazia ou em várias, o bloco (como o Ctrl+E)
    if (acao === 'code') return codigo;
    if (acao === 'ul' || acao === 'ol' || acao === 'check') return lista(acao);
    // a linha dentro do item (fora de lista, uma linha nova)
    if (acao === 'inside') return chainCommands(linhaNoItem, enter);
    const m = MARCAS.find(([a]) => a === acao);
    return m ? marca(m[1]) : null;
  }

  focus(): void {
    this.view?.focus();
  }

  blur(): void {
    (this.view?.dom as HTMLElement | undefined)?.blur();
  }

  selecaoNoTexto(): [number, number] {
    const v = this.view;
    if (!v) return [0, 0];
    const e = this.escrever(v.state.doc);
    const { from, to } = v.state.selection;
    return [this.noTexto(e, from), this.noTexto(e, to, from !== to)];
  }

  poeSelecao(de: number, ate: number): void {
    const v = this.view;
    if (!v) return;
    const doc = v.state.doc;
    const e = this.escrever(doc);
    if (e.doc.linhas.length !== doc.childCount) return;
    const max = e.texto.length;
    const [a, b] = [Math.max(0, Math.min(de, max)), Math.max(0, Math.min(ate, max))];
    const pa = this.noDoc(e, a);
    const pb = this.noDoc(e, b);
    let sel: Selection;
    const $a = doc.resolve(pa);
    if (pa === pb) sel = $a.depth === 0 && $a.nodeAfter?.isAtom ? NodeSelection.create(doc, pa) : Selection.near($a);
    else sel = TextSelection.between($a, doc.resolve(pb));
    v.dispatch(v.state.tr.setSelection(sel).scrollIntoView());
  }

  // ===== Os links =====

  /**
   * O painel do link no lugar do cursor: num link, o dele (para trocar ou tirar); senão, a seleção (o
   * texto selecionado vai no painel; um endereço selecionado, no campo do endereço). No bloco de código e
   * numa peça não tem link: nada acontece.
   */
  pedeLinkAqui(tipo: 'url' | 'elo'): void {
    const v = this.view;
    if (!v) return;
    const { state } = v;
    const sel = state.selection;
    const $a = sel.$from;
    if (!$a.parent.inlineContent || $a.parent.type.spec.code) return;
    const no = linkEm($a);
    // o link de agora (a seleção dentro dele): o painel dele, para trocar
    if (no && sel.to <= no.to) return this.pedeLinkDe(no, false);
    // senão, a seleção (só a parte dela nesta linha)
    const to = Math.min(sel.to, $a.end());
    this.trecho = { from: sel.from, to };
    const texto = state.doc.textBetween(sel.from, to).replace(/\s+/g, ' ').trim();
    if (tipo === 'url') {
      const endereco = /^(https?:\/\/|www\.|mailto:)\S+$/i.test(texto);
      this.pedeLink.emit({ tipo, de: sel.from, texto: endereco ? '' : texto, href: endereco ? texto : '', troca: false, passivo: false });
    } else this.pedeLink.emit({ tipo, de: sel.from, titulo: '', rotulo: texto, troca: false, passivo: false });
  }

  /** O painel do link dado (para trocar ou tirar): pelo Ctrl+K ou pelo clique (`passivo`). */
  private pedeLinkDe(no: { from: number; to: number; mark: Mark }, passivo: boolean): void {
    const texto = this.view!.state.doc.textBetween(no.from, no.to);
    this.trecho = { from: no.from, to: no.to };
    if (no.mark.type === M['link']) {
      const href: string = no.mark.attrs['href'];
      // o endereço solto (o texto é o próprio endereço): o texto vai vazio, como no Markdown
      const solto = texto === href || 'https://' + texto === href;
      this.pedeLink.emit({ tipo: 'url', de: no.from, texto: solto ? '' : texto, href, troca: true, passivo });
    } else this.pedeLink.emit({ tipo: 'elo', de: no.from, titulo: no.mark.attrs['ref'] ?? texto, rotulo: texto, troca: true, passivo });
  }

  /** O trecho do pedido, se ainda está numa linha de texto (fora do código). */
  private trechoValido(): { from: number; to: number } | null {
    const v = this.view;
    const t = this.trecho;
    if (!v || !t || t.to > v.state.doc.content.size) return null;
    const $a = v.state.doc.resolve(t.from);
    return $a.parent.inlineContent && !$a.parent.type.spec.code && $a.sameParent(v.state.doc.resolve(t.to)) ? t : null;
  }

  /** As marcas de texto que o link novo leva: as da primeira letra do trecho (sem link nem código). */
  private marcasDoTrecho(from: number, to: number): readonly Mark[] {
    const s = this.view!.state;
    const base = from < to ? (s.doc.nodeAt(from)?.marks ?? []) : (s.storedMarks ?? s.doc.resolve(from).marks());
    return base.filter((m) => m.type !== M['link'] && m.type !== M['elo'] && m.type !== M['codigo']);
  }

  /** Troca o trecho pelo texto com a marca do link (o mesmo texto: só a marca), e o cursor vai para depois dele. */
  private poeMarca(from: number, to: number, texto: string, link: Mark): void {
    const v = this.view!;
    const tr = v.state.tr;
    if (texto && v.state.doc.textBetween(from, to) === texto) {
      tr.removeMark(from, to, M['link']).removeMark(from, to, M['elo']).removeMark(from, to, M['codigo']).addMark(from, to, link);
    } else if (texto) tr.replaceWith(from, to, schema.text(texto, link.addToSet(this.marcasDoTrecho(from, to))));
    else return;
    const fim = from + texto.length;
    tr.setSelection(TextSelection.create(tr.doc, fim));
    this.trecho = null;
    v.dispatch(tr.scrollIntoView());
    v.focus();
  }

  poeLink(texto: string, href: string): void {
    const t = this.trechoValido();
    if (!t) return;
    this.poeMarca(t.from, t.to, (texto || href).replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim() || href, M['link'].create({ href }));
  }

  poeElo(titulo: string, rotulo: string, noColchete: boolean): void {
    const v = this.view;
    if (!v || !titulo.trim() || /[[\]|\n]/.test(titulo)) return;
    let t = noColchete ? null : this.trechoValido();
    if (noColchete) {
      // o "[[" e a busca antes do cursor (e um "]]" logo depois, se tinha)
      const c = colchetesAntes(v.state);
      if (!c) return;
      const at = v.state.selection.from;
      t = { from: c.de, to: v.state.doc.textBetween(at, Math.min(at + 2, v.state.selection.$from.end())) === ']]' ? at + 2 : at };
    }
    if (!t) return;
    const texto = (rotulo || titulo).replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim() || titulo.trim();
    this.poeMarca(t.from, t.to, texto, M['elo'].create({ ref: titulo.trim() }));
  }

  tiraLink(): void {
    const v = this.view;
    const t = this.trechoValido();
    if (!v || !t) return;
    this.trecho = null;
    const tr = v.state.tr.removeMark(t.from, t.to, M['link']).removeMark(t.from, t.to, M['elo']);
    v.dispatch(tr.setSelection(TextSelection.create(tr.doc, t.to)).scrollIntoView());
    v.focus();
  }

  voltaAoTrecho(): void {
    const v = this.view;
    const t = this.trechoValido();
    this.trecho = null;
    if (!v) return;
    if (t) v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, t.from, t.to)).scrollIntoView());
    v.focus();
  }

  // ===== Os widgets (ver pecas.ts) =====

  lugarDaPeca(nome?: string): PecaVisual | null {
    const v = this.view;
    if (!v) return null;
    if (nome === 'tabela') return this.lugarDaTabela();
    const p = pecaDe(v.state);
    if (p && (!nome || p.nome === nome)) {
      this.alvo = { pos: p.de, lado: 1, troca: true };
      return p;
    }
    this.alvo = { ...lugarDoCursor(v.state), troca: false };
    return null;
  }

  poePeca(nome: string, args: readonly string[], tamanho: WidgetSize, corpo?: readonly string[]): void {
    const v = this.view;
    if (!v) return;
    if (corpo) return this.poeTabelaDaFolha(args, corpo);
    const alvo = this.alvo ?? { ...lugarDoCursor(v.state), troca: false };
    this.alvo = null;
    const tr = v.state.tr;
    const velho = alvo.troca ? tr.doc.nodeAt(alvo.pos) : null;
    let at: number;
    if (velho?.type === N['widget']) {
      // a peça trocada fica com o recuo que tinha (embaixo de um item, continua no item)
      tr.setNodeMarkup(alvo.pos, null, { ...velho.attrs, nome, args: [...args], tamanho });
      at = alvo.pos;
    } else at = poeNoLugar(v.state, tr, Math.min(alvo.pos, tr.doc.content.size), { nome, args, tamanho });
    v.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView());
    v.focus();
  }

  tiraPeca(): void {
    const v = this.view;
    if (!v) return;
    const alvo = this.alvo;
    this.alvo = null;
    const pos = alvo?.troca ? alvo.pos : pecaDe(v.state)?.de;
    const tipo = pos === undefined ? null : v.state.doc.nodeAt(pos)?.type;
    if (pos === undefined || (tipo !== N['widget'] && tipo !== N['tabela'])) return v.focus();
    const tr = v.state.tr;
    if (tipo === N['tabela']) tiraTabela(tr, pos);
    else tiraEm(tr, pos);
    v.dispatch(tr.scrollIntoView());
    v.focus();
  }

  voltaAPeca(): void {
    const v = this.view;
    if (!v) return;
    const alvo = this.alvo;
    this.alvo = null;
    if (alvo?.troca && v.state.doc.nodeAt(alvo.pos)?.type === N['widget']) v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, alvo.pos)).scrollIntoView());
    // a tabela: o cursor volta para onde estava nela
    const t = alvo?.troca ? v.state.doc.nodeAt(alvo.pos) : null;
    if (alvo && t?.type === N['tabela']) {
      const at = alvo.sel !== undefined && alvo.sel > alvo.pos && alvo.sel < alvo.pos + t.nodeSize ? alvo.sel : posDaCelula(t, alvo.pos, 0, 0);
      v.dispatch(v.state.tr.setSelection(Selection.near(v.state.doc.resolve(at))).scrollIntoView());
    }
    v.focus();
  }

  // ===== A tabela (ver tabela.ts) =====

  /**
   * A tabela do cursor, para a folha da tabela ("Abrir na folha" do menu "Tabela"): o jeito e o markdown
   * dela. O Visual guarda onde ela está (e o cursor), até a folha pôr, tirar ou fechar.
   */
  private lugarDaTabela(): PecaVisual | null {
    const v = this.view!;
    const t = tabelaEm(v.state.selection.$head);
    if (!t) {
      this.alvo = { ...lugarDoCursor(v.state), troca: false };
      return null;
    }
    this.alvo = { pos: t.pos, lado: 1, troca: true, sel: v.state.selection.head };
    const e = this.escrever(v.state.doc);
    const i = v.state.doc.resolve(t.pos).index(0);
    const l = e.doc.linhas.length === v.state.doc.childCount ? e.doc.linhas[i] : null;
    if (l?.kind !== 'tabela') return null;
    const linhas = l.fonte!.texto.split(/\r\n|\r|\n/);
    return { de: t.pos, nome: 'tabela', args: l.jeito ? [l.jeito] : [], tamanho: 'medio', corpo: linhas.slice(l.jeito ? 1 : 0).join('\n') };
  }

  /** A tabela que a folha devolveu: troca a guardada (com o recuo dela) ou entra no lugar do cursor. */
  private poeTabelaDaFolha(args: readonly string[], corpo: readonly string[]): void {
    const v = this.view!;
    const alvo = this.alvo ?? { ...lugarDoCursor(v.state), troca: false };
    this.alvo = null;
    const lida = textToDoc(widgetLines('tabela', args, 'medio', corpo).join('\n')).linhas.find((l) => l.kind === 'tabela');
    if (!lida) return v.focus();
    const cria = (recuo: number) => noDe({ ...lida, recuo, fonte: undefined });
    const tr = v.state.tr;
    const velha = alvo.troca ? tr.doc.nodeAt(alvo.pos) : null;
    let at: number;
    if (velha?.type === N['tabela']) {
      tr.replaceWith(alvo.pos, alvo.pos + velha.nodeSize, cria(velha.attrs['recuo'] ?? 0));
      at = alvo.pos;
    } else at = poeBlocoNoLugar(v.state, tr, Math.min(alvo.pos, tr.doc.content.size), cria);
    const nova = tr.doc.nodeAt(at)!;
    v.dispatch(tr.setSelection(TextSelection.create(tr.doc, posDaCelula(nova, at, 0, 0))).scrollIntoView());
    v.focus();
  }

  /** O que a cópia dos widgets precisa: a hora (o contador) e o título de agora de uma ficha colada (a nota). */
  private contextoDaCopia(): CopyContext {
    let cards: CardFinder | null = null;
    try {
      cards = this.injector.get(CardFinder, null);
    } catch {
      cards = null;
    }
    return { now: Date.now(), cardTitle: (id) => cards?.find(id)?.review.game.name ?? null };
  }

  /** Uma imagem colada ou solta: o marcador entra no lugar dela, e o editor a guarda (ver `poeImagem`). */
  private recebeImagem(arquivo: Blob, lugar: Lugar): void {
    const v = this.view;
    if (!v) return;
    const marca = ++this.marcas;
    v.dispatch(marcaEnvio(v.state.tr, marca, lugar));
    this.imagem.emit({ arquivo, marca });
  }

  poeImagem(marca: number, url: string): void {
    const v = this.view;
    if (!v) return;
    const m = envio(v.state, marca);
    const tr = tiraEnvio(v.state.tr, marca);
    // o trecho onde ela ia foi apagado (ou o marcador sumiu): ela entra onde o cursor estiver
    const lugar = m && !m.perdida ? m : lugarDoCursor(v.state);
    const at = poeNoLugar(v.state, tr, Math.min(lugar.pos, tr.doc.content.size), { nome: 'imagem', args: [url], tamanho: 'medio' });
    // escreveu enquanto ela era guardada: o cursor fica com quem escreve; senão, ele vai para depois dela
    if (!m?.mexeu) tr.setSelection(depoisDaPeca(tr, at));
    v.dispatch(tr.scrollIntoView());
  }

  tiraMarca(marca: number): void {
    const v = this.view;
    if (v && envio(v.state, marca)) v.dispatch(tiraEnvio(v.state.tr, marca));
  }

  trocaImagem(de: string, para: string): boolean {
    const v = this.view;
    if (!v) return false;
    const tr = v.state.tr;
    v.state.doc.forEach((n, pos) => {
      if (n.type !== N['widget'] || !(n.attrs['args'] as string[]).includes(de)) return;
      tr.setNodeMarkup(pos, null, { ...n.attrs, args: (n.attrs['args'] as string[]).map((a) => (a === de ? para : a)) });
    });
    if (!tr.docChanged) return false;
    // o colar já está no histórico: a troca do endereço vai junto dele (o Ctrl+Z tira a imagem colada)
    v.dispatch(tr.setMeta('addToHistory', false));
    return true;
  }

  // ===== O texto e o documento =====

  private plugins(): Plugin[] {
    return [
      escritor((doc) => this.escrever(doc)),
      this.passaAdiante(),
      this.limite(),
      // copiar e recortar: o texto limpo, o HTML e o markdown (antes do ProseMirror e da tabela)
      copiar({ fonte: (n) => this.fontes.get(n), contexto: () => this.contextoDaCopia() }),
      protegeTabela(),
      pecas({ imagem: (arquivo, lugar) => this.recebeImagem(arquivo, lugar) }),
      atalhos(),
      keymap({ 'Mod-k': () => (this.pedeLinkAqui('url'), true) }),
      teclas(),
      enterPeloBeforeinput(),
      apagarPeloBeforeinput(),
      this.cliqueNoLink(),
      this.colarEndereco(),
      // colar: o markdown do Murall, o HTML de fora, a planilha, o limite por linhas inteiras
      colar({
        tamanho: (doc) => this.escrever(doc).texto.length,
        max: () => this.max(),
        imagem: (arquivo, lugar) => this.recebeImagem(arquivo, lugar),
        aviso: (texto) => this.aviso.emit(texto),
      }),
      semQuebras(),
      linksInteiros(),
      edicaoDaTabela(),
      // pôr e tirar fileira e coluna direto na tabela do cursor
      alcasDaTabela({ mais: ICON.adicionar, menos: ICON.tirar }),
      tabelasRetas(),
      history(),
      gapCursor(),
      dropCursor({ color: '#1f5fbf', width: 2 }),
      this.vazia(),
      desenhoDasListas((doc) => this.escrever(doc)),
    ];
  }

  private estadoDe(texto: string): EditorState {
    const d = textToDoc(texto);
    this.quebra = d.quebra;
    const doc = docDe(d.linhas);
    // o texto que começa com uma peça: o cursor de lacuna antes dela (e não a peça selecionada, que
    // mostraria a tirinha sem ninguém tocar nela)
    const selection = doc.firstChild!.isTextblock ? undefined : new GapCursor(doc.resolve(0));
    return EditorState.create({ doc, selection, plugins: this.plugins() });
  }

  /**
   * O texto de fora (5.19: a colega da compartilhada, outro aparelho, um pedido da AI, o que se escreveu
   * no Markdown): os blocos do texto de antes e do que chegou são comparados (o `commonPairs` da junção),
   * cada um pelo trecho escrito e pelo que o leitor leu nele (o mesmo trecho lido noutro contexto, como a
   * linha que passou a ser o corpo de um item, é outro bloco), e só os nós dos blocos mudados são
   * trocados, numa transação fora do desfazer: o Ctrl+Z não desfaz o que veio de fora, e o cursor anda
   * com ela (o ProseMirror mapeia; o histórico também, como numa edição a muitas mãos). O bloco que não
   * mudou continua o mesmo nó (a peça não se refaz), com a fonte nova (a quebra de depois pode ter mudado).
   */
  private chega(texto: string): void {
    const v = this.view!;
    const doc = v.state.doc;
    const e = this.escrever(doc);
    const novo = textToDoc(texto);
    const id = (l: LinhaDoc) => l.fonte!.texto + '\u0000' + chave(l);
    // cada nó com o bloco que a escrita leu de volta dele (o que ainda vai se ajustar não casa com nada)
    const velhos: (string | null)[] =
      e.doc.linhas.length === doc.childCount
        ? e.doc.linhas.map((l, i) => (e.exato || chave(l) === chave(normalizarLinha(linhaDe(doc.child(i)))) ? id(l) : null))
        : Array.from({ length: doc.childCount }, () => null);
    const pares = commonPairs(velhos, novo.linhas.map(id), (a, b) => a !== null && a === b);
    const inicio: number[] = [];
    let pos = 0;
    doc.forEach((n) => {
      inicio.push(pos);
      pos += n.nodeSize;
    });
    inicio.push(pos);
    // os trechos entre os pares: [de, até) no documento e [de, até) no que chegou
    const trocas: [number, number, number, number][] = [];
    let [a, b] = [0, 0];
    for (const [i, j] of [...pares, [doc.childCount, novo.linhas.length]]) {
      if (i > a || j > b) trocas.push([a, i, b, j]);
      [a, b] = [i + 1, j + 1];
    }
    for (const [i, j] of pares) this.fontes.set(doc.child(i), novo.linhas[j].fonte!);
    this.docEscrito = undefined;
    this.quebra = novo.quebra;
    this.ultimo = texto;
    const tr = v.state.tr;
    // de trás para a frente: as posições de antes continuam valendo
    for (let k = trocas.length - 1; k >= 0; k--) {
      const [de, ate, nde, nate] = trocas[k];
      tr.replaceWith(inicio[de], inicio[ate], novo.linhas.slice(nde, nate).map(noDe));
    }
    if (!tr.docChanged) return this.emiteEstado();
    // o cursor numa linha trocada por uma só (a colega mexeu na linha onde se escreve): fica no mesmo
    // ponto dela, em vez de ir para a ponta do trecho trocado
    const sel = v.state.selection;
    const $c = sel.$head;
    const t = sel instanceof TextSelection && sel.empty && $c.depth === 1 ? trocas.find(([de, ate]) => $c.index(0) >= de && $c.index(0) < ate) : undefined;
    if (t && t[1] - t[0] === t[3] - t[2]) {
      const j = t[2] + $c.index(0) - t[0];
      const n = tr.doc.maybeChild(j);
      if (n?.isTextblock) {
        let p = 0;
        for (let k = 0; k < j; k++) p += tr.doc.child(k).nodeSize;
        tr.setSelection(TextSelection.create(tr.doc, p + 1 + Math.min($c.parentOffset, n.content.size)));
      }
    }
    v.dispatch(tr.setMeta(CHEGOU, true).setMeta(AJUSTE, true).setMeta(FORA, true).setMeta('addToHistory', false));
  }

  // ===== A tela cheia e outra ficha =====

  levaEstado(): MalaVisual {
    const v = this.view!;
    const mala: Mala = { mala: 'visual', state: v.state, fontes: this.fontes, quebra: this.quebra, ultimo: this.ultimo };
    return mala;
  }

  /**
   * O estado da outra folha, com os plugins desta (o `reconfigure` guarda os campos dos plugins de mesma
   * chave: o desfazer, os marcadores das imagens guardando, o desenho das listas). O texto que mudou desde
   * que ela o escreveu (ela estava escondida) entra por cima, fora do desfazer.
   */
  recebeEstado(mala: MalaVisual): void {
    const v = this.view;
    const m = mala as Mala;
    if (!v || !m.state) return;
    this.fontes = m.fontes;
    this.quebra = m.quebra;
    this.ultimo = m.ultimo;
    this.docEscrito = undefined;
    this.trecho = null;
    this.alvo = null;
    v.updateState(m.state.reconfigure({ plugins: this.plugins() }));
    if (this.ativo() && this.texto() !== this.ultimo) this.chega(this.texto());
    this.emiteEstado();
  }

  recomeca(): void {
    const v = this.view;
    if (!v) return;
    this.trecho = null;
    this.alvo = null;
    v.updateState(this.estadoDe(this.ultimo));
    this.emiteEstado();
  }

  /**
   * O documento em texto, pelo tradutor. O último fica guardado (a mesma transação pede duas vezes), e
   * cada nó escrito de novo guarda a fonte nova: na próxima tecla, só a linha mexida é escrita de novo.
   */
  private escrever(doc: PMNode): Escrita {
    if (doc === this.docEscrito && this.escrita) return this.escrita;
    const linhas: LinhaDoc[] = [];
    doc.forEach((n) => {
      const l = linhaDe(n);
      const f = n.type === N['cru'] ? undefined : this.fontes.get(n);
      let c = f ? this.comFonte.get(n) : l;
      if (f && c?.fonte !== f) this.comFonte.set(n, (c = { ...l, fonte: f }));
      linhas.push(c!);
    });
    // a trava lê só o trecho mexido desde a escrita de antes (ver `escritaParcial`)
    const e = docToText({ linhas, quebra: this.quebra }, this.escrita);
    if (e.exato)
      doc.forEach((n, _, i) => {
        const f = e.doc.linhas[i]?.fonte;
        if (f && n.type !== N['cru']) this.fontes.set(n, f);
      });
    this.docEscrito = doc;
    this.escrita = e;
    return e;
  }

  private aplica(tr: Transaction): void {
    const v = this.view;
    if (!v) return;
    const antes = v.state;
    const { state, transactions } = antes.applyTransaction(tr);
    v.updateState(state);
    // o trecho do pedido de link anda com o texto (as transações dos plugins também)
    if (this.trecho && state.doc !== antes.doc)
      for (const t of transactions) {
        const [from, to]: number[] = [t.mapping.map(this.trecho.from, 1), t.mapping.map(this.trecho.to, -1)];
        this.trecho = { from, to: Math.max(from, to) };
      }
    // o lugar do widget da folha também (a peça trocada gruda nela mesma)
    if (this.alvo && state.doc !== antes.doc)
      for (const t of transactions)
        this.alvo = { ...this.alvo, pos: t.mapping.map(this.alvo.pos, this.alvo.troca ? 1 : this.alvo.lado), ...(this.alvo.sel !== undefined ? { sel: t.mapping.map(this.alvo.sel) } : {}) };
    if (state.doc !== antes.doc) {
      // a tela mostra o que vai ficar (fora da composição: nada mexe no documento enquanto se compõe)
      if (!v.composing && !tr.getMeta(AJUSTE)) this.ajusta();
      const e = this.escrever(v.state.doc);
      // o que chegou de fora já é o valor de agora (`chega` guardou o texto)
      if (e.texto !== this.ultimo && !tr.getMeta(CHEGOU)) {
        this.ultimo = e.texto;
        this.mudou.emit(e.texto);
      }
    }
    this.emiteEstado();
    if (state.doc !== antes.doc || !state.selection.eq(antes.selection)) this.emiteCursor();
  }

  /** O cursor no texto guardado, para a prévia da ficha (só à mostra: escondida, a folha não é a do cursor). */
  private emiteCursor(): void {
    const v = this.view;
    if (!v || !this.ativo()) return;
    this.cursor.emit(this.noTexto(this.escrever(v.state.doc), v.state.selection.head));
  }

  /**
   * A escrita não conseguiu ser exata (um caso sabido do tradutor): as linhas que o leitor lê diferente
   * passam a ser o que ele lê, fora do histórico. A linha vazia onde está o cursor espera (é o começo
   * do que a pessoa vai escrever).
   */
  private ajusta(): void {
    const v = this.view!;
    const doc = v.state.doc;
    const e = this.escrever(doc);
    if (e.exato) return;
    const sel = this.selecaoNoTexto();
    const $c = v.state.selection.$from;
    const cursor = $c.depth ? $c.index(0) : -1;
    const lidas = e.doc.linhas;
    const tr = v.state.tr.setMeta(AJUSTE, true).setMeta(FORA, true).setMeta('addToHistory', false);
    if (lidas.length === doc.childCount) {
      let pos = doc.content.size;
      for (let i = doc.childCount - 1; i >= 0; i--) {
        const n = doc.child(i);
        pos -= n.nodeSize;
        if (chave(lidas[i]) === chave(normalizarLinha(linhaDe(n)))) continue;
        if (i === cursor && !n.textContent.trim()) continue;
        tr.replaceWith(pos, pos + n.nodeSize, noDe(lidas[i]));
      }
    } else tr.replaceWith(0, doc.content.size, docDe(lidas).content);
    if (!tr.docChanged) return;
    v.dispatch(tr);
    this.poeSelecao(...sel);
  }

  /**
   * A posição do documento no texto escrito. Com `fim` (o fim de uma seleção), colada na letra de
   * antes; depois de uma peça, no fim dela.
   */
  private noTexto(e: Escrita, pos: number, fim = false): number {
    const doc = this.view!.state.doc;
    if (e.doc.linhas.length !== doc.childCount) return e.texto.length;
    const $p = doc.resolve(pos);
    const i = $p.index(0);
    if ($p.depth === 0) {
      if (fim && i > 0) return e.inicios[i - 1] + e.doc.linhas[i - 1].fonte!.texto.length;
      return i < e.inicios.length ? e.inicios[i] : e.texto.length;
    }
    // na tabela, a célula e a letra dela
    const c = doc.child(i).type === N['tabela'] ? celulaEm($p) : null;
    if (c) return posicaoNaTabela(e, i, c.f, c.c, c.off, fim);
    return posicaoNoTexto(e, i, $p.parentOffset, fim);
  }

  /** A posição do texto escrito no documento (numa peça, logo antes dela). */
  private noDoc(e: Escrita, at: number): number {
    const doc = this.view!.state.doc;
    const { linha, col, celula } = posicaoNoDoc(e, at);
    let pos = 0;
    for (let k = 0; k < linha; k++) pos += doc.child(k).nodeSize;
    const n = doc.maybeChild(linha);
    if (!n) return doc.content.size;
    if (celula && n.type === N['tabela']) return posDaCelula(n, pos, celula.fileira, celula.coluna, col);
    return n.isTextblock ? pos + 1 + Math.min(col, n.content.size) : pos;
  }

  private emiteEstado(): void {
    const s = this.view!.state;
    const est: EstadoVisual = {
      marcas: MARCAS.filter(([, m]) => ligada(s, m)).map(([a]) => a),
      estilo: estiloDe(s),
      lista: listaDe(s),
      desfazer: undoDepth(s) > 0,
      refazer: redoDepth(s) > 0,
      // o "[[" vale também compondo (a palavra sublinhada do teclado): a lista só lê, não mexe no texto
      colchetes: colchetesAntes(s),
      link: s.selection.empty ? (linkEm(s.selection.$from)?.from ?? null) : null,
      peca: pecaDe(s),
      tabela: estadoTabela(s),
    };
    const k = JSON.stringify(est);
    if (k === this.ultimoEstado) return;
    this.ultimoEstado = k;
    this.estado.emit(est);
  }

  private avisa(texto: string): void {
    // uma vez a cada tanto (segurar uma tecla no limite não enche a tela de avisos)
    if (Date.now() - this.avisadoEm < 4000) return;
    this.avisadoEm = Date.now();
    this.aviso.emit(texto);
  }

  private limiteTexto(): string {
    return `Chegou no limite de ${new Intl.NumberFormat('pt-BR').format(this.max()!)} caracteres`;
  }

  // ===== Os plugins =====

  /**
   * O limite é o da string guardada (as marcas contam): a mudança que passaria dele não entra, como a
   * `maxlength` do Markdown. Durante a composição entra (recusar desencontra o que o teclado mostra), e
   * o excesso sai quando ela acaba.
   */
  private limite(): Plugin {
    return new Plugin({
      filterTransaction: (tr) => {
        const max = this.max();
        if (!max || !tr.docChanged || tr.getMeta(FORA) || this.view?.composing) return true;
        const n = this.escrever(tr.doc).texto.length;
        if (n <= max || n <= this.ultimo.length) return true;
        this.avisa(tr.getMeta('uiEvent') === 'paste' ? `O que foi colado não coube: ${this.limiteTexto().toLowerCase()}` : this.limiteTexto());
        return false;
      },
      props: {
        handleDOMEvents: {
          compositionend: () => {
            setTimeout(() => this.cortaExcesso());
            return false;
          },
        },
      },
    });
  }

  /** Passou do limite compondo: as letras de antes do cursor saem até caber. */
  private cortaExcesso(): void {
    const max = this.max();
    const v = this.view;
    if (!max || !v || v.composing) return;
    for (let vez = 0; vez < 8; vez++) {
      const excesso = this.escrever(v.state.doc).texto.length - max;
      const $c = v.state.selection.$from;
      if (excesso <= 0 || !$c.parent.isTextblock || !$c.parentOffset) break;
      v.dispatch(v.state.tr.delete(Math.max($c.start(), $c.pos - excesso), $c.pos).setMeta(FORA, true));
    }
    if (this.escrever(v.state.doc).texto.length > max) return;
    this.avisa(this.limiteTexto());
  }

  /**
   * O que o Visual não usa passa adiante: o Esc (que fecha o editor da ficha), sem o ProseMirror
   * cancelar a tecla; o Ctrl+Enter (o "Enviar" do comentário), que não vira linha nova; com a lista do
   * "[[" aberta, as setas, o Enter e o Tab (são dela). O foco e a saída da folha vão para a régua (presa
   * em cima do teclado no celular).
   */
  private passaAdiante(): Plugin {
    return new Plugin({
      props: {
        handleDOMEvents: {
          keydown: (v, e) => {
            if (e.key === 'Escape') return true;
            // o Ctrl+Alt+Enter marca a tarefa: aqui, e não no mapa de teclas, porque no Chrome do Android
            // o ProseMirror deixa todo Enter para o beforeinput (que não vem com o Ctrl)
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey) {
              e.preventDefault();
              marcarTarefa(v.state, v.dispatch);
              return true;
            }
            // numa peça selecionada (ou no cursor de lacuna), o Enter e o apagar: no Chrome do Android o
            // ProseMirror deixa o Enter para o navegador, que não manda nada com a seleção numa peça
            const sel = v.state.selection;
            if ((sel instanceof NodeSelection || sel instanceof GapCursor) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
              const cmd = e.key === 'Enter' && !e.shiftKey ? enter : e.key === 'Backspace' ? apagarParaTras : e.key === 'Delete' ? apagarParaFrente : null;
              if (cmd) {
                e.preventDefault();
                cmd(v.state, v.dispatch, v);
                return true;
              }
            }
            if (this.lista() && ['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.isComposing) return true;
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey) {
              e.preventDefault();
              return true;
            }
            return false;
          },
          focus: (_v, e) => {
            this.foco.emit(e);
            this.emiteCursor();
            return false;
          },
          blur: (_v, e) => {
            this.desfoco.emit(e);
            return false;
          },
        },
      },
    });
  }

  /**
   * Um clique num link (sem arrastar, sem seleção): o painel passivo dele (trocar, tirar, abrir), com o
   * cursor onde a pessoa tocou; Ctrl+clique (ou Cmd) no link para um endereço abre ele numa aba nova. O
   * link nunca navega de dentro da folha.
   */
  private cliqueNoLink(): Plugin {
    return new Plugin({
      props: {
        handleDOMEvents: {
          // o Ctrl+clique no link não é do ProseMirror (que selecionaria a linha inteira)
          mousedown: (_view, e) => {
            if (!(e.ctrlKey || e.metaKey) || e.button !== 0 || !(e.target as Element | null)?.closest?.('a.url')) return false;
            e.preventDefault();
            return true;
          },
          click: (view, e) => {
            const alvo = (e.target as Element | null)?.closest?.('a.url, span[data-elo]');
            if (!alvo || !view.dom.contains(alvo) || e.button !== 0) return false;
            const url = alvo.matches('a.url');
            if (url) e.preventDefault();
            let pos: number;
            try {
              pos = view.posAtDOM(alvo, 0);
            } catch {
              return false;
            }
            const no = faixaDaMarca(view.state.doc.resolve(pos), url ? M['link'] : M['elo']);
            if (!no) return false;
            if (url && (e.ctrlKey || e.metaKey)) {
              window.open(no.mark.attrs['href'], '_blank', 'noopener,noreferrer');
              return true;
            }
            if (e.detail > 1 || !view.state.selection.empty) return false;
            this.pedeLinkDe(no, true);
            return false;
          },
        },
      },
    });
  }

  /** Colar um endereço com um texto selecionado (numa linha só): o texto vira o link (como no Markdown). */
  private colarEndereco(): Plugin {
    return new Plugin({
      props: {
        handlePaste: (view, e) => {
          const colado = e.clipboardData?.getData('text/plain').trim() ?? '';
          const { from, to, empty, $from } = view.state.selection;
          if (empty || !/^(https?:\/\/|mailto:)\S+$/i.test(colado) || !$from.parent.inlineContent || $from.parent.type.spec.code || !$from.sameParent(view.state.selection.$to)) return false;
          view.dispatch(view.state.tr.removeMark(from, to, M['elo']).removeMark(from, to, M['codigo']).addMark(from, to, M['link'].create({ href: colado })).scrollIntoView());
          return true;
        },
      },
    });
  }

  /** A folha vazia mostra o convite do editor ("Escreva o que quiser…"), como a do Markdown. */
  private vazia(): Plugin {
    return new Plugin({
      props: {
        decorations: (state) => {
          const doc = state.doc;
          const p = this.placeholder();
          const first = doc.firstChild!;
          if (!p || doc.childCount !== 1 || first.type !== N['linha'] || first.content.size) return null;
          return DecorationSet.create(doc, [Decoration.node(0, first.nodeSize, { class: 'vis-vazia', 'data-placeholder': p })]);
        },
      },
    });
  }

  /** A largura de um espaço na letra da folha: o recuo de cada linha é contado em espaços, como na leitura. */
  private mede(): void {
    const dom = this.view?.dom as HTMLElement | undefined;
    if (!dom?.isConnected) return;
    const s = document.createElement('span');
    s.textContent = ' '.repeat(40);
    s.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${getComputedStyle(dom).font}`;
    this.host.append(s);
    const w = s.getBoundingClientRect().width / 40;
    s.remove();
    if (w > 0) this.host.style.setProperty('--vis-espaco', `${w}px`);
  }
}

/** As letras de cada célula de uma fileira. */
function celulasDe(f: PMNode): string[] {
  const out: string[] = [];
  f.forEach((c) => out.push(c.textContent));
  return out;
}

/**
 * Inserir › Tabela: a tabela 3×2 direto na folha, com o cursor na primeira célula (no lugar da linha
 * vazia, ou numa linha só dela depois da do cursor; dentro de um item, no recuo da descrição).
 */
const poeTabela = (colunas?: number, fileiras?: number): Command => (state, dispatch) => {
  if (dispatch) {
    const tr = state.tr;
    const at = poeBlocoNoLugar(state, tr, lugarDoCursor(state).pos, (recuo) => tabelaVazia(recuo, colunas, fileiras));
    dispatch(tr.setSelection(TextSelection.create(tr.doc, posDaCelula(tr.doc.nodeAt(at)!, at, 0, 0))).scrollIntoView());
  }
  return true;
};

/** O texto de um trecho copiado, como letras: uma linha por linha; a peça crua, o texto dela. */
function textoDoSlice(slice: Slice): string {
  const linhas: string[] = [];
  slice.content.forEach((n) => {
    if (n.isTextblock) linhas.push(n.textContent);
    else if (n.type === N['cru']) linhas.push(textoDoCru(n));
    else if (n.type === N['divisoria']) linhas.push('---');
    else if (n.type === N['widget']) linhas.push(linhaDaPeca(n));
    // a tabela (ou as fileiras dela): uma linha por fileira, as células separadas por tab (como uma planilha)
    else if (n.type === N['tabela'] || n.type === N['fileira']) (n.type === N['tabela'] ? n.content : Fragment.from(n)).forEach((f) => linhas.push(celulasDe(f).join('\t')));
    else linhas.push(n.textContent);
  });
  return linhas.join('\n');
}
