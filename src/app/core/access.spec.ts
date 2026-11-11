import { AccessPerson, AccessState, accessSummary, namesOf } from './access';

const ana: AccessPerson = { codigo: 'AAAA1111', nome: 'Ana', papel: 'editor' };
const bia: AccessPerson = { codigo: 'BBBB2222', nome: 'Bia', papel: 'leitor' };
const caio: AccessPerson = { codigo: 'CCCC3333', nome: 'Caio', papel: 'gestor' };
const davi: AccessPerson = { codigo: 'DDDD4444', nome: 'Davi', papel: 'leitor' };

const own = (patch: Partial<AccessState> = {}): AccessState => ({ me: 'dono', meCode: 'EEEE5555', ownerName: 'Eu', members: [], public: false, ...patch });

describe('Quem vê, numa frase (core/access.ts)', () => {
  it('junta os nomes como se fala', () => {
    expect(namesOf([])).toBe('');
    expect(namesOf(['Ana'])).toBe('Ana');
    expect(namesOf(['Ana', 'Bia'])).toBe('Ana e Bia');
    expect(namesOf(['Ana', 'Bia', 'Caio'])).toBe('Ana, Bia e Caio');
    expect(namesOf(['Ana', 'Bia', 'Caio', 'Davi'])).toBe('Ana, Bia e mais 2');
  });

  it('a sua, sem ninguém: só você, ou qualquer pessoa (com o Feed ou não)', () => {
    expect(accessSummary(own())).toEqual({ line: 'Só você vê.', short: 'Só você' });
    expect(accessSummary(own({ public: true })).line).toBe('Qualquer pessoa vê no seu mural, sem ir para o Feed.');
    expect(accessSummary(own({ public: true, feed: true })).line).toContain('Feed de quem segue você');
    expect(accessSummary(own({ public: true })).short).toBe('Público');
  });

  it('a sua, com gente: quem vê, quem edita e que ninguém mais vê', () => {
    expect(accessSummary(own({ members: [ana] }))).toEqual({ line: 'Você e Ana veem. Ana também edita. Ninguém mais vê.', short: 'Com Ana' });
    expect(accessSummary(own({ members: [bia] })).line).toBe('Você e Bia veem. Só você edita. Ninguém mais vê.');
    expect(accessSummary(own({ members: [ana, caio] })).line).toBe('Você, Ana e Caio veem. Todos editam. Ninguém mais vê.');
    expect(accessSummary(own({ members: [ana, bia, caio, davi] }))).toEqual({
      line: 'Você, Ana, Bia e mais 2 veem. Ana e Caio também editam. Ninguém mais vê.',
      short: 'Com Ana e mais 3',
    });
    expect(accessSummary(own({ members: [ana, bia] })).short).toBe('Com Ana e Bia');
  });

  it('a sua, pública e com gente: qualquer pessoa lê, e quem edita', () => {
    expect(accessSummary(own({ members: [ana, bia], public: true }))).toEqual({ line: 'Qualquer pessoa pode ler. Você e Ana editam.', short: 'Público · com Ana e Bia' });
    expect(accessSummary(own({ members: [bia], public: true })).line).toBe('Qualquer pessoa pode ler. Só você edita.');
  });

  it('a de outra pessoa: de quem é, o que você pode, quem mais está e se é pública', () => {
    const member = (me: AccessState['me'], pub = false): AccessState => ({ me, meCode: ana.codigo, ownerName: 'Caio', members: [ana, bia], public: pub });
    expect(accessSummary(member('editor'))).toEqual({ line: 'É de Caio. Você pode editar. Também está: Bia. Ninguém mais vê.', short: 'De Caio · você edita' });
    expect(accessSummary(member('leitor')).short).toBe('De Caio · você só lê');
    expect(accessSummary(member('gestor')).line).toContain('Você pode editar e chamar gente.');
    expect(accessSummary(member('leitor', true))).toEqual({ line: 'É de Caio. Você só lê. Também está: Bia. Qualquer pessoa pode ler.', short: 'De Caio · você só lê · público' });
    expect(accessSummary({ ...member('leitor'), members: [ana] }).line).toBe('É de Caio. Você só lê. Ninguém mais vê.');
  });
});
