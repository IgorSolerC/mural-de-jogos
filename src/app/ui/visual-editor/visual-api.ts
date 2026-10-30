import type { LineStyle } from '../rich-editor';

/**
 * O que a régua do editor (ui/rich-editor.ts) pede ao modo Visual e o que ele conta de volta. Só tipos:
 * o editor importa daqui sem trazer o Visual (que chega num pedaço à parte) para o carregamento do site.
 */

/** As marcas da linha que o Visual liga e desliga (os nomes das ações da régua). */
export type MarcaVisual = 'bold' | 'italic' | 'strike' | 'mark' | 'spoiler' | 'subtle' | 'code';

/** O que a régua pede: uma marca, a divisória, o desfazer, ou o estilo do parágrafo. */
export type AcaoVisual = MarcaVisual | 'rule' | 'undo' | 'redo' | { estilo: LineStyle };

/** O que o Visual conta à régua a cada mudança de seleção ou de texto. */
export interface EstadoVisual {
  /** As marcas ligadas na seleção (ou nas que valem para a próxima letra). */
  marcas: readonly MarcaVisual[];
  /** O estilo da linha do cursor (null: numa peça que não tem estilo). */
  estilo: LineStyle | null;
  desfazer: boolean;
  refazer: boolean;
  /** O "[[" aberto antes do cursor: onde ele está (no documento) e a busca escrita depois dele. */
  colchetes: { de: number; busca: string } | null;
  /** Onde começa (no documento) o link em que o cursor está; null fora de um link. */
  link: number | null;
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
}

/** O estado da régua sem o Visual (nada ligado). */
export const ESTADO_VAZIO: EstadoVisual = { marcas: [], estilo: 'texto', desfazer: false, refazer: false, colchetes: null, link: null };
