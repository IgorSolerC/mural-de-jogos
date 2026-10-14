import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Settings } from '../core/settings';
import { ReviewEditor } from './review-editor';
import { Confirm, ConfirmOptions } from './confirm';

/** O editor fechando com texto escrito: o cartão de confirmação pergunta, e só "Descartar" joga o texto fora. */
describe('o editor com texto por salvar', () => {
  let fixture: ComponentFixture<ReviewEditor>;
  let closed: number;
  let dialog: HTMLDialogElement;
  /** As perguntas feitas ao cartão de confirmação, com a resposta que a pessoa ainda vai dar. */
  let asked: { options: ConfirmOptions; answer: (yes: boolean) => void }[];
  type Inside = { text: { set(v: string): void }; requestClose(e?: Event): void };
  const inside = () => fixture.componentInstance as unknown as Inside;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
    asked = [];
    // a pergunta de anotação sem categoria ou tag tem o seu teste (review-editor.labels.spec.ts)
    TestBed.inject(Settings).askNoCategory.set(false);
    TestBed.inject(Settings).askNoTag.set(false);
    spyOn(TestBed.inject(Confirm), 'ask').and.callFake(
      (options: ConfirmOptions) => new Promise<boolean>((answer) => asked.push({ options, answer })),
    );
    fixture = TestBed.createComponent(ReviewEditor);
    document.body.appendChild(fixture.nativeElement);
    closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    await fixture.whenStable();
    fixture.componentInstance.open();
    await fixture.whenStable();
    dialog = fixture.nativeElement.querySelector('dialog');
    inside().text.set('Um texto que ainda não foi salvo.');
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  /** Faz `act` e espera o evento close do diálogo (ele chega numa tarefa depois do close()). */
  const closing = async (act: () => void) => {
    const closeEvent = new Promise((r) => dialog.addEventListener('close', r, { once: true }));
    act();
    await closeEvent;
    await fixture.whenStable();
  };

  it('o X pergunta no cartão; um segundo X com a pergunta aberta não faz outra; Descartar fecha', async () => {
    inside().requestClose();
    await fixture.whenStable();
    expect(asked.length).toBe(1);
    expect(asked[0].options.confirm).toBe('Descartar');
    expect(asked[0].options.cancel).toBe('Continuar escrevendo');
    // nada de pergunta no pé da folha
    expect(fixture.nativeElement.querySelector('.discard-msg')).toBeNull();
    inside().requestClose();
    await fixture.whenStable();
    expect(asked.length).toBe(1);
    expect(dialog.open).toBeTrue();
    expect(closed).toBe(0);
    await closing(() => asked[0].answer(true));
    expect(dialog.open).toBeFalse();
    expect(closed).toBe(1);
  });

  it('"Continuar escrevendo" deixa a folha aberta, e o próximo X pergunta de novo', async () => {
    inside().requestClose();
    asked[0].answer(false);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    expect(dialog.open).toBeTrue();
    expect(closed).toBe(0);
    inside().requestClose();
    expect(asked.length).toBe(2);
  });

  it('a folha fechada por fora (o Chrome num segundo Esc) abre de novo, com a pergunta', async () => {
    await closing(() => dialog.close());
    expect(dialog.open).toBeTrue();
    expect(closed).toBe(0);
    expect(asked.length).toBe(1);
  });

  it('o texto acima do limite (vindo de um atalho) não salva e diz quanto tirar', async () => {
    type Saving = { save(e: Event): void };
    const save = () => (fixture.componentInstance as unknown as Saving).save(new Event('submit'));
    // uma anotação com título: só o texto longo impede de salvar
    fixture.componentInstance.openNote('Uma anotação');
    inside().text.set('x'.repeat(20_010));
    await fixture.whenStable();
    save();
    await fixture.whenStable();
    expect(dialog.open).toBeTrue();
    expect(closed).toBe(0);
    expect(fixture.nativeElement.querySelector('.bloco.texto .field-error')?.textContent).toContain('Tire 10 para salvar');
    // no limite, salva
    inside().text.set('x'.repeat(20_000));
    await fixture.whenStable();
    await closing(() => save());
    expect(closed).toBe(1);
  });
});
