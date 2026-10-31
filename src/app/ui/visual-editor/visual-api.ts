import type { LineStyle } from '../rich-editor';
import type { Align, TableLook } from '../../core/tables';
import type { WidgetSize } from '../../core/widgets';

/**
 * O que a régua do editor (ui/rich-editor.ts) pede ao modo Visual e o que ele conta de volta. Só tipos:
 * o editor importa daqui sem trazer o Visual (que chega num pedaço à parte) para o carregamento do site.
 */

/** As marcas da linha que o Visual liga e desliga (os nomes das ações da régua). */
export type MarcaVisual = 'bold' | 'italic' | 'strike' | 'mark' | 'spoiler' | 'subtle' | 'code';

/** Os tipos de lista (os nomes das ações da régua): a lista, a numerada e as tarefas. */
export type ListaVisual = 'ul' | 'ol' | 'check';

/**
 * O que a régua pede: uma marca, uma lista, a linha dentro do item (`inside`), a divisória, a tabela nova
 * (`tabela`, a 3×2 do Inserir), o desfazer, o estilo do parágrafo, ou uma ação do menu "Tabela".
 */
export type AcaoVisual = MarcaVisual | ListaVisual | 'inside' | 'rule' | 'tabela' | 'undo' | 'redo' | { estilo: LineStyle } | { tabela: AcaoTabela };

/** O que o menu "Tabela" da régua pede (as ações da grade da folha da tabela, ui/table-grid.ts). */
export type AcaoTabela =
  | 'fileiraEmCima'
  | 'fileiraEmbaixo'
  | 'colunaAntes'
  | 'colunaDepois'
  | 'subirFileira'
  | 'descerFileira'
  | 'colunaParaTras'
  | 'colunaParaFrente'
  | 'tirarFileira'
  | 'tirarColuna'
  | 'tirarTabela'
  | { alinhar: Align }
  | { jeito: TableLook };

/** A tabela do cursor, para o menu "Tabela" da régua (ele aparece com ela). */
export interface EstadoTabela {
  /** A fileira do cursor (0 é o cabeçalho) e quantas a tabela tem (com o cabeçalho). */
  fileira: number;
  fileiras: number;
  coluna: number;
  colunas: number;
  /** O alinhamento da coluna do cursor. */
  alinhar: Align;
  jeito: TableLook;
}

/** O que o Visual conta à régua a cada mudança de seleção ou de texto. */
export interface EstadoVisual {
  /** As marcas ligadas na seleção (ou nas que valem para a próxima letra). */
  marcas: readonly MarcaVisual[];
  /** O estilo da linha do cursor (null: numa peça que não tem estilo). */
  estilo: LineStyle | null;
  /** A lista da linha do cursor (o botão dela fica afundado), ou null. */
  lista: ListaVisual | null;
  desfazer: boolean;
  refazer: boolean;
  /** O "[[" aberto antes do cursor: onde ele está (no documento) e a busca escrita depois dele. */
  colchetes: { de: number; busca: string } | null;
  /** Onde começa (no documento) o link em que o cursor está; null fora de um link. */
  link: number | null;
  /** O widget selecionado (a peça inteira): a régua mostra a tirinha dele. */
  peca: PecaVisual | null;
  /** A tabela do cursor: a régua mostra o menu "Tabela". */
  tabela: EstadoTabela | null;
}

/** Um widget da folha do Visual: onde ele está no documento e o que ele é. */
export interface PecaVisual {
  de: number;
  nome: string;
  args: readonly string[];
  tamanho: WidgetSize;
  /** A tabela (no `lugarDaPeca('tabela')`): o markdown dela, sem a marca do jeito (o jeito vai em `args`). */
  corpo?: string;
}

/**
 * O Visual pede o painel de um link (o Ctrl+K, a régua, um clique num link): o que o painel mostra.
 * `troca`: já é um link (o painel troca ou tira); `passivo`: veio de um clique, com o cursor na folha.
 * `de`: onde o trecho começa no documento (o painel passivo fecha quando o cursor sai dele).
 */
export type PedidoLink =
  | { tipo: 'url'; de: number; texto: string; href: string; troca: boolean; passivo: boolean }
  | { tipo: 'elo'; de: number; titulo: string; rotulo: string; troca: boolean; passivo: boolean };

export interface VisualApi {
  /** O elemento do Visual (fora da página, ele já não vale). */
  readonly host: HTMLElement;
  /** Faz o que a régua pediu; false se o Visual ainda não sabe (a régua manda para o Markdown). */
  run(acao: AcaoVisual): boolean;
  focus(): void;
  blur(): void;
  /** A seleção, em posições do texto guardado (o começo e o fim). */
  selecaoNoTexto(): [number, number];
  /** Põe a seleção no lugar das posições do texto dadas. */
  poeSelecao(de: number, ate: number): void;
  /** O painel do link no lugar do cursor (o link de agora, para trocar; ou a seleção): o Visual responde pelo `pedeLink`. */
  pedeLinkAqui(tipo: 'url' | 'elo'): void;
  /** Põe (ou troca) o link para um endereço no trecho do último pedido; sem texto, o endereço aparece. */
  poeLink(texto: string, href: string): void;
  /** Põe (ou troca) o link de anotação: no "[[" antes do cursor (`noColchete`) ou no trecho do último pedido. */
  poeElo(titulo: string, rotulo: string, noColchete: boolean): void;
  /** Tira o link do trecho do último pedido (o texto fica). */
  tiraLink(): void;
  /** O painel fechou sem mudar nada: o foco volta para a folha, com o trecho do pedido selecionado. */
  voltaAoTrecho(): void;
  /**
   * A folha do widget vai abrir: o Visual guarda onde ele vai ficar (acompanhando o texto). Com um widget
   * selecionado (do nome dado, ou qualquer um), é ele (a folha troca): devolve o widget. Senão, o lugar
   * do cursor (a folha põe um novo): null.
   */
  lugarDaPeca(nome?: string): PecaVisual | null;
  /**
   * Põe (ou troca) o widget no lugar guardado; a peça fica selecionada. A tabela (`corpo`: as linhas do
   * markdown dela) entra como a tabela da folha, com o cursor na primeira célula.
   */
  poePeca(nome: string, args: readonly string[], tamanho: WidgetSize, corpo?: readonly string[]): void;
  /** Tira o widget guardado (ou o selecionado). */
  tiraPeca(): void;
  /** A folha fechou sem mudar nada: o foco volta, com o widget selecionado (ou o cursor no lugar). */
  voltaAPeca(): void;
  /** A imagem guardada (`marca`, a do pedido `imagem`) entra no lugar dela, como o widget de imagem. */
  poeImagem(marca: number, url: string): void;
  /** A imagem do pedido `marca` não entrou: o marcador sai. */
  tiraMarca(marca: number): void;
  /** O endereço de uma imagem trocado em todo widget que o tem (a de outra pessoa virou cópia sua). */
  trocaImagem(de: string, para: string): boolean;
  /**
   * O estado da folha (o documento, a seleção, o desfazer), para a outra folha continuar dele: a tela
   * cheia nasce com o estado da pequena e o devolve ao fechar (5.21).
   */
  levaEstado(): MalaVisual;
  /** Continua do estado da outra folha, com o desfazer dela; o texto que mudou desde então entra por cima, fora do desfazer. */
  recebeEstado(mala: MalaVisual): void;
  /** O editor abriu outra ficha: o desfazer recomeça vazio (o texto novo chega depois, fora dele). */
  recomeca(): void;
}

/** O estado de uma folha do Visual, levado para a outra (só o Visual sabe o que tem dentro). */
export interface MalaVisual {
  readonly mala: 'visual';
}

/** Uma imagem colada ou solta na folha do Visual: o arquivo e o marcador do lugar dela. */
export interface ImagemVisual {
  arquivo: Blob;
  marca: number;
}

/** O estado da régua sem o Visual (nada ligado). */
export const ESTADO_VAZIO: EstadoVisual = { marcas: [], estilo: 'texto', lista: null, desfazer: false, refazer: false, colchetes: null, link: null, peca: null, tabela: null };
