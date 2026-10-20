import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { tagLookKey } from './category-looks';
import { Mural } from './mural';
import { noteTabKey } from './note-tabs';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { NO_TAG_OUTS, excludeTag, hiddenByTags, outByDefault, outTags, releaseTag, showAllTags, tagIsOut } from './tag-filter';
import { WallView } from './wall-view';

/** As tags escondidas do filtro das anotações: o clique direito e o "Filtro padrão: Excluído". */

const pessoal = (tags: string[]) => ({ category: 'Pessoal', tags });
const DESABAFO = new Set([tagLookKey('Desabafo', 'Pessoal')]);

describe('tags escondidas (núcleo)', () => {
  it('a escondida à mão tira toda anotação com ela, em qualquer categoria e grafia', () => {
    const outs = excludeTag(NO_TAG_OUTS, 'Desabafo');
    expect(outs.out).toEqual(['desabafo']);
    expect(hiddenByTags(pessoal(['desabafo']), outs, new Set())).toBeTrue();
    expect(hiddenByTags({ category: 'Trabalho', tags: ['Bug', 'DESABAFO'] }, outs, new Set())).toBeTrue();
    expect(hiddenByTags(pessoal(['Viagem']), outs, new Set())).toBeFalse();
    expect(hiddenByTags({ category: 'Pessoal' }, outs, new Set())).toBeFalse();
  });

  it('o padrão vale só na categoria dele, até a pessoa mostrar a tag de novo', () => {
    expect(hiddenByTags(pessoal(['Desabafo']), NO_TAG_OUTS, DESABAFO)).toBeTrue();
    expect(hiddenByTags({ category: 'Trabalho', tags: ['Desabafo'] }, NO_TAG_OUTS, DESABAFO)).toBeFalse();
    const freed = releaseTag(NO_TAG_OUTS, 'desabafo', true);
    expect(freed).toEqual({ out: [], free: ['desabafo'] });
    expect(hiddenByTags(pessoal(['Desabafo']), freed, DESABAFO)).toBeFalse();
    // esconder de novo à mão vale mais que o "mostrei"
    const again = excludeTag(freed, 'Desabafo');
    expect(again).toEqual({ out: ['desabafo'], free: [] });
    expect(tagIsOut('Desabafo', 'Trabalho', again, DESABAFO)).toBeTrue();
  });

  it('soltar uma escondida à mão sem padrão não guarda nada a mais', () => {
    expect(releaseTag(excludeTag(NO_TAG_OUTS, 'Bug'), 'BUG', false)).toEqual(NO_TAG_OUTS);
  });

  it('Limpar solta as que o padrão esconderia nestas anotações; o resto fica como está', () => {
    const notes = [pessoal(['Desabafo', 'Casa']), { category: 'Trabalho', tags: ['Desabafo'] }];
    expect(showAllTags(notes, DESABAFO)).toEqual({ out: [], free: ['desabafo'] });
    expect(showAllTags(notes, new Set())).toEqual(NO_TAG_OUTS);
    expect(outByDefault('desabafo', notes, DESABAFO)).toBeTrue();
    expect(outByDefault('casa', notes, DESABAFO)).toBeFalse();
  });

  it('as riscadas contam quantas anotações cada uma tira, com a grafia mais usada', () => {
    const notes = [pessoal(['Desabafo']), pessoal(['desabafo', 'Casa']), pessoal(['Desabafo']), pessoal(['Casa'])];
    const out = outTags(notes, excludeTag(NO_TAG_OUTS, 'casa'), DESABAFO);
    expect([...out]).toEqual([
      ['desabafo', { label: 'Desabafo', n: 3 }],
      ['casa', { label: 'Casa', n: 2 }],
    ]);
  });
});

describe('tags escondidas no mural de anotações (WallView)', () => {
  let view: WallView;
  let seq = 0;
  const note = (title: string, category: string, tags: string[]): Review =>
    sanitizeReview({ id: `nt${++seq}`, kind: 'anotacoes', game: { name: title }, text: 'x', completedAt: '2026-10-01', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', private: true, category, tags })!;
  const names = () => view.visible().map((r) => r.game.name);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(Mural).kind.set('anotacoes');
    // o mural de antes, com a aba Tudo (sem ela, abre no primeiro grupo: ver note-tabs.spec.ts)
    TestBed.inject(Settings).setNotesConfig({ showAll: true });
    TestBed.inject(ReviewStore).reviews.set([note('Dia ruim', 'Pessoal', ['Desabafo']), note('Mercado', 'Pessoal', ['Casa']), note('Deploy', 'Trabalho', ['Desabafo', 'Infra'])]);
    view = TestBed.inject(WallView);
  });
  afterEach(() => localStorage.clear());

  it('o clique direito esconde as anotações da tag (e tira ela das ligadas); o clique na riscada mostra de novo', () => {
    view.toggle('tag', 'Desabafo');
    expect(names().sort()).toEqual(['Deploy', 'Dia ruim']);
    view.excludeTag('Desabafo');
    expect(view.filter().tag).toEqual([]);
    expect(names()).toEqual(['Mercado']);
    expect(view.tagIsOut('desabafo')).toBeTrue();
    expect(view.isFiltered()).toBeTrue();
    expect(view.tagHidden()).toBe(2);
    view.excludeTag('Desabafo');
    expect(names().length).toBe(3);
    expect(view.isFiltered()).toBeFalse();
  });

  it('o padrão Excluído: o mural abre sem elas (só na categoria dele), e Limpar mostra todas', () => {
    TestBed.inject(Settings).setTagHidden('Desabafo', 'Pessoal', true);
    expect(names().sort()).toEqual(['Deploy', 'Mercado']);
    expect(view.isFiltered()).toBeTrue();
    expect(view.tagIsOut('Desabafo')).toBeTrue();
    view.clearFilters();
    expect(names().length).toBe(3);
    expect(view.tagIsOut('Desabafo')).toBeFalse();
    // trocar de aba volta ao padrão
    view.setNoteTab(noteTabKey({ category: 'Pessoal' }));
    expect(names()).toEqual(['Mercado']);
    view.releaseTag('Desabafo');
    expect(names().sort()).toEqual(['Dia ruim', 'Mercado']);
  });
});
