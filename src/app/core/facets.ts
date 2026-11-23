/**
 * Uma folha de filtros em linhas (ui/facet-filters.ts): a dos Gastos e a do Dicionário Japonês. Cada linha um
 * filtro, com o nome, o que ele faz e os recortes; dentro da linha vale qualquer um dos escolhidos, entre as
 * linhas, todos juntos. Só os tipos: quem filtra calcula as contagens.
 */
export interface FacetOption {
  value: string;
  label: string;
  /** Quantos itens a opção mostraria, com as outras linhas como estão. */
  n: number;
  on: boolean;
  /** A cartolina (`--stock-<cor>`) do selinho ao lado do nome (as categorias dos Gastos). */
  color?: string;
}

export interface FacetGroup<K extends string = string> {
  key: K;
  title: string;
  /** O que a linha faz, embaixo do nome dela. */
  desc: string;
  options: FacetOption[];
}
