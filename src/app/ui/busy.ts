import { Directive, input } from '@angular/core';

/**
 * Um botão esperando a nuvem (ou outra resposta): gira um aro de caneta no lugar do ícone, avisa o
 * leitor de tela (`aria-busy`) e não aceita outro clique de mouse (o teclado ainda aciona: quem usa
 * confere se já está esperando). O texto continua, para o botão não mudar de
 * tamanho; quem quiser troca também o texto ("Seguindo…"). O estilo está em `styles.scss`
 * (`.carregando`).
 */
@Directive({
  selector: '[appBusy]',
  host: { '[class.carregando]': 'appBusy()', '[attr.aria-busy]': "appBusy() ? 'true' : null" },
})
export class Busy {
  readonly appBusy = input(false, { transform: (v: unknown) => !!v });
}
