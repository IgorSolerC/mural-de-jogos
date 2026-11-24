import { hasInk, gridOf, clampSide } from '../../core/pixel-art';
import { PixelDraft, PixelDrafts, draftKey, draftWhen } from '../../core/pixel-drafts';
import { WidgetValues } from '../../core/widgets';
import { Confirm } from '../confirm';
import { ICON } from '../icons';
import { Toasts } from '../toast';
import type { DraftTarget } from './pixel-studio';

/**
 * Os rascunhos da mesma arte que o ateliê vai abrir (PLANO-RASCUNHOS-PIXEL.md, D9): a mesma obra da galeria, ou o
 * widget com o mesmo desenho de antes (o desenho em branco não acha nada: todo widget novo é igual). Uma obra nova
 * não tem rascunho a achar.
 */
export function sameArt(target: Pick<DraftTarget, 'origin'>, values: WidgetValues): (d: PixelDraft) => boolean {
  const o = target.origin;
  if (o.kind === 'obra') return (d) => d.origin.kind === 'obra' && d.origin.id === o.id;
  if (o.kind === 'widget') {
    if (!hasInk(gridOf(values['pixels'] ?? '', clampSide(values['width']), clampSide(values['height'])))) return () => false;
    const key = draftKey(values);
    return (d) => d.origin.kind === 'widget' && d.base === key;
  }
  return () => false;
}

/**
 * Abrindo o ateliê de uma arte que tem um rascunho guardado: "Continuar o rascunho?". Devolve o rascunho a continuar,
 * ou null para abrir o salvo (Abrir o salvo, o Esc e o clique fora: o rascunho fica; Descartar o rascunho: ele sai, com
 * o Desfazer). Sem rascunho da mesma arte, ou só com o aberto noutra aba (D11), não pergunta nada.
 */
export async function askDraft(confirm: Confirm, drafts: PixelDrafts, toasts: Toasts, match: (d: PixelDraft) => boolean, name: string): Promise<PixelDraft | null> {
  // (a primeira leitura do banco, logo depois de abrir a página; depois, sem nenhum na memória, o ateliê abre na hora)
  await drafts.ready;
  if (!drafts.list().some(match)) return null;
  await drafts.refresh();
  const d = drafts.list().find((x) => match(x) && !drafts.busy().has(x.id));
  if (!d) return null;
  const c = await confirm.choose({
    title: 'Continuar o rascunho?',
    text: `${name} tem um rascunho guardado neste aparelho ${draftWhen(d.savedAt)}, com mudanças que não foram salvas. Abrindo o salvo, o rascunho continua guardado.`,
    confirm: 'Continuar o rascunho',
    secondary: 'Descartar o rascunho',
    cancel: 'Abrir o salvo',
    icon: ICON.paleta,
  });
  if (c === 'confirm') return d;
  if (c === 'secondary') discardDraft(drafts, toasts, d);
  return null;
}

/** Tira o rascunho, com o aviso e o Desfazer que o traz de volta. */
export function discardDraft(drafts: PixelDrafts, toasts: Toasts, d: PixelDraft): void {
  void drafts.remove(d.id);
  toasts.show('Rascunho descartado', { label: 'Desfazer', run: () => void drafts.put(d) });
}
