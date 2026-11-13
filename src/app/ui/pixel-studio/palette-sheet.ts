import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { PALETTES, Palette, PaletteGroup, PaletteName, drawingInks, hasInk, inkOf, inkPaths, keptColors } from '../../core/pixel-art';
import { convertRows } from '../../core/pixel-tools';
import { fold } from '../../core/text';
import { BackdropClose } from '../backdrop-close';
import { ICON, IconModule } from '../icons';
import { Pin } from '../pin';

/** As seções da escolha, na ordem. */
const GROUPS: readonly { value: PaletteGroup; label: string }[] = [
  { value: 'murall', label: 'Do Murall' },
  { value: 'jogos', label: 'Dos jogos' },
  { value: 'artistas', label: 'Dos artistas' },
];

let uid = 0;

/**
 * A escolha da paleta do ateliê (PLANO-ATELIE.md, feature 5): a folha grande por cima, como a cartela de
 * ícones, com todas as paletas à vista em seções e a busca no alto. Cada uma mostra o desenho da pessoa já
 * pintado nela e as cores dela; com "Manter as cores do desenho", a prévia (e a troca) põe cada cor do
 * desenho na mais perto da paleta nova. Ela só escolhe (`picked`): quem troca é o ateliê.
 */
@Component({
  selector: 'app-palette-sheet',
  imports: [BackdropClose, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet paletas" [attr.aria-labelledby]="ids + '-titulo'" (close)="closed.emit()" (backdropClose)="close()" (keydown)="$event.stopPropagation()">
      <div class="ficha cartolina" style="--stock: var(--stock-branco)" data-cor="branco">
        <app-pin class="pin" />
        <header class="head">
          <div class="titulos">
            <h2 [id]="ids + '-titulo'">Paletas</h2>
            <p class="sub">Agora: {{ currentLabel() }} · {{ current().length }} {{ current().length === 1 ? 'cor' : 'cores' }}</p>
          </div>
          <button type="button" class="icon-btn" aria-label="Fechar sem trocar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>
        <div class="topo">
          <label class="busca">
            <lucide-icon class="lupa" [img]="SearchIcon" [size]="18" aria-hidden="true" />
            <span class="sr-only">Procurar paleta</span>
            <input #busca type="search" autocomplete="off" placeholder="Procurar: pico, terra, 16…" [value]="query()" (input)="query.set($any($event.target).value)" (keydown.escape)="onEscape($event)" />
          </label>
          <label class="chave" title="Cada cor do desenho vira a mais perto da paleta nova">
            <button type="button" role="switch" class="interruptor" [attr.aria-checked]="convert()" (click)="convert.set(!convert())">
              <span class="bolinha"></span>
            </button>
            <span class="chave-nome">Manter as cores do desenho</span>
          </label>
        </div>
        <div class="body">
          @for (g of sections(); track g.value) {
            <section class="secao" [attr.aria-labelledby]="ids + '-' + g.value">
              <h3 class="secao-nome" [id]="ids + '-' + g.value">{{ g.label }}</h3>
              <div class="cartoes">
                @for (p of g.items; track p.value) {
                  @let on = p.value === palette();
                  <button type="button" class="cartao" [class.agora]="on" [attr.aria-current]="on ? 'true' : null" [attr.aria-label]="p.label + ', ' + p.colors.length + ' cores' + (on ? ', a de agora' : '')" (click)="pick(p.value)">
                    <span class="cartao-arte" aria-hidden="true">
                      @if (inked()) {
                        @let pv = previews().get(p.value)!;
                        <svg [attr.viewBox]="'0 0 ' + w() + ' ' + h()" [style.aspect-ratio]="w() + ' / ' + h()" shape-rendering="crispEdges">
                          @for (path of pv.paths; track path.ink) {
                            <path [attr.d]="path.d" [attr.fill]="pv.inks[path.ink]" />
                          }
                        </svg>
                      } @else {
                        <span class="cartao-faixa">
                          @for (c of p.colors; track $index) {
                            <span [style.background]="c"></span>
                          }
                        </span>
                      }
                    </span>
                    <span class="cartao-nome">
                      {{ p.label }}
                      <span class="cartao-n">{{ p.colors.length }}</span>
                      @if (on) {
                        <span class="cartao-agora">Agora</span>
                      }
                    </span>
                    <span class="cartao-cores" aria-hidden="true">
                      @for (c of p.colors; track $index) {
                        <span [style.background]="c"></span>
                      }
                    </span>
                  </button>
                }
              </div>
            </section>
          } @empty {
            <p class="vazio">Nenhuma paleta com "{{ query() }}".</p>
          }
        </div>
      </div>
    </dialog>
  `,
  styleUrl: './palette-sheet.scss',
})
export class PaletteSheet {
  readonly rows = input.required<readonly string[]>();
  readonly w = input.required<number>();
  readonly h = input.required<number>();
  readonly palette = input.required<PaletteName>();
  readonly colors = input.required<Readonly<Record<number, string>>>();
  readonly picked = output<{ palette: PaletteName; convert: boolean }>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('busca');
  protected readonly ids = 'pal-' + ++uid;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly SearchIcon = ICON.buscar;
  protected readonly query = signal('');
  protected readonly convert = signal(false);

  protected readonly current = computed(() => drawingInks(this.palette(), this.colors()).slice(1));
  protected readonly currentLabel = computed(() => PALETTES.find((p) => p.value === this.palette())?.label ?? '');
  protected readonly inked = computed(() => hasInk(this.rows()));
  protected readonly sections = computed(() => {
    const q = fold(this.query().trim());
    const match = (p: Palette) => !q || fold(`${p.label} ${p.value} ${p.colors.length}`).includes(q);
    return GROUPS.map((g) => ({ ...g, items: PALETTES.filter((p) => p.group === g.value && p.value !== 'propria' && match(p)) })).filter((g) => g.items.length);
  });

  constructor() {
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      this.dialog().nativeElement.querySelector<HTMLElement>('.cartao.agora')?.scrollIntoView({ block: 'center' });
      this.search().nativeElement.focus();
    });
  }

  /** O desenho pintado em cada paleta (contado uma vez por mudança, não a cada letra da busca). */
  protected readonly previews = computed(() => new Map(PALETTES.filter((p) => p.value !== 'propria').map((p) => [p.value, this.preview(p.value)] as const)));

  /** O desenho pintado na paleta `p`: mantendo os números (as cores acrescentadas continuam) ou as cores. */
  private preview(p: PaletteName): { paths: ReturnType<typeof inkPaths>; inks: (string | null)[] } {
    if (this.convert()) {
      const to = drawingInks(p, {});
      return { paths: inkPaths(convertRows(this.rows(), drawingInks(this.palette(), this.colors()), to), 'pixel'), inks: inkOf(p, {}) };
    }
    return { paths: this.paths(), inks: inkOf(p, keptColors(this.palette(), p, this.colors())) };
  }

  private readonly paths = computed(() => inkPaths(this.rows(), 'pixel'));

  protected pick(p: PaletteName): void {
    this.picked.emit({ palette: p, convert: this.convert() });
    this.close();
  }

  /** O Esc na busca limpa antes de fechar. */
  protected onEscape(e: Event): void {
    if (!this.query()) return;
    e.preventDefault();
    this.query.set('');
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
    else this.closed.emit();
  }
}
