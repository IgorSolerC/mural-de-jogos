import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, viewChild } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { ICON, IconModule } from './icons';
import { canonicalJson } from '../core/canonical-json';
import { CloudAccount } from '../core/cloud-account';
import { DeviceTag } from '../core/device';
import { FICHA_PART_LABEL, FichaPart, LOOK_KEYS } from '../core/ficha-merge';
import { agoLabel, fullWhen } from '../core/follow';
import { commonPairs } from '../core/merge3';
import { Review, isNote } from '../core/review';
import { CONFLICT_PART_LABEL, ConflictPart, SharedPerson, sameShared } from '../core/shared-notes';
import { SharedStore } from '../core/shared-store';
import { SyncConflict, SyncConflicts, conflictKey, splitTarget } from '../core/sync-conflicts';
import { BackdropClose } from './backdrop-close';
import { PersonPhoto } from './person-photo';
import { Pin } from './pin';

/** Um pedaço do texto de uma das versões: igual nas duas, diferente (o trecho da briga) ou linhas iguais recolhidas. */
type Piece = { kind: 'same' | 'diff'; text: string } | { kind: 'gap'; n: number };

/** Uma das duas versões, pronta para a tela. */
interface Side {
  key: 'a' | 'b';
  /** De quem é (nas compartilhadas), para a foto. */
  who: SharedPerson | null;
  /** "Ana", "Você" (o nome da foto). */
  name: string;
  /** De que aparelho é (na conta): o desenho no lugar da foto, e o nome do aparelho embaixo. */
  device: { icon: LucideIconData; label: string | null } | null;
  /** "A sua versão", "A versão de Ana", "A deste aparelho". */
  heading: string;
  /** "sua versão", "versão de Ana": para as leituras de tela. */
  spoken: string;
  /** A versão apaga a ficha (apagada num aparelho e mudada no outro). */
  deleted: boolean;
  /** O título, quando os dois mudaram ele. */
  title: string | null;
  /** O texto (ou o ajuste em linhas), quando é ele que difere. */
  pieces: Piece[] | null;
  /** O botão: "Manter esta", "Manter apagada". */
  keep: string;
}

/** O que a folha mostra, venha o conflito das compartilhadas ou da conta. */
interface View {
  /** O que está em conflito, embaixo do título: “Lista da semana”. */
  sub: string;
  /** A cartolina da folha: a da ficha em conflito. */
  stock: string;
  sentence: string;
  when: { iso: string; ago: string; full: string } | null;
  rest: string;
  meanwhile: string;
  /** Quando nenhuma das duas mostra texto: o que difere, numa frase. */
  parts: string;
  sides: Side[];
}

/** Linhas iguais seguidas acima disto viram "N linhas iguais", deixando 2 de contexto em cada ponta. */
const KEEP_CONTEXT = 2;

/**
 * "Conflito de sincronização. Deseja manter qual versão?": a mesma coisa mudou de dois jeitos ao mesmo
 * tempo, e o resto das mudanças já está junto. Serve aos dois conflitos do site:
 *
 * - **das anotações compartilhadas** (`noteId`): duas pessoas mudaram o mesmo trecho. Só quem escreve na
 *   anotação vê (o dono, os gestores e os editores), e a escolha vale para todo mundo;
 * - **da própria conta** (`noteId` de uma ficha, ou `chave` de qualquer conflito: um quadro Kanban, as
 *   configurações): a pessoa mudou em dois aparelhos ao mesmo tempo (ou apagou num e mudou no outro), e
 *   a escolha vale em todos os aparelhos dela (ver core/sync-conflicts.ts).
 *
 * As duas versões lado a lado (uma embaixo da outra no celular), com o que difere marcado a marca-texto
 * e o que é igual recolhido; "Manter esta" em cada uma. "Decidir depois" deixa como está, e a versão que
 * já estava na nuvem continua valendo.
 */
@Component({
  selector: 'app-conflict-sheet',
  imports: [BackdropClose, IconModule, PersonPhoto, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conflict-sheet.html',
  styleUrl: './conflict-sheet.scss',
})
export class ConflictSheet {
  /** A ficha (ou a anotação compartilhada) com o conflito. */
  readonly noteId = input<string | null>(null);
  /** Um conflito da conta pela chave (o de um ajuste ou de um quadro, que não têm ficha). */
  readonly chave = input<string | null>(null);
  readonly closed = output<void>();
  /** Escolheu uma versão. */
  readonly resolved = output<void>();

  private readonly shared = inject(SharedStore);
  private readonly conflicts = inject(SyncConflicts);
  private readonly account = inject(CloudAccount);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly CloseIcon = ICON.fechar;
  protected readonly KeepIcon = ICON.pronto;
  protected readonly DeletedIcon = ICON.apagar;

  private readonly entry = computed(() => {
    const id = this.noteId();
    return id ? (this.shared.get(id) ?? null) : null;
  });
  /** O conflito da conta (a ficha não é compartilhada, ou veio pela chave). */
  private readonly own = computed<SyncConflict | null>(() => {
    const key = this.chave();
    if (key) {
      const c = this.conflicts.get(key);
      return c && !c.resolvido ? c : null;
    }
    const id = this.noteId();
    return id && !this.entry()?.conflito ? this.conflicts.forFicha(id) : null;
  });

  private readonly me = computed(() => this.account.account()?.codigo ?? '');
  private nameOf(p: SharedPerson | null): string {
    if (!p) return 'Alguém';
    return p.codigo === this.me() ? 'Você' : p.nome;
  }

  protected readonly view = computed<View | null>(() => this.sharedView() ?? this.ownView());

  /** O conflito de uma anotação compartilhada: duas pessoas (ou a mesma em dois aparelhos). */
  private readonly sharedView = computed<View | null>(() => {
    const e = this.entry();
    const c = e?.conflito;
    if (!e || !c) return null;
    const parts = joinParts(differences(c.a, c.b).map((p) => CONFLICT_PART_LABEL[p]), 'a anotação');
    const a = this.nameOf(c.autorA);
    const b = this.nameOf(c.autorB);
    let sentence: string;
    if (a === b) sentence = `${a} mudou ${parts} em dois aparelhos ao mesmo tempo, cada vez de um jeito.`;
    else {
      const who = b === 'Você' ? `${a} e você` : a === 'Você' ? `Você e ${b}` : `${a} e ${b}`;
      sentence = `${who} mudaram ${parts} ao mesmo tempo, cada um de um jeito.`;
    }
    const sameText = c.a.text === c.b.text;
    const [pa, pb] = textPieces(c.a.text, c.b.text);
    const titled = c.a.game.name !== c.b.game.name;
    const side = (key: 'a' | 'b', v: Review, who: SharedPerson | null, name: string, pieces: Piece[]): Side => ({
      key,
      who,
      name,
      device: null,
      heading: name === 'Você' ? 'A sua versão' : `A versão de ${name}`,
      spoken: name === 'Você' ? 'sua versão' : `versão de ${name}`,
      deleted: false,
      title: titled ? v.game.name : null,
      pieces: sameText ? null : pieces,
      keep: 'Manter esta',
    });
    return {
      sub: `“${e.view.game.name}”`,
      stock: c.a.stock ?? 'amarelo',
      sentence,
      when: whenOf(c.em),
      rest: 'O resto do que cada um mudou já está junto nas duas. Escolher uma vale para todo mundo.',
      meanwhile: `Enquanto ninguém escolhe, vale a ${a === 'Você' ? 'sua versão' : `versão de ${a}`}.`,
      parts,
      sides: [side('a', c.a, c.autorA, a, pa), side('b', c.b, c.autorB, b, pb)],
    };
  });

  /** O conflito da própria conta: a pessoa mudou em dois aparelhos. */
  private readonly ownView = computed<View | null>(() => {
    const c = this.own();
    if (!c) return null;
    const [tipo] = splitTarget(c.alvo);
    const title = this.conflicts.titleOf(c);
    const mine = this.conflicts.device.id;
    const deviceOf = (d: DeviceTag | null, fallback: 'nuvem' | 'outro') => {
      if (d?.id === mine) return { heading: 'A deste aparelho', spoken: 'versão deste aparelho', icon: iconOf(d.nome), label: d.nome };
      if (d) return { heading: 'A do outro aparelho', spoken: `versão do outro aparelho, ${d.nome}`, icon: iconOf(d.nome), label: d.nome };
      return fallback === 'nuvem'
        ? { heading: 'A que estava na nuvem', spoken: 'versão que estava na nuvem', icon: ICON.subirNuvem, label: null }
        : { heading: 'A do outro aparelho', spoken: 'versão do outro aparelho', icon: ICON.computador, label: null };
    };
    const da = deviceOf(c.deA, 'nuvem');
    const db = deviceOf(c.deB, 'outro');
    const what = tipo === 'ficha' ? (isNote((c.a ?? c.b) as Review) ? 'esta anotação' : 'esta ficha') : null;
    const deleted = c.a === null || c.b === null;

    let parts: string;
    let sides: [Piece[] | null, Piece[] | null] = [null, null];
    let titles: [string | null, string | null] = [null, null];
    if (tipo === 'ficha') {
      const ra = c.a as Review | null;
      const rb = c.b as Review | null;
      const found = c.partes.length ? c.partes : ra && rb ? fichaDifferences(ra, rb) : [];
      parts = joinParts(found.map((p) => FICHA_PART_LABEL[p]), what!);
      if (ra && rb) {
        if (ra.text !== rb.text) sides = textPieces(ra.text, rb.text);
        if (ra.game.name !== rb.game.name) titles = [ra.game.name, rb.game.name];
      } else {
        // a que ficou: o texto inteiro (recolhido em volta de nada: é tudo dela)
        const kept = (ra ?? rb)!;
        const all = textPieces(kept.text, kept.text)[0];
        sides = ra ? [all, null] : [null, all];
      }
    } else {
      const la = this.conflicts.linesOf(c, 'a') ?? [];
      const lb = this.conflicts.linesOf(c, 'b') ?? [];
      sides = textPieces(la.join('\n'), lb.join('\n'));
      parts = lowerFirst(title);
    }
    const sentence = deleted
      ? `Você apagou ${what} num aparelho e mudou no outro, ao mesmo tempo.`
      : `Você mudou ${parts} em dois aparelhos ao mesmo tempo, cada vez de um jeito.`;
    const side = (key: 'a' | 'b', d: ReturnType<typeof deviceOf>): Side => {
      const gone = (key === 'a' ? c.a : c.b) === null;
      return {
        key,
        who: null,
        name: d.heading,
        device: { icon: d.icon, label: d.label },
        heading: d.heading,
        spoken: d.spoken,
        deleted: gone,
        title: titles[key === 'a' ? 0 : 1],
        pieces: gone ? null : sides[key === 'a' ? 0 : 1],
        keep: gone ? 'Manter apagada' : 'Manter esta',
      };
    };
    return {
      sub: tipo === 'ficha' ? `“${title}”` : title,
      stock: (tipo === 'ficha' && ((c.a ?? c.b) as Review).stock) || 'amarelo',
      sentence,
      when: whenOf(c.em),
      rest: deleted
        ? 'Até você escolher, ela continua no mural, e nada se perde: a versão que fica de fora vai para Ajustes › Backup.'
        : tipo === 'ficha'
          ? 'O resto do que mudou nos dois já está junto. Escolher uma vale em todos os seus aparelhos, e a outra vai para Ajustes › Backup.'
          : 'O resto do que mudou nos dois já está junto. Escolher uma vale em todos os seus aparelhos.',
      meanwhile: c.a === null ? 'Enquanto você não escolhe, a ficha fica no mural.' : `Enquanto você não escolhe, vale ${lowerFirst(da.heading)}.`,
      parts,
      sides: [side('a', da), side('b', db)],
    };
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('h2')?.focus();
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected keep(side: Side): void {
    const own = this.own();
    const e = this.entry();
    if (e?.conflito) this.shared.resolve(e.id, side.key === 'a' ? e.conflito.a : e.conflito.b);
    else if (own) this.conflicts.resolve(conflictKey(own), side.key);
    else return;
    this.resolved.emit();
    this.close();
  }

  /** As duas versões das compartilhadas dizem a mesma coisa (sem contar o lugar no mural)? */
  protected sameNote(): boolean {
    const c = this.entry()?.conflito;
    return !!c && sameShared(c.a, c.b);
  }
}

function whenOf(em: string): View['when'] {
  return em ? { iso: em, ago: agoLabel(em), full: fullWhen(em) } : null;
}

/** "o texto e o título". */
function joinParts(list: string[], fallback: string): string {
  if (list.length <= 1) return list[0] ?? fallback;
  return `${list.slice(0, -1).join(', ')} e ${list.at(-1)}`;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** O desenho do aparelho pelo nome ("Chrome no Android"). */
function iconOf(nome: string): LucideIconData {
  if (/iPad/.test(nome)) return ICON.tablet;
  if (/Android|iPhone/.test(nome)) return ICON.celular;
  return ICON.computador;
}

/** O que muda entre duas versões da mesma anotação (o texto, o título…). */
export function differences(a: Review, b: Review): ConflictPart[] {
  const out: ConflictPart[] = [];
  // com as chaves em ordem: a mesma aparência vinda da nuvem e daqui não pode parecer outra
  const j = (x: unknown) => canonicalJson(x ?? null);
  if (a.game.name !== b.game.name) out.push('titulo');
  if ((a.game.coverUrl ?? null) !== (b.game.coverUrl ?? null)) out.push('capa');
  if (a.text !== b.text) out.push('texto');
  if ((a.category ?? '') !== (b.category ?? '') || (a.subject ?? '') !== (b.subject ?? '')) out.push('categoria');
  if (!!a.private !== !!b.private || !!a.quiet !== !!b.quiet) out.push('publico');
  if ((a.completedAt ?? null) !== (b.completedAt ?? null)) out.push('data');
  // todos os campos da aparência (o espaço e o tamanho da estampa, a tinta do rabisco também)
  const look = (r: Review) => j(LOOK_KEYS.map((k) => (r as unknown as Record<string, unknown>)[k] ?? null));
  if (look(a) !== look(b)) out.push('aparencia');
  return out;
}

/** O que muda entre duas versões de uma ficha da conta: o mesmo das anotações, e a nota. */
function fichaDifferences(a: Review, b: Review): FichaPart[] {
  const out: FichaPart[] = differences(a, b);
  if (canonicalJson(a.scores ?? null) !== canonicalJson(b.scores ?? null)) out.push('nota');
  return out.length ? out : ['outros'];
}

/**
 * O texto das duas versões em pedaços: as linhas que só uma tem ficam marcadas, e as iguais seguidas
 * se recolhem (ficam 2 em volta de cada trecho diferente).
 */
export function textPieces(a: string, b: string): [Piece[], Piece[]] {
  const la = a.split('\n');
  const lb = b.split('\n');
  const pairs = commonPairs(la, lb);
  const inA = new Set(pairs.map(([i]) => i));
  const inB = new Set(pairs.map(([, j]) => j));
  return [pieces(la, inA), pieces(lb, inB)];
}

function pieces(lines: readonly string[], same: ReadonlySet<number>): Piece[] {
  const flags = lines.map((_, i) => same.has(i));
  // as linhas iguais que ficam: as perto de um trecho diferente (ou todas, se nada difere)
  const anyDiff = flags.some((f) => !f);
  const near = (i: number) => {
    for (let k = Math.max(0, i - KEEP_CONTEXT); k <= Math.min(lines.length - 1, i + KEEP_CONTEXT); k++) if (!flags[k]) return true;
    return false;
  };
  const out: Piece[] = [];
  let gap = 0;
  const flushGap = () => {
    if (gap) out.push({ kind: 'gap', n: gap });
    gap = 0;
  };
  lines.forEach((line, i) => {
    if (!flags[i]) {
      flushGap();
      const last = out.at(-1);
      if (last?.kind === 'diff') last.text += `\n${line}`;
      else out.push({ kind: 'diff', text: line });
    } else if (!anyDiff || near(i)) {
      flushGap();
      const last = out.at(-1);
      if (last?.kind === 'same') last.text += `\n${line}`;
      else out.push({ kind: 'same', text: line });
    } else gap++;
  });
  flushGap();
  return out;
}
