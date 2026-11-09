import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, input, output, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { LABEL_MAX } from '../core/note-labels';
import type { NoteFolder } from '../core/folders';
import { plural } from '../core/text';
import type { FolderInfo } from '../core/wall-view';
import { ICON, IconModule } from './icons';

/** A inclinação de cada uma das cartolinas que aparecem por cima da pasta (a de trás, a do meio, a da frente). */
const SLIP_TILTS = ['-3.5deg', '2.5deg', '-1deg'];
/** Quantos avisos de nome repetido já nasceram (o id de cada um). */
let hints = 0;

/**
 * Uma pasta das anotações na parede (PLANO-PASTAS.md, 4.2): uma pasta manilha em pé, com as cartolinas de
 * até três anotações de dentro aparecendo por cima, o nome a marcador e o número na frente. Tocar abre a
 * pasta. Na Lista, uma linha do índice; na Visão geral, pequena. Quem usa decide onde ela fica e o que abrir
 * (a parede do seu Murall e a de quem você visita usam a mesma).
 */
@Component({
  selector: 'app-folder-card',
  imports: [IconModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.pasta-em-lista]': 'row()', '[class.pasta-pequena]': 'small()', '[attr.data-pasta]': 'folder().id' },
  template: `
    @if (naming()) {
      <!-- dando nome: o campo na própria pasta, já escrito e selecionado (PLANO-PASTAS.md, 4.6) -->
      <div [class]="row() ? 'linha-botao nomeando' : 'pasta nomeando'">
        @if (row()) {
          <lucide-icon class="linha-icone" [img]="FolderIcon" [size]="17" aria-hidden="true" />
        } @else {
          <ng-container [ngTemplateOutlet]="papel" />
        }
        <span [class]="row() ? 'linha-campo' : 'frente'">
          <input
            #campo
            class="nome-campo"
            type="text"
            [value]="folder().name"
            [attr.maxlength]="max"
            aria-label="Nome da pasta"
            [attr.aria-describedby]="clash() ? hintId : null"
            enterkeyhint="done"
            autocomplete="off"
            (input)="draft.emit(campo.value)"
            (keydown.enter)="$event.preventDefault(); finish(campo.value)"
            (keydown.escape)="$event.preventDefault(); finish(null)"
            (blur)="finish(campo.value)"
          />
          @if (clash(); as other) {
            <span class="qtd aviso" [id]="hintId">Já existe {{ other }} aqui · Enter junta as duas</span>
          } @else if (!row()) {
            <span class="qtd">{{ countLine() }}</span>
          }
        </span>
      </div>
    } @else if (row()) {
      <button type="button" class="linha-botao" [attr.aria-label]="spoken()" (click)="opened.emit(folder().id)">
        <lucide-icon class="linha-icone" [img]="FolderIcon" [size]="17" aria-hidden="true" />
        <span class="linha-nome">{{ folder().name }}</span>
        <span class="linha-qtd">{{ countLine() }}</span>
        <lucide-icon class="linha-seta" [img]="OpenIcon" [size]="16" aria-hidden="true" />
      </button>
    } @else {
      <button type="button" class="pasta" [attr.aria-label]="spoken()" (click)="opened.emit(folder().id)">
        <ng-container [ngTemplateOutlet]="papel" />
        <span class="frente">
          <span class="nome">{{ folder().name }}</span>
          <span class="qtd">{{ countLine() }}</span>
        </span>
      </button>
    }

    <!-- o fundo da pasta com a aba e as cartolinas de dentro -->
    <ng-template #papel>
      <span class="fundo" aria-hidden="true"></span>
      <span class="tiras" aria-hidden="true">
        @for (s of info().stocks; track $index) {
          <i [style.--c]="'var(--stock-' + s + ')'" [style.--r]="tilts[$index]"></i>
        }
      </span>
    </ng-template>
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
  /** Dando nome à pasta (a nova, ou Renomear no menu): o campo na própria pasta. */
  readonly naming = input(false);
  /** O nome de uma irmã com o mesmo nome do que está escrito (o Enter junta as duas), ou null. */
  readonly clash = input<string | null>(null);
  /** O que está escrito no campo, a cada letra (para quem usa ver se repete uma irmã). */
  readonly draft = output<string>();
  /** Acabou de dar nome: o nome (Enter, ou o foco saiu), ou null (Esc: fica como estava). */
  readonly named = output<string | null>();

  protected readonly max = LABEL_MAX;
  protected readonly hintId = `pasta-aviso-${++hints}`;
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('campo');
  /** O nome já foi dado (o Enter e o foco que sai logo depois não dão duas vezes). */
  private done = false;

  constructor() {
    // o campo aparece com o nome selecionado: digitar troca
    afterRenderEffect(() => {
      const el = this.field()?.nativeElement;
      if (!el || el === document.activeElement) return;
      this.done = false;
      el.focus({ preventScroll: true });
      el.select();
      el.scrollIntoView({ block: 'nearest' });
    });
  }

  protected finish(value: string | null): void {
    if (this.done) return;
    this.done = true;
    this.named.emit(value);
  }

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
