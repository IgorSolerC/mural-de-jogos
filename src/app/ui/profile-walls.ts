import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ICON, IconModule } from './icons';
import { KINDS, Kind, countOf, profileOf } from '../core/kinds';
import { Profile } from '../core/profile';
import { Review, isDone, isNote, scoreOf } from '../core/review';
import { CoverSleeve } from './cover-sleeve';
import { KIND_ICON } from './kind-switcher';
import { MiniCartolina } from './mini-cartolina';

/** A cor de cada mural na borda da divisória e na contagem da pasta (da cartela das categorias). */
const WALL_COLOR: Record<Kind, string> = {
  jogos: '#d63a2f',
  livros: '#5e9c1c',
  filmes: '#8c58d8',
  series: '#2d8bd6',
  animes: '#e2579f',
  musicas: '#cf9d00',
  anotacoes: '#e46f0c',
};

/**
 * As pastas dos murais no perfil: um mural por pasta, só os que têm fichas à mostra e que a pessoa
 * não escondeu, do jeito escolhido no perfil (`wallsLook`: as pastas grandes ou o arquivo). É o mesmo
 * no perfil e na prévia das Configurações (sem o "Arrumar").
 */
@Component({
  selector: 'app-profile-walls',
  imports: [CoverSleeve, IconModule, MiniCartolina, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-walls.html',
  styleUrl: './profile-walls.scss',
})
export class ProfileWalls {
  readonly profile = input.required<Profile>();
  /** As fichas que aparecem (as públicas). */
  readonly cards = input.required<readonly Review[]>();
  readonly name = input.required<string>();
  readonly own = input(false);
  /** O "Arrumar" que leva às Configurações (só no seu perfil, fora da prévia). */
  readonly editable = input(false);
  readonly opened = output<Kind>();

  protected readonly EditIcon = ICON.editar;

  /** As pastas grandes (as de sempre) ou o arquivo, todas numa fileira. */
  protected readonly look = computed(() => this.profile().wallsLook);

  /** A anotação sem capa: no lugar da capa vai a cartolina dela. */
  protected bareNote(r: Review): boolean {
    return isNote(r) && !r.game.coverUrl;
  }

  /** A sorte desta visita: cada F5 embaralha as capas das pastas, mas elas não pulam enquanto a página está aberta. */
  private readonly luck = Math.random().toString(36);

  /** A posição sorteada de uma ficha nesta visita (um hash do id com a sorte). */
  private shuffled(id: string): number {
    let h = 2166136261;
    for (const ch of this.luck + id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  }

  protected readonly walls = computed(() => {
    const p = this.profile();
    return KINDS.map((kind) => {
      // uma ficha por obra, e as anotações finalizadas fora (o mural também não mostra)
      const list = this.cards().filter((r) => r.kind === kind && !r.revisitOf && !isDone(r));
      // dez capas sorteadas a cada visita (a pasta mostra quantas couberem): primeiro as com capa e
      // nota acima de 7, depois as com capa, e por último as sem capa (a listrada com a inicial)
      const tier = (r: Review) => (r.game.coverUrl ? 0 : 2) + (!isNote(r) && (scoreOf(r.scores, 'final') ?? 0) > 7 ? 0 : 1);
      const covers = [...list].sort((a, b) => tier(a) - tier(b) || this.shuffled(a.id) - this.shuffled(b.id)).slice(0, 10);
      return {
        kind,
        icon: KIND_ICON[kind],
        color: WALL_COLOR[kind],
        title: `Mural de ${profileOf(kind).plural}`,
        short: profileOf(kind).plural,
        /** Para quem lê a tela: "68 jogos" (na pasta, só o número; a orelha já diz o mural). */
        count: countOf(profileOf(kind), list.length),
        n: list.length,
        covers,
        text: p.walls[kind]?.text ?? '',
        hidden: p.walls[kind]?.hidden === true,
      };
    }).filter((w) => w.n > 0 && !w.hidden);
  });
}
