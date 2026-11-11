import { HttpError } from '../errors';
import { Access, Role } from './shared-note';

/**
 * Os grupos compartilhados (migração 0025, PLANO-COMPARTILHAR.md). Um grupo das anotações dividido com
 * outras pessoas: o documento dele (o nome, o desenho e a cor, as pastas, as cores das tags e o quadro do
 * Kanban) e as anotações dele, que moram em `notas` com o `grupo_id`.
 *
 * Os papéis são os da anotação (seção 3.2 do plano):
 * - leitor: vê tudo, comenta, não muda nada;
 * - editor: escreve as anotações, cria novas, mexe no Kanban, nas pastas e nas tags; apaga só as anotações
 *   que ele criou;
 * - gestor: também chama e tira gente, troca papéis, muda o nome, o desenho e a cor e o público; apaga
 *   qualquer anotação do grupo;
 * - dono: também para de compartilhar o grupo (ninguém tira o dono).
 *
 * O que se escreve num grupo é do grupo (resposta P4): a anotação do grupo tem o dono do grupo como
 * `dono_id`; quem sai do grupo perde o acesso a ela, mesmo a que escreveu.
 */

/** Quantas pessoas (além do dono) um grupo aceita. */
export const MAX_GROUP_MEMBERS = 30;
/** Quantos grupos compartilhados (dela e com ela) uma conta tem, no máximo. */
export const MAX_GROUPS_PER_USER = 50;
/** Quantas anotações um grupo compartilhado tem, no máximo. */
export const MAX_GROUP_NOTES = 2_000;
/** O tamanho do documento do grupo guardado (JSON), em caracteres: o Kanban de 1.000 cartões cabe. */
export const MAX_GROUP_CHARS = 450_000;
/** O maior pedido aceito numa gravação do grupo. */
export const MAX_GROUP_BODY_CHARS = MAX_GROUP_CHARS + 4_096;
/** O nome do grupo, como o site guarda (`cleanCategory`). */
export const GROUP_NAME_MAX = 40;

const ID_RE = /^g[A-Za-z0-9_-]{8,40}$/;

/** O id de um grupo compartilhado: `g` e o sorteio do site. */
export function groupId(raw: unknown): string {
  if (typeof raw !== 'string' || !ID_RE.test(raw)) throw new HttpError(400, 'grupo-invalido', 'Esse grupo não existe.');
  return raw;
}

/** O papel mais alto entre dois (o acesso que vem da anotação e o que vem do grupo: vale o mais aberto). */
const RANK: Record<Access, number> = { leitor: 1, editor: 2, gestor: 3, dono: 4 };
export function widest(a: Access | null, b: Access | null): Access | null {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * O documento do grupo que veio do site, pronto para guardar (JSON). Tem de ser um objeto com o nome
 * (o resto, o servidor não abre: quem desenha e junta é o site).
 */
export function groupData(raw: unknown): string {
  const bad = () => new HttpError(400, 'grupo-invalido', 'Esse grupo veio quebrado.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad();
  const nome = (raw as Record<string, unknown>)['nome'];
  if (typeof nome !== 'string' || !nome.trim() || nome.length > GROUP_NAME_MAX) throw bad();
  const text = JSON.stringify(raw);
  if (text.length > MAX_GROUP_CHARS) {
    throw new HttpError(413, 'grupo-grande-demais', 'O grupo ficou grande demais para compartilhar (passa de 450 mil caracteres).');
  }
  return text;
}

/**
 * O que só o dono e os gestores mudam no documento: o nome e a aparência (o desenho e a cor). O resto (o
 * Kanban, as pastas, as tags) o editor também muda.
 */
export function groupStructureOf(stored: string): string {
  let r: Record<string, unknown> = {};
  try {
    const data = JSON.parse(stored) as unknown;
    if (data && typeof data === 'object') r = data as Record<string, unknown>;
  } catch {
    /* sem estrutura */
  }
  // na ordem das chaves, não na que o site mandou: um site que escreve as chaves em outra ordem não muda nada
  return stable({ nome: r['nome'] ?? null, aparencia: r['aparencia'] ?? null });
}

/** O JSON com as chaves em ordem (a mesma coisa dá sempre o mesmo texto). */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** O nome do grupo guardado, para o aviso. */
export function groupNameOf(stored: string): string {
  try {
    const nome = (JSON.parse(stored) as { nome?: unknown }).nome;
    return typeof nome === 'string' && nome.trim() ? nome.trim().slice(0, GROUP_NAME_MAX) : 'Grupo';
  } catch {
    return 'Grupo';
  }
}

/**
 * O pedaço de SQL "`?` está na anotação `alias`": é a dona, está nela, ou está no grupo dela. Leva dois
 * parâmetros, os dois o id da pessoa. O dono do grupo é o `dono_id` das anotações do grupo.
 */
export function inNoteSql(alias: string): string {
  return (
    `(${alias}.dono_id = ? OR EXISTS (SELECT 1 FROM nota_membros im WHERE im.nota_id = ${alias}.id AND im.usuario_id = ?) ` +
    `OR (${alias}.grupo_id IS NOT NULL AND EXISTS (SELECT 1 FROM grupo_membros ig WHERE ig.grupo_id = ${alias}.grupo_id AND ig.usuario_id = ?)))`
  );
}

/** O mesmo, sem contar a dona: `?` está na anotação `alias` como membro (dela ou do grupo dela). Dois parâmetros. */
export function memberOfNoteSql(alias: string): string {
  return (
    `(EXISTS (SELECT 1 FROM nota_membros im WHERE im.nota_id = ${alias}.id AND im.usuario_id = ?) ` +
    `OR (${alias}.grupo_id IS NOT NULL AND EXISTS (SELECT 1 FROM grupo_membros ig WHERE ig.grupo_id = ${alias}.grupo_id AND ig.usuario_id = ?)))`
  );
}

/** Papel guardado → papel (o desconhecido não vale). */
export function asRole(v: unknown): Role | null {
  return v === 'gestor' || v === 'editor' || v === 'leitor' ? v : null;
}
