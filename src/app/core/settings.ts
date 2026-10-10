import { Injectable, computed, effect, signal } from '@angular/core';
import { fold } from './review';
import { MAX_PINNED_TAGS, sanitizeTags } from './note-labels';
import { CategoryLook, CategoryLooks, lookKey, sanitizeCategoryLooks } from './category-looks';

export const SETTINGS_KEY = 'mural-de-jogos:config:v1';
const KEY = SETTINGS_KEY;

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
  source: CoverSource;
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
}

export type FriendKinds = 'misturado' | 'separado';

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
  // Quem já tinha colado uma chave antes desta opção existir continua na RAWG.
  const source: CoverSource = raw.source === 'wikipedia' || raw.source === 'rawg' ? raw.source : rawgKey ? 'rawg' : 'wikipedia';
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
  return { rawgKey, tmdbKey, source, groupLabels, noSpoilers, scoreDisplay, ownerName, mailCount, keysAt, friendSpoilers, friendKinds, pinnedTags, pinnedTagsAt, categoryLooks, categoryLooksAt };
}

/**
 * O jeito de mostrar as notas, lido já ao carregar: `formatScore` usa em toda parte, mesmo nas telas
 * que não pedem os Ajustes.
 */
export const scoreDisplay = signal<ScoreDisplay>(readStored().scoreDisplay);

@Injectable({ providedIn: 'root' })
export class Settings {
  private readonly stored = readStored();
  readonly rawgKey = signal(this.stored.rawgKey);
  readonly tmdbKey = signal(this.stored.tmdbKey);
  /** Onde a busca de jogos procura jogos e capas. RAWG só vale com chave. */
  readonly source = signal<CoverSource>(this.stored.source);
  readonly hasRawg = computed(() => this.rawgKey().trim().length > 0);
  /** Com a chave do TMDB, filmes e séries vêm de lá (em português); sem ela, da Wikipedia. */
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

  /** Os jeitos que vieram de outro aparelho (mudados depois dos daqui). */
  applyCategoryLooks(looks: CategoryLooks, at: string): void {
    this.categoryLooks.set(sanitizeCategoryLooks(looks));
    this.categoryLooksAt.set(at);
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

  readonly effectiveSource = computed<CoverSource>(() => (this.source() === 'rawg' && this.hasRawg() ? 'rawg' : 'wikipedia'));

  constructor() {
    effect(() => {
      const data: Stored = {
        rawgKey: this.rawgKey().trim(),
        tmdbKey: this.tmdbKey().trim(),
        source: this.source(),
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
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
    });
  }
}
