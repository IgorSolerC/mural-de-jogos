import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, output, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { ME, PERSON_NAME_MAX, SpendingPerson } from '../core/spending';
import { SpendingStore } from '../core/spending-store';
import { BackdropClose } from './backdrop-close';
import { Confirm } from './confirm';
import { Pin } from './pin';

/**
 * Ajustar as pessoas dos gastos: o nome de cada uma e apagar (ela sai dos gastos dela; o que fica sem
 * ninguém volta a ser só seu). Você fica sempre, com o nome que quiser. Tudo vale na hora, como os
 * envelopes (a mesma folha, `spending-categories-sheet.scss`).
 */
@Component({
  selector: 'app-spending-people-sheet',
  imports: [BackdropClose, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet envelopes" aria-labelledby="gpe-titulo" (close)="closed.emit()" (backdropClose)="close()">
      <div class="ficha cartolina" style="--stock: var(--stock-verde)" data-cor="verde">
        <app-pin class="pin" color="#f4f4f0" />
        <header class="head">
          <div class="titulos">
            <h2 id="gpe-titulo">Pessoas</h2>
            <p class="sub">Com quem você gasta · vale na hora</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="body">
          <section class="grupo" aria-label="Pessoas">
            <p class="dica">Escreva <b>jantar 600 &#64;bruna</b> na linha de anotar, ou escolha em "Com quem" no gasto.</p>
            <ul class="lista">
              @for (p of store.people(); track p.id) {
                <li class="pessoa-linha">
                  <label class="campo nome">
                    <span class="sr-only">Nome</span>
                    <input type="text" [maxLength]="nameMax" [value]="p.name" (change)="rename(p, $any($event.target).value, $any($event.target))" />
                  </label>
                  @if (p.id === me) {
                    <span class="voce">você</span>
                  } @else {
                    <button type="button" class="icon-btn apagar" [attr.aria-label]="'Apagar ' + p.name" (click)="remove(p)">
                      <lucide-icon [img]="DeleteIcon" [size]="18" aria-hidden="true" />
                    </button>
                  }
                </li>
              }
            </ul>
            <form class="nova" (submit)="$event.preventDefault(); add(nova)">
              <label class="campo">
                <span class="sr-only">Nova pessoa</span>
                <input #nova type="text" [maxLength]="nameMax" placeholder="Nova pessoa" autocomplete="off" />
              </label>
              <button type="submit" class="botao-papel">
                <lucide-icon [img]="AddIcon" [size]="16" aria-hidden="true" />
                Criar
              </button>
            </form>
          </section>
        </div>

        <footer class="foot">
          <button type="button" class="btn-ink" (click)="close()">Pronto</button>
        </footer>
      </div>
    </dialog>
  `,
  styleUrl: './spending-categories-sheet.scss',
})
export class SpendingPeopleSheet {
  protected readonly store = inject(SpendingStore);
  private readonly confirm = inject(Confirm);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly DeleteIcon = ICON.apagar;
  protected readonly AddIcon = ICON.adicionar;
  protected readonly nameMax = PERSON_NAME_MAX;
  protected readonly me = ME;

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected rename(p: SpendingPerson, name: string, el: HTMLInputElement): void {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) {
      el.value = p.name;
      return;
    }
    if (clean !== p.name) this.store.savePerson({ ...p, name: clean });
  }

  protected add(el: HTMLInputElement): void {
    if (!el.value.trim()) return;
    this.store.addPerson(el.value);
    el.value = '';
  }

  protected async remove(p: SpendingPerson): Promise<void> {
    const n = this.store.entries().filter((e) => e.people?.includes(p.id)).length;
    if (n) {
      const ok = await this.confirm.ask({
        title: `Apagar “${p.name}”?`,
        text: `${p.name} sai ${n === 1 ? 'do gasto' : `dos ${n} gastos`} em que estava; o que ficar sem ninguém volta a ser só seu.`,
        confirm: 'Apagar a pessoa',
      });
      if (!ok) return;
    }
    this.store.removePerson(p.id);
  }
}
