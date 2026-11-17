import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, effect, inject, input, linkedSignal, output, untracked, viewChild } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { ICON, IconModule } from './icons';
import { canonicalJson } from '../core/canonical-json';
import { CloudAccount } from '../core/cloud-account';
import { ConflictQueue, ConflictRef } from '../core/conflict-queue';
import { DeviceTag } from '../core/device';
import { FICHA_PART_LABEL, FichaPart, LOOK_KEYS } from '../core/ficha-merge';
import { agoLabel, fullWhen } from '../core/follow';
import { KanbanBoard } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { GroupFolders } from '../core/group-folders';
import { NoteLinks, notesOf, resolveNote } from '../core/note-links';
import { Review, isNote } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { CONFLICT_PART_LABEL, ConflictPart, SharedPerson } from '../core/shared-notes';
import { SharedStore } from '../core/shared-store';
import { BlockKind } from '../core/sync-base';
import { SyncConflict, SyncConflicts, conflictKey, splitTarget } from '../core/sync-conflicts';
import { BackdropClose } from './backdrop-close';
import { CategoryLabel } from './category-label';
import { BLOCK_WHERE, Cell, ConflictRow, RowNames, blockRows, boardRows, fichaRows, sameTags } from './conflict-rows';
import { changedHunks, clearChanges, markChanges, paintChanges } from './mark-changes';
import { NoteTag } from './note-tag';
import { PersonPhoto } from './person-photo';
import { Pin } from './pin';
import { ReviewCard } from './review-card';
import { RichText } from './rich-text';
import { Toasts } from './toast';

/** Uma das duas versões, pronta para a tela. */
interface Side {
  key: 'a' | 'b';
  /** De quem é (nas compartilhadas), para a foto. */
  who: SharedPerson | null;
  /** O nome da foto ("Ana", "Você"). */
  name: string;
  /** De que aparelho é (na conta): o desenho no lugar da foto, e o nome do aparelho embaixo. */
  device: { icon: LucideIconData; label: string | null } | null;
  /** "A sua versão", "A versão de Ana", "Este aparelho". */
  heading: string;
  /** No botão: "a deste aparelho", "a de Ana", "a sua". */
  short: string;
  /** "a sua versão", "a versão de Ana": para as leituras de tela. */
  spoken: string;
  /** A versão apaga a ficha (apagada num aparelho e mudada no outro). */
  deleted: boolean;
  /** Quando esta versão da ficha mudou ("hoje às 20:43"), se se sabe. */
  changed: string | null;
  /** A mudada por último das duas (a pessoa costuma querer "a última que eu fiz"). */
  newest: boolean;
}

/** O que a folha mostra, venha o conflito das compartilhadas ou da conta. */
interface View {
  /** O que está em conflito, embaixo do título: “Lista da semana”, ou o nome do ajuste. */
  sub: string;
  /** O nome à mão (o título de uma ficha) ou impresso (um ajuste, um quadro). */
  subHand: boolean;
  /** A cartolina da faixa: a da ficha em conflito. */
  stock: string;
  sentence: string;
  when: { iso: string; ago: string; full: string } | null;
  rest: string;
  /** Onde aquilo mora no site (os ajustes e os quadros). */
  where: string | null;
  sides: [Side, Side];
  rows: ConflictRow[];
  /** O texto das duas versões, quando ele difere (ou quando uma versão apaga a ficha): null, sem texto. */
  text: { a: string | null; b: string | null } | null;
  /** Há o que não cabe empilhado no celular (o texto, a ficha do mural): as orelhas aparecem. */
  long: boolean;
}

/**
 * "Qual versão fica?": a mesma coisa mudou de dois jeitos ao mesmo tempo, e o resto das mudanças já
 * está junto. Serve aos dois conflitos do site:
 *
 * - **das anotações compartilhadas** (`noteId`): duas pessoas mudaram o mesmo trecho. Só quem escreve na
 *   anotação vê (o dono, os gestores e os editores), e a escolha vale para todo mundo;
 * - **da própria conta** (`noteId` de uma ficha, ou `chave` de qualquer conflito: um quadro Kanban, os
 *   ajustes): a pessoa mudou em dois aparelhos ao mesmo tempo (ou apagou num e mudou no outro), e a
 *   escolha vale em todos os aparelhos dela (ver core/sync-conflicts.ts).
 *
 * As duas versões lado a lado, linha a linha, só no que difere (ui/conflict-rows.ts): cada valor
 * desenhado como aparece no site (a etiqueta da tag, a cor, o interruptor, a ficha do mural), e o
 * texto formatado de verdade, com a linha que mudou numa faixa de marca-texto e as palavras que só um
 * lado tem no marca-texto forte (ui/mark-changes.ts). No celular, as duas versões nas orelhas de pasta
 * manilha, uma por vez no mesmo lugar. A escolha fica no pé, sempre à vista; "Decidir depois" deixa
 * como está, e a versão que já estava na nuvem continua valendo.
 *
 * Escolher chama a mesma junção de sempre (`SharedStore.resolve`, `SyncConflicts.resolve`): a folha só
 * mostra.
 */
@Component({
  selector: 'app-conflict-sheet',
  imports: [BackdropClose, CategoryLabel, IconModule, NgTemplateOutlet, NoteTag, PersonPhoto, Pin, ReviewCard, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conflict-sheet.html',
  styleUrl: './conflict-sheet.scss',
})
export class ConflictSheet {
  /** A ficha (ou a anotação compartilhada) com o conflito. */
  readonly noteId = input<string | null>(null);
  /** Um conflito da conta pela chave (o de um ajuste ou de um quadro, que não têm ficha). */
  readonly chave = input<string | null>(null);
  /**
   * A folha da fila (a que abre por cima de qualquer página, ver core/conflict-queue.ts): depois de
   * escolher ela não fecha (quem abriu passa para o próximo conflito), e o alto diz quantos faltam.
   */
  readonly chained = input(false);
  readonly closed = output<void>();
  /** Escolheu uma versão. */
  readonly resolved = output<void>();
  /** O conflito saiu sem a escolha daqui (outra pessoa ou outro aparelho escolheu antes). */
  readonly vanished = output<void>();

  private readonly shared = inject(SharedStore);
  private readonly conflicts = inject(SyncConflicts);
  private readonly account = inject(CloudAccount);
  private readonly store = inject(ReviewStore);
  private readonly kanban = inject(KanbanStore);
  private readonly settings = inject(Settings);
  private readonly queue = inject(ConflictQueue);
  private readonly groupFolders = inject(GroupFolders);
  private readonly toasts = inject(Toasts);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly textA = viewChild<ElementRef<HTMLElement>>('textoA');
  private readonly textB = viewChild<ElementRef<HTMLElement>>('textoB');

  protected readonly CloseIcon = ICON.fechar;
  protected readonly KeepIcon = ICON.pronto;
  protected readonly DeletedIcon = ICON.apagar;
  protected readonly TextIcon = ICON.escrever;
  protected readonly WhereIcon = ICON.ajustar;
  protected readonly SecretIcon = ICON.chave;

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

  /** Os nomes que as linhas citam: o grupo pela chave, a anotação pelo id, a pasta pelo id. */
  private readonly names = computed<RowNames>(() => {
    const groups = new Map(this.kanban.categories().map((c) => [c.key, c.label]));
    // as suas pastas e as dos grupos compartilhados (as da anotação de um grupo moram no documento dele)
    const folders = new Map([...this.groupFolders.folders(), ...this.settings.notesConfig().folders].map((f) => [f.id, f.name]));
    return {
      group: (k) => groups.get(k) ?? null,
      note: (id) => this.store.get(id)?.game.name ?? null,
      folder: (id) => folders.get(id) ?? null,
      looks: this.settings.categoryLooks(),
    };
  });

  /** Os links "[[título]]" do texto: aparecem como links (a anotação parece ela), mas não abrem nada aqui. */
  protected readonly links = computed<NoteLinks>(() => {
    const notes = notesOf(this.store.reviews());
    return { resolve: (title) => resolveNote(notes, title) };
  });

  protected readonly view = computed<View | null>(() => this.sharedView() ?? this.ownView());

  /** Qual conflito está aberto (o da conta pela chave; o da compartilhada pela anotação e pela hora). */
  private readonly which = computed(() => {
    const own = this.own();
    if (own) return conflictKey(own);
    const e = this.entry();
    return e?.conflito ? `${e.id}@${e.conflito.em}` : null;
  });

  /** Quantos mais esperam depois deste (só na folha da fila). */
  protected readonly more = computed(() => {
    if (!this.chained()) return 0;
    const ref: ConflictRef = this.chave() ? { chave: this.chave()! } : { noteId: this.noteId()! };
    return this.queue.remaining(ref);
  });

  /** A versão à mostra no celular (as orelhas); no computador, as duas. Outro conflito volta à primeira. */
  protected readonly shown = linkedSignal<string | null, 'a' | 'b'>({ source: this.which, computation: () => 'a' });

  /** O conflito de uma anotação compartilhada: duas pessoas (ou a mesma em dois aparelhos). */
  private readonly sharedView = computed<View | null>(() => {
    const e = this.entry();
    const c = e?.conflito;
    if (!e || !c) return null;
    const parts = joinParts(differences(c.a, c.b).map((p) => CONFLICT_PART_LABEL[p]), 'a anotação');
    const a = this.nameOf(c.autorA);
    const b = this.nameOf(c.autorB);
    // a mesma pessoa em dois aparelhos (pelo código: dois sem nome não são a mesma)
    const same = !!c.autorA && c.autorA.codigo === c.autorB?.codigo;
    let sentence: string;
    if (same) sentence = `${a === 'Você' ? 'Você mudou' : `${a} mudou`} ${parts} em dois aparelhos ao mesmo tempo, cada vez de um jeito.`;
    else {
      const who = b === 'Você' ? `${a} e você` : a === 'Você' ? `Você e ${b}` : `${a} e ${b}`;
      sentence = `${who} mudaram ${parts} ao mesmo tempo, cada um de um jeito.`;
    }
    const side = (key: 'a' | 'b', who: SharedPerson | null, name: string): Side => ({
      key,
      who,
      name,
      device: null,
      heading: same ? (key === 'a' ? 'A que chegou primeiro' : 'A que chegou depois') : name === 'Você' ? 'A sua versão' : `A versão de ${name}`,
      short: same ? (key === 'a' ? 'a primeira' : 'a segunda') : name === 'Você' ? 'a sua' : `a de ${name}`,
      spoken: same ? (key === 'a' ? 'a versão que chegou primeiro' : 'a versão que chegou depois') : name === 'Você' ? 'a sua versão' : `a versão de ${name}`,
      deleted: false,
      changed: null,
      newest: false,
    });
    const first = side('a', c.autorA, a);
    return {
      sub: `“${e.view.game.name}”`,
      subHand: true,
      stock: c.a.stock ?? 'amarelo',
      sentence,
      when: whenOf(c.em),
      rest: 'Todo o resto já se juntou sozinho. A escolha vale para todo mundo na anotação.',
      where: null,
      sides: dated([first, side('b', c.autorB, b)], c.a, c.b),
      ...withLong(fichaRows(c.a, c.b, this.names()), c.a.text !== c.b.text ? { a: c.a.text, b: c.b.text } : null),
    };
  });

  /** O conflito da própria conta: a pessoa mudou em dois aparelhos. */
  private readonly ownView = computed<View | null>(() => {
    const c = this.own();
    if (!c) return null;
    const [tipo, id] = splitTarget(c.alvo);
    const title = this.conflicts.titleOf(c);
    const mine = this.conflicts.device.id;
    const deviceOf = (d: DeviceTag | null, fallback: 'nuvem' | 'outro') => {
      if (d?.id === mine) return { heading: 'Este aparelho', short: 'a deste aparelho', spoken: 'a versão deste aparelho', icon: iconOf(d.nome), label: d.nome };
      if (d) return { heading: 'Outro aparelho', short: 'a do outro aparelho', spoken: `a versão do outro aparelho, ${d.nome}`, icon: iconOf(d.nome), label: d.nome };
      return fallback === 'nuvem'
        ? { heading: 'A que estava na nuvem', short: 'a da nuvem', spoken: 'a versão que estava na nuvem', icon: ICON.subirNuvem, label: null }
        : { heading: 'Outro aparelho', short: 'a do outro aparelho', spoken: 'a versão do outro aparelho', icon: ICON.computador, label: null };
    };
    const da = deviceOf(c.deA, 'nuvem');
    const db = deviceOf(c.deB, 'outro');
    const ficha = tipo === 'ficha' ? ((c.a ?? c.b) as Review) : null;
    // "o quadro Kanban de “Casa”", "as tags fixas" (o nome do ajuste já vem com o artigo)
    const what = ficha ? (isNote(ficha) ? 'esta anotação' : 'esta ficha') : tipo === 'kanban' ? `o ${lowerFirst(title)}` : lowerFirst(title);
    const deleted = c.a === null || c.b === null;
    const names = this.names();

    let rows: ConflictRow[] = [];
    let text: View['text'] = null;
    let parts = '';
    if (ficha) {
      const ra = c.a as Review | null;
      const rb = c.b as Review | null;
      if (ra && rb) {
        rows = fichaRows(ra, rb, names);
        if (ra.text !== rb.text) text = { a: ra.text, b: rb.text };
        const found: FichaPart[] = c.partes.length ? c.partes : fichaDifferences(ra, rb);
        parts = joinParts(found.map((p) => FICHA_PART_LABEL[p]), '');
      } else {
        // apagada num lado: a que ficou, como fica no mural e o texto inteiro dela; no outro, o carimbo
        const gone: Cell = { kind: 'gone', text: 'Apagada' };
        rows = [{ id: 'ficha', label: isNote(ficha) ? 'A anotação no mural' : 'A ficha no mural', icon: ICON.anotacoes, a: ra ? { kind: 'card', review: ra } : gone, b: rb ? { kind: 'card', review: rb } : gone }];
        if ((ra ?? rb)!.text.trim()) text = { a: ra?.text ?? null, b: rb?.text ?? null };
      }
    } else if (tipo === 'kanban') rows = boardRows(c.a as KanbanBoard, c.b as KanbanBoard, names);
    else rows = blockRows(id as BlockKind, c.a, c.b, names);

    const where = ficha ? null : tipo === 'kanban' ? 'Anotações › Kanban' : BLOCK_WHERE[id as BlockKind];
    const devices = da.label && db.label && da.label !== db.label ? ` (${da.label} e ${db.label})` : '';
    const sentence = deleted
      ? `Você apagou ${what} num aparelho e mudou no outro, ao mesmo tempo.`
      : parts
        ? `Você mudou ${parts} ${of(what)} em dois aparelhos ao mesmo tempo${devices}, cada vez de um jeito.`
        : `Você mudou ${what} em dois aparelhos ao mesmo tempo${devices}, cada vez de um jeito.`;
    const side = (key: 'a' | 'b', d: ReturnType<typeof deviceOf>): Side => ({
      key,
      who: null,
      name: d.heading,
      device: { icon: d.icon, label: d.label },
      heading: d.heading,
      short: (key === 'a' ? c.a : c.b) === null ? 'apagada' : d.short,
      spoken: d.spoken,
      deleted: (key === 'a' ? c.a : c.b) === null,
      changed: null,
      newest: false,
    });
    const sides: [Side, Side] = [side('a', da), side('b', db)];
    return {
      sub: ficha ? `“${title}”` : title,
      subHand: !!ficha,
      stock: ficha?.stock || 'amarelo',
      sentence,
      when: whenOf(c.em),
      rest: deleted
        ? 'Até você escolher, ela continua no mural. Nada se perde: a versão que ficar de fora vai para Ajustes › Backup.'
        : ficha
          ? 'Todo o resto já se juntou sozinho. Nada se perde: a versão que ficar de fora vai para Ajustes › Backup.'
          : 'Todo o resto já se juntou sozinho. A escolha vale em todos os seus aparelhos.',
      where,
      sides: ficha ? dated(sides, c.a as Review | null, c.b as Review | null) : sides,
      ...withLong(rows, text),
    };
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('h2')?.focus();
    });
    // o que mudou no texto, marcado no texto desenhado: refeito quando a versão muda e quando o texto
    // se redesenha sozinho (o colorir do código que chega, o spoiler aberto, as feitas abertas)
    let scrolled: string | null = null;
    let watching: MutationObserver | null = null;
    let queued = 0;
    afterRenderEffect(() => {
      const t = this.view()?.text;
      const which = this.which();
      const a = this.textA()?.nativeElement ?? null;
      const b = this.textB()?.nativeElement ?? null;
      watching?.disconnect();
      watching = null;
      if (!t?.a || !t.b) {
        clearChanges(this);
        return;
      }
      const hunks = changedHunks(t.a, t.b);
      const mark = () => paintChanges(this, markChanges(a, b, hunks));
      mark();
      // (a classe na linha não é observada: marcar não chama marcar de novo)
      watching = new MutationObserver(() => {
        cancelAnimationFrame(queued);
        queued = requestAnimationFrame(mark);
      });
      for (const box of [a, b]) if (box) watching.observe(box, { childList: true, subtree: true, characterData: true });
      // cada lado rola sozinho até a primeira diferença (uma vez por conflito)
      if (scrolled === which) return;
      scrolled = which;
      for (const box of [a, b]) {
        const scroller = box?.parentElement;
        const first = box?.querySelector<HTMLElement>('.mudou');
        if (scroller && first) scroller.scrollTop = Math.max(0, first.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 40);
      }
    });
    // escolheram antes (outra pessoa, outro aparelho): a folha não fica vazia
    // (o da compartilhada já tem o bilhete da loja, "Ana já tinha escolhido"; o da conta ganha este)
    let seen: 'own' | 'shared' | null = null;
    let choosing = false;
    this.resolved.subscribe(() => (choosing = true));
    effect(() => {
      const there = this.sharedView() ? 'shared' : this.ownView() ? 'own' : null;
      if (there) {
        seen = there;
        choosing = false;
        return;
      }
      if (!seen) return;
      const was = seen;
      seen = null;
      // saiu pela escolha daqui: quem abriu já cuidou (o `resolved`)
      if (choosing) return;
      untracked(() => {
        if (was === 'own') this.toasts.show('Essa versão já foi escolhida em outro aparelho seu.', undefined, 7000);
        if (this.chained()) this.vanished.emit();
        else this.close();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      watching?.disconnect();
      cancelAnimationFrame(queued);
      clearChanges(this);
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
    // na fila, quem abriu decide: o próximo, ou fechar
    if (!this.chained()) this.close();
  }

  /** A linha que não cabe empilhada no celular (a ficha do mural, um texto formatado): vai pelas orelhas. */
  protected isLong(row: ConflictRow): boolean {
    return isLongCell(row.a) || isLongCell(row.b);
  }

  /** As setas do teclado andam entre as orelhas (no celular). */
  protected earKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = this.shown() === 'a' ? 'b' : 'a';
    this.shown.set(next);
    this.dialog().nativeElement.querySelector<HTMLElement>(`#orelha-${next}`)?.focus();
  }
}

const isLongCell = (c: Cell) => c.kind === 'card' || c.kind === 'rich';

function withLong(rows: ConflictRow[], text: View['text']): Pick<View, 'rows' | 'text' | 'long'> {
  return { rows, text, long: !!text || rows.some((r) => isLongCell(r.a) || isLongCell(r.b)) };
}

/** Quando cada versão da ficha mudou, e qual é a mais recente (as duas com hora, e horas diferentes). */
function dated(sides: [Side, Side], a: Review | null, b: Review | null): [Side, Side] {
  const at = [a?.updatedAt ?? null, b?.updatedAt ?? null];
  const ok = at.map((t) => (t && Number.isFinite(Date.parse(t)) ? t : null));
  // a junção carimba as duas com a hora da mais nova: a mesma hora nas duas não diz de quem é, e fica de fora
  if (!ok[0] || !ok[1] || ok[0] === ok[1]) return sides;
  const newest = ok[0] > ok[1] ? 0 : 1;
  return sides.map((s, i) => ({ ...s, changed: changedWords(ok[i]!), newest: i === newest })) as [Side, Side];
}

/** "hoje às 20:43", "ontem às 9:05", "14 de nov. às 18:00". */
function changedWords(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const day = (x: Date) => x.toDateString();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (day(d) === day(now)) return `hoje às ${time}`;
  if (day(d) === day(yesterday)) return `ontem às ${time}`;
  return `${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} às ${time}`;
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

/** "de" junto de "esta": "desta anotação", "deste quadro". */
const of = (what: string) => (/^est[ae] /.test(what) ? `d${what}` : `de ${what}`);

/** O desenho do aparelho pelo nome ("Chrome no Android"). */
function iconOf(nome: string): LucideIconData {
  if (/iPad/.test(nome)) return ICON.tablet;
  if (/Android|iPhone/.test(nome)) return ICON.celular;
  return ICON.computador;
}

/** O que muda entre duas versões da mesma anotação (o texto, o título…), para a frase de cima. */
export function differences(a: Review, b: Review): ConflictPart[] {
  const out: ConflictPart[] = [];
  // com as chaves em ordem: a mesma aparência vinda da nuvem e daqui não pode parecer outra
  const j = (x: unknown) => canonicalJson(x ?? null);
  if (a.game.name !== b.game.name) out.push('titulo');
  if ((a.game.coverUrl ?? null) !== (b.game.coverUrl ?? null)) out.push('capa');
  if (a.text !== b.text) out.push('texto');
  if ((a.category ?? '') !== (b.category ?? '') || (a.subject ?? '') !== (b.subject ?? '') || (a.folder ?? '') !== (b.folder ?? '')) out.push('categoria');
  if (!sameTags(a.tags, b.tags)) out.push('tags');
  if (!!a.doneAt !== !!b.doneAt) out.push('finalizada');
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
  return out;
}
