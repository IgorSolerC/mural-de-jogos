import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { RichEditor } from './rich-editor';
import { Settings } from '../core/settings';
import { NoteTemplate, TEMPLATE_FOLDER_GROUP } from '../core/note-templates';
import { NoteFolder } from '../core/folders';
import { Toasts } from './toast';
import { closeDialog, nextClose } from '../testing/dialog-close.spec';
import { markdownDoHtml } from '../core/transferencia';

const CONFIG = 'mural-de-jogos:config:v1';
const REUNIAO: NoteTemplate = { id: 'reuniao', title: 'Reunião', text: '## Pauta\n- [ ] ', folder: 'ptrabalho1' };
const ATA: NoteTemplate = { id: 'ata0001', title: 'Ata', text: 'Presentes:\n\nDecidido:', folder: 'ptrabalho1' };
const DIARIO: NoteTemplate = { id: 'diario', title: 'Diário', text: 'Hoje **foi** bom' };
const TRABALHO: NoteFolder = { id: 'ptrabalho1', group: TEMPLATE_FOLDER_GROUP, name: 'Trabalho', parent: null };
const CASA: NoteFolder = { id: 'pcasa00001', group: TEMPLATE_FOLDER_GROUP, name: 'Casa', parent: null };

/**
 * O botão "Templates" da régua do texto e o seletor dos templates (ui/template-picker.ts): a estante com as
 * mini-pastas em acordeão e os de fora das pastas, a prévia do escolhido inteiro, pôr no cursor (no Markdown e
 * no Visual), copiar, procurar, mudar de pasta, criar, renomear e desfazer pastas, o teclado; e o caminho até a
 * folha do template (ui/template-sheet.ts): guardar o trecho selecionado, editar e apagar com o Desfazer.
 */
describe('os templates do texto', () => {
  let fixture: ComponentFixture<RichEditor>;
  let settings: Settings;

  async function make(text: string, mode: 'visual' | 'markdown', templates: NoteTemplate[] = [REUNIAO, DIARIO, ATA], folders: NoteFolder[] = [TRABALHO, CASA]): Promise<void> {
    localStorage.setItem(CONFIG, JSON.stringify({ escrita: mode }));
    TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
    settings = TestBed.inject(Settings);
    settings.setNotesConfig({ templates, folders });
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
    for (const d of Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'))) d.close();
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
  const button = () => el().querySelector('.menu-botao[data-menu="modelos"]') as HTMLButtonElement;
  const picker = () => el().querySelector('dialog.modelos') as HTMLDialogElement;
  const pm = (): EditorView => (fixture.debugElement.query(By.css('app-visual-editor')).componentInstance as { view: EditorView }).view;
  const rowsText = () => Array.from(picker().querySelectorAll('.modelo-nome')).map((n) => n.textContent!.trim());
  const row = (name: string) => Array.from(picker().querySelectorAll<HTMLButtonElement>('.modelo')).find((b) => b.querySelector('.modelo-nome')!.textContent!.trim() === name)!;
  const head = (name: string) => Array.from(picker().querySelectorAll<HTMLButtonElement>('.abre')).find((b) => b.querySelector('.pasta-nome')!.textContent!.trim() === name)!;
  const btn = (root: ParentNode, text: string) => Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim() === text)!;
  const search = () => picker().querySelector('.busca input') as HTMLInputElement;
  const press = (key: string, target = document.activeElement as HTMLElement) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  /** Espera o que pediu (os pedaços à parte, o seletor e a folha do template dentro dele, chegam sozinhos). */
  async function waitFor(ok: () => boolean): Promise<void> {
    for (let i = 0; i < 200 && !ok(); i++) {
      await new Promise((r) => setTimeout(r, 10));
      await settle();
    }
  }

  async function openPicker(): Promise<HTMLDialogElement> {
    button().click();
    await settle();
    await waitFor(() => !!picker()?.open && !!picker().querySelector('.estante'));
    return picker();
  }

  /** A folha do template, que chega num pedaço à parte, por cima do seletor. */
  async function sheet(): Promise<HTMLDialogElement> {
    await waitFor(() => !!el().querySelector('dialog.folha-modelo[open]'));
    return el().querySelector('dialog.folha-modelo') as HTMLDialogElement;
  }
  function type(field: HTMLInputElement | HTMLTextAreaElement, text: string): void {
    field.value = text;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('a régua tem o botão Templates (só o carimbo e a setinha), depois de Formatar e Inserir, e ele abre uma folha', async () => {
    await make('', 'markdown');
    const menus = Array.from(el().querySelectorAll<HTMLElement>('.regua .menu-botao'));
    expect(menus.map((b) => b.getAttribute('aria-label'))).toEqual(['Formatar', 'Inserir', 'Templates']);
    expect(button().textContent!.trim()).toBe('');
    expect(button().getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('sem `templates` (o comentário, o perfil), a régua fica sem o botão', async () => {
    await make('', 'markdown');
    fixture.componentRef.setInput('templates', false);
    await settle();
    expect(button()).toBeNull();
  });

  it('a estante: as mini-pastas de A a Z (também a vazia), cada uma com os dela, e depois os de fora das pastas; a prévia mostra o escolhido inteiro', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(Array.from(d.querySelectorAll('.pasta-nome')).map((n) => n.textContent!.trim())).toEqual(['Casa', 'Trabalho']);
    expect(head('Trabalho').querySelector('.n')!.textContent).toContain('2');
    expect(d.querySelector('.pasta .vazia')!.textContent).toContain('Vazia');
    expect(rowsText()).toEqual(['Ata', 'Reunião', 'Diário']);
    expect(d.querySelector('.soltos-titulo')!.textContent!.trim()).toBe('Fora das pastas');
    // o começo do texto sem as marcas embaixo do nome
    expect(row('Diário').querySelector('.modelo-previa')!.textContent!.trim()).toBe('Hoje foi bom');
    // o primeiro da estante já à vista, inteiro, como entra na anotação
    expect(row('Ata').getAttribute('aria-current')).toBe('true');
    expect(d.querySelector('.previa-nome')!.textContent!.trim()).toBe('Ata');
    expect(d.querySelector('.folha-previa app-rich-text')!.textContent).toContain('Decidido:');
    expect(d.querySelector('.escolha-val')!.textContent!.trim()).toBe('Trabalho');
    row('Diário').click();
    await settle();
    expect(d.querySelector('.previa-nome')!.textContent!.trim()).toBe('Diário');
    expect(d.querySelector('.folha-previa .negrito')!.textContent).toBe('foi');
    expect(d.querySelector('.escolha-val')!.textContent!.trim()).toBe('Fora das pastas');
  });

  it('a pasta fecha e abre (o acordeão), e reabrir o seletor a acha como ficou', async () => {
    await make('', 'markdown');
    let d = await openPicker();
    head('Trabalho').click();
    await settle();
    expect(head('Trabalho').getAttribute('aria-expanded')).toBe('false');
    expect(rowsText()).toEqual(['Diário']);
    await closeDialog(d);
    await settle();
    d = await openPicker();
    expect(head('Trabalho').getAttribute('aria-expanded')).toBe('false');
    head('Trabalho').click();
    await settle();
    expect(rowsText()).toEqual(['Ata', 'Reunião', 'Diário']);
  });

  it('sem nenhum, a folha diz para que servem e oferece o primeiro', async () => {
    await make('', 'markdown', [], []);
    const d = await openPicker();
    expect(d.querySelector('.nada')!.textContent).toContain('Guarde um texto');
    expect(d.querySelector('.previa-lado')).toBeNull();
    expect(btn(d, 'Escrever o primeiro')).toBeTruthy();
    expect(btn(d, 'Pôr no texto')).toBeUndefined();
  });

  it('no Markdown, "Pôr no texto" põe o template no cursor (no lugar da seleção), a folha fecha, e o Ctrl+Z desfaz', async () => {
    await make('antes  depois', 'markdown');
    area().focus();
    area().setSelectionRange(6, 6);
    const d = await openPicker();
    row('Diário').click();
    await settle();
    const closed = nextClose(d);
    btn(d, 'Pôr no texto').click();
    await closed;
    await settle();
    await new Promise((r) => setTimeout(r));
    expect(value()).toBe('antes Hoje **foi** bom depois');
    expect(document.activeElement).toBe(area());
    document.execCommand('undo');
    area().dispatchEvent(new Event('input'));
    expect(value()).toBe('antes  depois');
  });

  it('dois toques (ou Enter) no template também põem no texto; reabrir volta no último usado', async () => {
    await make('', 'markdown');
    area().focus();
    let d = await openPicker();
    let closed = nextClose(d);
    row('Reunião').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await closed;
    await settle();
    expect(value()).toBe('## Pauta\n- [ ] ');
    d = await openPicker();
    expect(row('Reunião').getAttribute('aria-current')).toBe('true');
    row('Diário').focus();
    await settle();
    closed = nextClose(d);
    press('Enter', row('Diário'));
    await closed;
    await settle();
    expect(value()).toContain('Hoje **foi** bom');
  });

  it('no Visual, o template entra no cursor com as marcas lidas (a linha vazia vira o título dele)', async () => {
    await make('um\n\ndois', 'visual');
    const v = pm();
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 5)));
    await settle();
    const d = await openPicker();
    row('Reunião').click();
    await settle();
    const closed = nextClose(d);
    btn(d, 'Pôr no texto').click();
    await closed;
    await settle();
    expect(value()).toBe('um\n## Pauta\n- [ ] \ndois');
    expect(pm().state.doc.child(1).textContent).toBe('Pauta');
  });

  it('a busca acha no nome e no texto, abre a pasta onde achou e põe o primeiro na prévia; Enter põe ele no texto', async () => {
    await make('', 'markdown');
    let d = await openPicker();
    head('Trabalho').click();
    await settle();
    type(search(), 'decidido');
    await settle();
    expect(Array.from(d.querySelectorAll('.pasta-nome')).map((n) => n.textContent!.trim())).withContext('a pasta vazia sai').toEqual(['Trabalho']);
    expect(rowsText()).toEqual(['Ata']);
    expect(d.querySelector('.previa-nome')!.textContent!.trim()).toBe('Ata');
    type(search(), 'nada disso');
    await settle();
    expect(d.querySelector('.estante .nada')!.textContent).toContain('Nenhum template com “nada disso”');
    type(search(), 'hoje');
    await settle();
    const closed = nextClose(d);
    press('Enter', search());
    await closed;
    await settle();
    expect(value()).toBe('Hoje **foi** bom');
    // a pasta fechada antes da busca continua fechada
    d = await openPicker();
    expect(head('Trabalho').getAttribute('aria-expanded')).toBe('false');
  });

  it('mudar a pasta do escolhido pela Pasta da prévia, com o Desfazer; "Nova pasta…" cria e já pede o nome', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    row('Diário').click();
    await settle();
    const select = d.querySelector('.escolha select') as HTMLSelectElement;
    select.value = 'pcasa00001';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(settings.notesConfig().templates.find((t) => t.id === 'diario')!.folder).toBe('pcasa00001');
    expect(head('Casa').querySelector('.n')!.textContent).toContain('1');
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('“Diário” foi para Casa');
    toast.action!.run();
    expect('folder' in settings.notesConfig().templates.find((t) => t.id === 'diario')!).toBeFalse();
    await settle();
    // uma pasta nova, com o nome para escrever
    const again = d.querySelector('.escolha select') as HTMLSelectElement;
    again.value = '+';
    again.dispatchEvent(new Event('change'));
    await settle();
    await waitFor(() => document.activeElement?.classList.contains('nome-campo') ?? false);
    const field = document.activeElement as HTMLInputElement;
    field.value = 'Pessoal';
    press('Enter', field);
    await settle();
    const made = settings.notesConfig().folders.find((f) => f.name === 'Pessoal')!;
    expect(made.group).toBe(TEMPLATE_FOLDER_GROUP);
    expect(settings.notesConfig().templates.find((t) => t.id === 'diario')!.folder).toBe(made.id);
    expect(Array.from(d.querySelectorAll('.pasta-nome')).map((n) => n.textContent!.trim())).toEqual(['Casa', 'Pessoal', 'Trabalho']);
    // com o nome, o aviso de para onde foi, com o Desfazer
    const named = TestBed.inject(Toasts).current()!;
    expect(named.text).toBe('“Diário” foi para Pessoal');
    named.action!.run();
    expect('folder' in settings.notesConfig().templates.find((t) => t.id === 'diario')!).toBeFalse();
  });

  it('a pasta fechada com o template da prévia dentro: "Pôr no texto" ainda põe ele; procurando, as pastas não fecham', async () => {
    await make('', 'markdown');
    area().focus();
    const d = await openPicker();
    row('Reunião').click();
    await settle();
    head('Trabalho').click();
    await settle();
    expect(d.querySelector('.previa-nome')!.textContent!.trim()).toBe('Reunião');
    type(search(), 'ata');
    await settle();
    head('Trabalho').click();
    await settle();
    expect(head('Trabalho').getAttribute('aria-expanded')).toBe('true');
    type(search(), '');
    await settle();
    expect(head('Trabalho').getAttribute('aria-expanded')).withContext('fechada como estava antes da busca').toBe('false');
    // a Ata (o achado da busca) continua na prévia, dentro da pasta fechada, e entra no texto
    expect(d.querySelector('.previa-nome')!.textContent!.trim()).toBe('Ata');
    const closed = nextClose(d);
    btn(d, 'Pôr no texto').click();
    await closed;
    await settle();
    expect(value()).toBe(ATA.text);
  });

  it('"Nova pasta": nasce com o nome para escrever; o Esc desiste dela (e a folha fica)', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    btn(d, 'Nova pasta').click();
    await settle();
    await waitFor(() => document.activeElement?.classList.contains('nome-campo') ?? false);
    const field = document.activeElement as HTMLInputElement;
    expect(field.value).toBe('Nova pasta');
    expect(d.dispatchEvent(new Event('cancel', { cancelable: true }))).withContext('o Esc não fecha a folha').toBeFalse();
    await settle();
    expect(d.open).toBeTrue();
    expect(head('Nova pasta')).withContext('a pasta sem nome confirmado sai').toBeUndefined();
    expect(settings.notesConfig().folders.filter((f) => f.group === TEMPLATE_FOLDER_GROUP && !f.gone).length).toBe(2);
    // pela Pasta da prévia: o Esc no nome desfaz a pasta e o template volta para onde estava
    row('Diário').click();
    await settle();
    const select = d.querySelector('.escolha select') as HTMLSelectElement;
    select.value = '+';
    select.dispatchEvent(new Event('change'));
    await settle();
    await waitFor(() => document.activeElement?.classList.contains('nome-campo') ?? false);
    press('Escape');
    await settle();
    expect('folder' in settings.notesConfig().templates.find((t) => t.id === 'diario')!).toBeFalse();
    expect(settings.notesConfig().folders.filter((f) => f.group === TEMPLATE_FOLDER_GROUP && !f.gone).length).toBe(2);
    expect(d.querySelector('.previa-nome')!.textContent!.trim()).toBe('Diário');
  });

  it('o "…" da pasta: Renomear, Novo template aqui e Desfazer a pasta (os de dentro ficam fora das pastas, com o Desfazer)', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    const more = () => head('Trabalho').parentElement!.querySelector('.mais') as HTMLButtonElement;
    const option = (label: string) => Array.from(d.querySelectorAll<HTMLElement>('.menu-contexto [role="menuitem"]')).find((o) => o.textContent!.includes(label))!;
    // a folha chega com a animação: o menu fecha se o que o abriu anda (como na rolagem)
    await Promise.all(d.getAnimations({ subtree: true }).map((a) => a.finished));
    more().click();
    await waitFor(() => !!d.querySelector('.menu-contexto:popover-open'));
    await settle();
    expect(Array.from(d.querySelectorAll('.menu-contexto [role="menuitem"]')).map((o) => o.textContent!.trim().split('\n')[0].trim())).toEqual(['Novo template aqui', 'Renomear', 'Desfazer a pasta']);
    option('Renomear').click();
    await settle();
    await waitFor(() => document.activeElement?.classList.contains('nome-campo') ?? false);
    const field = document.activeElement as HTMLInputElement;
    field.value = 'Escritório';
    press('Enter', field);
    await settle();
    expect(settings.notesConfig().folders.find((f) => f.id === 'ptrabalho1')!.name).toBe('Escritório');

    const moreOf = () => head('Escritório').parentElement!.querySelector('.mais') as HTMLButtonElement;
    moreOf().click();
    await waitFor(() => !!d.querySelector('.menu-contexto:popover-open'));
    await settle();
    option('Desfazer a pasta').click();
    await settle();
    expect(head('Escritório')).toBeUndefined();
    expect(rowsText()).toEqual(['Ata', 'Diário', 'Reunião']);
    // nenhum template regravado: eles ainda apontam para a pasta, que virou lápide
    expect(settings.notesConfig().templates.find((t) => t.id === 'ata0001')!.folder).toBe('ptrabalho1');
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('A pasta “Escritório” saiu: 2 templates ficaram fora das pastas');
    toast.action!.run();
    await settle();
    expect(rowsText()).toEqual(['Ata', 'Reunião', 'Diário']);
  });

  it('renomear para o nome de outra pasta não vale (avisa, e o nome fica); aberta pelo teclado, fechar sem escolher volta ao botão', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    btn(d, 'Nova pasta').click();
    await settle();
    await waitFor(() => document.activeElement?.classList.contains('nome-campo') ?? false);
    const field = document.activeElement as HTMLInputElement;
    field.value = ' casa ';
    press('Enter', field);
    await settle();
    expect(TestBed.inject(Toasts).current()?.text).toBe('Já tem uma pasta “Casa”: o nome ficou “Nova pasta”');
    expect(Array.from(d.querySelectorAll('.pasta-nome')).map((n) => n.textContent!.trim())).toEqual(['Casa', 'Nova pasta', 'Trabalho']);
    // o clique sem ponteiro (Enter no botão) abriu: o Esc devolve o foco ao botão
    await closeDialog(d);
    await settle();
    await new Promise((r) => setTimeout(r));
    expect(document.activeElement).toBe(button());
  });

  it('o teclado: da busca, a seta para baixo vai à estante; a da esquerda fecha a pasta, a da direita abre; Home e End; para cima, da primeira, volta à busca', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    expect(document.activeElement).toBe(search());
    press('ArrowDown');
    await settle();
    expect(document.activeElement).toBe(head('Casa'));
    press('ArrowDown');
    expect(document.activeElement).toBe(head('Trabalho'));
    press('ArrowDown');
    expect(document.activeElement).toBe(row('Ata'));
    await settle();
    expect(d.querySelector('.previa-nome')!.textContent!.trim()).withContext('a prévia segue o foco').toBe('Ata');
    press('ArrowLeft');
    expect(document.activeElement).withContext('do template, para a cabeça da pasta dele').toBe(head('Trabalho'));
    press('ArrowLeft');
    await settle();
    expect(head('Trabalho').getAttribute('aria-expanded')).toBe('false');
    press('ArrowRight', head('Trabalho'));
    await settle();
    expect(head('Trabalho').getAttribute('aria-expanded')).toBe('true');
    head('Trabalho').focus();
    press('End');
    expect(document.activeElement).toBe(row('Diário'));
    press('Home');
    expect(document.activeElement).toBe(head('Casa'));
    press('ArrowUp');
    expect(document.activeElement).toBe(search());
  });

  it('no celular, tocar no template mostra ele no lugar da estante, com a volta', async () => {
    await make('', 'markdown');
    const real = window.matchMedia.bind(window);
    spyOn(window, 'matchMedia').and.callFake((q: string) => (q === '(max-width: 720px)' ? ({ matches: true } as MediaQueryList) : real(q)));
    const d = await openPicker();
    row('Diário').click();
    await settle();
    expect(d.querySelector('.corpo')!.classList).toContain('detalhe');
    btn(d, 'Todos os templates').click();
    await settle();
    expect(d.querySelector('.corpo')!.classList).not.toContain('detalhe');
  });

  it('Copiar põe o texto limpo (para fora) e o markdown no HTML (para uma nota do Murall) e avisa; a folha fecha', async () => {
    await make('', 'markdown');
    const write = spyOn(navigator.clipboard, 'write').and.resolveTo();
    const toasts = TestBed.inject(Toasts);
    const d = await openPicker();
    row('Diário').click();
    await settle();
    const closed = nextClose(d);
    btn(d, 'Copiar').click();
    await closed;
    await settle();
    for (let i = 0; i < 20 && !toasts.current(); i++) await new Promise((r) => setTimeout(r, 5));
    expect(write).toHaveBeenCalledTimes(1);
    const clip = write.calls.mostRecent().args[0][0];
    expect(await (await clip.getType('text/plain')).text()).toBe('Hoje foi bom');
    expect(markdownDoHtml(await (await clip.getType('text/html')).text())).toBe('Hoje **foi** bom');
    expect(toasts.current()?.text).toBe('“Diário” copiado: é só colar');
  });

  it('no Visual, "Guardar o trecho selecionado" leva o trecho com as marcas para a folha do template', async () => {
    await make('um **dois** três', 'visual');
    const v = pm();
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 4, 8)));
    await settle();
    const d = await openPicker();
    btn(d, 'Guardar o trecho selecionado').click();
    await settle();
    const s = await sheet();
    expect(s.open).toBeTrue();
    expect(fixture.debugElement.query(By.css('app-template-sheet')).componentInstance.startText()).toBe('**dois**');
    expect(d.open).withContext('o seletor continua por baixo').toBeTrue();
  });

  it('"Novo template aqui" numa pasta: ele nasce nela; guardar volta ao seletor com ele à vista', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    btn(d, 'escreva um aqui').click();
    await settle();
    const s = await sheet();
    fixture.debugElement.query(By.css('app-template-sheet')).componentInstance.text.set('Lista do mercado:\n- [ ] ');
    const closed = nextClose(s);
    btn(s, 'Guardar template').click();
    await closed;
    await settle();
    const made = settings.notesConfig().templates.find((t) => t.title === 'Lista do mercado:')!;
    expect(made.folder).toBe('pcasa00001');
    expect(d.open).toBeTrue();
    expect(d.querySelector('.previa-nome')!.textContent!.trim()).toBe('Lista do mercado:');
    expect(TestBed.inject(Toasts).current()?.text).toBe('Template “Lista do mercado:” guardado');
  });

  it('Editar e guardar não tira o template da pasta; Apagar tira, com o Desfazer (com outro do mesmo nome, volta com um número)', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    row('Reunião').click();
    await settle();
    btn(d, 'Editar').click();
    await settle();
    let s = await sheet();
    fixture.debugElement.query(By.css('app-template-sheet')).componentInstance.text.set('## Pauta nova');
    let closed = nextClose(s);
    btn(s, 'Guardar template').click();
    await closed;
    await settle();
    expect(settings.notesConfig().templates.find((t) => t.id === 'reuniao')).toEqual({ id: 'reuniao', title: 'Reunião', text: '## Pauta nova', folder: 'ptrabalho1' });

    btn(d, 'Editar').click();
    await settle();
    s = await sheet();
    closed = nextClose(s);
    (s.querySelector('.apagar') as HTMLButtonElement).click();
    await closed;
    await settle();
    expect(settings.notesConfig().templates.map((t) => t.id)).toEqual(['diario', 'ata0001']);
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('Template “Reunião” apagado');
    settings.saveTemplate({ id: 'outra', title: 'reunião', text: 'x' });
    toast.action!.run();
    await settle();
    expect(settings.notesConfig().templates.find((t) => t.id === 'reuniao')).toEqual({ id: 'reuniao', title: 'Reunião (2)', text: '## Pauta nova', folder: 'ptrabalho1' });
  });

  // ===== a folha de escrever o template =====

  const sheetText = (s: HTMLDialogElement) => s.querySelector('app-rich-editor textarea') as HTMLTextAreaElement;
  const saveButton = (s: HTMLDialogElement) => btn(s, 'Guardar template');

  it('a folha escreve no editor das anotações: no Visual, a folha do Visual (sem o botão Templates na régua dela)', async () => {
    await make('', 'visual');
    const d = await openPicker();
    btn(d, 'Novo template').click();
    await settle();
    const s = await sheet();
    await waitFor(() => !!s.querySelector('app-rich-editor .visual .ProseMirror'));
    expect(s.querySelector('app-rich-editor .visual .ProseMirror')).withContext('o Visual, como nas anotações').not.toBeNull();
    expect(s.querySelector('app-rich-editor .regua')).not.toBeNull();
    expect(s.querySelector('.menu-botao[data-menu="modelos"]')).withContext('sem template dentro de template').toBeNull();
    expect(s.querySelector('textarea#modelo-texto')).withContext('o campo cru saiu').toBeNull();
  });

  it('no Visual, abrir um template para editar e sair sem mexer fecha no primeiro Esc (nada mudou)', async () => {
    await make('', 'visual');
    const d = await openPicker();
    row('Ata').click();
    await settle();
    btn(d, 'Editar').click();
    await settle();
    const s = await sheet();
    await waitFor(() => !!s.querySelector('app-rich-editor .visual .ProseMirror'));
    await new Promise((r) => setTimeout(r, 50));
    await settle();
    expect(s.dispatchEvent(new Event('cancel', { cancelable: true }))).toBeTrue();
  });

  it('a busca sem nenhum achado não põe nada no texto (nem o da prévia de antes)', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    type(search(), 'nada disso');
    await settle();
    expect(d.querySelector('.previa-nome')).toBeNull();
    press('Enter', search());
    await settle();
    expect(d.open).toBeTrue();
    expect(value()).toBe('');
  });

  it('o Esc com algo escrito na folha avisa; o segundo fecha sem guardar', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    btn(d, 'Novo template').click();
    await settle();
    const s = await sheet();
    await waitFor(() => !!sheetText(s));
    type(sheetText(s), 'Um texto longo');
    await settle();
    const esc = () => s.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(esc()).withContext('o primeiro Esc não fecha').toBeFalse();
    fixture.detectChanges();
    expect(s.querySelector('.falta')!.textContent).toContain('Esc de novo fecha sem guardar');
    expect(esc()).withContext('o segundo fecha').toBeTrue();
  });

  it('com um trecho selecionado, a folha abre com ele e o nome sugerido (o foco no nome); sem nome, ele leva o sugerido', async () => {
    await make('Lista da feira\n- [ ] pão\n- [ ] café', 'markdown', [], []);
    area().focus();
    area().setSelectionRange(0, area().value.length);
    const d = await openPicker();
    btn(d, 'Guardar o trecho selecionado').click();
    await settle();
    const s = await sheet();
    await waitFor(() => !!sheetText(s));
    const name = s.querySelector('#modelo-nome') as HTMLInputElement;
    expect(sheetText(s).value).toBe('Lista da feira\n- [ ] pão\n- [ ] café');
    expect(name.placeholder).toBe('Lista da feira');
    expect(document.activeElement).withContext('falta só o nome').toBe(name);
    const closed = nextClose(s);
    saveButton(s).click();
    await closed;
    await settle();
    expect(settings.notesConfig().templates.map((t) => [t.title, t.text])).toEqual([['Lista da feira', 'Lista da feira\n- [ ] pão\n- [ ] café']]);
    // na estante, o começo do texto não repete o nome que veio dele
    expect(row('Lista da feira').querySelector('.modelo-previa')!.textContent!.trim()).toBe('pão · café');
  });

  it('a folha não guarda sem texto, nem com o nome de outro (diz o que falta e leva o foco ao campo); Ctrl+Enter guarda', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    btn(d, 'Novo template').click();
    await settle();
    const s = await sheet();
    await waitFor(() => !!sheetText(s));
    const name = s.querySelector('#modelo-nome') as HTMLInputElement;
    saveButton(s).click();
    fixture.detectChanges();
    expect(s.querySelector('.falta')!.textContent).toContain('Falta o texto do template');
    expect(document.activeElement).toBe(sheetText(s));
    expect(s.querySelector('app-rich-editor')!.classList).toContain('erro');
    type(sheetText(s), 'Outra pauta');
    type(name, ' reuniao ');
    saveButton(s).click();
    fixture.detectChanges();
    expect(s.querySelector('.falta')!.textContent).toContain('Já tem um template “Reunião”: escolha outro nome');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(settings.notesConfig().templates.length).toBe(3);
    type(name, 'Pauta curta');
    const closed = nextClose(s);
    sheetText(s).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await closed;
    await settle();
    expect(settings.notesConfig().templates.map((t) => t.title)).toEqual(['Reunião', 'Diário', 'Ata', 'Pauta curta']);
  });

  it('a Pasta da folha: escolher uma, ou criar uma nova escrevendo o nome (um nível só)', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    row('Diário').click();
    await settle();
    btn(d, 'Editar').click();
    await settle();
    const s = await sheet();
    const pasta = s.querySelector('.pasta-botao') as HTMLButtonElement;
    expect(pasta.textContent).toContain('Fora das pastas');
    pasta.click();
    await settle();
    await waitFor(() => !!s.querySelector('app-folder-picker input'));
    const radios = () => Array.from(s.querySelectorAll<HTMLButtonElement>('app-folder-picker [role="radio"]'));
    expect(radios().map((r) => r.textContent!.trim().replace(/\s+/g, ' '))).toEqual(['Fora das pastas', 'Casa', 'Trabalho, 2 templates']);
    radios()[1].click();
    await settle();
    expect(pasta.textContent).toContain('Casa');
    expect(s.querySelector('app-folder-picker')).withContext('escolher fecha a escolha').toBeNull();
    // uma nova, pelo nome: nasce na raiz (mesmo com a Casa escolhida) e já fica escolhida
    pasta.click();
    await settle();
    await waitFor(() => !!s.querySelector('app-folder-picker input'));
    type(s.querySelector('app-folder-picker input') as HTMLInputElement, 'Pessoal');
    await settle();
    const criar = s.querySelector('app-folder-picker .criar') as HTMLButtonElement;
    expect(criar.textContent).toContain('Criar “Pessoal” em Templates');
    criar.click();
    await settle();
    const made = settings.notesConfig().folders.find((f) => f.name === 'Pessoal')!;
    expect(made.parent).toBeNull();
    expect(made.group).toBe(TEMPLATE_FOLDER_GROUP);
    const closed = nextClose(s);
    saveButton(s).click();
    await closed;
    await settle();
    expect(settings.notesConfig().templates.find((t) => t.id === 'diario')!.folder).toBe(made.id);
    expect(d.querySelector('.escolha-val')!.textContent!.trim()).toBe('Pessoal');
  });

  it('editar sem mexer na Pasta não desfaz a pasta que outro aparelho deu ao template com a folha aberta', async () => {
    await make('', 'markdown');
    const d = await openPicker();
    row('Diário').click();
    await settle();
    btn(d, 'Editar').click();
    await settle();
    const s = await sheet();
    await waitFor(() => !!sheetText(s));
    // outro aparelho guarda o Diário na Casa
    settings.applyNotesConfig({ ...settings.notesConfig(), templates: settings.notesConfig().templates.map((t) => (t.id === 'diario' ? { ...t, folder: 'pcasa00001' } : t)) }, new Date().toISOString());
    type(sheetText(s), 'Hoje foi ótimo');
    const closed = nextClose(s);
    saveButton(s).click();
    await closed;
    await settle();
    expect(settings.notesConfig().templates.find((t) => t.id === 'diario')).toEqual({ id: 'diario', title: 'Diário', text: 'Hoje foi ótimo', folder: 'pcasa00001' });
  });
});
