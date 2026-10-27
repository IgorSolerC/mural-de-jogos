import { ESCOPOS } from '../../../contrato/api-v1/escopos';
import { andList, approvalLabel, connectorLabel, dayLabel, expired, groupsLabel, scopeSummary, usedLabel, validityLabel } from './api-keys';

/** O que a lista de Ajustes › Acessos diz de cada chave (core/api-keys.ts). */
describe('as chaves de API em palavras', () => {
  const NOW = new Date(2026, 9, 27, 12, 0, 0);

  it('junta com vírgulas e "e"', () => {
    expect(andList([])).toBe('');
    expect(andList(['ver'])).toBe('ver');
    expect(andList(['ver', 'lançar'])).toBe('ver e lançar');
    expect(andList(['ver', 'criar', 'mudar'])).toBe('ver, criar e mudar');
  });

  it('resume o que a chave pode, por área e na ordem do Murall', () => {
    expect(scopeSummary(['gastos:lancar', 'notas:editar', 'notas:ler', 'gastos:ler'])).toEqual(['Anotações: ver e mudar', 'Gastos: ver e lançar']);
    expect(scopeSummary(['kanban:mover', 'publicar'])).toEqual(['Kanban: mover cartões', 'Mudar quem vê']);
    expect(scopeSummary(['nao:existe'])).toEqual([]);
  });

  it('todo escopo tem um verbo curto (o resumo nunca fica vazio)', () => {
    for (const e of ESCOPOS) expect(scopeSummary([e.id]).length).withContext(e.id).toBe(1);
  });

  it('a validade e o vencimento', () => {
    const later = new Date(2026, 11, 25, 9).toISOString();
    const nextYear = new Date(2027, 0, 25, 9).toISOString();
    const before = new Date(2026, 10, 3 - 30, 9).toISOString();
    expect(dayLabel(later, NOW)).toBe('25 de dezembro');
    expect(dayLabel(nextYear, NOW)).toBe('25 de janeiro de 2027');
    expect(validityLabel({ expiraEm: later }, NOW)).toBe('Vale até 25 de dezembro');
    expect(expired({ expiraEm: before }, NOW)).toBeTrue();
    expect(validityLabel({ expiraEm: before }, NOW)).toBe('Venceu em 4 de outubro');
    expect(expired({ expiraEm: NOW.toISOString() }, NOW)).withContext('na hora exata, já venceu (como a nuvem)').toBeTrue();
  });

  it('o último uso', () => {
    const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
    expect(usedLabel({ usadaEm: null }, NOW)).toBe('Nunca usada');
    expect(usedLabel({ usadaEm: ago(0.5) }, NOW)).toBe('Usada agora há pouco');
    expect(usedLabel({ usadaEm: ago(1) }, NOW)).toBe('Usada há 1 hora');
    expect(usedLabel({ usadaEm: ago(5) }, NOW)).toBe('Usada há 5 horas');
    expect(usedLabel({ usadaEm: ago(30) }, NOW)).toBe('Usada ontem');
    expect(usedLabel({ usadaEm: ago(24 * 20) }, NOW)).toBe('Usada em 7 de outubro');
  });

  it('a aprovação e os grupos (só quando a chave mexe em anotações ou no Kanban)', () => {
    expect(approvalLabel('mudancas')).toBe('Espera você aprovar o que muda ou apaga');
    expect(approvalLabel('tudo')).toBe('Espera você aprovar tudo');
    expect(approvalLabel('nunca')).toBe('Não espera aprovação');
    expect(groupsLabel({ escopos: ['gastos:ler'], grupos: ['Trabalho'] })).toBeNull();
    expect(groupsLabel({ escopos: ['notas:ler'], grupos: null })).toBe('Em todos os grupos');
    expect(groupsLabel({ escopos: ['kanban:ler'], grupos: ['Trabalho'] })).toBe('Só no grupo Trabalho');
    expect(groupsLabel({ escopos: ['notas:ler'], grupos: ['Trabalho', 'Estudos', 'Casa'] })).toBe('Só nos grupos Trabalho, Estudos e Casa');
  });

  it('a chave de um conector diz de onde ele é', () => {
    expect(connectorLabel({ origem: 'oauth', conector: { dominio: 'claude.ai' } })).toBe('Conector em claude.ai');
    expect(connectorLabel({ origem: 'oauth', conector: null })).toBe('Conector');
    expect(connectorLabel({ origem: 'manual' })).toBeNull();
  });
});
