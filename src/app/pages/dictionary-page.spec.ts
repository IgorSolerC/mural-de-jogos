import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DictionaryPage } from './dictionary-page';

/** O Dicionário Japonês (PLANO-DICIONARIO.md): a busca, os filtros, a ordem e a vista, todos no endereço. */
describe('o Dicionário Japonês', () => {
  let harness: RouterTestingHarness;
  let host: HTMLElement;

  async function open(url: string): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([{ path: 'extras/dicionario', component: DictionaryPage }])] });
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

  it('mostra as 933 palavras na ordem de estudo, em seções pela importância', async () => {
    await open('/extras/dicionario');
    expect(host.querySelectorAll('.verbete').length).toBe(933);
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
    expect(host.querySelector('.achados')!.textContent).toContain(`Mostrando ${words().length} de 933 palavras`);
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
    expect(host.querySelectorAll('.verbete').length).toBe(933);
  });

  it('filtra pela folha: liga um recorte, mostra o adesivo com X e conta', async () => {
    await open('/extras/dicionario');
    button('Filtrar').click();
    await settle();
    const sheet = host.querySelector('app-facet-filters')!;
    expect([...sheet.querySelectorAll('.linha-titulo')].map((t) => t.textContent!.trim())).toEqual(['JLPT', 'Uso', 'Importância', 'Classe', 'Tema', 'Escrita', 'Registro', 'Grupo do verbo']);
    const verbo = [...sheet.querySelectorAll<HTMLElement>('.recorte')].find((r) => r.querySelector('.recorte-nome')!.textContent!.trim() === 'Verbo')!;
    verbo.querySelector('input')!.click();
    await settle();
    expect(query()['classe']).toBe('verbo');
    expect(host.querySelectorAll('.verbete').length).toBe(182);
    expect([...host.querySelectorAll('app-filter-tags .txt')].map((t) => t.textContent!.trim())).toEqual(['Verbo']);
    expect(host.querySelector('[aria-controls="cartela-dicionario"] .tinta-n')!.textContent).toBe('1');
    button('Tirar o filtro Verbo').click();
    await settle();
    expect(query()['classe']).toBeUndefined();
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

  it('a Tabela tem todas as colunas, e a cabeça ordena', async () => {
    await open('/extras/dicionario?vista=tabela');
    expect(host.querySelector('.verbete')).toBeNull();
    expect(host.querySelectorAll('tbody tr').length).toBe(933);
    expect([...host.querySelectorAll('thead th')].map((t) => t.textContent!.trim())).toEqual([
      'Nº', 'Japonês', 'Romaji', 'Português', 'JLPT', 'Uso', 'Imp.', 'Classe', 'Tema', 'Escrita', 'Registro', 'Internet', 'Composição', 'Notas',
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
