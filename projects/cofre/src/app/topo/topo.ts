import { ChangeDetectionStrategy, Component } from '@angular/core';
import { COFRE_ROTULO, COFRE_URL, MURALL_URL, SECOES_DAS_ANOTACOES, enderecoNoMurall } from '../../../../../shared/secoes-das-anotacoes';

/**
 * O topo do cofre (PLANO-COFRE.md, 17.12): o cartaz do Murall e a fileira das Anotações, com o Cofre
 * marcado. Não é uma cópia do topo do Murall: o varal e os bottons dependem da conta do Murall (a foto,
 * os avisos), que o cofre não tem e não deve ter. A fileira sai da mesma lista que monta a barra das
 * Anotações no Murall (`shared/secoes-das-anotacoes.ts`), então as duas nunca se desencontram.
 *
 * Todo link aqui sai do cofre: são links comuns para o Murall, na mesma aba, e sair tranca o cofre (o
 * `pagehide` do Trancador).
 */
@Component({
  selector: 'cofre-topo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="topo">
      <div class="cartaz">
        <span class="tachinha" aria-hidden="true"></span>
        <span class="tachinha branca" aria-hidden="true"></span>
        <!-- Murall: o mural (a pincel, no cartaz) de tudo ("all", um recorte de revista colado por cima) -->
        <p class="logo">
          <a class="logo-link" [href]="murall" rel="noreferrer" aria-label="Murall"
            ><span class="mur" aria-hidden="true">Mur</span><span class="all" aria-hidden="true"><span class="recorte">ALL</span></span></a
          >
        </p>
      </div>
      <nav class="secoes" aria-label="Seções das anotações">
        <ul>
          @for (s of secoes; track s.label) {
            <li><a class="secao" [href]="s.href" rel="noreferrer">{{ s.label }}</a></li>
          }
          <li><a class="secao on" [href]="cofre" aria-current="page">{{ rotulo }}</a></li>
        </ul>
      </nav>
    </header>
  `,
  styleUrl: './topo.scss',
})
export class Topo {
  protected readonly murall = MURALL_URL + '/';
  protected readonly cofre = COFRE_URL;
  protected readonly rotulo = COFRE_ROTULO;
  protected readonly secoes = SECOES_DAS_ANOTACOES.map((s) => ({ label: s.label, href: enderecoNoMurall(s.slug) }));
}
