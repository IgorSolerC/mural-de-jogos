import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { CheckedAnswer, CheckedOptions, Confirm } from './confirm';
import { ReviewEditor } from './review-editor';

/**
 * A anotação sem categoria ou sem tag: o editor pergunta antes de pregar ("Tem certeza que deseja
 * salvá-la sem?"), com o "Nunca mais me perguntar isso".
 */
describe('o editor: anotação sem categoria ou tag', () => {
  let fixture: ComponentFixture<ReviewEditor>;
  let store: ReviewStore;
  let settings: Settings;
  let closed: number;
  let asked: { options: CheckedOptions; answer: (a: CheckedAnswer) => void }[];
  type Inside = {
    noteCategory: { set(v: string | null): void };
    noteTags: { set(v: string[]): void };
    save(e: Event | null): void;
  };
  const inside = () => fixture.componentInstance as unknown as Inside;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    settings = TestBed.inject(Settings);
    asked = [];
    spyOn(TestBed.inject(Confirm), 'askChecked').and.callFake(
      (options: CheckedOptions) => new Promise<CheckedAnswer>((answer) => asked.push({ options, answer })),
    );
    fixture = TestBed.createComponent(ReviewEditor);
    document.body.appendChild(fixture.nativeElement);
    closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    await fixture.whenStable();
    fixture.componentInstance.openNote('Lista do mercado');
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  const save = async () => {
    inside().save(null);
    await fixture.whenStable();
  };
  const answer = async (a: CheckedAnswer) => {
    asked.at(-1)!.answer(a);
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };
  const saved = () => store.notes().some((n) => n.game.name === 'Lista do mercado');

  it('sem as duas: pergunta pelas duas; Voltar não salva', async () => {
    await save();
    expect(asked.length).toBe(1);
    expect(asked[0].options.title).toBe('Sem categoria e sem tag');
    expect(asked[0].options.text).toBe('Essa anotação não tem categoria nem tag. Tem certeza que deseja salvá-la sem?');
    expect(asked[0].options.check).toBe('Nunca mais me perguntar isso');
    expect(asked[0].options.confirm).toBe('Pregar assim');
    await answer({ ok: false, checked: false });
    expect(saved()).toBeFalse();
    expect(closed).toBe(0);
    expect(settings.askNoCategory()).toBeTrue();
  });

  it('confirmando, salva sem as duas', async () => {
    await save();
    await answer({ ok: true, checked: false });
    expect(saved()).toBeTrue();
    expect(settings.askNoTag()).toBeTrue();
  });

  it('só sem tag: pergunta só pela tag; com as duas, não pergunta', async () => {
    inside().noteCategory.set('Casa');
    await save();
    expect(asked[0].options.title).toBe('Sem tag');
    expect(asked[0].options.text).toBe('Essa anotação não tem tag. Tem certeza que deseja salvá-la sem?');
    await answer({ ok: false, checked: false });

    inside().noteTags.set(['mercado']);
    await save();
    expect(asked.length).toBe(1);
    expect(saved()).toBeTrue();
  });

  it('"Nunca mais me perguntar isso" desliga a pergunta do que faltou, e só dela', async () => {
    inside().noteTags.set(['mercado']);
    await save();
    expect(asked[0].options.title).toBe('Sem categoria');
    await answer({ ok: true, checked: true });
    expect(saved()).toBeTrue();
    expect(settings.askNoCategory()).toBeFalse();
    expect(settings.askNoTag()).toBeTrue();
    expect(JSON.parse(localStorage.getItem('mural-de-jogos:config:v1')!)).toEqual(jasmine.objectContaining({ askNoCategory: false, askNoTag: true }));
  });

  it('desligada a pergunta, salva direto', async () => {
    settings.askNoCategory.set(false);
    settings.askNoTag.set(false);
    await save();
    expect(asked.length).toBe(0);
    expect(saved()).toBeTrue();
  });
});

describe('o editor: anotação que já existia, sem categoria ou tag', () => {
  let fixture: ComponentFixture<ReviewEditor>;
  let store: ReviewStore;
  let asked: CheckedOptions[];
  type Inside = {
    noteCategory: { set(v: string | null): void };
    noteTags: { set(v: string[]): void };
    save(e: Event | null): void;
  };
  const inside = () => fixture.componentInstance as unknown as Inside;
  const note = (id: string, extra: object) => ({
    ...sanitizeReview({ kind: 'anotacoes', game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' }, createdAt: '2026-10-01T10:00:00.000Z', ...extra })!,
    id,
  });

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    asked = [];
    spyOn(TestBed.inject(Confirm), 'askChecked').and.callFake((options: CheckedOptions) => {
      asked.push(options);
      return Promise.resolve({ ok: true, checked: false });
    });
    store.add(note('nvazia01', {}));
    store.add(note('ncheia01', { category: 'Casa', tags: ['mercado'] }));
    fixture = TestBed.createComponent(ReviewEditor);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  const edit = async (id: string) => {
    fixture.componentInstance.open(store.reviews().find((r) => r.id === id)!);
    await fixture.whenStable();
  };
  const save = async () => {
    inside().save(null);
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };

  it('a que já estava sem as duas salva sem perguntar', async () => {
    await edit('nvazia01');
    await save();
    expect(asked.length).toBe(0);
  });

  it('a que tinha categoria e perdeu: pergunta só pela categoria', async () => {
    await edit('ncheia01');
    inside().noteCategory.set(null);
    await save();
    expect(asked.map((o) => o.title)).toEqual(['Sem categoria']);
    expect(asked[0].confirm).toBe('Salvar assim');
  });

  it('a que tinha tag e perdeu: pergunta só pela tag', async () => {
    await edit('ncheia01');
    inside().noteTags.set([]);
    await save();
    expect(asked.map((o) => o.title)).toEqual(['Sem tag']);
  });

  it('a que estava sem categoria e perdeu a tag: pergunta só pela tag', async () => {
    store.update({ ...store.reviews().find((r) => r.id === 'ncheia01')!, category: undefined });
    await edit('ncheia01');
    inside().noteTags.set([]);
    await save();
    expect(asked.map((o) => o.title)).toEqual(['Sem tag']);
  });
});

describe('a caixinha da fichinha de confirmação', () => {
  it('começa desmarcada em cada pergunta e volta junto com a resposta', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const confirm = TestBed.inject(Confirm);
    const first = confirm.askChecked({ text: 'Pergunta', confirm: 'Sim', check: 'Nunca mais' });
    expect(confirm.checked()).toBeFalse();
    confirm.checked.set(true);
    confirm.answer(false);
    expect(await first).toEqual({ ok: false, checked: true });
    const second = confirm.askChecked({ text: 'Outra', confirm: 'Sim', check: 'Nunca mais' });
    expect(confirm.checked()).toBeFalse();
    confirm.answer(true);
    expect(await second).toEqual({ ok: true, checked: false });
    // a pergunta de sempre não tem caixinha
    void confirm.ask({ text: 'Apagar?', confirm: 'Apagar' });
    expect(confirm.current()!.check).toBeNull();
    confirm.answer(false);
  });
});

describe('o editor: a cor da categoria nova', () => {
  let fixture: ComponentFixture<ReviewEditor>;
  let settings: Settings;
  type Inside = { noteCategory: { set(v: string | null): void } };
  const pick = async (category: string | null) => {
    (fixture.componentInstance as unknown as Inside).noteCategory.set(category);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
    settings = TestBed.inject(Settings);
    TestBed.inject(ReviewStore).add({
      ...sanitizeReview({
        kind: 'anotacoes',
        game: { name: 'Já existe', coverUrl: null, source: 'manual' },
        category: 'Casa',
        createdAt: '2026-10-01T10:00:00.000Z',
      })!,
      id: 'ncasa001',
    });
    fixture = TestBed.createComponent(ReviewEditor);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    fixture.componentInstance.openNote('Nova');
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  it('a categoria nova ganha uma cor sorteada, que a prévia já mostra', async () => {
    spyOn(Math, 'random').and.returnValue(0.5);
    await pick('Viagens');
    expect(settings.categoryLook('viagens')).toEqual({ color: 'azul' });
    expect(fixture.nativeElement.querySelector('.previa .aba-cat')!.classList).toContain('orelha-cor');
  });

  it('a categoria que já tem anotação fica como está', async () => {
    await pick('casa');
    expect(settings.categoryLook('Casa')).toEqual({});
  });

  it('a que já tem cor fica com ela; com só o ícone, ganha a cor e mantém o ícone', async () => {
    settings.setCategoryLook('Metas', { color: 'roxo' });
    settings.setCategoryLook('Leituras', { icon: 'livro' });
    await pick('Metas');
    expect(settings.categoryLook('Metas')).toEqual({ color: 'roxo' });
    await pick('Leituras');
    expect(settings.categoryLook('Leituras').icon).toBe('livro');
    expect(settings.categoryLook('Leituras').color).toBeDefined();
  });

  it('tirada a cor, ela não volta sozinha', async () => {
    await pick('Viagens');
    settings.setCategoryLook('Viagens', {});
    await pick(null);
    await pick('Viagens');
    expect(settings.categoryLook('Viagens')).toEqual({});
  });
});
