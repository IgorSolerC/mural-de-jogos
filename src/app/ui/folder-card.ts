import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { NoteFolder } from '../core/folders';
import { plural } from '../core/text';
import type { FolderInfo } from '../core/wall-view';
import { ICON, IconModule } from './icons';

/** A inclinação de cada uma das cartolinas que aparecem por cima da pasta (a de trás, a do meio, a da frente). */
const SLIP_TILTS = ['-3.5deg', '2.5deg', '-1deg'];

/**
 * Uma pasta das anotações na parede (PLANO-PASTAS.md, 4.2): uma pasta manilha em pé, com as cartolinas de
 * até três anotações de dentro aparecendo por cima, o nome a marcador e o número na frente. Tocar abre a
 * pasta. Na Lista, uma linha do índice; na Visão geral, pequena. Quem usa decide onde ela fica e o que abrir
 * (a parede do seu Murall e a de quem você visita usam a mesma).
 */
@Component({
  selector: 'app-folder-card',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.pasta-em-lista]': 'row()', '[class.pasta-pequena]': 'small()', '[attr.data-pasta]': 'folder().id' },
  template: `
    @if (row()) {
      <button type="button" class="linha-botao" [attr.aria-label]="spoken()" (click)="opened.emit(folder().id)">
        <lucide-icon class="linha-icone" [img]="FolderIcon" [size]="17" aria-hidden="true" />
        <span class="linha-nome">{{ folder().name }}</span>
        <span class="linha-qtd">{{ countLine() }}</span>
        <lucide-icon class="linha-seta" [img]="OpenIcon" [size]="16" aria-hidden="true" />
      </button>
    } @else {
      <button type="button" class="pasta" [attr.aria-label]="spoken()" (click)="opened.emit(folder().id)">
        <span class="fundo" aria-hidden="true"></span>
        <span class="tiras" aria-hidden="true">
          @for (s of info().stocks; track $index) {
            <i [style.--c]="'var(--stock-' + s + ')'" [style.--r]="tilts[$index]"></i>
          }
        </span>
        <span class="frente">
          <span class="nome">{{ folder().name }}</span>
          <span class="qtd">{{ countLine() }}</span>
        </span>
      </button>
    }
  `,
  styleUrl: './folder-card.scss',
})
export class FolderCard {
  readonly folder = input.required<NoteFolder>();
  readonly info = input<FolderInfo>({ notes: 0, folders: 0, stocks: [] });
  /** Na Lista: uma linha do índice. */
  readonly row = input(false);
  /** Na Visão geral: a pasta pequena, como as fichinhas. */
  readonly small = input(false);
  /** Tocou: abrir a pasta (o id). */
  readonly opened = output<string>();

  protected readonly FolderIcon = ICON.pastaDeNotas;
  protected readonly OpenIcon = ICON.proximo;
  protected readonly tilts = SLIP_TILTS;

  /** "4 notas · 2 pastas", "1 nota", "Vazia". */
  protected readonly countLine = computed(() => {
    const { notes, folders } = this.info();
    const parts = [notes ? plural(notes, 'nota', 'notas') : '', folders ? plural(folders, 'pasta', 'pastas') : ''].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Vazia';
  });
  /** O que o leitor de tela ouve: "Pasta Programação, 4 notas e 2 pastas". */
  protected readonly spoken = computed(() => {
    const { notes, folders } = this.info();
    const parts = [notes ? plural(notes, 'nota', 'notas') : '', folders ? plural(folders, 'pasta', 'pastas') : ''].filter(Boolean);
    return `Pasta ${this.folder().name}, ${parts.length ? parts.join(' e ') : 'vazia'}`;
  });
}
