import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReviewEditor } from './review-editor';

/** O editor fechando com texto escrito: só o botão Descartar joga o texto fora. */
describe('o editor com texto por salvar', () => {
  let fixture: ComponentFixture<ReviewEditor>;
  let closed: number;
  let dialog: HTMLDialogElement;
  type Inside = { text: { set(v: string): void }; requestClose(e?: Event): void };
  const inside = () => fixture.componentInstance as unknown as Inside;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
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
  const question = () => fixture.nativeElement.querySelector('.btn-ink.danger') as HTMLButtonElement | null;

  it('o X pergunta; um segundo X (ou clique no fundo) com a pergunta aberta não fecha', async () => {
    inside().requestClose();
    await fixture.whenStable();
    expect(question()?.textContent).toContain('Descartar');
    inside().requestClose();
    await fixture.whenStable();
    expect(dialog.open).toBeTrue();
    expect(closed).toBe(0);
    await closing(() => question()!.click());
    expect(dialog.open).toBeFalse();
    expect(closed).toBe(1);
  });

  it('a folha fechada por fora (o Chrome num segundo Esc) abre de novo, com a pergunta', async () => {
    await closing(() => dialog.close());
    expect(dialog.open).toBeTrue();
    expect(closed).toBe(0);
    expect(question()?.textContent).toContain('Descartar');
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
