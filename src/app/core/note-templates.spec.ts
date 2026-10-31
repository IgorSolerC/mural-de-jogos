import { sanitizeNotesConfig } from './mural-config';
import { MAX_TEMPLATES, MAX_TEMPLATE_TEXT, MAX_TEMPLATE_TITLE, cleanTitle, newTemplateId, sanitizeTemplates, sortedTemplates, suggestedTitle, titleTaken, withTemplate } from './note-templates';

describe('os templates do texto', () => {
  it('guardados: só os que têm id, nome e texto, sem repetir o id, com o texto e o nome nos limites', () => {
    const list = sanitizeTemplates([
      { id: 'a1', title: '  Reunião   da semana ', text: '## Pauta\r\n- [ ] ' },
      { id: 'a1', title: 'Repetido', text: 'x' },
      { id: 'B!', title: 'Id estranho', text: 'x' },
      { id: 'c3', title: '', text: 'sem nome' },
      { id: 'd4', title: 'Sem texto', text: '   ' },
      { id: 'e5', title: 'x'.repeat(200), text: 'y'.repeat(MAX_TEMPLATE_TEXT + 10) },
      'lixo',
      null,
    ]);
    expect(list.map((t) => t.id)).toEqual(['a1', 'e5']);
    expect(list[0]).toEqual({ id: 'a1', title: 'Reunião da semana', text: '## Pauta\n- [ ] ' });
    expect(list[1].title.length).toBe(MAX_TEMPLATE_TITLE);
    expect(list[1].text.length).toBe(MAX_TEMPLATE_TEXT);
    expect(sanitizeTemplates('nada')).toEqual([]);
  });

  it('no máximo MAX_TEMPLATES', () => {
    const many = Array.from({ length: MAX_TEMPLATES + 5 }, (_, i) => ({ id: 't' + i, title: 'T' + i, text: 'x' }));
    expect(sanitizeTemplates(many).length).toBe(MAX_TEMPLATES);
  });

  it('vão nas configurações do mural de anotações (o que não serve fica de fora)', () => {
    const cfg = sanitizeNotesConfig({ templates: [{ id: 'ok', title: 'Diário', text: 'Hoje:' }, { id: 'ruim' }] });
    expect(cfg.templates).toEqual([{ id: 'ok', title: 'Diário', text: 'Hoje:' }]);
    expect(sanitizeNotesConfig({}).templates).toEqual([]);
  });

  it('o menu mostra pelo nome (sem ligar para caixa e acento, os números na ordem deles)', () => {
    const list = [
      { id: 'a', title: 'Semana 10', text: 'x' },
      { id: 'b', title: 'ábaco', text: 'x' },
      { id: 'c', title: 'Semana 2', text: 'x' },
    ];
    expect(sortedTemplates(list).map((t) => t.title)).toEqual(['ábaco', 'Semana 2', 'Semana 10']);
  });

  it('o nome repetido é o de outro template, sem ligar para caixa, acento e espaços', () => {
    const list = [{ id: 'a', title: 'Reunião', text: 'x' }];
    expect(titleTaken(list, '  reuniao ', null)).toBeTrue();
    expect(titleTaken(list, 'Reunião', 'a')).toBeFalse();
    expect(titleTaken(list, 'Outro', null)).toBeFalse();
  });

  it('pôr na lista troca o de mesmo id, ou entra no fim', () => {
    const list = [{ id: 'a', title: 'A', text: 'x' }];
    expect(withTemplate(list, { id: 'a', title: 'A2', text: 'y' })).toEqual([{ id: 'a', title: 'A2', text: 'y' }]);
    expect(withTemplate(list, { id: 'b', title: 'B', text: 'z' }).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('o id novo passa pela leitura do guardado', () => {
    const id = newTemplateId();
    expect(sanitizeTemplates([{ id, title: 'T', text: 'x' }]).length).toBe(1);
  });

  it('o nome sugerido é a primeira linha com letras, sem a marca de lista', () => {
    expect(suggestedTitle('\n\n- Pauta da reunião\nmais')).toBe('Pauta da reunião');
    expect(suggestedTitle('1. passo um')).toBe('Passo um');
    expect(suggestedTitle('2026 em metas')).toBe('2026 em metas');
    expect(suggestedTitle('   ')).toBe('');
    expect(cleanTitle('  a \n b ')).toBe('a b');
  });
});
