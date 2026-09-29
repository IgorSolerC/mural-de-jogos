import { localDay, parseDay } from './review';
import { wobble } from './wall-physics';

/**
 * A folha de um pendente (Pra depois), sorteada pelo id: sempre a mesma para o mesmo pendente.
 * - `espiral`: folha de caderno arrancada da espiral (a mordida dos furos na esquerda), pautada;
 * - `fichario`: folha de fichário, com os três furos e a margem dupla;
 * - `quadriculada`: papel quadriculado, arrancado da espiral de cima;
 * - `bloco`: folha de bloco de recados, amarelinha, com a tira de cola no alto;
 * - `postit`: um post-it, que gruda sozinho (sem fita) e levanta a ponta de baixo.
 */
export type PaperKind = 'espiral' | 'fichario' | 'quadriculada' | 'bloco' | 'postit';
/** Como a folha está presa na parede. */
export type PageHold = 'fita' | 'fitas' | 'canto' | 'nada';
/** Como a capa está presa na folha: colada, com um clipe ou com cantoneiras de álbum. */
export type PhotoHold = 'colada' | 'clipe' | 'cantos';

export const PAPER_KINDS: readonly PaperKind[] = ['espiral', 'fichario', 'quadriculada', 'bloco', 'postit'];

/** As cores de post-it, da papelaria. */
const POSTIT_COLORS = ['#fff17c', '#ffb0d2', '#aee6ff', '#c9f590', '#ffc98a'] as const;

export interface NotebookPage {
  kind: PaperKind;
  hold: PageHold;
  photo: PhotoHold;
  /** A cor do post-it (as outras folhas são brancas). */
  color: string | null;
  /** Inclinação da fita (ou das fitas), em graus. */
  tapeTilt: number;
  /** Onde a fita cai no alto da folha, de 30 a 70%. */
  tapeX: number;
  /** A largura na colagem, em % da coluna, e o recuo. */
  width: number;
  shift: number;
  gap: number;
}

export function pageFor(id: string): NotebookPage {
  let n = 0;
  const r = () => wobble(id, 4100 + n++);
  const kr = r();
  const kind: PaperKind = kr < 0.28 ? 'espiral' : kr < 0.48 ? 'fichario' : kr < 0.66 ? 'quadriculada' : kr < 0.82 ? 'bloco' : 'postit';
  const hr = r();
  const hold: PageHold = kind === 'postit' ? 'nada' : hr < 0.5 ? 'fita' : hr < 0.78 ? 'fitas' : 'canto';
  const pr = r();
  const photo: PhotoHold = kind === 'postit' || pr < 0.3 ? 'clipe' : pr < 0.52 ? 'cantos' : 'colada';
  const color = kind === 'postit' ? POSTIT_COLORS[Math.floor(r() * POSTIT_COLORS.length)] : null;
  const width = kind === 'postit' ? 82 + Math.round(r() * 8) : 88 + Math.round(r() * 12);
  return {
    kind,
    hold,
    photo,
    color,
    tapeTilt: Math.round((r() - 0.5) * 14 * 10) / 10,
    tapeX: Math.round(30 + r() * 40),
    width,
    shift: Math.round(r() * (100 - width)),
    gap: Math.round(34 + r() * 22),
  };
}

/** A altura estimada da folha, em larguras de coluna, para a colagem. */
export function pageHeight(id: string): number {
  const p = pageFor(id);
  const w = p.width / 100;
  // capa 4:5 dentro da folha, mais o cabeçalho da data e duas linhas de nome
  return w * (1.25 * 0.84 + (p.kind === 'postit' ? 0.3 : 0.42)) + p.gap / 200;
}

/**
 * Quantos dias o pendente está na fila, em dias do calendário daqui (como a data do cabeçalho):
 * guardado ontem às 23h é "ontem" hoje às 9h, não "hoje".
 */
export function daysWaiting(createdAt: string, now = Date.now()): number {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return 0;
  const from = parseDay(localDay(new Date(t)));
  const to = parseDay(localDay(new Date(now)));
  // arredonda: um dia com horário de verão tem 23 ou 25 horas
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

/**
 * A folha amarela com o tempo: nova até uma semana, amarelando até um mês, velha depois disso.
 * Quem está esperando há mais tempo salta aos olhos, sem número nenhum.
 */
export function ageOf(days: number): 'nova' | 'amarelando' | 'velha' {
  return days < 7 ? 'nova' : days <= 30 ? 'amarelando' : 'velha';
}

/** A data como se escreve no cabeçalho do caderno: 26/09, e o ano só quando não é este. */
export function notebookDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return d.getFullYear() === now.getFullYear() ? `${dd}/${mm}` : `${dd}/${mm}/${String(d.getFullYear()).slice(2)}`;
}
