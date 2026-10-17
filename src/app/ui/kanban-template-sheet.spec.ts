import { sampleNote } from './kanban-template-sheet';

describe('sampleNote (a prévia do card padrão)', () => {
  afterEach(() => jasmine.clock().uninstall());

  it('a data é a de hoje no fuso de quem usa, também tarde da noite', () => {
    jasmine.clock().install();
    // 23h30 no relógio daqui: no UTC (do Brasil) já seria amanhã
    jasmine.clock().mockDate(new Date(2026, 9, 17, 23, 30));
    expect(sampleNote('x', 'Exemplo', {}).completedAt).toBe('2026-10-17');
  });
});
