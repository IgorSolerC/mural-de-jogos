import { Injectable, computed, effect, signal } from '@angular/core';
import { fold } from './review';
import { MAX_PINNED_TAGS, sanitizeTags } from './note-labels';
import { CategoryColorId, CategoryLook, CategoryLooks, lookKey, sanitizeCategoryLooks, tagLookKey } from './category-looks';
import { CategoryPrefs, NotesConfig, sanitizeNotesConfig, withPrefs } from './mural-config';

export const SETTINGS_KEY = 'mural-de-jogos:config:v1';
const KEY = SETTINGS_KEY;

/** Onde a busca de jogos procura: a RAWG quando há chave (da pessoa ou do site), senão a Wikipedia. */
export type CoverSource = 'wikipedia' | 'rawg';

/**
 * Como as notas aparecem: Livre (com uma casa, como foram dadas), Arredondado (para a metade ou o
 * inteiro mais perto: 9,2 → 9; 8,4 → 8,5) ou Inteiros (8,4 → 8; 8,5 → 9). Só a exibição: a nota
 * guardada, a média e a ordem do mural não mudam.
 */
export type ScoreDisplay = 'livre' | 'metade' | 'inteiro';
export const SCORE_DISPLAYS: readonly ScoreDisplay[] = ['livre', 'metade', 'inteiro'];

interface Stored {
  rawgKey: string;
  /** Chave do TMDB (a "API key" curta ou o "token de leitura" longo): filmes e séries em português. */
  tmdbKey: string;
  /** As etiquetas de fita que separam o mural em grupos. Escondidas, as fichas correm juntas (bom para print). */
  groupLabels: boolean;
  /** Sem spoilers: as fichas do mural escondem notas, veredito, bônus e texto, para mostrar o mural a outros. */
  noSpoilers: boolean;
  scoreDisplay: ScoreDisplay;
  /** O nome da pessoa: vai no backup (e no nome do arquivo), para quem abrir em Comparar já saber de quem é. */
  ownerName: string;
  /** O número na aba Amigos (quantas novidades dos amigos chegaram). Desligado, a aba fica quieta. */
  mailCount: boolean;
  /**
   * Quando as chaves (RAWG e TMDB) mudaram pela última vez, à mão (ISO; vazio: nunca desde que elas
   * passaram a sincronizar). Com conta, a mudança mais nova vale em todos os aparelhos (ver
   * core/cloud-sync.ts). As chaves nunca vão no arquivo de backup.
   */
  keysAt: string;
  /**
   * Evitar spoilers de outros murais (ligado por padrão): a ficha de qualquer outra pessoa (amigo ou
   * não, em Amigos, no mural dela ou em Comparar) sobre algo que você ainda não avaliou vem em segredo.
   * Cada tela tem um "Mostrar notas" que vale só enquanto ela estiver aberta (ver core/spoiler-shield.ts).
   */
  friendSpoilers: boolean;
  /**
   * As novidades dos amigos: misturadas (de todos os murais, esteja onde estiver) ou separadas (só as
   * do mural aberto no cartaz). Misturadas por padrão.
   */
  friendKinds: FriendKinds;
  /**
   * As tags fixas das anotações: sempre à mão no editor, mesmo sem nenhuma anotação usando (ver
   * core/note-labels.ts). Com conta, a lista mudada por último vale em todos os aparelhos.
   */
  pinnedTags: string[];
  /** Quando as tags fixas mudaram pela última vez (ISO; vazio: nunca). */
  pinnedTagsAt: string;
  /**
   * O desenho e a cor de cada categoria das anotações (ver core/category-looks.ts). Com conta, os
   * mudados por último valem em todos os aparelhos, como as tags fixas.
   */
  categoryLooks: CategoryLooks;
  /** Quando os jeitos das categorias mudaram pela última vez (ISO; vazio: nunca). */
  categoryLooksAt: string;
  /**
   * As escolhas de Desempenho (Ajustes): cada uma alivia o aparelho de um jeito, e valem só nele. As
   * três predefinições (`PERFORMANCE_PRESETS`) ligam e desligam um conjunto delas.
   *
   * Rolagem lisa (ligada por padrão): cada ficha acordada do mural é uma camada só dela no compositor,
   * desenhada uma vez (ver `.lugar[data-viva]` em pages/wall-board.scss). Sem ela, o navegador
   * redesenha o pedaço da parede a cada ficha vizinha que chega; com ela, alguns traços a lápis saem
   * um tico mais suaves.
   */
  cardLayers: boolean;
  /** Sem sombra na cartolina: as fichas recortadas ficam sem a sombra que segue o recorte (`.sem-sombra` em styles.scss). */
  noCutShadows: boolean;
  /** Lápis sem grão: os rabiscos e as manchas perdem o grão e o tremido (`.lapis-liso` em styles.scss). */
  plainPencil: boolean;
  /** Fichas paradas: não levantam com o mouse, e os brilhos ficam parados (pages/wall-cards.ts e `.fichas-paradas`). */
  stillCards: boolean;
  /** Menos fichas prontas: menos fichas montadas em volta da tela, uma de cada vez (pages/wall-cards.ts). */
  fewCards: boolean;
  /**
   * Perguntar antes de salvar uma anotação sem categoria (ligado por padrão). O "Nunca mais me
   * perguntar isso" da pergunta desliga; os Ajustes (Mural) e o "Voltar ao padrão" ligam de novo.
   */
  askNoCategory: boolean;
  /** O mesmo, para a anotação sem nenhuma tag (cada categoria pode mudar: ver `notesConfig`). */
  askNoTag: boolean;
  /**
   * As configurações do mural de anotações (a engrenagem da pasta, ver core/mural-config.ts): a
   * privacidade de quem nasce, a cor da sub-nota, a ordem das categorias e o que cada uma muda. Com
   * conta, as mudadas por último valem em todos os aparelhos, como os jeitos das categorias.
   */
  notesConfig: NotesConfig;
  /** Quando as configurações do mural de anotações mudaram pela última vez (ISO; vazio: nunca). */
  notesConfigAt: string;
}

export type FriendKinds = 'misturado' | 'separado';

/**
 * O padrão das preferências que "Voltar ao padrão" (Ajustes) desfaz: como as fichas aparecem, o que
 * chega dos amigos e as perguntas ao salvar uma anotação. O nome, as chaves, as tags fixas e o jeito das categorias não entram: são coisas
 * da pessoa, não escolhas de exibição.
 */
export const PREFERENCE_DEFAULTS = {
  scoreDisplay: 'livre' as ScoreDisplay,
  groupLabels: true,
  noSpoilers: false,
  friendSpoilers: true,
  friendKinds: 'misturado' as FriendKinds,
  mailCount: true,
  cardLayers: true,
  noCutShadows: false,
  plainPencil: false,
  stillCards: false,
  fewCards: false,
  askNoCategory: true,
  askNoTag: true,
};

/** As escolhas de Desempenho, pelo nome do ajuste guardado. */
export const PERFORMANCE_KEYS = ['cardLayers', 'noCutShadows', 'plainPencil', 'stillCards', 'fewCards'] as const;
export type PerformanceKey = (typeof PERFORMANCE_KEYS)[number];
export type PerformanceChoices = Record<PerformanceKey, boolean>;

/**
 * As predefinições de qualidade do mural: Qualidade desenha tudo como foi feito, traço por traço;
 * Equilíbrio (o padrão) só guarda cada ficha desenhada, para a rolagem ficar solta; Desempenho liga
 * tudo o que alivia o aparelho.
 */
export type PerformancePreset = 'desempenho' | 'equilibrio' | 'qualidade';
export const PERFORMANCE_PRESETS: Record<PerformancePreset, PerformanceChoices> = {
  desempenho: { cardLayers: true, noCutShadows: true, plainPencil: true, stillCards: true, fewCards: true },
  equilibrio: { cardLayers: true, noCutShadows: false, plainPencil: false, stillCards: false, fewCards: false },
  qualidade: { cardLayers: false, noCutShadows: false, plainPencil: false, stillCards: false, fewCards: false },
};

/** O nome é curto: cabe numa etiqueta "Olá, eu sou" e no nome do arquivo. */
export const OWNER_NAME_MAX = 40;

/** O que está guardado, ainda cru (sem nada ou ilegível, `{}`: tudo no padrão). */
function readRaw() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function readStored(): Stored {
  const raw = readRaw();
  const rawgKey = typeof raw.rawgKey === 'string' ? raw.rawgKey : '';
  const tmdbKey = typeof raw.tmdbKey === 'string' ? raw.tmdbKey : '';
  const groupLabels = raw.groupLabels !== false;
  const noSpoilers = raw.noSpoilers === true;
  const scoreDisplay: ScoreDisplay = SCORE_DISPLAYS.includes(raw.scoreDisplay) ? raw.scoreDisplay : 'livre';
  const ownerName = typeof raw.ownerName === 'string' ? raw.ownerName.slice(0, OWNER_NAME_MAX) : '';
  const mailCount = raw.mailCount !== false;
  const keysAt = typeof raw.keysAt === 'string' && Number.isFinite(Date.parse(raw.keysAt)) ? raw.keysAt : '';
  // ligado por padrão: o que você ainda não avaliou chega em segredo
  const friendSpoilers = raw.friendSpoilers !== false;
  const friendKinds: FriendKinds = raw.friendKinds === 'separado' ? 'separado' : 'misturado';
  const pinnedTags = sanitizeTags(raw.pinnedTags, MAX_PINNED_TAGS);
  const pinnedTagsAt = typeof raw.pinnedTagsAt === 'string' && Number.isFinite(Date.parse(raw.pinnedTagsAt)) ? raw.pinnedTagsAt : '';
  const categoryLooks = sanitizeCategoryLooks(raw.categoryLooks);
  const categoryLooksAt = typeof raw.categoryLooksAt === 'string' && Number.isFinite(Date.parse(raw.categoryLooksAt)) ? raw.categoryLooksAt : '';
  const cardLayers = raw.cardLayers !== false;
  const noCutShadows = raw.noCutShadows === true;
  const plainPencil = raw.plainPencil === true;
  const stillCards = raw.stillCards === true;
  const fewCards = raw.fewCards === true;
  const askNoCategory = raw.askNoCategory !== false;
  const askNoTag = raw.askNoTag !== false;
  const notesConfig = sanitizeNotesConfig(raw.notesConfig);
  const notesConfigAt = typeof raw.notesConfigAt === 'string' && Number.isFinite(Date.parse(raw.notesConfigAt)) ? raw.notesConfigAt : '';
  return { rawgKey, tmdbKey, groupLabels, noSpoilers, scoreDisplay, ownerName, mailCount, keysAt, friendSpoilers, friendKinds, pinnedTags, pinnedTagsAt, categoryLooks, categoryLooksAt, cardLayers, noCutShadows, plainPencil, stillCards, fewCards, askNoCategory, askNoTag, notesConfig, notesConfigAt };
}

/**
 * O jeito de mostrar as notas, lido já ao carregar: `formatScore` usa em toda parte, mesmo nas telas
 * que não pedem os Ajustes.
 *
 * Só ele, e não `readStored()`: isto roda quando o módulo carrega, e review.ts (que importa daqui)
 * pode estar no meio de um ciclo de imports (review → settings → category-looks → review). Ler tudo
 * aqui chamava `sanitizeCategoryLooks` antes de `CATEGORY_ICONS` existir, e o site abria em branco
 * para quem tinha uma categoria com ícone ou cor (1.28.3).
 */
export const scoreDisplay = signal<ScoreDisplay>(SCORE_DISPLAYS.includes(readRaw().scoreDisplay) ? readRaw().scoreDisplay : 'livre');

@Injectable({ providedIn: 'root' })
export class Settings {
  private readonly stored = readStored();
  readonly rawgKey = signal(this.stored.rawgKey);
  readonly tmdbKey = signal(this.stored.tmdbKey);
  /** A pessoa colou a própria chave da RAWG (sem ela, a busca usa a do site; ver core/site-keys.ts). */
  readonly hasRawg = computed(() => this.rawgKey().trim().length > 0);
  /** A pessoa colou a própria chave do TMDB. */
  readonly hasTmdb = computed(() => this.tmdbKey().trim().length > 0);
  readonly groupLabels = signal(this.stored.groupLabels);
  /** Notas viram "?", bônus viram adesivos meio a meio e o texto vira embaralhado, do mesmo tamanho. */
  readonly noSpoilers = signal(this.stored.noSpoilers);
  readonly scoreDisplay = scoreDisplay;
  /** Como a pessoa se chama (vazio: não disse). Ver `OWNER_NAME_MAX`. */
  readonly ownerName = signal(this.stored.ownerName);
  /** O número na aba Amigos. */
  readonly mailCount = signal(this.stored.mailCount);
  /** Ver `Stored.keysAt`. */
  readonly keysAt = signal(this.stored.keysAt);
  /** Ver `Stored.friendSpoilers`. */
  readonly friendSpoilers = signal(this.stored.friendSpoilers);
  /** Ver `Stored.friendKinds`. */
  readonly friendKinds = signal<FriendKinds>(this.stored.friendKinds);
  /** Ver `Stored.pinnedTags`. */
  readonly pinnedTags = signal<readonly string[]>(this.stored.pinnedTags);
  /** Ver `Stored.pinnedTagsAt`. */
  readonly pinnedTagsAt = signal(this.stored.pinnedTagsAt);
  /** Ver `Stored.categoryLooks`. */
  readonly categoryLooks = signal<CategoryLooks>(this.stored.categoryLooks);
  /** Ver `Stored.categoryLooksAt`. */
  readonly categoryLooksAt = signal(this.stored.categoryLooksAt);
  /** Ver `Stored.cardLayers`. */
  readonly cardLayers = signal(this.stored.cardLayers);
  /** Ver `Stored.noCutShadows`. */
  readonly noCutShadows = signal(this.stored.noCutShadows);
  /** Ver `Stored.plainPencil`. */
  readonly plainPencil = signal(this.stored.plainPencil);
  /** Ver `Stored.stillCards`. */
  readonly stillCards = signal(this.stored.stillCards);
  /** Ver `Stored.fewCards`. */
  readonly fewCards = signal(this.stored.fewCards);
  /** Ver `Stored.askNoCategory`. */
  readonly askNoCategory = signal(this.stored.askNoCategory);
  /** Ver `Stored.askNoTag`. */
  readonly askNoTag = signal(this.stored.askNoTag);
  /** Ver `Stored.notesConfig`. Para mudar, `setNotesConfig` (marca a mudança como a mais nova). */
  readonly notesConfig = signal<NotesConfig>(this.stored.notesConfig);
  /** Ver `Stored.notesConfigAt`. */
  readonly notesConfigAt = signal(this.stored.notesConfigAt);

  /** A predefinição que bate com as escolhas de agora (null: uma mistura feita à mão). */
  readonly performancePreset = computed<PerformancePreset | null>(() => {
    for (const preset of Object.keys(PERFORMANCE_PRESETS) as PerformancePreset[]) {
      if (PERFORMANCE_KEYS.every((key) => this[key]() === PERFORMANCE_PRESETS[preset][key])) return preset;
    }
    return null;
  });

  /** Liga e desliga as escolhas de Desempenho como a predefinição manda. */
  applyPerformancePreset(preset: PerformancePreset): void {
    for (const key of PERFORMANCE_KEYS) this[key].set(PERFORMANCE_PRESETS[preset][key]);
  }

  /** Todas as preferências de exibição estão no padrão (ver `PREFERENCE_DEFAULTS`). */
  readonly atDefaults = computed(
    () =>
      this.scoreDisplay() === PREFERENCE_DEFAULTS.scoreDisplay &&
      this.groupLabels() === PREFERENCE_DEFAULTS.groupLabels &&
      this.noSpoilers() === PREFERENCE_DEFAULTS.noSpoilers &&
      this.friendSpoilers() === PREFERENCE_DEFAULTS.friendSpoilers &&
      this.friendKinds() === PREFERENCE_DEFAULTS.friendKinds &&
      this.mailCount() === PREFERENCE_DEFAULTS.mailCount &&
      this.askNoCategory() === PREFERENCE_DEFAULTS.askNoCategory &&
      this.askNoTag() === PREFERENCE_DEFAULTS.askNoTag &&
      PERFORMANCE_KEYS.every((key) => this[key]() === PREFERENCE_DEFAULTS[key]),
  );

  /** "Voltar ao padrão": as preferências de exibição voltam ao começo; o resto fica. */
  resetPreferences(): void {
    this.scoreDisplay.set(PREFERENCE_DEFAULTS.scoreDisplay);
    this.groupLabels.set(PREFERENCE_DEFAULTS.groupLabels);
    this.noSpoilers.set(PREFERENCE_DEFAULTS.noSpoilers);
    this.friendSpoilers.set(PREFERENCE_DEFAULTS.friendSpoilers);
    this.friendKinds.set(PREFERENCE_DEFAULTS.friendKinds);
    this.mailCount.set(PREFERENCE_DEFAULTS.mailCount);
    this.askNoCategory.set(PREFERENCE_DEFAULTS.askNoCategory);
    this.askNoTag.set(PREFERENCE_DEFAULTS.askNoTag);
    for (const key of PERFORMANCE_KEYS) this[key].set(PREFERENCE_DEFAULTS[key]);
  }

  /** A tag é fixa? (sem ligar para caixa nem acento) */
  isPinnedTag(tag: string): boolean {
    return this.pinnedTags().some((t) => fold(t) === fold(tag));
  }

  /** Fixa (no fim da lista) ou solta uma tag; a mudança vale como a mais nova. */
  togglePinnedTag(tag: string): void {
    const pinned = this.isPinnedTag(tag);
    this.pinnedTags.set(pinned ? this.pinnedTags().filter((t) => fold(t) !== fold(tag)) : sanitizeTags([...this.pinnedTags(), tag], MAX_PINNED_TAGS));
    this.pinnedTagsAt.set(new Date().toISOString());
  }

  /** As tags fixas que vieram de outro aparelho (mudadas depois das daqui). */
  applyPinnedTags(tags: readonly string[], at: string): void {
    this.pinnedTags.set(sanitizeTags(tags, MAX_PINNED_TAGS));
    this.pinnedTagsAt.set(at);
  }

  /** O jeito escolhido para a categoria (vazio: o de sempre). */
  categoryLook(category: string): CategoryLook {
    return this.categoryLooks()[lookKey(category)] ?? {};
  }

  /** Troca o desenho e a cor da categoria (sem nenhum dos dois, ela volta ao de sempre); vale como a mais nova. */
  setCategoryLook(category: string, look: CategoryLook): void {
    const key = lookKey(category);
    const { [key]: _, ...rest } = this.categoryLooks();
    this.categoryLooks.set(sanitizeCategoryLooks(look.icon || look.color ? { ...rest, [key]: look } : rest));
    this.categoryLooksAt.set(new Date().toISOString());
  }

  /** A cor da tag (ver `tagLookKey`), ou undefined: a etiqueta de sempre. */
  tagColor(tag: string): CategoryColorId | undefined {
    return this.categoryLooks()[tagLookKey(tag)]?.color;
  }

  /** Troca a cor de várias tags de uma vez (undefined tira a cor); vale como a mudança mais nova. */
  setTagColors(colors: ReadonlyMap<string, CategoryColorId | undefined>): void {
    const next: Record<string, CategoryLook> = { ...this.categoryLooks() };
    for (const [tag, color] of colors) {
      const key = tagLookKey(tag);
      if (key === '#') continue;
      if (color) next[key] = { color };
      else delete next[key];
    }
    this.categoryLooks.set(sanitizeCategoryLooks(next));
    this.categoryLooksAt.set(new Date().toISOString());
  }

  setTagColor(tag: string, color: CategoryColorId | undefined): void {
    this.setTagColors(new Map([[tag, color]]));
  }

  /** Os jeitos que vieram de outro aparelho (mudados depois dos daqui). */
  applyCategoryLooks(looks: CategoryLooks, at: string): void {
    this.categoryLooks.set(sanitizeCategoryLooks(looks));
    this.categoryLooksAt.set(at);
  }

  /** Muda as configurações do mural de anotações; vale como a mudança mais nova. */
  setNotesConfig(patch: Partial<NotesConfig>): void {
    this.notesConfig.set(sanitizeNotesConfig({ ...this.notesConfig(), ...patch }));
    this.notesConfigAt.set(new Date().toISOString());
  }

  /** Muda o que uma categoria muda em cima do mural (`undefined` num campo: volta a seguir o mural). */
  setCategoryPrefs(category: string, patch: CategoryPrefs): void {
    this.setNotesConfig(withPrefs(this.notesConfig(), category, patch));
  }

  /** As configurações que vieram de outro aparelho (mudadas depois das daqui). */
  applyNotesConfig(config: NotesConfig, at: string): void {
    this.notesConfig.set(sanitizeNotesConfig(config));
    this.notesConfigAt.set(at);
  }

  /** A pessoa mudou uma chave (digitou, colou ou apagou): a mudança vale como a mais nova. */
  setKey(which: 'rawg' | 'tmdb', value: string): void {
    (which === 'rawg' ? this.rawgKey : this.tmdbKey).set(value);
    this.keysAt.set(new Date().toISOString());
  }

  /** As chaves que vieram de outro aparelho (mais novas que as daqui). */
  applyKeys(keys: { rawg: string; tmdb: string; em: string }): void {
    this.rawgKey.set(keys.rawg);
    this.tmdbKey.set(keys.tmdb);
    this.keysAt.set(keys.em);
  }

  constructor() {
    effect(() => {
      const data: Stored = {
        rawgKey: this.rawgKey().trim(),
        tmdbKey: this.tmdbKey().trim(),
        groupLabels: this.groupLabels(),
        noSpoilers: this.noSpoilers(),
        scoreDisplay: this.scoreDisplay(),
        ownerName: this.ownerName().slice(0, OWNER_NAME_MAX),
        mailCount: this.mailCount(),
        keysAt: this.keysAt(),
        friendSpoilers: this.friendSpoilers(),
        friendKinds: this.friendKinds(),
        pinnedTags: [...this.pinnedTags()],
        pinnedTagsAt: this.pinnedTagsAt(),
        categoryLooks: this.categoryLooks(),
        categoryLooksAt: this.categoryLooksAt(),
        cardLayers: this.cardLayers(),
        noCutShadows: this.noCutShadows(),
        plainPencil: this.plainPencil(),
        stillCards: this.stillCards(),
        fewCards: this.fewCards(),
        askNoCategory: this.askNoCategory(),
        askNoTag: this.askNoTag(),
        notesConfig: this.notesConfig(),
        notesConfigAt: this.notesConfigAt(),
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
    });
    // as escolhas de Desempenho valem no site inteiro: uma classe na raiz para cada uma que o CSS troca
    // (ver styles.scss e pages/wall-board.scss)
    effect(() => {
      const root = document.documentElement.classList;
      root.toggle('camadas', this.cardLayers());
      root.toggle('sem-sombra', this.noCutShadows());
      root.toggle('lapis-liso', this.plainPencil());
      root.toggle('fichas-paradas', this.stillCards());
    });
  }
}
