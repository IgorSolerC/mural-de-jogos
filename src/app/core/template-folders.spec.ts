import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { mergeJson } from './merge-json';
import { sanitizeNotesConfig } from './mural-config';
import { NoteFolders } from './note-folders';
import { NoteTemplate, TEMPLATE_FOLDER_GROUP } from './note-templates';
import { Settings } from './settings';
import { TemplateFolders } from './template-folders';

/** As mini-pastas dos templates do texto: as pastas das anotações, no grupo dos templates, um nível só. */

const tpl = (id: string, title: string, extra: Partial<NoteTemplate> = {}): NoteTemplate => ({ id, title, text: `${title}:\n- [ ] `, ...extra });

describe('as mini-pastas dos templates', () => {
  let settings: Settings;
  let folders: TemplateFolders;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    settings = TestBed.inject(Settings);
    folders = TestBed.inject(TemplateFolders);
    settings.setNotesConfig({ templates: [tpl('pauta1', 'Pauta'), tpl('diario1', 'Diário'), tpl('ata0001', 'Ata')] });
  });

  afterEach(() => localStorage.clear());

  const templates = () => settings.notesConfig().templates;
  const byId = (id: string) => templates().find((t) => t.id === id)!;

  it('moram nas pastas das configurações, no grupo dos templates (as telas das anotações não as veem)', () => {
    const f = folders.create('Reuniões')!;
    expect(f.group).toBe(TEMPLATE_FOLDER_GROUP);
    expect(f.parent).toBeNull();
    expect(settings.notesConfig().folders.some((x) => x.id === f.id)).toBeTrue();
    expect(TestBed.inject(NoteFolders).topLibrary(null, []).length).toBe(0);
    // o nome não se repete: "Nova pasta", "Nova pasta 2"
    expect(folders.create('')!.name).toBe('Nova pasta');
    expect(folders.create('')!.name).toBe('Nova pasta 2');
    expect(folders.list().map((x) => x.name)).toEqual(['Nova pasta', 'Nova pasta 2', 'Reuniões']);
  });

  it('os que já existiam ficam soltos, de A a Z, e nada se perde', () => {
    folders.create('Reuniões');
    const { shelves, loose } = folders.shelves();
    expect(shelves.map((s) => [s.folder.name, s.templates.length])).toEqual([['Reuniões', 0]]);
    expect(loose.map((t) => t.title)).toEqual(['Ata', 'Diário', 'Pauta']);
  });

  it('guardar numa pasta muda só os templates que mudam, numa gravação só; o Desfazer volta só os que ainda estão lá', () => {
    const f = folders.create('Reuniões')!;
    const { moved, undo } = folders.place(['pauta1', 'ata0001'], f.id);
    expect(moved).toBe(2);
    expect(byId('pauta1').folder).toBe(f.id);
    expect(folders.shelves().shelves[0].templates.map((t) => t.title)).toEqual(['Ata', 'Pauta']);
    expect(folders.shelves().loose.map((t) => t.title)).toEqual(['Diário']);
    expect(folders.counts().get(f.id)).toBe(2);
    // a Ata saiu da pasta no meio: o Desfazer não a mexe
    folders.place(['ata0001'], null);
    undo();
    expect('folder' in byId('pauta1')).toBeFalse();
    expect('folder' in byId('ata0001')).toBeFalse();
    // o que já está lá não conta, e uma pasta de outro grupo não serve
    expect(folders.place(['diario1'], null).moved).toBe(0);
    const note = TestBed.inject(NoteFolders).create('Casa', null, 'Compras')!;
    expect(folders.place(['diario1'], note.id).moved).toBe(0);
  });

  it('desfazer a pasta: os de dentro ficam soltos pela regra da leitura, sem regravar; o Desfazer os põe de volta', () => {
    const f = folders.create('Reuniões')!;
    folders.place(['pauta1'], f.id);
    const undo = folders.dissolve(f.id);
    expect(folders.list().length).toBe(0);
    expect(byId('pauta1').folder).toBe(f.id);
    expect(folders.of(byId('pauta1'))).toBeNull();
    expect(folders.shelves().loose.map((t) => t.title)).toEqual(['Ata', 'Diário', 'Pauta']);
    undo();
    expect(folders.shelves().shelves[0].templates.map((t) => t.title)).toEqual(['Pauta']);
  });

  it('renomear, com o Desfazer', () => {
    const f = folders.create('Reuniões')!;
    const undo = folders.rename(f.id, '  Encontros  ');
    expect(folders.list()[0].name).toBe('Encontros');
    undo();
    expect(folders.list()[0].name).toBe('Reuniões');
  });

  it('a lápide velha de uma mini-pasta fica enquanto um template aponta para ela', () => {
    const old = '2026-01-01T00:00:00.000Z';
    settings.setNotesConfig({
      folders: [
        { id: 'pvelha001', group: TEMPLATE_FOLDER_GROUP, name: 'Velha', parent: null, gone: old },
        { id: 'pvazia001', group: TEMPLATE_FOLDER_GROUP, name: 'Vazia', parent: null, gone: old },
      ],
      templates: [tpl('pauta1', 'Pauta', { folder: 'pvelha001' })],
    });
    // outra mudança nas pastas grava (e poda) as configurações
    folders.create('Outra');
    const ids = settings.notesConfig().folders.map((f) => f.id);
    expect(ids).toContain('pvelha001');
    expect(ids).not.toContain('pvazia001');
  });

  it('a pasta de dentro de outra (de um site que deixasse) vale pela de cima', () => {
    settings.setNotesConfig({
      folders: [
        { id: 'pcima0001', group: TEMPLATE_FOLDER_GROUP, name: 'Cima', parent: null },
        { id: 'pbaixo001', group: TEMPLATE_FOLDER_GROUP, name: 'Baixo', parent: 'pcima0001' },
      ],
      templates: [tpl('pauta1', 'Pauta', { folder: 'pbaixo001' })],
    });
    expect(folders.list().map((f) => f.name)).toEqual(['Cima']);
    expect(folders.of(byId('pauta1'))).toBe('pcima0001');
  });

  it('dois aparelhos: um põe a pasta e guarda o template nela, o outro muda o texto; a junção fica com os dois', () => {
    const base = sanitizeNotesConfig({ templates: [tpl('pauta1', 'Pauta')] });
    const here = sanitizeNotesConfig({ ...base, folders: [{ id: 'preuniao1', group: TEMPLATE_FOLDER_GROUP, name: 'Reuniões', parent: null }], templates: [tpl('pauta1', 'Pauta', { folder: 'preuniao1' })] });
    const there = sanitizeNotesConfig({ ...base, templates: [{ ...tpl('pauta1', 'Pauta'), text: 'Pauta nova' }, tpl('lista01', 'Lista')] });
    const m = mergeJson(base, here, there);
    expect(m.conflicts).toEqual([]);
    const merged = sanitizeNotesConfig(m.a);
    expect(merged.folders.map((f) => f.name)).toEqual(['Reuniões']);
    expect(merged.templates).toEqual([{ id: 'pauta1', title: 'Pauta', text: 'Pauta nova', folder: 'preuniao1' }, tpl('lista01', 'Lista')]);
  });

  it('dois aparelhos: um desfaz a pasta, o outro guarda um template nela; o template fica solto, sem se perder', () => {
    const pasta = { id: 'preuniao1', group: TEMPLATE_FOLDER_GROUP, name: 'Reuniões', parent: null };
    const base = sanitizeNotesConfig({ folders: [pasta], templates: [tpl('pauta1', 'Pauta'), tpl('ata0001', 'Ata')] });
    const here = sanitizeNotesConfig({ ...base, folders: [{ ...pasta, gone: '2026-11-20T10:00:00.000Z' }] });
    const there = sanitizeNotesConfig({ ...base, templates: [tpl('pauta1', 'Pauta', { folder: 'preuniao1' }), tpl('ata0001', 'Ata')] });
    const m = mergeJson(base, here, there);
    expect(m.conflicts).toEqual([]);
    settings.applyNotesConfig(sanitizeNotesConfig(m.a), '2026-11-20T10:00:01.000Z');
    expect(folders.list().length).toBe(0);
    expect(folders.shelves().loose.map((t) => t.title)).toEqual(['Ata', 'Pauta']);
  });
});
