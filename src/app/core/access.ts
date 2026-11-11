import { MemberRole, SharedRole } from './shared-notes';

/**
 * Quem vê, numa frase (PLANO-COMPARTILHAR.md, 4.1): a resposta a "quem vê isto?" e "quem mexe nisto?",
 * a mesma em todo lugar que mostra uma coisa dividida com alguém (a folha Compartilhar, a linha da
 * leitura, a etiqueta Quem vê do editor). Tudo puro, sem Angular.
 *
 * As três perguntas do modelo: quem está (o dono e as pessoas, cada uma com o seu papel), quem mais vê
 * (só quem está, ou qualquer pessoa: o público) e de onde vem (o grupo, numa rodada seguinte).
 */

export interface AccessPerson {
  codigo: string;
  nome: string;
  papel: MemberRole;
}

export interface AccessState {
  /** O papel de quem olha. */
  me: SharedRole;
  /** O código de quem olha (para tirar a pessoa da lista dos outros); null sem conta. */
  meCode: string | null;
  /** O nome do dono (quando não é quem olha). */
  ownerName: string;
  /** As pessoas além do dono, na ordem em que entraram (quem olha pode estar entre elas). */
  members: readonly AccessPerson[];
  /** Qualquer pessoa vê (o mural de quem visita e o link). */
  public: boolean;
  /** Pública e no Feed de quem segue (só a anotação do dono, sem ninguém nela, diz isso). */
  feed?: boolean;
}

export interface AccessSummary {
  /** A frase inteira, com ponto: o topo da folha e o título da linha da leitura. */
  line: string;
  /** O resumo curto, sem ponto: a etiqueta Quem vê, a linha da data, a etiqueta da pasta. */
  short: string;
}

/** "Ana", "Ana e Bruno", "Ana, Bruno e Carla", "Ana, Bruno e mais 2". */
export function namesOf(names: readonly string[], max = 3): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
  const shown = names.slice(0, max - 1);
  return `${shown.join(', ')} e mais ${names.length - shown.length}`;
}

const CAN: Record<MemberRole, string> = { gestor: 'pode editar e chamar gente', editor: 'pode editar', leitor: 'só lê' };
const CAN_SHORT: Record<MemberRole, string> = { gestor: 'você gere', editor: 'você edita', leitor: 'você só lê' };

const writes = (p: AccessPerson) => p.papel !== 'leitor';

export function accessSummary(s: AccessState): AccessSummary {
  if (s.me === 'dono') {
    const others = s.members.filter((m) => m.codigo !== s.meCode);
    const names = others.map((m) => m.nome);
    if (!names.length) {
      if (!s.public) return { line: 'Só você vê.', short: 'Só você' };
      return s.feed
        ? { line: 'Qualquer pessoa vê no seu mural, e ela foi para o Feed de quem segue você.', short: 'Público' }
        : { line: 'Qualquer pessoa vê no seu mural, sem ir para o Feed.', short: 'Público' };
    }
    const writers = others.filter(writes).map((m) => m.nome);
    if (s.public) {
      const edit = writers.length ? `Você e ${namesOf(writers)} editam.` : 'Só você edita.';
      return { line: `Qualquer pessoa pode ler. ${edit}`, short: `Público · com ${namesOf(names, 2)}` };
    }
    const edit = !writers.length
      ? 'Só você edita.'
      : writers.length === names.length && names.length > 1
        ? 'Todos editam.'
        : `${namesOf(writers)} também ${writers.length > 1 ? 'editam' : 'edita'}.`;
    const who = names.length === 1 ? `Você e ${names[0]}` : `Você, ${namesOf(names)}`;
    return { line: `${who} veem. ${edit} Ninguém mais vê.`, short: `Com ${namesOf(names, 2)}` };
  }
  const mine = s.me;
  const others = s.members.filter((m) => m.codigo !== s.meCode).map((m) => m.nome);
  const also = others.length ? ` Também ${others.length > 1 ? 'estão' : 'está'}: ${namesOf(others)}.` : '';
  const more = s.public ? ' Qualquer pessoa pode ler.' : ' Ninguém mais vê.';
  return {
    line: `É de ${s.ownerName}. Você ${CAN[mine]}.${also}${more}`,
    short: `De ${s.ownerName} · ${CAN_SHORT[mine]}${s.public ? ' · público' : ''}`,
  };
}
