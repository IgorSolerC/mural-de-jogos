import { FeedItem } from './follow';
import { groupNotices, noticeSpoken, noticeVerb, noticeWhere, peopleNames } from './notices';

const ana = { codigo: 'AAAA-1111', nome: 'Ana' };
const bia = { codigo: 'BBBB-2222', nome: 'Bia' };
const cris = { codigo: 'CCCC-3333', nome: 'Cris' };
const dani = { codigo: 'DDDD-4444', nome: 'Dani' };

const at = (h: number) => `2026-10-06T${String(h).padStart(2, '0')}:00:00.000Z`;
const resenha = (pessoa: typeof ana, ref: string, h: number): FeedItem => ({ tipo: 'resenha', em: at(h), pessoa, ref, titulo: `Obra ${ref}`, mural: 'jogos', silenciado: false });
const seguiu = (pessoa: typeof ana, h: number, euSigo = false): FeedItem => ({ tipo: 'seguiu', em: at(h), pessoa, euSigo });
const reagiu = (pessoa: typeof ana, ref: string, h: number, reacao: 'fogo' | 'amei' | 'rindo' = 'fogo', mural: 'jogos' | 'anotacoes' = 'jogos'): FeedItem => ({
  tipo: 'reagiu',
  em: at(h),
  pessoa,
  ref,
  titulo: `Obra ${ref}`,
  mural,
  silenciado: false,
  reacao,
});
const comentou = (pessoa: typeof ana, ref: string, h: number, mural: 'jogos' | 'anotacoes' = 'jogos'): FeedItem => ({ tipo: 'comentou', em: at(h), pessoa, ref, titulo: `Obra ${ref}`, mural, silenciado: false });

describe('os avisos de Amigos', () => {
  it('as resenhas dos amigos não são avisos: ficam no Feed', () => {
    const notices = groupNotices([resenha(ana, 'rana01', 20), seguiu(bia, 19), resenha(ana, 'rana02', 18)]);
    expect(notices.map((n) => n.tipo)).toEqual(['seguiu']);
  });

  it('reações seguidas à mesma ficha viram um aviso só, cada pessoa uma vez e cada reação uma vez', () => {
    const [first, second, ...rest] = groupNotices([
      reagiu(ana, 'rminha1', 20, 'fogo'),
      reagiu(bia, 'rminha1', 19, 'amei'),
      reagiu(ana, 'rminha1', 18, 'rindo'), // a reação mais velha da Ana não conta de novo
      reagiu(cris, 'rminha1', 17, 'fogo'),
      reagiu(ana, 'rminha2', 16, 'amei'),
    ]);
    expect(rest).toEqual([]);
    expect(first.tipo).toBe('reagiu');
    expect(first.people.map((p) => p.nome)).toEqual(['Ana', 'Bia', 'Cris']);
    expect(first.tipo === 'reagiu' && first.reactions).toEqual(['fogo', 'amei']);
    // o aviso leva a hora e o "Novo" do mais novo do grupo
    expect(first.item.em).toBe(at(20));
    expect(second.people.map((p) => p.nome)).toEqual(['Ana']);
  });

  it('uma resenha de amigo entre duas reações à mesma ficha não separa mais o aviso', () => {
    const notices = groupNotices([reagiu(ana, 'rminha1', 20), resenha(bia, 'rbia01', 19), reagiu(cris, 'rminha1', 18, 'amei')]);
    expect(notices.length).toBe(1);
    expect(notices[0].people.map((p) => p.nome)).toEqual(['Ana', 'Cris']);
  });

  it('um comentário entre duas reações à mesma ficha separa os avisos, na ordem em que chegaram', () => {
    const notices = groupNotices([reagiu(ana, 'rminha1', 20), comentou(bia, 'rminha1', 19), reagiu(cris, 'rminha1', 18)]);
    expect(notices.map((n) => n.tipo)).toEqual(['reagiu', 'comentou', 'reagiu']);
  });

  it('comentários seguidos na mesma ficha viram um aviso só; quem começou a seguir nunca se junta', () => {
    const notices = groupNotices([comentou(ana, 'rminha1', 20), comentou(bia, 'rminha1', 19), comentou(ana, 'rminha1', 18), seguiu(cris, 17), seguiu(dani, 16)]);
    expect(notices.map((n) => `${n.tipo}×${n.people.length}`)).toEqual(['comentou×2', 'seguiu×1', 'seguiu×1']);
  });

  it('cada aviso tem uma chave só dele, para a lista', () => {
    const keys = groupNotices([reagiu(ana, 'rminha1', 20), comentou(bia, 'rminha1', 19), reagiu(cris, 'rminha1', 18), seguiu(dani, 17), seguiu(dani, 5)]).map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('os nomes: um, dois, e daí em diante "e mais N"', () => {
    expect(peopleNames([ana])).toBe('Ana');
    expect(peopleNames([ana, bia])).toBe('Ana e Bia');
    expect(peopleNames([ana, bia, cris, dani])).toBe('Ana, Bia e mais 2');
  });

  it('a frase de cada aviso, no singular e no plural, para ficha e para anotação', () => {
    const [many, note, follow, comments, noteComment] = groupNotices([
      reagiu(ana, 'rminha1', 20, 'fogo'),
      reagiu(bia, 'rminha1', 19, 'amei'),
      reagiu(ana, 'nminha2', 18, 'amei', 'anotacoes'),
      seguiu(cris, 17),
      comentou(ana, 'rminha3', 16),
      comentou(bia, 'rminha3', 15),
      comentou(ana, 'nminha4', 14, 'anotacoes'),
    ]);
    expect(noticeVerb(many)).toBe('reagiram');
    expect(noticeSpoken(many)).toBe('Ana e Bia reagiram com Fogo, Amei à sua ficha de Obra rminha1');
    expect(noticeSpoken(note)).toBe('Ana reagiu com Amei à sua anotação Obra nminha2');
    expect(noticeSpoken(follow)).toBe('Cris começou a seguir você');
    expect(noticeSpoken(comments)).toBe('Ana e Bia comentaram na sua ficha de Obra rminha3');
    expect(noteComment.tipo === 'comentou' && noticeWhere(noteComment)).toBe('na sua anotação');
  });
});
