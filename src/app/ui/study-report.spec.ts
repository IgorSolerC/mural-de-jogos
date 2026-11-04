import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { addStudyDays, dayStart, studyDay } from '../core/fsrs';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { StudyStore } from '../core/study-store';
import { StudyReport } from './study-report';

const T0 = '2026-10-10T10:00:00.000Z';
const note = (id: string): Review => ({ ...sanitizeReview({ kind: 'anotacoes', category: 'Estudos', game: { name: id }, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0 })!, id });

/** O boletim da carta (PLANO-ESTUDOS.md, 6.8). */
describe('o boletim da carta (ui/study-report.ts)', () => {
  let fixture: ComponentFixture<StudyReport>;
  let study: StudyStore;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [StudyReport], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([note('nsol')]);
    study = TestBed.inject(StudyStore);
    study.addCard('nsol', [study.addDeck('Kanjis', 'amarelo')]);
    fixture = TestBed.createComponent(StudyReport);
    fixture.componentRef.setInput('note', 'nsol');
    el = fixture.nativeElement;
    await fixture.whenStable();
  });
  afterEach(() => localStorage.clear());

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  /** A carta em revisão, vencendo daqui a `days` dias de estudo (negativo: vencida). */
  async function dueIn(days: number): Promise<Date> {
    const due = dayStart(addStudyDays(studyDay(new Date()), days));
    study.state.update((st) => ({
      ...st,
      cards: st.cards.map((c) => ({ ...c, srs: { state: 'revisao' as const, step: 0, s: 30, d: 5, due: due.toISOString(), last: T0, reps: 4 }, stats: { seen: 4, right: 3, wrong: 1, marks: '1011' } })),
    }));
    await fixture.whenStable();
    return due;
  }

  it('a carta nunca estudada: Desconhecida, sem as contas', () => {
    expect(text('.nivel')).toContain('Desconhecida');
    expect(text('.volta')).toBe('Nunca estudada');
    expect(el.querySelector('.chance')).toBeNull();
  });

  it('a data de quando volta só quando é outro dia: a vencida "volta hoje", sem a data de quando venceu', async () => {
    const later = await dueIn(5);
    expect(text('.volta')).toBe('Volta em 5 dias');
    expect(text('.data')).toBe(`${String(later.getDate()).padStart(2, '0')} ${['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'][later.getMonth()]}`);
    await dueIn(-1);
    expect(text('.volta')).toBe('Volta hoje');
    expect(el.querySelector('.data')).toBeNull();
    expect(text('.contas')).toBe('Vista 4 vezes · acertou 3 · errou 1');
    expect(el.querySelectorAll('lucide-icon.marca.errou').length).toBe(1);
  });
});
