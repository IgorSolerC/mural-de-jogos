import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { studyPath } from '../core/areas';
import { KanbanStore } from '../core/kanban-store';
import { categoryBonus, categoryLibrary } from '../core/note-labels';
import { Stock, fold } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { DECK_NAME_MAX, groupKey, studyGroupId } from '../core/study';
import { DeckCopy, DeckCopyProblem, DeckCopyRequest, DeckCopyResult } from '../core/study-copy';
import { StudyStore } from '../core/study-store';
import { BackdropClose } from './backdrop-close';
import { Busy } from './busy';
import { GroupPicker } from './group-picker';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';
import { StudyCard } from './study-card';
import { Toasts } from './toast';

/** A primeira carta do baralho, como a folha mostra ao lado do que vai acontecer. */
export interface CopySample {
  title: string;
  subtitle?: string;
  image?: string;
  stock: Stock | undefined;
}

/**
 * "Copiar baralho", no baralho de outra pessoa (PLANO-BARALHOS-PUBLICOS.md, 4.5): a mesma ficha da folha do
 * baralho, na cor dele, com o nome (o do dono, já escrito) e o grupo (vazio: as orelhas do editor da anotação,
 * com a busca que cria um novo).
 * Copiar cria o baralho seu, com uma anotação sua, privada e só nos Estudos, para cada carta que você vê, e
 * abre nele, com Desfazer.
 */
@Component({
  selector: 'app-study-copy-sheet',
  imports: [BackdropClose, Busy, GroupPicker, IconModule, Pin, StudyCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet coluna-ajustes copiar-baralho" aria-labelledby="cb-titulo" aria-describedby="cb-frase" (cancel)="onEscape($event)" (close)="closed.emit()" (backdropClose)="close()">
      <form class="ficha cartolina" [style.--stock]="'var(--stock-' + request().deck.color + ')'" [attr.data-cor]="request().deck.color" (submit)="$event.preventDefault(); copy()">
        <app-pin class="pin" color="#f4f4f0" />
        <header class="head">
          <div class="titulos">
            <h2 id="cb-titulo">Copiar baralho</h2>
            <p class="sub">{{ request().deck.name }}, de {{ owner() }} · {{ cardsLabel() }}</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" [disabled]="busy()" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="body">
          <div class="copia-resumo">
            @if (sample(); as s) {
              <span class="copia-carta" aria-hidden="true">
                <app-study-card [title]="s.title" [subtitle]="s.subtitle" [image]="s.image" [stock]="s.stock" [deck]="request().deck" />
              </span>
            }
            <p id="cb-frase" class="copia-frase">{{ phrase() }}</p>
          </div>

          <section class="grupo">
            <h3 class="grupo-titulo"><label for="cb-nome">Nome</label></h3>
            <div class="campo">
              <input id="cb-nome" type="text" autocomplete="off" required [maxLength]="nameMax" [value]="name()" (input)="name.set($any($event.target).value)" />
            </div>
          </section>

          <section class="grupo">
            <h3 class="grupo-titulo">Grupo</h3>
            <app-group-picker [required]="true" groupLabel="Grupo do baralho copiado" [category]="group()" (categoryChange)="group.set($event)" [categories]="library()" />
            <p class="copia-dica">{{ hint() }}</p>
          </section>

          @if (problem(); as p) {
            <p class="copia-erro" role="alert">{{ p }}</p>
          }
        </div>

        <footer class="foot">
          <button type="button" class="papel" [disabled]="busy()" (click)="close()">Cancelar</button>
          <div class="actions">
            <button type="submit" class="btn-ink" [disabled]="!ready()" [appBusy]="busy()">
              <lucide-icon [img]="CopyIcon" [size]="18" aria-hidden="true" />
              {{ busy() ? 'Copiando…' : 'Copiar' }}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  `,
  styleUrl: './kanban-column-sheet.scss',
  styles: `
    /* a primeira carta do baralho, pequena e inclinada, ao lado do que vai acontecer */
    .copia-resumo {
      display: flex;
      align-items: center;
      gap: 18px;
      margin-bottom: 6px;
    }
    .copia-carta {
      flex: none;
      display: block;
      width: 84px;
      rotate: -3deg;
      filter: drop-shadow(0 3px 5px rgb(0 0 0 / 0.25));
    }
    .copia-frase {
      margin: 0;
      max-width: 46ch;
      font-family: var(--f-hand);
      font-size: 1.05rem;
      line-height: 1.4;
      color: var(--ink);
    }
    /* duas linhas guardadas: a dica muda ao escolher o grupo, e o Copiar não anda */
    .copia-dica {
      min-height: 2.8em;
      margin: 8px 0 0;
      font-size: 0.9rem;
      line-height: 1.4;
      color: var(--ink-2);
    }
    .copia-erro {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.4;
      font-weight: 600;
      color: var(--red-deep);
    }
    .grupo-titulo label {
      cursor: pointer;
    }
    .btn-ink lucide-icon {
      display: inline-flex;
    }
    /* sem grupo (ou sem lugar), o Copiar apagado, como o "Baixar backup" sem nada (pages/settings-page.scss) */
    .btn-ink:disabled:not(.carregando) {
      opacity: 0.5;
      transform: none;
      cursor: not-allowed;
    }
  `,
})
export class StudyCopySheet {
  readonly request = input.required<DeckCopyRequest>();
  /** De quem é o baralho (o nome na faixa e no toast). */
  readonly owner = input.required<string>();
  readonly sample = input<CopySample | null>(null);
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly CopyIcon = ICON.copiar;
  protected readonly nameMax = DECK_NAME_MAX;

  private readonly copier = inject(DeckCopy);
  private readonly study = inject(StudyStore);
  private readonly kanban = inject(KanbanStore);
  private readonly store = inject(ReviewStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly name = signal('');
  protected readonly group = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** O erro da última tentativa; mudar o nome ou o grupo já é outra tentativa, e ele sai. */
  protected readonly failed = linkedSignal<unknown, string | null>({ source: () => [this.name(), this.group()], computation: () => null });
  /** A folha saiu da tela enquanto copiava (a pessoa foi para outra página): o fim não a leva de volta. */
  private gone = false;

  protected readonly count = computed(() => this.request().cards.length);
  protected readonly cardsLabel = computed(() => (this.count() === 1 ? '1 carta' : `${this.count()} cartas`));
  protected readonly phrase = computed(() => {
    const n = this.count();
    return `${n === 1 ? 'A carta vira uma anotação sua' : `As ${n} cartas viram anotações suas`}, ${n === 1 ? 'privada' : 'privadas'}, só nos Flashcards. O progresso começa do zero.`;
  });
  /** Sem lugar, ou o erro da última tentativa. */
  protected readonly problem = computed(() => this.failed() ?? this.copier.limit(this.count()));

  /** As orelhas: as do editor da anotação (a cartela e os grupos das anotações) e as dos seus baralhos. */
  protected readonly library = computed(() => {
    const lib = categoryLibrary(this.store.notes());
    const known = new Set(lib.map((b) => fold(b.label)));
    for (const d of this.study.decks()) {
      if (d.group && !known.has(fold(d.group))) {
        known.add(fold(d.group));
        lib.push(categoryBonus(d.group));
      }
    }
    return lib;
  });
  /** O grupo já existe (tem anotação ou baralho seu), e não é só um nome da cartela ou um novo. */
  private readonly inUse = computed(() => {
    const g = this.group();
    if (!g) return false;
    const key = groupKey(g);
    return this.kanban.categories().some((c) => groupKey(c.label) === key) || this.study.decks().some((d) => groupKey(d.group) === key);
  });
  protected readonly ready = computed(() => !!this.group() && !!this.name().trim() && !this.copier.limit(this.count()) && this.count() > 0);
  /** O que falta para copiar, ou para onde o baralho vai: o Copiar apagado nunca fica sem o porquê. */
  protected readonly hint = computed(() => {
    const g = this.group();
    if (!g) return 'Escolha um grupo ou crie um novo: o baralho e as anotações das cartas ficam nele.';
    if (!this.name().trim()) return 'Dê um nome ao baralho para copiar.';
    return this.inUse() ? `Vai para o seu grupo ${g}.` : `${g} é um grupo novo: ele aparece nas abas do mural e dos Flashcards.`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.gone = true));
    afterNextRender(() => {
      this.name.set(this.request().deck.name);
      const el = this.dialog().nativeElement;
      el.showModal();
      // o grupo é o que falta: o foco vai para a busca dele. Só com mouse: no celular, o foco abriria o
      // teclado por cima das orelhas, que é o caminho mais curto ali
      if (matchMedia('(pointer: fine)').matches) el.querySelector<HTMLInputElement>('app-group-picker input')?.focus();
    });
  }

  /** Copiando, a folha não fecha: a cópia não para, e fechar diria que ela foi cancelada. */
  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open && !this.busy()) el.close();
  }

  /** O Esc, como o Cancelar: copiando, a folha fica. */
  protected onEscape(event: Event): void {
    if (this.busy()) event.preventDefault();
  }

  protected async copy(): Promise<void> {
    if (!this.ready() || this.busy()) return;
    this.busy.set(true);
    this.failed.set(null);
    const group = this.group()!;
    let out: DeckCopyResult;
    try {
      out = await this.copier.copy(this.request(), this.name(), group);
    } catch (err) {
      this.failed.set(err instanceof DeckCopyProblem ? err.message : 'Não deu para copiar o baralho. Tente de novo.');
      return;
    } finally {
      this.busy.set(false);
    }
    if (!this.gone) {
      this.close();
      await this.router.navigateByUrl(studyPath(studyGroupId(group), out.id));
    }
    const lost = out.lostImages ? ` ${out.lostImages === 1 ? '1 imagem não veio' : `${out.lostImages} imagens não vieram`}.` : '';
    this.toasts.show(`Baralho copiado: ${out.name}, com ${out.cards === 1 ? '1 carta' : `${out.cards} cartas`}.${lost}`, { label: 'Desfazer', run: out.undo }, 8000);
  }
}
