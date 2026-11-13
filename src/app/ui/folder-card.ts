import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, input, output, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { LABEL_MAX } from '../core/note-labels';
import type { NoteFolder } from '../core/folders';
import { plural } from '../core/text';
import type { FolderInfo } from '../core/wall-view';
import { MiniCartolina } from './mini-cartolina';
import { NearScreen } from './near-screen';

/** Quantos avisos de nome repetido já nasceram (o id de cada um). */
let hints = 0;

/**
 * Uma pasta das anotações na parede (PLANO-PASTAS.md, 4.2): uma pasta manilha em pé, com até três das
 * anotações de dentro espiando pela boca em miniatura (a cartolina com o título, ou a foto da capa, de papel,
 * sem o plástico das pastas dos murais do perfil), o nome a marcador e o número na frente. Com o mouse em cima, a frente abre e as
 * miniaturas sobem uma depois da outra. Tocar abre a pasta. É a mesma pasta, do mesmo tamanho, em todas as
 * vistas; quem usa decide onde ela fica e o que abrir (a parede do seu Murall e a de quem você visita usam
 * a mesma).
 */
@Component({
  selector: 'app-folder-card',
  imports: [MiniCartolina, NearScreen, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-pasta]': 'folder().id' },
  template: `
    @if (naming()) {
      <!-- dando nome: o campo na própria pasta, já escrito e selecionado (PLANO-PASTAS.md, 4.6) -->
      <div class="pasta nomeando">
        <ng-container [ngTemplateOutlet]="papel" />
        <span class="frente">
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
          } @else {
            <span class="qtd">{{ countLine() }}</span>
          }
        </span>
      </div>
    } @else {
      <button type="button" class="pasta" [attr.aria-label]="spoken()" (click)="opened.emit(folder().id)">
        <ng-container [ngTemplateOutlet]="papel" />
        <span class="frente">
          <span class="nome">{{ folder().name }}</span>
          <span class="qtd">{{ countLine() }}</span>
        </span>
      </button>
    }

    <!-- o fundo da pasta com a aba, e as anotações de dentro espiando pela boca -->
    <ng-template #papel>
      <span class="fundo" aria-hidden="true"></span>
      <!-- cada uma de papel, sem o plástico das capas do perfil: a cartolina com o título, ou a foto da capa
           (a que não carrega volta à cartolina); a cartolina tem o desenho do papel, então só monta perto da tela -->
      <span class="boca" aria-hidden="true" [style.--vistas]="info().peek.length" appPerto #perto="perto">
        @for (r of perto.near() ? info().peek : []; track r.id; let j = $index) {
          <span class="espia" [style.--j]="j">
            @if (r.game.coverUrl && !broken().has(r.game.coverUrl)) {
              <img [src]="r.game.coverUrl" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" (error)="lost(r.game.coverUrl)" />
            } @else {
              <app-mini-cartolina [review]="r" />
            }
          </span>
        }
      </span>
    </ng-template>
  `,
  styleUrl: './folder-card.scss',
})
export class FolderCard {
  readonly folder = input.required<NoteFolder>();
  readonly info = input<FolderInfo>({ notes: 0, folders: 0, peek: [] });
  /** O que mora na pasta, no singular e no plural: as notas, ou os recortes da Wishlist. */
  readonly units = input<readonly [string, string]>(['nota', 'notas']);
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

  /** As capas que não carregaram: a miniatura volta à cartolina. */
  protected readonly broken = signal<ReadonlySet<string>>(new Set());
  protected lost(url: string): void {
    this.broken.update((s) => new Set(s).add(url));
  }

  protected finish(value: string | null): void {
    if (this.done) return;
    this.done = true;
    this.named.emit(value);
  }

  /** "4 notas · 2 pastas", "1 nota", "Vazia". */
  protected readonly countLine = computed(() => {
    const { notes, folders } = this.info();
    const parts = [notes ? plural(notes, ...this.units()) : '', folders ? plural(folders, 'pasta', 'pastas') : ''].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Vazia';
  });
  /** O que o leitor de tela ouve: "Pasta Programação, 4 notas e 2 pastas". */
  protected readonly spoken = computed(() => {
    const { notes, folders } = this.info();
    const parts = [notes ? plural(notes, ...this.units()) : '', folders ? plural(folders, 'pasta', 'pastas') : ''].filter(Boolean);
    return `Pasta ${this.folder().name}, ${parts.length ? parts.join(' e ') : 'vazia'}`;
  });
}
