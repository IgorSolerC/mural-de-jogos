import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Align, MAX_TABLE_COLS, MAX_TABLE_ROWS, TableData, parseTableText, pastedGrid, tableText } from '../core/tables';
import { ICON, IconModule } from './icons';

/** Uma célula da grade: a linha (-1 é o cabeçalho) e a coluna. */
interface Cell {
  r: number;
  c: number;
}

/**
 * A tabela escrita como numa planilha, na folha da tabela (ui/widget-sheet.ts): cada célula é um campo,
 * o cabeçalho em cima (em letra de impresso), e a régua de cima mexe na linha e na coluna da célula onde
 * o cursor está (pôr, mover, tirar, alinhar). Ninguém vê as barras do markdown.
 *
 * - Tab e Shift+Tab andam de célula em célula; Enter desce (na última linha, cria a próxima), Shift+Enter
 *   sobe; as setas de cima e de baixo andam na coluna, e as do lado passam de célula na ponta do texto.
 * - Colado de uma planilha (Excel, Planilhas Google: as células separadas por tab), o que veio se
 *   espalha a partir da célula do cursor, com as linhas e colunas que faltarem.
 *
 * Recebe e devolve a tabela como o markdown dela (`text`): por dentro, guarda as células como foram
 * escritas (com os espaços do fim enquanto se escreve), e só lê o texto de fora quando ele muda por
 * outro caminho.
 */
@Component({
  selector: 'app-table-grid',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './table-grid.html',
  styleUrl: './table-grid.scss',
})
export class TableGrid {
  /** A tabela, em markdown. */
  readonly text = input.required<string>();
  /** Tentou pôr sem nada escrito: a grade fica na tinta de erro. */
  readonly missing = input(false);
  /** Para os ids e os nomes da grade. */
  readonly ids = input('tg');
  readonly changed = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly AddRowAbove = ICON.linhaEmCima;
  protected readonly AddRowBelow = ICON.linhaEmbaixo;
  protected readonly AddColLeft = ICON.colunaAntes;
  protected readonly AddColRight = ICON.colunaDepois;
  protected readonly UpIcon = ICON.acima;
  protected readonly DownIcon = ICON.abaixo;
  protected readonly LeftIcon = ICON.voltar;
  protected readonly RightIcon = ICON.ir;
  protected readonly RemoveIcon = ICON.apagar;
  protected readonly PlusIcon = ICON.adicionar;
  protected readonly ALIGNS: readonly { value: Align; label: string; icon: typeof ICON.alinharInicio }[] = [
    { value: null, label: 'Alinhar à esquerda', icon: ICON.alinharInicio },
    { value: 'center', label: 'Centralizar', icon: ICON.alinharMeio },
    { value: 'right', label: 'Alinhar à direita (números)', icon: ICON.alinharFim },
  ];
  protected readonly maxCols = MAX_TABLE_COLS;
  protected readonly maxRows = MAX_TABLE_ROWS;

  /** As células como estão sendo escritas. */
  protected readonly data = signal<TableData>({ head: [''], rows: [], align: [null] });
  /** A célula do cursor (a régua mexe na linha e na coluna dela). */
  protected readonly at = signal<Cell>({ r: -1, c: 0 });
  /** O que a régua acabou de fazer, para quem lê a tela ("Linha posta embaixo"). */
  protected readonly said = signal('');

  protected readonly cols = computed(() => this.data().head.map((_, c) => c));
  protected readonly letters = computed(() => this.cols().map((c) => letterOf(c)));
  protected readonly alignHere = computed(() => this.data().align[this.at().c] ?? null);

  /** O markdown que esta grade mandou por último: o mesmo texto voltando não reescreve as células. */
  private sent: string | null = null;

  constructor() {
    effect(() => {
      const text = this.text();
      if (text === this.sent) return;
      untracked(() => {
        this.data.set(parseTableText(text));
        const d = this.data();
        this.at.set({ r: Math.min(this.at().r, d.rows.length - 1), c: Math.min(this.at().c, d.head.length - 1) });
      });
    });
  }

  // ===== as células =====

  /** O que a célula mostra: o "\|" do markdown é um "|" para quem escreve. */
  protected shown(raw: string): string {
    return raw.replace(/\\\|/g, '|');
  }

  protected cellOf(r: number, c: number): string {
    const d = this.data();
    return (r < 0 ? d.head[c] : d.rows[r]?.[c]) ?? '';
  }

  /** "Coluna B, linha 3", "Coluna A, cabeçalho". */
  protected nameOf(r: number, c: number): string {
    return `Coluna ${letterOf(c)}, ${r < 0 ? 'cabeçalho' : 'linha ' + (r + 1)}`;
  }

  protected write(r: number, c: number, value: string): void {
    // o "|" que se escreve vira "\|" no markdown (o que já tem a barra fica)
    const raw = value.replace(/\n/g, ' ').replace(/(?<!\\)\|/g, '\\|');
    this.update((d) => {
      if (r < 0) d.head[c] = raw;
      else d.rows[r][c] = raw;
    });
  }

  protected focused(r: number, c: number): void {
    this.at.set({ r, c });
  }

  /** A grade mudou: guarda e manda o markdown para a folha. */
  private update(change: (d: TableData) => void): void {
    const d = structuredClone(this.data());
    change(d);
    this.data.set(d);
    this.sent = tableText(d);
    this.changed.emit(this.sent);
  }

  /** Leva o cursor para uma célula (depois de a grade ser desenhada de novo). */
  private go(r: number, c: number, select = false): void {
    this.at.set({ r, c });
    afterNextRender(
      () => {
        const el = this.host.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`);
        el?.focus();
        if (select) el?.select();
      },
      { injector: this.injector },
    );
  }

  // ===== as teclas =====

  protected onKey(e: KeyboardEvent, r: number, c: number): void {
    const d = this.data();
    const el = e.target as HTMLInputElement;
    const last = d.rows.length - 1;
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Enter não põe a tabela no texto: desce (na última linha, cria a próxima)
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        if (r > -1) this.go(r - 1, c);
      } else if (r < last) this.go(r + 1, c);
      else this.addRow(r + 1, c);
      return;
    }
    if (e.key === 'ArrowDown' && r < last) {
      e.preventDefault();
      this.go(r + 1, c);
    } else if (e.key === 'ArrowUp' && r > -1) {
      e.preventDefault();
      this.go(r - 1, c);
    } else if (e.key === 'ArrowLeft' && el.selectionStart === 0 && el.selectionEnd === 0 && c > 0) {
      e.preventDefault();
      this.go(r, c - 1);
    } else if (e.key === 'ArrowRight' && el.selectionStart === el.value.length && c < d.head.length - 1) {
      e.preventDefault();
      this.go(r, c + 1);
    }
  }

  /** Colou células de uma planilha: elas se espalham a partir desta, com as linhas e colunas que faltarem. */
  protected onPaste(e: ClipboardEvent, r: number, c: number): void {
    const grid = pastedGrid(e.clipboardData?.getData('text/plain') ?? '');
    if (!grid) return;
    e.preventDefault();
    this.update((d) => {
      const width = Math.min(MAX_TABLE_COLS, Math.max(d.head.length, c + Math.max(...grid.map((l) => l.length))));
      while (d.head.length < width) {
        d.head.push('');
        d.align.push(null);
        for (const row of d.rows) row.push('');
      }
      grid.forEach((line, i) => {
        const at = r + i;
        if (at >= MAX_TABLE_ROWS) return;
        while (at >= d.rows.length) d.rows.push(Array(d.head.length).fill(''));
        line.forEach((cell, j) => {
          if (c + j >= d.head.length) return;
          const raw = cell.replace(/(?<!\\)\|/g, '\\|');
          if (at < 0) d.head[c + j] = raw;
          else d.rows[at][c + j] = raw;
        });
      });
    });
    const rows = grid.length;
    this.said.set(`Colado: ${rows} ${rows === 1 ? 'linha' : 'linhas'}`);
    this.go(Math.min(r + rows - 1, this.data().rows.length - 1), c);
  }

  // ===== as linhas =====

  /** Uma linha vazia na posição `at` (0 é a primeira de baixo do cabeçalho). */
  protected addRow(at: number, c = this.at().c): void {
    if (this.data().rows.length >= MAX_TABLE_ROWS) return;
    this.update((d) => d.rows.splice(at, 0, Array(d.head.length).fill('')));
    this.said.set('Linha nova');
    this.go(at, c);
  }

  /** Move a linha do cursor uma para cima ou para baixo (o cabeçalho fica onde está). */
  protected moveRow(step: -1 | 1): void {
    const { r, c } = this.at();
    const to = r + step;
    if (r < 0 || to < 0 || to >= this.data().rows.length) return;
    this.update((d) => ([d.rows[r], d.rows[to]] = [d.rows[to], d.rows[r]]));
    this.said.set(step < 0 ? 'Linha subiu' : 'Linha desceu');
    this.go(to, c);
  }

  protected removeRow(): void {
    const { r, c } = this.at();
    if (r < 0 || this.data().rows.length <= 1) return;
    this.update((d) => d.rows.splice(r, 1));
    this.said.set('Linha tirada');
    this.go(Math.min(r, this.data().rows.length - 1), c);
  }

  // ===== as colunas =====

  protected addCol(at: number): void {
    if (this.data().head.length >= MAX_TABLE_COLS) return;
    this.update((d) => {
      d.head.splice(at, 0, '');
      d.align.splice(at, 0, null);
      for (const row of d.rows) row.splice(at, 0, '');
    });
    this.said.set('Coluna nova');
    this.go(-1, at);
  }

  protected moveCol(step: -1 | 1): void {
    const { r, c } = this.at();
    const to = c + step;
    if (to < 0 || to >= this.data().head.length) return;
    const swap = <T>(a: T[]) => ([a[c], a[to]] = [a[to], a[c]]);
    this.update((d) => {
      swap(d.head);
      swap(d.align);
      d.rows.forEach(swap);
    });
    this.said.set(step < 0 ? 'Coluna foi para a esquerda' : 'Coluna foi para a direita');
    this.go(r, to);
  }

  protected removeCol(): void {
    const { r, c } = this.at();
    if (this.data().head.length <= 1) return;
    this.update((d) => {
      d.head.splice(c, 1);
      d.align.splice(c, 1);
      for (const row of d.rows) row.splice(c, 1);
    });
    this.said.set('Coluna tirada');
    this.go(r, Math.min(c, this.data().head.length - 1));
  }

  protected align(value: Align): void {
    const { r, c } = this.at();
    this.update((d) => (d.align[c] = value));
    this.go(r, c);
  }

  /** O alinhamento de cada coluna, nas células da grade. */
  protected textAlign(c: number): string | null {
    const a = this.data().align[c];
    return a === 'center' ? 'center' : a === 'right' ? 'right' : null;
  }
}

/** A letra da coluna, como numa planilha: A, B… Z, AA. */
function letterOf(c: number): string {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
