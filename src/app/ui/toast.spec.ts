import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Toast, Toasts } from './toast';

describe('Toasts.copy', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('copiou: o bilhete de feito', async () => {
    const write = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    const toasts = TestBed.inject(Toasts);
    await toasts.copy('ABC123', 'Código copiado', 'Não deu para copiar. O seu código é ABC123');
    expect(write).toHaveBeenCalledWith('ABC123');
    expect(toasts.current()?.text).toBe('Código copiado');
    toasts.dismiss();
  });

  it('o navegador não deixou: o bilhete de falha', async () => {
    spyOn(navigator.clipboard, 'writeText').and.rejectWith(new Error('NotAllowedError'));
    const toasts = TestBed.inject(Toasts);
    await toasts.copy('ABC123', 'Código copiado', 'Não deu para copiar. O seu código é ABC123');
    expect(toasts.current()?.text).toBe('Não deu para copiar. O seu código é ABC123');
    toasts.dismiss();
  });

  it('com dois botões ("Ver · Desfazer"), os dois aparecem e cada um faz o seu', async () => {
    const fixture = TestBed.createComponent(Toast);
    const toasts = TestBed.inject(Toasts);
    const ran: string[] = [];
    toasts.show('3 pedidos de Claude entraram', { label: 'Ver', run: () => ran.push('ver') }, 9000, { label: 'Desfazer', run: () => ran.push('desfazer') });
    await fixture.whenStable();
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent!.trim())).toEqual(['Ver', 'Desfazer']);
    buttons[1]!.click();
    expect(ran).toEqual(['desfazer']);
    expect(toasts.current()).toBeNull();
  });

  it('com uma folha modal aberta, o bilhete aparece dentro dela e volta quando ela fecha', async () => {
    const fixture = TestBed.createComponent(Toast);
    document.body.appendChild(fixture.nativeElement);
    const toasts = TestBed.inject(Toasts);
    // folhas que outros testes deixaram abertas ficariam por cima desta
    document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());
    const sheet = document.createElement('dialog');
    document.body.appendChild(sheet);
    sheet.showModal();
    try {
      let undone = false;
      toasts.show('Coluna ordenada', { label: 'Desfazer', run: () => (undone = true) });
      await fixture.whenStable();
      const live = sheet.querySelector<HTMLElement>('.live');
      expect(live).not.toBeNull();
      const undo = live!.querySelector('button')!;
      // o bilhete entra recortado (a animação print começa com clip-path de 100%), e o recorte vale
      // para o toque também: no começo dela, o ponto acha a folha de trás. Esperar ela acabar.
      await Promise.all(live!.querySelector('.bilhete')!.getAnimations().map((a) => a.finished));
      const r = undo.getBoundingClientRect();
      // o que está por cima naquele ponto é o bilhete, não a folha nem o fundo dela
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      expect(live!.contains(hit)).toBeTrue();
      undo.click();
      expect(undone).toBeTrue();
      toasts.show('De novo');
      await fixture.whenStable();
      expect(sheet.querySelector('.live')).not.toBeNull();
      // o evento close chega numa tarefa depois
      const closed = new Promise((r) => sheet.addEventListener('close', () => setTimeout(r), { once: true }));
      sheet.close();
      await closed;
      expect((fixture.nativeElement as HTMLElement).querySelector(':scope > .live')).not.toBeNull();
    } finally {
      toasts.dismiss();
      sheet.remove();
      fixture.destroy();
    }
  });

  it('sem folha aberta, fica no lugar dele', async () => {
    const fixture = TestBed.createComponent(Toast);
    document.body.appendChild(fixture.nativeElement);
    const toasts = TestBed.inject(Toasts);
    toasts.show('Resenha atualizada');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector(':scope > .live .bilhete')).not.toBeNull();
    toasts.dismiss();
    fixture.destroy();
  });
});
