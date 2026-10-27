import { describe, expect, it } from 'vitest';
import type { NotaV1 } from '../../contrato/api-v1/notas';
import { acrescentar, aplicarNaNotaV1, conferirOp, contarTarefas, idDeFicha, mexerNasTarefas, notaDoPedido } from '../../contrato/api-v1/operacoes';

/** As operações nas Anotações (contrato/api-v1/operacoes.ts): a API e o site aplicam igual. */
describe('as operações nas notas', () => {
  it('acrescentar: no fim ou no começo, com uma linha entre os dois', () => {
    expect(acrescentar('', 'novo', 'fim')).toBe('novo');
    expect(acrescentar('a\n\n', 'b', 'fim')).toBe('a\nb');
    expect(acrescentar('a', 'b', 'inicio')).toBe('b\na');
  });

  it('as tarefas: marca e desmarca pelo texto (sem caixa nem acento), recusa a que não existe ou se repete, e põe as novas depois da última', () => {
    const texto = 'Começo.\n- [ ] Mandar a ATA\n* [x] reservar a sala\nFim.';
    const ok = mexerNasTarefas(texto, { marcar: ['mandar a ata'], desmarcar: ['Reservar a sala'], novas: ['café', 'água'] });
    expect(ok).toEqual({ ok: true, texto: 'Começo.\n- [x] Mandar a ATA\n* [ ] reservar a sala\n- [ ] café\n- [ ] água\nFim.' });
    const miss = mexerNasTarefas(texto, { marcar: ['comprar pão'], desmarcar: [], novas: [] });
    expect(miss.ok).toBe(false);
    expect(!miss.ok && miss.erro).toContain('Mandar a ATA; reservar a sala');
    const twice = mexerNasTarefas('- [ ] a\n- [ ] A', { marcar: ['a'], desmarcar: [], novas: [] });
    expect(!twice.ok && twice.erro).toContain('2 vezes');
    // dentro de um bloco de código não é tarefa
    const code = mexerNasTarefas('```\n- [ ] a\n```\n- [ ] b', { marcar: ['a'], desmarcar: [], novas: [] });
    expect(code.ok).toBe(false);
    expect(mexerNasTarefas('', { marcar: [], desmarcar: [], novas: ['x'] })).toEqual({ ok: true, texto: '- [ ] x' });
    expect(mexerNasTarefas('Texto.', { marcar: [], desmarcar: [], novas: ['x'] })).toEqual({ ok: true, texto: 'Texto.\n- [ ] x' });
  });

  it('conta as tarefas como o Murall (fora dos blocos de código)', () => {
    expect(contarTarefas('- [x] a\n+ [ ] b\n```\n- [x] c\n```')).toEqual({ feitas: 1, total: 2 });
  });

  it('confere os dados de cada operação', () => {
    expect(conferirOp('nota.criar', { titulo: ' x ', grupo: '', tags: ['#a', 'A', ' b '] })).toEqual({ ok: true, dados: { titulo: 'x', grupo: null, tags: ['a', 'b'] } });
    expect(conferirOp('nota.criar', { titulo: 'x', fixada: 'sim' })).toEqual(expect.objectContaining({ ok: false, campo: 'fixada' }));
    expect(conferirOp('nota.editar', { versao: '2026-10-01T00:00:00Z' })).toEqual(expect.objectContaining({ ok: false, campo: 'campos' }));
    expect(conferirOp('nota.editar', { versao: '2026-10-01T00:00:00Z', assunto: null })).toEqual({ ok: true, dados: { assunto: null, versao: '2026-10-01T00:00:00Z' } });
    expect(conferirOp('nota.acrescentar', { texto: 'a', onde: 'meio' })).toEqual(expect.objectContaining({ ok: false, campo: 'onde' }));
    expect(conferirOp('nota.tarefas', { marcar: [''] })).toEqual(expect.objectContaining({ ok: false }));
    expect(conferirOp('nota.fixar', { qualquer: 1 })).toEqual({ ok: true, dados: {} });
  });

  it('a nota como vai ficar (o que a API mostra por cima)', () => {
    const n = notaDoPedido('r1', { titulo: 'A', texto: '- [ ] a' }, '2026-10-01T00:00:00.000Z');
    expect(n.visibilidade).toBe('privada');
    expect(n.tarefas).toEqual({ feitas: 0, total: 1 });
    const done = aplicarNaNotaV1(n, 'nota.finalizar', {}, '2026-10-02T00:00:00.000Z') as NotaV1;
    expect(done.finalizada_em).toBe('2026-10-02T00:00:00.000Z');
    expect((aplicarNaNotaV1(done, 'nota.finalizar', {}, '2026-10-03T00:00:00.000Z') as NotaV1).finalizada_em, 'finalizar de novo não muda o dia').toBe('2026-10-02T00:00:00.000Z');
    expect(aplicarNaNotaV1(n, 'nota.apagar', {}, 'x')).toBeNull();
    expect((aplicarNaNotaV1(n, 'nota.tarefas', { marcar: ['nao existe'], desmarcar: [], novas: [] }, 'x') as NotaV1).texto, 'com erro, fica como estava').toBe('- [ ] a');
  });

  it('o id da ficha nova tem o jeito do newId do Murall', () => {
    expect(idDeFicha(Date.UTC(2026, 9, 27), 'abc123def456')).toBe(`r${Date.UTC(2026, 9, 27).toString(36)}abc123def456`);
    expect(idDeFicha(1, 'A-b')).toBe('r1b00000000000');
  });
});
