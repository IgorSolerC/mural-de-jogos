import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  BOTTONS,
  COFRE_ROTULO,
  COFRE_URL,
  DESENHOS,
  type Desenho,
  INCLINACOES,
  MURALL_URL,
  PARTES_DO_SITE,
  SECOES_DAS_ANOTACOES,
  enderecoNoMurall,
} from '../../../../../shared/topo-do-murall';

/** O desenho de cada botton: o Perfil sem a foto (o cofre não tem a conta do Murall) é uma pessoa. */
const DESENHO_DO_BOTTON: Record<(typeof BOTTONS)[number]['id'], Desenho> = { perfil: DESENHOS.pessoa, amigos: DESENHOS.amigos, ajustes: DESENHOS.ajustes };

/** O tamanho dos desenhos nos bottons, e o traço de 2px em qualquer tamanho (como o acervo do Murall). */
const TAMANHO = 21;
const TRACO = (2 * 24) / TAMANHO;

/**
 * O topo do cofre (PLANO-COFRE.md, 17.14): o mesmo do Murall, com as Anotações marcadas no varal e o Cofre
 * na fileira das seções. Os textos, os links e os desenhos vêm de `shared/topo-do-murall.ts`, e o desenho
 * de `shared/topo/_topo-do-murall.scss`, os mesmos do topo do Murall: os dois nunca se desencontram.
 *
 * O que depende da conta do Murall fica de fora, porque o cofre não tem o login dele e não deve ter: a
 * foto do Perfil vira uma pessoa, Amigos fica sem o número de novidades, e não há o botão de adicionar.
 * À direita da fileira, o logo do Cofre, como os logos das seções do Murall.
 *
 * Todo link aqui sai do cofre: são links comuns para o Murall, na mesma aba, e sair tranca o cofre (o
 * `pagehide` do Trancador).
 */
@Component({
  selector: 'cofre-topo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="topo">
      <div class="cartaz cartolina">
        <span class="pin pin-l tachinha" aria-hidden="true"></span>
        <span class="pin pin-r tachinha branca" aria-hidden="true"></span>
        <!-- Murall: o mural (a pincel, no cartaz) de tudo ("all", um recorte de revista colado por cima) -->
        <p class="logo">
          <a class="logo-link" [href]="murall" rel="noreferrer" aria-label="Murall"
            ><span class="mur" aria-hidden="true">Mur</span><span class="all" aria-hidden="true"><span class="recorte">ALL</span></span></a
          >
        </p>
      </div>

      <!-- o varal: as partes do site; o cofre mora nas Anotações -->
      <nav class="varal" aria-label="Partes do site">
        <span class="barbante" aria-hidden="true"></span>
        <ul class="etiquetas">
          @for (p of partes; track p.area) {
            <li>
              <a class="etiqueta" [href]="p.href" rel="noreferrer" [class.on]="p.on" [style.--tilt]="p.tilt">
                <span class="prendedor" aria-hidden="true"></span>
                {{ p.label }}
              </a>
            </li>
          }
        </ul>
      </nav>

      <!-- os bottons: o que é seu e vale para todos os murais -->
      <nav class="bottons" aria-label="Você">
        @for (b of bottons; track b.id) {
          <a class="botton" [href]="b.href" rel="noreferrer" [title]="b.title">
            <span class="face">
              <svg
                class="desenho"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                [attr.width]="tamanho"
                [attr.height]="tamanho"
                fill="none"
                stroke="currentColor"
                [attr.stroke-width]="traco"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                @for (n of b.desenho; track $index) {
                  @switch (n[0]) {
                    @case ('path') {
                      <path [attr.d]="n[1]['d']" />
                    }
                    @case ('circle') {
                      <circle [attr.cx]="n[1]['cx']" [attr.cy]="n[1]['cy']" [attr.r]="n[1]['r']" />
                    }
                  }
                }
              </svg>
            </span>
            <span class="legenda">{{ b.label }}</span>
          </a>
        }
      </nav>
    </div>

    <!-- embaixo do topo, como a barra das Anotações do Murall: as seções e o logo da aberta -->
    <div class="indice">
      <nav class="secoes" aria-label="Seções das anotações">
        <ul>
          @for (s of secoes; track s.label) {
            <li><a class="secao" [href]="s.href" rel="noreferrer">{{ s.label }}</a></li>
          }
          <li><a class="secao on" [href]="cofre" aria-current="page">{{ rotulo }}</a></li>
        </ul>
      </nav>
      <div class="pagina">
        <!-- o logo do Cofre: a porta de um cofre de aço, com o disco do segredo -->
        <span class="logo-cofre" aria-hidden="true">
          <span class="disco"></span>
          <span class="nome">Cofre</span>
        </span>
      </div>
    </div>
  `,
  styleUrl: './topo.scss',
})
export class Topo {
  protected readonly murall = MURALL_URL + '/';
  protected readonly cofre = COFRE_URL;
  protected readonly rotulo = COFRE_ROTULO;
  protected readonly tamanho = TAMANHO;
  protected readonly traco = TRACO;
  protected readonly partes = PARTES_DO_SITE.map((p, i) => ({
    area: p.area,
    label: p.label,
    href: enderecoNoMurall('/' + p.area),
    on: p.area === 'anotacoes',
    tilt: INCLINACOES[i % INCLINACOES.length],
  }));
  protected readonly bottons = BOTTONS.map((b) => ({ ...b, href: enderecoNoMurall(b.caminho), desenho: DESENHO_DO_BOTTON[b.id] }));
  protected readonly secoes = SECOES_DAS_ANOTACOES.map((s) => ({ label: s.label, href: enderecoNoMurall('/anotacoes' + (s.slug ? '/' + s.slug : '')) }));
}
