import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, linkedSignal, model, signal } from '@angular/core';
import { ICON, ICON_CHOICE, IconModule } from './icons';
import { IMPORTANCES, IMPORTANCE_LABEL, Importance, KanbanBoard, MAX_DEPS, STATUS_MAX, cleanStatus } from '../core/kanban';
import { KanbanDeps } from '../core/kanban-deps';
import { NOTES } from '../core/kinds';
import { ReviewStore } from '../core/review-store';
import { IMPORTANCE_LEVEL } from './kanban-icons';
import { CardPicker } from './card-picker';
import { roveRadios } from './focus';

let uid = 0;

/** A régua da importância, do tracinho mais baixo ao mais alto. */
const SCALE: readonly Importance[] = [...IMPORTANCES].reverse();

/**
 * As coisas da anotação no quadro, em linhas como as propriedades do Notion: a etapa (a lista das
 * colunas por cima de uma tira impressa, que aguenta quantas colunas o quadro tiver), a importância (a régua de cinco tracinhos das fichas do quadro, que
 * diz o nome de cada um ao passar o mouse ou o dedo), a observação (o `status`, só o campo, sem sugestões) e as
 * dependências, e se ela aparece também no mural ou fica só no Kanban. Mostra e avisa; quem guarda é quem usa: a folha da anotação no quadro guarda na
 * hora, o editor guarda ao salvar. Compacto (no editor), a etapa e a importância ficam lado a lado e o
 * observação e as dependências vazias são dois "+". O que vier depois (as tags, na folha) entra pelo
 * conteúdo, como mais uma linha.
 */
@Component({
  selector: 'app-kanban-props',
  imports: [IconModule, CardPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.compacto]': 'compact()' },
  template: `
    <div class="par">
      <!-- ===== Etapa: a lista das colunas por cima da tira ===== -->
      <div class="linha">
        <label class="nome" [for]="id + '-etapa'"><lucide-icon [img]="ColumnsIcon" [size]="16" aria-hidden="true" />Etapa</label>
        <div class="valor etapa-valor">
          <span class="campo escolha" [attr.data-cor]="current()?.color ?? null">
            @if (current(); as c) {
              <lucide-icon class="col-icone" [img]="iconOf[c.icon]" [size]="17" aria-hidden="true" />
            }
            <span class="escolha-nome" [class.fora]="!current()">{{ current()?.name ?? 'Fora do quadro' }}</span>
            <lucide-icon class="escolha-seta" [img]="ChevronIcon" [size]="16" aria-hidden="true" />
            <select [id]="id + '-etapa'" (change)="pickColumn($any($event.target).value)">
              @for (c of board().columns; track c.id) {
                <option [value]="c.id" [selected]="c.id === column()">{{ c.name }}{{ c.finishes ? ' (finaliza)' : '' }}</option>
              }
              @if (outside()) {
                <option value="" [selected]="column() === null">Fora do quadro</option>
              }
            </select>
          </span>
          @if (current()?.finishes) {
            <span class="finaliza" title="Nesta etapa a anotação fica finalizada"><lucide-icon [img]="DoneIcon" [size]="13" aria-hidden="true" />Finaliza</span>
          }
        </div>
      </div>

      @if (column() !== null) {
        <!-- ===== Importância: a régua de cinco tracinhos; o mouse (ou o foco) mostra o nível e o nome ===== -->
        <div class="linha">
          <span class="nome" [id]="id + '-imp'"><lucide-icon [img]="ImportanceIcon" [size]="16" aria-hidden="true" />Importância</span>
          <div class="valor imp-valor">
            <div class="regua-imp" role="radiogroup" [attr.aria-labelledby]="id + '-imp'" [attr.data-imp]="shownImp()" (keydown)="rove($event)" (mouseleave)="hover.set(null)">
              @for (i of scale; track i; let n = $index) {
                <button
                  type="button"
                  role="radio"
                  class="traco"
                  [class.aceso]="shownImp() && n < level[shownImp()!]"
                  [style.--h.px]="10 + n * 5"
                  [attr.aria-checked]="importance() === i"
                  [attr.aria-label]="impLabel[i]"
                  [attr.tabindex]="(importance() ?? 'baixissimo') === i ? 0 : -1"
                  (mouseenter)="hover.set(i)"
                  (focus)="hover.set(i)"
                  (blur)="hover.set(null)"
                  (click)="importance.set(importance() === i ? null : i)"
                ></button>
              }
            </div>
            <!-- o lugar do nome tem a largura do mais comprido: a régua não anda ao passar o mouse -->
            <span class="imp-lugar">
              @for (i of scale; track i) {
                <span class="imp-nome medida" aria-hidden="true">{{ impLabel[i] }}</span>
              }
              <span class="imp-vazia medida" aria-hidden="true">Sem importância</span>
              @if (shownImp(); as i) {
                <span class="imp-nome" [class.previa]="hover() !== null && hover() !== importance()" [attr.data-imp]="i">{{ impLabel[i] }}</span>
              } @else {
                <span class="imp-vazia">Sem importância</span>
              }
            </span>
            <!-- sempre no lugar (escondido sem importância), para a régua não andar ao escolher -->
            <button type="button" class="tirar" [class.medida]="!importance()" [attr.aria-hidden]="!importance() || null" aria-label="Tirar a importância" title="Tirar" (click)="importance.set(null)">
              <lucide-icon [img]="CloseIcon" [size]="15" aria-hidden="true" />
            </button>
          </div>
        </div>
      }
    </div>

    @if (column() !== null) {
      <!-- ===== No mural: também lá, ou só no Kanban (o "também no Feed" das redes) ===== -->
      <div class="linha mural-linha">
        <span class="nome" [id]="id + '-mural'"><lucide-icon [img]="WallIcon" [size]="16" aria-hidden="true" />No mural</span>
        <div class="valor mural-valor">
          <button
            type="button"
            role="switch"
            class="interruptor"
            [attr.aria-checked]="wall()"
            [attr.aria-labelledby]="id + '-mural'"
            [attr.aria-describedby]="id + '-mural-diz'"
            (click)="wall.set(!wall())"
          >
            <span class="bolinha"></span>
          </button>
          <span class="mural-diz" [id]="id + '-mural-diz'" [class.so-kanban]="!wall()">{{ wall() ? 'Aparece no mural também' : 'Só no Kanban' }}</span>
        </div>
      </div>

      @if (!compact() || statusOpen()) {
        <!-- ===== Observação: umas palavras (o status, por dentro) ===== -->
        <div class="linha">
          <label class="nome" [for]="id + '-status'"><lucide-icon [img]="StatusIcon" [size]="16" aria-hidden="true" />Observação</label>
          <div class="valor status-valor">
            <span class="campo">
              <input
                [id]="id + '-status'"
                type="text"
                autocomplete="off"
                enterkeyhint="done"
                [maxLength]="statusMax"
                [value]="draft()"
                (input)="draft.set($any($event.target).value)"
                (change)="commit()"
                (keydown.enter)="$event.preventDefault(); commit()"
              />
              @if (draft().trim()) {
                <button type="button" class="tirar" aria-label="Tirar a observação" title="Tirar" (click)="setStatus('')">
                  <lucide-icon [img]="CloseIcon" [size]="15" aria-hidden="true" />
                </button>
              }
            </span>
          </div>
        </div>
      }

      @if (!compact() || deps().length) {
        <!-- ===== Depende de: as que precisam estar finalizadas antes ===== -->
        <div class="linha deps-linha">
          <span class="nome" [id]="id + '-deps'"><lucide-icon [img]="DepsIcon" [size]="16" aria-hidden="true" />Depende de</span>
          <div class="valor deps-valor">
            @if (depRows().length) {
              <ul class="deps" [attr.aria-labelledby]="id + '-deps'">
                @for (d of depRows(); track d.note.id) {
                  <li class="dep" [class.feita]="d.done">
                    <span class="dep-texto">
                      <span class="dep-nome">{{ d.note.game.name }}</span>
                      <span class="dep-onde">
                        @if (d.done) {
                          <span class="feita-selo"><lucide-icon [img]="DoneIcon" [size]="11" aria-hidden="true" />Finalizada</span>
                        } @else {
                          <span class="sr-only">Aberta, </span>
                        }
                        {{ d.where }}
                      </span>
                    </span>
                    <button type="button" class="tirar" [attr.aria-label]="'Tirar ' + d.note.game.name + ' das dependências'" title="Tirar" (click)="removeDep(d.note.id)">
                      <lucide-icon [img]="CloseIcon" [size]="15" aria-hidden="true" />
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <p class="dica">Finalizar com alguma aberta pergunta antes.</p>
            }
            <button type="button" class="por-dep" [disabled]="deps().length >= maxDeps" (click)="picking.set(true)">
              <lucide-icon [img]="PlusIcon" [size]="15" aria-hidden="true" />
              {{ deps().length ? 'Outra' : 'Pôr dependência' }}
            </button>
          </div>
        </div>
      }

      <!-- compacto: o que está vazio é só o recorte com o "+", numa linha; abre no lugar -->
      @if (compact() && (!statusOpen() || !deps().length)) {
        <div class="extras">
          @if (!statusOpen()) {
            <button type="button" class="mais" (click)="openStatus()"><lucide-icon [img]="PlusIcon" [size]="15" aria-hidden="true" />Observação</button>
          }
          @if (!deps().length) {
            <button type="button" class="mais" [title]="'As que precisam estar finalizadas antes'" (click)="picking.set(true)"><lucide-icon [img]="PlusIcon" [size]="15" aria-hidden="true" />Dependência</button>
          }
        </div>
      }
    }

    <ng-content />

    <app-card-picker
      [(open)]="picking"
      [onlyKind]="notesKind"
      [doneOption]="true"
      [exclude]="excluded()"
      heading="Depende de"
      [hint]="'Uma anotação que precisa estar finalizada antes de “' + (title() || 'esta') + '”. Pode ser de outro grupo.'"
      footHint="Toque numa anotação para pôr como dependência."
      emptyText="Não há outra anotação que possa ser dependência desta."
      (picked)="addDep($event.id)"
    />
  `,
  styleUrl: './kanban-props.scss',
})
export class KanbanProps {
  private readonly kanbanDeps = inject(KanbanDeps);
  private readonly store = inject(ReviewStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly board = input.required<KanbanBoard>();
  /** A anotação (para as dependências não fazerem roda); a nova ainda sem nada salvo também serve. */
  readonly noteId = input.required<string>();
  /** O nome da anotação, para a folha de escolher a dependência. */
  readonly title = input('');
  /** "Fora do quadro" é uma das etapas, no fim da lista (no editor; na folha do quadro, tirar é o botão do pé). */
  readonly outside = input(false);
  /** No editor: etapa e importância lado a lado, e o status e as dependências vazios como dois "+". */
  readonly compact = input(false);
  /** A coluna; null: fora do quadro. */
  readonly column = model<string | null>(null);
  readonly importance = model<Importance | null>(null);
  /** O status: muda quando a pessoa termina de escrever (Enter, sair do campo). */
  readonly status = model('');
  readonly deps = model<readonly string[]>([]);
  /** Também no mural (`true`) ou só no Kanban (ver `KanbanCard.wall`). */
  readonly wall = model(true);

  protected readonly id = `kprops-${++uid}`;
  protected readonly ColumnsIcon = ICON.colunas;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly DoneIcon = ICON.pronto;
  protected readonly ImportanceIcon = ICON.importancia;
  protected readonly StatusIcon = ICON.emAndamento;
  protected readonly DepsIcon = ICON.dependencias;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly PlusIcon = ICON.adicionar;
  protected readonly WallIcon = ICON.painel;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly scale = SCALE;
  protected readonly impLabel = IMPORTANCE_LABEL;
  protected readonly level = IMPORTANCE_LEVEL;
  protected readonly statusMax = STATUS_MAX;
  protected readonly maxDeps = MAX_DEPS;
  protected readonly notesKind = NOTES;
  protected readonly rove = roveRadios;
  protected readonly picking = signal(false);
  /** O tracinho sob o mouse (ou com o foco): a régua mostra esse nível e o nome dele. */
  protected readonly hover = signal<Importance | null>(null);
  protected readonly shownImp = computed(() => this.hover() ?? this.importance());
  /** Compacto: o "+ Status" foi tocado (ou já tem status). */
  private readonly statusTouched = signal(false);
  protected readonly statusOpen = computed(() => this.statusTouched() || !!this.status());

  protected readonly current = computed(() => this.board().columns.find((c) => c.id === this.column()) ?? null);

  /** O status sendo escrito: o de fora, até a pessoa mexer (e de novo quando o de fora muda). */
  protected readonly draft = linkedSignal(() => this.status());

  /** As dependências escolhidas que ainda existem: finalizada ou não, e onde estão. */
  protected readonly depRows = computed(() =>
    this.kanbanDeps.progress(this.deps()).all.map((note) => ({ note, done: !!note.doneAt, where: this.kanbanDeps.whereOf(note, this.noteId()) })),
  );

  /** Fora da folha de escolher: ela mesma, as que já estão e as que fariam uma roda. */
  protected readonly excluded = computed(() => {
    const own = new Set(this.deps());
    return this.store
      .notes()
      .filter((r) => own.has(r.id) || !this.kanbanDeps.canAdd(this.noteId(), r.id))
      .map((r) => r.id)
      .concat(this.noteId());
  });

  protected openStatus(): void {
    this.statusTouched.set(true);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLInputElement>(`#${this.id}-status`)?.focus());
  }

  protected pickColumn(value: string): void {
    this.column.set(value || null);
  }

  protected commit(): void {
    this.setStatus(this.draft());
  }

  /** Guarda o status que ainda está sendo escrito (a folha fechando, o editor salvando). */
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
