import { provideZonelessChangeDetection, signal } from '@angular/core';
import { CloudAccount } from '../core/cloud-account';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DICT_MARKS_KEY } from '../core/dictionary/marks-store';
import { sortWords } from '../core/dictionary/dictionary';
import { dictionaryWords } from '../core/dictionary/words';
import { NEAR_TUNING, NearPool, setEverythingNear } from '../ui/near-screen';
import { entryHeightGuess } from '../ui/word-entry';
import { DictionaryPage, SEARCH_PAUSE_MS, tableRowGuess } from './dictionary-page';

/** O Dicionário Japonês (PLANO-DICIONARIO.md): a busca, os filtros, a ordem e a vista, todos no endereço. */
describe('o Dicionário Japonês', () => {
  let harness: RouterTestingHarness;
  let host: HTMLElement;

  const account = signal<{ codigo: string; nome: string } | null>(null);
  // a janela dos testes é baixa: tudo montado, menos no bloco que testa justamente isso (o último)
  beforeEach(() => setEverythingNear(true));
  afterEach(() => setEverythingNear(false));
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

  it('mostra as 1450 palavras na ordem de estudo, em seções pela importância', async () => {
    await open('/extras/dicionario');
    expect(host.querySelectorAll('.verbete').length).toBe(1450);
    expect(words().slice(0, 3)).toEqual(['だ', '〜ます', '〜ない']);
    expect(heads()[0]).toBe('Importância 10');
    // a leitura vai em furigana só por cima de quem tem kanji
    const kuru = [...host.querySelectorAll('.verbete')].find((v) => v.querySelector('.romaji')?.textContent?.trim() === 'kuru')!;
    expect(kuru.querySelector('rt')?.textContent).toBe('くる');
    expect(host.querySelector('.verbete')!.querySelector('ruby')).toBeNull();
    // sem busca e sem filtro, a linha "Mostrando" não aparece
    expect(host.querySelector('.achados')).toBeNull();
  });

  it('o Treinar abre a folha de montar e, ao Começar, a mesa do treino (PLANO-TREINO-DICIONARIO.md)', async () => {
    localStorage.removeItem('meu-mural:dicionario:treino:v1');
    await open('/extras/dicionario');
    button('Treinar').click();
    for (let i = 0; i < 40 && !host.querySelector('app-word-drill-setup dialog[open]'); i++) {
      await new Promise((r) => setTimeout(r, 20));
      await settle();
    }
    expect(host.querySelector('app-word-drill-setup dialog')!.hasAttribute('open')).toBeTrue();
    host.querySelector<HTMLButtonElement>('app-word-drill-setup .comecar')!.click();
    for (let i = 0; i < 40 && !host.querySelector('app-word-drill dialog[open] .folha'); i++) {
      await new Promise((r) => setTimeout(r, 20));
      await settle();
    }
    expect(host.querySelector('app-word-drill-setup')).toBeNull();
    expect(host.querySelector('app-word-drill .baralho')!.textContent).toContain('1 de 20');
    host.querySelector<HTMLDialogElement>('app-word-drill dialog')!.close();
    for (let i = 0; i < 40 && host.querySelector('app-word-drill'); i++) {
      await new Promise((r) => setTimeout(r, 20));
      await settle();
    }
    expect(host.querySelector('app-word-drill')).toBeNull();
    localStorage.removeItem('meu-mural:dicionario:treino:v1');
  });

  it('busca pelo endereço, ordena por relevância e diz quantas achou', async () => {
    await open('/extras/dicionario?q=kuru');
    expect(words()[0]).toBe('来る');
    expect(host.querySelector('.achados')!.textContent).toContain(`Mostrando ${words().length} de 1450 palavras`);
    expect(host.querySelector('.campo-val')!.textContent!.trim()).toBe('Relevância');
    // a relevância não divide em seções
    expect(heads()).toEqual([]);
  });

  it('o que se digita vai para o endereço, e Limpar tira a busca e os filtros', async () => {
    await open('/extras/dicionario?jlpt=N3');
    const input = host.querySelector<HTMLInputElement>('#busca-dicionario')!;
    // cada tecla no campo na hora; a lista e o endereço esperam a pessoa parar de digitar
    for (const typed of ['s', 'si', 'sin', 'sinbun']) {
      input.value = typed;
      input.dispatchEvent(new Event('input'));
      await settle();
      expect(input.value).toBe(typed);
      expect(query()['q']).withContext('ainda digitando').toBeUndefined();
    }
    expect(host.querySelectorAll('.verbete').length).withContext('a lista de antes, enquanto digita').toBe(dictionaryWords().words.filter((w) => w.jlpt === 'N3').length);
    await new Promise((r) => setTimeout(r, SEARCH_PAUSE_MS + 30));
    await settle();
    expect(query()['q']).toBe('sinbun');
    expect(words()).toEqual([]);
    // nada: o cartão das Anotações, com o que fazer
    expect(host.querySelector('.no-results h2')!.textContent).toBe('Nenhuma palavra com esse filtro');
    button('Limpar a busca e os filtros').click();
    await settle();
    expect(query()).toEqual({});
    expect(host.querySelectorAll('.verbete').length).toBe(1450);
    // apagar tudo na busca vale na hora
    input.value = 'kuru';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, SEARCH_PAUSE_MS + 30));
    await settle();
    expect(query()['q']).toBe('kuru');
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(query()['q']).toBeUndefined();
    expect(host.querySelectorAll('.verbete').length).toBe(1450);
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
    expect(host.querySelectorAll('.verbete').length).toBe(282);
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
    // o carimbo 済 é a aprendida, a fita de marcador é a favorita
    const seal = (cls: string) => kuru.querySelector<HTMLButtonElement>(`.faixa .${cls}`)!;
    expect(seal('sumi').getAttribute('aria-pressed')).toBe('false');
    expect(seal('sumi').getAttribute('aria-label')).toBe('Aprendida: 来る');
    expect(seal('fita').getAttribute('aria-label')).toBe('Favorita: 来る');
    seal('sumi').click();
    seal('fita').click();
    await settle();
    expect(seal('sumi').getAttribute('aria-pressed')).toBe('true');
    expect(seal('fita').getAttribute('aria-pressed')).toBe('true');
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
    expect(words().length).toBe(125);
    account.set(null);
    localStorage.removeItem(DICT_MARKS_KEY);
  });

  it('nas palavras ligadas de um verbete, a que está no dicionário é um cartãozinho que abre a lousa dela', async () => {
    await open('/extras/dicionario?q=taberu');
    const verbete = host.querySelector('.verbete')!;
    const cards = [...verbete.querySelectorAll('.cartoezinhos .ligada')];
    expect(cards.map((c) => c.querySelector('.lig-ja')!.textContent!.trim())).toEqual(['食べます', '食べない', '食べた', '食べ物']);
    expect(cards.map((c) => c.querySelector('.lig-pt')!.textContent!.trim())).toEqual(['forma educada', 'não comer', 'comeu', 'comida']);
    // só 食べ物 é outra palavra do dicionário: só ele é botão
    const link = verbete.querySelector<HTMLButtonElement>('.cartoezinhos button.ligada.abre')!;
    expect(verbete.querySelectorAll('.cartoezinhos button').length).toBe(1);
    expect(link.querySelector('.lig-ja')!.textContent!.trim()).toBe('食べ物');
    link.click();
    await settle();
    const id = query()['palavra'];
    expect(dictionaryWords().words.find((w) => w.id === id)?.text).toBe('食べ物');
  });

  it('o verbete de um verbo tem as Conjugações, que abrem a folha dele; o que não é verbo não tem (PLANO-CONJUGACOES.md)', async () => {
    await open('/extras/dicionario?q=iku');
    const iku = [...host.querySelectorAll('.verbete')].find((v) => v.querySelector('.romaji')?.textContent?.trim() === 'iku')!;
    const noun = [...host.querySelectorAll('.verbete')].find((v) => v.getAttribute('data-familia') === 'nome');
    expect(noun?.querySelector('.conjugar') ?? null).toBeNull();
    iku.querySelector<HTMLButtonElement>('.conjugar')!.click();
    for (let i = 0; i < 40 && !host.querySelector('app-word-conjugations dialog[open]'); i++) {
      await new Promise((r) => setTimeout(r, 20));
      await settle();
    }
    const sheet = host.querySelector('app-word-conjugations')!;
    expect(sheet.querySelector('.verbo rt')!.textContent).toBe('いく');
    expect(sheet.querySelectorAll('.forma').length).toBe(33);
    sheet.querySelector<HTMLDialogElement>('dialog')!.close();
    for (let i = 0; i < 40 && host.querySelector('app-word-conjugations'); i++) {
      await new Promise((r) => setTimeout(r, 20));
      await settle();
    }
    expect(host.querySelector('app-word-conjugations')).toBeNull();
  });

  it('a busca que acha a palavra pelas ligadas marca o cartãozinho em que achou', async () => {
    await open('/extras/dicionario?q=これから');
    // o realce entra um quadro depois das fichas
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const kore = [...host.querySelectorAll<HTMLElement>('.verbete')].find((v) => v.querySelector('.romaji')!.textContent!.trim() === 'kore')!;
    const card = [...kore.querySelectorAll('.lig-ja')].find((e) => e.textContent!.trim() === 'これから')!;
    const ranges = [...(CSS.highlights.get('busca') ?? [])] as Range[];
    expect(ranges.some((r) => card.contains(r.startContainer))).withContext('o これから das ligadas de これ').toBeTrue();
  });

  it('os cartões ficam direto na parede, sem folha por trás, em duas colunas e cada um logo embaixo do de cima', async () => {
    await open('/extras/dicionario');
    const folha = host.querySelector<HTMLElement>('.folha')!;
    const look = getComputedStyle(folha);
    expect(look.backgroundImage).toBe('none');
    expect(look.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(look.boxShadow).toBe('none');
    expect(look.columnCount).toBe(innerWidth > 900 ? '2' : '1');
    // sem buraco: o cartão seguinte começa no vão fixo depois do de cima, por mais alto que o vizinho seja
    const [a, b] = [...folha.querySelectorAll<HTMLElement>('.verbete')].slice(0, 2).map((c) => c.getBoundingClientRect());
    expect(b.left).toBe(a.left);
    expect(Math.round(b.top - a.bottom)).toBe(innerWidth > 900 ? 32 : 20);
  });

  it('o verbete é um cartão na cor da classe, com o uso escrito, o nível, a origem e os números no pé', async () => {
    localStorage.removeItem(DICT_MARKS_KEY);
    await open('/extras/dicionario?q=taberu');
    const eat = host.querySelector<HTMLElement>('.verbete')!;
    expect(eat.dataset['familia']).toBe('verbo');
    expect(eat.querySelector('.faixa .uso b')!.textContent!.trim()).toBe('Altíssimo');
    expect(eat.querySelector('.faixa .nivel')!.textContent!.trim()).toBe('JLPT N5');
    expect(eat.querySelectorAll('.frases li').length).toBe(3);
    expect(eat.querySelector('.frases b')!.textContent).toBe('食べます');
    expect(eat.querySelector('.origem')!.textContent).toContain('Do verbo clássico 食ぶ (tabu).');
    expect(eat.querySelector('.numeros')!.textContent).toContain('1.591ª mais comum na internet');
    await harness.navigateByUrl('/extras/dicionario?q=kami', DictionaryPage);
    await settle();
    const paper = [...host.querySelectorAll<HTMLElement>('.verbete')].find((v) => v.querySelector('.romaji')!.textContent!.trim() === 'kami')!;
    expect(paper.dataset['familia']).toBe('nome');
    // sem origem certa, sem a linha do 源
    expect(paper.querySelector('.origem')).toBeNull();
    // a cor da faixa é a da cartolina escura da família
    expect(getComputedStyle(paper.querySelector('.faixa')!).backgroundColor).toBe('rgb(10, 51, 75)');
  });

  it('o 済 e a fita só fazem a animação quando são tocados; o que já vem marcado aparece parado', async () => {
    localStorage.removeItem(DICT_MARKS_KEY);
    await open('/extras/dicionario?q=kuru');
    const kuru = () => host.querySelector('.verbete')!;
    kuru().querySelector<HTMLButtonElement>('.sumi')!.click();
    await settle();
    expect(kuru().querySelector('.sumi')!.classList).toContain('agora');
    kuru().querySelector<HTMLButtonElement>('.fita')!.click();
    await settle();
    // o último tocado é o que anima
    expect(kuru().querySelector('.fita')!.classList).toContain('agora');
    expect(kuru().querySelector('.sumi')!.classList).not.toContain('agora');
    // a animação passa: a marca fica, parada
    await new Promise((r) => setTimeout(r, 1300));
    await settle();
    expect(kuru().querySelectorAll('.agora').length).toBe(0);
    // aberto de novo (outro cartão), já marcado: ligado e parado
    await harness.navigateByUrl('/extras/dicionario?q=taberu', DictionaryPage);
    await settle();
    await harness.navigateByUrl('/extras/dicionario?q=kuru', DictionaryPage);
    await settle();
    expect(kuru().querySelector('.fita')!.classList).toContain('ligado');
    expect(kuru().querySelector('.sumi')!.classList).toContain('ligado');
    expect(kuru().querySelectorAll('.agora').length).toBe(0);
    localStorage.removeItem(DICT_MARKS_KEY);
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

  it('as colunas da Tabela têm largura fixa, e nenhum texto passa por cima da coluna do lado', async () => {
    await open('/extras/dicionario?vista=tabela');
    const table = host.querySelector<HTMLTableElement>('table')!;
    expect(getComputedStyle(table).tableLayout).toBe('fixed');
    expect(table.querySelectorAll('col').length).toBe(16);
    // as colunas de uma linha: com outra letra (a destes testes), quebram a linha em vez de passar da coluna
    for (const c of ['c-n', 'c-romaji', 'c-jlpt', 'c-uso', 'c-imp', 'c-classe', 'c-tema', 'c-escrita', 'c-rank'])
      for (const cell of host.querySelectorAll<HTMLElement>(`tbody .${c}`)) expect(cell.scrollWidth).withContext(`${c}: ${cell.textContent!.trim()}`).toBeLessThanOrEqual(cell.clientWidth + 1);
    // e a cabeça de cada coluna cabe nela
    for (const th of host.querySelectorAll<HTMLElement>('thead th')) expect(th.scrollWidth).withContext(th.textContent!.trim()).toBeLessThanOrEqual(th.clientWidth + 1);
  });

  it('a Tabela tem todas as colunas, e a cabeça ordena', async () => {
    await open('/extras/dicionario?vista=tabela');
    expect(host.querySelector('.verbete')).toBeNull();
    expect(host.querySelectorAll('tbody tr').length).toBe(1450);
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
  describe('só o que está perto da tela (PLANO-DICIONARIO.md, 8.2)', () => {
    const tuning = { ...NEAR_TUNING };
    beforeEach(() => {
      setEverythingNear(false);
      Object.assign(NEAR_TUNING, { leaveAfter: 60, sweepEvery: 20 });
    });
    afterEach(() => {
      Object.assign(NEAR_TUNING, tuning);
      scrollTo(0, 0);
    });
    const until = async (ok: () => boolean, what: string) => {
      for (let i = 0; i < 200 && !ok(); i++) {
        await new Promise((r) => setTimeout(r, 10));
        await settle();
      }
      expect(ok()).withContext(what).toBeTrue();
    };
    const places = () => [...host.querySelectorAll<HTMLElement>('.lugar-verbete')];

    it('cada palavra tem o seu lugar na lista; as de longe são vagas da altura do cartão, com a palavra para o leitor de tela', async () => {
      await open('/extras/dicionario');
      expect(places().length).toBe(1450);
      // (a janela dos testes vem de outros testes em qualquer lugar: o começo da lista na tela)
      places()[0].scrollIntoView({ block: 'start' });
      await until(() => !!places()[0].querySelector('.verbete'), 'a primeira, na tela');
      const last = places().at(-1)!;
      const vaga = last.querySelector<HTMLElement>('.vaga-verbete')!;
      expect(vaga).withContext('a última, longe').not.toBeNull();
      expect(host.querySelectorAll('.verbete').length).toBeLessThan(200);
      const w = dictionaryWords().words.find((x) => x.order === 1450)!;
      expect(vaga.textContent!.replace(/\s+/g, ' ').trim()).toBe(`${w.text}, ${w.meaning}`);
      expect(vaga.querySelector('[lang="ja"]')!.textContent).toBe(w.text);
      expect(parseFloat(vaga.style.height)).toBeGreaterThan(300);
      expect(getComputedStyle(vaga).borderStyle).toBe('dashed');
    });

    it('rolando até a vaga, ela vira o cartão; ao montar, a altura fica perto do palpite, e a vaga que volta tem a medida', async () => {
      await open('/extras/dicionario');
      const place = places()[600];
      place.scrollIntoView({ block: 'center' });
      await until(() => !!place.querySelector('.verbete'), 'montado perto da tela');
      const id = dictionaryWords().words.find((x) => x.order === 601)!;
      const real = parseFloat(getComputedStyle(place).height);
      const guess = entryHeightGuess(id, place.offsetWidth);
      expect(Math.abs(real - guess) / real).withContext(`medido ${real}, palpite ${guess}`).toBeLessThan(0.2);
      scrollTo(0, 0);
      await until(() => !place.querySelector('.verbete'), 'longe de novo, volta a ser vaga');
      expect(TestBed.inject(NearPool).measured('verbete', id.id)).toBeCloseTo(real, 0);
      expect(parseFloat(getComputedStyle(place).height)).toBeCloseTo(real, 0);
    });

    it('a seção que o navegador ainda não desenhou tem a altura da soma das vagas dela (a rolagem não pula ao chegar nela)', async () => {
      await open('/extras/dicionario');
      const sections = [...host.querySelectorAll<HTMLElement>('.secao')];
      expect(getComputedStyle(sections[0]).contentVisibility).toBe('auto');
      // a segunda seção, desenhada: a altura de verdade fica perto do palpite que ela tinha antes
      const second = sections[1];
      const guess = parseFloat(second.style.containIntrinsicBlockSize.replace('auto', ''));
      second.scrollIntoView({ block: 'start' });
      await until(() => !!second.querySelector('.verbete'), 'desenhada perto da tela');
      const real = second.getBoundingClientRect().height;
      expect(Math.abs(real - guess) / real).withContext(`real ${real}, palpite ${guess}`).toBeLessThan(0.15);
    });

    it('o Tab que chega numa vaga monta o cartão e entra nele (no primeiro botão; voltando, no último)', async () => {
      await open('/extras/dicionario');
      const place = places()[900];
      const vaga = place.querySelector<HTMLElement>('.vaga-verbete')!;
      expect(vaga.tabIndex).toBe(0);
      // (o teclado: a vaga ganha o foco com o anel; um clique na vaga só a monta)
      const realMatches = Element.prototype.matches;
      const byKeyboard = spyOn(Element.prototype, 'matches').and.callFake(function (this: Element, sel: string) {
        return sel === ':focus-visible' || realMatches.call(this, sel);
      });
      vaga.dispatchEvent(new FocusEvent('focus', { relatedTarget: places()[899] }));
      await until(() => !!place.querySelector('.verbete') && place.contains(document.activeElement), 'montado, com o foco dentro');
      expect(document.activeElement!.classList).toContain('palavra');
      // voltando (Shift+Tab, vindo de depois): o último botão do cartão
      const back = places()[1100];
      const vaga2 = back.querySelector<HTMLElement>('.vaga-verbete')!;
      vaga2.dispatchEvent(new FocusEvent('focus', { relatedTarget: places()[1101] }));
      await until(() => !!back.querySelector('.verbete') && back.contains(document.activeElement), 'montado, voltando');
      const stops = [...back.querySelectorAll<HTMLElement>('button')];
      expect(document.activeElement).toBe(stops.at(-1)!);
      // um clique (sem o anel do teclado): monta, e o foco fica onde estava
      byKeyboard.and.callThrough();
      const clicked = places()[1300];
      const focused = document.activeElement;
      // (o clique é numa vaga na tela, antes de o observador montá-la)
      clicked.scrollIntoView({ block: 'center' });
      clicked.querySelector<HTMLElement>('.vaga-verbete')!.dispatchEvent(new FocusEvent('focus'));
      await until(() => !!clicked.querySelector('.verbete'), 'montado pelo clique');
      await settle();
      expect(document.activeElement).toBe(focused);
    });

    it('trocar a ordem monta na hora o que ficou na tela, sem uma tela de vagas', async () => {
      await open('/extras/dicionario');
      places()[0].scrollIntoView({ block: 'start' });
      await until(() => !!places()[0].querySelector('.verbete'), 'a primeira, na tela');
      await harness.navigateByUrl('/extras/dicionario?ordem=portugues', DictionaryPage);
      await harness.fixture.whenStable();
      // sem esperar quadro nenhum: a primeira da ordem nova (outra palavra no mesmo lugar) já vem montada
      const first = places()[0];
      expect(first.querySelector('.verbete')).withContext('a primeira da ordem nova').not.toBeNull();
      expect(first.querySelector('.verbete .sentido')!.textContent!.trim()).toBe(sortWords(dictionaryWords().words, 'meaning', 'asc')[0].meaning);
    });
      it('na Tabela, as linhas longe da caixa que rola são vagas da altura delas; rolando, montam sem mudar a largura', async () => {
      await open('/extras/dicionario?vista=tabela');
      const box = host.querySelector<HTMLElement>('.razao')!;
      const rows = () => [...host.querySelectorAll<HTMLTableRowElement>('tbody tr')];
      expect(rows().length).toBe(1450);
      box.scrollIntoView({ block: 'start' });
      await until(() => !!rows()[0].querySelector('.c-palavra'), 'a primeira, na caixa');
      const last = rows().at(-1)!;
      const vaga = last.querySelector<HTMLTableCellElement>('.linha-vaga')!;
      expect(vaga).withContext('a última, longe').not.toBeNull();
      expect(vaga.colSpan).toBe(16);
      const w = dictionaryWords().words.find((x) => x.order === 1450)!;
      expect(vaga.textContent!.replace(/\s+/g, ' ').trim()).toBe(`${w.text}, ${w.meaning}`);
      expect(Math.abs(last.getBoundingClientRect().height - tableRowGuess(w))).toBeLessThanOrEqual(1);
      expect(host.querySelectorAll('tbody .c-palavra').length).toBeLessThan(200);
      const width = host.querySelector('table')!.offsetWidth;
      // no meio da caixa: a linha monta, com a altura perto do palpite (no máximo uma linha de texto a mais ou a menos)
      const row = rows()[700];
      box.scrollTop = row.offsetTop - box.clientHeight / 2;
      await until(() => !!row.querySelector('.c-palavra'), 'montada perto da caixa');
      const word = dictionaryWords().words.find((x) => x.order === 701)!;
      expect(Math.abs(row.getBoundingClientRect().height - tableRowGuess(word))).toBeLessThanOrEqual(21);
      expect(host.querySelector('table')!.offsetWidth).withContext('a largura não muda').toBe(width);
      // de volta ao alto: a linha volta a ser vaga, com a altura que tinha montada
      const real = row.getBoundingClientRect().height;
      box.scrollTop = 0;
      await until(() => !row.querySelector('.c-palavra'), 'longe de novo');
      expect(row.getBoundingClientRect().height).toBeCloseTo(real, 0);
    });
});
});
