import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Confirm, ConfirmDialog } from './confirm';

describe('a pergunta antes de apagar', () => {
  afterEach(() => document.querySelectorAll('app-confirm').forEach((e) => e.remove()));

  it('o foco começa no Cancelar, também numa pergunta nova com a folha ainda aberta', async () => {
    TestBed.configureTestingModule({ imports: [ConfirmDialog], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ConfirmDialog);
    document.body.appendChild(fixture.nativeElement);
    const confirm = TestBed.inject(Confirm);
    const el = fixture.nativeElement as HTMLElement;
    const first = confirm.ask({ text: 'Apagar a resenha?', confirm: 'Apagar' });
    await fixture.whenStable();
    expect(document.activeElement?.hasAttribute('data-cancelar')).toBeTrue();
    // a pessoa foi até o botão vermelho, e chegou outra pergunta no lugar
    el.querySelector<HTMLElement>('.btn-ink')!.focus();
    void confirm.ask({ text: 'Apagar a outra?', confirm: 'Apagar' });
    await fixture.whenStable();
    expect(await first).toBeFalse();
    expect(el.querySelector('#confirma-texto')!.textContent).toBe('Apagar a outra?');
    expect(document.activeElement?.hasAttribute('data-cancelar')).toBeTrue();
    confirm.answer(false);
    await fixture.whenStable();
  });

  it('com a caixinha: marcar pelo rótulo volta junto com a resposta', async () => {
    TestBed.configureTestingModule({ imports: [ConfirmDialog], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ConfirmDialog);
    document.body.appendChild(fixture.nativeElement);
    const confirm = TestBed.inject(Confirm);
    const el = fixture.nativeElement as HTMLElement;
    void confirm.ask({ text: 'Apagar?', confirm: 'Apagar' });
    await fixture.whenStable();
    expect(el.querySelector('.nunca')).toBeNull();
    const answer = confirm.askChecked({ text: 'Salvar sem?', confirm: 'Salvar assim', check: 'Nunca mais me perguntar isso', tone: 'neutro' });
    await fixture.whenStable();
    const label = el.querySelector<HTMLLabelElement>('.nunca')!;
    expect(label.textContent!.trim()).toBe('Nunca mais me perguntar isso');
    expect(label.querySelector('input')!.checked).toBeFalse();
    // o foco continua no Voltar/Cancelar: salvar nunca é o padrão
    expect(document.activeElement?.hasAttribute('data-cancelar')).toBeTrue();
    label.querySelector('span')!.click();
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.btn-ink')!.click();
    expect(await answer).toEqual({ ok: true, checked: true });
  });
});
