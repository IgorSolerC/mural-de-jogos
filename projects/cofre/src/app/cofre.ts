import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * A página do cofre enquanto as telas não existem (Fase 3 do PLANO-COFRE.md): diz que o cofre está em
 * construção e mostra se as proteções da hospedagem estão valendo neste navegador. O isolamento de
 * origem só liga com os cabeçalhos COOP e COEP do Worker (seção 7.3): se ele aparece "não", a
 * hospedagem está errada.
 */
@Component({
  selector: 'cofre-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="folha">
      <h1>Cofre de senhas</h1>
      <p class="aviso">Em construção. Por enquanto, nada é guardado aqui.</p>
      <ul class="provas" aria-label="Proteções deste navegador">
        @for (prova of provas; track prova.nome) {
          <li [class.ok]="prova.ok">
            <span class="marca" aria-hidden="true">{{ prova.ok ? '●' : '○' }}</span>
            {{ prova.nome }}: <strong>{{ prova.ok ? 'sim' : 'não' }}</strong>
          </li>
        }
      </ul>
      <a class="voltar" href="https://murall.igorsc.com.br/#/anotacoes" rel="noreferrer">Voltar ao Murall</a>
    </main>
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      min-height: 100dvh;
      padding: 32px 16px;
    }
    .folha {
      width: min(100%, 520px);
      padding: 32px clamp(20px, 6vw, 40px) 28px;
      border-radius: 2px;
      background: var(--papel);
      color: var(--tinta);
      box-shadow: 0 12px 22px -8px rgb(0 0 0 / 0.6);
      rotate: -0.6deg;
    }
    h1 {
      margin: 0 0 8px;
      font-family: var(--f-marker);
      font-size: clamp(2rem, 7vw, 2.6rem);
      font-weight: 400;
      line-height: 1.05;
    }
    .aviso {
      margin: 0 0 20px;
      font-size: 1.05rem;
    }
    .provas {
      display: grid;
      gap: 6px;
      margin: 0 0 24px;
      padding: 12px 14px;
      border: 1px solid var(--linha);
      list-style: none;
      font-size: 0.95rem;
      color: var(--tinta-2);
    }
    .marca {
      display: inline-block;
      width: 1.1em;
      color: var(--vermelho);
    }
    .ok .marca {
      color: var(--verde);
    }
    strong {
      color: var(--tinta);
    }
    .voltar {
      color: var(--vermelho);
      font-weight: 600;
      text-underline-offset: 3px;
    }
    .voltar:focus-visible {
      outline: 3px solid var(--vermelho);
      outline-offset: 3px;
    }
  `,
})
export class Cofre {
  protected readonly provas = [
    { nome: 'Endereço seguro (https)', ok: window.isSecureContext },
    { nome: 'Isolado das outras páginas', ok: window.crossOriginIsolated },
  ];
}
