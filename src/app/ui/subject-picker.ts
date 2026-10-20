import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';
import { ICON, IconModule } from './icons';
import { fold } from '../core/review';
import { LABEL_MAX, SubjectEntry, cleanSubject } from '../core/note-labels';
import { roveRadios } from './focus';

/**
 * O assunto da anotação (no editor, a parte Assunto; na folha do quadro, a linha Assunto): os assuntos
 * do grupo dela, impressos em tinta como no filtro da pasta (o escolhido com o traço de marca-texto), e
 * a busca que filtra e cria. Um só: tocar escolhe; "Sem assunto" tira. Os assuntos são do grupo (os
 * criados nas configurações do mural primeiro, depois os usados; ver `subjectLibrary`).
 */
@Component({
  selector: 'app-subject-picker',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="campo">
      <lucide-icon class="lupa" [img]="SearchIcon" [size]="18" aria-hidden="true" />
      <span class="sr-only">Buscar ou criar assunto</span>
      <input
        type="text"
        autocomplete="off"
        enterkeyhint="done"
        [maxLength]="max"
        placeholder="Buscar ou criar assunto"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        (keydown.enter)="$event.preventDefault(); enter()"
      />
    </label>
    <div class="ops" role="radiogroup" aria-label="Assunto da anotação" (keydown)="rove($event)">
      @if (!query().trim()) {
        <button type="button" role="radio" class="op nenhum" [attr.aria-checked]="!subject()" (click)="choose(null)">Sem assunto</button>
      }
      @for (s of shown(); track s.key) {
        <button type="button" role="radio" class="op" [attr.aria-checked]="s.on" (click)="choose(s.label)">
          <span class="nome">{{ s.label }}</span>
          @if (s.n) {
            <span class="n" aria-hidden="true">{{ s.n }}</span>
          }
        </button>
      }
      @if (fresh(); as f) {
        <button type="button" class="op criar" (click)="choose(f)">
          <lucide-icon [img]="PlusIcon" [size]="16" aria-hidden="true" />
          Criar “{{ f }}”
        </button>
      }
    </div>
    @if (!subjects().length && !subject() && !query().trim()) {
      <p class="dica">{{ group() ? group() + ' ainda não tem assuntos.' : 'Ainda não há assuntos sem grupo.' }} Escreva um para criar.</p>
    }
  `,
  styleUrl: './subject-picker.scss',
})
export class SubjectPicker {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly subject = model<string | null>(null);
  /** Os assuntos do grupo da anotação (ver `subjectLibrary`). */
  readonly subjects = input<readonly SubjectEntry[]>([]);
  /** O nome do grupo, para a dica do vazio (null: sem grupo). */
  readonly group = input<string | null>(null);

  protected readonly max = LABEL_MAX;
  protected readonly SearchIcon = ICON.buscar;
  protected readonly PlusIcon = ICON.adicionar;
  protected readonly query = signal('');
  protected readonly rove = roveRadios;

  /** Os assuntos, com o escolhido (mesmo que de outro grupo) e os que batem com a busca (os que começam com ela primeiro). */
  protected readonly shown = computed(() => {
    const chosen = this.subject();
    const all = new Map<string, { label: string; n: number }>();
    for (const s of this.subjects()) all.set(fold(s.label), { label: s.label, n: s.n });
    // o escolhido fica no lugar dele (nada anda debaixo do dedo); o de fora da lista, no fim
    if (chosen && !all.has(fold(chosen))) all.set(fold(chosen), { label: chosen, n: 0 });
    const q = fold(cleanSubject(this.query()));
    let list = [...all.entries()];
    if (q) list = [...list.filter(([k]) => k.startsWith(q)), ...list.filter(([k]) => !k.startsWith(q) && k.includes(q))];
    return list.map(([key, e]) => ({ key, label: e.label, n: e.n, on: !!chosen && fold(chosen) === key }));
  });

  /** O escrito, quando ainda não é nenhum assunto: "Criar “Geografia”". */
  protected readonly fresh = computed(() => {
    const name = cleanSubject(this.query());
    return name && !this.shown().some((s) => s.key === fold(name)) ? name : null;
  });

  /** Enter: o primeiro que bate com a busca, ou o assunto novo. */
  protected enter(): void {
    const first = this.query().trim() ? this.shown()[0] : null;
    const name = first?.label ?? this.fresh();
    if (name) this.choose(name);
  }

  protected choose(label: string | null): void {
    this.subject.set(label);
    this.query.set('');
  }

  /** O foco vai para a busca (ao abrir a parte). */
  focus(): void {
    this.host.nativeElement.querySelector<HTMLInputElement>('input')?.focus();
  }
}
