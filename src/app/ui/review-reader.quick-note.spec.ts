import { provideZonelessChangeDetection, signal } from '@angular/core';
import { SPEECH } from '../core/voz';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { LocalData } from '../core/local-data';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SHARED_AUTO, SharedEntry, SharedStore } from '../core/shared-store';
import { comMarkdown } from '../testing/writing-mode.spec';
import { ReviewReader } from './review-reader';

/**
 * A nota nova a partir de um trecho da leitura (PLANO-NOTA-DE-REFERENCIA.md, parte 2): selecionar um trecho de uma
 * anotação sua mostra o "Nova nota" ao lado do "Citar" (e sozinho na tela cheia); a folhinha cria a anotação e o
 * trecho vira link para ela, sem sair da leitura.
 */

class MemoryData {
  private readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {
    /* sem outras abas */
  }
  takeForeign(): null {
    return null;
  }
}

function note(id: string, name: string, text: string, extra: Partial<Review> = {}): Review {
  return {
    ...sanitizeReview({
      kind: 'anotacoes',
      game: { name, coverUrl: null, source: 'manual' },
      text,
      completedAt: '2026-11-01',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      ...extra,
    })!,
    id,
  };
}

const TEXT = 'Roteiro da viagem\n- fui a Paris em maio, e Paris estava linda\n- ver [[Roma]] depois\n- usar `Paris` no código';

describe('A nota nova a partir de um trecho (ReviewReader)', () => {
  comMarkdown();
  let fixture: ComponentFixture<ReviewReader>;
  let el: HTMLElement;
  let store: ReviewStore;
  let still: HTMLStyleElement;

  beforeEach(() => {
    localStorage.clear();
    still = document.head.appendChild(document.createElement('style'));
    still.textContent = '*, *::backdrop { animation: none !important; transition: none !important; }';
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SPEECH, useValue: null },
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: SHARED_AUTO, useValue: false },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        { provide: CloudAccount, useValue: { account: signal(null), signedIn: signal(false), request: async () => ({}) } },
      ],
    });
    store = TestBed.inject(ReviewStore);
    fixture = TestBed.createComponent(ReviewReader);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.detectChanges();
  });

  afterEach(() => {
    for (const d of el.querySelectorAll('dialog')) if (d.open) d.close();
    getSelection()?.removeAllRanges();
    el.remove();
    still.remove();
    localStorage.clear();
  });

  const q = <T extends HTMLElement>(selector: string) => el.querySelector<T>(selector);
  const wait = (ms = 0) => new Promise((res) => setTimeout(res, ms));
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await wait();
      fixture.detectChanges();
      for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete).catch(() => undefined);
      await fixture.whenStable();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  }
  const button = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label);

  /** Seleciona a `nth` vez de `piece` no texto da ficha (contando todas as do texto) e espera os remendos. */
  async function select(piece: string, nth = 0): Promise<void> {
    const zone = q('[data-citavel]')!;
    const walker = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
    let seen = 0;
    let found: { node: Node; at: number } | null = null;
    while (!found && walker.nextNode()) {
      const t = walker.currentNode.textContent ?? '';
      for (let at = t.indexOf(piece); at !== -1; at = t.indexOf(piece, at + piece.length)) {
        if (seen++ === nth) {
          found = { node: walker.currentNode, at };
          break;
        }
      }
    }
    expect(found).withContext(`"${piece}" no texto`).not.toBeNull();
    const range = document.createRange();
    range.setStart(found!.node, found!.at);
    range.setEnd(found!.node, found!.at + piece.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await wait(260);
    await settle();
  }

  async function openNote(n: Review): Promise<void> {
    store.add(n);
    fixture.componentInstance.open(store.get(n.id)!);
    await settle();
  }

  it('na sua anotação, o trecho mostra o "Nova nota"; criar põe o link no lugar selecionado, sem sair da leitura', async () => {
    await openNote(note('nroteiro1', 'Viagem', TEXT, { category: 'Viagens' }));
    await select('Paris', 1);
    const make = q<HTMLButtonElement>('.remendos .anotar')!;
    expect(make.textContent!.trim()).toBe('Nova nota');
    make.click();
    await settle();
    const sheet = q<HTMLDialogElement>('app-quick-note-sheet dialog')!;
    expect(sheet.open).toBeTrue();
    expect(q<HTMLInputElement>('#nota-rapida-nome')!.value).toBe('Paris');
    expect(getSelection()!.isCollapsed).toBeTrue();
    const area = q<HTMLTextAreaElement>('app-quick-note-sheet app-rich-editor textarea')!;
    area.value = 'A capital.';
    area.dispatchEvent(new Event('input'));
    await settle();
    button('Criar e ligar')!.click();
    await settle();
    const made = store.notes().find((n) => n.game.name === 'Paris')!;
    expect(made.text).toBe('A capital.');
    expect(made.category).toBe('Viagens');
    // a segunda vez de Paris na linha, a selecionada
    expect(store.get('nroteiro1')!.text).toBe(TEXT.replace('e Paris estava', 'e [[Paris]] estava'));
    expect(q('dialog.reader')!.hasAttribute('open')).toBeTrue();
    expect(q('app-quick-note-sheet')).toBeNull();
    expect(q('[data-citavel] .elo')!.textContent).toContain('Paris');
    expect(q('p.sr-only[role="status"]')!.textContent).toContain('Anotação “Paris” criada e ligada ao trecho');
  });

  it('o título trocado vira "[[Título|trecho]]": o que se lê não muda', async () => {
    await openNote(note('nroteiro1', 'Viagem', TEXT));
    await select('maio');
    q<HTMLButtonElement>('.remendos .anotar')!.click();
    await settle();
    const title = q<HTMLInputElement>('#nota-rapida-nome')!;
    title.value = 'Maio de 2026';
    title.dispatchEvent(new Event('input'));
    await settle();
    button('Criar e ligar')!.click();
    await settle();
    expect(store.get('nroteiro1')!.text).toContain('fui a Paris em [[Maio de 2026|maio]], e');
  });

  it('o título que já existe: "Só ligar a ela" liga o trecho sem criar outra', async () => {
    store.add(note('nparis001', 'Paris', ''));
    await openNote(note('nroteiro1', 'Viagem', TEXT));
    await select('Paris');
    q<HTMLButtonElement>('.remendos .anotar')!.click();
    await settle();
    button('Só ligar a ela')!.click();
    await settle();
    expect(store.notes().filter((n) => n.game.name === 'Paris').length).toBe(1);
    expect(store.get('nroteiro1')!.text).toContain('fui a [[Paris]] em maio');
  });

  it('o texto mudou com a folha aberta (a nuvem trouxe outra versão): o link vai na linha certa da de agora', async () => {
    await openNote(note('nroteiro1', 'Viagem', TEXT));
    await select('maio');
    q<HTMLButtonElement>('.remendos .anotar')!.click();
    await settle();
    store.update({ ...store.get('nroteiro1')!, text: 'Uma linha nova no alto\n' + TEXT, updatedAt: '2026-11-02T00:00:00.000Z' });
    button('Criar e ligar')!.click();
    await settle();
    expect(store.get('nroteiro1')!.text).toBe('Uma linha nova no alto\n' + TEXT.replace('em maio', 'em [[maio]]'));
  });

  it('cancelar não muda nada', async () => {
    await openNote(note('nroteiro1', 'Viagem', TEXT));
    await select('maio');
    q<HTMLButtonElement>('.remendos .anotar')!.click();
    await settle();
    button('Cancelar')!.click();
    await settle();
    expect(q('app-quick-note-sheet')).toBeNull();
    expect(store.get('nroteiro1')!.text).toBe(TEXT);
    expect(store.notes().length).toBe(1);
  });

  it('no título de um card que abre e fecha, o trecho também vira nota (as conversas de japonês)', async () => {
    const card = '> [!vazio|cartolina]- ((山田さん)): ケンくんはベッドにいますか？\n> \n> ### ***Romaji***\n> *||Ken-kun wa beddo ni imasu ka?||*';
    await openNote(note('nconversa1', 'Conversa 20', card, { category: 'JAPONES' }));
    await select('くんはベ');
    q<HTMLButtonElement>('.remendos .anotar')!.click();
    await settle();
    expect(q<HTMLInputElement>('#nota-rapida-nome')!.value).toBe('くんはベ');
    button('Criar e ligar')!.click();
    await settle();
    expect(store.get('nconversa1')!.text).toBe(card.replace('ケンくんはベッド', 'ケン[[くんはベ]]ッド'));
    expect(store.notes().find((n) => n.game.name === 'くんはベ')!.category).toBe('JAPONES');
  });

  it('no spoiler revelado, o trecho vira nota; no coberto, não', async () => {
    const card = '> [!vazio|verde] Romaji\n> *||Yuki-chan, ashita wa yasumi desu||*';
    await openNote(note('nconversa2', 'Conversa 21', card));
    await select('ita wa ya');
    expect(q('.remendos .anotar')).toBeNull();
    q<HTMLElement>('[data-citavel] .spoiler')!.click();
    await settle();
    expect(q('[data-citavel] .spoiler.revelado')).not.toBeNull();
    await select('ita wa ya');
    q<HTMLButtonElement>('.remendos .anotar')!.click();
    await settle();
    button('Criar e ligar')!.click();
    await settle();
    expect(store.get('nconversa2')!.text).toBe(card.replace('ashita wa yasumi', 'ash[[ita wa ya]]sumi'));
  });

  it('na célula de uma tabela: a fileira certa, e o link com outro título não divide a célula', async () => {
    const table = 'Planos\n\n| Cidade | Quando |\n| --- | --- |\n| Paris | maio |\n| Lyon | junho |';
    await openNote(note('ntabela01', 'Viagem', table));
    await select('junho');
    q<HTMLButtonElement>('.remendos .anotar')!.click();
    await settle();
    const title = q<HTMLInputElement>('#nota-rapida-nome')!;
    title.value = 'Junho de 2026';
    title.dispatchEvent(new Event('input'));
    await settle();
    button('Criar e ligar')!.click();
    await settle();
    expect(store.get('ntabela01')!.text).toBe(table.replace('| Lyon | junho |', '| Lyon | [[Junho de 2026\\|junho]] |'));
    // a tabela continua com as duas colunas, e o link aparece na célula
    expect(el.querySelectorAll('[data-citavel] tbody tr:last-child td').length).toBe(2);
    expect(q('[data-citavel] tbody tr:last-child td .elo')!.textContent).toContain('junho');
  });

  it('no cabeçalho da tabela também; um trecho que passa de uma célula para outra, não', async () => {
    const table = '| Cidade | Quando |\n| --- | --- |\n| Paris | maio |';
    await openNote(note('ntabela02', 'Viagem', table));
    await select('Cidade');
    expect(q('.remendos .anotar')).not.toBeNull();
    const cells = el.querySelectorAll('[data-citavel] tbody td');
    const range = document.createRange();
    range.setStart(cells[0].firstChild!.firstChild ?? cells[0].firstChild!, 0);
    range.setEnd(cells[1], cells[1].childNodes.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await wait(260);
    await settle();
    expect(q('.remendos .anotar')).toBeNull();
  });

  it('o trecho com "→" escrito "->": o link leva o símbolo, e o que se lê não muda', async () => {
    const text = 'Rota: Paris -> Lyon de trem';
    await openNote(note('nrota0001', 'Rota', text));
    await select('Paris → Lyon');
    q<HTMLButtonElement>('.remendos .anotar')!.click();
    await settle();
    button('Criar e ligar')!.click();
    await settle();
    expect(store.get('nrota0001')!.text).toBe('Rota: [[Paris → Lyon]] de trem');
    expect(store.notes().some((n) => n.game.name === 'Paris → Lyon')).toBeTrue();
  });

  it('o trecho com dois espaços seguidos: a anotação ganha o título de um espaço só', async () => {
    const text = 'Voo para São  Paulo amanhã';
    await openNote(note('nvoo00001', 'Voo', text));
    await select('São  Paulo');
    q<HTMLButtonElement>('.remendos .anotar')!.click();
    await settle();
    button('Criar e ligar')!.click();
    await settle();
    expect(store.get('nvoo00001')!.text).toBe('Voo para [[São  Paulo]] amanhã');
    expect(store.notes().some((n) => n.game.name === 'São Paulo')).toBeTrue();
  });

  it('dentro de um link ou de um código, o trecho não oferece a nota nova', async () => {
    await openNote(note('nroteiro1', 'Viagem', TEXT));
    await select('Roma');
    expect(q('.remendos .anotar')).toBeNull();
    await select('Paris', 2);
    expect(q('.remendos .anotar')).toBeNull();
  });

  it('um trecho que passa de uma linha para outra não oferece a nota nova', async () => {
    await openNote(note('nroteiro1', 'Viagem', TEXT));
    const zone = q('[data-citavel]')!;
    const lines = zone.querySelectorAll('[data-l]');
    const range = document.createRange();
    range.setStart(lines[0].firstChild ?? lines[0], 0);
    range.setEnd(lines[1], lines[1].childNodes.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await wait(260);
    await settle();
    expect(q('.remendos .anotar')).toBeNull();
  });

  it('na anotação de outra pessoa (a visita), nada de nota nova', async () => {
    const n = note('nroteiro1', 'Viagem', TEXT);
    fixture.componentInstance.open(n, 'Ana', [n]);
    await settle();
    await select('maio');
    expect(q('.remendos .anotar')).toBeNull();
  });

  it('numa compartilhada em que você só lê, nada de nota nova; como editor, sim, e a nova é privada', async () => {
    const n = note('nroteiro1', 'Viagem', TEXT);
    const shared = TestBed.inject(SharedStore);
    const role = signal<SharedEntry['papel']>('leitor');
    spyOn(shared, 'get').and.callFake((id: string) => (id === 'nroteiro1' ? ({ id, papel: role(), dono: { nome: 'Ana', codigo: 'AAAA-1111' }, membros: [], conflito: null, view: store.get(id) ?? n } as unknown as SharedEntry) : undefined));
    await openNote(n);
    await select('maio');
    expect(q('.remendos .anotar')).toBeNull();
    role.set('editor');
    fixture.componentInstance.close();
    await settle();
    fixture.componentInstance.open(store.get('nroteiro1')!);
    await settle();
    await select('maio');
    q<HTMLButtonElement>('.remendos .anotar')!.click();
    await settle();
    button('Criar e ligar')!.click();
    await settle();
    expect(store.notes().find((x) => x.game.name === 'maio')!.private).toBeTrue();
    expect(store.get('nroteiro1')!.text).toContain('em [[maio]]');
  });
});
