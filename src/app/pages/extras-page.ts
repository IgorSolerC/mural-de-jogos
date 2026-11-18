import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideIconData } from 'lucide-angular';
import { API_USAGE_PATH, PIXEL_ARTS_PATH, POMODORO_PATH } from '../core/areas';
import { Clock } from '../core/clock';
import { CloudAccount } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { ColleagueStore } from '../core/colleague-store';
import { todayISO } from '../core/dates';
import { DuelPiece, duelPieces, friendsPreview, knockoutPreview, muraldlePreview, podiumPreview, recordPreview, statsPreview } from '../core/extras-previews';
import { getRecord, recordKey } from '../core/game-records';
import { SCORED_KINDS } from '../core/kinds';
import { loadKnockout } from '../core/knockout-save';
import { Mural } from '../core/mural';
import { Mark, columnsFor } from '../core/muraldle';
import { loadDaily, loadStats } from '../core/muraldle-save';
import { pixelArtOf } from '../core/pixel-gallery';
import { PixelGallery } from '../core/pixel-gallery-store';
import { ME, Players } from '../core/players';
import { phaseMs, remainingMs } from '../core/pomodoro';
import { PomodoroStore } from '../core/pomodoro-store';
import { originalsOf } from '../core/review';
import { ICON, IconModule } from '../ui/icons';
import { KindSwitcher } from '../ui/kind-switcher';
import { PixelThumb } from '../ui/pixel-thumb';
import { PlasticLetters } from '../ui/plastic-letters';
import { PomodoroDial } from '../ui/pomodoro-dial';

/** Uma linha do letreiro: o nome em letras de plástico e, embaixo, como está. */
interface Linha {
  id: string;
  path: string;
  nome: string;
  icon: LucideIconData;
  /** Como está, em poucas palavras ("hoje · 3 chutes"); também vai no nome do link. */
  estado: string;
  /** Amarelo: o que está esperando você hoje (o Muraldle de hoje, o torneio pela metade). */
  tom: 'amarela' | 'rosa';
  /** O que vai em letras embaixo do nome, ao lado das peças; sem ele, o estado. */
  letras?: string;
  /** Só as peças, sem letras ao lado (as bolinhas dos amigos já dizem quanto). */
  semLetras?: boolean;
  /*
   * As peças de plástico da prévia (PLANO-EXTRAS.md), cada linha com as dela: só desenho, o estado inteiro vai
   * no nome do link.
   */
  /** O último chute do Muraldle (cinza, sem chute hoje). */
  marcas?: Mark[];
  /** A sequência de dias do Muraldle (0: sem a peça). */
  chama?: number;
  /** Os tracinhos do Mata-mata. */
  duelos?: DuelPiece[];
  /** As setas do Maior ou menor, e o recorde ao lado (null: ainda sem). */
  recorde?: number | null;
  /** As varetinhas das Estatísticas: a altura (0 a 1) de cada nota, de 0 a 10; as de 7 para cima, altas. */
  barras?: { h: number; alta: boolean }[];
  /** Quantas medalhas do pódio do Ranking (até três). */
  medalhas?: number;
  /** Os amigos de Comparar: a inicial numa bolinha da cor dele e quanto combinam. */
  amigos?: { id: string; inicial: string; cor: string; quanto: string }[];
}

/** As cores das bolinhas dos amigos, sempre a mesma para a mesma pessoa. */
const CORES_AMIGO = ['var(--stock-rosa)', 'var(--stock-azul)', 'var(--stock-verde)', 'var(--stock-laranja)', 'var(--stock-lilas)'];
function corDe(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CORES_AMIGO[h % CORES_AMIGO.length];
}

interface Letreiro {
  id: string;
  titulo: string;
  linhas: Linha[];
}

const vezes = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Extras (PLANO-EXTRAS.md): em cima, a prateleira "Sempre à mão" com o que serve para qualquer mural (o tomate do
 * Pomodoro, o cavalete das Pixel arts e, só para a conta de admin, a prancheta do Uso das APIs); embaixo, o seletor
 * de mural e os dois letreiros de feltro, Jogar e Números, com o estado de cada um. A página só lê: o que os jogos
 * guardam, o mural aberto, os amigos abertos em Comparar, o Pomodoro e a galeria.
 */
@Component({
  selector: 'app-extras-page',
  imports: [IconModule, KindSwitcher, PixelThumb, PlasticLetters, PomodoroDial, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './extras-page.html',
  styleUrl: './extras-page.scss',
})
export class ExtrasPage {
  private readonly mural = inject(Mural);
  private readonly players = inject(Players);
  private readonly colleagues = inject(ColleagueStore);
  private readonly pomodoro = inject(PomodoroStore);
  private readonly gallery = inject(PixelGallery);
  private readonly cloud = inject(Cloud);
  private readonly account = inject(CloudAccount);
  private readonly clock = inject(Clock);

  protected readonly kinds = SCORED_KINDS;
  protected readonly chama = ICON.chama;
  protected readonly acima = ICON.acima;
  protected readonly abaixo = ICON.abaixo;
  protected readonly pomodoroPath = POMODORO_PATH;
  protected readonly pixelArtsPath = PIXEL_ARTS_PATH;
  protected readonly apiUsagePath = API_USAGE_PATH;
  /**
   * Os jogos guardam no navegador, fora dos sinais: a página relê quando outra aba grava (`storage`) e quando a aba
   * volta a aparecer, e aí o dia também é relido (a página aberta de um dia para o outro).
   */
  private readonly reread = signal(0);

  private readonly signedIn = computed(() => !!this.cloud.config() && this.account.signedIn());
  /** A prancheta do Uso das APIs: só a conta de admin a vê (quem não é vê a página de sempre). */
  protected readonly admin = computed(() => this.signedIn() && !!this.account.account()?.admin);

  constructor() {
    // o relógio do site anda quando o Pomodoro está ligado (o do canto da tela o usa): o tomate corre junto
    const again = () => this.reread.update((n) => n + 1);
    const visible = () => document.visibilityState === 'visible' && again();
    window.addEventListener('storage', again);
    document.addEventListener('visibilitychange', visible);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('storage', again);
      document.removeEventListener('visibilitychange', visible);
    });
  }

  protected readonly pomo = computed(() => {
    const s = this.pomodoro.save();
    const paused = s.on && s.pausedAt !== null;
    const estado = !s.on ? 'desligado' : paused ? 'pausado' : s.phase === 'estudo' ? 'estudando' : 'na pausa';
    return {
      on: s.on,
      paused,
      phase: s.phase,
      estado,
      total: phaseMs(s),
      ms: s.on ? remainingMs(s, this.clock.now()) : phaseMs(s, 'estudo'),
    };
  });

  /** A obra mais nova no cavalete e as duas de antes encostadas na parede. */
  protected readonly galeria = computed(() => {
    const pieces = this.gallery.pieces();
    const recentes = pieces.slice(-3).reverse().map(pixelArtOf);
    return {
      cavalete: recentes[0] ?? null,
      encostadas: recentes.slice(1),
      estado: pieces.length ? vezes(pieces.length, 'obra', 'obras') : 'nenhuma obra ainda',
    };
  });

  private readonly jogos = computed<Linha[]>(() => {
    this.reread();
    const kind = this.mural.kind();
    const pool = this.mural.reviews();
    const slot = `${kind}|${ME}`;
    const today = todayISO();

    const m = muraldlePreview(pool, loadDaily(slot), loadStats(slot, today), today);
    const muraldleLetras =
      m.state === 'pouco'
        ? 'precisa de 3 fichas'
        : m.state === 'novo'
          ? 'a de hoje te espera'
          : m.state === 'jogando'
            ? vezes(m.guesses, 'chute', 'chutes')
            : m.state === 'acertou'
              ? `acertou em ${m.guesses}`
              : 'desistiu';
    const seguidos = m.streak ? `, ${vezes(m.streak, 'dia seguido', 'dias seguidos')}` : '';
    const muraldle = (m.state === 'pouco' || m.state === 'novo' ? muraldleLetras : `hoje · ${muraldleLetras}`) + seguidos;
    // sem chute hoje, a fileira vazia (cinza), do tamanho da tabela do jogo
    const marcas: Mark[] = m.last ?? columnsFor(kind).map(() => 'desconhecido');

    const saved = loadKnockout(kind);
    const owner = saved ? (this.players.byId(saved.owner)?.reviews ?? pool) : pool;
    const names = new Map(owner.map((r) => [r.id, r.game.name]));
    const k = knockoutPreview(pool, saved, (id) => names.get(id));
    const mata =
      k.state === 'pouco'
        ? 'precisa de 2 fichas'
        : k.state === 'nenhum'
          ? 'comece um torneio'
          : k.state === 'acabou'
            ? k.champion
              ? `campeã: ${k.champion}`
              : 'torneio acabado'
            : `${k.round ? k.round + ' · ' : ''}${k.duel} de ${k.total}`;

    const r = recordPreview(kind, pool, (measure) => getRecord(recordKey('maior-ou-menor', kind, ME, measure)));
    const maior = r.state === 'pouco' ? 'precisa de 2 fichas' : r.state === 'nenhum' ? 'sem recorde ainda' : `recorde ${r.best}`;

    return [
      {
        id: 'muraldle',
        path: '/extras/muraldle',
        nome: 'Muraldle',
        icon: ICON.quebraCabeca,
        estado: muraldle,
        letras: muraldleLetras,
        tom: m.state === 'novo' || m.state === 'jogando' ? 'amarela' : 'rosa',
        marcas: m.state === 'pouco' ? undefined : marcas,
        chama: m.state === 'pouco' ? 0 : m.streak,
      },
      {
        id: 'mata-mata',
        path: '/extras/mata-mata',
        nome: 'Mata-mata',
        icon: ICON.espadas,
        estado: mata,
        tom: k.state === 'jogando' ? 'amarela' : 'rosa',
        duelos: duelPieces(k),
      },
      {
        id: 'maior-ou-menor',
        path: '/extras/maior-ou-menor',
        nome: 'Maior ou menor',
        icon: ICON.maiorOuMenor,
        estado: maior,
        letras: r.state === 'recorde' ? 'recorde' : undefined,
        tom: 'rosa',
        recorde: r.state === 'pouco' ? undefined : r.state === 'recorde' ? r.best : null,
      },
    ];
  });

  private readonly numeros = computed<Linha[]>(() => {
    const kind = this.mural.kind();
    const p = this.mural.profile();
    const reviews = this.mural.reviews();

    const s = statsPreview(reviews);
    const stats = s.count ? `${vezes(s.count, p.singular, p.plural)} · média ${s.mean}` : 'nada no mural ainda';
    const maior = Math.max(...s.histogram);
    const barras = maior ? s.histogram.map((n, nota) => ({ h: n / maior, alta: nota >= 7 })) : undefined;

    const podio = podiumPreview(reviews);
    const ranking = podio.length ? `1º ${podio[0].name} ${podio[0].score}` : 'nada no mural ainda';

    let comparar: string;
    let amigos: Linha['amigos'];
    if (!this.signedIn()) comparar = 'entre na sua conta';
    else {
      const open = this.colleagues.colleagues().map((c) => ({ id: c.id, name: c.name, reviews: originalsOf(c.reviews.filter((x) => x.kind === kind)) }));
      const list = friendsPreview(reviews, open, this.colleagues.selected()?.id ?? null);
      const quanto = (f: (typeof list)[number]) => (f.percent === null ? 'nada em comum' : `${f.percent}%`);
      comparar = list.length ? list.map((f) => `${f.name} ${quanto(f)}`).join(', ') : 'escolha um amigo';
      amigos = list.map((f) => ({ id: f.id, inicial: [...f.name.trim()][0]?.toLocaleUpperCase('pt-BR') ?? '?', cor: corDe(f.id), quanto: f.percent === null ? '–' : `${f.percent}%` }));
    }

    return [
      { id: 'estatisticas', path: '/extras/estatisticas', nome: 'Estatísticas', icon: ICON.pizza, estado: stats, tom: 'rosa', barras },
      {
        id: 'ranking',
        path: '/ranking',
        nome: 'Ranking',
        icon: ICON.trofeu,
        estado: ranking,
        letras: podio.length ? `${podio[0].name} ${podio[0].score}` : undefined,
        tom: podio.length ? 'amarela' : 'rosa',
        medalhas: podio.length,
      },
      // com amigos, as bolinhas dizem tudo (sem letras ao lado)
      { id: 'comparar', path: '/comparar', nome: 'Comparar', icon: ICON.pessoas, estado: comparar, semLetras: !!amigos?.length, tom: 'rosa', amigos },
    ];
  });

  protected readonly letreiros = computed<Letreiro[]>(() => [
    { id: 'jogar', titulo: 'Jogar', linhas: this.jogos() },
    { id: 'numeros', titulo: 'Números', linhas: this.numeros() },
  ]);
}
