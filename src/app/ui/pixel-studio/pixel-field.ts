import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { DEFAULT_PALETTE, PALETTES, clampSide, gridOf, hasInk, inkCount, paletteWord, parseColors } from '../../core/pixel-art';
import { StoredLayer } from '../../core/pixel-layers';
import { WidgetValues } from '../../core/widgets';
import { ICON, IconModule } from '../icons';
import { PixelStudio, StudioResult } from './pixel-studio';
import { PixelThumb } from '../pixel-thumb';

/**
 * O desenho da pixel art na folha do widget (o campo `pixels`): uma linha só, como a escolha do ícone. A
 * miniatura do desenho (sem o xadrez, que é só do ateliê), a tela e as cores ("16 × 16 · 12 cores · Sweetie 16") e o botão de papel
 * que abre o ateliê (ui/pixel-studio/pixel-studio.ts) por cima de tudo. O desenho novo, ainda sem ponto
 * nenhum, já abre no ateliê. Sair do ateliê pergunta (PLANO-RASCUNHOS-PIXEL.md): o Salvar passa o desenho adiante
 * (`changed`), o Salvar como cópia também (`copied`, e quem usa faz a cópia), e o Descartar não passa nada.
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
      <button type="button" class="papel" data-campo="pixels" aria-haspopup="dialog" [attr.aria-describedby]="missing() ? ids() + '-falta' : null" (click)="open.set(true)">
        <lucide-icon [img]="BrushIcon" [size]="16" aria-hidden="true" />
        {{ inked() ? 'Abrir o ateliê' : 'Desenhar' }}
      </button>
    </div>
    @if (missing()) {
      <p class="falta-texto" [id]="ids() + '-falta'">Abra o ateliê e pinte pelo menos um ponto.</p>
    }
    @defer (when open()) {
      @if (open()) {
        <app-pixel-studio [values]="values()" [layered]="layered()" [stack]="stack()" [copy]="copyable()" (saved)="saved($event)" (copied)="copied.emit($event)" (closed)="closed()" />
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
  /** O ateliê saiu salvando: o desenho novo (os valores e, com `layered`, a pilha logo depois). */
  readonly changed = output<WidgetValues>();
  readonly stackChanged = output<StoredLayer[] | undefined>();
  /** O ateliê saiu salvando como cópia: quem usa guarda a cópia, e o desenho daqui fica como era. */
  readonly copied = output<StudioResult>();

  protected readonly EmptyIcon = ICON.pixelArt;
  protected readonly BrushIcon = ICON.editar;
  protected readonly open = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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
      if (this.autoOpen() && !this.inked()) this.open.set(true);
    });
  }

  /** Abre o ateliê por quem usa (o "Desenhar uma nova" da folha da galeria, na folha do widget). */
  openStudio(): void {
    this.open.set(true);
  }

  protected saved(r: StudioResult): void {
    this.changed.emit(r.values);
    if (this.layered()) this.stackChanged.emit(r.layers);
  }

  /** O ateliê fechou: o foco volta para o botão que o abre. */
  protected closed(): void {
    this.open.set(false);
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('[data-campo="pixels"]')?.focus());
  }
}
