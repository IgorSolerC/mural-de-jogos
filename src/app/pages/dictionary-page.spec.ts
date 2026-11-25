import { provideZonelessChangeDetection, signal } from '@angular/core';
import { CloudAccount } from '../core/cloud-account';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DICT_MARKS_KEY } from '../core/dictionary/marks-store';
import { dictionaryWords } from '../core/dictionary/words';
import { NEAR_TUNING, NearPool, setEverythingNear } from '../ui/near-screen';
import { entryHeightGuess } from '../ui/word-entry';
import { DictionaryPage } from './dictionary-page';

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

  it('mostra as 1449 palavras na ordem de estudo, em seções pela importância', async () => {
    await open('/extras/dicionario');
    expect(host.querySelectorAll('.verbete').length).toBe(1449);
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
    expect(host.querySelector('.achados')!.textContent).toContain(`Mostrando ${words().length} de 1449 palavras`);
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
    expect(host.querySelectorAll('.verbete').length).toBe(1449);
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
    expect(words().length).toBe(117);
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

  it('a Tabela tem todas as colunas, e a cabeça ordena', async () => {
    await open('/extras/dicionario?vista=tabela');
    expect(host.querySelector('.verbete')).toBeNull();
    expect(host.querySelectorAll('tbody tr').length).toBe(1449);
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
      expect(places().length).toBe(1449);
      // as do alto já montadas na primeira pintura, as do pé ainda vagas
      expect(places()[0].querySelector('.verbete')).withContext('a primeira, na tela').not.toBeNull();
      const last = places().at(-1)!;
      const vaga = last.querySelector<HTMLElement>('.vaga-verbete')!;
      expect(vaga).withContext('a última, longe').not.toBeNull();
      expect(host.querySelectorAll('.verbete').length).toBeLessThan(200);
      const w = dictionaryWords().words.find((x) => x.order === 1449)!;
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

    it('trocar a ordem monta na hora o que ficou na tela, sem uma tela de vagas', async () => {
      await open('/extras/dicionario');
      await harness.navigateByUrl('/extras/dicionario?ordem=portugues', DictionaryPage);
      await harness.fixture.whenStable();
      const first = places()[0];
      expect(first.querySelector('.verbete')).withContext('a primeira da ordem nova').not.toBeNull();
    });
  });
});
