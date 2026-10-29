import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';

/**
 * O aviso antes de usar um PIN ou uma senha curta como senha mestra (17.23 do PLANO-COFRE.md): o bilhete
 * amarelo das confirmações do cofre, com o que a pessoa ganha e o que perde, e as duas respostas. O foco vai
 * para ele ao aparecer (quem confirma pelo teclado lê o aviso antes de responder); Esc volta.
 */
@Component({
  selector: 'cofre-aviso-senha-fraca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', 'aria-labelledby': 'aviso-fraca-titulo', 'aria-describedby': 'aviso-fraca-texto', tabindex: '-1', '(keydown.escape)': 'voltar.emit()' },
  template: `
    <p class="titulo" id="aviso-fraca-titulo">{{ pin() ? 'Um PIN não é tão seguro' : 'Esta senha não é tão segura' }}</p>
    <div id="aviso-fraca-texto">
      <p>
        {{ pin() ? 'Um PIN' : 'Uma senha curta' }} se adivinha mais fácil. O cofre segura quem tenta pela tela de abrir: cada tentativa pede a passkey (ou, na
        carência, acaba em 3 erros), e são no máximo 20 erros por dia.
      </p>
      <p>Mas quem tiver o seu aparelho e conhecer você tem mais chance. E, se um dia puser um aparelho sem PRF, o cofre vai pedir uma senha forte.</p>
    </div>
    <span class="botoes">
      <button type="button" class="papel" (click)="voltar.emit()">Escolher outra</button>
      <button type="button" class="tinta" (click)="usar.emit()">{{ pin() ? 'Usar o PIN' : 'Usar mesmo assim' }}</button>
    </span>
  `,
  styleUrl: './aviso-senha-fraca.scss',
})
export class AvisoSenhaFraca {
  readonly pin = input(false);
  readonly usar = output<void>();
  readonly voltar = output<void>();

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    afterNextRender(() => host.nativeElement.focus());
  }
}
