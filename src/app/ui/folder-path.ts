import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, viewChild } from '@angular/core';
import type { NoteFolder } from '../core/folders';
import { ContextMenu, MenuItem } from './context-menu';
import { ICON, IconModule } from './icons';

/**
 * O caminho da pasta aberta, na primeira linha da pasta manilha da barra (PLANO-PASTAS.md, 4.1): a seta
 * sobe uma pasta, e cada pedaço ("Estudos › Programação › Funcional") volta até ele; o último é onde se
 * está, sem link. No celular, com mais de um pedaço no meio, eles viram "…", que abre um menu com eles.
 * Só aparece dentro de uma pasta (na raiz, a orelha aberta já diz o grupo). O seu Murall e o de quem você
 * visita usam a mesma; quem usa diz para onde ir.
 */
@Component({
  selector: 'app-folder-path',
  imports: [ContextMenu, IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="caminho" aria-label="Caminho da pasta">
      <button type="button" class="tinta so-icone subir" [attr.aria-label]="'Subir para ' + upName()" [title]="'Subir para ' + upName()" (click)="go.emit(upId())">
        <lucide-icon [img]="BackIcon" [size]="18" aria-hidden="true" />
      </button>
      <ol class="migalhas" [class.encolhe]="middle().length > 1">
        <li>
          <button type="button" class="migalha" (click)="go.emit(null)">{{ group() }}</button>
        </li>
        @if (middle().length > 1) {
          <li class="reticencias">
            <lucide-icon class="sep" [img]="SepIcon" [size]="15" aria-hidden="true" />
            <button #mais type="button" class="migalha" aria-haspopup="menu" [attr.aria-label]="'Mais ' + middle().length + ' pastas no caminho'" (click)="openMiddle($event)"><lucide-icon [img]="MoreIcon" [size]="18" aria-hidden="true" /></button>
          </li>
        }
        @for (f of middle(); track f.id) {
          <li class="meio">
            <lucide-icon class="sep" [img]="SepIcon" [size]="15" aria-hidden="true" />
            <button type="button" class="migalha" (click)="go.emit(f.id)">{{ f.name }}</button>
          </li>
        }
        @if (here(); as f) {
          <li>
            <lucide-icon class="sep" [img]="SepIcon" [size]="15" aria-hidden="true" />
            <span class="migalha aqui" aria-current="location" tabindex="-1">{{ f.name }}</span>
          </li>
        }
      </ol>
    </nav>
    <app-context-menu #menu caption="Pastas no caminho" [sections]="[middleItems()]" />
  `,
  styleUrl: './folder-path.scss',
})
export class FolderPath {
  /** O nome do grupo (o começo do caminho). */
  readonly group = input.required<string>();
  /** As pastas da raiz até a aberta (ela incluída). */
  readonly path = input.required<readonly NoteFolder[]>();
  /** Tocou num pedaço: a pasta (o id), ou a raiz do grupo (null). */
  readonly go = output<string | null>();

  protected readonly BackIcon = ICON.voltar;
  protected readonly SepIcon = ICON.proximo;
  protected readonly MoreIcon = ICON.maisOpcoes;
  private readonly menu = viewChild<ContextMenu>('menu');
  private readonly more = viewChild<ElementRef<HTMLButtonElement>>('mais');

  /** Onde se está. */
  protected readonly here = computed(() => this.path().at(-1) ?? null);
  /** Os pedaços entre o grupo e onde se está. */
  protected readonly middle = computed(() => this.path().slice(0, -1));
  /** A de cima (null: a raiz do grupo). */
  protected readonly upId = computed(() => this.path().at(-2)?.id ?? null);
  protected readonly upName = computed(() => this.path().at(-2)?.name ?? this.group());
  protected readonly middleItems = computed<MenuItem[]>(() =>
    this.middle().map((f) => ({ id: f.id, label: f.name, icon: ICON.pastaDeNotas, run: () => this.go.emit(f.id) })),
  );

  /** O "…" do celular: o menu com os pedaços do meio, embaixo dele. */
  protected openMiddle(e: MouseEvent): void {
    const button = this.more()?.nativeElement;
    const menu = this.menu();
    if (!button || !menu) return;
    if (menu.isOpenFor('meio')) {
      menu.close(true);
      return;
    }
    const r = button.getBoundingClientRect();
    menu.show({ key: 'meio', x: r.left, y: r.bottom + 4, back: button, by: e.detail === 0 ? 'teclado' : 'mouse' });
  }
}
