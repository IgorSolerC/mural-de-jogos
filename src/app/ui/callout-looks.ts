import { LucideIconData } from 'lucide-angular';
import { CalloutLook, calloutLook } from '../core/callouts';
import { ICON } from './icons';

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
