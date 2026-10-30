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
}

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
}

/** O estado da régua sem o Visual (nada ligado). */
export const ESTADO_VAZIO: EstadoVisual = { marcas: [], estilo: 'texto', desfazer: false, refazer: false };
