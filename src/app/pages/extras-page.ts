import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideIconData } from 'lucide-angular';
import { API_USAGE_PATH, CALENDAR_PATH, PIXEL_ARTS_PATH, POMODORO_PATH, SPENDING_PATH, VAULT_URL } from '../core/areas';
import { CalendarStore } from '../core/calendar-store';
import { Clock } from '../core/clock';
import { CloudAccount } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { ColleagueStore } from '../core/colleague-store';
import { MONTHS_LONG, MONTHS_SHORT, todayISO } from '../core/dates';
import { DuelPiece, duelPieces, friendsPreview, knockoutPreview, muraldlePreview, podiumPreview, recordPreview, statsPreview } from '../core/extras-previews';
import { RECORDS_KEY, getRecord, recordKey } from '../core/game-records';
import { SCORED_KINDS } from '../core/kinds';
import { KNOCKOUT_SAVE_KEY, loadKnockout } from '../core/knockout-save';
import { mediaSignal } from '../core/media';
import { Mural } from '../core/mural';
import { Mark, columnsFor } from '../core/muraldle';
import { MURALDLE_SAVE_KEY, loadDaily, loadStats } from '../core/muraldle-save';
import { pixelArtOf } from '../core/pixel-gallery';
import { PixelGallery } from '../core/pixel-gallery-store';
import { ME, Players } from '../core/players';
import { phaseMs, remainingMs } from '../core/pomodoro';
import { PomodoroStore } from '../core/pomodoro-store';
import { originalsOf } from '../core/review';
import { brlShort, monthOfDay, rowsIn, totals } from '../core/spending';
import { SpendingStore } from '../core/spending-store';
import { ICON, IconModule } from '../ui/icons';
import { KindSwitcher } from '../ui/kind-switcher';
import { PlasticLetters } from '../ui/plastic-letters';
import { PomodoroDial } from '../ui/pomodoro-dial';
import { Shelf, shelfRows } from '../ui/shelf';
import { CashBook, CrtMonitor, DeskCalendar, SteelSafe } from '../ui/shelf-pieces';

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
 * Extras (PLANO-EXTRAS.md, PLANO-OUTROS.md): em cima, a prateleira "Sempre à mão" com o que serve para qualquer mural
 * (a folhinha do Calendário, o livro-caixa dos Gastos, o cofre de aço para quem pode usá-lo, o tomate do Pomodoro, o
 * monitor das Pixel arts e, só para a conta de admin, a prancheta do Uso das APIs); embaixo, o seletor
 * de mural e os dois letreiros de feltro, Jogar e Números, com o estado de cada um. A página só lê: o que os jogos
 * guardam, o mural aberto, os amigos abertos em Comparar, os lembretes de hoje, o saldo do mês, o Pomodoro e a galeria.
 */
@Component({
  selector: 'app-extras-page',
  imports: [CashBook, CrtMonitor, DeskCalendar, IconModule, KindSwitcher, PlasticLetters, PomodoroDial, RouterLink, Shelf, SteelSafe],
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
  private readonly calendar = inject(CalendarStore);
  private readonly spending = inject(SpendingStore);

  protected readonly kinds = SCORED_KINDS;
  protected readonly chama = ICON.chama;
  protected readonly acima = ICON.acima;
  protected readonly abaixo = ICON.abaixo;
  protected readonly pomodoroPath = POMODORO_PATH;
  protected readonly pixelArtsPath = PIXEL_ARTS_PATH;
  protected readonly apiUsagePath = API_USAGE_PATH;
  protected readonly calendarPath = CALENDAR_PATH;
  protected readonly spendingPath = SPENDING_PATH;
  protected readonly vaultUrl = VAULT_URL;
  /**
   * Os jogos guardam no navegador, fora dos sinais: a página relê quando outra aba grava (`storage`) e quando a aba
   * volta a aparecer, e aí o dia também é relido (a página aberta de um dia para o outro).
   */
  private readonly reread = signal(0);

  protected readonly plural = computed(() => this.mural.profile().plural);
  private readonly signedIn = computed(() => !!this.cloud.config() && this.account.signedIn());
  /** A prancheta do Uso das APIs: só a conta de admin a vê (quem não é vê a página de sempre). */
  protected readonly admin = computed(() => this.signedIn() && !!this.account.account()?.admin);
  /** O cofre de senhas, só para quem pode usá-lo (o /v1/eu pergunta ao cofre), como era a aba dele. */
  protected readonly vault = computed(() => !!this.account.account()?.cofre);

  constructor() {
    // o relógio do site anda quando o Pomodoro está ligado (o do canto da tela o usa): o tomate corre junto
    const again = () => this.reread.update((n) => n + 1);
    const visible = () => document.visibilityState === 'visible' && again();
    // só o que os jogos guardam (ou o navegador inteiro limpo): as outras chaves mudam o tempo todo
    const games = new Set([MURALDLE_SAVE_KEY, KNOCKOUT_SAVE_KEY, RECORDS_KEY]);
    const stored = (e: StorageEvent) => (e.key === null || games.has(e.key)) && again();
    window.addEventListener('storage', stored);
    document.addEventListener('visibilitychange', visible);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('storage', stored);
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

  /** A obra mais nova, na tela do monitor. */
  protected readonly galeria = computed(() => {
    const pieces = this.gallery.pieces();
    const last = pieces.at(-1);
    return {
      tela: last ? pixelArtOf(last) : null,
      estado: pieces.length ? vezes(pieces.length, 'obra', 'obras') : 'nenhuma obra ainda',
    };
  });

  /** A folhinha: hoje e quantos lembretes ele tem (o dia vira à meia-noite, com o site aberto). */
  protected readonly calendario = computed(() => {
    const dia = this.calendar.today();
    const lembretes = this.calendar.todayCount();
    return { dia, lembretes, estado: lembretes ? vezes(lembretes, 'lembrete hoje', 'lembretes hoje') : 'nenhum lembrete hoje' };
  });

  /** O livro-caixa: o saldo do mês de hoje no canhoto; sem lançamento no mês, sem canhoto. */
  protected readonly livro = computed(() => {
    const month = monthOfDay(this.calendar.today());
    const entries = this.spending.entries();
    const rows = rowsIn(entries, month);
    const nome = MONTHS_LONG[Number(month.slice(5, 7)) - 1];
    if (!rows.length) return { canhoto: null, estado: `nada anotado em ${nome}` };
    const { balance } = totals(rows, entries);
    const word = balance < 0 ? 'faltam' : 'sobra';
    const amount = brlShort(Math.abs(balance));
    return { canhoto: { month: MONTHS_SHORT[Number(month.slice(5, 7)) - 1], word, amount }, estado: `${word} ${amount} em ${nome}` };
  });

  /** No celular a prateleira se divide em tábuas de até três (ui/shelf.ts). */
  private readonly narrow = mediaSignal('(max-width: 720px)');

  /** O que vai na prateleira, na ordem, já nas tábuas. */
  protected readonly tabuas = computed(() => {
    const coisas = ['calendario', 'gastos', ...(this.vault() ? ['cofre'] : []), 'pomodoro', 'pixel-arts', ...(this.admin() ? ['uso-das-apis'] : [])];
    return shelfRows(coisas, this.narrow());
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
    const player = saved ? this.players.byId(saved.owner) : undefined;
    const owner = player?.reviews ?? pool;
    const names = new Map(owner.map((r) => [r.id, r.game.name]));
    // o torneio jogado com o mural de um colega diz de quem é
    const deQuem = player && !player.mine ? ` · com ${player.name}` : '';
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
            : `${k.round ? k.round + ' · ' : ''}duelo ${k.duel} de ${k.total}${deQuem}`;

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
    // a nota sem ficha fica vazia (sem tracinho), sobre o risco de baixo
    const barras = maior ? s.histogram.map((n, nota) => ({ h: n / maior, alta: nota >= 7 })) : undefined;

    const podio = podiumPreview(reviews);
    const ranking = podio.length ? `1º ${podio[0].name} ${podio[0].score}` : 'nada no mural ainda';

    let comparar: string;
    let amigos: Linha['amigos'];
    if (!this.signedIn()) comparar = 'só com conta';
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
        tom: 'rosa',
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
