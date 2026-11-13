import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { DEFAULT_PALETTE, PALETTES, clampSide, gridOf, hasInk, inkCount, inkOf, inkPaths, paletteWord, parseColors } from '../../core/pixel-art';
import { WidgetValues } from '../../core/widgets';
import { ICON, IconModule } from '../icons';
import { PixelStudio } from './pixel-studio';

/**
 * O desenho da pixel art na folha do widget (o campo `pixels`): uma linha só, como a escolha do ícone. A
 * miniatura do desenho no xadrez, a tela e as cores ("16 × 16 · 12 cores · Sweetie 16") e o botão de papel
 * que abre o ateliê (ui/pixel-studio/pixel-studio.ts) por cima de tudo. O desenho novo, ainda sem ponto
 * nenhum, já abre no ateliê. O ateliê manda as mudanças na hora; esta linha só passa adiante (`changed`).
 */
@Component({
  selector: 'app-pixel-field',
  imports: [IconModule, PixelStudio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let iw = w();
    @let ih = h();
    <div class="linha" [class.falta]="missing()">
      <span class="miniatura" aria-hidden="true">
        @if (inked()) {
          <svg [attr.viewBox]="'0 0 ' + iw + ' ' + ih" [style.aspect-ratio]="iw + ' / ' + ih" shape-rendering="crispEdges">
            @for (p of paths(); track p.ink) {
              <path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
            }
          </svg>
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
        <app-pixel-studio [values]="values()" (changed)="changed.emit($event)" (closed)="closed()" />
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
  readonly changed = output<WidgetValues>();

  protected readonly EmptyIcon = ICON.pixelArt;
  protected readonly BrushIcon = ICON.editar;
  protected readonly open = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly w = computed(() => clampSide(this.values()['width']));
  protected readonly h = computed(() => clampSide(this.values()['height']));
  private readonly palette = computed(() => paletteWord(this.values()['palette'] ?? '') ?? DEFAULT_PALETTE);
  private readonly colors = computed(() => parseColors(this.values()['colors'] ?? '') ?? {});
  private readonly rows = computed(() => gridOf(this.values()['pixels'] ?? '', this.w(), this.h()));
  protected readonly inks = computed(() => inkOf(this.palette(), this.colors()));
  protected readonly paths = computed(() => inkPaths(this.rows(), 'pixel'));
  protected readonly inked = computed(() => hasInk(this.rows()));
  protected readonly summary = computed(() => {
    const n = inkCount(this.palette(), this.colors());
    const label = PALETTES.find((p) => p.value === this.palette())?.label ?? '';
    return `${this.w()} × ${this.h()} · ${n} ${n === 1 ? 'cor' : 'cores'} · ${label}`;
  });

  constructor() {
    afterNextRender(() => {
      if (this.autoOpen() && !this.inked()) this.open.set(true);
    });
  }

  /** O ateliê fechou: o foco volta para o botão que o abre. */
  protected closed(): void {
    this.open.set(false);
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('[data-campo="pixels"]')?.focus());
  }
}
