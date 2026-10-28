import { DestroyRef, Injectable, InjectionToken, computed, effect, inject, signal, untracked } from '@angular/core';
import { gzip, readBackupFile } from './backup-file';
import { saveBeforeCloud } from './cloud-before';
import { Cloud } from './cloud-config';
import { CloudAccount, CloudError } from './cloud-account';
import { BrowserReset, OWNER_KEY } from './browser-reset';
import { Review, isNote, isPrivate, sanitizeReview, shelfOf, storedNote } from './review';
import { BUILD } from './build';
import { Place, SharedStore, sanitizePlaces } from './shared-store';
import { SharedPerson } from './shared-notes';
import { MAX_PINNED_TAGS, sanitizeTags } from './note-labels';
import { CategoryLooks, lookKey, sanitizeCategoryLooks, tagLookKey } from './category-looks';
import { NotesConfig, sanitizeNotesConfig } from './mural-config';
import { Profile, cardBackground, defaultProfile, publicProfile, sanitizeProfile } from './profile';
import { ProfileStore } from './profile-store';
import { KanbanBoard, KanbanState, sanitizeKanban } from './kanban';
import { KanbanStore } from './kanban-store';
import { CalendarState, calendarToSync, sanitizeCalendar } from './calendar';
import { CalendarStore } from './calendar-store';
import { SpendingState, sanitizeSpending, spendingToSync } from './spending';
import { SpendingStore } from './spending-store';
import { BackupPayload, KnownVersion, ReviewStore, canonicalJson, payloadReviews } from './review-store';
import { Settings } from './settings';
import { hideCardTitles } from './widgets';
import { Confirm } from '../ui/confirm';
import { plural } from './text';
import { KeyValueStore, SYNC_STORAGE } from './sync-storage';
import { buildOf } from './migrations';
import { DeviceTag, sanitizeDevice } from './device';
import { BLOCK_KINDS, BaseContent, BlockKind, readBaseContent, writeBaseContent } from './sync-base';
import { SyncConflict, SyncConflicts, blockDefault, sanitizeConflicts, storedConflicts } from './sync-conflicts';
import { planBlock, planBoards, planFichas, stampAfter } from './sync-merge';
import { ApiMirror } from './api-mirror';
import { ApiRequests } from './api-requests';
import { ImageStore } from './image-store';

/**
 * A sincronização do mural com a nuvem.
 *
 * O aparelho continua sendo onde se trabalha (IndexedDB); a nuvem é a cópia que junta todos. Cada
 * versão do mural na nuvem tem um número (`rev`). Para gravar, o site diz em qual rev se baseou; se
 * outro aparelho gravou antes, a nuvem recusa (409), o site baixa, junta (com a mesma junção do
 * backup, que respeita as apagadas) e tenta de novo. Nada se perde quando dois aparelhos mexem.
 *
 * "Tem algo para enviar?" é decidido pela impressão digital do conteúdo (SHA-256 do mural em JSON
 * canônico), e não por um sinal de "sujo": juntar o que veio da nuvem não gera reenvio, e uma
 * mudança feita durante um envio fica para o próximo.
 *
 * A junção é de três vias, como a do git e a das anotações compartilhadas. O aparelho lembra a base: a
 * versão de cada ficha que ele e a nuvem tinham juntos (a que baixou por último, ou a que enviou) e,
 * das que mudaram aqui desde então, o conteúdo dela (ver core/sync-base.ts). Uma ficha que mudou só de
 * um lado fica com a mudança; uma que mudou dos dois lados é juntada a partir da base, campo a campo e
 * texto a texto (ver core/sync-merge.ts), e o que os dois mudaram do mesmo jeito diferente (o mesmo
 * trecho, o mesmo título; ou apagada num e mudada no outro) vira um conflito, que a pessoa resolve
 * escolhendo uma das versões (ver core/sync-conflicts.ts). Até a escolha, as duas ficam guardadas. O
 * mesmo vale para os quadros Kanban (coluna a coluna, ficha a ficha) e para os ajustes que vão junto.
 *
 * Sem o conteúdo da base (o aparelho de antes dele, ou a ficha mudou antes de ele ser guardado), a
 * junção é a de sempre: fica a mexida por último, e a outra fica guardada em Ajustes (ver
 * core/kept-versions.ts).
 */

/** O estado da sincronização neste aparelho (localStorage; "Apagar o save" leva junto). */
export const STATE_KEY = 'meu-mural:nuvem:sync';
/** De qual conta é o mural guardado aqui (ver core/browser-reset.ts: só enquanto ela está nele). */
export { OWNER_KEY };
/**
 * A base: a versão (`updatedAt`) de cada ficha que este aparelho e a nuvem tinham juntos na última
 * sincronização, e de qual conta. Fica ao sair mantendo o mural (entrar de novo junta sem perder nada);
 * vai com "Apagar o save".
 */
export const BASE_KEY = 'meu-mural:nuvem:base';

/**
 * A versão do formato do mural na nuvem. Aumente quando `sanitizeReview`, `sanitizeNote`, `sanitizeDraft` ou
 * `sanitizeWish` passarem a guardar um campo novo, ou quando o mural da nuvem ganhar um campo: um
 * site antigo (aberto pelo cache do modo offline) que receber um mural de versão maior para de
 * sincronizar em vez de jogar fora o que não conhece. O teste "versão do formato" em
 * cloud-sync.spec.ts lembra disso.
 *
 * 2: as chaves de busca (`chaves`) passaram a ir no mural da nuvem.
 * 3: as fichas privadas (`private`, `publishedAt`). Um site antigo jogaria a marca fora e publicaria a ficha.
 * 4: de onde sai o desenho do papel (`artFrom`), depois que uma rejogada mais antiga vira a original.
 *    Um site antigo jogaria o campo fora e redesenharia as cartolinas da obra.
 * 5: as anotações (`notas`, ao lado de `reviews`). Um site antigo enviaria o mural sem elas.
 * 6: a anotação finalizada (`doneAt`) e o lugar dela no mural (`noteRank`). Um site antigo jogaria
 *    os dois fora, e a anotação voltaria a ser aberta e comum em todo aparelho.
 * 7: a categoria e as tags da anotação (`category`, `tags`, no lugar dos adesivos) e as tags fixas
 *    (`tagsFixas`, só no mural privado). Um site antigo leria a anotação sem categoria nem tags.
 * 8: a força da tinta da estampa (`patternInk`). Um site antigo jogaria o campo fora, e a estampa
 *    voltaria à tinta de sempre.
 * 9: a ficha visível sem publicar (`quiet`). Um site antigo jogaria a marca fora e avisaria quem segue.
 * 10: o desenho e a cor das categorias das anotações (`categorias`, só no mural privado). Um site
 *     antigo enviaria o mural sem eles, e os outros aparelhos voltariam ao jeito de sempre.
 * 11: o perfil (`perfil`). Um site antigo enviaria o mural sem ele, e o perfil sumiria para quem
 *     visita até outro aparelho enviar de novo.
 * 12: o mural de músicas (`musicas`, ao lado de `reviews`, e os campos do item: `form`, `sample`,
 *     `sampleTitle`, `album`). Um site antigo enviaria o mural sem elas.
 * 13: Desbotada no sol e Carregou pela metade viraram papel (`paper`, `paperSeed`), e a mancha e a
 *     decoração viraram listas de até três (`stains`, `decors`), com a build que gravou (`build`). Um
 *     site antigo leria a ficha sem as manchas, as decorações e o desbotado, e as enviaria assim.
 * 14: as configurações do mural de anotações (`muralAnotacoes`, só no mural privado: a privacidade de
 *     quem nasce, a cor da sub-nota, a ordem e o que cada categoria muda). Um site antigo enviaria o
 *     mural sem elas, e os outros aparelhos voltariam ao padrão.
 * 15: a categoria escondida nas configurações do mural (`hidden`, a aba sempre no "Mais"). Um site
 *     antigo jogaria a marca fora e a enviaria assim, e a aba voltaria para cima em todo aparelho.
 * 16: as versões guardadas (`versoes`, só no mural privado: as que perderam numa junção). Um site
 *     antigo enviaria o mural sem elas, e elas sumiriam dos outros aparelhos.
 * 17: a anotação compartilhada de outra pessoa no mural público leva de quem é (`sharedBy`). Ela só vai
 *     no público (as compartilhadas nunca vão no mural privado), mas a leitura da anotação mudou.
 *
 * 18: os quadros Kanban das anotações (`kanban`, só no mural privado, juntados quadro a quadro). Um
 *     site antigo enviaria o mural sem eles, e um aparelho novo não os receberia até outro enviar.
 * 19: cada quadro Kanban é de uma categoria (`category`, o id sai dela) e as características viraram
 *     tags das anotações. Um site antigo jogaria a categoria fora e enviaria os quadros assim.
 * 20: a ordem de cada coluna do Kanban (`sort`, a ordem e o desempate). Um site antigo jogaria a ordem
 *     fora e enviaria o quadro assim, e as colunas voltariam a ficar à mão em todo aparelho.
 * 21: as tags que nascem escondidas no filtro das anotações (`hiddenTags`, nas configurações do mural,
 *     só no mural privado). Um site antigo jogaria a lista fora e a enviaria assim, e as tags voltariam
 *     a aparecer em todo aparelho.
 * 22: o card padrão das colunas do Kanban (`look`, `dresses`) e a marca das anotações vestidas por
 *     ele (`dress`, com o visual de antes). Um site antigo jogaria os dois fora e enviaria o quadro
 *     assim, e as anotações não voltariam mais ao visual delas ao sair da coluna.
 * 23: os conflitos da junção de três vias que esperam a pessoa escolher (`conflitos`, só no mural
 *     privado, com as duas versões) e o aparelho que enviou o mural (`sync.aparelho`). Um site antigo
 *     enviaria o mural sem eles, e a versão de um aparelho num conflito sumiria dos outros.
 * 24: para onde foi o quadro Kanban de uma categoria renomeada (`movedTo`), quando cada anotação andou
 *     no quadro (o `at` da anotação no quadro, que decide a anotação mexida nos dois aparelhos) e o
 *     lugar das anotações compartilhadas no mural da pessoa (`lugares`: fixada, sub-nota). Um site
 *     antigo jogaria os três fora: o que outro aparelho mexesse no quadro de antes se perderia, e fixar
 *     uma compartilhada voltaria a valer só no aparelho em que foi feito.
 * 25: a coluna do Kanban que a seta de avançar pula (`skip`). Um site antigo jogaria a marca fora e
 *     enviaria o quadro assim, e a seta voltaria a parar nela em todo aparelho.
 * 26: os lembretes do Calendário das anotações (`calendario`, só no mural privado, juntados lembrete a
 *     lembrete). Um site antigo enviaria o mural sem eles, e eles sumiriam da nuvem.
 * 27: o lembrete ligado ao Google Agenda (`google`), as repetições que vêm de lá (`every`, `days`,
 *     `until`) e os eventos do Google a apagar (`googleTrash`). Um site antigo jogaria os campos fora e,
 *     sem o `google`, o outro aparelho mandaria tudo de novo como mudança.
 * 28: o lembrete de vários dias e a hora do fim (`end`, `endTime`), as repetições que faltavam do Google
 *     (`nth`, `count`, `strict`, `weekStart`), a marcação que não avisa (`quiet`) e o que o Google já sabe
 *     dele (`google.skip`, `google.quiet`). Um site antigo jogaria os campos fora e enviaria o lembrete
 *     assim: a viagem voltaria a ter um dia só e a repetição mudaria nos outros aparelhos.
 * 29: os grupos das anotações e as colunas do Kanban escolhem o ícone na mesma cartela (a soma das duas
 *     de antes, ver core/icon-choices.ts). Um site antigo jogaria fora o ícone que a cartela dele não
 *     tinha (o grupo ficaria com o de sempre, a coluna com o círculo) e enviaria assim.
 * 30: as dependências de uma anotação no quadro Kanban (`deps`). Um site antigo jogaria o campo fora e
 *     enviaria o quadro assim, e as dependências sumiriam em todo aparelho.
 * 31: o status de uma anotação no quadro Kanban (`status`, as palavras ao lado da importância). Um site
 *     antigo jogaria o campo fora e enviaria o quadro assim, e o status sumiria em todo aparelho.
 * 32: a anotação do quadro Kanban que fica só no Kanban, ou também no mural (`wall`), e o grupo cujas
 *     anotações do quadro ficam só no Kanban (`kanbanOnly`, nas configurações do mural). Um site antigo
 *     jogaria os dois fora e enviaria assim, e as anotações voltariam ao mural em todo aparelho.
 * 33: as anotações do quadro ficam só no Kanban por padrão, e o grupo que as quer no mural também
 *     guarda `kanbanOnly: false`. Um site da 32 jogaria o `false` fora e enviaria assim, e o grupo
 *     voltaria a esconder as anotações do quadro em todo aparelho.
 * 34: a aba "Tudo" do mural de anotações aparece só com `showAll` (nas configurações do mural). Um site
 *     da 33 jogaria o campo fora e enviaria assim, e a aba sumiria de novo em todo aparelho.
 * 35: o assunto da anotação (`subject`, entre o grupo e as tags) e os assuntos criados nas
 *     configurações do mural (`subjects`, por grupo). Um site da 34 jogaria os dois fora e enviaria
 *     assim, e o assunto sumiria das anotações em todo aparelho.
 * 36: o grupo, o assunto e as tags das anotações compartilhadas são de cada pessoa e vão no lugar delas
 *     (`lugares`: `category`, `subject`, `tags`, `org`). Um site da 35 jogaria os quatro fora e enviaria
 *     assim, e a compartilhada voltaria a "Sem grupo" nos outros aparelhos.
 * 37: a visualização com que cada grupo abre no mural (`view`, nas configurações do mural). Um site da
 *     36 jogaria o campo fora e enviaria assim, e o grupo voltaria a abrir na última usada.
 * 38: o livro-caixa dos Gastos (`gastos`, só no mural privado, juntado lançamento a lançamento). Um site
 *     antigo enviaria o mural sem ele, e os gastos sumiriam da nuvem.
 * 39: se cada saída dos Gastos precisava (`need`: luxo, conforto ou indispensável). Um site da 38 jogaria o
 *     campo fora e enviaria o lançamento assim, e a resposta sumiria em todo aparelho.
 * 40: com quem foi cada saída dos Gastos (`people`) e as pessoas do livro (`people` em `gastos`). Um site
 *     da 39 jogaria os dois fora e enviaria assim, e os gastos voltariam a ser só seus em todo aparelho.
 * 41: o mês em que um lançamento dos Gastos conta (`shift`, a fatura de antes ou a de depois). Um site da 40
 *     jogaria o campo fora e enviaria assim, e a compra voltaria para o mês do dia em todo aparelho.
 *
 * Tirar um campo não pede versão nova (só a impressão do teste muda): o site antigo continua lendo o
 * que conhece, só não recebe mais o que saiu. Saiu assim o tamanho da anotação (`noteSize`, 1.23.9).
 */
export const SYNC_SCHEMA = 41;

export { SYNC_STORAGE };
export type { KeyValueStore };

/**
 * As chaves de busca (RAWG e TMDB) e quando mudaram. Vão só no mural privado da nuvem: nunca no
 * arquivo de backup nem no mural que os outros veem. A mudança mais nova vale.
 */
export interface SyncedKeys {
  rawg: string;
  tmdb: string;
  em: string;
}

/** As chaves que vieram da nuvem, ou null se não vieram (ou não servem). */
export function keysOf(data: Record<string, unknown>): SyncedKeys | null {
  const raw = data['chaves'] as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const rawg = typeof raw['rawg'] === 'string' ? raw['rawg'].trim().slice(0, 200) : '';
  const tmdb = typeof raw['tmdb'] === 'string' ? raw['tmdb'].trim().slice(0, 600) : '';
  const em = typeof raw['em'] === 'string' && Number.isFinite(Date.parse(raw['em'])) ? raw['em'] : null;
  return em ? { rawg, tmdb, em } : null;
}

/**
 * As tags fixas das anotações e quando mudaram (ver `Settings.pinnedTags`). Vão só no mural privado
 * da nuvem, como as chaves; a lista mudada por último vale.
 */
export interface SyncedTags {
  lista: string[];
  em: string;
}

/** As tags fixas que vieram da nuvem, ou null se não vieram (ou não servem). */
export function pinnedTagsOf(data: Record<string, unknown>): SyncedTags | null {
  const raw = data['tagsFixas'] as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const em = typeof raw['em'] === 'string' && Number.isFinite(Date.parse(raw['em'])) ? raw['em'] : null;
  return em ? { lista: sanitizeTags(raw['lista'], MAX_PINNED_TAGS), em } : null;
}

/**
 * O desenho e a cor das categorias das anotações e quando mudaram (ver `Settings.categoryLooks`). Vão
 * só no mural privado da nuvem, como as tags fixas; os mudados por último valem.
 */
export interface SyncedLooks {
  mapa: CategoryLooks;
  em: string;
}

/** Os jeitos das categorias que vieram da nuvem, ou null se não vieram (ou não servem). */
export function categoryLooksOf(data: Record<string, unknown>): SyncedLooks | null {
  const raw = data['categorias'] as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const em = typeof raw['em'] === 'string' && Number.isFinite(Date.parse(raw['em'])) ? raw['em'] : null;
  return em ? { mapa: sanitizeCategoryLooks(raw['mapa']), em } : null;
}

/**
 * As configurações do mural de anotações e quando mudaram (ver `Settings.notesConfig`). Vão só no
 * mural privado da nuvem, como as tags fixas; as mudadas por último valem.
 */
export interface SyncedNotesConfig {
  dados: NotesConfig;
  em: string;
}

/** As configurações do mural de anotações que vieram da nuvem, ou null se não vieram (ou não servem). */
export function notesConfigOf(data: Record<string, unknown>): SyncedNotesConfig | null {
  const raw = data['muralAnotacoes'] as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const em = typeof raw['em'] === 'string' && Number.isFinite(Date.parse(raw['em'])) ? raw['em'] : null;
  return em ? { dados: sanitizeNotesConfig(raw['dados']), em } : null;
}

/**
 * Os quadros Kanban das anotações (ver core/kanban.ts). Vão só no mural privado da nuvem e, ao
 * contrário dos outros ajustes, não valem inteiros pela data: cada quadro vem de quem o mudou por
 * último (`mergeKanban`), então mexer em quadros diferentes em dois aparelhos nunca perde nada.
 */
export function kanbanOf(data: Record<string, unknown>): KanbanState | null {
  const raw = data['kanban'];
  if (!raw || typeof raw !== 'object') return null;
  return sanitizeKanban(raw);
}

/** Os quadros que vieram, como este aparelho os enviaria (a impressão compara um com o outro). */
export function kanbanPrintOf(data: Record<string, unknown>): Partial<KanbanState> | null {
  const k = kanbanOf(data);
  return k && kanbanToSync(k);
}

/**
 * Os lembretes do Calendário (ver core/calendar.ts). Vão só no mural privado da nuvem, juntados
 * lembrete a lembrete: vale o mudado por último, e o apagado fica apagado (`mergeCalendar`).
 */
export function calendarOf(data: Record<string, unknown>): CalendarState | null {
  const raw = data['calendario'];
  if (!raw || typeof raw !== 'object') return null;
  return sanitizeCalendar(raw);
}

/** Os lembretes que vieram, como este aparelho os enviaria (a impressão compara um com o outro). */
export function calendarPrintOf(data: Record<string, unknown>): CalendarState | null {
  const c = calendarOf(data);
  return c && calendarToSync(c);
}

/**
 * O livro-caixa dos Gastos (ver core/spending.ts). Vai só no mural privado da nuvem, juntado lançamento a
 * lançamento e categoria a categoria: vale o mudado por último, e o apagado fica apagado (`mergeSpending`).
 */
export function spendingOf(data: Record<string, unknown>): SpendingState | null {
  const raw = data['gastos'];
  if (!raw || typeof raw !== 'object') return null;
  return sanitizeSpending(raw);
}

/** O livro que veio, como este aparelho o enviaria (a impressão compara um com o outro). */
export function spendingPrintOf(data: Record<string, unknown>): SpendingState | null {
  const g = spendingOf(data);
  return g && spendingToSync(g);
}

/**
 * O lugar das anotações compartilhadas no mural da pessoa (fixada no topo; ver `Place` em
 * core/shared-store.ts). Vai só no mural privado: é da pessoa, para os outros aparelhos dela, e não da
 * anotação. Cada um vale pelo mudado por último.
 */
export function placesOf(data: Record<string, unknown>): Record<string, Place> | null {
  const map = sanitizePlaces(data['lugares']);
  return map.size ? Object.fromEntries(map) : null;
}

/** Os quadros que vão para a nuvem: null sem nenhum (o mural de antes deles tem a mesma impressão). */
export function kanbanToSync(state: KanbanState): Partial<KanbanState> | null {
  if (!state.boards.length && !state.legacy.length && !Object.keys(state.removed).length) return null;
  // os de antes só existem até a conversão (logo ao abrir): depois dela, nem a chave vai
  if (state.legacy.length) return state;
  return { boards: state.boards, removed: state.removed, ...(state.movedTo && Object.keys(state.movedTo).length ? { movedTo: state.movedTo } : {}) };
}

/**
 * O perfil e quando mudou (ver core/profile-store.ts). Vai no mural privado da nuvem, como os jeitos
 * das categorias (o mudado por último vale), e no público só com as fichas públicas.
 */
export interface SyncedProfile {
  dados: Profile;
  em: string;
}

/** O perfil que veio da nuvem, ou null se não veio (ou não serve). */
export function profileOf(data: Record<string, unknown>): SyncedProfile | null {
  const raw = data['perfil'] as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const em = typeof raw['em'] === 'string' && Number.isFinite(Date.parse(raw['em'])) ? raw['em'] : null;
  const dados = sanitizeProfile(raw['dados']);
  return em && dados ? { dados, em } : null;
}

/** Os ids das fichas e das anotações (das públicas: tudo o que os outros veem). */
export function publicIds(reviews: readonly Review[], notes: readonly unknown[]): Set<string> {
  const ids = new Set(reviews.map((r) => r.id));
  for (const n of notes) {
    const id = (n as { id?: unknown } | null)?.id;
    if (typeof id === 'string') ids.add(id);
  }
  return ids;
}

/**
 * O ícone e a cor que vão no mural público: só os das categorias e das tags das anotações publicadas
 * (o nome de uma categoria ou tag usada só nas privadas fica com a pessoa).
 */
export function publicCategoryLooks(looks: CategoryLooks, notes: readonly unknown[]): CategoryLooks {
  const used = new Set<string>();
  for (const n of notes) {
    const { category, tags } = (n ?? {}) as { category?: unknown; tags?: unknown };
    if (typeof category === 'string') used.add(lookKey(category));
    // a cor da tag na categoria da anotação, e a de sempre da tag, que vale onde a categoria não escolheu
    const cat = typeof category === 'string' ? category : '';
    if (Array.isArray(tags)) for (const t of tags) if (typeof t === 'string') used.add(tagLookKey(t)).add(tagLookKey(t, cat));
  }
  return Object.fromEntries(Object.entries(looks).filter(([k]) => used.has(k)));
}

/**
 * A ficha como vai para quem visita: as notas coladas no texto que são fichas fora da vista
 * (`hidden`: os ids, ou quem diz se um id está fora) perdem o título (ver `hideCardTitles`).
 */
export function shownCard<T>(card: T, hidden: ReadonlySet<string> | ((id: string) => boolean)): T {
  const text = (card as { text?: unknown } | null)?.text;
  if (typeof text !== 'string') return card;
  const next = hideCardTitles(text, hidden);
  return next === text ? card : { ...card, text: next };
}

/**
 * O perfil como vai para quem visita: as seções só com as fichas à mostra (`shown`, ver
 * `publicProfile`) e, no "Sobre mim", as notas coladas que não estão à mostra sem o título.
 */
export function shownProfile(p: Profile, shown: ReadonlySet<string>): Profile {
  const out = publicProfile(p, shown);
  const about = hideCardTitles(out.about, (id) => !shown.has(id));
  return about === out.about ? out : { ...out, about };
}

/** Qual chave vale: a mais nova; sem data aqui, vale a da nuvem. */
export function newerKeys(local: SyncedKeys | null, remote: SyncedKeys | null): 'local' | 'remote' {
  if (!remote) return 'local';
  if (!local) return 'remote';
  return remote.em > local.em ? 'remote' : 'local';
}

/** O site recusa enviar um mural compactado maior que isso (a nuvem aceita até 1,9 MB). */
export const MAX_GZ_BYTES = 1_800_000;
const MINUTE = 60_000;
/** Resenhas e anotações criadas (ou tornadas públicas) há até 7 dias contam como novas para avisar quem segue. */
const NEW_REVIEW_DAYS = 7;
const MAX_NEW = 10;

/** O que os outros veem do mural: tudo, menos as fichas privadas. */
export function publicReviews(reviews: readonly Review[]): Review[] {
  return reviews.filter((r) => !isPrivate(r));
}

/**
 * As anotações que os outros veem: só as publicadas (a anotação nasce privada) e fora das que estão só
 * no Kanban (`boardOnly`, ver `KanbanStore.boardOnly`): a que não está no mural do dono também não
 * está no de quem visita.
 */
export function publicNotes(notes: unknown, boardOnly: ReadonlySet<string> = new Set()): unknown[] {
  if (!Array.isArray(notes)) return [];
  return notes.filter((n) => {
    const r = n as { id?: unknown; private?: unknown } | null;
    return r?.private !== true && !(typeof r?.id === 'string' && boardOnly.has(r.id));
  });
}

/**
 * As anotações públicas que estão só no Kanban: fora do mural (do dono e de quem visita), mas com o
 * link da ficha (ver core/ficha-link.ts). Vão no público à parte, em `soKanban`, que o mural de quem
 * visita não lê; não viram aviso nem contam no cartão.
 */
export function boardOnlyNotes(notes: unknown, boardOnly: ReadonlySet<string>): unknown[] {
  if (!Array.isArray(notes)) return [];
  return notes.filter((n) => {
    const r = n as { id?: unknown; private?: unknown } | null;
    return r?.private !== true && typeof r?.id === 'string' && boardOnly.has(r.id);
  });
}

/**
 * A regra do que vai para o mural público. Ela entra na impressão do público (ver `publicPrint`):
 * mudar a regra (subir o número) faz cada aparelho reenviar o público uma vez, sem esperar a pessoa
 * mexer em algo. 2: as anotações que estão só no Kanban saem do público. 3: elas voltam ao público à
 * parte (`soKanban`), fora do mural de quem visita, para o link da ficha. 4: a nota colada perde o
 * título sempre que não está à mostra (também a apagada e a de outra pessoa numa compartilhada) e
 * também no "Sobre mim" do perfil.
 */
export const PUBLIC_RULES = 4;

/**
 * A impressão do público que foi junto com este mural privado (`sync.publico`, ver `publicPrint`):
 * quem baixa o mural sabe se o público da nuvem já está como o daqui faria. Vazia num mural enviado
 * por um site de antes dela, que então é refeito uma vez.
 */
function publicPrintOf(data: Record<string, unknown>): string {
  const p = (data['sync'] as { publico?: unknown } | undefined)?.publico;
  return typeof p === 'string' ? p : '';
}

/**
 * As fichas que viram aviso para quem segue: as publicadas que apareceram nos últimos 7 dias (a só
 * visível fica no mural, mas não avisa). Uma ficha que era privada ou só visível aparece quando
 * passa a ser publicada (`publishedAt`), não quando foi escrita. A nuvem só avisa uma vez de cada
 * ficha, então mandar de novo não repete o aviso.
 */
export function newReviews(reviews: readonly Review[], now: number): { ref: string; titulo: string; mural: Review['kind'] }[] {
  const since = now - NEW_REVIEW_DAYS * 24 * 60 * MINUTE;
  const shownAt = (r: Review) => Date.parse(r.publishedAt ?? r.createdAt);
  return publicReviews(reviews)
    .filter((r) => !r.quiet && shownAt(r) >= since)
    .sort((a, b) => shownAt(b) - shownAt(a))
    .slice(0, MAX_NEW)
    .map((r) => ({ ref: r.id, titulo: r.game.name, mural: r.kind }));
}
/** As anotações do envio (`notas`, guardadas à parte), como fichas para `newReviews`. */
function notesOf(notes: unknown): Review[] {
  if (!Array.isArray(notes)) return [];
  return notes.filter((n): n is Review => {
    const r = n as Partial<Review> | null;
    return typeof r?.id === 'string' && typeof r.game?.name === 'string' && typeof r.createdAt === 'string';
  });
}

/**
 * Válvula de segurança contra um laço de envios (algo errado na junção, a nuvem esquecendo o mural):
 * o mesmo conteúdo enviado 3 vezes em 10 minutos, ou mais de 30 envios. Quem edita de verdade manda
 * um conteúdo novo a cada vez, uns segundos depois de parar de mexer, e não chega perto disso.
 */
const MAX_PUSHES_PER_10_MIN = 30;
const MAX_SAME_PUSHES_PER_10_MIN = 3;
const PUSH_WINDOW = 10 * 60_000;

export type SyncStatus =
  | 'fora' // sem conta ou nuvem desligada
  | 'sincronizando'
  | 'ok'
  | 'sem-rede' // tentando de novo sozinho
  | 'pausado' // a nuvem pediu para esperar (cota, só leitura, desligada)
  | 'escolha' // primeira vez neste aparelho: falta a pessoa decidir
  | 'desatualizado' // o mural na nuvem é de uma versão mais nova do site
  | 'erro';

interface SyncState {
  /** A conta (id) a que este estado se refere. */
  conta: string;
  /** A rev da nuvem que este aparelho já tem juntada. */
  rev: number;
  /** A impressão digital do mural quando ele e a nuvem eram iguais pela última vez. */
  impressao: string;
  /** Quando a última sincronização terminou bem (ms). */
  em: number | null;
  /**
   * A impressão do que vai no público e não está no privado (ver `publicPrint`): as anotações
   * compartilhadas públicas, as que estão só no Kanban e a regra do público. Mudar uma pede um envio.
   */
  publicas?: string;
}

type Remote = { kind: 'same' } | { kind: 'none' } | { kind: 'doc'; rev: number; text: string; data: Record<string, unknown> };

/** Sincronizar sozinho (ao abrir, ao mudar algo, de tempos em tempos). Os testes desligam e chamam à mão. */
export const SYNC_AUTO = new InjectionToken<boolean>('SYNC_AUTO', { providedIn: 'root', factory: () => true });

function readState(kv: KeyValueStore): SyncState | null {
  try {
    const raw = JSON.parse(kv.getItem(STATE_KEY) ?? 'null') as Partial<SyncState> | null;
    if (!raw || typeof raw.conta !== 'string' || !Number.isSafeInteger(raw.rev) || typeof raw.impressao !== 'string') return null;
    return {
      conta: raw.conta,
      rev: raw.rev!,
      impressao: raw.impressao,
      em: typeof raw.em === 'number' ? raw.em : null,
      ...(typeof raw.publicas === 'string' ? { publicas: raw.publicas } : {}),
    };
  } catch {
    return null;
  }
}

const byId = <T extends { id: string }>(list: readonly T[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** A versão de cada ficha de um mural (o daqui ou o da nuvem): id → `updatedAt`. */
export function versionsOf(doc: { reviews?: unknown; notas?: unknown; musicas?: unknown }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const list of [doc.reviews, doc.notas, doc.musicas]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const r = item as { id?: unknown; updatedAt?: unknown } | null;
      if (typeof r?.id === 'string' && typeof r.updatedAt === 'string') out[r.id] = r.updatedAt;
    }
  }
  return out;
}

/** A impressão digital do conteúdo do mural (sem a data do backup nem o nome), com as chaves se houver. */
export async function fingerprint(
  doc: Pick<BackupPayload, 'reviews' | 'notas' | 'musicas' | 'drafts' | 'wishes' | 'deleted' | 'versoes'>,
  keys: SyncedKeys | null = null,
  tags: SyncedTags | null = null,
  looks: SyncedLooks | null = null,
  profile: SyncedProfile | null = null,
  config: SyncedNotesConfig | null = null,
  kanban: Partial<KanbanState> | null = null,
  conflicts: readonly unknown[] | null = null,
  places: Record<string, Place> | null = null,
  calendar: CalendarState | null = null,
  spending: SpendingState | null = null,
): Promise<string> {
  const notes = Array.isArray(doc.notas) ? (doc.notas as { id: string }[]) : [];
  const music = Array.isArray(doc.musicas) ? doc.musicas : [];
  // as versões guardadas, na mesma ordem venha de onde vier (só quando há alguma: o mural de antes delas
  // continua com a mesma impressão)
  const kept = Array.isArray(doc.versoes)
    ? (doc.versoes as { ficha?: { id?: string; updatedAt?: string } }[])
        .map((v) => [`${v?.ficha?.id}@${v?.ficha?.updatedAt}`, v] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, v]) => v)
    : [];
  const text = canonicalJson({
    reviews: byId(doc.reviews ?? []),
    // só com anotações (ou com músicas): o mural de antes delas continua com a mesma impressão
    ...(notes.length ? { notas: byId(notes) } : {}),
    ...(music.length ? { musicas: byId(music) } : {}),
    drafts: byId(doc.drafts ?? []),
    wishes: byId(doc.wishes ?? []),
    deleted: doc.deleted ?? { reviews: {}, drafts: {}, wishes: {} },
    ...(kept.length ? { versoes: kept } : {}),
    ...(keys ? { chaves: keys } : {}),
    ...(tags ? { tagsFixas: tags } : {}),
    // `publico`: desde a 1.28.5 os jeitos vão também no mural público; a impressão nova faz quem já
    // tinha escolhido algum enviar o mural uma vez, para os outros passarem a vê-los
    ...(looks ? { categorias: { ...looks, publico: 2 } } : {}),
    ...(profile ? { perfil: profile } : {}),
    ...(config ? { muralAnotacoes: config } : {}),
    ...(kanban ? { kanban } : {}),
    // os conflitos, na mesma ordem venha de onde vier (só com algum: o mural de antes deles tem a mesma impressão)
    ...(conflicts?.length ? { conflitos: [...conflicts].map((c) => [canonicalJson(c), c] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, c]) => c) } : {}),
    ...(places ? { lugares: places } : {}),
    // só com lembretes (ou apagados): o mural de antes do Calendário continua com a mesma impressão
    ...(calendar ? { calendario: calendar } : {}),
    // só com gastos: o mural de antes deles continua com a mesma impressão
    ...(spending ? { gastos: spending } : {}),
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** As apagadas do mural que veio da nuvem (id → quando). */
export function deletedOf(data: Record<string, unknown>): Record<string, string> {
  const raw = (data['deleted'] as Record<string, unknown> | undefined)?.['reviews'];
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
}

/**
 * O mural que veio da nuvem com as fichas juntadas no lugar das de lá (ver core/sync-merge.ts): cada
 * uma na lista em que mora (a anotação sem as notas, como no mural), as outras como vieram.
 */
export function withFichas(data: Record<string, unknown>, fichas: readonly Review[]): Record<string, unknown> {
  const ids = new Set(fichas.map((r) => r.id));
  const out: Record<string, unknown> = { ...data };
  for (const key of ['reviews', 'notas', 'musicas']) {
    const list = Array.isArray(data[key]) ? (data[key] as unknown[]) : [];
    out[key] = list.filter((x) => !ids.has((x as { id?: unknown } | null)?.id as string));
  }
  for (const r of fichas) (out[shelfOf(r)] as unknown[]).push(isNote(r) ? storedNote(r) : r);
  return out;
}

/** Os ajustes que vieram da nuvem: os dados de cada um e quando mudou (null: não veio). */
export function blocksOf(data: Record<string, unknown>): Record<BlockKind, { dados: unknown; em: string } | null> {
  const keys = keysOf(data);
  const tags = pinnedTagsOf(data);
  const looks = categoryLooksOf(data);
  const config = notesConfigOf(data);
  const profile = profileOf(data);
  return {
    chaves: keys && { dados: { rawg: keys.rawg, tmdb: keys.tmdb }, em: keys.em },
    tagsFixas: tags && { dados: tags.lista, em: tags.em },
    categorias: looks && { dados: looks.mapa, em: looks.em },
    muralAnotacoes: config && { dados: config.dados, em: config.em },
    perfil: profile && { dados: profile.dados, em: profile.em },
  };
}

/** Os conflitos que vieram, como este aparelho os enviaria (a impressão compara um com o outro). */
export function conflictsPrintOf(data: Record<string, unknown>): unknown[] | null {
  const list = sanitizeConflicts(data['conflitos'], buildOf(data));
  return list.length ? storedConflicts(list) : null;
}

/** O mural na nuvem é de uma versão do formato mais nova do que este site sabe ler? */
export function isNewerSchema(data: Record<string, unknown>): boolean {
  const schema = (data['sync'] as { schema?: unknown } | undefined)?.schema;
  return typeof schema === 'number' && schema > SYNC_SCHEMA;
}

@Injectable({ providedIn: 'root' })
export class CloudSync {
  private readonly cloud = inject(Cloud);
  private readonly account = inject(CloudAccount);
  private readonly store = inject(ReviewStore);
  private readonly settings = inject(Settings);
  private readonly profiles = inject(ProfileStore);
  private readonly confirm = inject(Confirm);
  private readonly kv = inject(SYNC_STORAGE);
  /** As anotações compartilhadas: as públicas vão no mural que os outros veem (ver `push`). */
  private readonly shared = inject(SharedStore);
  private readonly kanban = inject(KanbanStore);
  /** O espelho da API das AIs (PLANO-API.md, seção 8): sobe depois de cada rodada que deixou tudo igual. */
  private readonly apiMirror = inject(ApiMirror);
  /** Os pedidos da API das AIs (PLANO-API.md, seção 9): aplicados aqui, depois de uma rodada que deixou tudo igual. */
  private readonly requests = inject(ApiRequests);
  private readonly calendar = inject(CalendarStore);
  private readonly spending = inject(SpendingStore);
  private readonly reset = inject(BrowserReset);
  private readonly images = inject(ImageStore);
  /** Os conflitos da junção que esperam a pessoa (vão no mural privado da nuvem). */
  private readonly conflicts = inject(SyncConflicts);
  /** Este aparelho, para o conflito dizer de onde veio cada versão. */
  private readonly device: DeviceTag = this.conflicts.device;

  readonly status = signal<SyncStatus>('fora');
  /** O que mostrar junto do estado (erros e avisos), já em português. */
  readonly message = signal<string | null>(null);
  readonly lastSyncAt = signal<number | null>(readState(this.kv)?.em ?? null);
  /** Diferença entre o relógio da nuvem e o deste aparelho (ms; positivo: o aparelho está atrasado). */
  readonly clockSkew = signal(0);
  readonly clockWrong = computed(() => Math.abs(this.clockSkew()) > 5 * MINUTE);
  readonly active = computed(() => this.account.signedIn() && this.cloud.config() !== null);

  private timer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  /** Os envios dos últimos 10 minutos: quando e a impressão digital do que foi. */
  private pushes: { at: number; print: string }[] = [];
  /** A rodada em andamento (null: nenhuma). */
  private current: Promise<void> | null = null;
  private rerun = false;
  /** A primeira sincronização deste aparelho espera a pessoa escolher (não pergunta de novo sozinha). */
  private waitingChoice = false;
  /** O mural local mudou por causa da própria sincronização: não agenda outra por isso. */
  private applying = false;
  private lastAttempt = 0;
  /** As fichas e os quadros como estavam na última vez que a base olhou (ver `captureBase`). */
  private seenReviews: readonly Review[] = this.store.reviews();
  private seenBoards: readonly KanbanBoard[] = this.kanban.state().boards;

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => clearTimeout(this.timer));
    // a ficha (ou o quadro) da base mudou aqui: a versão de antes fica guardada para a junção de três vias
    effect(() => {
      this.store.reviews();
      this.kanban.state();
      untracked(() => this.captureBase());
    });
    if (!inject(SYNC_AUTO)) return;
    // Saiu da conta por outro caminho (a sessão venceu, "Sair de todos" em outro aparelho, a conta
    // apagada): o mural dela não fica neste navegador (ver core/browser-reset.ts)
    let wasIn = untracked(() => this.account.signedIn());
    effect(() => {
      const signedIn = this.account.signedIn();
      if (wasIn && !signedIn) untracked(() => this.leftAccount());
      wasIn = signedIn;
    });
    // Entrou (ou a nuvem ligou): sincroniza já. Saiu: para.
    effect(() => {
      if (this.active()) {
        untracked(() => this.schedule(0));
      } else {
        untracked(() => {
          clearTimeout(this.timer);
          this.status.set('fora');
          this.message.set(null);
          this.waitingChoice = false;
        });
      }
    });

    // um pedido da API aprovado aqui: uma rodada já, para ele entrar na hora
    effect(() => {
      if (!this.requests.wake()) return;
      untracked(() => this.active() && this.schedule(0));
    });

    // Mudou algo no mural, uma chave de busca, as tags fixas, o jeito das categorias ou o perfil:
    // envia uns segundos depois da última mudança.
    let first = true;
    effect(() => {
      this.store.reviews();
      this.store.drafts();
      this.store.wishes();
      this.store.lastChangeAt();
      this.settings.rawgKey();
      this.settings.tmdbKey();
      this.settings.keysAt();
      this.settings.pinnedTagsAt();
      this.settings.categoryLooksAt();
      this.settings.notesConfigAt();
      this.kanban.state();
      this.calendar.state();
      this.spending.state();
      this.shared.places();
      this.profiles.changedAt();
      this.conflicts.list();
      if (first) {
        first = false;
        return;
      }
      untracked(() => {
        if (this.active() && !this.applying && !this.waitingChoice) this.schedule(5_000);
      });
    });

    if (typeof window !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible' && this.active() && Date.now() - this.lastAttempt > MINUTE) this.schedule(0);
      };
      const onOnline = () => this.active() && this.schedule(0);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onOnline);
      const every = setInterval(() => {
        if (document.visibilityState === 'visible' && this.active()) this.schedule(0);
      }, 5 * MINUTE);
      // os pedidos da API das AIs: a cada minuto, também com a aba escondida (decisão D2 do plano); com
      // algum pendente, uma rodada aplica
      const requests = setInterval(() => {
        if (!this.active() || !this.requests.watching(document.visibilityState === 'visible')) return;
        void this.requests.peek().then((due) => due && this.schedule(0));
      }, MINUTE);
      destroy.onDestroy(() => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onOnline);
        clearInterval(every);
        clearInterval(requests);
      });
    }
  }

  /** Sincroniza agora (o botão em Ajustes). Também é a volta da primeira sincronização adiada. */
  async syncNow(): Promise<void> {
    this.waitingChoice = false;
    clearTimeout(this.timer);
    // uma rodada no meio: espera ela e roda outra (quem chama quer o que mudou até agora já enviado)
    while (this.current) await this.current.catch(() => undefined);
    await this.run();
  }

  private schedule(ms: number): void {
    if (this.waitingChoice) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  private async run(): Promise<void> {
    if (this.current) {
      this.rerun = true;
      return;
    }
    try {
      this.current = this.withLock(() => this.syncOnce());
      await this.current;
    } finally {
      this.current = null;
      if (this.rerun) {
        this.rerun = false;
        this.schedule(1_000);
      }
    }
  }

  /** Uma aba por vez (as outras esperam a vez e acham tudo já feito). */
  private async withLock(fn: () => Promise<void>): Promise<void> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks?.request) await locks.request('meu-mural:sync', fn);
    else await fn();
  }

  private async syncOnce(): Promise<void> {
    if (!this.active()) return;
    const account = this.account.account();
    if (!account?.id) {
      // conta de antes do id: busca o id e volta
      await this.account.refresh().catch(() => undefined);
      if (!this.account.account()?.id) return this.fail(new CloudError('Não consegui falar com a nuvem agora.', 'sem-rede', 0));
    }
    const accountId = this.account.account()!.id!;
    this.lastAttempt = Date.now();
    this.status.set('sincronizando');
    this.message.set(null);
    try {
      let state = readState(this.kv);
      if (state && state.conta !== accountId) state = null;
      // o mural que já sincroniza com esta conta sem o dono marcado (um aparelho que entrou antes de o dono
      // existir): ele é desta conta. Sem a marca, a subida não o limparia se a sessão sumisse, e ele ficaria
      // como de ninguém, podendo ir para outra conta (ver core/browser-reset.ts)
      if (state && this.kv.getItem(OWNER_KEY) === null) this.writeOwner(accountId);
      if (!state) {
        state = await this.firstSync(accountId);
        if (!state) return;
      }
      state = await this.pullAndPush(state);
      // os pedidos da API das AIs entram pelas lojas, sobem numa rodada a mais e só então são concluídos
      if (await this.requests.applyOpen(this.device.id)) state = await this.pullAndPush(state);
      await this.requests.conclude();
      this.failures = 0;
      this.status.set('ok');
    } catch (err) {
      this.fail(err);
    }
  }

  /** Baixa o que mudou na nuvem, junta, e envia se o mural daqui ficou diferente do de lá. */
  private async pullAndPush(state: SyncState): Promise<SyncState> {
    let remote = await this.fetchRemote(state.rev);
    // quando o mural daqui foi lido para comparar e enviar: o que mudou depois (durante o envio) ainda
    // não está na nuvem, e o "salvo em" não pode passar por cima disso (ver o aviso do link da ficha)
    let takenAt = Date.now();
    for (let attempt = 0; ; attempt++) {
      if (remote.kind === 'doc') {
        if (isNewerSchema(remote.data)) throw this.outdated();
        this.integrate(state.conta, remote, this.knownFor(state));
        // o público da nuvem agora é o que veio com este mural (de outro aparelho, talvez com outra regra)
        state = { ...state, rev: remote.rev, publicas: publicPrintOf(remote.data) };
        const here = await fingerprint(this.store.snapshot(), this.localKeys(), this.localTags(), this.localLooks(), this.localProfile(), this.localConfig(), this.localKanban(), this.conflicts.toSync(), this.localPlaces(), this.localCalendar(), this.localSpending());
        if (here === (await this.remotePrint(remote.data))) state = { ...state, impressao: here };
        this.writeState(state);
      } else if (remote.kind === 'none' && state.rev !== 0) {
        // a nuvem perdeu o mural (conta recriada, banco restaurado): recomeça do zero, sem apagar nada aqui
        state = { ...state, rev: 0, impressao: '' };
        this.writeState(state);
      }

      takenAt = Date.now();
      const doc = this.store.snapshot(this.account.account()?.nome ?? '');
      const keys = this.localKeys();
      const tags = this.localTags();
      const looks = this.localLooks();
      const profile = this.localProfile();
      const config = this.localConfig();
      const kanban = this.localKanban();
      const places = this.localPlaces();
      const conflitos = this.conflicts.toSync();
      const calendario = this.localCalendar();
      const gastos = this.localSpending();
      const here = await fingerprint(doc, keys, tags, looks, profile, config, kanban, conflitos, places, calendario, gastos);
      const publicas = await this.publicPrint();
      if (here === state.impressao && publicas === (state.publicas ?? '')) break;
      if (attempt >= 3) throw new CloudError('Outros aparelhos estão gravando ao mesmo tempo. Tento de novo daqui a pouco.', 'conflito', 409);
      try {
        const boards = this.kanban.state().boards;
        const blocks = this.blocksNow();
        const rev = await this.push(doc, state.rev, keys, tags, looks, profile, config, kanban, conflitos, places, calendario, gastos, here + publicas, publicas);
        state = { ...state, rev, impressao: here, publicas };
        this.writeState(state);
        this.writeBase(state.conta, versionsOf(doc));
        this.rebaseAfterPush(state.conta, doc, boards, blocks);
        break;
      } catch (err) {
        if (!(err instanceof CloudError && err.status === 409)) throw err;
        remote = await this.fetchRemote(); // outro aparelho gravou antes: baixa tudo, junta e tenta de novo
      }
    }
    const now = takenAt;
    this.writeState({ ...state, em: now });
    this.lastSyncAt.set(now);
    // aqui o aparelho e a nuvem estão iguais na rev de agora: o espelho reflete essa (sem esperar, e
    // sem nunca atrapalhar a sincronização)
    void this.apiMirror.afterSync(state.rev);
    return { ...state, em: now };
  }

  /**
   * A primeira vez desta conta neste aparelho. Devolve o estado pronto para seguir, ou null quando
   * ficou esperando a pessoa escolher (ou quando o navegador vai ser limpo e a página recarrega).
   *
   * O mural daqui é de alguém (ver core/browser-reset.ts): o de outra conta nunca se junta com esta (o
   * navegador é limpo e a conta desce inteira); o de ninguém (de antes de entrar) pergunta se vai junto;
   * o desta conta se junta sem perguntar.
   */
  private async firstSync(accountId: string): Promise<SyncState | null> {
    const owner = this.kv.getItem(OWNER_KEY);
    if (owner !== null && owner !== accountId) {
      this.reset.request('entrou', ['sessao']);
      return null;
    }
    const remote = await this.fetchRemote();
    if (remote.kind === 'doc' && isNewerSchema(remote.data)) throw this.outdated();
    const localHas = this.localHasContent();
    const remoteHas = remote.kind === 'doc' && this.hasContent(remote.data);
    const base: SyncState = { conta: accountId, rev: remote.kind === 'doc' ? remote.rev : 0, impressao: '', em: null };
    // a base de quando este aparelho saiu da conta mantendo o mural; sem ela, toda diferença conta
    const known = this.knownFor(base);

    // juntar as fichas (a junção de três vias); sem, elas já desceram trocando as daqui (ou não há o que juntar)
    let mergeFichas = false;
    if (owner === null && localHas) {
      // o mural de ninguém: a pessoa decide se ele vai para a conta
      const choice = await this.ask(remoteHas);
      if (choice === null) {
        this.waitingChoice = true;
        this.status.set('escolha');
        this.message.set('Falta escolher o que fazer com o mural deste navegador.');
        return null;
      }
      const copied = await this.keepCopy();
      if (choice === 'conta') {
        // a pergunta prometeu a cópia: sem ela, o daqui só sai se a pessoa confirmar
        if (!copied && !(await this.loseWithoutCopy())) {
          this.waitingChoice = true;
          this.status.set('escolha');
          this.message.set('Falta escolher o que fazer com o mural deste navegador.');
          return null;
        }
        // fica só o da conta: o daqui sai inteiro (menos a cópia de antes), e a conta desce na volta
        this.reset.request('entrou', ['sessao', 'copia']);
        return null;
      }
      if (remote.kind === 'doc') mergeFichas = true;
    } else if (remoteHas && localHas) {
      // o mural daqui já era desta conta: junta sem perguntar (com a cópia de antes, por garantia)
      await this.keepCopy();
      mergeFichas = true;
    }
    // Daqui em diante o mural daqui é desta conta: o dono vem antes de qualquer coisa dela descer. Se a
    // sessão cair (ou a aba fechar) no meio, o que desceu já tem dono e sai na limpeza, em vez de ficar
    // como de ninguém e poder ir para outra conta.
    this.writeOwner(accountId);
    if (remoteHas && !localHas) {
      // aparelho vazio: o mural da conta desce
      this.apply(() => this.store.importJson((remote as { text: string }).text, 'replace'));
    }
    // as chaves: a da nuvem vale se for mais nova (a conferência seguinte é "mudou?", e não traria)
    if (remote.kind === 'doc') {
      this.integrate(accountId, remote, mergeFichas ? known : null);
      // o daqui ficou igual ao da nuvem (baixou, ou juntou dois iguais): não há o que enviar de volta
      const here = await fingerprint(this.store.snapshot(), this.localKeys(), this.localTags(), this.localLooks(), this.localProfile(), this.localConfig(), this.localKanban(), this.conflicts.toSync(), this.localPlaces(), this.localCalendar(), this.localSpending());
      if (here === (await this.remotePrint(remote.data))) base.impressao = here;
      base.publicas = publicPrintOf(remote.data);
    }
    // (sem nada na nuvem e o daqui desta conta, ou de ninguém e levado: sobe como está, logo abaixo)
    this.writeState(base);
    return base;
  }

  /** O mural de ninguém (de antes de entrar) vai para a conta? */
  private async ask(remoteHas: boolean): Promise<'juntar' | 'conta' | null> {
    const here = this.describe(this.store.snapshot());
    const kept = 'As resenhas, as anotações e as listas daqui ficam guardadas como backup por 30 dias, em Ajustes.';
    if (!remoteHas) {
      const choice = await this.confirm.choose({
        title: 'Levar o mural para a conta?',
        text: `Este navegador tem ${here}, de antes de você entrar. Levar para a sua conta, ou começar a conta vazia? Começando vazia, tudo isso sai daqui. ${kept}`,
        confirm: 'Levar para a minha conta',
        secondary: 'Começar vazia',
      });
      return choice === 'confirm' ? 'juntar' : choice === 'secondary' ? 'conta' : null;
    }
    const choice = await this.confirm.choose({
      title: 'Juntar os murais?',
      text: `Este navegador tem ${here}, de antes de você entrar, e a sua conta já tem um mural. Juntar os dois, ou ficar só com o da conta? Ficando só com o da conta, tudo isso sai daqui. ${kept}`,
      confirm: 'Juntar os dois',
      secondary: 'Só o da conta',
    });
    return choice === 'confirm' ? 'juntar' : choice === 'secondary' ? 'conta' : null;
  }

  /** A cópia de antes da nuvem não foi guardada: o mural daqui sai mesmo assim? */
  private loseWithoutCopy(): Promise<boolean> {
    return this.confirm.ask({
      title: 'Não deu para guardar a cópia',
      text: 'O navegador não deixou guardar a cópia do mural daqui. Ficando só com o da conta, ele sai deste navegador sem cópia. Baixe um backup em Ajustes antes, ou apague mesmo assim.',
      confirm: 'Apagar daqui mesmo assim',
      cancel: 'Voltar',
      tone: 'perigo',
      icon: null,
    });
  }

  /**
   * O que há neste navegador além do que todo navegador tem: as fichas, os Gastos, os lembretes, o
   * Kanban com anotações, as versões guardadas, os ajustes que mudaram aqui.
   */
  private localHasContent(): boolean {
    return (
      this.store.hasContent() ||
      this.store.versions().length > 0 ||
      this.localSpending() !== null ||
      this.localCalendar() !== null ||
      this.kanban.state().boards.some((b) => b.cards.length > 0) ||
      BLOCK_KINDS.some((kind) => this.blockAt(kind) !== null)
    );
  }

  private describe(doc: BackupPayload): string {
    const n = payloadReviews(doc).length;
    const notes = Array.isArray(doc.notas) ? doc.notas.length : 0;
    const extra = doc.drafts.length + doc.wishes.length;
    const spent = this.spending.state().entries.length;
    const reminders = this.calendar.state().reminders.length;
    const kept = this.store.versions().length;
    const parts = [
      ...(n ? [plural(n, 'resenha', 'resenhas')] : []),
      ...(notes ? [plural(notes, 'anotação', 'anotações')] : []),
      ...(extra ? [`${extra} na fila e na wishlist`] : []),
      ...(spent ? [plural(spent, 'gasto', 'gastos')] : []),
      ...(reminders ? [plural(reminders, 'lembrete', 'lembretes')] : []),
      ...(kept ? [plural(kept, 'versão guardada', 'versões guardadas')] : []),
    ];
    if (!parts.length) return 'ajustes e um perfil mudados aqui';
    return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
  }

  private hasContent(data: Record<string, unknown>): boolean {
    const len = (k: string) => (Array.isArray(data[k]) ? (data[k] as unknown[]).length : 0);
    const deleted = (data['deleted'] ?? {}) as Record<string, Record<string, unknown> | undefined>;
    const tombs = ['reviews', 'drafts', 'wishes'].reduce((n, k) => n + Object.keys(deleted[k] ?? {}).length, 0);
    if (len('reviews') + len('notas') + len('musicas') + len('drafts') + len('wishes') + tombs > 0) return true;
    // os Gastos, os lembretes e o Kanban com anotações da conta também são mural (a pergunta não diz
    // "começar a conta vazia" para quem já tem gastos nela)
    const spent = spendingOf(data);
    const reminders = calendarOf(data);
    return (
      (spent !== null && spendingToSync(spent) !== null) ||
      (reminders !== null && calendarToSync(reminders) !== null) ||
      (kanbanOf(data)?.boards.some((b) => b.cards.length > 0) ?? false)
    );
  }

  /**
   * A cópia de antes da nuvem (ver cloud-before.ts). Devolve se ela ficou guardada (ou se não havia o
   * que copiar): sem espaço ou sem IndexedDB, não fica.
   */
  private async keepCopy(): Promise<boolean> {
    if (!this.store.hasContent()) return true;
    try {
      const { blob } = await this.store.exportBackup(this.settings.ownerName());
      return await saveBeforeCloud(blob);
    } catch {
      return false;
    }
  }

  /**
   * O que veio da nuvem entra aqui: as fichas (com `known`; sem, elas já entraram de outro jeito), os
   * ajustes e os quadros, cada um com a junção de três vias quando os dois lados mudaram desde a base
   * (ver o topo do arquivo), e os conflitos de lá junto com os achados agora. Depois, o que veio da
   * nuvem é o que os dois têm em comum: vira a base.
   */
  private integrate(conta: string, remote: { text: string; data: Record<string, unknown> }, known: KnownVersion | null): void {
    // o que mudou aqui até agora e o effect ainda não viu
    this.captureBase();
    const now = new Date().toISOString();
    const base = this.baseFor(conta);
    const from = buildOf(remote.data);
    const deA = sanitizeDevice((remote.data['sync'] as Record<string, unknown> | undefined)?.['aparelho']);
    const found: SyncConflict[] = [];
    const conflict = (alvo: string, a: unknown, b: unknown, partes: SyncConflict['partes'] = []) =>
      found.push({ alvo, em: now, a, b, deA, deB: this.device, partes });
    // os de lá primeiro: um conflito escolhido em outro aparelho não pergunta mais aqui
    this.conflicts.merge(remote.data['conflitos'], from);
    const remoteFichas = this.fichasOf(remote.data, from);

    if (known) {
      const shared = this.store.sharedIds();
      const plan = planFichas({
        local: this.store.reviews().filter((r) => !shared.has(r.id)),
        localDeleted: this.store.snapshot().deleted.reviews,
        remote: remoteFichas,
        remoteDeleted: deletedOf(remote.data),
        known,
        base: (id) => base.fichas[id],
        now,
      });
      const text = plan.replace.length ? JSON.stringify(withFichas(remote.data, plan.replace)) : remote.text;
      const common: KnownVersion = plan.known.size ? (id, at) => known(id, at) || plan.known.has(`${id}@${at}`) : known;
      this.apply(() => this.store.importJson(text, 'merge', common));
      for (const c of plan.conflicts) conflict(`ficha:${c.id}`, c.a, c.b, c.parts);
    }
    // o que veio da nuvem é o que os dois têm em comum agora
    this.writeBase(conta, versionsOf(remote.data));

    // os ajustes: a junção de três vias quando os dois mudaram; sem base, o mudado por último vale
    const remoteBlocks = blocksOf(remote.data);
    for (const kind of BLOCK_KINDS) {
      const r = remoteBlocks[kind];
      const plan = planBlock(base.ajustes[kind], this.conflicts.blockNow(kind) ?? undefined, r?.dados);
      if (plan.kind === 'sempre') this.mergeOld(kind, remote.data);
      else if (plan.kind === 'remoto') this.apply(() => this.conflicts.applyBlock(kind, r!.dados, r!.em));
      else if (plan.kind === 'junto') {
        this.apply(() => this.conflicts.applyBlock(kind, plan.dados, stampAfter(now, r!.em, this.blockAt(kind) ?? '')));
        if (plan.outro !== null) conflict(`ajuste:${kind}`, plan.dados, plan.outro);
      }
    }

    // os quadros: os mudados dos dois lados se juntam coluna a coluna, ficha a ficha
    const board = kanbanOf(remote.data);
    if (board) {
      // (a base de verdade sempre tem os ajustes; a vazia, de um aparelho sem ela, não)
      const plan = planBoards(this.kanban.state().boards, board.boards, base, now, Object.keys(base.ajustes).length > 0);
      const replaced = new Map(plan.replace.map((b) => [b.id, b]));
      const adjusted = replaced.size ? { ...board, boards: board.boards.map((b) => replaced.get(b.id) ?? b) } : board;
      // a base de cada quadro (a guardada, ou o daqui se ele não mudou desde ela): o quadro de antes de uma
      // categoria renomeada em outro aparelho, mexido aqui depois da base, vai para o quadro do nome novo
      const local = this.kanban.state();
      const origins = [...local.boards, ...Object.values(base.quadros)].filter((b) => base.quadrosV[b.id] === b.at);
      const known = Object.keys(base.quadrosV).length ? { ...local, boards: [...new Map(origins.map((b) => [b.id, b])).values()] } : null;
      this.apply(() => this.kanban.merge(adjusted, known));
      for (const c of plan.conflicts) conflict(`kanban:${c.id}`, c.a, c.b);
    }

    // os lembretes do Calendário: cada um vem de onde mudou por último
    const calendario = calendarOf(remote.data);
    if (calendario) this.apply(() => this.calendar.merge(calendario));

    // os Gastos: cada lançamento e cada categoria vem de onde mudou por último
    const gastos = spendingOf(remote.data);
    if (gastos) this.apply(() => this.spending.merge(gastos));

    // o lugar das compartilhadas no mural (fixada no topo): o mudado por último, em qualquer aparelho
    const places = placesOf(remote.data);
    if (places) this.apply(() => this.shared.mergePlaces(new Map(Object.entries(places))));

    this.conflicts.add(found);
    this.rebase(conta, remote.data, remoteFichas);
  }

  /** As fichas do mural que veio da nuvem, no formato desta build (sem as compartilhadas). */
  private fichasOf(data: Record<string, unknown>, from: number): Review[] {
    const shared = this.store.sharedIds();
    const out: Review[] = [];
    for (const key of ['reviews', 'notas', 'musicas']) {
      const list = data[key];
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const r = sanitizeReview(raw, from);
        if (r && !shared.has(r.id)) out.push(r);
      }
    }
    return out;
  }

  /** A junção de sempre de um ajuste: o mudado por último vale. */
  private mergeOld(kind: BlockKind, data: Record<string, unknown>): void {
    if (kind === 'chaves') this.mergeKeys(data);
    else if (kind === 'tagsFixas') this.mergeTags(data);
    else if (kind === 'categorias') this.mergeLooks(data);
    else if (kind === 'muralAnotacoes') this.mergeConfig(data);
    else this.mergeProfile(data);
  }

  /** Quando um ajuste mudou aqui pela última vez (null: nunca). */
  private blockAt(kind: BlockKind): string | null {
    if (kind === 'chaves') return this.settings.keysAt() || null;
    if (kind === 'tagsFixas') return this.settings.pinnedTagsAt() || null;
    if (kind === 'categorias') return this.settings.categoryLooksAt() || null;
    if (kind === 'muralAnotacoes') return this.settings.notesConfigAt() || null;
    return this.profiles.changedAt() || null;
  }

  /** Os ajustes daqui agora (os dados, sem a data), para a base depois de enviar. */
  private blocksNow(): Partial<Record<BlockKind, unknown>> {
    const out: Partial<Record<BlockKind, unknown>> = {};
    for (const kind of BLOCK_KINDS) {
      const v = this.conflicts.blockNow(kind) ?? blockDefault(kind);
      if (v !== undefined) out[kind] = v;
    }
    return out;
  }

  /**
   * O conteúdo da base desta conta (ver core/sync-base.ts), lido de novo a cada vez: outra aba do mesmo
   * aparelho divide a base com esta e pode tê-la mudado (uma cópia na memória gravaria a de antes por
   * cima da dela).
   */
  private baseFor(conta: string): BaseContent {
    return readBaseContent(this.kv, conta);
  }

  private writeBaseContent(base: BaseContent | null): void {
    writeBaseContent(this.kv, base);
  }

  /**
   * Uma ficha (ou um quadro) que estava na versão da base mudou aqui: a versão de antes fica guardada
   * (ver core/sync-base.ts). Roda a cada mudança e antes de cada junção; o que a própria sincronização
   * muda não conta (ver `apply`).
   */
  private captureBase(): void {
    const reviews = this.store.reviews();
    const boards = this.kanban.state().boards;
    if (reviews === this.seenReviews && boards === this.seenBoards) return;
    const conta = this.account.account()?.id;
    const versions = conta ? this.readBase(conta) : null;
    if (conta && versions) {
      const base = this.baseFor(conta);
      let changed = false;
      if (reviews !== this.seenReviews) {
        const shared = this.store.sharedIds();
        const now = new Map(reviews.map((r) => [r.id, r]));
        for (const r of this.seenReviews) {
          if (base.fichas[r.id] || versions[r.id] !== r.updatedAt || shared.has(r.id)) continue;
          if (now.get(r.id)?.updatedAt === r.updatedAt) continue;
          base.fichas[r.id] = r;
          changed = true;
        }
      }
      if (boards !== this.seenBoards) {
        const now = new Map(boards.map((b) => [b.id, b]));
        for (const b of this.seenBoards) {
          if (base.quadros[b.id] || base.quadrosV[b.id] !== b.at || now.get(b.id)?.at === b.at) continue;
          base.quadros[b.id] = b;
          changed = true;
        }
      }
      if (changed) this.writeBaseContent(base);
    }
    this.seenReviews = reviews;
    this.seenBoards = boards;
  }

  /**
   * Depois de juntar o que veio da nuvem, ele é a base: das fichas (e dos quadros) que ainda estão
   * diferentes aqui, a versão de lá; os ajustes como lá.
   */
  private rebase(conta: string, data: Record<string, unknown>, remoteFichas: readonly Review[]): void {
    const remote = new Map(remoteFichas.map((r) => [r.id, r]));
    const fichas: Record<string, Review> = {};
    for (const r of this.store.reviews()) {
      const there = remote.get(r.id);
      if (there && there.updatedAt !== r.updatedAt) fichas[r.id] = there;
    }
    const board = kanbanOf(data)?.boards ?? [];
    const quadrosV = Object.fromEntries(board.map((b) => [b.id, b.at]));
    const quadros: Record<string, KanbanBoard> = {};
    for (const b of this.kanban.state().boards) {
      const there = board.find((x) => x.id === b.id);
      if (there && there.at !== b.at) quadros[b.id] = there;
    }
    // o ajuste que a nuvem não tem é o de sempre (quem mudar primeiro muda a partir dele)
    const ajustes: Partial<Record<BlockKind, unknown>> = {};
    const there = blocksOf(data);
    for (const kind of BLOCK_KINDS) {
      const v = there[kind]?.dados ?? blockDefault(kind);
      if (v !== undefined) ajustes[kind] = v;
    }
    this.writeBaseContent({ conta, fichas, quadrosV, quadros, ajustes });
  }

  /** Depois de enviar, o enviado é a base (o que mudou aqui durante o envio guarda a versão enviada). */
  private rebaseAfterPush(conta: string, doc: BackupPayload, boards: readonly KanbanBoard[], ajustes: Partial<Record<BlockKind, unknown>>): void {
    const sent = new Map<string, Review>();
    for (const r of [...doc.reviews, ...(doc.notas ?? []), ...(doc.musicas ?? [])] as Review[]) sent.set(r.id, r);
    const fichas: Record<string, Review> = {};
    for (const r of this.store.reviews()) {
      const was = sent.get(r.id);
      const ficha = was && was.updatedAt !== r.updatedAt ? sanitizeReview(was, BUILD) : null;
      if (ficha) fichas[r.id] = ficha;
    }
    const quadros: Record<string, KanbanBoard> = {};
    for (const b of this.kanban.state().boards) {
      const was = boards.find((x) => x.id === b.id);
      if (was && was.at !== b.at) quadros[b.id] = was;
    }
    this.writeBaseContent({ conta, fichas, quadrosV: Object.fromEntries(boards.map((b) => [b.id, b.at])), quadros, ajustes });
  }

  /**
   * Quais versões este aparelho e a nuvem tinham juntos (ver `BASE_KEY`): uma assim, quando perde
   * na junção, não precisa ser guardada. Sem a base (o site de antes dela), vale o que já existia na
   * última sincronização; sem nada, toda versão que perde fica guardada.
   */
  private knownFor(state: SyncState): KnownVersion {
    const base = this.readBase(state.conta);
    if (base) return (id, at) => base[id] === at;
    const em = state.em;
    return (_id, at) => em !== null && Date.parse(at) <= em;
  }

  private readBase(account: string): Record<string, string> | null {
    try {
      const raw = JSON.parse(this.kv.getItem(BASE_KEY) ?? 'null') as { conta?: unknown; fichas?: unknown } | null;
      if (!raw || raw.conta !== account || !raw.fichas || typeof raw.fichas !== 'object') return null;
      return raw.fichas as Record<string, string>;
    } catch {
      return null;
    }
  }

  private writeBase(account: string | null, fichas: Record<string, string> = {}): void {
    if (account) this.kv.setItem(BASE_KEY, JSON.stringify({ conta: account, fichas }));
    else this.kv.removeItem(BASE_KEY);
  }

  /**
   * As chaves deste aparelho para a nuvem, ou null se não há nenhuma. Chaves de antes de existir a
   * data ganham a data de agora na primeira vez que sobem.
   */
  private localKeys(): SyncedKeys | null {
    const rawg = this.settings.rawgKey().trim();
    const tmdb = this.settings.tmdbKey().trim();
    let em = this.settings.keysAt();
    if (!em) {
      if (!rawg && !tmdb) return null;
      em = new Date().toISOString();
      untracked(() => this.settings.keysAt.set(em));
    }
    return { rawg, tmdb, em };
  }

  /** As chaves que vieram da nuvem ficam aqui se forem as mais novas. */
  private mergeKeys(data: Record<string, unknown>): void {
    const remote = keysOf(data);
    if (!remote) return;
    const em = this.settings.keysAt();
    const local = em ? { rawg: this.settings.rawgKey().trim(), tmdb: this.settings.tmdbKey().trim(), em } : null;
    if (newerKeys(local, remote) !== 'remote') return;
    this.apply(() => this.settings.applyKeys(remote));
  }

  /** As tags fixas deste aparelho para a nuvem, ou null se nunca mudaram aqui. */
  private localTags(): SyncedTags | null {
    const em = this.settings.pinnedTagsAt();
    return em ? { lista: [...this.settings.pinnedTags()], em } : null;
  }

  /** As tags fixas que vieram da nuvem ficam aqui se forem as mudadas por último. */
  private mergeTags(data: Record<string, unknown>): void {
    const remote = pinnedTagsOf(data);
    const em = this.settings.pinnedTagsAt();
    if (!remote || (em && remote.em <= em)) return;
    this.apply(() => this.settings.applyPinnedTags(remote.lista, remote.em));
  }

  /** Os jeitos das categorias deste aparelho para a nuvem, ou null se nunca mudaram aqui. */
  private localLooks(): SyncedLooks | null {
    const em = this.settings.categoryLooksAt();
    return em ? { mapa: this.settings.categoryLooks(), em } : null;
  }

  /** Os jeitos das categorias que vieram da nuvem ficam aqui se forem os mudados por último. */
  private mergeLooks(data: Record<string, unknown>): void {
    const remote = categoryLooksOf(data);
    const em = this.settings.categoryLooksAt();
    if (!remote || (em && remote.em <= em)) return;
    this.apply(() => this.settings.applyCategoryLooks(remote.mapa, remote.em));
  }

  /** As configurações do mural de anotações deste aparelho para a nuvem, ou null se nunca mudaram aqui. */
  private localConfig(): SyncedNotesConfig | null {
    const em = this.settings.notesConfigAt();
    return em ? { dados: this.settings.notesConfig(), em } : null;
  }

  /** As configurações do mural de anotações que vieram da nuvem ficam aqui se forem as mudadas por último. */
  private mergeConfig(data: Record<string, unknown>): void {
    const remote = notesConfigOf(data);
    const em = this.settings.notesConfigAt();
    if (!remote || (em && remote.em <= em)) return;
    this.apply(() => this.settings.applyNotesConfig(remote.dados, remote.em));
  }

  /** Os quadros Kanban deste aparelho para a nuvem, ou null sem nenhum. */
  private localKanban(): Partial<KanbanState> | null {
    return kanbanToSync(this.kanban.state());
  }

  /** Os lembretes deste aparelho para a nuvem, ou null sem nenhum. */
  private localCalendar(): CalendarState | null {
    return calendarToSync(this.calendar.state());
  }

  /** Os gastos deste aparelho para a nuvem, ou null sem nenhum. */
  private localSpending(): SpendingState | null {
    return spendingToSync(this.spending.state());
  }

  /** O perfil deste aparelho para a nuvem, ou null se nunca mudou aqui. */
  private localProfile(): SyncedProfile | null {
    const em = this.profiles.changedAt();
    return em ? { dados: this.profiles.profile(), em } : null;
  }

  /** O perfil que veio da nuvem fica aqui se for o mudado por último. */
  private mergeProfile(data: Record<string, unknown>): void {
    const remote = profileOf(data);
    const em = this.profiles.changedAt();
    if (!remote || (em && remote.em <= em)) return;
    this.apply(() => this.profiles.apply(remote.dados, remote.em));
  }

  /** O lugar das compartilhadas no mural daqui, para a nuvem (ver `placesOf`), ou null sem nenhum. */
  private localPlaces(): Record<string, Place> | null {
    const map = this.shared.places();
    return map.size ? Object.fromEntries(map) : null;
  }

  /** A impressão do mural que veio da nuvem, com tudo o que vai junto dele. */
  private remotePrint(data: Record<string, unknown>): Promise<string> {
    return fingerprint(data as unknown as BackupPayload, keysOf(data), pinnedTagsOf(data), categoryLooksOf(data), profileOf(data), notesConfigOf(data), kanbanPrintOf(data), conflictsPrintOf(data), placesOf(data), calendarPrintOf(data), spendingPrintOf(data));
  }

  private apply(fn: () => void): void {
    this.applying = true;
    try {
      fn();
      // o que a sincronização mudou não é mudança daqui (a base não guarda nada por isso)
      this.seenReviews = this.store.reviews();
      this.seenBoards = this.kanban.state().boards;
    } finally {
      // os effects do mural rodam depois; o envio que eles agendariam já está sendo feito aqui
      setTimeout(() => (this.applying = false), 0);
    }
  }

  private async fetchRemote(rev?: number): Promise<Remote> {
    let res: Response;
    try {
      res = await this.account.requestRaw(`/v1/eu/mural${rev === undefined ? '' : `?rev=${rev}`}`);
    } catch (err) {
      if (err instanceof CloudError && err.code === 'sem-mural') return { kind: 'none' };
      throw err;
    }
    this.noteClock(res);
    this.requests.noteHeads(res.headers);
    if (res.status === 204) return { kind: 'same' };
    const remoteRev = Number(res.headers.get('Mural-Rev'));
    const text = await readBackupFile(await res.blob());
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new CloudError('O mural que veio da nuvem não abriu.', 'mural-invalido', 0);
    }
    if (!Number.isSafeInteger(remoteRev) || !data || typeof data !== 'object') {
      throw new CloudError('O mural que veio da nuvem não abriu.', 'mural-invalido', 0);
    }
    return { kind: 'doc', rev: remoteRev, text, data: data as Record<string, unknown> };
  }

  /** Envia o mural; devolve a rev nova. */
  private async push(
    doc: BackupPayload,
    base: number,
    keys: SyncedKeys | null,
    tags: SyncedTags | null,
    looks: SyncedLooks | null,
    profile: SyncedProfile | null,
    config: SyncedNotesConfig | null,
    kanban: Partial<KanbanState> | null,
    conflitos: unknown[] | null,
    places: Record<string, Place> | null,
    calendario: CalendarState | null,
    gastos: SpendingState | null,
    print: string,
    publicas: string,
  ): Promise<number> {
    const now = Date.now();
    this.pushes = this.pushes.filter((p) => now - p.at < PUSH_WINDOW);
    const same = this.pushes.filter((p) => p.print === print).length;
    if (this.pushes.length >= MAX_PUSHES_PER_10_MIN || same >= MAX_SAME_PUSHES_PER_10_MIN) {
      throw new CloudError(
        'A sincronização deu uma pausa para não gastar a nuvem: foram envios demais seguidos. Ela volta sozinha em alguns minutos; se continuar, avise.',
        'envios-demais',
        0,
      );
    }
    if (typeof CompressionStream === 'undefined') {
      throw new CloudError('Este navegador não sabe compactar o mural para a nuvem. Atualize o navegador.', 'sem-compressao', 0);
    }
    const name = this.account.account()?.nome ?? '';
    // as chaves só no privado: o público e o arquivo de backup nunca levam
    const privado = await gzip(JSON.stringify({ ...doc, ...(keys ? { chaves: keys } : {}), ...(tags ? { tagsFixas: tags } : {}), ...(looks ? { categorias: looks } : {}), ...(profile ? { perfil: profile } : {}), ...(config ? { muralAnotacoes: config } : {}), ...(kanban ? { kanban } : {}), ...(conflitos ? { conflitos } : {}), ...(places ? { lugares: places } : {}), ...(calendario ? { calendario } : {}), ...(gastos ? { gastos } : {}), sync: { schema: SYNC_SCHEMA, aparelho: this.device, publico: publicas } }));
    if (privado.size > MAX_GZ_BYTES) {
      throw new CloudError('O mural ficou grande demais para a nuvem (passa de 1,8 MB compactado). Ele continua salvo aqui.', 'mural-grande-demais', 413);
    }
    // as anotações que estão só no Kanban: fora do seu mural, fora do de quem visita (nem o título nas
    // notas coladas, nem aviso, nem reações e comentários à mostra)
    const board = this.kanban.boardOnly();
    // as anotações compartilhadas públicas (as de outra pessoa dizem de quem são): não estão no mural
    // privado, mas os outros as veem no seu; as privadas, nem o título nas notas coladas
    const asShown = (x: { note: Review; dono: SharedPerson | null }) =>
      x.dono ? { ...storedNote(x.note), sharedBy: { codigo: x.dono.codigo, nome: x.dono.nome } } : storedNote(x.note);
    const sharedPublic = this.publicShared(board).map(asShown);
    const ownNotes = [...publicNotes(doc.notas, board), ...sharedPublic];
    // tudo o que os outros veem; a nota colada que fica de fora não deixa nem o título: a privada, a só
    // no Kanban, a apagada (o título dela continua escrito na marca) e a de outra pessoa colada numa
    // compartilhada (a privada dela iria para o seu público)
    const shownIds = publicIds([...publicReviews(doc.reviews), ...publicReviews(doc.musicas ?? [])], ownNotes);
    const hidden = (id: string) => !shownIds.has(id);
    const reviews = publicReviews(doc.reviews).map((r) => shownCard(r, hidden));
    const musicas = publicReviews(doc.musicas ?? []).map((r) => shownCard(r, hidden));
    const notas = ownNotes.map((n) => shownCard(n, hidden));
    // as só no Kanban: fora do mural, mas o link da ficha as abre (as compartilhadas públicas também)
    const boardShared = this.shared.publicShared().filter((x) => board.has(x.note.id)).map(asShown);
    const soKanban = [...boardOnlyNotes(doc.notas, board), ...boardShared].map((n) => shownCard(n, hidden));
    // tudo o que os outros veem com nota: as resenhas de sempre e as de música
    const scored = [...reviews, ...musicas];
    const publico = await gzip(
      // o que os outros veem: sem as fichas privadas (nem o id delas nas seções do perfil)
      JSON.stringify({
        app: 'meu-mural',
        version: 2,
        build: doc.build,
        exportedAt: doc.exportedAt,
        ...(name ? { owner: { name } } : {}),
        reviews,
        notas,
        ...(musicas.length ? { musicas } : {}),
        ...(soKanban.length ? { soKanban } : {}),
        ...(looks ? { categorias: publicCategoryLooks(looks.mapa, [...notas, ...soKanban]) } : {}),
        // o "Sobre mim" também cola notas: a que não está à mostra vai sem o título
        ...(profile ? { perfil: shownProfile(profile.dados, shownIds) } : {}),
      }),
    );
    // as anotações também: a que nasce pública ou deixa de ser privada vira aviso, como a resenha
    // (das compartilhadas, só as suas: a dos outros é aviso para quem segue o dono)
    const ownShared = this.publicShared(board).filter((x) => !x.dono).map((x) => x.note);
    const novas = newReviews([...payloadReviews(doc), ...notesOf(publicNotes(doc.notas, board)), ...ownShared], now);
    const form = new FormData();
    form.append('privado', privado, 'privado.json.gz');
    form.append('publico', publico, 'publico.json.gz');
    form.append('novas', JSON.stringify(novas));
    // o cartão da pessoa no Seguindo/Seguidores dos outros: a foto, o fundo, a linha e os números (a
    // nuvem não abre o mural público). Sem perfil mexido, o padrão, que é o que o perfil mostra
    const shown = profile?.dados ?? defaultProfile();
    const cartao = {
      emoji: shown.emoji,
      cor: shown.photo,
      fundo: cardBackground(shown.background),
      linha: shown.tagline,
      fichas: scored.length + notas.length,
      murais: new Set([...scored.map((r) => r.kind), ...(notas.length ? ['anotacoes'] : [])]).size,
    };
    form.append('cartao', JSON.stringify(cartao));
    // as fichas à mostra: a nuvem esconde dos outros as reações, os comentários e os avisos das que não
    // estão (as só no Kanban estão, pelo link)
    form.append('fichas', JSON.stringify([...new Set([...shownIds, ...publicIds([], soKanban)])]));
    const res = await this.account.requestRaw('/v1/eu/mural', { method: 'PUT', headers: { 'Mural-Rev-Base': String(base) }, body: form });
    // só o envio que a nuvem gravou conta para a válvula: sem rede, o 409, o 429 ou a nuvem fora do ar já
    // esperam do jeito deles, e contá-los trocava o "sem conexão" por "envios demais" depois de 3 tentativas
    this.pushes.push({ at: now, print });
    this.noteClock(res);
    const body = (await res.json()) as { rev: number };
    return body.rev;
  }

  /** As compartilhadas públicas que vão no mural público: as que estão só no Kanban ficam de fora. */
  private publicShared(board: ReadonlySet<string>): { note: Review; dono: SharedPerson | null }[] {
    return this.shared.publicShared().filter((x) => !board.has(x.note.id));
  }

  /**
   * A impressão do que vai no mural público e não está no privado: as compartilhadas públicas, quais
   * anotações estão só no Kanban (a conta sai dos quadros, das configurações e das anotações, que já
   * estão no privado, mas guardar a lista aqui deixa o público certo mesmo se a conta mudar) e a
   * regra do público (`PUBLIC_RULES`).
   */
  private async publicPrint(): Promise<string> {
    const board = this.kanban.boardOnly();
    // todas as compartilhadas públicas: as do mural e as só no Kanban (que vão em `soKanban`)
    const list = this.shared.publicShared();
    const text = canonicalJson({
      regra: PUBLIC_RULES,
      publicas: list.map((x) => ({ n: storedNote(x.note), d: x.dono?.codigo ?? null })).sort((a, b) => (a.n.id < b.n.id ? -1 : 1)),
      soKanban: [...board].sort(),
    });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private noteClock(res: Response): void {
    const cloud = Date.parse(res.headers.get('Mural-Agora') ?? '');
    if (Number.isFinite(cloud)) this.clockSkew.set(cloud - Date.now());
  }

  private outdated(): CloudError {
    return new CloudError(
      'O mural na nuvem foi salvo por uma versão mais nova do site. Recarregue a página para continuar sincronizando.',
      'desatualizado',
      0,
    );
  }

  private fail(err: unknown): void {
    const e = err instanceof CloudError ? err : new CloudError('Algo deu errado na sincronização.', 'erro', 0);
    if (e.code === 'desatualizado') {
      this.status.set('desatualizado');
      this.message.set(e.message);
      return;
    }
    if (e.status === 401) {
      if (!this.active()) {
        this.status.set('fora');
        this.message.set(null);
        return;
      }
      // a recusa era de outra sessão (o pedido saiu antes de entrar de novo) e esta continua: tenta de novo,
      // em vez de parar como fora da conta até a próxima mudança
      this.status.set('sincronizando');
      this.message.set(null);
      this.failures++;
      this.schedule(Math.min(30 * MINUTE, 5_000 * 2 ** (this.failures - 1)));
      return;
    }
    if (e.status === 0 && e.code === 'sem-rede') {
      this.status.set('sem-rede');
      this.message.set('Sem conexão com a nuvem. O mural está salvo neste aparelho e sobe quando a conexão voltar.');
      this.failures++;
      this.schedule(Math.min(30 * MINUTE, 30_000 * 2 ** (this.failures - 1)));
      return;
    }
    if (e.status === 429) {
      this.status.set('sincronizando');
      this.schedule(5_000);
      return;
    }
    if (e.status === 503) {
      this.status.set('pausado');
      this.message.set(e.message);
      this.schedule(30 * MINUTE);
      return;
    }
    this.status.set('erro');
    this.message.set(e.message);
    if (e.code === 'envios-demais') {
      // volta sozinha quando o envio mais antigo sai da janela de 10 minutos
      const oldest = Math.min(...this.pushes.map((p) => p.at));
      this.schedule(Math.max(MINUTE, oldest + PUSH_WINDOW - Date.now()));
      return;
    }
    if (e.code !== 'mural-grande-demais' && e.code !== 'sem-compressao') {
      this.failures++;
      this.schedule(Math.min(30 * MINUTE, 30_000 * 2 ** (this.failures - 1)));
    }
  }

  /**
   * Sair da conta (`everywhere`: de todos os aparelhos). Nada da conta fica neste navegador: depois de
   * sair, a página recarrega limpa (ver core/browser-reset.ts). Com mudança que ainda não subiu, avisa
   * que ela se perde. Devolve false se a pessoa desistiu.
   */
  async signOut(everywhere = false, keys = 0): Promise<boolean> {
    const question = {
      title: everywhere ? 'Sair de todos os aparelhos?' : 'Sair da conta?',
      text:
        (everywhere ? 'Todo aparelho onde você entrou vai precisar entrar de novo, e o mural sai de cada um. ' : '') +
        'Na nuvem fica tudo. Neste navegador não fica nada da conta: as resenhas, as anotações, os Gastos, o Calendário, os ajustes e o perfil saem daqui.',
      confirm: everywhere ? 'Sair de todos' : 'Sair',
      tone: everywhere ? ('perigo' as const) : ('neutro' as const),
      icon: null,
    };
    // com chaves de API, sair de todos pergunta se corta também os acessos das AIs, com a caixa já
    // marcada (PLANO-API.md, D5): quem sai de todos costuma estar fechando as portas
    let cutKeys = false;
    if (everywhere && keys > 0) {
      const answer = await this.confirm.askChecked({
        ...question,
        check: keys === 1 ? 'Cortar também a chave de API (o acesso das AIs)' : `Cortar também as ${keys} chaves de API (o acesso das AIs)`,
        checkedAtStart: true,
      });
      if (!answer.ok) return false;
      cutKeys = answer.checked;
    } else if (!(await this.confirm.ask(question))) return false;
    await this.syncNow();
    const sent = await this.everythingSent();
    // as imagens coladas ainda não sobem para a nuvem (PLANO-IMAGENS.md, rodada 3): sair as apaga daqui
    const images = await this.images.unsent();
    if (!sent || images) {
      const lostImages = images === 1 ? 'Uma imagem colada nas anotações está só neste aparelho' : `${images} imagens coladas nas anotações estão só neste aparelho`;
      const lose = await this.confirm.ask({
        title: 'Ainda tem coisa só aqui',
        text: !sent
          ? `Há mudanças neste navegador que ainda não subiram para a nuvem${images ? `, e ${lostImages.charAt(0).toLowerCase() + lostImages.slice(1)}` : ''}. Saindo agora, elas se perdem. Confira a conexão e tente de novo, ou saia mesmo assim.`
          : `${lostImages}: as imagens ainda não sobem para a nuvem. Saindo agora, ${images === 1 ? 'ela se perde' : 'elas se perdem'}, e as anotações ficam sem ${images === 1 ? 'ela' : 'elas'}.`,
        confirm: 'Sair e perder',
        cancel: 'Ficar',
        icon: null,
      });
      if (!lose) return false;
    }
    if (everywhere) await this.account.signOutEverywhere(cutKeys);
    else await this.account.signOut();
    this.writeState(null);
    this.lastSyncAt.set(null);
    this.reset.request('saiu');
    return true;
  }

  /** Depois de apagar a conta: nada dela fica neste navegador. */
  forgetAccount(): void {
    this.writeState(null);
    this.lastSyncAt.set(null);
    this.reset.request('apagou');
  }

  /**
   * A conta saiu deste navegador sem passar por `signOut` (a sessão venceu, "Sair de todos" em outro
   * aparelho, a conta apagada): o navegador é limpo inteiro, como no Sair. Vale também antes de a pessoa
   * escolher o que fazer com o mural de ninguém: nesse meio-tempo a conta já trouxe coisas dela (as
   * compartilhadas, a agenda, o nome), e depois de um logout nada do que o site guardou fica (CLAUDE.md).
   */
  private leftAccount(): void {
    this.reset.request('saiu');
  }

  private writeState(state: SyncState | null): void {
    if (state) this.kv.setItem(STATE_KEY, JSON.stringify(state));
    else this.kv.removeItem(STATE_KEY);
  }

  private writeOwner(id: string | null): void {
    if (id) this.kv.setItem(OWNER_KEY, id);
    else this.kv.removeItem(OWNER_KEY);
  }

  /** O mural daqui é igual ao que está na nuvem? */
  async everythingSent(): Promise<boolean> {
    const state = readState(this.kv);
    const id = this.account.account()?.id;
    if (!state || state.conta !== id) return !this.localHasContent();
    return (
      (await fingerprint(this.store.snapshot(), this.localKeys(), this.localTags(), this.localLooks(), this.localProfile(), this.localConfig(), this.localKanban(), this.conflicts.toSync(), this.localPlaces(), this.localCalendar(), this.localSpending())) === state.impressao
    );
  }
}
