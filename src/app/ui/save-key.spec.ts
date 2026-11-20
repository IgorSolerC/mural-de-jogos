import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SAVE_KEY, SaveKey, isSaveKey } from './save-key';
import { pressSave } from '../testing/save-key.spec';

/** Duas folhas, uma sobre a outra, a tela cheia de passagem e dois formulários na página, como nas telas do site. */
@Component({
  selector: 'app-save-key-host',
  imports: [SaveKey],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="pagina-a" (submit)="$event.preventDefault(); saved.push('pagina-a')">
      <input class="campo-a" />
      <button type="submit" appSaveKey>Lançar <kbd aria-hidden="true">↵</kbd></button>
    </form>
    <form class="pagina-b" (submit)="$event.preventDefault(); saved.push('pagina-b')">
      <input class="campo-b" />
      <button type="submit" appSaveKey title="Guardar (Ctrl+S também)" aria-keyshortcuts="Control+Enter">Salvar</button>
    </form>
    <button type="button" class="solto">fora</button>
    <!-- a folha do texto do Quadro livre: um role="dialog" na página, sem formulário -->
    <div role="dialog" class="cartao"><textarea class="cartao-texto"></textarea><button type="button" appSaveKey (click)="saved.push('cartao')">Pronto</button></div>
    <dialog class="de-baixo">
      <form (submit)="$event.preventDefault(); saved.push('de-baixo:' + count())">
        <!-- o change de um valor escrito chega no blur (o valor posto pelo teste não dispara o change: o blur o faz aqui) -->
        <input class="numero" type="number" (blur)="count.set(+$any($event.target).value)" />
        <textarea class="texto"></textarea>
        <p class="vazio">texto</p>
        <button type="submit" appSaveKey [disabled]="off()" [attr.aria-busy]="busy() ? 'true' : null">Salvar alterações</button>
      </form>
      <dialog class="tela-cheia" data-salva-a-de-baixo><textarea class="grande"></textarea></dialog>
      <dialog class="de-cima">
        <input class="campo-cima" />
        <button type="button" [appSaveKey]="topSaves()" (click)="saved.push('de-cima')">Salvar o contador</button>
      </dialog>
    </dialog>
    <dialog class="sem-salvar"><input class="campo-sem" /></dialog>
    <!-- o "Aplicar" que só acende com o que o campo avisou -->
    <dialog class="aplicar">
      <input class="mexidas" type="number" (blur)="touched.set(+$any($event.target).value)" />
      <button type="button" appSaveKey [disabled]="!touched()" (click)="saved.push('aplicar:' + touched())">Aplicar</button>
    </dialog>
  `,
})
class Host {
  readonly saved: string[] = [];
  readonly count = signal(0);
  readonly off = signal(false);
  readonly busy = signal(false);
  readonly topSaves = signal(true);
  readonly touched = signal(0);
}

describe('o Ctrl+S toca no Salvar da folha da frente (ui/save-key.ts)', () => {
  let fixture: ComponentFixture<Host>;
  let host: HTMLElement;
  const q = <T extends Element = HTMLElement>(s: string) => host.querySelector<T>(s)!;
  const saved = () => fixture.componentInstance.saved;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  });

  afterEach(() => {
    host.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((d) => d.close());
    host.remove();
  });

  it('reconhece o Ctrl+S e o ⌘S, sem Shift nem Alt (o AltGr), também no teclado sem o S latino', () => {
    const k = (o: KeyboardEventInit) => isSaveKey(new KeyboardEvent('keydown', o));
    expect(k({ key: 's', ctrlKey: true })).toBeTrue();
    expect(k({ key: 'S', metaKey: true })).toBeTrue();
    expect(k({ key: 'ы', code: 'KeyS', ctrlKey: true })).toBeTrue();
    expect(k({ key: 's', ctrlKey: true, shiftKey: true })).toBeFalse();
    expect(k({ key: 's', ctrlKey: true, altKey: true })).toBeFalse();
    expect(k({ key: 's' })).toBeFalse();
    expect(k({ key: 'd', ctrlKey: true })).toBeFalse();
    // no Colemak e no Dvorak, a tecla do S escreve o R e o O: o atalho é o deles
    expect(k({ key: 'r', code: 'KeyS', ctrlKey: true })).toBeFalse();
    expect(k({ key: 'o', code: 'KeyS', metaKey: true })).toBeFalse();
  });

  it('com duas folhas abertas, só a de cima salva; fechada ela, a de baixo', async () => {
    q<HTMLDialogElement>('.de-baixo').showModal();
    q<HTMLDialogElement>('.de-cima').showModal();
    q<HTMLInputElement>('.campo-cima').focus();
    const e = pressSave(q('.campo-cima'));
    expect(e.defaultPrevented).toBeTrue();
    expect(saved()).toEqual(['de-cima']);
    q<HTMLDialogElement>('.de-cima').close();
    q<HTMLTextAreaElement>('.texto').focus();
    pressSave(q('.texto'));
    expect(saved()).toEqual(['de-cima', 'de-baixo:0']);
  });

  it('o clique fora dos campos (o foco na própria folha) também vale; a página embaixo nunca', async () => {
    q<HTMLDialogElement>('.de-baixo').showModal();
    pressSave(q('.de-baixo'));
    expect(saved()).toEqual(['de-baixo:0']);
    // sem foco nenhum (o body; o Safari do Mac não foca o botão tocado): vale a folha do último toque
    q('.vazio').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    (document.activeElement as HTMLElement | null)?.blur();
    expect(pressSave(document.body).defaultPrevented).toBeTrue();
    expect(saved()).toEqual(['de-baixo:0', 'de-baixo:0']);
    // a de cima abriu depois (o foco foi para ela): a de baixo não salva mais pelo body
    q<HTMLDialogElement>('.de-cima').showModal();
    (document.activeElement as HTMLElement | null)?.blur();
    pressSave(document.body);
    expect(saved()).toEqual(['de-baixo:0', 'de-baixo:0', 'de-cima']);
  });

  it('a folha de cima sem Salvar não deixa salvar a de baixo, e o navegador não abre o "Salvar página"', async () => {
    q<HTMLDialogElement>('.de-baixo').showModal();
    fixture.componentInstance.topSaves.set(false);
    await fixture.whenStable();
    q<HTMLDialogElement>('.de-cima').showModal();
    const e = pressSave(q('.campo-cima'));
    expect(e.defaultPrevented).toBeTrue();
    expect(saved()).toEqual([]);
    q<HTMLDialogElement>('.sem-salvar').showModal();
    expect(pressSave(q('.campo-sem')).defaultPrevented).toBeTrue();
    expect(saved()).toEqual([]);
  });

  it('com o Salvar apagado, a tela cheia não fecha', async () => {
    q<HTMLDialogElement>('.de-baixo').showModal();
    fixture.componentInstance.off.set(true);
    await fixture.whenStable();
    q<HTMLDialogElement>('.tela-cheia').showModal();
    q<HTMLTextAreaElement>('.grande').focus();
    expect(pressSave(q('.grande')).defaultPrevented).toBeTrue();
    expect(q<HTMLDialogElement>('.tela-cheia').open).toBeTrue();
  });

  it('desabilitado ou esperando a nuvem, não salva (e nem abre o do navegador)', async () => {
    q<HTMLDialogElement>('.de-baixo').showModal();
    fixture.componentInstance.off.set(true);
    await fixture.whenStable();
    expect(pressSave(q('.texto')).defaultPrevented).toBeTrue();
    fixture.componentInstance.off.set(false);
    fixture.componentInstance.busy.set(true);
    await fixture.whenStable();
    pressSave(q('.texto'));
    expect(saved()).toEqual([]);
  });

  it('segurar o S, ou o S de uma composição (o teclado japonês), não salva', () => {
    q<HTMLDialogElement>('.de-baixo').showModal();
    q<HTMLTextAreaElement>('.texto').focus();
    expect(pressSave(q('.texto'), { repeat: true }).defaultPrevented).toBeTrue();
    pressSave(q('.texto'), { isComposing: true });
    expect(saved()).toEqual([]);
  });

  it('o campo que só avisa no change (o número) entra antes de salvar, e o foco volta para ele', () => {
    q<HTMLDialogElement>('.de-baixo').showModal();
    const n = q<HTMLInputElement>('.numero');
    n.focus();
    n.value = '7';
    pressSave(n);
    expect(saved()).toEqual(['de-baixo:7']);
    expect(document.activeElement).toBe(n);
  });

  it('na tela cheia, ela fecha e a folha de baixo salva, depois de o foco voltar à folha pequena', async () => {
    q<HTMLDialogElement>('.de-baixo').showModal();
    q<HTMLDialogElement>('.tela-cheia').showModal();
    q<HTMLTextAreaElement>('.grande').focus();
    expect(pressSave(q('.grande')).defaultPrevented).toBeTrue();
    expect(q<HTMLDialogElement>('.tela-cheia').open).toBeFalse();
    expect(saved()).toEqual([]);
    await new Promise((r) => setTimeout(r, 20));
    expect(saved()).toEqual(['de-baixo:0']);
  });

  it('o botão que acende com o que o campo avisou (o Aplicar) já vale no Ctrl+S', () => {
    q<HTMLDialogElement>('.aplicar').showModal();
    const n = q<HTMLInputElement>('.mexidas');
    n.focus();
    n.value = '3';
    pressSave(n);
    expect(saved()).toEqual(['aplicar:3']);
    expect(document.activeElement).toBe(n);
  });

  it('na página, só o Salvar do formulário (ou da folha solta) onde está o foco; fora deles, o navegador segue', () => {
    q<HTMLInputElement>('.campo-b').focus();
    pressSave(q('.campo-b'));
    expect(saved()).toEqual(['pagina-b']);
    q<HTMLInputElement>('.campo-a').focus();
    pressSave(q('.campo-a'));
    expect(saved()).toEqual(['pagina-b', 'pagina-a']);
    q<HTMLTextAreaElement>('.cartao-texto').focus();
    pressSave(q('.cartao-texto'));
    expect(saved()).toEqual(['pagina-b', 'pagina-a', 'cartao']);
    const e = pressSave(q('.solto'));
    expect(e.defaultPrevented).toBeFalse();
    expect(saved()).toEqual(['pagina-b', 'pagina-a', 'cartao']);
  });

  it('a dica ganha o atalho, sem o desenho; a escrita no molde fica; o leitor de tela ouve o atalho', async () => {
    const a = q<HTMLButtonElement>('.pagina-a button');
    a.dispatchEvent(new PointerEvent('pointerenter'));
    expect(a.title).toBe(`Lançar (${SAVE_KEY})`);
    expect(a.getAttribute('aria-keyshortcuts')).toBe('Control+S Meta+S');
    const b = q<HTMLButtonElement>('.pagina-b button');
    b.dispatchEvent(new PointerEvent('pointerenter'));
    expect(b.title).toBe('Guardar (Ctrl+S também)');
    expect(b.getAttribute('aria-keyshortcuts')).toBe('Control+Enter Control+S Meta+S');
    // apagado, a dica não promete o atalho
    fixture.componentInstance.off.set(true);
    await fixture.whenStable();
    const off = q<HTMLButtonElement>('.de-baixo form button');
    off.dispatchEvent(new PointerEvent('pointerenter'));
    expect(off.hasAttribute('title')).toBeFalse();
    // desligado: sem atalho, nem na dica
    fixture.componentInstance.topSaves.set(false);
    await fixture.whenStable();
    const top = q<HTMLButtonElement>('.de-cima button');
    top.dispatchEvent(new PointerEvent('pointerenter'));
    expect(top.hasAttribute('title')).toBeFalse();
    expect(top.hasAttribute('aria-keyshortcuts')).toBeFalse();
  });
});
