import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RichText } from './rich-text';
import { Sentence, StudySentence, findAgain, maxSpeech, rangesOf, rangesOfChars, sentenceAt, sentencesOf, wordsBySentence } from './voz-frases';

const PT = { lang: 'pt-BR', max: maxSpeech('pt-BR') };
const JA = { lang: 'ja-JP', max: maxSpeech('ja-JP') };

function html(markup: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = markup;
  document.body.appendChild(el);
  return el;
}

const texts = (list: readonly Sentence[]) => list.map((s) => s.text);

describe('as frases para ler em voz alta', () => {
  it('o tamanho da fala cabe em uns 10 segundos: o de 0,75× de 0,75× para cima, menor abaixo', () => {
    expect([1.5, 1, 0.75, 0.5, 0.25].map((r) => maxSpeech('pt-BR', r))).toEqual([120, 120, 120, 80, 40]);
    expect([1, 0.5, 0.25].map((r) => maxSpeech('ja-JP', r))).toEqual([50, 33, 17]);
    expect(maxSpeech('en-GB')).toBe(120);
  });

  let host: HTMLElement | null = null;
  afterEach(() => {
    host?.remove();
    host = null;
    document.querySelectorAll('app-rich-text').forEach((e) => e.remove());
  });

  async function rich(text: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({ imports: [RichText], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RichText);
    fixture.componentRef.setInput('text', text);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  it('a nota de japonês: o que a folha mostra, sem as marcas, uma frase por linha', async () => {
    const el = await rich(
      [
        '# の ((no))',
        'De (((posse))) / Liga dois substantivos',
        '',
        '> [!estudo|cartolina] USOS',
        '> 1. 私**==の==**ケーキです。',
        '>   ((É o meu bolo.))',
        '> 2. あなた**==の==**コーヒーはどこですか？',
        '>   ((Cadê o seu café?))',
        '',
        '### Origem',
        'É uma partícula nativa do japonês, sem kanji.',
      ].join('\n'),
    );
    expect(texts(sentencesOf([el], JA))).toEqual([
      'の no',
      'De (posse) / Liga dois substantivos',
      'USOS',
      '私のケーキです。',
      'É o meu bolo.',
      'あなたのコーヒーはどこですか？',
      'Cadê o seu café?',
      'Origem',
      'É uma partícula nativa do japonês, sem kanji.',
    ]);
  });

  it('o marca-texto pega a frase inteira, passando pelo negrito e pela marca do meio', async () => {
    const el = await rich('私**==の==**ケーキです。あなたは？');
    const list = sentencesOf([el], JA);
    expect(texts(list)).toEqual(['私のケーキです。', 'あなたは？']);
    expect(rangesOf(list[0]).map((r) => r.toString()).join('')).toBe('私のケーキです。');
    expect(rangesOf(list[0]).length).toBe(3);
  });

  it('duas frases na mesma linha se separam; os espaços das pontas não entram no marca-texto', () => {
    host = html('<div class="linha">  Bom dia.   Tudo bem?  </div>');
    const list = sentencesOf([host], PT);
    expect(texts(list)).toEqual(['Bom dia.', 'Tudo bem?']);
    expect(rangesOf(list[1])[0].toString()).toBe('Tudo bem?');
  });

  it('o nome da ficha vem antes do texto, e uma linha nunca emenda na outra', () => {
    host = html('<h2>Palavras</h2><div class="texto"><div class="linha">sem ponto</div><div class="linha">outra linha</div></div>');
    const [title, text] = [host.querySelector('h2')!, host.querySelector('.texto')!];
    expect(texts(sentencesOf([title, text], PT))).toEqual(['Palavras', 'sem ponto', 'outra linha']);
  });

  it('não lê o que só o leitor de tela ouve, o spoiler fechado, os botões, os widgets, o card fechado e o escondido pelo CSS', () => {
    host = html(
      [
        '<div class="linha"><span class="sr-only">A fazer:</span>comprar pão</div>',
        '<div class="linha">o fim: <span class="spoiler"><span class="spoiler-texto" inert>ele morre</span></span>.</div>',
        '<div class="linha"><button>3 tarefas feitas</button></div>',
        '<app-note-widget><span>Faltam 3 dias</span></app-note-widget>',
        '<details><summary class="linha">Dica</summary><div class="linha">escondida</div></details>',
        '<div class="linha" style="display: none">sumida</div>',
        '<div class="linha"><span aria-hidden="true">js</span>fim</div>',
      ].join(''),
    );
    expect(texts(sentencesOf([host], PT))).toEqual(['comprar pão', 'o fim: .', 'Dica', 'fim']);
    // o spoiler revelado e o card aberto entram
    host.querySelector('.spoiler-texto')!.removeAttribute('inert');
    host.querySelector('details')!.open = true;
    expect(texts(sentencesOf([host], PT))).toEqual(['comprar pão', 'o fim: ele morre.', 'Dica', 'escondida', 'fim']);
  });

  it('a conversa de japonês (cards que fecham, com o rōmaji e a tradução em spoiler): só o que está à mostra', async () => {
    const card = (who: string, line: string, romaji: string, pt: string, open = false) =>
      [`> [!cartolina]${open ? '+' : '-'} **${who}:** ${line}`, '> ### Romaji', `> ||${romaji}||`, '> ### Tradução', `> ||${pt}||`].join('\n');
    const el = await rich(
      [
        '### O diálogo',
        card('A', 'こんにちは！私のケーキはどこですか？', 'Konnichiwa! Watashi no keeki wa doko desu ka?', 'Oi! Cadê o meu bolo?'),
        '',
        card('B', 'すみません…昨日、学生とケーキを食べました。', 'Sumimasen... kinou, gakusei to keeki wo tabemashita.', 'Desculpe... ontem comi o bolo com o estudante.', true),
      ].join('\n'),
    );
    // o card fechado: só o título; o aberto: os títulos de dentro, mas os spoilers fechados não
    expect(texts(sentencesOf([el], JA))).toEqual(['O diálogo', 'A: こんにちは！', '私のケーキはどこですか？', 'B: すみません…昨日、学生とケーキを食べました。', 'Romaji', 'Tradução']);
    // revelada a tradução, ela entra
    const spoilers = [...el.querySelectorAll<HTMLElement>('.spoiler')];
    spoilers[spoilers.length - 1].click();
    await new Promise((r) => setTimeout(r));
    expect(texts(sentencesOf([el], JA))).toContain('Desculpe... ontem comi o bolo com o estudante.');
    expect(texts(sentencesOf([el], JA))).not.toContain('Sumimasen... kinou, gakusei to keeki wo tabemashita.');
  });

  it('a tabela, célula por célula; o código, linha por linha', async () => {
    const el = await rich(['| Português | Japonês |', '| --- | --- |', '| Bom dia | おはよう |', '', '```', 'A: こんにちは', 'B: はい', '```'].join('\n'));
    expect(texts(sentencesOf([el], JA))).toEqual(['Português', 'Japonês', 'Bom dia', 'おはよう', 'A: こんにちは', 'B: はい']);
  });

  it('o que não tem letra nem número não vira fala', () => {
    host = html('<div class="linha">→</div><div class="linha">… ---</div><div class="linha">ok</div>');
    expect(texts(sentencesOf([host], PT))).toEqual(['ok']);
  });

  it('a frase longa se parte na vírgula; sem vírgula, no espaço; o japonês sem pontuação, numa palavra', () => {
    const longa = 'Ao criar novas conversas com as palavras da tabela de hoje, utilize todas as palavras da tabela mais nova e tente usar mais as novas para fixar melhor na mente';
    host = html(`<div class="linha">${longa}.</div>`);
    const pt = sentencesOf([host], PT);
    expect(texts(pt)).toEqual(['Ao criar novas conversas com as palavras da tabela de hoje,', 'utilize todas as palavras da tabela mais nova e tente usar mais as novas para fixar melhor na mente.']);
    // o espaço depois da vírgula não entra no marca-texto
    expect(rangesOf(pt[0]).map((r) => r.toString()).join('')).toBe(pt[0].text);

    // a vírgula cedo demais (a fala ficaria curtinha) não conta: parte no último espaço que cabe
    host.remove();
    const semVirgula = 'Ah, ' + 'palavra '.repeat(30).trim();
    host = html(`<div class="linha">${semVirgula}</div>`);
    const espaco = sentencesOf([host], PT);
    expect(espaco[0].text.startsWith('Ah, palavra')).toBeTrue();
    expect(espaco.every((s) => s.text.length <= PT.max && !s.text.startsWith('alavra'))).toBeTrue();
    expect(espaco.map((s) => s.text).join(' ')).toBe(semVirgula);

    host.remove();
    const japones = '私は毎朝カフェでコーヒーを飲みますが今日は友達と一緒にスーパーでパンとケーキを買ってから家で晩ごはんを食べる予定です';
    host = html(`<div class="linha">${japones}。</div>`);
    const ja = sentencesOf([host], JA);
    expect(ja.length).toBeGreaterThan(1);
    expect(ja.every((s) => s.text.length <= JA.max)).toBeTrue();
    expect(ja.map((s) => s.text).join('')).toBe(`${japones}。`);

    // o corte no máximo (uma palavra só, sem espaço nem vírgula) nunca parte um caractere de dois
    // pedaços: a letra matemática 𝐚 tem dois, e o "a" na frente desalinha o máximo no meio de uma
    host.remove();
    const palavra = 'a' + '𝐚'.repeat(100);
    host = html(`<div class="linha">${palavra}</div>`);
    const raro = sentencesOf([host], PT);
    expect(raro.length).toBeGreaterThan(1);
    // (o encodeURIComponent recusa um pedaço solto de caractere)
    expect(() => raro.forEach((s) => encodeURIComponent(s.text))).not.toThrow();
    expect(raro.map((s) => s.text).join('')).toBe(palavra);
  });

  it('a frase de onde a pessoa tocou (as pontas contam); no espaço entre duas, a de depois; depois da última, nenhuma', () => {
    host = html('<div class="linha">Bom dia. Tudo bem?</div><div class="linha"><b>Um.</b> <i>Dois.</i></div>');
    const list = sentencesOf([host], PT);
    const node = host.querySelector('.linha')!.firstChild!;
    expect(sentenceAt(list, node, 2)).toBe(0);
    // a metade direita do ponto final: o ponto depois dele, ainda na frase
    expect(sentenceAt(list, node, 8)).toBe(0);
    expect(sentenceAt(list, node, 9)).toBe(1);
    expect(sentenceAt(list, node, 18)).toBe(1);
    // o espaço que é um nó só dele, entre o negrito e o itálico
    const gap = host.querySelector('b')!.nextSibling!;
    expect(sentenceAt(list, gap, 0)).toBe(3);
    expect(sentenceAt(list, host, host.childNodes.length)).toBe(-1);
  });

  it('a nota mudou no meio da leitura: a mesma frase mais perto; sem ela, a mesma posição', () => {
    host = html('<div class="linha">Um. Dois. Um. Três.</div>');
    const list = sentencesOf([host], PT);
    expect(findAgain('Um.', 3, list)).toBe(2);
    expect(findAgain('Um.', 0, list)).toBe(0);
    expect(findAgain('Cinco.', 1, list)).toBe(1);
    expect(findAgain('Cinco.', 9, list)).toBe(3);
    expect(findAgain('Um.', 0, [])).toBe(-1);
  });

  it('a palavra que a voz avisa (as letras do texto falado, com os espaços juntos) na tela, passando pelo negrito', () => {
    host = html('<div class="linha">Bom   dia, <b>tu</b>do bem?</div>');
    const [s] = sentencesOf([host], PT);
    expect(s.text).toBe('Bom dia, tudo bem?');
    // "dia": os espaços seguidos contam um só
    expect(rangesOfChars(s, 4, 7).map((r) => r.toString())).toEqual(['dia']);
    // "tudo": metade no negrito, metade fora
    expect(rangesOfChars(s, 9, 13).map((r) => r.toString())).toEqual(['tu', 'do']);
    expect(rangesOfChars(s, 40, 50)).toEqual([]);
  });

  it('o trecho que saiu da folha não vira marca-texto', () => {
    host = html('<div class="linha">Bom dia.</div>');
    const [s] = sentencesOf([host], PT);
    host.querySelector('.linha')!.textContent = 'outra';
    expect(rangesOf(s)).toEqual([]);
  });

  /** As palavras de cada frase, como texto. */
  const words = (list: StudySentence[]) => list.map((s) => s.words.map((pieces) => rangesOf({ pieces }).map((r) => r.toString()).join('')));

  it('o modo estudo: as palavras juntas pela frase; o ponto, a linha, a célula e a linha do código acabam a frase', async () => {
    host = html('<div class="linha">私のケーキです。あなたは？</div><div class="linha">Cadê o <b>ca</b>fé? Aqui, olha</div><div class="linha">sem ponto</div>');
    expect(words(wordsBySentence([host], 'ja-JP'))).toEqual([['私', 'の', 'ケーキ', 'です'], ['あなた', 'は'], ['Cadê', 'o', 'café'], ['Aqui', 'olha'], ['sem', 'ponto']]);
    host.remove();
    const el = await rich(['| Bom dia | おはよう |', '| --- | --- |', '| a | b |', '', '```', 'A: こんにちは', 'B: はい', '```'].join('\n'));
    expect(words(wordsBySentence([el], 'ja-JP'))).toEqual([['Bom', 'dia'], ['おはよう'], ['a'], ['b'], ['A', 'こんにちは'], ['B', 'はい']]);
  });

  it('o modo estudo: a frase longa não se parte pelo tamanho da fala (a velocidade não muda o que se revela)', () => {
    const long = Array.from({ length: 40 }, (_, i) => `palavra${i}`).join(' ') + '.';
    host = html(`<div class="linha">${long}</div>`);
    expect(sentencesOf([host], { lang: 'pt-BR', max: maxSpeech('pt-BR', 0.25) }).length).toBeGreaterThan(1);
    const list = wordsBySentence([host], 'pt-BR');
    expect(list.length).toBe(1);
    expect(list[0].words.length).toBe(40);
    expect(list[0].text).toBe(long);
  });
});
