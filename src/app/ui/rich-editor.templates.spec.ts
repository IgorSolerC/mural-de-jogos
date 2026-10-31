import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { RichEditor } from './rich-editor';
import { Settings } from '../core/settings';
import { NoteTemplate } from '../core/note-templates';
import { Toasts } from './toast';
import { nextClose } from '../testing/dialog-close.spec';
import { markdownDoHtml } from '../core/transferencia';

const CONFIG = 'mural-de-jogos:config:v1';
const REUNIAO: NoteTemplate = { id: 'reuniao', title: 'Reunião', text: '## Pauta\n- [ ] ' };
const DIARIO: NoteTemplate = { id: 'diario', title: 'Diário', text: 'Hoje **foi** bom' };

/**
 * O menu "Templates" da régua do texto (ui/text-templates.ts) e a folha do template (ui/template-sheet.ts):
 * a régua só com os desenhos, pôr no cursor (no Markdown e no Visual), copiar, guardar o trecho
 * selecionado, editar e apagar com o Desfazer, e o teclado do menu.
 */
describe('os templates do texto', () => {
  let fixture: ComponentFixture<RichEditor>;
  let settings: Settings;

  async function make(text: string, mode: 'visual' | 'markdown', templates: NoteTemplate[] = [REUNIAO, DIARIO]): Promise<void> {
    localStorage.setItem(CONFIG, JSON.stringify({ escrita: mode }));
    TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
    settings = TestBed.inject(Settings);
    settings.setNotesConfig({ templates });
    fixture = TestBed.createComponent(RichEditor);
    fixture.componentRef.setInput('label', 'Anotação');
    fixture.componentRef.setInput('templates', true);
    fixture.componentInstance.value.set(text);
    document.body.appendChild(fixture.nativeElement);
    await settle();
    if (mode === 'visual') {
      for (let i = 0; i < 300 && !fixture.nativeElement.querySelector('.visual .ProseMirror'); i++) {
        await new Promise((r) => setTimeout(r, 10));
        fixture.detectChanges();
      }
      await settle();
    }
  }

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
    localStorage.removeItem(CONFIG);
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  const el = () => fixture.nativeElement as HTMLElement;
  const area = () => el().querySelector('textarea') as HTMLTextAreaElement;
  const value = () => fixture.componentInstance.value();
  const menuButton = () => el().querySelector('.menu-botao[data-menu="modelos"]') as HTMLButtonElement;
  const menu = () => el().querySelector('app-text-templates') as HTMLElement | null;
  const item = (label: string) => menu()!.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;
  const action = (name: string) => Array.from(menu()!.querySelectorAll<HTMLButtonElement>('.acao')).find((b) => b.textContent!.trim() === name) ?? null;
  const pm = (): EditorView => (fixture.debugElement.query(By.css('app-visual-editor')).componentInstance as { view: EditorView }).view;

  async function openMenu(): Promise<void> {
    menuButton().click();
    await settle();
  }

  /** A folha do template, que chega num pedaço à parte. */
  async function sheet(): Promise<HTMLDialogElement> {
    for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete);
    await settle();
    for (let i = 0; i < 50 && !el().querySelector('dialog.folha-modelo[open]'); i++) {
      await new Promise((r) => setTimeout(r, 10));
      await settle();
    }
    return el().querySelector('dialog.folha-modelo') as HTMLDialogElement;
  }
  function type(field: HTMLInputElement | HTMLTextAreaElement, text: string): void {
    field.value = text;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('a régua tem o botão Templates (só o carimbo e a setinha), depois de Formatar e Inserir', async () => {
    await make('', 'markdown');
    const menus = Array.from(el().querySelectorAll<HTMLElement>('.regua .menu-botao'));
    expect(menus.map((b) => b.getAttribute('aria-label'))).toEqual(['Formatar', 'Inserir', 'Templates']);
    expect(menuButton().textContent!.trim()).toBe('');
    expect(menuButton().getAttribute('aria-haspopup')).toBe('menu');
  });

  it('sem `templates` (o comentário, o perfil), a régua fica sem o botão', async () => {
    await make('', 'markdown');
    fixture.componentRef.setInput('templates', false);
    await settle();
    expect(menuButton()).toBeNull();
  });

  it('o menu lista os templates pelo nome, com o começo do texto sem as marcas', async () => {
    await make('', 'markdown');
    await openMenu();
    expect(menuButton().getAttribute('aria-expanded')).toBe('true');
    expect(menu()!.getAttribute('role')).toBe('menu');
    const rows = Array.from(menu()!.querySelectorAll('.linha'));
    expect(rows.map((r) => r.querySelector('.nome')!.textContent!.trim())).toEqual(['Diário', 'Reunião']);
    expect(rows[0].querySelector('.previa')!.textContent!.trim()).toBe('Hoje foi bom');
    // cada linha: pôr, copiar, editar
    expect(item('Pôr “Diário” no texto')).not.toBeNull();
    expect(item('Copiar “Diário”')).not.toBeNull();
    expect(item('Editar “Diário”')).not.toBeNull();
    // sem seleção, só o "Novo template"
    expect(action('Guardar o trecho selecionado')).toBeNull();
    expect(action('Novo template')).not.toBeNull();
  });

  it('sem nenhum, o menu diz para que servem e oferece o "Novo template"', async () => {
    await make('', 'markdown', []);
    await openMenu();
    const vazio = menu()!.querySelector('.vazio')!;
    expect(vazio.textContent).toContain('Guarde um texto');
    // dentro do menu o leitor de tela só ouve os itens: o aviso descreve o menu
    expect(menu()!.getAttribute('aria-describedby')).toBe(vazio.id);
    expect(action('Novo template')).not.toBeNull();
  });

  it('no Markdown, o template entra no cursor (no lugar da seleção), e o Ctrl+Z desfaz', async () => {
    await make('antes  depois', 'markdown');
    area().focus();
    area().setSelectionRange(6, 6);
    await openMenu();
    item('Pôr “Diário” no texto').click();
    await settle();
    expect(value()).toBe('antes Hoje **foi** bom depois');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(area());
    document.execCommand('undo');
    area().dispatchEvent(new Event('input'));
    expect(value()).toBe('antes  depois');
  });

  it('no Visual, o template entra no cursor com as marcas lidas (a linha vazia vira o título dele)', async () => {
    await make('um\n\ndois', 'visual');
    const v = pm();
    // a linha vazia do meio
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 5)));
    await settle();
    await openMenu();
    item('Pôr “Reunião” no texto').click();
    await settle();
    expect(value()).toBe('um\n## Pauta\n- [ ] \ndois');
    expect(pm().state.doc.child(1).textContent).toBe('Pauta');
  });

  it('no Visual, "Guardar o trecho selecionado" leva o trecho com as marcas', async () => {
    await make('um **dois** três', 'visual', []);
    const v = pm();
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 4, 8)));
    await settle();
    await openMenu();
    action('Guardar o trecho selecionado')!.click();
    await settle();
    const d = await sheet();
    expect((d.querySelector('#modelo-texto') as HTMLTextAreaElement).value).toBe('**dois**');
  });

  it('Copiar põe o texto limpo (para fora) e o markdown no HTML (para uma nota do Murall) e avisa; o menu fecha', async () => {
    await make('', 'markdown');
    const write = spyOn(navigator.clipboard, 'write').and.resolveTo();
    const toasts = TestBed.inject(Toasts);
    await openMenu();
    item('Copiar “Diário”').click();
    await settle();
    for (let i = 0; i < 20 && !toasts.current(); i++) await new Promise((r) => setTimeout(r, 5));
    expect(write).toHaveBeenCalledTimes(1);
    const clip = write.calls.mostRecent().args[0][0];
    expect(await (await clip.getType('text/plain')).text()).toBe('Hoje foi bom');
    const html = await (await clip.getType('text/html')).text();
    expect(markdownDoHtml(html)).toBe('Hoje **foi** bom');
    expect(menu()).toBeNull();
    expect(toasts.current()?.text).toBe('“Diário” copiado: é só colar');
  });

  it('o Esc com algo escrito na folha avisa; o segundo fecha sem guardar', async () => {
    await make('', 'markdown');
    await openMenu();
    action('Novo template')!.click();
    await settle();
    const d = await sheet();
    type(d.querySelector('#modelo-texto') as HTMLTextAreaElement, 'Um texto longo');
    const esc = () => d.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(esc()).withContext('o primeiro Esc não fecha').toBeFalse();
    fixture.detectChanges();
    expect(d.querySelector('.falta')!.textContent).toContain('Esc de novo fecha sem guardar');
    expect(esc()).withContext('o segundo fecha').toBeTrue();
  });

  it('o Desfazer de um apagado, com outro do mesmo nome já guardado, volta com um número no nome', async () => {
    await make('', 'markdown');
    await openMenu();
    item('Editar “Reunião”').click();
    await settle();
    const d = await sheet();
    const closed = nextClose(d);
    (d.querySelector('.apagar') as HTMLButtonElement).click();
    await closed;
    await settle();
    const undo = TestBed.inject(Toasts).current()!.action!;
    settings.saveTemplate({ id: 'outra', title: 'reunião', text: 'x' });
    undo.run();
    expect(settings.notesConfig().templates.find((t) => t.id === 'reuniao')!.title).toBe('Reunião (2)');
  });

  it('com um trecho selecionado, "Guardar o trecho selecionado" abre a folha com ele e o nome sugerido', async () => {
    await make('Lista da feira\n- [ ] pão\n- [ ] café', 'markdown', []);
    area().focus();
    area().setSelectionRange(0, area().value.length);
    await openMenu();
    action('Guardar o trecho selecionado')!.click();
    await settle();
    const d = await sheet();
    expect(d.open).toBeTrue();
    const name = d.querySelector('#modelo-nome') as HTMLInputElement;
    const text = d.querySelector('#modelo-texto') as HTMLTextAreaElement;
    expect(text.value).toBe('Lista da feira\n- [ ] pão\n- [ ] café');
    expect(name.placeholder).toBe('Lista da feira');
    expect(document.activeElement).withContext('falta só o nome').toBe(name);
    // a prévia mostra como fica
    expect(d.querySelector('.previa app-rich-text')!.textContent).toContain('pão');
    // sem nome, ele leva o sugerido
    const closed = nextClose(d);
    (Array.from(d.querySelectorAll<HTMLButtonElement>('.btn-ink')).find((b) => b.textContent!.includes('Guardar template')))!.click();
    await closed;
    await settle();
    expect(settings.notesConfig().templates.map((t) => [t.title, t.text])).toEqual([['Lista da feira', 'Lista da feira\n- [ ] pão\n- [ ] café']]);
    expect(TestBed.inject(Toasts).current()?.text).toBe('Template “Lista da feira” guardado');
    expect(el().querySelector('app-template-sheet')).toBeNull();
    // no menu, o começo do texto não repete o nome que veio dele
    await openMenu();
    expect(menu()!.querySelector('.previa')!.textContent!.trim()).toBe('pão · café');
    expect(menu()!.getAttribute('aria-describedby')).toBeNull();
  });

  it('a folha não guarda sem texto, nem com o nome de outro (diz o que falta e leva o foco ao campo)', async () => {
    await make('', 'markdown');
    await openMenu();
    action('Novo template')!.click();
    await settle();
    const d = await sheet();
    const name = d.querySelector('#modelo-nome') as HTMLInputElement;
    const text = d.querySelector('#modelo-texto') as HTMLTextAreaElement;
    const save = () => (Array.from(d.querySelectorAll<HTMLButtonElement>('.btn-ink')).find((b) => b.textContent!.includes('Guardar template')))!.click();
    save();
    fixture.detectChanges();
    expect(d.querySelector('.falta')!.textContent).toContain('Falta o texto do template');
    expect(document.activeElement).toBe(text);
    type(text, 'Outra pauta');
    type(name, ' reuniao ');
    save();
    fixture.detectChanges();
    expect(d.querySelector('.falta')!.textContent).toContain('Já tem um template “Reunião”: escolha outro nome');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(settings.notesConfig().templates.length).toBe(2);
    // Ctrl+Enter guarda
    type(name, 'Pauta curta');
    const closed = nextClose(d);
    text.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await closed;
    await settle();
    expect(settings.notesConfig().templates.map((t) => t.title)).toEqual(['Reunião', 'Diário', 'Pauta curta']);
  });

  it('Editar abre a folha com o template; guardar troca ele no lugar; Apagar tira, com o Desfazer', async () => {
    await make('', 'markdown');
    await openMenu();
    item('Editar “Reunião”').click();
    await settle();
    let d = await sheet();
    expect(d.querySelector('h2')!.textContent).toContain('Editar template');
    const text = d.querySelector('#modelo-texto') as HTMLTextAreaElement;
    expect(text.value).toBe('## Pauta\n- [ ] ');
    type(text, '## Pauta nova');
    let closed = nextClose(d);
    (Array.from(d.querySelectorAll<HTMLButtonElement>('.btn-ink')).find((b) => b.textContent!.includes('Guardar template')))!.click();
    await closed;
    await settle();
    expect(settings.notesConfig().templates.find((t) => t.id === 'reuniao')).toEqual({ id: 'reuniao', title: 'Reunião', text: '## Pauta nova' });

    await openMenu();
    item('Editar “Reunião”').click();
    await settle();
    d = await sheet();
    closed = nextClose(d);
    (d.querySelector('.apagar') as HTMLButtonElement).click();
    await closed;
    await settle();
    expect(settings.notesConfig().templates.map((t) => t.id)).toEqual(['diario']);
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('Template “Reunião” apagado');
    toast.action!.run();
    expect(settings.notesConfig().templates.map((t) => t.id)).toEqual(['diario', 'reuniao']);
  });

  it('o teclado: a seta para baixo abre no primeiro; as setas andam na mesma coluna e pela linha; uma letra pula; Esc volta ao botão', async () => {
    await make('', 'markdown');
    menuButton().focus();
    menuButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await settle();
    await new Promise((r) => setTimeout(r));
    const press = (key: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(item('Pôr “Diário” no texto'));
    press('ArrowRight');
    expect(document.activeElement).toBe(item('Copiar “Diário”'));
    press('ArrowDown');
    expect(document.activeElement).withContext('a mesma coluna').toBe(item('Copiar “Reunião”'));
    press('ArrowDown');
    expect(document.activeElement).withContext('a ação embaixo tem uma coluna só').toBe(action('Novo template'));
    press('d');
    expect(document.activeElement).toBe(item('Pôr “Diário” no texto'));
    press('r');
    expect(document.activeElement).toBe(item('Pôr “Reunião” no texto'));
    press('End');
    expect(document.activeElement).toBe(action('Novo template'));
    press('Escape');
    await settle();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });
});
