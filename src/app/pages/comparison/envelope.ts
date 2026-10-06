import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { LucideAngularModule, Upload, X } from 'lucide-angular';

/**
 * O envelope pardo pregado no mural: é por ele que o backup do colega chega. A carta aparece na
 * boca do envelope e sobe quando um arquivo passa por cima; soltar o arquivo ou tocar no botão abre.
 */
@Component({
  selector: 'app-backup-envelope',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.chegando]': 'over()',
    '[class.abrindo]': 'busy()',
    '(dragenter)': 'enter($event)',
    '(dragover)': 'enter($event)',
    '(dragleave)': 'leave($event)',
    '(drop)': 'drop($event)',
  },
  template: `
    <div class="aba" aria-hidden="true"></div>
    <div class="carta" aria-hidden="true">
      @if (withCode()) {
        <p>Oi! Meu código é K7QF-M2XA.</p>
      } @else {
        <p>Oi! Segue o meu mural.</p>
      }
      <p>Bora ver quem tem razão?</p>
    </div>
    <div class="bolso">
      <span class="selo" aria-hidden="true"><span>Meu<br />Mural</span></span>
      <span class="carimbo" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <defs><path id="carimbo-arco" d="M50 50 m-34 0 a34 34 0 1 1 68 0 a34 34 0 1 1 -68 0" /></defs>
          <circle cx="50" cy="50" r="44" />
          <circle cx="50" cy="50" r="24" />
          <text><textPath href="#carimbo-arco" startOffset="3%">COMPARAR · MURAIS · COMPARAR ·</textPath></text>
        </svg>
      </span>

      <h2 [id]="titleId">{{ again() ? 'Mais um colega?' : 'Chegou o mural de alguém?' }}</h2>
      @if (withCode()) {
        <p class="convite">
          Digite o código que a pessoa mandou, ou solte aqui o arquivo de backup dela. As resenhas dela ficam guardadas à
          parte: nada se mistura com os seus cards.
        </p>
        <form class="pelo-codigo" (submit)="submitCode($event)">
          <label class="sr-only" [for]="codeId">Código do mural</label>
          <input
            [id]="codeId"
            name="codigo"
            type="text"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            maxlength="11"
            placeholder="K7QF-M2XA"
            [value]="typed()"
            (input)="typed.set($any($event.target).value)"
            [attr.aria-invalid]="!!codeError()"
            [attr.aria-describedby]="codeError() ? codeId + '-erro' : null"
          />
          <button type="submit" class="btn-ink" [disabled]="codeBusy() || !typed().trim()">
            {{ codeBusy() ? 'Abrindo…' : 'Abrir o mural' }}
          </button>
        </form>
        @if (codeError()) {
          <p class="erro" [id]="codeId + '-erro'" role="alert">{{ codeError() }}</p>
        }
        <div class="acoes ou-arquivo">
          <span class="ou" aria-hidden="true">ou</span>
          <button type="button" class="btn-arquivo" [disabled]="busy()" (click)="file.click()">
            <lucide-icon [img]="UploadIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
            {{ busy() ? 'Abrindo o envelope…' : 'Escolher o backup' }}
          </button>
          @if (again()) {
            <button type="button" class="btn-quiet" (click)="cancel.emit()">
              <lucide-icon [img]="CloseIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
              Deixar pra depois
            </button>
          }
        </div>
        <p class="miudo">
          O código fica em Ajustes › Perfil, no Meu Mural da pessoa. O arquivo é o .json ou .json.gz baixado em Ajustes.
        </p>
      } @else {
        <p class="convite">
          Solte aqui o backup que seu colega mandou, ou escolha o arquivo. As resenhas dele ficam
          guardadas à parte: nada se mistura com os seus cards.
        </p>
        <div class="acoes">
          <button type="button" class="btn-ink" [disabled]="busy()" (click)="file.click()" [attr.aria-describedby]="titleId">
            <lucide-icon [img]="UploadIcon" [size]="20" [strokeWidth]="2.6" aria-hidden="true" />
            {{ busy() ? 'Abrindo o envelope…' : 'Escolher o backup' }}
          </button>
          @if (again()) {
            <button type="button" class="btn-quiet" (click)="cancel.emit()">
              <lucide-icon [img]="CloseIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
              Deixar pra depois
            </button>
          }
        </div>
        <p class="miudo">Arquivo .json ou .json.gz baixado em Ajustes do Meu Mural. Fica só neste navegador.</p>
      }
      @if (error()) {
        <p class="erro" role="alert">{{ error() }}</p>
      }
      <input #file hidden type="file" accept=".json,.gz,application/json,application/gzip" (change)="pick($event)" />
    </div>
  `,
  styleUrl: './envelope.scss',
})
export class BackupEnvelope {
  readonly busy = input(false);
  readonly error = input('');
  /** Já existe um colega: o envelope é para mais um, e dá para desistir. */
  readonly again = input(false);
  readonly file = output<File>();
  readonly cancel = output<void>();
  /** Com a nuvem ligada: o campo do código vem primeiro, e o arquivo vira a segunda opção. */
  readonly withCode = input(false);
  readonly codeBusy = input(false);
  readonly codeError = input('');
  /** O código digitado, ao tocar em "Abrir o mural". */
  readonly code = output<string>();
  protected readonly typed = signal('');

  protected readonly over = signal(false);
  protected readonly UploadIcon = Upload;
  protected readonly CloseIcon = X;
  protected readonly titleId = `envelope-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly codeId = `${this.titleId}-codigo`;

  protected submitCode(e: Event): void {
    e.preventDefault();
    const value = this.typed().trim();
    if (value && !this.codeBusy()) this.code.emit(value);
  }

  /** Limpa o campo (depois que o mural chegou). */
  clearCode(): void {
    this.typed.set('');
  }
  protected pick(event: Event): void {
    const el = event.target as HTMLInputElement;
    const f = el.files?.[0];
    el.value = '';
    if (f) this.file.emit(f);
  }

  protected enter(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes('Files') || this.busy()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    this.over.set(true);
  }

  protected leave(e: DragEvent): void {
    // sair para um filho não é sair do envelope
    if (e.relatedTarget instanceof Node && (e.currentTarget as Node).contains(e.relatedTarget)) return;
    this.over.set(false);
  }

  protected drop(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    this.over.set(false);
    const f = e.dataTransfer.files[0];
    if (f && !this.busy()) this.file.emit(f);
  }
}
