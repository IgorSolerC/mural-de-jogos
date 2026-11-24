import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { DEFAULT_PALETTE, PALETTES, clampSide, gridOf, hasInk, inkCount, paletteWord, parseColors } from '../../core/pixel-art';
import { StoredLayer } from '../../core/pixel-layers';
import { WidgetValues } from '../../core/widgets';
import { ICON, IconModule } from '../icons';
import { DraftTarget, PixelStudio, StudioResult, offerUndoDiscard } from './pixel-studio';
import { PixelDraft, PixelDrafts, draftKey } from '../../core/pixel-drafts';
import { Toasts } from '../toast';
import { Confirm } from '../confirm';
import { askDraft, discardDraft, sameArt } from './draft-ask';
import { PixelThumb } from '../pixel-thumb';

/**
 * O desenho da pixel art na folha do widget (o campo `pixels`): uma linha só, como a escolha do ícone. A
 * miniatura do desenho (sem o xadrez, que é só do ateliê), a tela e as cores ("16 × 16 · 12 cores · Sweetie 16") e o botão de papel
 * que abre o ateliê (ui/pixel-studio/pixel-studio.ts) por cima de tudo. O desenho novo, ainda sem ponto
 * nenhum, já abre no ateliê. Sair do ateliê pergunta (PLANO-RASCUNHOS-PIXEL.md): o Salvar passa o desenho adiante
 * (`changed`), o Salvar como cópia também (`copied`, e quem usa faz a cópia), e o Descartar não passa nada.
 *
 * O rascunho (`draft`): o ateliê grava o desenho neste aparelho enquanto se desenha. O Salvar daqui ainda não é
 * salvar (a folha de quem usa é que guarda): o rascunho fica, e o ateliê seguinte nesta folha continua o mesmo; quem
 * usa o tira (`forgetDraft`) quando guardou de verdade, ou quando a pessoa descartou a folha.
 */
@Component({
  selector: 'app-pixel-field',
  imports: [IconModule, PixelStudio, PixelThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="linha" [class.falta]="missing()">
      <span class="miniatura" [class.vazia]="!inked()" aria-hidden="true">
        @if (inked()) {
          <app-pixel-thumb [art]="drawing()" />
        } @else {
          <lucide-icon [img]="EmptyIcon" [size]="22" />
        }
      </span>
      <div class="linha-texto">
        <p class="linha-nome">{{ inked() ? 'O desenho' : 'Nada desenhado ainda' }}</p>
        <p class="linha-desc">{{ summary() }}</p>
      </div>
      <button type="button" class="papel" data-campo="pixels" aria-haspopup="dialog" [attr.aria-describedby]="missing() ? ids() + '-falta' : null" (click)="startStudio()">
        <lucide-icon [img]="BrushIcon" [size]="16" aria-hidden="true" />
        {{ inked() ? 'Abrir o ateliê' : 'Desenhar' }}
      </button>
    </div>
    @if (missing()) {
      <p class="falta-texto" [id]="ids() + '-falta'">Abra o ateliê e pinte pelo menos um ponto.</p>
    }
    @defer (when open()) {
      @if (open()) {
        <app-pixel-studio [values]="values()" [layered]="layered()" [stack]="stack()" [copy]="copyable()" [draft]="target()" [resume]="resume()" (saved)="saved($event)" (copied)="copied.emit($event)" (discarded)="discarded($event)" (closed)="closed()" />
      }
    }
  `,
  styleUrl: './pixel-field.scss',
})
export class PixelField {
  /** Os valores da folha (os pontos, a grade, a paleta, as cores trocadas). */
  readonly values = input.required<WidgetValues>();
  /** Tentou pôr sem desenho: a linha fica na tinta de erro. */
  readonly missing = input(false);
  /** Abre o ateliê assim que aparece (o widget novo, sem desenho). */
  readonly autoOpen = input(false);
  readonly ids = input('px');
  /** Uma obra da galeria: o ateliê tem as camadas (PLANO-CAMADAS.md). */
  readonly layered = input(false);
  /** As camadas da obra (sem elas, uma só). */
  readonly stack = input<readonly StoredLayer[] | undefined>(undefined);
  /**
   * O "Salvar como cópia" na pergunta de sair do ateliê: null (o de sempre), quando já havia um desenho ao abrir o
   * ateliê; quem usa pode dizer (a ficha de uma obra nova não tem original).
   */
  readonly copy = input<boolean | null>(null);
  /** De onde o desenho vem e o nome, para o rascunho que o ateliê grava; sem ele, nenhum. */
  readonly draft = input<Pick<DraftTarget, 'origin' | 'title'> | null>(null);
  /** O ateliê saiu salvando: o desenho novo (os valores e, com `layered`, a pilha logo depois). */
  readonly changed = output<WidgetValues>();
  readonly stackChanged = output<StoredLayer[] | undefined>();
  /**
   * O ateliê saiu salvando como cópia: quem usa guarda a cópia, e o desenho daqui fica como era. A cópia tem o
   * rascunho dela (`draft`), que quem usa tira depois de guardá-la.
   */
  readonly copied = output<StudioResult>();

  protected readonly EmptyIcon = ICON.pixelArt;
  protected readonly BrushIcon = ICON.editar;
  protected readonly open = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly drafts = inject(PixelDrafts);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);
  /** O rascunho desta folha, depois de um Salvar do ateliê: o id e o desenho de antes de tudo. */
  private readonly carried = signal<{ id: string; base: string } | null>(null);
  /** O desenho de quando o primeiro ateliê desta folha abriu. */
  private base: string | null = null;
  /** O ateliê abre continuando este rascunho (o Desfazer do Descartar). */
  protected readonly resume = signal<PixelDraft | null>(null);
  protected readonly target = computed<DraftTarget | null>(() => {
    const t = this.draft();
    const c = this.carried();
    return t ? { ...t, ...(c ? { draftId: c.id, base: c.base } : {}) } : null;
  });

  protected readonly w = computed(() => clampSide(this.values()['width']));
  protected readonly h = computed(() => clampSide(this.values()['height']));
  private readonly palette = computed(() => paletteWord(this.values()['palette'] ?? '') ?? DEFAULT_PALETTE);
  private readonly colors = computed(() => parseColors(this.values()['colors'] ?? '') ?? {});
  private readonly rows = computed(() => gridOf(this.values()['pixels'] ?? '', this.w(), this.h()));
  protected readonly drawing = computed(() => ({ w: this.w(), h: this.h(), rows: this.rows(), palette: this.palette(), colors: this.colors() }));
  protected readonly inked = computed(() => hasInk(this.rows()));
  protected readonly copyable = computed(() => this.copy() ?? this.inked());
  protected readonly summary = computed(() => {
    const n = inkCount(this.palette(), this.colors());
    const label = PALETTES.find((p) => p.value === this.palette())?.label ?? '';
    const layers = (this.stack() ?? []).filter((l) => l.rows !== undefined).length;
    return `${this.w()} × ${this.h()} · ${n} ${n === 1 ? 'cor' : 'cores'} · ${label}${layers > 1 ? ` · ${layers} camadas` : ''}`;
  });

  constructor() {
    afterNextRender(() => {
      if (this.autoOpen() && !this.inked()) this.openStudio();
    });
  }

  /** Abre o ateliê por quem usa (o "Desenhar uma nova" da folha da galeria, na folha do widget). */
  openStudio(resume: PixelDraft | null = null): void {
    this.resume.set(resume);
    // o desenho de antes de tudo: o de agora, enquanto não há rascunho desta folha (a folha do widget pode ter trocado
    // de desenho pela galeria entre um ateliê e outro)
    if (!this.carried()) this.base = draftKey(this.values());
    this.open.set(true);
  }

  /**
   * O botão do ateliê: a mesma arte com um rascunho guardado (a mesma obra, o widget com o mesmo desenho) pergunta
   * antes se é para continuar o rascunho (D9). O rascunho desta folha (depois de um Salvar do ateliê) não pergunta:
   * o desenho dela já é o dele.
   */
  protected async startStudio(): Promise<void> {
    if (this.asking) return;
    const t = this.draft();
    const name = t?.title ? `“${t.title}”` : t?.origin.kind === 'obra' ? 'Esta pixel art' : 'Este desenho';
    this.asking = true;
    try {
      const d = t && !this.carried() ? await askDraft(this.confirm, this.drafts, this.toasts, sameArt(t, this.values()), name) : null;
      if (!this.open()) this.openStudio(d);
    } finally {
      this.asking = false;
    }
  }
  /** A pergunta "Continuar o rascunho?" está aberta: outro clique não faz outra. */
  private asking = false;

  /** O rascunho desta folha (o id), quando há um. */
  draftId(): string | null {
    return this.carried()?.id ?? null;
  }

  /**
   * A folha guardou o desenho (o rascunho sai), ou foi descartada (`undo`: sai com o aviso e o Desfazer, que o traz de
   * volta, porque ele pode ser um rascunho de antes, continuado aqui).
   */
  forgetDraft(undo = false): void {
    const id = this.draftId();
    this.carried.set(null);
    if (!id) return;
    const d = undo ? this.drafts.list().find((x) => x.id === id) : undefined;
    if (d) discardDraft(this.drafts, this.toasts, d);
    else void this.drafts.remove(id);
  }

  protected saved(r: StudioResult): void {
    if (r.draft) this.carried.set({ id: r.draft, base: this.carried()?.base ?? this.base ?? draftKey(this.values()) });
    this.changed.emit(r.values);
    if (this.layered()) this.stackChanged.emit(r.layers);
  }

  /** Descartou: o aviso com o Desfazer, que abre o ateliê de novo com o desenho descartado. */
  protected discarded(d: PixelDraft): void {
    offerUndoDiscard(this.toasts, this.drafts, d, (back) => {
      // com o ateliê aberto de novo, o descartado só volta para os rascunhos
      if (this.open()) return;
      this.openStudio(back);
    });
  }

  /** O ateliê fechou: o foco volta para o botão que o abre. */
  protected closed(): void {
    this.open.set(false);
    this.resume.set(null);
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('[data-campo="pixels"]')?.focus());
  }
}
