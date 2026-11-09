import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, linkedSignal, model, output, signal } from '@angular/core';
import { FolderTree, NO_FOLDERS, NoteFolder, cleanFolderName, pathLabel } from '../core/folders';
import { LABEL_MAX } from '../core/note-labels';
import { fold } from '../core/text';
import { roveRadios } from './focus';
import { ICON, IconModule } from './icons';

/** Uma linha da árvore: a pasta, o nível e se ela tem pastas dentro. */
interface Row {
  folder: NoteFolder;
  depth: number;
  kids: boolean;
  /** Procurando: o caminho inteiro ("Programação › Funcional"). */
  path: string | null;
}

/**
 * A escolha da pasta de uma anotação (PLANO-PASTAS.md, 4.8): a árvore do grupo, recuada por nível, com as
 * pastas abertas no caminho da escolhida (a seta do lado abre e fecha as outras), "Sem pasta" no topo, e a
 * busca, que acha em qualquer nível e mostra o caminho. O escrito que não é nenhuma pasta oferece "Criar
 * 'Scripts' em Programação" (dentro da escolhida). Tocar escolhe. É a mesma no editor, na folha de
 * organizar, no "Mover para pasta…" e nas configurações; ela só escolhe, e quem usa cria (`create`).
 */
@Component({
  selector: 'app-folder-picker',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="campo">
      <lucide-icon class="lupa" [img]="SearchIcon" [size]="18" aria-hidden="true" />
      <span class="sr-only">Buscar ou criar pasta</span>
      <input
        type="text"
        autocomplete="off"
        enterkeyhint="done"
        [maxLength]="max"
        placeholder="Buscar ou criar pasta"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        (keydown.enter)="$event.preventDefault(); enter()"
      />
    </label>
    <div class="arvore" role="radiogroup" [attr.aria-label]="label()" (keydown)="rove($event)">
      @if (!searching() && rootLabel()) {
        <div class="ramo">
          <span class="abre-vazio" aria-hidden="true"></span>
          <button type="button" role="radio" class="op raiz" [attr.aria-checked]="value() === null" (click)="choose(null)">
            <lucide-icon class="ico" [img]="RootIcon" [size]="17" aria-hidden="true" />
            <span class="nome">{{ rootLabel() }}</span>
          </button>
        </div>
      }
      @for (r of rows(); track r.folder.id) {
        <div class="ramo" [style.--nivel]="r.depth">
          @if (r.kids && !searching()) {
            <button
              type="button"
              class="abre"
              tabindex="-1"
              [attr.aria-expanded]="open().has(r.folder.id)"
              [attr.aria-label]="(open().has(r.folder.id) ? 'Fechar ' : 'Abrir ') + r.folder.name"
              (click)="toggle(r.folder.id)"
            >
              <lucide-icon [img]="open().has(r.folder.id) ? OpenIcon : ClosedIcon" [size]="16" aria-hidden="true" />
            </button>
          } @else {
            <span class="abre-vazio" aria-hidden="true"></span>
          }
          <button
            type="button"
            role="radio"
            class="op"
            [attr.aria-checked]="value() === r.folder.id"
            [disabled]="blocked().has(r.folder.id)"
            (click)="choose(r.folder.id)"
          >
            <lucide-icon class="ico" [img]="FolderIcon" [size]="17" aria-hidden="true" />
            <span class="nome">{{ r.path ?? r.folder.name }}</span>
            @if (counts().get(r.folder.id); as n) {
              <span class="n"><span class="sr-only">, </span>{{ n }}<span class="sr-only"> {{ n === 1 ? 'anotação' : 'anotações' }}</span></span>
            }
          </button>
        </div>
      }
      @if (fresh(); as f) {
        <div class="ramo">
          <span class="abre-vazio" aria-hidden="true"></span>
          <button type="button" class="op criar" (click)="make(f)">
            <lucide-icon class="ico" [img]="PlusIcon" [size]="17" aria-hidden="true" />
            <span class="nome">Criar “{{ f }}” em {{ freshWhere() }}</span>
          </button>
        </div>
      }
    </div>
    @if (!tree().kids(group(), null).length && !searching()) {
      <p class="dica">{{ groupName() }} ainda não tem pastas. Escreva um nome para criar.</p>
    } @else if (searching() && !rows().length && !fresh()) {
      <p class="dica">Nenhuma pasta com esse nome.</p>
    }
  `,
  styleUrl: './folder-picker.scss',
})
export class FolderPicker {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** A pasta escolhida (o id; null: solta na raiz do grupo). */
  readonly value = model<string | null>(null);
  /** As pastas (a árvore inteira; o grupo diz quais aparecem). */
  readonly tree = input<FolderTree>(NO_FOLDERS);
  /** O grupo (a chave; "" é o Sem grupo) e o nome dele. */
  readonly group = input('');
  readonly groupName = input('Sem grupo');
  /** Quantas anotações cada pasta tem (com as de dentro), se quem usa quiser mostrar. */
  readonly counts = input<ReadonlyMap<string, number>>(new Map());
  /** O que não se pode escolher (mover uma pasta: ela mesma e as de dentro). */
  readonly blocked = input<ReadonlySet<string>>(new Set());
  /** A linha da raiz ("Sem pasta"; mover uma pasta: "Direto em Estudos"); vazio, sem a linha. */
  readonly rootLabel = input('Sem pasta');
  /** O nome do grupo de rádios, para o leitor de tela. */
  readonly label = input('Pasta da anotação');
  /** Criar a pasta escrita, dentro de `parent` (quem usa cria e escolhe). */
  readonly create = output<{ parent: string | null; name: string }>();

  protected readonly max = LABEL_MAX;
  protected readonly SearchIcon = ICON.buscar;
  protected readonly PlusIcon = ICON.adicionar;
  protected readonly FolderIcon = ICON.pastaDeNotas;
  protected readonly RootIcon = ICON.tirarDaPasta;
  protected readonly OpenIcon = ICON.abrir;
  protected readonly ClosedIcon = ICON.proximo;
  protected readonly query = signal('');
  protected readonly rove = roveRadios;
  protected readonly searching = computed(() => fold(this.query().trim()) !== '');

  /** As pastas abertas: as do caminho da escolhida (e ela), e as que a pessoa abriu. */
  protected readonly open = linkedSignal<ReadonlySet<string>>(() => new Set(this.tree().path(this.value()).map((f) => f.id)));

  protected toggle(id: string): void {
    const next = new Set(this.open());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.open.set(next);
  }

  /** As linhas: a árvore aberta (de A a Z em cada nível) ou, procurando, as que batem em qualquer nível. */
  protected readonly rows = computed<Row[]>(() => {
    const tree = this.tree();
    const group = this.group();
    const q = fold(cleanFolderName(this.query()));
    if (q) {
      const all: NoteFolder[] = [];
      const walk = (parent: string | null) => {
        for (const f of tree.kids(group, parent)) {
          all.push(f);
          walk(f.id);
        }
      };
      walk(null);
      const hits = [...all.filter((f) => fold(f.name).startsWith(q)), ...all.filter((f) => !fold(f.name).startsWith(q) && fold(f.name).includes(q))];
      return hits.map((f) => ({ folder: f, depth: 0, kids: false, path: pathLabel(tree.path(f.id)) }));
    }
    const open = this.open();
    const out: Row[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const f of tree.kids(group, parent)) {
        const kids = tree.kids(group, f.id).length > 0;
        out.push({ folder: f, depth, kids, path: null });
        if (kids && open.has(f.id)) walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });

  /** O escrito, quando ainda não é uma pasta ali dentro: "Criar 'Scripts' em Programação". */
  protected readonly fresh = computed(() => {
    const name = cleanFolderName(this.query());
    if (!name) return null;
    const parent = this.value();
    const twin = this.tree()
      .kids(this.group(), parent)
      .some((f) => fold(f.name) === fold(name));
    return twin ? null : name;
  });
  protected readonly freshWhere = computed(() => (this.value() ? (this.tree().live(this.value())?.name ?? this.groupName()) : this.groupName()));

  /** Enter: a primeira que bate com a busca, ou a pasta nova. */
  protected enter(): void {
    if (!this.searching()) return;
    const first = this.rows().find((r) => !this.blocked().has(r.folder.id));
    if (first) this.choose(first.folder.id);
    else if (this.fresh()) this.make(this.fresh()!);
  }

  protected choose(id: string | null): void {
    this.value.set(id);
    this.query.set('');
  }

  protected make(name: string): void {
    this.create.emit({ parent: this.value(), name });
    this.query.set('');
  }

  /** O foco vai para a busca (ao abrir a parte). */
  focus(): void {
    this.host.nativeElement.querySelector<HTMLInputElement>('input')?.focus();
  }
}
