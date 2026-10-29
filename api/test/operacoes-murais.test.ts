import { describe, expect, it } from 'vitest';
import { opMuda } from '../../contrato/api-v1/operacoes';
import { conferirOpMural, desejoDoPedido, editarDesejoV1, itemDoPedido, type PorItemV1 } from '../../contrato/api-v1/operacoes-murais';
import { SILKSONG } from './murais.suite';

/** As operações na Wishlist e no Pra depois (contrato/api-v1/operacoes-murais.ts). */

const AGORA = '2026-10-29T12:00:00.000Z';
const campo = (op: Parameters<typeof conferirOpMural>[0], raw: unknown) => {
  const r = conferirOpMural(op, raw);
  return r.ok ? null : r.campo;
};

describe('conferir uma operação dos murais', () => {
  it('pôr: o mural e o nome são obrigatórios; o ano, o por, a capa e a relevância, como o app guarda', () => {
    expect(conferirOpMural('desejo.por', { mural: 'jogos', nome: '  Hades   II ', ano: 2025, relevancia: 'must' })).toEqual({
      ok: true,
      dados: { mural: 'jogos', nome: 'Hades II', ano: '2025', relevancia: 'must' },
    });
    // comum é o padrão (não vai); buscar_capa false só vale sem capa
    expect(conferirOpMural('desejo.por', { mural: 'livros', nome: 'Duna', relevancia: 'comum', buscar_capa: false })).toEqual({ ok: true, dados: { mural: 'livros', nome: 'Duna', buscar_capa: false } });
    expect(conferirOpMural('pra-depois.por', { mural: 'jogos', nome: 'Celeste', capa: 'https://c/x.jpg', buscar_capa: false })).toEqual({ ok: true, dados: { mural: 'jogos', nome: 'Celeste', capa: 'https://c/x.jpg' } });
    expect(campo('desejo.por', { mural: 'anotacoes', nome: 'X' })).toBe('mural');
    expect(campo('desejo.por', { mural: 'jogos' })).toBe('nome');
    expect(campo('desejo.por', { mural: 'jogos', nome: 'X', ano: '25' })).toBe('ano');
    expect(campo('desejo.por', { mural: 'jogos', nome: 'X', capa: 'http://c' })).toBe('capa');
    expect(campo('desejo.por', { mural: 'jogos', nome: 'X', relevancia: 'urgente' })).toBe('relevancia');
    expect(campo('pra-depois.por', { mural: 'jogos', nome: 'X', relevancia: 'must' })).toBe('relevancia');
  });

  it('mudar o desejo pede a versão e algo para mudar; null tira o ano, o por e a capa; tirar pede a versão', () => {
    expect(campo('desejo.editar', { relevancia: 'must' })).toBe('versao');
    expect(campo('desejo.editar', { versao: AGORA })).toBe('campos');
    expect(conferirOpMural('desejo.editar', { versao: AGORA, relevancia: 'later', capa: null, ano: null })).toEqual({ ok: true, dados: { versao: AGORA, relevancia: 'later', capa: null, ano: null } });
    expect(campo('desejo.tirar', {})).toBe('versao');
    expect(conferirOpMural('pra-depois.tirar', { versao: AGORA })).toEqual({ ok: true, dados: { versao: AGORA } });
  });

  it('pôr não espera a aprovação "mudancas"; mudar e tirar esperam', () => {
    expect(opMuda('desejo.por')).toBe(false);
    expect(opMuda('pra-depois.por')).toBe(false);
    expect(opMuda('desejo.editar')).toBe(true);
    expect(opMuda('desejo.tirar')).toBe(true);
    expect(opMuda('pra-depois.tirar')).toBe(true);
  });
});

describe('o item como vai ficar', () => {
  it('o posto: sem capa dada, ainda sem capa (o Murall procura); o desejo, comum sem dizer', () => {
    const d: PorItemV1 = { mural: 'livros', nome: 'Duna', por: 'Frank Herbert' };
    expect(desejoDoPedido('dl-novo', d, AGORA)).toEqual({ id: 'dl-novo', mural: 'livros', nome: 'Duna', ano: null, por: 'Frank Herbert', capa: null, relevancia: 'comum', criado_em: AGORA, versao: AGORA });
    expect(itemDoPedido('pd-novo', d, AGORA)).not.toHaveProperty('relevancia');
  });

  it('o mudado: os campos por cima, com a versão nova', () => {
    expect(editarDesejoV1(SILKSONG, { versao: SILKSONG.versao, relevancia: 'later', capa: null }, AGORA)).toEqual({ ...SILKSONG, relevancia: 'later', capa: null, versao: AGORA });
  });
});
