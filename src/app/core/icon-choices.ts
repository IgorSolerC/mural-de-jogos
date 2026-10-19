/**
 * Os desenhos que a pessoa escolhe para um grupo das anotações (a orelha e a aba) e para uma coluna
 * do Kanban: a mesma cartela nos dois lugares, na mesma ordem. O desenho de cada um mora no acervo de
 * ícones do site (ver `ICON_CHOICE` em ui/icons.ts).
 *
 * Os ids ficam guardados (nas configurações do mural e nos quadros), então nunca mudam de nome nem de
 * sentido; desenho novo entra no fim. Antes eram duas cartelas (35 dos grupos, 20 das colunas, com
 * cinco ids nas duas); a de agora é a soma, e todo id de antes continua valendo.
 */
export const ICON_CHOICES = [
  // o trabalho andando (as colunas)
  'circulo',
  'lista',
  'lapis',
  'martelo',
  'engrenagem',
  'olho',
  'ampulheta',
  'pausa',
  'bloqueio',
  'check',
  'trofeu',
  'foguete',
  'lampada',
  'inseto',
  'bandeira',
  'estrela',
  'caixa',
  'calendario',
  'relogio',
  'pessoas',
  'chama',
  'raio',
  'alvo',
  'sino',
  'megafone',
  'etiqueta',
  'pasta',
  // os assuntos (os grupos)
  'maleta',
  'capelo',
  'caderno',
  'livro',
  'marcador',
  'pena',
  'carrinho',
  'moedas',
  'chapeu',
  'aviao',
  'mundo',
  'predio',
  'coracao',
  'musica',
  'filme',
  'camera',
  'paleta',
  'cerebro',
  'microscopio',
  'chip',
  'quebra-cabeca',
  'coroa',
  'brilho',
] as const;
export type IconChoice = (typeof ICON_CHOICES)[number];

/** O id é de um desenho da cartela? */
export function isIconChoice(id: unknown): id is IconChoice {
  return (ICON_CHOICES as readonly unknown[]).includes(id);
}
