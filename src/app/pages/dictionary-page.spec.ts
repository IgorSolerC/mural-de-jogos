import { provideZonelessChangeDetection, signal } from '@angular/core';
import { CloudAccount } from '../core/cloud-account';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DICT_MARKS_KEY } from '../core/dictionary/marks-store';
import { dictionaryWords } from '../core/dictionary/words';
import { DictionaryPage } from './dictionary-page';

/** O Dicionário Japonês (PLANO-DICIONARIO.md): a busca, os filtros, a ordem e a vista, todos no endereço. */
describe('o Dicionário Japonês', () => {
  let harness: RouterTestingHarness;
  let host: HTMLElement;

  const account = signal<{ codigo: string; nome: string } | null>(null);
  async function open(url: string): Promise<void> {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([{ path: 'extras/dicionario', component: DictionaryPage }]), { provide: CloudAccount, useValue: { account } }],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, DictionaryPage);
    host = harness.routeNativeElement!;
    await harness.fixture.whenStable();
  }
  const settle = async () => {
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  const query = () => TestBed.inject(Router).parseUrl(TestBed.inject(Router).url).queryParams;
  const words = () => [...host.querySelectorAll('.verbete .palavra')].map((p) => (p.querySelector('ruby')?.firstChild?.textContent ?? p.textContent)!.trim());
  const heads = () => [...host.querySelectorAll('app-section-head .nome')].map((h) => h.textContent!.trim());
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent!.trim()) === label)!;

  it('mostra as 1023 palavras na ordem de estudo, em seções pela importância', async () => {
    await open('/extras/dicionario');
    expect(host.querySelectorAll('.verbete').length).toBe(1023);
    expect(words().slice(0, 3)).toEqual(['だ', '〜ます', '〜ない']);
    expect(heads()[0]).toBe('Importância 10');
    // a leitura vai em furigana só por cima de quem tem kanji
    const kuru = [...host.querySelectorAll('.verbete')].find((v) => v.querySelector('.romaji')?.textContent?.trim() === 'kuru')!;
    expect(kuru.querySelector('rt')?.textContent).toBe('くる');
    expect(host.querySelector('.verbete')!.querySelector('ruby')).toBeNull();
    // sem busca e sem filtro, a linha "Mostrando" não aparece
    expect(host.querySelector('.achados')).toBeNull();
  });

  it('busca pelo endereço, ordena por relevância e diz quantas achou', async () => {
    await open('/extras/dicionario?q=kuru');
    expect(words()[0]).toBe('来る');
    expect(host.querySelector('.achados')!.textContent).toContain(`Mostrando ${words().length} de 1023 palavras`);
    expect(host.querySelector('.campo-val')!.textContent!.trim()).toBe('Relevância');
    // a relevância não divide em seções
    expect(heads()).toEqual([]);
  });

  it('o que se digita vai para o endereço, e Limpar tira a busca e os filtros', async () => {
    await open('/extras/dicionario?jlpt=N3');
    const input = host.querySelector<HTMLInputElement>('#busca-dicionario')!;
    input.value = 'sinbun';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(query()['q']).toBe('sinbun');
    expect(words()).toEqual([]);
    // nada: o cartão das Anotações, com o que fazer
    expect(host.querySelector('.no-results h2')!.textContent).toBe('Nenhuma palavra com esse filtro');
    button('Limpar a busca e os filtros').click();
    await settle();
    expect(query()).toEqual({});
    expect(host.querySelectorAll('.verbete').length).toBe(1023);
  });

  it('filtra pela folha: liga um recorte, mostra o adesivo com X e conta', async () => {
    await open('/extras/dicionario');
    button('Filtrar').click();
    await settle();
    const sheet = host.querySelector('app-facet-filters')!;
    expect([...sheet.querySelectorAll('.linha-titulo')].map((t) => t.textContent!.trim())).toEqual(['Aprendidas', 'Favoritas', 'JLPT', 'Uso', 'Importância', 'Classe', 'Tema', 'Escrita', 'Registro', 'Grupo do verbo']);
    const verbo = [...sheet.querySelectorAll<HTMLElement>('.recorte')].find((r) => r.querySelector('.recorte-nome')!.textContent!.trim() === 'Verbo')!;
    verbo.querySelector('input')!.click();
    await settle();
    expect(query()['classe']).toBe('verbo');
    expect(host.querySelectorAll('.verbete').length).toBe(191);
    expect([...host.querySelectorAll('app-filter-tags .txt')].map((t) => t.textContent!.trim())).toEqual(['Verbo']);
    expect(host.querySelector('[aria-controls="cartela-dicionario"] .tinta-n')!.textContent).toBe('1');
    button('Tirar o filtro Verbo').click();
    await settle();
    expect(query()['classe']).toBeUndefined();
  });

  it('marca como aprendida e como favorita pelos selos, com Desfazer, e filtra por elas', async () => {
    localStorage.removeItem(DICT_MARKS_KEY);
    await open('/extras/dicionario?q=kuru');
    const kuru = host.querySelector('.verbete')!;
    const seal = (cls: string) => kuru.querySelector<HTMLButtonElement>(`app-word-seals .${cls}`)!;
    expect(seal('aprendida').getAttribute('aria-pressed')).toBe('false');
    seal('aprendida').click();
    seal('favorita').click();
    await settle();
    expect(seal('aprendida').getAttribute('aria-pressed')).toBe('true');
    expect(seal('favorita').getAttribute('aria-pressed')).toBe('true');
    expect(kuru.querySelector('.quando')!.textContent).toContain('aprendida em');

    // o atalho Favoritas da pasta é o filtro da folha
    button('Favoritas').click();
    await settle();
    expect(query()['favorita']).toBe('sim');
    expect(words()).toEqual(['来る']);
    // sem a conta do dono, só a marcada agora está aprendida
    await harness.navigateByUrl('/extras/dicionario?aprendida=sim', DictionaryPage);
    await settle();
    expect(words()).toEqual(['来る']);
    // com a conta do dono (ou da namorada), as que o CSV dá como aprendidas contam sem marca nenhuma
    account.set({ codigo: 'G11T-G00D', nome: 'Igor' });
    await settle();
    expect(words().length).toBe(99);
    account.set(null);
    localStorage.removeItem(DICT_MARKS_KEY);
  });

  it('na composição de um verbete, outra palavra do dicionário é link: abre a lousa dela', async () => {
    await open('/extras/dicionario?q=taberu');
    const link = host.querySelector<HTMLButtonElement>('.verbete .relacionadas .elo')!;
    expect(link.textContent!.trim()).toBe('食べ物');
    link.click();
    await settle();
    const id = query()['palavra'];
    expect(dictionaryWords().words.find((w) => w.id === id)?.text).toBe('食べ物');
  });

  it('tocar na palavra abre a lousa, que mora no endereço; as setas andam pela lista e fechar tira do endereço', async () => {
    await open('/extras/dicionario?q=kuru');
    host.querySelector<HTMLButtonElement>('.verbete .palavra.lousa')!.click();
    await settle();
    expect(query()['palavra']).toBe('JP0242');
    for (let i = 0; i < 20 && !host.querySelector('app-word-board dialog'); i++) await settle();
    const dialog = host.querySelector<HTMLDialogElement>('app-word-board dialog')!;
    expect(dialog.open).toBeTrue();
    // a próxima da lista que a busca mostra
    host.querySelector<HTMLButtonElement>('app-word-board [aria-label="Próxima palavra"]')!.click();
    await settle();
    expect(query()['palavra']).not.toBe('JP0242');
    dialog.close();
    // o "close" do diálogo chega numa tarefa depois (às vezes mais de uma, com a suíte ocupada): espera ele chegar
    for (let i = 0; i < 20 && query()['palavra'] !== undefined; i++) {
      await new Promise((r) => setTimeout(r, 10));
      await settle();
    }
    expect(query()['palavra']).toBeUndefined();
  });

  it('ordena pela leitura em linhas do silabário, e a seta inverte', async () => {
    await open('/extras/dicionario?ordem=leitura');
    expect(heads()[0]).toBe('あ行');
    expect(heads().at(-1)).toBe('わ行');
    button(host.querySelector('.so-icone')!.getAttribute('aria-label')!).click();
    await settle();
    expect(query()['dir']).toBe('desc');
    expect(heads()[0]).toBe('わ行');
  });

  it('com a ordem Leitura, o índice de dedo pula para a linha do silabário; a linha vazia fica apagada', async () => {
    const go = async (url: string) => {
      await harness.navigateByUrl(url, DictionaryPage);
      await settle();
    };
    await open('/extras/dicionario');
    expect(host.querySelector('app-thumb-index')).toBeNull();
    await go('/extras/dicionario?ordem=leitura');
    const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('app-thumb-index .entalhe')];
    expect(tabs().map((b) => b.textContent!.trim())).toEqual(['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ']);
    expect(tabs().every((b) => !b.disabled)).toBeTrue();
    const scrolled: string[] = [];
    spyOn(HTMLElement.prototype, 'scrollIntoView').and.callFake(function (this: HTMLElement) {
      scrolled.push(this.dataset['secao'] ?? '');
    });
    tabs()[1].click();
    await settle();
    expect(scrolled[0]).toBe('kana-1');
    expect(tabs()[1].getAttribute('aria-current')).toBe('location');
    // o foco vai para o nome da linha, como num link dentro da página
    expect(document.activeElement?.textContent).toContain('か行');
    expect(tabs()[1].getAttribute('aria-label')).toMatch(/^か \(ka\): \d+ palavras$/);
    // a busca deixa só a linha das palavras achadas; as outras ficam, apagadas
    await go('/extras/dicionario?ordem=leitura&q=taberu');
    expect(tabs().filter((b) => !b.disabled).map((b) => b.textContent!.trim())).toEqual(['た']);
    // na Tabela não há seções: nem índice
    await go('/extras/dicionario?ordem=leitura&vista=tabela');
    expect(host.querySelector('app-thumb-index')).toBeNull();
  });

  it('a Tabela tem todas as colunas, e a cabeça ordena', async () => {
    await open('/extras/dicionario?vista=tabela');
    expect(host.querySelector('.verbete')).toBeNull();
    expect(host.querySelectorAll('tbody tr').length).toBe(1023);
    expect([...host.querySelectorAll('thead th')].map((t) => t.textContent!.trim())).toEqual([
      'Nº', 'Marcas', 'Japonês', 'Romaji', 'Português', 'JLPT', 'Uso', 'Imp.', 'Classe', 'Tema', 'Escrita', 'Registro', 'Internet', 'Relacionadas', 'Descrição', 'Origem',
    ]);
    const imp = [...host.querySelectorAll<HTMLButtonElement>('thead .cabeca')].find((b) => b.textContent!.trim() === 'Imp.')!;
    imp.click();
    await settle();
    expect(query()['ordem']).toBe('importancia');
    expect(imp.closest('th')!.getAttribute('aria-sort')).toBe('descending');
    imp.click();
    await settle();
    expect(query()['dir']).toBe('desc');
    expect(imp.closest('th')!.getAttribute('aria-sort')).toBe('ascending');
    expect(host.querySelector('tbody .c-imp')!.textContent!.trim()).toBe('0');
  });
});
