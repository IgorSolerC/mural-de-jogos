import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LayoutGrid, LucideAngularModule, PenLine, RefreshCw, Trash2, UserPlus } from 'lucide-angular';
import { Colleague } from '../../core/colleague-store';

const exportedFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Os crachás de "OLÁ, EU SOU": você de um lado, o colega do outro, escrito a pincel. O nome do
 * colega se corrige no próprio crachá; os outros colegas ficam em crachás pequenos ao lado, e as
 * ações do backup (atualizar, tirar) moram embaixo, discretas, na parede.
 */
@Component({
  selector: 'app-name-tags',
  imports: [LucideAngularModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="crachas">
      <div class="cracha voce">
        <span class="faixa" aria-hidden="true">Olá, eu sou</span>
        <span class="nome">Você</span>
      </div>
      <span class="versus" aria-hidden="true">×</span>
      <div class="cracha colega" [class.editando]="editing()">
        <span class="faixa" aria-hidden="true">Olá, eu sou</span>
        @if (editing()) {
          <form class="nome-form" (submit)="$event.preventDefault(); save()">
            <label class="sr-only" for="colega-nome">Nome do colega</label>
            <input
              #campo
              id="colega-nome"
              class="nome"
              type="text"
              maxlength="60"
              autocomplete="off"
              enterkeyhint="done"
              [value]="colleague().name"
              [disabled]="busy()"
              (keydown.escape)="$event.preventDefault(); editing.set(false)"
              (blur)="save()"
            />
          </form>
        } @else {
          <button type="button" class="nome" (click)="editing.set(true)" [attr.aria-label]="'Renomear ' + colleague().name">
            <span class="nome-txt">{{ colleague().name }}</span>
            <lucide-icon class="lapis" [img]="PenIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
          </button>
        }
      </div>

      @if (others().length) {
        <div class="outros" role="group" aria-label="Comparar com outro colega">
          @for (c of others(); track c.id; let i = $index) {
            <button type="button" class="mini" [style.--i]="i" [disabled]="busy()" (click)="selected.emit(c.id)">
              <span class="faixa" aria-hidden="true">Olá, eu sou</span>
              <span class="mini-nome">{{ c.name }}</span>
            </button>
          }
        </div>
      }
    </div>

    <div class="gaveta">
      <p class="giz">{{ meta() }}</p>
      <div class="acoes">
        <a class="btn-quiet ver-mural" routerLink="/comparar/mural">
          <lucide-icon [img]="WallIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
          Ver o mural de {{ colleague().name }}
        </a>
        <button type="button" class="btn-quiet" [disabled]="busy()" (click)="arquivo.click()">
          <lucide-icon [img]="RefreshIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
          Atualizar backup
        </button>
        <button type="button" class="btn-quiet" [disabled]="busy()" (click)="added.emit()">
          <lucide-icon [img]="AddIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
          Outro colega
        </button>
        <button type="button" class="btn-quiet" [disabled]="busy()" (click)="removed.emit()" [attr.aria-label]="'Tirar ' + colleague().name + ' da comparação'">
          <lucide-icon [img]="TrashIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
          Tirar da comparação
        </button>
      </div>
      <input #arquivo hidden type="file" accept=".json,.gz,application/json,application/gzip" (change)="pick($event)" />
    </div>
  `,
  styleUrl: './name-tags.scss',
})
export class NameTags {
  readonly colleague = input.required<Colleague>();
  readonly colleagues = input.required<readonly Colleague[]>();
  readonly busy = input(false);
  /** Recém-chegado: o crachá já abre pedindo o nome. */
  readonly naming = input(false);

  readonly selected = output<string>();
  readonly renamed = output<string>();
  readonly replaced = output<File>();
  readonly added = output<void>();
  readonly removed = output<void>();

  protected readonly PenIcon = PenLine;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly AddIcon = UserPlus;
  protected readonly TrashIcon = Trash2;
  protected readonly WallIcon = LayoutGrid;

  protected readonly editing = linkedSignal(() => this.naming() && !!this.colleague());
  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  protected readonly others = computed(() => this.colleagues().filter((c) => c.id !== this.colleague().id));

  /** "Backup de 29 de set. de 2026 · 124 resenhas · 2 registros com defeito ficaram de fora". */
  protected readonly meta = computed(() => {
    const c = this.colleague();
    const parts = [
      c.exportedAt ? `Backup de ${exportedFmt.format(new Date(c.exportedAt))}` : `Arquivo ${c.fileName}`,
      `${c.reviews.length} ${c.reviews.length === 1 ? 'resenha' : 'resenhas'} em todos os murais`,
    ];
    if (c.skipped) parts.push(`${c.skipped} ${c.skipped === 1 ? 'registro com defeito ficou' : 'registros com defeito ficaram'} de fora`);
    return parts.join(' · ');
  });

  constructor() {
    // o campo aparece já com o nome selecionado, pronto para trocar
    effect(() => {
      const el = this.campo()?.nativeElement;
      if (el) {
        el.focus();
        el.select();
      }
    });
  }

  protected save(): void {
    if (!this.editing()) return;
    const value = this.campo()?.nativeElement.value.trim() ?? '';
    this.editing.set(false);
    if (value && value !== this.colleague().name) this.renamed.emit(value);
  }

  protected pick(event: Event): void {
    const el = event.target as HTMLInputElement;
    const f = el.files?.[0];
    el.value = '';
    if (f) this.replaced.emit(f);
  }
}
