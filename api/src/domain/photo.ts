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
