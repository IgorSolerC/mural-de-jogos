import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DictMarksState, dictMarksToSync, isLearned, learnedDay, mergeDictMarks, sanitizeDictMarks } from './marks';
import { DICT_MARKS_KEY, DictionaryMarks } from './marks-store';

const T1 = '2026-11-23T10:00:00.000Z';
const T2 = '2026-11-23T11:00:00.000Z';

describe('Dicionário Japonês: as marcas (aprendida, favorita)', () => {
  it('limpa o que vem de fora e fica com a mais nova de cada palavra', () => {
    const raw = {
      marks: [
        { id: 'JP1', learned: true, learnedOn: '2026-11-20', at: T1 },
        { id: 'JP1', learned: false, at: T2 },
        { id: 'JP2', favorite: true, at: T1 },
        { id: 'mau id!', learned: true, at: T1 },
        { id: 'JP3', learned: 'sim', favorite: 'sim', at: 'ontem' },
      ],
    };
    expect(sanitizeDictMarks(raw)).toEqual({ marks: [{ id: 'JP1', learned: false, at: T2 }, { id: 'JP2', favorite: true, at: T1 }] });
    expect(sanitizeDictMarks('lixo')).toEqual({ marks: [] });
  });

  it('junta dois aparelhos palavra a palavra, e no mesmo instante os dois escolhem a mesma', () => {
    const a: DictMarksState = { marks: [{ id: 'JP1', learned: true, at: T2 }, { id: 'JP2', favorite: true, at: T1 }] };
    const b: DictMarksState = { marks: [{ id: 'JP1', learned: false, at: T1 }, { id: 'JP2', at: T2 }] };
    expect(mergeDictMarks(a, b)).toEqual({ marks: [{ id: 'JP1', learned: true, at: T2 }, { id: 'JP2', at: T2 }] });
    const c: DictMarksState = { marks: [{ id: 'JP9', favorite: true, at: T1 }] };
    const d: DictMarksState = { marks: [{ id: 'JP9', learned: true, at: T1 }] };
    expect(mergeDictMarks(c, d)).toEqual(mergeDictMarks(d, c));
    expect(dictMarksToSync({ marks: [] })).toBeNull();
  });

  it('a marca do dono vale por cima do CSV', () => {
    const csv = { id: 'JP1', learnedOn: '2026-11-14' };
    const nova = { id: 'JP2', learnedOn: null };
    expect(isLearned(csv, undefined)).toBeTrue();
    expect(learnedDay(csv, undefined)).toBe('2026-11-14');
    expect(isLearned(csv, { id: 'JP1', learned: false, at: T1 })).toBeFalse();
    expect(learnedDay(csv, { id: 'JP1', learned: false, at: T1 })).toBeNull();
    expect(isLearned(nova, undefined)).toBeFalse();
    expect(learnedDay(nova, { id: 'JP2', learned: true, learnedOn: '2026-11-23', at: T1 })).toBe('2026-11-23');
  });
});

describe('Dicionário Japonês: o guardador das marcas', () => {
  beforeEach(() => {
    localStorage.removeItem(DICT_MARKS_KEY);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => localStorage.removeItem(DICT_MARKS_KEY));

  it('marca, guarda no navegador e desfaz', () => {
    const marks = TestBed.inject(DictionaryMarks);
    const kuru = { id: 'JP0242', learnedOn: null };
    const undo = marks.setLearned(kuru, true);
    expect(marks.learned(kuru)).toBeTrue();
    expect(marks.learnedDay(kuru)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(DICT_MARKS_KEY)!).marks[0].id).toBe('JP0242');
    undo();
    expect(marks.learned(kuru)).toBeFalse();
    // a favorita não mexe na aprendida, e vice-versa
    marks.setFavorite('JP0242', true);
    marks.setLearned(kuru, true);
    marks.setFavorite('JP0242', false);
    expect(marks.learned(kuru)).toBeTrue();
    expect(marks.favorite('JP0242')).toBeFalse();
  });

  it('voltar ao que o CSV diz apaga a escolha, e o dia do CSV volta', () => {
    const marks = TestBed.inject(DictionaryMarks);
    const desu = { id: 'JP0934', learnedOn: '2026-11-14' };
    marks.setLearned(desu, false);
    expect(marks.learned(desu)).toBeFalse();
    marks.setLearned(desu, true);
    expect(marks.get('JP0934')?.learned).toBeUndefined();
    // a marca vazia fica (para ganhar da de outro aparelho na junção), mas não conta como palavra marcada
    expect(marks.state().marks.length).toBe(1);
    expect(marks.count()).toBe(0);
    expect(marks.learnedDay(desu)).toBe('2026-11-14');
  });
});
