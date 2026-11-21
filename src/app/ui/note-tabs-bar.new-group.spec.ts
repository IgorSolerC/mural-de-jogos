import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Mural } from '../core/mural';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { WallState, WallView } from '../core/wall-view';
import { NoteTabsBar } from './note-tabs-bar';

const T0 = '2026-11-20T10:00:00.000Z';
const note = (id: string, category: string): Review => ({
  ...sanitizeReview({ kind: 'anotacoes', game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' }, category, completedAt: '2026-11-01', createdAt: T0, updatedAt: T0 })!,
  id,
});

/** O "Novo grupo" no "Mais" das abas do mural de anotações (PLANO-NOVO-GRUPO.md, parte 2). */
describe('o Novo grupo no Mais das abas do mural', () => {
  let fixture: ComponentFixture<NoteTabsBar>;
  let host: HTMLElement;

  const standing = () => [...host.querySelectorAll<HTMLElement>('.abas:not(.medida) > .aba:not(.mais)')].map((t) => t.querySelector('.rotulo-cat, .nome')!.textContent!.trim());
  const more = () => host.querySelector<HTMLElement>('.abas:not(.medida) app-tab-more');
  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      TestBed.tick();
    }
  }
  async function openMore(): Promise<void> {
    host.scrollIntoView({ block: 'start' });
    more()!.querySelector<HTMLButtonElement>('.gatilho')!.click();
    for (let i = 0; i < 10 && !more()!.querySelector('[popover]')!.matches(':popover-open'); i++) await settle();
  }
  async function create(name: string): Promise<void> {
    await openMore();
    more()!.querySelector<HTMLButtonElement>('.novo .criar')!.click();
    await settle();
    const field = more()!.querySelector<HTMLInputElement>('.novo input')!;
    field.value = name;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    field.form!.requestSubmit();
    await settle();
  }

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    TestBed.inject(Mural).kind.set('anotacoes');
    // tudo em pé (o Tudo também): nada sobra para o "Mais"
    TestBed.inject(Settings).setNotesConfig({ showAll: true });
    TestBed.inject(ReviewStore).reviews.set([note('ntrab001', 'Trabalho'), note('ntrab002', 'Trabalho'), note('nestu001', 'Estudos')]);
    fixture = TestBed.createComponent(NoteTabsBar);
    host = fixture.nativeElement;
    host.style.display = 'block';
    host.style.width = '1200px';
    document.body.appendChild(host);
    await settle();
  });

  afterEach(() => {
    host.remove();
    localStorage.clear();
  });

  it('o "Mais" fica em pé mesmo sem nenhuma aba sobrando, só com o "Novo grupo"', async () => {
    expect(standing()).toEqual(['Tudo', 'Trabalho', 'Estudos']);
    expect(more()).not.toBeNull();
    await openMore();
    expect(more()!.querySelectorAll('[role=option]').length).toBe(0);
    expect(more()!.querySelector('.novo .criar')!.textContent!.trim()).toBe('Novo grupo');
  });

  it('criar: o grupo nasce sem anotação, com cor, e a aba dele abre (vazia, em pé enquanto aberta)', async () => {
    await create('Viagens');
    const settings = TestBed.inject(Settings);
    expect(settings.madeGroups()).toEqual([{ key: 'viagens', label: 'Viagens' }]);
    expect(settings.categoryLook('Viagens').color).toBeTruthy();
    expect(TestBed.inject(WallView).activeTab()).toBe('c:viagens');
    expect(standing()).toContain('Viagens');
    expect(TestBed.inject(ReviewStore).notes().length).toBe(3);
    // saindo dele, o vazio vai para o "Mais" ("Esconder os grupos vazios", o padrão)
    TestBed.inject(WallView).setNoteTab('c:trabalho');
    await settle();
    expect(standing()).not.toContain('Viagens');
    await openMore();
    expect([...more()!.querySelectorAll('[role=option]')].map((o) => o.getAttribute('data-k'))).toEqual(['c:viagens']);
  });

  it('o nome de um grupo que já existe só abre ele', async () => {
    await create('estudos');
    expect(TestBed.inject(Settings).madeGroups()).toEqual([]);
    expect(TestBed.inject(WallView).activeTab()).toBe('c:estudos');
  });

  it('no mural de quem se visita, nada de criar: o "Mais" sem a linha', async () => {
    // (a peça montada de novo, já no mural da Ana)
    host.remove();
    spyOn(TestBed.inject(WallState), 'owner').and.returnValue('Ana');
    TestBed.inject(Settings).setNotesConfig({ showAll: false });
    fixture = TestBed.createComponent(NoteTabsBar);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
    // (o Tudo sem o olho vai para o "Mais", que fica, mas sem a linha de criar)
    await openMore();
    expect(more()!.querySelector('.novo')).toBeNull();
  });
});
