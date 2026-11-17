import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ContextMenu, MenuItem } from './context-menu';
import { ICON } from './icons';

describe('o menu do botão direito: a opção que não vale e as setas dos lados', () => {
  it('a opção apagada não escolhe nada e as setas pulam por ela; a seta do lado avisa a barra de menus', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ContextMenu);
    const host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    const chosen: string[] = [];
    const sides: number[] = [];
    fixture.componentInstance.sideways.subscribe((d) => sides.push(d));
    const item = (id: string, disabled = false): MenuItem => ({ id, label: id, icon: ICON.editar, disabled, run: () => chosen.push(id) });
    fixture.componentRef.setInput('caption', 'Editar');
    fixture.componentRef.setInput('sections', [[item('desfazer', true), item('copiar'), item('colar', true), item('limpar')]]);
    fixture.componentInstance.show({ key: 'editar', x: 10, y: 10, back: null, by: 'teclado' });
    await fixture.whenStable();
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.escolha')];
    expect(buttons[0].disabled).toBeTrue();
    expect(buttons[0].getAttribute('aria-disabled')).toBe('true');
    // aberto pelo teclado, o foco vai para a primeira que vale
    expect(document.activeElement).toBe(buttons[1]);
    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(buttons[3]);
    buttons[0].click();
    expect(chosen).toEqual([]);
    buttons[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    buttons[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(sides).toEqual([1, -1]);
    fixture.destroy();
    host.remove();
  });
});
