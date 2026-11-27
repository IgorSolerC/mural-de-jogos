import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { CONJ_TABLE, ConjGroupId, Conjugated, FORMS, FormId, conjugate, formParts, groupSaid } from '../core/dictionary/conjugation';
import { Word, exampleParts } from '../core/dictionary/dictionary';
import { hasKanji } from '../core/dictionary/kana';
import { reducedMotion } from '../core/motion';
import { BackdropClose } from './backdrop-close';
import { ROOM, showInRoom } from './room';
import { loadKleeOne } from './font-sheet';
import { ICON, IconModule } from './icons';
import { WordVoice } from './word-voice';

/** Uma casa da tabela: a forma (null: não se usa neste verbo) com o radical e o que muda, já separados. */
interface Cell {
  id: FormId;
  form: Conjugated | null;
  stem: string;
  tail: string;
  /** A leitura embaixo, só quando a escrita tem kanji. */
  reading: string | null;
  /** O registro, quando não é o da coluna (a imperativa firme na coluna da polida, a contraída na da informal). */
  tag: string | null;
}

interface Row {
  label: string;
  sub?: string;
  /** null: a coluna fica vazia nesta linha. */
  cells: (Cell | null)[];
}

interface Group {
  id: ConjGroupId;
  title: string;
  short: string;
  cols: readonly string[];
  rows: Row[];
}

/**
 * As conjugações de um verbo do Dicionário Japonês (PLANO-CONJUGACOES.md, 2): a folhinha de papel de arroz do "No
 * dicionário", com o verbo na faixa vinho do verbete e, embaixo, a tabela consolidada dos cinco grupos da nota 行く→ Ir
 * (os pares informal/polido lado a lado; o radical a tinta e o que muda no vinho). Tocar numa forma abre embaixo da
 * linha dela o uso e um exemplo (uma de cada vez). Aberta por uma forma (a busca ou a seleção acharam 行かない), ela
 * já vem escolhida e à vista. Só leitura: nada é guardado.
 */
@Component({
  selector: 'app-word-conjugations',
  imports: [BackdropClose, IconModule, WordVoice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './word-conjugations.html',
  styleUrl: './word-conjugations.scss',
})
export class WordConjugations {
  readonly word = input.required<Word>();
  /** A forma que a busca ou a seleção acharam: a folha abre nela. */
  readonly form = input<FormId | null>(null);
  readonly closed = output<void>();
  /** O lado da leitura onde o dicionário está (ui/room.ts): a folha abre nele, e não na tela inteira. */
  private readonly rooms = inject(ROOM, { optional: true });
  /** Esconde a folha aberta no lado (ou null: aberta como modal, ou fechada). */
  private hideRoom: (() => void) | null = null;
  /** A folha que sai de cena aberta no lado (o lado fechou) leva o véu e o ouvinte do Esc junto. */
  private readonly unroom = inject(DestroyRef).onDestroy(() => this.hideRoom?.());

  protected readonly CloseIcon = ICON.fechar;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('corpo');
  private readonly reduced = reducedMotion();

  /** A forma aberta (o uso e o exemplo embaixo da linha dela), uma de cada vez. */
  protected readonly open = signal<FormId | null>(null);

  protected readonly ruby = computed(() => hasKanji(this.word().text) && this.word().text !== this.word().reading);
  protected readonly group = computed(() => groupSaid(this.word().verbGroup));

  protected readonly table = computed<Group[]>(() => {
    const w = this.word();
    const forms = conjugate(w);
    return CONJ_TABLE.map((g) => ({
      id: g.id,
      title: g.title,
      short: g.short,
      cols: g.cols,
      rows: g.rows.map((r) => ({
        label: r.label,
        sub: r.sub,
        cells: r.cells.map((id, i) => {
          if (!id) return null;
          const form = forms?.get(id) ?? null;
          const [stem, tail] = form ? formParts(w.text, form.text) : ['', ''];
          const register = form?.form.tags.split(' • ')[1] ?? '';
          const col = g.cols[i];
          const tag = form && (col === 'Informal' || col === 'Polido') && register !== col ? register.toLowerCase() : null;
          return { id, form, stem, tail, reading: form && hasKanji(form.text) ? form.reading : null, tag };
        }),
      })),
    }));
  });

  /** Quantas formas o verbo tem (as que se usam): "33 formas", ou "21 de 33 formas" quando algumas não se usam. */
  protected readonly countSaid = computed(() => {
    const n = [...(conjugate(this.word())?.values() ?? [])].filter(Boolean).length;
    return n === FORMS.length ? `${n} formas` : `${n} de ${FORMS.length} formas`;
  });

  /** A forma aberta: o que o detalhe mostra (o exemplo em pedaços, e a forma como uma palavra para a voz). */
  protected readonly detail = computed(() => {
    const id = this.open();
    const f = id ? conjugate(this.word())?.get(id) : null;
    if (!f) return null;
    // o exemplo do próprio verbete, quando uma das frases dele tem a forma marcada; senão, o da forma (outro verbo)
    const marked = (ja: string) => ja.match(/\[([^\]]+)\]/)?.[1];
    const own = this.word().examples.find((e) => marked(e.ja) === f.text);
    const example = own ?? f.form.example;
    return {
      id: f.form.id,
      text: f.text,
      reading: hasKanji(f.text) ? f.reading : null,
      tags: f.form.tags,
      use: f.form.use,
      example: exampleParts(example.ja),
      pt: example.pt,
      /** O exemplo é de outro verbo (a forma é a mesma): a folha diz, para não parecer que é deste. */
      other: marked(example.ja) !== f.text,
      // a voz lê a leitura; a chave dela é a da forma, para não acender o ouvir do verbo
      voice: { ...this.word(), id: `${this.word().id}:${f.form.id}`, text: f.text, reading: f.reading } satisfies Word,
    };
  });

  constructor() {
    loadKleeOne();
    afterNextRender(() => {
      const first = this.form();
      if (first && conjugate(this.word())?.get(first)) this.open.set(first);
      // no lado da leitura (PLANO-LADO-A-LADO.md, D5), a folha cobre só o lado; sem lado, a tela inteira
      const room = this.rooms?.room() ?? null;
      if (room) this.hideRoom = showInRoom(this.dialog().nativeElement, room, () => this.close());
      else this.dialog().nativeElement.showModal();
      if (this.open()) {
        // a forma achada à vista, com o foco nela (o detalhe embaixo já aberto)
        requestAnimationFrame(() => {
          const cell = this.body().nativeElement.querySelector<HTMLElement>(`[data-forma="${first}"]`);
          cell?.focus({ preventScroll: true });
          cell?.scrollIntoView({ block: 'center' });
        });
      }
    });
  }

  close(): void {
    // no lado, ela não é um diálogo aberto: esconde e avisa (o `close` do diálogo não vem)
    if (this.hideRoom) {
      const hide = this.hideRoom;
      this.hideRoom = null;
      hide();
      this.closed.emit();
      return;
    }
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected toggle(id: FormId): void {
    this.open.update((now) => (now === id ? null : id));
  }

  /** O detalhe vai logo depois da linha que tem a forma aberta. */
  protected rowOpen(row: Row): boolean {
    const id = this.open();
    return !!id && row.cells.some((c) => c?.id === id);
  }

  /** O índice: a folha rola até o grupo. */
  protected jump(id: ConjGroupId): void {
    const el = this.body().nativeElement.querySelector<HTMLElement>(`#cj-${id}`);
    el?.scrollIntoView({ block: 'start', behavior: this.reduced ? 'auto' : 'smooth' });
  }

  protected cellLabel(c: Cell): string {
    return c.form ? `${c.form.text}${c.reading ? ` (${c.reading})` : ''}: ${c.form.form.tags}` : '';
  }
}
