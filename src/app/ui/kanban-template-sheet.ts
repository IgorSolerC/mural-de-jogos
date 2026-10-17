import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { LucideAngularModule, X } from 'lucide-angular';
import { CardLook, sanitizeLook } from '../core/card-look';
import { updateColumn } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { DEFAULT_LOOK, DEFAULT_SCRIBBLE_INK, Damage, DecorMark, Paper, Pattern, PatternLook, Scribble, StainMark, lookOf } from '../core/paper';
import { Review, Stock, sanitizeReview } from '../core/review';
import { pinningFor } from '../core/wall-physics';
import { BackdropClose } from './backdrop-close';
import { CardKit } from './card-kit';
import { KanbanReviewCard } from './kanban-note';
import { Toasts } from './toast';

/** Uma anotação de mentira com o visual do card padrão, para a prévia (a ficha do quadro de verdade). */
export function sampleNote(id: string, name: string, look: CardLook): Review {
  const r = sanitizeReview({ kind: 'anotacoes', game: { name }, text: 'Assim fica cada anotação que chega aqui.', completedAt: new Date().toISOString().slice(0, 10), ...look })!;
  return { ...r, id };
}

/**
 * Montar o card padrão de uma coluna do Kanban (a folha "Card padrão", aberta dos ajustes da coluna):
 * o mesmo estojo do editor (a cor, o papel, a estampa, o rabisco, o estrago, as manchas e as
 * decorações) e, ao lado, a ficha do quadro vestida com ele, numa tira de papel pardo como a coluna.
 * Nada muda nas anotações até "Usar este card"; aí todas as da coluna vestem o card novo, com Desfazer.
 */
@Component({
  selector: 'app-kanban-template-sheet',
  imports: [BackdropClose, CardKit, KanbanReviewCard, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet modelo" aria-labelledby="kt-titulo" (close)="closed.emit()" (backdropClose)="close()">
      @if (column(); as col) {
        <div class="ficha cartolina" [style.--stock]="'var(--stock-' + stock() + ')'" [attr.data-cor]="stock()">
          <header class="head">
            <div class="titulos">
              <h2 id="kt-titulo">Card padrão</h2>
              <p class="sub">Coluna {{ col.name }} · {{ count() === 1 ? '1 anotação veste' : count() + ' anotações vestem' }}</p>
            </div>
            <button type="button" class="icon-btn fecha" aria-label="Fechar sem mudar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
          </header>

          <div class="corpo">
            <!-- a prévia: a ficha do quadro numa tira de papel pardo, como na coluna -->
            <div class="previa" aria-hidden="true">
              <div class="tira-parda">
                <app-review-card [review]="sample()" [compact]="true" [preview]="true" />
              </div>
            </div>
            @defer (on immediate) {
              <app-card-kit
                class="estojo"
                [id]="sampleId()"
                [pinColor]="pinColor()"
                [(stock)]="stock"
                [(paper)]="paper"
                [(paperSeed)]="paperSeed"
                [(pattern)]="pattern"
                [(patternLook)]="patternLook"
                [(patternSeed)]="patternSeed"
                [(scribble)]="scribble"
                [(scribbleSeed)]="scribbleSeed"
                [(scribbleInk)]="scribbleInk"
                [(damage)]="damage"
                [(damageSeed)]="damageSeed"
                [(stains)]="stains"
                [(decors)]="decors"
              />
            } @placeholder {
              <p class="carregando-estojo">Abrindo o estojo…</p>
            }
          </div>

          <footer class="foot">
            <p class="pe-dica">Cada anotação ganha o próprio traço: o mesmo rabisco ou mancha cai num lugar diferente em cada uma.</p>
            <div class="actions">
              <button type="button" class="papel" (click)="close()">Cancelar</button>
              <button type="button" class="btn-ink" (click)="save()">Usar este card</button>
            </div>
          </footer>
        </div>
      }
    </dialog>
  `,
  styleUrl: './kanban-template-sheet.scss',
})
export class KanbanTemplateSheet {
  readonly boardId = input.required<string>();
  readonly columnId = input.required<string>();
  readonly closed = output<void>();

  protected readonly CloseIcon = X;
  private readonly kanban = inject(KanbanStore);
  private readonly toasts = inject(Toasts);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly column = computed(() => this.kanban.get(this.boardId())?.columns.find((c) => c.id === this.columnId()) ?? null);
  protected readonly count = computed(() => this.kanban.get(this.boardId())?.cards.filter((c) => c.column === this.columnId()).length ?? 0);

  // o estojo, como no editor: começa no card guardado, ou na cor da etiqueta da coluna
  protected readonly stock = signal<Stock>('amarelo');
  protected readonly paper = signal<Paper>('cartolina');
  protected readonly paperSeed = signal<number | null>(null);
  protected readonly pattern = signal<Pattern | null>(null);
  protected readonly patternLook = signal<PatternLook>(DEFAULT_LOOK);
  protected readonly patternSeed = signal<number | null>(null);
  protected readonly scribble = signal<Scribble | null>(null);
  protected readonly scribbleSeed = signal<number | null>(null);
  protected readonly scribbleInk = signal(DEFAULT_SCRIBBLE_INK);
  protected readonly damage = signal<Damage | null>(null);
  protected readonly damageSeed = signal<number | null>(null);
  protected readonly stains = signal<StainMark[]>([]);
  protected readonly decors = signal<DecorMark[]>([]);

  /** O card como vai ser guardado (o de sempre de cada parte não vai). */
  protected readonly look = computed<CardLook>(() => {
    const l = this.patternLook();
    return sanitizeLook({
      stock: this.stock(),
      paper: this.paper(),
      paperSeed: this.paperSeed() ?? undefined,
      pattern: this.pattern() ?? undefined,
      patternSpacing: l.spacing,
      patternSize: l.size,
      patternJitter: l.jitter,
      patternInk: l.ink,
      patternSeed: this.patternSeed() ?? undefined,
      scribble: this.scribble() ?? undefined,
      scribbleSeed: this.scribbleSeed() ?? undefined,
      scribbleInk: this.scribbleInk(),
      damage: this.damage() ?? undefined,
      damageSeed: this.damageSeed() ?? undefined,
      stains: this.stains(),
      decors: this.decors(),
    });
  });

  /** A ficha da prévia: o nome da primeira anotação da coluna, ou um de exemplo. */
  protected readonly sampleId = computed(() => `modelo${this.columnId()}`.slice(0, 40));
  protected readonly sample = computed(() => sampleNote(this.sampleId(), this.sampleName(), this.look()));
  protected readonly pinColor = computed(() => pinningFor(this.sampleId(), this.stock()).pinColor);
  private readonly sampleName = computed(() => {
    const b = this.kanban.get(this.boardId());
    const first = b?.cards.find((c) => c.column === this.columnId());
    return (first && this.kanban.notesById().get(first.note)?.game.name) || 'Anotação de exemplo';
  });

  constructor() {
    afterNextRender(() => {
      const col = this.column();
      if (col) this.load(col.look ?? { stock: col.color });
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('.fecha')?.focus();
    });
  }

  private load(look: CardLook): void {
    this.stock.set(look.stock ?? 'amarelo');
    this.paper.set(look.paper ?? 'cartolina');
    this.paperSeed.set(look.paperSeed ?? null);
    this.pattern.set(look.pattern ?? null);
    this.patternLook.set(lookOf(look));
    this.patternSeed.set(look.patternSeed ?? null);
    this.scribble.set(look.scribble ?? null);
    this.scribbleSeed.set(look.scribbleSeed ?? null);
    this.scribbleInk.set(look.scribbleInk ?? DEFAULT_SCRIBBLE_INK);
    this.damage.set(look.damage ?? null);
    this.damageSeed.set(look.damageSeed ?? null);
    this.stains.set([...(look.stains ?? [])]);
    this.decors.set([...(look.decors ?? [])]);
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  /** Guarda o card e liga o card padrão da coluna: as anotações dela vestem na hora, com Desfazer. */
  protected save(): void {
    const col = this.column();
    const before = this.kanban.get(this.boardId());
    if (!col || !before) return;
    this.kanban.update(before.id, (b, at) => updateColumn(b, col.id, { look: this.look(), dresses: true }, at));
    const n = this.count();
    this.toasts.show(n ? `${n === 1 ? 'A anotação' : `As ${n} anotações`} de ${col.name} ${n === 1 ? 'vestiu' : 'vestiram'} o card padrão` : `O card padrão de ${col.name} está pronto`, {
      label: 'Desfazer',
      run: () => this.kanban.restore(before),
    });
    this.close();
  }
}
