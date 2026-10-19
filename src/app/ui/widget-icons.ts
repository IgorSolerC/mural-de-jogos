import { LucideIconData } from 'lucide-angular';
import { ICON } from './icons';

/** O desenho de cada widget, no menu "Inserir" do editor e no índice da folha do widget (ver core/widgets.ts). */
export const WIDGET_ICONS: Record<string, LucideIconData> = {
  contador: ICON.ampulheta,
  imagem: ICON.imagem,
  video: ICON.video,
  audio: ICON.fitaCassete,
  nota: ICON.anotacoes,
};
