import { describe, expect, it } from 'vitest';
import type { QuadroV1 } from '../../contrato/api-v1/kanban';
import { conferirOp } from '../../contrato/api-v1/operacoes';
import { acharColuna, aplicarNoQuadroV1, conferirOpKanban, vizinha } from '../../contrato/api-v1/operacoes-kanban';
import { QUADRO_TRABALHO } from './kanban.suite';

/** As operações no Kanban (contrato/api-v1/operacoes-kanban.ts): a API mostra o quadro como o site vai deixar. */

const Q = QUADRO_TRABALHO;
const placeOf = (q: QuadroV1) => q.colunas.map((c) => `${c.nome}: ${q.cartoes.filter((x) => x.coluna === c.id).map((x) => x.nota).join(' ')}`);

describe('as operações no Kanban', () => {
  it('confere a forma: o quadro sempre, e os campos de cada operação', () => {
    expect(conferirOpKanban('cartao.mover', { coluna: 'Feito' }).ok).toBe(false);
    expect(conferirOpKanban('cartao.mover', { quadro: Q.id, coluna: ' Feito ', importancia: 'critico', status: '  Em   revisão ', depende_de: ['a1', 'a1'], no_mural: null })).toEqual({
      ok: true,
      dados: { quadro: Q.id, coluna: 'Feito', importancia: 'critico', status: 'Em revisão', depende_de: ['a1'], no_mural: null },
    });
    expect(conferirOpKanban('cartao.mover', { quadro: Q.id, status: '' })).toEqual({ ok: true, dados: { quadro: Q.id, status: null } });
    const bad = (op: Parameters<typeof conferirOpKanban>[0], raw: Record<string, unknown>) => {
      const r = conferirOpKanban(op, { quadro: Q.id, ...raw });
      return r.ok ? null : r.campo;
    };
    expect(bad('cartao.mover', { importancia: 'urgente' })).toBe('importancia');
    expect(bad('cartao.mover', { status: 'x'.repeat(29) })).toBe('status');
    expect(bad('cartao.mover', { posicao: -1 })).toBe('posicao');
    expect(bad('cartao.mover', { depende_de: ['com espaço'] })).toBe('depende_de');
    expect(bad('coluna.criar', {})).toBe('nome');
    expect(bad('coluna.criar', { nome: 'x'.repeat(41) })).toBe('nome');
    expect(bad('coluna.criar', { nome: 'Revisão', finaliza: 'sim' })).toBe('finaliza');
    expect(bad('coluna.editar', {})).toBe('campos');
    expect(bad('coluna.apagar', { para: 3 })).toBe('para');
  });

  it('a nota nova pode nascer no quadro: kanban com a coluna, a importância e o status', () => {
    expect(conferirOp('nota.criar', { titulo: 'A', grupo: 'Trabalho', kanban: { coluna: 'Fazendo', importancia: 'baixo' } })).toEqual({
      ok: true,
      dados: { titulo: 'A', grupo: 'Trabalho', kanban: { coluna: 'Fazendo', importancia: 'baixo' } },
    });
    const r = conferirOp('nota.criar', { titulo: 'A', kanban: { importancia: 'altissima' } });
    expect(r.ok === false && r.campo).toBe('kanban.importancia');
    expect(conferirOp('nota.criar', { titulo: 'A', kanban: 'Fazendo' }).ok).toBe(false);
  });

  it('acha a coluna pelo id ou pelo nome (sem acento e caixa); a vizinha é a da esquerda, ou a da direita na primeira', () => {
    expect(acharColuna(Q, 'c-feito')?.nome).toBe('Feito');
    expect(acharColuna(Q, 'FAZENDO')?.id).toBe('c-fazendo');
    expect(acharColuna(Q, 'Revisão')).toBeNull();
    expect(vizinha(Q, 'c-fazendo')?.id).toBe('c-afazer');
    expect(vizinha(Q, 'c-afazer')?.id).toBe('c-fazendo');
  });

  it('mover: muda de coluna (no lugar pedido ou, sem ele, em cima), finaliza ao chegar na que finaliza e abre ao sair', () => {
    const toDone = aplicarNoQuadroV1(Q, 'cartao.mover', 'trab-1', { quadro: Q.id, coluna: 'c-feito', posicao: 0 });
    expect(placeOf(toDone)).toEqual(['A fazer: trab-3', 'Fazendo: trab-4', 'Feito: trab-1 trab-2']);
    expect(toDone.cartoes.find((c) => c.nota === 'trab-1')).toEqual(expect.objectContaining({ finalizada: true, posicao: 0 }));
    expect(toDone.colunas.map((c) => c.cartoes)).toEqual([1, 1, 2]);
    const back = aplicarNoQuadroV1(Q, 'cartao.mover', 'trab-2', { quadro: Q.id, coluna: 'c-afazer' });
    expect(placeOf(back)).toEqual(['A fazer: trab-2 trab-1 trab-3', 'Fazendo: trab-4', 'Feito: ']);
    expect(back.cartoes.find((c) => c.nota === 'trab-2')?.finalizada).toBe(false);
    // sem coluna: o lugar na mesma coluna
    expect(placeOf(aplicarNoQuadroV1(Q, 'cartao.mover', 'trab-3', { quadro: Q.id, posicao: 0 }))[0]).toBe('A fazer: trab-3 trab-1');
  });

  it('mover: a importância, o status, as dependências e o "no mural" (null segue o grupo) ficam onde estão', () => {
    const q = aplicarNoQuadroV1(Q, 'cartao.mover', 'trab-4', { quadro: Q.id, importancia: null, status: null, depende_de: ['trab-1', 'trab-4'], no_mural: false });
    expect(placeOf(q)).toEqual(placeOf(Q));
    expect(q.cartoes.find((c) => c.nota === 'trab-4')).toEqual(expect.objectContaining({ importancia: null, status: null, depende_de: ['trab-1'], no_mural: false }));
    expect(aplicarNoQuadroV1(q, 'cartao.mover', 'trab-4', { quadro: Q.id, no_mural: null }).cartoes.find((c) => c.nota === 'trab-4')?.no_mural).toBe(true);
  });

  it('mover a nota que chega ao quadro: só com o que mostrar dela; sem coluna, a primeira', () => {
    expect(aplicarNoQuadroV1(Q, 'cartao.mover', 'nova', { quadro: Q.id })).toBe(Q);
    const q = aplicarNoQuadroV1(Q, 'cartao.mover', 'nova', { quadro: Q.id, importancia: 'medio' }, { titulo: 'Nova', finalizada: false, tags: ['x'] });
    expect(placeOf(q)[0]).toBe('A fazer: nova trab-1 trab-3');
    expect(q.cartoes.find((c) => c.nota === 'nova')).toEqual({
      nota: 'nova', titulo: 'Nova', coluna: 'c-afazer', posicao: 0, finalizada: false, importancia: 'medio', status: null, depende_de: [], no_mural: true, tags: ['x'],
    });
  });

  it('quem chega sem posicao vai para cima; com ela, no lugar; a coluna que se arruma sozinha ignora o lugar e põe em cima (o app arruma de verdade)', () => {
    expect(placeOf(aplicarNoQuadroV1(Q, 'cartao.mover', 'trab-4', { quadro: Q.id, coluna: 'c-afazer' }))[0]).toBe('A fazer: trab-4 trab-1 trab-3');
    expect(placeOf(aplicarNoQuadroV1(Q, 'cartao.mover', 'trab-4', { quadro: Q.id, coluna: 'c-afazer', posicao: 9 }))[0]).toBe('A fazer: trab-1 trab-3 trab-4');
    const sorted: QuadroV1 = { ...Q, colunas: Q.colunas.map((c) => (c.id === 'c-afazer' ? { ...c, ordem: 'Por importância.' } : c)) };
    expect(placeOf(aplicarNoQuadroV1(sorted, 'cartao.mover', 'trab-4', { quadro: Q.id, coluna: 'c-afazer', posicao: 2 }))[0]).toBe('A fazer: trab-4 trab-1 trab-3');
  });

  it('tirar, e as colunas: criar (depois de outra), mudar (o nome, o lugar), apagar (os cartões vão para a vizinha, para outra, ou saem)', () => {
    expect(placeOf(aplicarNoQuadroV1(Q, 'cartao.tirar', 'trab-3', { quadro: Q.id }))[0]).toBe('A fazer: trab-1');
    const made = aplicarNoQuadroV1(Q, 'coluna.criar', 'c-rev', { quadro: Q.id, nome: 'Revisão', depois_de: 'c-fazendo', finaliza: false });
    expect(made.colunas.map((c) => c.nome)).toEqual(['A fazer', 'Fazendo', 'Revisão', 'Feito']);
    expect(made.colunas[2]).toEqual({ id: 'c-rev', nome: 'Revisão', finaliza: false, pula: false, ordem: null, cartoes: 0 });
    const moved = aplicarNoQuadroV1(Q, 'coluna.editar', 'c-feito', { quadro: Q.id, nome: 'Pronto', posicao: 0, pula: true });
    expect(moved.colunas.map((c) => `${c.nome}${c.pula ? '*' : ''}`)).toEqual(['Pronto*', 'A fazer', 'Fazendo']);
    expect(placeOf(moved)).toEqual(['Pronto: trab-2', 'A fazer: trab-1 trab-3', 'Fazendo: trab-4']);
    expect(placeOf(aplicarNoQuadroV1(Q, 'coluna.apagar', 'c-fazendo', { quadro: Q.id }))).toEqual(['A fazer: trab-1 trab-3 trab-4', 'Feito: trab-2']);
    expect(placeOf(aplicarNoQuadroV1(Q, 'coluna.apagar', 'c-fazendo', { quadro: Q.id, para: 'c-feito' }))).toEqual(['A fazer: trab-1 trab-3', 'Feito: trab-2 trab-4']);
    expect(placeOf(aplicarNoQuadroV1(Q, 'coluna.apagar', 'c-fazendo', { quadro: Q.id, para: null }))).toEqual(['A fazer: trab-1 trab-3', 'Feito: trab-2']);
    const one: QuadroV1 = { ...Q, colunas: [Q.colunas[0]!], cartoes: [] };
    expect(aplicarNoQuadroV1(one, 'coluna.apagar', 'c-afazer', { quadro: Q.id })).toBe(one);
  });
});
