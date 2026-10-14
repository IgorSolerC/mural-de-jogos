import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
