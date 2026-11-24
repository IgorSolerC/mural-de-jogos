import { hasInk, gridOf, clampSide } from '../../core/pixel-art';
import { PixelDraft, PixelDrafts, draftKey, draftWhen } from '../../core/pixel-drafts';
import { WidgetValues } from '../../core/widgets';
import { Confirm } from '../confirm';
import { ICON } from '../icons';
import { Toasts } from '../toast';
// (só o tipo: o ateliê é carregado pelo @defer de quem o abre, e um valor importado dele o traria junto)
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
  if (!d) {
    // o rascunho desta arte está aberto no ateliê de outra aba (D11): abre o salvo, e diz
    if (drafts.list().some(match)) toasts.show('O rascunho desta arte está aberto no ateliê de outra aba: abri o salvo.');
    return null;
  }
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

/**
 * O aviso do Descartar (PLANO-RASCUNHOS-PIXEL.md, D5), com o Desfazer: o rascunho descartado volta ao banco e o
 * ateliê abre de novo com ele (`reopen`, quem abriu o ateliê). Sem IndexedDB, o desenho volta da memória.
 */
export function offerUndoDiscard(toasts: Toasts, drafts: PixelDrafts, d: PixelDraft, reopen: (d: PixelDraft) => void): void {
  toasts.show(
    'Mudanças descartadas',
    {
      label: 'Desfazer',
      run: () => {
        void drafts.put({ ...d, savedAt: Date.now() });
        reopen(d);
      },
    },
    UNDO_MS,
  );
}

/** Quanto o aviso com o Desfazer de um rascunho fica à mostra: mais que os outros, é a arte de alguém. */
export const UNDO_MS = 10_000;

/** Tira o rascunho, com o aviso e o Desfazer que o traz de volta. */
export function discardDraft(drafts: PixelDrafts, toasts: Toasts, d: PixelDraft): void {
  void drafts.remove(d.id);
  toasts.show('Rascunho descartado', { label: 'Desfazer', run: () => void drafts.put(d) }, UNDO_MS);
}
