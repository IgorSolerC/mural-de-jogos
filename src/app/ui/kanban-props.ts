import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, linkedSignal, model, output, signal } from '@angular/core';
import { ICON, ICON_CHOICE, IconModule } from './icons';
import { IMPORTANCES, IMPORTANCE_LABEL, Importance, KanbanBoard, MAX_DEPS, STATUS_MAX, cleanStatus } from '../core/kanban';
import { KanbanDeps } from '../core/kanban-deps';
import { NOTES } from '../core/kinds';
import { IMPORTANCE_LEVEL, IMPORTANCE_STEPS } from './kanban-icons';
import { CardPicker } from './card-picker';
import { roveRadios } from './focus';

let uid = 0;

/** As importâncias, da mais baixa à mais alta: a escala cresce da esquerda para a direita. */
const SCALE: readonly Importance[] = [...IMPORTANCES].reverse();

/**
 * A aba Kanban do editor da anotação, feita como a aba Flashcard (ui/flashcard-tab.ts): ainda não sendo
 * tarefa no quadro do grupo, o estado e uma ação só ("Transformar em tarefa"); sendo, os blocos, do que
 * decide para o que quase não muda: a etapa (as colunas do quadro, em toques, a escolhida é a etiqueta da
 * coluna colada), a importância (as etiquetas da ficha do quadro, recortadas na cartela), a observação (o
 * `status`), as dependências, o "Mostrar no mural" e, no pé, "Deixar de ser tarefa no Kanban". O palco
 * do editor mostra a coluna com a anotação nela (ui/kanban-preview.ts). Mostra e avisa; quem guarda é o
 * editor, ao salvar.
 */
@Component({
  selector: 'app-kanban-props',
  imports: [IconModule, CardPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kanban-props.html',
  styleUrl: './kanban-props.scss',
})
export class KanbanProps {
  private readonly kanbanDeps = inject(KanbanDeps);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** O quadro do grupo da anotação; null sem grupo. */
  readonly board = input<KanbanBoard | null>(null);
  /** Quem só lê a compartilhada: o grupo se escolhe na leitura, não aqui. */
  readonly readOnly = input(false);
  /** Onde "Transformar em tarefa" põe a anotação (a de antes de deixar de ser, ou a de onde a nova veio); sem ela, a primeira. */
  readonly firstColumn = input<string | null>(null);
  /** A anotação (para as dependências não fazerem roda); a nova ainda sem nada salvo também serve. */
  readonly noteId = input.required<string>();
  /** O nome da anotação, para a folha de escolher a dependência. */
  readonly title = input('');
  /** A coluna; null: ainda não é tarefa no quadro. */
  readonly column = model<string | null>(null);
  readonly importance = model<Importance | null>(null);
  /** O status: muda quando a pessoa termina de escrever (Enter, sair do campo). */
  readonly status = model('');
  readonly deps = model<readonly string[]>([]);
  /** Também no mural (`true`) ou só no Kanban (ver `KanbanCard.wall`). */
  readonly wall = model(true);
  /** Sem grupo: levar até ele. */
  readonly chooseGroup = output<void>();

  protected readonly id = `kprops-${++uid}`;
  protected readonly BoardIcon = ICON.colunas;
  protected readonly DoneIcon = ICON.pronto;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly PlusIcon = ICON.adicionar;
  protected readonly LeaveIcon = ICON.apagar;
  protected readonly DepsIcon = ICON.dependencias;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly scale = SCALE;
  protected readonly impLabel = IMPORTANCE_LABEL;
  protected readonly level = IMPORTANCE_LEVEL;
  protected readonly steps = IMPORTANCE_STEPS;
  protected readonly statusMax = STATUS_MAX;
  protected readonly maxDeps = MAX_DEPS;
  protected readonly notesKind = NOTES;
  protected readonly rove = roveRadios;
  protected readonly picking = signal(false);
  /** O status sendo escrito: o de fora, até a pessoa mexer (e de novo quando o de fora muda). O palco mostra este. */
  readonly draft = linkedSignal(() => this.status());

  /** As dependências escolhidas que ainda existem: finalizada ou não, e onde estão. */
  protected readonly depRows = computed(() =>
    this.kanbanDeps.progress(this.deps()).all.map((note) => ({ note, done: !!note.doneAt, where: this.kanbanDeps.whereOf(note, this.noteId()) })),
  );

  /**
   * A coluna escolhida, se ainda existe no quadro. Sem ela (ou apagada noutra aba enquanto o editor estava
   * aberto), a aba mostra o "ainda não é tarefa", como o palco.
   */
  protected readonly current = computed(() => this.board()?.columns.find((c) => c.id === this.column()) ?? null);

  /** Na etapa que finaliza, as dependências ainda abertas: a pergunta vem ao salvar, e aqui ela já se vê. */
  protected readonly openWarning = computed(() => {
    const col = this.current();
    if (!col?.finishes) return '';
    const open = this.depRows().filter((d) => !d.done);
    if (!open.length) return '';
    return open.length === 1 ? `“${open[0].note.game.name}” ainda não foi finalizada.` : `${open.length} dependências ainda não foram finalizadas.`;
  });

  /** Fora da folha de escolher: ela mesma, as que já estão e as que fariam uma roda. */
  protected readonly excluded = computed(() => this.kanbanDeps.excluded(this.noteId(), this.deps()));

  /** "Transformar em tarefa": na coluna de `firstColumn`, senão na primeira; o foco vai para a etapa escolhida. */
  protected start(): void {
    const cols = this.board()?.columns ?? [];
    const to = cols.find((c) => c.id === this.firstColumn()) ?? cols[0];
    if (!to) return;
    this.column.set(to.id);
    this.focusLater('.etapa[aria-checked="true"]');
  }

  /**
   * "Deixar de ser tarefa no Kanban": vale ao salvar. A importância, a observação e as dependências
   * ficam guardadas aqui até lá: transformar de novo antes de salvar devolve tudo. O foco vai para a ação
   * do vazio, que diz o que aconteceu.
   */
  protected leave(): void {
    this.column.set(null);
    this.focusLater('.virar');
  }

  private focusLater(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }

  protected commit(): void {
    this.setStatus(this.draft());
  }

  /** Guarda o status que ainda está sendo escrito (trocando de aba, o editor salvando). */
  flush(): void {
    this.commit();
  }

  protected setStatus(s: string): void {
    const next = cleanStatus(s);
    this.draft.set(next);
    if (next !== this.status()) this.status.set(next);
  }

  protected addDep(id: string): void {
    if (!this.deps().includes(id) && this.kanbanDeps.canAdd(this.noteId(), id)) this.deps.set([...this.deps(), id]);
  }

  protected removeDep(id: string): void {
    this.deps.set(this.deps().filter((d) => d !== id));
  }
}
