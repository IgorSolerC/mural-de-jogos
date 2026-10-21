import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, OnDestroy, OnInit, output, signal } from '@angular/core';

/**
 * O kit de emergência (8.3, passo 4): o código de recuperação aparece aqui uma vez, num papel feito
 * para imprimir. É a única coisa do cofre que pode ir para a impressora: com esta tela aberta, o body
 * ganha `imprimir-kit`, e a impressão mostra só o papel do kit (styles.scss). O código não é guardado em
 * lugar nenhum; terminar recarrega a página e joga fora a memória.
 */
@Component({
  selector: 'cofre-passo-kit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>O cofre está criado</h2>
    <p class="nota">
      Falta o kit de emergência. Com este código, a sua conta do Google e a senha mestra, o cofre abre mesmo sem nenhum aparelho. Ele aparece só agora: imprima ou copie à mão, e guarde longe do computador.
    </p>

    <section class="kit-papel" aria-labelledby="kit-titulo">
      <header class="kit-cabeca">
        <h3 id="kit-titulo">Kit de emergência do Cofre do Murall</h3>
        <p class="kit-meta">Conta {{ contaFormatada() }} · criado em {{ dia() }}</p>
      </header>
      <p class="kit-rotulo" id="kit-codigo-rotulo">Código de recuperação</p>
      <p class="kit-codigo" aria-labelledby="kit-codigo-rotulo" translate="no">
        @for (grupo of grupos(); track $index) {
          <span>{{ grupo }}</span>
        }
      </p>
      <ol class="kit-passos">
        <li>Para usar: na tela de abrir o cofre, escolha abrir com o código de recuperação e digite o código e a senha mestra.</li>
        <li>Quem achar este papel não abre o cofre sem a sua senha. Mesmo assim, guarde num lugar só seu.</li>
        <li>Não escreva a senha mestra neste papel.</li>
      </ol>
    </section>

    <div class="acoes">
      <button type="button" class="quieto" (click)="imprimir()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 9V3h12v6" />
          <rect x="3" y="9" width="18" height="8" rx="1.5" />
          <path d="M7 14h10v7H7z" />
        </svg>
        Imprimir o kit
      </button>
      <label class="guardei">
        <input type="checkbox" [checked]="guardou()" (change)="guardou.set(!guardou())" />
        <span>Guardei o código num lugar seguro</span>
      </label>
    </div>

    <div class="pe">
      <button type="button" class="tinta" [disabled]="!guardou()" (click)="terminar.emit()">Terminar</button>
    </div>
  `,
  styleUrl: './passo-kit.scss',
})
export class PassoKit implements OnInit, OnDestroy {
  private readonly documento = inject(DOCUMENT);

  /** O código, em grupos de 4 separados por hífen. */
  readonly codigo = input.required<string>();
  /** O código da conta do Murall (8 caracteres, sem hífen). */
  readonly conta = input.required<string>();
  readonly criadoEm = input.required<Date>();
  readonly terminar = output<void>();

  protected readonly guardou = signal(false);
  protected readonly grupos = computed(() => this.codigo().split('-'));
  protected readonly contaFormatada = computed(() => `${this.conta().slice(0, 4)}-${this.conta().slice(4)}`);
  protected readonly dia = computed(() => this.criadoEm().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }));

  ngOnInit(): void {
    this.documento.body.classList.add('imprimir-kit');
  }

  ngOnDestroy(): void {
    this.documento.body.classList.remove('imprimir-kit');
  }

  protected imprimir(): void {
    this.documento.defaultView?.print();
  }
}
