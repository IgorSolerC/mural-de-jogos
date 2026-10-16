import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, viewChild } from '@angular/core';
import { Check, LucideAngularModule, X } from 'lucide-angular';
import { CloudAccount } from '../core/cloud-account';
import { agoLabel, fullWhen } from '../core/follow';
import { commonPairs } from '../core/merge3';
import { Review } from '../core/review';
import { CONFLICT_PART_LABEL, ConflictPart, SharedPerson, sameShared } from '../core/shared-notes';
import { SharedStore } from '../core/shared-store';
import { BackdropClose } from './backdrop-close';
import { PersonPhoto } from './person-photo';
import { Pin } from './pin';

/** Um pedaço do texto de uma das versões: igual nas duas, diferente (o trecho da briga) ou linhas iguais recolhidas. */
type Piece = { kind: 'same' | 'diff'; text: string } | { kind: 'gap'; n: number };

/** Uma das duas versões, pronta para a tela. */
interface Side {
  key: 'a' | 'b';
  version: Review;
  who: SharedPerson | null;
  /** "Ana", "Você". */
  name: string;
  /** O título, quando os dois mudaram ele. */
  title: string | null;
  pieces: Piece[];
}

/** Linhas iguais seguidas acima disto viram "N linhas iguais", deixando 2 de contexto em cada ponta. */
const KEEP_CONTEXT = 2;

/**
 * "Conflito de sincronização. Deseja manter qual versão?": duas pessoas mudaram o mesmo trecho de uma
 * anotação compartilhada de jeitos diferentes (o resto das mudanças das duas já está junto). As duas
 * versões lado a lado (uma embaixo da outra no celular), com o que difere marcado a marca-texto e o que
 * é igual recolhido; "Manter esta" em cada uma. Só quem escreve na anotação vê (o dono, os gestores e os
 * editores); "Decidir depois" deixa como está, e a versão que já estava na nuvem continua valendo.
 */
@Component({
  selector: 'app-conflict-sheet',
  imports: [BackdropClose, LucideAngularModule, PersonPhoto, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conflict-sheet.html',
  styleUrl: './conflict-sheet.scss',
})
export class ConflictSheet {
  readonly noteId = input.required<string>();
  readonly closed = output<void>();
  /** Escolheu uma versão. */
  readonly resolved = output<void>();

  private readonly shared = inject(SharedStore);
  private readonly account = inject(CloudAccount);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly CloseIcon = X;
  protected readonly KeepIcon = Check;

  protected readonly entry = computed(() => this.shared.get(this.noteId()) ?? null);
  protected readonly conflict = computed(() => this.entry()?.conflito ?? null);

  private readonly me = computed(() => this.account.account()?.codigo ?? '');
  private nameOf(p: SharedPerson | null): string {
    if (!p) return 'Alguém';
    return p.codigo === this.me() ? 'Você' : p.nome;
  }

  /** O que difere entre as duas, nas palavras da tela ("o texto e o título"). */
  protected readonly parts = computed<string>(() => {
    const c = this.conflict();
    if (!c) return '';
    const list = differences(c.a, c.b).map((p) => CONFLICT_PART_LABEL[p]);
    if (list.length <= 1) return list[0] ?? 'a anotação';
    return `${list.slice(0, -1).join(', ')} e ${list.at(-1)}`;
  });

  /** A frase de quem mudou o quê: "Ana e você mudaram o texto ao mesmo tempo, cada um de um jeito." */
  protected readonly sentence = computed(() => {
    const c = this.conflict();
    if (!c) return '';
    const a = this.nameOf(c.autorA);
    const b = this.nameOf(c.autorB);
    if (a === b) return `${a} mudou ${this.parts()} em dois aparelhos ao mesmo tempo, cada vez de um jeito.`;
    const who = b === 'Você' ? `${a} e você` : a === 'Você' ? `Você e ${b}` : `${a} e ${b}`;
    return `${who} mudaram ${this.parts()} ao mesmo tempo, cada um de um jeito.`;
  });

  protected readonly sides = computed<Side[]>(() => {
    const c = this.conflict();
    if (!c) return [];
    const [pa, pb] = textPieces(c.a.text, c.b.text);
    const titled = c.a.game.name !== c.b.game.name;
    return [
      { key: 'a', version: c.a, who: c.autorA, name: this.nameOf(c.autorA), title: titled ? c.a.game.name : null, pieces: pa },
      { key: 'b', version: c.b, who: c.autorB, name: this.nameOf(c.autorB), title: titled ? c.b.game.name : null, pieces: pb },
    ];
  });

  protected readonly when = computed(() => {
    const em = this.conflict()?.em;
    return em ? { ago: agoLabel(em), full: fullWhen(em) } : null;
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
    this.shared.resolve(this.noteId(), side.version);
    this.resolved.emit();
    this.close();
  }

  /** As duas versões são iguais no texto (a briga foi em outra coisa: o título, o papel…)? */
  protected sameText(): boolean {
    const c = this.conflict();
    return !!c && c.a.text === c.b.text;
  }

  protected sameNote(): boolean {
    const c = this.conflict();
    return !!c && sameShared(c.a, c.b);
  }
}

/** O que muda entre duas versões da mesma anotação (o texto, o título…). */
export function differences(a: Review, b: Review): ConflictPart[] {
  const out: ConflictPart[] = [];
  const j = (x: unknown) => JSON.stringify(x ?? null);
  if (a.game.name !== b.game.name) out.push('titulo');
  if ((a.game.coverUrl ?? null) !== (b.game.coverUrl ?? null)) out.push('capa');
  if (a.text !== b.text) out.push('texto');
  if ((a.category ?? '') !== (b.category ?? '')) out.push('categoria');
  if (!!a.private !== !!b.private || !!a.quiet !== !!b.quiet) out.push('publico');
  if ((a.completedAt ?? null) !== (b.completedAt ?? null)) out.push('data');
  const look = (r: Review) =>
    j([r.stock, r.paper, r.paperSeed, r.pattern, r.patternSeed, r.patternInk, r.scribble, r.scribbleSeed, r.damage, r.damageSeed, r.stains, r.decors]);
  if (look(a) !== look(b)) out.push('aparencia');
  return out;
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
