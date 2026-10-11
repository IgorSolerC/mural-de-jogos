import { isEmoji } from './emoji';
import { KINDS, Kind } from './kinds';
import { STOCKS, Stock, newId } from './review';

/**
 * O perfil da pessoa: o que quem abre o nome dela vê antes dos murais. A "foto" é um emoji numa
 * polaroid de cartolina, a descrição é escrita com a formatação leve das resenhas, os assuntos são
 * etiquetas, o quadro de cima tem o fundo escolhido, e as seções ("Jogos que tocaram meu coração")
 * juntam fichas de qualquer mural, cada uma no tipo de ficha escolhido.
 *
 * Fica neste navegador (`PROFILE_KEY`) e, com conta, no mural privado da nuvem (`perfil`, o mudado
 * por último vale) e no público (só com as fichas públicas: ver `publicProfile`). Nunca no arquivo de
 * backup, como os outros ajustes. Nada aqui é lido no topo do módulo: review.ts está num ciclo de
 * imports (ver core/settings.ts).
 */

/** Os fundos de papelaria do quadro de cima (o desenho de cada um fica no CSS do perfil). */
export const PROFILE_MATERIALS = [
  { id: 'cortica', label: 'Cortiça' },
  { id: 'kraft', label: 'Papel kraft' },
  { id: 'quadriculado', label: 'Quadriculado' },
  { id: 'pautado', label: 'Caderno pautado' },
  { id: 'papelao', label: 'Papelão' },
  { id: 'eucatex', label: 'Eucatex' },
] as const;
export type ProfileMaterial = (typeof PROFILE_MATERIALS)[number]['id'];

/** O fundo: um material, uma cartolina, ou uma imagem por link (https). */
export type ProfileBackground =
  | { kind: 'material'; material: ProfileMaterial }
  | { kind: 'cartolina'; stock: Stock }
  | { kind: 'link'; url: string };

/** Como as fichas de uma seção aparecem: os tipos de ficha do mural (a lista vale para tudo aqui). */
export const SECTION_DENSITIES = [
  { id: 'completa', label: 'Completa', hint: 'A ficha do mural, com a frase e as notas.' },
  { id: 'inteira', label: 'Inteira', hint: 'A ficha completa com o texto todo.' },
  { id: 'simples', label: 'Simples', hint: 'Capa, nome, data e a nota.' },
  { id: 'capas', label: 'Capas', hint: 'Só a capa e o nome.' },
  { id: 'lista', label: 'Lista', hint: 'Só os nomes, um embaixo do outro.' },
] as const;
export type SectionDensity = (typeof SECTION_DENSITIES)[number]['id'];

/** Onde a seção fica: direto na parede, ou dentro de um quadro de cortiça com moldura. */
export type SectionFrame = 'parede' | 'quadro';

export interface ProfileSection {
  id: string;
  /** A etiqueta de fita: "Jogos que tocaram meu coração". */
  title: string;
  /** Uma linha à mão embaixo da etiqueta (vazia: nada). */
  note: string;
  density: SectionDensity;
  frame: SectionFrame;
  /** Os ids das fichas, na ordem escolhida. Quem visita só vê as que estão públicas. */
  items: string[];
}

/** O que a pessoa diz de cada mural na pasta dele, e se a pasta aparece. */
export interface ProfileWall {
  hidden?: true;
  text?: string;
}

export interface Profile {
  /** A "foto": um emoji só. */
  emoji: string;
  /** A cartolina atrás do emoji, na polaroid. */
  photo: Stock;
  /** A linha curta embaixo do nome ("Curadora · SP"). */
  tagline: string;
  /** A descrição, com a formatação leve das resenhas (negrito, itálico, listas). */
  about: string;
  /** Os assuntos: etiquetas curtas. */
  topics: string[];
  background: ProfileBackground;
  walls: Partial<Record<Kind, ProfileWall>>;
  sections: ProfileSection[];
}

export const PROFILE_LIMITS = {
  tagline: 60,
  about: 1500,
  topic: 32,
  topics: 12,
  sections: 12,
  title: 60,
  note: 160,
  items: 48,
  wallText: 200,
  url: 600,
} as const;

export const DEFAULT_EMOJI = '🙂';

/** Uma seção nova, vazia. */
export function newSection(title = ''): ProfileSection {
  return { id: newId(), title, note: '', density: 'completa', frame: 'parede', items: [] };
}

/** O perfil de quem ainda não mexeu: o emoji sorrindo, cortiça, e uma seção "Em destaque" vazia. */
export function defaultProfile(): Profile {
  return {
    emoji: DEFAULT_EMOJI,
    photo: 'amarelo',
    tagline: '',
    about: '',
    topics: [],
    background: { kind: 'material', material: 'cortica' },
    walls: {},
    sections: [newSection('Em destaque')],
  };
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');
/** Uma linha só: sem quebras, espaços juntos. */
const line = (v: unknown, max: number): string => text(v, max * 2).replace(/\s+/g, ' ').slice(0, max).trim();

function isStock(v: unknown): v is Stock {
  return (STOCKS as readonly unknown[]).includes(v);
}

/** Um link de imagem que serve: https e curto. */
export function cleanImageUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const url = v.trim();
  if (url.length > PROFILE_LIMITS.url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function sanitizeBackground(raw: unknown): ProfileBackground {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (b['kind'] === 'cartolina' && isStock(b['stock'])) return { kind: 'cartolina', stock: b['stock'] };
  if (b['kind'] === 'link') {
    const url = cleanImageUrl(b['url']);
    if (url) return { kind: 'link', url };
  }
  const material = PROFILE_MATERIALS.find((m) => m.id === b['material'])?.id;
  return { kind: 'material', material: material ?? 'cortica' };
}

/** Os assuntos: sem vazios nem repetidos (sem ligar para caixa), no máximo 12. */
export function sanitizeTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const topic = line(t, PROFILE_LIMITS.topic);
    const key = topic.toLocaleLowerCase('pt-BR');
    if (!topic || seen.has(key)) continue;
    seen.add(key);
    out.push(topic);
    if (out.length >= PROFILE_LIMITS.topics) break;
  }
  return out;
}

const ID = /^[\w-]{1,64}$/;

function sanitizeSection(raw: unknown): ProfileSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const id = typeof s['id'] === 'string' && ID.test(s['id']) ? s['id'] : null;
  if (!id) return null;
  const items: string[] = [];
  for (const it of Array.isArray(s['items']) ? s['items'] : []) {
    if (typeof it === 'string' && ID.test(it) && !items.includes(it)) items.push(it);
    if (items.length >= PROFILE_LIMITS.items) break;
  }
  return {
    id,
    title: line(s['title'], PROFILE_LIMITS.title),
    note: line(s['note'], PROFILE_LIMITS.note),
    density: SECTION_DENSITIES.find((d) => d.id === s['density'])?.id ?? 'completa',
    frame: s['frame'] === 'quadro' ? 'quadro' : 'parede',
    items,
  };
}

function sanitizeWalls(raw: unknown): Partial<Record<Kind, ProfileWall>> {
  const out: Partial<Record<Kind, ProfileWall>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const kind of KINDS) {
    const w = (raw as Record<string, unknown>)[kind];
    if (!w || typeof w !== 'object') continue;
    const wall: ProfileWall = {};
    if ((w as Record<string, unknown>)['hidden'] === true) wall.hidden = true;
    const t = text((w as Record<string, unknown>)['text'], PROFILE_LIMITS.wallText);
    if (t) wall.text = t;
    if (wall.hidden || wall.text) out[kind] = wall;
  }
  return out;
}

/** O perfil de um navegador, da nuvem ou do mural de alguém: só valores conhecidos, tudo com limite. */
export function sanitizeProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const sections: ProfileSection[] = [];
  for (const s of Array.isArray(p['sections']) ? p['sections'] : []) {
    const section = sanitizeSection(s);
    if (section && !sections.some((x) => x.id === section.id)) sections.push(section);
    if (sections.length >= PROFILE_LIMITS.sections) break;
  }
  return {
    emoji: isEmoji(p['emoji']) ? p['emoji'] : DEFAULT_EMOJI,
    photo: isStock(p['photo']) ? p['photo'] : 'amarelo',
    tagline: line(p['tagline'], PROFILE_LIMITS.tagline),
    about: text(p['about'], PROFILE_LIMITS.about),
    topics: sanitizeTopics(p['topics']),
    background: sanitizeBackground(p['background']),
    walls: sanitizeWalls(p['walls']),
    sections,
  };
}

/**
 * O perfil que vai no mural público: as seções só com as fichas que os outros veem (`shown`, os ids
 * das fichas e anotações públicas), para o id de uma ficha privada nunca sair daqui.
 */
export function publicProfile(p: Profile, shown: ReadonlySet<string>): Profile {
  return { ...p, sections: p.sections.map((s) => ({ ...s, items: s.items.filter((id) => shown.has(id)) })) };
}

/** Os números do quadro de cima, contados das fichas que aparecem (as públicas, para quem visita). */
export interface ProfileStats {
  /** Fichas e anotações. */
  cards: number;
  /** Quantos murais têm alguma. */
  walls: number;
  masterpieces: number;
  /** A ficha mais antiga ("mar. de 2024"), ou null sem nenhuma. */
  since: string | null;
}

export function profileStats(cards: readonly { kind: Kind; verdict?: string | null; createdAt: string }[]): ProfileStats {
  let oldest = Infinity;
  for (const c of cards) {
    const t = Date.parse(c.createdAt);
    if (t < oldest) oldest = t;
  }
  return {
    cards: cards.length,
    walls: new Set(cards.map((c) => c.kind)).size,
    masterpieces: cards.filter((c) => c.verdict === 'masterpiece').length,
    since: Number.isFinite(oldest) ? new Date(oldest).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : null,
  };
}

/** "Mural atualizado há 3 horas": quando a ficha mexida por último mudou (vazio sem nenhuma). */
export function updatedLabel(cards: readonly { updatedAt: string }[], now = Date.now()): string {
  let last = -Infinity;
  for (const c of cards) {
    const t = Date.parse(c.updatedAt);
    if (t > last) last = t;
  }
  if (!Number.isFinite(last)) return '';
  const min = Math.max(0, Math.floor((now - last) / 60_000));
  if (min < 2) return 'Mural atualizado agora';
  if (min < 60) return `Mural atualizado há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Mural atualizado há ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Mural atualizado ontem';
  if (d < 30) return `Mural atualizado há ${d} dias`;
  return `Mural atualizado em ${new Date(last).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
