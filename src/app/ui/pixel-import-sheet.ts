import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { readPixelArt } from '../core/pixel-art';
import { FoundPixelArt } from '../core/pixel-gallery';
import { plural } from '../core/text';
import { BackdropClose } from './backdrop-close';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';
import { PixelThumb } from './pixel-thumb';

let uid = 0;

/**
 * Trazer das anotações (PLANO-PIXEL-ARTS.md, 6): as pixel arts que moram como widget no texto das anotações, numa
 * lista para escolher quais vão para a galeria. Cada uma com o desenho no xadrez, a legenda (que vira o nome) e a
 * anotação de onde vem; as que ainda não estão na galeria já vêm marcadas, e as que já estão (o mesmo desenho)
 * dizem isso e vêm desmarcadas. A ficha de fichário das folhas das Anotações (os arquivos de estilo dela).
 */
@Component({
  selector: 'app-pixel-import-sheet',
  imports: [BackdropClose, IconModule, Pin, PixelThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet ficha-lugar massa trazer" [attr.aria-labelledby]="id + '-t'" (close)="closed.emit()" (backdropClose)="close()">
      <div class="ficha cartolina" [style.--stock]="'var(--stock-branco)'" data-cor="branco">
        <app-pin class="pin" />
        <header class="head">
          <div class="titulos">
            <h2 [id]="id + '-t'">Trazer das anotações</h2>
            <p class="sub"><lucide-icon [img]="NoteIcon" [size]="14" aria-hidden="true" />{{ found().length === 1 ? '1 pixel art nas anotações' : found().length + ' pixel arts nas anotações' }}</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="body">
          <p class="vale">As marcadas vão para a galeria como obras novas, com a legenda de nome. A anotação continua como está.</p>
          <ul class="achadas" role="list">
            @for (f of found(); track f.key) {
              <li>
                <label class="achada" [class.ja]="f.inGallery">
                  <input type="checkbox" [checked]="chosen().has(f.key)" (change)="toggle(f.key)" />
                  <span class="desenho" aria-hidden="true"><app-pixel-thumb [art]="arts().get(f.key)!" /></span>
                  <span class="txt">
                    <span class="legenda" [class.sem]="!f.caption">{{ f.caption || 'Sem legenda' }}</span>
                    <span class="de">em {{ f.noteTitle || 'uma anotação sem título' }}</span>
                    @if (f.inGallery) {
                      <span class="ja-esta">Já está na galeria</span>
                    }
                  </span>
                </label>
              </li>
            }
          </ul>
        </div>

        <footer class="foot">
          <div class="fim">
            <button type="button" class="btn-quiet" (click)="close()">Cancelar</button>
            <button type="button" [class.btn-ink]="chosen().size > 0" [class.btn-quiet]="!chosen().size" class="aplicar" [disabled]="!chosen().size" (click)="bring()">
              {{ chosen().size ? 'Trazer ' + count() : 'Nenhuma marcada' }}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  `,
  styleUrls: ['./organize-sheet.scss', './bulk-edit-sheet.scss'],
  styles: `
    @use 'pixel-studio/xadrez' as x;

    .achadas {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .achada {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 3px;
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);

      &:hover {
        background: rgb(21 21 21 / 0.05);
      }

      input {
        flex: none;
        width: 20px;
        height: 20px;
        accent-color: var(--ink);
      }
    }
    .desenho {
      flex: none;
      display: grid;
      width: 52px;
      height: 52px;
      padding: 5px;
      box-sizing: border-box;
      border-radius: 2px;
      @include x.xadrez(8px);
      box-shadow: var(--campo-sombra);
    }
    .txt {
      display: grid;
      gap: 1px;
      min-width: 0;
    }
    .legenda {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .legenda.sem {
      font-weight: 600;
      font-style: italic;
      color: var(--ink-2);
    }
    .de {
      color: var(--ink-2);
      font-size: 0.9rem;
      overflow-wrap: anywhere;
    }
    .ja-esta {
      justify-self: start;
      margin-top: 2px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    .ja .desenho {
      opacity: 0.7;
    }
  `,
})
export class PixelImportSheet {
  readonly found = input.required<readonly FoundPixelArt[]>();
  /** As escolhidas, para a página pôr na galeria. */
  readonly brought = output<readonly FoundPixelArt[]>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly id = `pixel-trazer-${++uid}`;
  protected readonly NoteIcon = ICON.anotacoes;
  protected readonly CloseIcon = ICON.fechar;

  /** As marcadas: no começo, as que ainda não estão na galeria. */
  protected readonly chosen = signal<ReadonlySet<string>>(new Set());
  protected readonly count = computed(() => plural(this.chosen().size, 'pixel art', 'pixel arts'));

  constructor() {
    afterNextRender(() => {
      this.chosen.set(new Set(this.found().filter((f) => !f.inGallery).map((f) => f.key)));
      this.dialog().nativeElement.showModal();
    });
  }

  /** O desenho de cada achada, lido uma vez, para a miniatura. */
  protected readonly arts = computed(() => new Map(this.found().map((f) => [f.key, readPixelArt(f.art)])));

  protected toggle(key: string): void {
    this.chosen.update((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected bring(): void {
    const keys = this.chosen();
    this.brought.emit(this.found().filter((f) => keys.has(f.key)));
    this.close();
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
    else this.closed.emit();
  }
}
