import { LucideIconData } from 'lucide-angular';
import { CalloutLook, calloutLook } from '../core/callouts';
import { IconChoice, isIconChoice } from '../core/icon-choices';
import { ICON, ICON_CHOICE, iconChoiceOf } from './icons';

/**
 * O desenho de cada jeito do card (ver core/callouts.ts), do acervo de ícones: o mesmo na leitura, no
 * modo Visual, no menu do card e no PDF. O Vazio não tem nenhum (null): o título fica onde o desenho
 * estaria. A cor de cada um mora no CSS (`[data-jeito]`, ui/_formatado.scss).
 */
export const CALLOUT_ICON: Readonly<Record<CalloutLook, LucideIconData | null>> = {
  nota: ICON.editar,
  info: ICON.informacao,
  dica: ICON.lampada,
  feito: ICON.pronto,
  pergunta: ICON.ajuda,
  aviso: ICON.aviso,
  perigo: ICON.raio,
  exemplo: ICON.lista,
  estudo: ICON.livros,
  citacao: ICON.aspas,
  vazio: null,
};

/** O desenho do card do jeito escrito (o que o site não conhece, o da Nota); o do Vazio, nenhum. */
export function calloutIcon(type: string): LucideIconData | null {
  return CALLOUT_ICON[calloutLook(type)];
}

/**
 * O desenho da faixa do card do texto do Quadro livre: o escolhido na cartela, nenhum ('', o do texto novo) ou, nos
 * cards de antes (sem `ic`), o do jeito.
 */
export function noteIcon(look: CalloutLook, ic: IconChoice | '' | undefined): LucideIconData | null {
  if (ic === '') return null;
  if (isIconChoice(ic)) return ICON_CHOICE[ic];
  return CALLOUT_ICON[look];
}

/** O mesmo desenho como escolha da cartela (o do jeito, quando a cartela tem o mesmo), para a cartela marcar o de agora. */
export function noteIconChoice(look: CalloutLook, ic: IconChoice | '' | undefined): IconChoice | null {
  if (ic === '') return null;
  if (isIconChoice(ic)) return ic;
  const of = CALLOUT_ICON[look];
  return of ? iconChoiceOf(of) : null;
}
