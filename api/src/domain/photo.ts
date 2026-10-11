import { isEmoji } from './emoji';

/**
 * A "foto" do perfil: o emoji e a cartolina atrás dele, na polaroid (no site, `core/profile.ts`). A
 * nuvem só guarda para a lista de amigos (`GET /v1/murais/:codigo/amigos`) mostrar a carinha de cada
 * um; o perfil inteiro continua dentro do mural público, que o servidor não abre.
 */
export interface Photo {
  emoji: string;
  cor: string;
}

/** As cartolinas do site: uma cor, clara ou escura ("azul", "azul-escuro", "preto"). */
const STOCK_RE = /^[a-z]{3,12}(?:-escuro)?$/;

/** A parte `foto` do envio do mural, guardada como veio só se servir; senão, null (fica a de antes). */
export function parsePhoto(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown> | null;
    if (!data || !isEmoji(data['emoji']) || typeof data['cor'] !== 'string' || !STOCK_RE.test(data['cor'])) return null;
    return JSON.stringify({ emoji: data['emoji'], cor: data['cor'] } satisfies Photo);
  } catch {
    return null;
  }
}

/** A foto guardada, para devolver ao site (null: a pessoa ainda não enviou o mural depois disto). */
export function photoOut(stored: string | null | undefined): Photo | null {
  if (!stored) return null;
  try {
    const data = JSON.parse(stored) as Photo;
    return isEmoji(data.emoji) && STOCK_RE.test(data.cor) ? { emoji: data.emoji, cor: data.cor } : null;
  } catch {
    return null;
  }
}

/** O fundo do perfil: um material de papelaria, uma cartolina, ou uma imagem por link (https). */
export type Background = { kind: 'material'; material: string } | { kind: 'cartolina'; stock: string } | { kind: 'link'; url: string };

/**
 * O cartão de uma pessoa nas listas de Seguindo e Seguidores (`GET /v1/murais/:codigo/pessoas`): a
 * foto, o fundo do perfil, a linha curta embaixo do nome e quantas fichas e murais ela tem à mostra.
 * O site manda a cada envio do mural (a parte `cartao`), já que o servidor não abre o mural público.
 */
export interface Card extends Photo {
  fundo: Background;
  linha: string;
  fichas: number;
  murais: number;
}

const MATERIAL_RE = /^[a-z]{3,16}$/;
/** Um link de imagem como o site aceita no fundo do perfil: https, sem espaço nem aspas. */
const URL_RE = /^https:\/\/[^\s"'<>()\\]{3,600}$/;

function background(raw: unknown): Background | null {
  const b = raw as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return null;
  if (b['kind'] === 'material' && typeof b['material'] === 'string' && MATERIAL_RE.test(b['material'])) return { kind: 'material', material: b['material'] };
  if (b['kind'] === 'cartolina' && typeof b['stock'] === 'string' && STOCK_RE.test(b['stock'])) return { kind: 'cartolina', stock: b['stock'] };
  if (b['kind'] === 'link' && typeof b['url'] === 'string' && URL_RE.test(b['url'])) return { kind: 'link', url: b['url'] };
  return null;
}

/** Uma linha só, sem invisíveis, até `max` caracteres. */
function line(v: unknown, max: number): string {
  return typeof v === 'string'
    ? Array.from(v.replace(/\s+/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, '').trim())
        .slice(0, max)
        .join('')
        .trim()
    : '';
}

const count = (v: unknown, max: number): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);

/** O cartão que veio (do envio ou do banco), arrumado; null se não serve. */
export function cleanCard(raw: unknown): Card | null {
  const data = raw as Record<string, unknown> | null;
  if (!data || typeof data !== 'object' || !isEmoji(data['emoji']) || typeof data['cor'] !== 'string' || !STOCK_RE.test(data['cor'])) return null;
  const fundo = background(data['fundo']);
  if (!fundo) return null;
  return { emoji: data['emoji'], cor: data['cor'], fundo, linha: line(data['linha'], 60), fichas: count(data['fichas'], 100_000), murais: count(data['murais'], 20) };
}

/** A parte `cartao` do envio do mural, pronta para guardar; null se não serve (fica o de antes). */
export function parseCard(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2_000) return null;
  try {
    const card = cleanCard(JSON.parse(raw));
    return card ? JSON.stringify(card) : null;
  } catch {
    return null;
  }
}

/** O cartão guardado; sem ele, só a foto (de quem enviou o mural antes do cartão existir). */
export function cardOut(stored: string | null | undefined, photo: string | null | undefined): Card | Photo | null {
  if (stored) {
    try {
      const card = cleanCard(JSON.parse(stored));
      if (card) return card;
    } catch {
      /* fica a foto */
    }
  }
  return photoOut(photo);
}
