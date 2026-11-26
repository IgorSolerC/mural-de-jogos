import type { Word, WordExample } from './dictionary';
import { foldJa } from './kana';

/**
 * As conjugações dos verbos do Dicionário Japonês (PLANO-CONJUGACOES.md): as formas da nota 行く→ Ir do dono, nos
 * grupos e com as etiquetas dela, para qualquer verbo do dicionário. Saem de uma regra (o grupo do verbo e a última
 * sílaba), não de dados: nada vai para o CSV, o armazenamento ou a nuvem. Puro.
 */

/** As formas, na ordem da nota. */
export type FormId =
  | 'dic'
  | 'masu'
  | 'nai'
  | 'masen'
  | 'ta'
  | 'mashita'
  | 'nakatta'
  | 'masendeshita'
  | 'te'
  | 'nakute'
  | 'naide'
  | 'tai'
  | 'takunai'
  | 'takatta'
  | 'ou'
  | 'mashou'
  | 'eru'
  | 'emasu'
  | 'enai'
  | 'emasen'
  | 'areru'
  | 'aremasu'
  | 'aseru'
  | 'asemasu'
  | 'aserareru'
  | 'asareru'
  | 'aseraremasu'
  | 'meirei'
  | 'nasai'
  | 'ba'
  | 'nakereba'
  | 'tara'
  | 'nakattara';

export type ConjGroupId = 'basicos' | 'te' | 'desejo' | 'modais' | 'condicionais';

/** Uma forma: as etiquetas da nota, para que serve (genérico e impessoal) e um exemplo, com a forma entre [ ]. */
export interface FormDef {
  id: FormId;
  group: ConjGroupId;
  /** "Passado • Polido • Afirmativo", como na nota. */
  tags: string;
  use: string;
  example: WordExample;
}

const ex = (ja: string, pt: string): WordExample => ({ ja, pt });

export const FORMS: readonly FormDef[] = [
  // ===== Tempos básicos =====
  {
    id: 'dic',
    group: 'basicos',
    tags: 'Presente/Futuro • Informal • Afirmativo',
    use: 'A forma de dicionário. Na fala casual, diz o que alguém faz ou vai fazer, agora ou no futuro. Também vem antes de substantivos (食べる人 = quem come) e é a base de muitas construções.',
    example: ex('明日、映画を[見る]。', 'Amanhã vou ver um filme.'),
  },
  {
    id: 'masu',
    group: 'basicos',
    tags: 'Presente/Futuro • Polido • Afirmativo',
    use: 'A versão polida da forma de dicionário: o padrão com desconhecidos, no trabalho, com superiores e em situações formais.',
    example: ex('毎朝コーヒーを[飲みます]。', 'Todas as manhãs tomo café.'),
  },
  {
    id: 'nai',
    group: 'basicos',
    tags: 'Presente/Futuro • Informal • Negativo',
    use: 'A negação casual: alguém não faz ou não vai fazer. Também recusa um convite de forma direta e vem antes de substantivos (来ない人 = quem não vem).',
    example: ex('今日はテレビを[見ない]。', 'Hoje não vou ver televisão.'),
  },
  {
    id: 'masen',
    group: 'basicos',
    tags: 'Presente/Futuro • Polido • Negativo',
    use: 'A negação polida: recusa um convite ou informa que não faz, mantendo a educação.',
    example: ex('お酒は[飲みません]。', 'Não bebo álcool.'),
  },
  {
    id: 'ta',
    group: 'basicos',
    tags: 'Passado • Informal • Afirmativo',
    use: 'O passado casual: fez, aconteceu. Também vem antes de substantivos (読んだ本 = o livro que li) e forma 〜たことがある (já ter feito algo).',
    example: ex('昨日、ラーメンを[食べた]。', 'Ontem comi ramen.'),
  },
  {
    id: 'mashita',
    group: 'basicos',
    tags: 'Passado • Polido • Afirmativo',
    use: 'O passado polido: conta com educação o que aconteceu, em conversas formais, no trabalho ou com quem não se tem intimidade.',
    example: ex('先週、京都に[行きました]。', 'Na semana passada fui a Kyoto.'),
  },
  {
    id: 'nakatta',
    group: 'basicos',
    tags: 'Passado • Informal • Negativo',
    use: 'O passado negativo casual: não fez, não aconteceu. O ない conjuga como adjetivo-i e vira なかった.',
    example: ex('今朝は朝ごはんを[食べなかった]。', 'Hoje de manhã não tomei café da manhã.'),
  },
  {
    id: 'masendeshita',
    group: 'basicos',
    tags: 'Passado • Polido • Negativo',
    use: 'O passado negativo polido: explica com educação que algo não aconteceu. É ません + でした, mas funciona como uma forma só.',
    example: ex('昨日はどこにも[行きませんでした]。', 'Ontem não fui a lugar nenhum.'),
  },
  // ===== Forma -te =====
  {
    id: 'te',
    group: 'te',
    tags: 'Forma -te • Afirmativo • Sequência/Pedido',
    use: 'A forma que liga: ações em sequência ("fez isso e aquilo"), a base dos pedidos (〜てください) e de várias construções (〜ている, 〜てもいい, 〜てから).',
    example: ex('ちょっと[待って]ください。', 'Espere um pouco, por favor.'),
  },
  {
    id: 'nakute',
    group: 'te',
    tags: 'Forma -te • Negativo • Causa/Dispensa',
    use: 'Responde a "por quê?": por não fazer. Aparece em 〜なくてもいい (não precisa fazer) e 〜なくてはいけない (tem que fazer). Nunca serve para pedidos.',
    example: ex('明日は[来なくて]もいいよ。', 'Amanhã não precisa vir.'),
  },
  {
    id: 'naide',
    group: 'te',
    tags: 'Forma -te • Negativo • Modo/Pedido',
    use: 'Responde a "como?": sem fazer, em vez de fazer. É também o pedido para alguém não fazer: sozinha é casual, com 〜ください fica polida.',
    example: ex('ここで写真を[撮らないで]ください。', 'Por favor, não tire fotos aqui.'),
  },
  // ===== Desejativa =====
  {
    id: 'tai',
    group: 'desejo',
    tags: 'Desejativa • Informal • Afirmativo',
    use: 'O desejo de quem fala ("quero fazer"), ou a pergunta pelo desejo de quem ouve. Conjuga como adjetivo-i; para o desejo de outra pessoa, usa-se 〜たがる.',
    example: ex('いつか日本に[行きたい]。', 'Um dia quero ir ao Japão.'),
  },
  {
    id: 'takunai',
    group: 'desejo',
    tags: 'Desejativa • Informal • Negativo',
    use: 'Diz que não se tem vontade de fazer. Muito usado para reclamar ou mostrar preguiça.',
    example: ex('今日は何も[したくない]。', 'Hoje não quero fazer nada.'),
  },
  {
    id: 'takatta',
    group: 'desejo',
    tags: 'Desejativa • Informal • Passado',
    use: 'O desejo no passado: "queria fazer". Mostra arrependimento, frustração ou um sonho antigo.',
    example: ex('あの映画、[見たかった]なあ。', 'Eu queria ter visto aquele filme...'),
  },
  // ===== Formas modais e vozes =====
  {
    id: 'ou',
    group: 'modais',
    tags: 'Volitiva • Informal • Afirmativo',
    use: 'Usado para um convite ou uma sugestão casual ("vamos!"). Com 〜と思う, diz a intenção ("penso em fazer").',
    example: ex('みんな、[食べよう]！', 'Pessoal, vamos comer!'),
  },
  {
    id: 'mashou',
    group: 'modais',
    tags: 'Volitiva • Polido • Afirmativo',
    use: 'O convite ou a sugestão polida ("vamos"). Com か no fim, vira uma proposta: "vamos?" ou "quer que eu faça?".',
    example: ex('そろそろ[帰りましょう]。', 'Já está na hora, vamos voltar.'),
  },
  {
    id: 'eru',
    group: 'modais',
    tags: 'Potencial • Informal • Afirmativo',
    use: 'A capacidade ou a possibilidade: "consegue fazer", "dá para fazer". O objeto costuma vir com が.',
    example: ex('漢字が少し[読める]。', 'Consigo ler um pouco de kanji.'),
  },
  {
    id: 'emasu',
    group: 'modais',
    tags: 'Potencial • Polido • Afirmativo',
    use: 'A versão polida do potencial: confirma o que se consegue fazer ou pergunta se é possível.',
    example: ex('日本語が[話せます]か。', 'Você consegue falar japonês?'),
  },
  {
    id: 'enai',
    group: 'modais',
    tags: 'Potencial • Informal • Negativo',
    use: 'A impossibilidade: "não consegue", "não pode fazer". É o jeito mais comum de recusar um convite por falta de condições.',
    example: ex('ごめん、今日は[行けない]。', 'Desculpa, hoje não posso ir.'),
  },
  {
    id: 'emasen',
    group: 'modais',
    tags: 'Potencial • Polido • Negativo',
    use: 'A versão polida da impossibilidade: recusa com educação ou diz que não é possível.',
    example: ex('この川では[泳げません]。', 'Neste rio não dá para nadar.'),
  },
  {
    id: 'areru',
    group: 'modais',
    tags: 'Passiva • Informal • Afirmativo',
    use: 'A voz passiva: alguém sofre a ação. Serve também para a passiva de incômodo (a ação de outro prejudica quem fala) e, com superiores, como um respeito leve.',
    example: ex('毎朝、母に[起こされる]。', 'Toda manhã sou acordado pela minha mãe.'),
  },
  {
    id: 'aremasu',
    group: 'modais',
    tags: 'Passiva • Polido • Afirmativo',
    use: 'A versão polida da passiva. Muito usada como respeito, para falar da ação de um superior ou de um cliente.',
    example: ex('社長は明日、大阪へ[行かれます]。', 'O presidente irá a Osaka amanhã.'),
  },
  {
    id: 'aseru',
    group: 'modais',
    tags: 'Causativa • Informal • Afirmativo',
    use: 'Fazer alguém fazer (obrigar) ou deixar alguém fazer (permitir). O contexto decide qual dos dois.',
    example: ex('子どもに野菜を[食べさせる]。', 'Faço as crianças comerem verduras.'),
  },
  {
    id: 'asemasu',
    group: 'modais',
    tags: 'Causativa • Polido • Afirmativo',
    use: 'A versão polida da causativa. Comum no trabalho, para dizer que vai mandar alguém fazer algo.',
    example: ex('後で田中に[電話させます]。', 'Depois peço para o Tanaka ligar.'),
  },
  {
    id: 'aserareru',
    group: 'modais',
    tags: 'Causativa-passiva • Informal • Afirmativo',
    use: 'Ser obrigado a fazer, normalmente contra a vontade. Carrega um tom de reclamação.',
    example: ex('毎週、母に部屋を[掃除させられる]。', 'Toda semana minha mãe me obriga a limpar o quarto.'),
  },
  {
    id: 'asareru',
    group: 'modais',
    tags: 'Causativa-passiva • Coloquial • Contraída',
    use: 'A versão contraída de 〜せられる, mais comum na fala. Só existe nos verbos do Grupo 1 (godan) que não terminam em す.',
    example: ex('飲み会でいつもお酒を[飲まされる]。', 'Nas confraternizações sempre sou obrigado a beber.'),
  },
  {
    id: 'aseraremasu',
    group: 'modais',
    tags: 'Causativa-passiva • Polido • Afirmativo',
    use: 'A versão polida da causativa-passiva: conta com educação uma obrigação imposta por outra pessoa.',
    example: ex('新人は毎朝、早く[来させられます]。', 'Os novatos são obrigados a chegar cedo toda manhã.'),
  },
  {
    id: 'meirei',
    group: 'modais',
    tags: 'Imperativa • Informal • Afirmativo',
    use: 'A ordem direta e brusca. Soa agressiva no dia a dia, mas é comum em torcidas, esportes, placas, mangás e animes.',
    example: ex('早く[逃げろ]！', 'Fuja logo!'),
  },
  {
    id: 'nasai',
    group: 'modais',
    tags: 'Imperativa • Firme • Afirmativo',
    use: 'A ordem com autoridade, mas sem grosseria. É típica de pais para filhos e de professores para alunos.',
    example: ex('もう遅いから、早く[寝なさい]。', 'Já é tarde, vá dormir logo.'),
  },
  // ===== Condicionais =====
  {
    id: 'ba',
    group: 'condicionais',
    tags: 'Condicional -ba • Neutro • Afirmativo',
    use: 'A condição geral ou lógica: "se fizer...". Também aparece em 〜ばいい ("basta fazer") e 〜ばよかった ("devia ter feito").',
    example: ex('この薬を[飲めば]、すぐ治るよ。', 'Se tomar este remédio, logo sara.'),
  },
  {
    id: 'nakereba',
    group: 'condicionais',
    tags: 'Condicional -ba • Neutro • Negativo',
    use: 'A condição negativa: "se não fizer...". É a base de 〜なければならない ("ter que fazer").',
    example: ex('明日は早く[起きなければ]ならない。', 'Amanhã tenho que acordar cedo.'),
  },
  {
    id: 'tara',
    group: 'condicionais',
    tags: 'Condicional -tara • Neutro • Afirmativo',
    use: '"Se" ou "quando fizer": uma condição pontual ou uma ação depois da outra. Também sugere algo (〜たらどう？ = "que tal?").',
    example: ex('家に[帰ったら]、電話するね。', 'Quando eu chegar em casa, eu ligo.'),
  },
  {
    id: 'nakattara',
    group: 'condicionais',
    tags: 'Condicional -tara • Neutro • Negativo',
    use: '"Se não fizer" ou "se não tivesse feito": vale para hipóteses futuras e para situações passadas imaginadas.',
    example: ex('雨が[降らなかったら]、公園に行こう。', 'Se não chover, vamos ao parque.'),
  },
];

export const FORM_BY_ID: ReadonlyMap<FormId, FormDef> = new Map(FORMS.map((f) => [f.id, f]));

/** Uma linha da tabela: o nome (e o detalhe dele) e as formas, uma por coluna do grupo (null: a coluna fica vazia). */
export interface ConjRow {
  label: string;
  sub?: string;
  cells: readonly (FormId | null)[];
}

/** Um grupo da tabela: o nome da nota, as colunas (nenhuma: uma forma por linha) e as linhas. */
export interface ConjGroup {
  id: ConjGroupId;
  title: string;
  /** O nome curto, para o índice da folha. */
  short: string;
  cols: readonly string[];
  rows: readonly ConjRow[];
}

/**
 * A tabela consolidada (PLANO-CONJUGACOES.md, 2): os pares informal/polido lado a lado, que é como a conjugação se
 * lê; as formas sem par, uma por linha. A imperativa firme (なさい) fica na coluna da polida, com a etiqueta dela.
 */
export const CONJ_TABLE: readonly ConjGroup[] = [
  {
    id: 'basicos',
    title: 'Tempos básicos',
    short: 'Tempos básicos',
    cols: ['Informal', 'Polido'],
    rows: [
      { label: 'Presente/Futuro', sub: 'afirmativo', cells: ['dic', 'masu'] },
      { label: 'Presente/Futuro', sub: 'negativo', cells: ['nai', 'masen'] },
      { label: 'Passado', sub: 'afirmativo', cells: ['ta', 'mashita'] },
      { label: 'Passado', sub: 'negativo', cells: ['nakatta', 'masendeshita'] },
    ],
  },
  {
    id: 'te',
    title: 'Forma -te',
    short: 'Forma -te',
    cols: [],
    rows: [
      { label: 'Afirmativa', sub: 'sequência, pedido', cells: ['te'] },
      { label: 'Negativa', sub: 'causa, dispensa', cells: ['nakute'] },
      { label: 'Negativa', sub: 'modo, pedido', cells: ['naide'] },
    ],
  },
  {
    id: 'desejo',
    title: 'Desejativa',
    short: 'Desejativa',
    cols: [],
    rows: [
      { label: 'Afirmativa', cells: ['tai'] },
      { label: 'Negativa', cells: ['takunai'] },
      { label: 'Passado', cells: ['takatta'] },
    ],
  },
  {
    id: 'modais',
    title: 'Formas modais e vozes',
    short: 'Modais e vozes',
    cols: ['Informal', 'Polido'],
    rows: [
      { label: 'Volitiva', sub: 'convite', cells: ['ou', 'mashou'] },
      { label: 'Potencial', sub: 'afirmativo', cells: ['eru', 'emasu'] },
      { label: 'Potencial', sub: 'negativo', cells: ['enai', 'emasen'] },
      { label: 'Passiva', cells: ['areru', 'aremasu'] },
      { label: 'Causativa', cells: ['aseru', 'asemasu'] },
      { label: 'Causativa-passiva', cells: ['aserareru', 'aseraremasu'] },
      { label: 'Causativa-passiva', sub: 'contraída', cells: ['asareru', null] },
      { label: 'Imperativa', cells: ['meirei', 'nasai'] },
    ],
  },
  {
    id: 'condicionais',
    title: 'Condicionais',
    short: 'Condicionais',
    cols: ['Afirmativa', 'Negativa'],
    rows: [
      { label: 'Condicional -ba', cells: ['ba', 'nakereba'] },
      { label: 'Condicional -tara', cells: ['tara', 'nakattara'] },
    ],
  },
];

/* ===================== As regras ===================== */

/** O que se acrescenta ao radical em cada forma; null: a forma não existe (ou não se usa) neste verbo. */
type Endings = Record<FormId, string | null>;

/** As colunas do silabário de cada final de godan (a, i, e, o) e a forma -te. */
const GODAN_ROWS: Readonly<Record<string, readonly [string, string, string, string, string]>> = {
  う: ['わ', 'い', 'え', 'お', 'って'],
  く: ['か', 'き', 'け', 'こ', 'いて'],
  ぐ: ['が', 'ぎ', 'げ', 'ご', 'いで'],
  す: ['さ', 'し', 'せ', 'そ', 'して'],
  つ: ['た', 'ち', 'て', 'と', 'って'],
  ぬ: ['な', 'に', 'ね', 'の', 'んで'],
  ぶ: ['ば', 'び', 'べ', 'ぼ', 'んで'],
  む: ['ま', 'み', 'め', 'も', 'んで'],
  る: ['ら', 'り', 'れ', 'ろ', 'って'],
};

/** O passado sai da forma -te: て → た, で → だ. */
const pastOf = (te: string) => te.replace(/て$/, 'た').replace(/で$/, 'だ');

function godan(last: string, te?: string): Endings | null {
  const row = GODAN_ROWS[last];
  if (!row) return null;
  const [a, i, e, o] = row;
  const t = te ?? row[4];
  const ta = pastOf(t);
  return {
    dic: last,
    masu: i + 'ます',
    nai: a + 'ない',
    masen: i + 'ません',
    ta,
    mashita: i + 'ました',
    nakatta: a + 'なかった',
    masendeshita: i + 'ませんでした',
    te: t,
    nakute: a + 'なくて',
    naide: a + 'ないで',
    tai: i + 'たい',
    takunai: i + 'たくない',
    takatta: i + 'たかった',
    ou: o + 'う',
    mashou: i + 'ましょう',
    eru: e + 'る',
    emasu: e + 'ます',
    enai: e + 'ない',
    emasen: e + 'ません',
    areru: a + 'れる',
    aremasu: a + 'れます',
    aseru: a + 'せる',
    asemasu: a + 'せます',
    aserareru: a + 'せられる',
    // a contraída não existe nos que terminam em す (話さされる não se diz)
    asareru: last === 'す' ? null : a + 'される',
    aseraremasu: a + 'せられます',
    meirei: e,
    nasai: i + 'なさい',
    ba: e + 'ば',
    nakereba: a + 'なければ',
    tara: ta + 'ら',
    nakattara: a + 'なかったら',
  };
}

/** Os ichidan: tudo vai depois do radical sem o る (食べ). */
const ICHIDAN: Endings = {
  dic: 'る',
  masu: 'ます',
  nai: 'ない',
  masen: 'ません',
  ta: 'た',
  mashita: 'ました',
  nakatta: 'なかった',
  masendeshita: 'ませんでした',
  te: 'て',
  nakute: 'なくて',
  naide: 'ないで',
  tai: 'たい',
  takunai: 'たくない',
  takatta: 'たかった',
  ou: 'よう',
  mashou: 'ましょう',
  eru: 'られる',
  emasu: 'られます',
  enai: 'られない',
  emasen: 'られません',
  areru: 'られる',
  aremasu: 'られます',
  aseru: 'させる',
  asemasu: 'させます',
  aserareru: 'させられる',
  asareru: null,
  aseraremasu: 'させられます',
  meirei: 'ろ',
  nasai: 'なさい',
  ba: 'れば',
  nakereba: 'なければ',
  tara: 'たら',
  nakattara: 'なかったら',
};

/** する inteiro (e os verbos com する: 勉強 + しない). O potencial é できる. */
const SURU: Endings = {
  dic: 'する',
  masu: 'します',
  nai: 'しない',
  masen: 'しません',
  ta: 'した',
  mashita: 'しました',
  nakatta: 'しなかった',
  masendeshita: 'しませんでした',
  te: 'して',
  nakute: 'しなくて',
  naide: 'しないで',
  tai: 'したい',
  takunai: 'したくない',
  takatta: 'したかった',
  ou: 'しよう',
  mashou: 'しましょう',
  eru: 'できる',
  emasu: 'できます',
  enai: 'できない',
  emasen: 'できません',
  areru: 'される',
  aremasu: 'されます',
  aseru: 'させる',
  asemasu: 'させます',
  aserareru: 'させられる',
  asareru: null,
  aseraremasu: 'させられます',
  meirei: 'しろ',
  nasai: 'しなさい',
  ba: 'すれば',
  nakereba: 'しなければ',
  tara: 'したら',
  nakattara: 'しなかったら',
};

/** 来る inteiro, em kana (com kanji, o 来 fica no lugar do primeiro kana: 来ない = こない). */
const KURU: Endings = {
  dic: 'くる',
  masu: 'きます',
  nai: 'こない',
  masen: 'きません',
  ta: 'きた',
  mashita: 'きました',
  nakatta: 'こなかった',
  masendeshita: 'きませんでした',
  te: 'きて',
  nakute: 'こなくて',
  naide: 'こないで',
  tai: 'きたい',
  takunai: 'きたくない',
  takatta: 'きたかった',
  ou: 'こよう',
  mashou: 'きましょう',
  eru: 'こられる',
  emasu: 'こられます',
  enai: 'こられない',
  emasen: 'こられません',
  areru: 'こられる',
  aremasu: 'こられます',
  aseru: 'こさせる',
  asemasu: 'こさせます',
  aserareru: 'こさせられる',
  asareru: null,
  aseraremasu: 'こさせられます',
  meirei: 'こい',
  nasai: 'きなさい',
  ba: 'くれば',
  nakereba: 'こなければ',
  tara: 'きたら',
  nakattara: 'こなかったら',
};

const POTENTIAL: readonly FormId[] = ['eru', 'emasu', 'enai', 'emasen'];
const PASSIVE_CAUSATIVE: readonly FormId[] = ['areru', 'aremasu', 'aseru', 'asemasu', 'aserareru', 'asareru', 'aseraremasu'];

/**
 * As exceções de verdade, pela leitura: o que muda (uma forma inteira, sem o radical) e o que não se usa. Os verbos
 * que já são potenciais (できる, 分かる, 見える, 聞こえる) não têm potencial; ある nega com ない; os honoríficos em
 * 〜aru fazem 〜います e a ordem em 〜い; くれる manda com くれ.
 */
interface Quirk {
  /** A forma inteira, no lugar da regra (em kana; a escrita é igual, só tem kana). */
  whole?: Partial<Record<FormId, string>>;
  /** O que vai depois do radical, no lugar da regra. */
  ending?: Partial<Record<FormId, string>>;
  unused?: readonly FormId[];
}

const HONORIFIC_I: Partial<Record<FormId, string>> = {
  masu: 'います',
  masen: 'いません',
  mashita: 'いました',
  masendeshita: 'いませんでした',
  mashou: 'いましょう',
  meirei: 'い',
};

const QUIRKS: Readonly<Record<string, Quirk>> = {
  ある: {
    whole: { nai: 'ない', nakatta: 'なかった', nakute: 'なくて', naide: 'ないで', nakereba: 'なければ', nakattara: 'なかったら' },
    unused: [...POTENTIAL, ...PASSIVE_CAUSATIVE, 'nasai'],
  },
  できる: { unused: POTENTIAL },
  わかる: { unused: POTENTIAL },
  みえる: { unused: POTENTIAL },
  きこえる: { unused: POTENTIAL },
  くれる: { ending: { meirei: '' }, unused: [...POTENTIAL, ...PASSIVE_CAUSATIVE] },
  いらっしゃる: { ending: HONORIFIC_I },
  おっしゃる: { ending: HONORIFIC_I },
  くださる: { ending: HONORIFIC_I },
  なさる: { ending: HONORIFIC_I },
  // ござる vive quase só como ございます: o resto não se usa
  ござる: {
    ending: HONORIFIC_I,
    unused: ['nai', 'ta', 'nakatta', 'te', 'nakute', 'naide', 'tai', 'takunai', 'takatta', 'ou', ...POTENTIAL, ...PASSIVE_CAUSATIVE, 'meirei', 'nasai', 'ba', 'nakereba', 'tara', 'nakattara'],
  },
};

/** O 要る (いる, "precisar"), godan: ele também não tem potencial. O いる "estar" é ichidan e tem. */
const IRU_NEED: Quirk = { unused: POTENTIAL };

/** Uma forma de um verbo: a escrita (com kanji, quando o verbo tem) e a leitura em kana. */
export interface Conjugated {
  form: FormDef;
  text: string;
  reading: string;
}

/** As formas de um verbo, na ordem da nota; null onde a forma não se usa. */
export type Conjugation = ReadonlyMap<FormId, Conjugated | null>;

/** O verbo conjuga: é da classe verbo e tem o grupo (godan, ichidan ou irregular). */
export function isConjugable(w: Word): boolean {
  return w.wordClass === 'verbo' && !!w.verbGroup && !!conjugate(w);
}

const cache = new WeakMap<Word, Conjugation | null>();

/** As formas do verbo (null quando a palavra não é um verbo que a regra conhece). Feitas uma vez por palavra. */
export function conjugate(w: Word): Conjugation | null {
  if (cache.has(w)) return cache.get(w)!;
  const out = conjugateNow(w);
  cache.set(w, out);
  return out;
}

function conjugateNow(w: Word): Conjugation | null {
  if (w.wordClass !== 'verbo' || !w.verbGroup) return null;
  const text = w.text.trim();
  const reading = (w.reading || w.text).trim();
  let endings: Endings | null = null;
  let cut = 1;
  if (reading.endsWith('する') && text.endsWith('する')) {
    endings = SURU;
    cut = 2;
  } else if (w.verbGroup.startsWith('irregular') && reading.endsWith('くる')) {
    return kuru(text, reading);
  } else if (w.verbGroup === 'ichidan' && reading.endsWith('る') && text.endsWith('る')) {
    endings = ICHIDAN;
  } else if (w.verbGroup === 'godan') {
    const last = reading.at(-1)!;
    if (text.at(-1) !== last) return null;
    // 行く faz って (行って, 行った); o resto dos 〜く faz いて
    const iku = reading.endsWith('いく') && (text.endsWith('行く') || text === 'いく');
    endings = godan(last, iku ? 'って' : undefined);
  }
  if (!endings) return null;
  const quirk: Quirk | undefined = reading === 'いる' && w.verbGroup === 'godan' ? IRU_NEED : QUIRKS[reading];
  const textStem = text.slice(0, -cut);
  const readStem = reading.slice(0, -cut);
  const out = new Map<FormId, Conjugated | null>();
  for (const form of FORMS) {
    if (quirk?.unused?.includes(form.id)) {
      out.set(form.id, null);
      continue;
    }
    const whole = quirk?.whole?.[form.id];
    if (whole) {
      out.set(form.id, { form, text: whole, reading: whole });
      continue;
    }
    const end = quirk?.ending?.[form.id] ?? endings[form.id];
    out.set(form.id, end === null ? null : { form, text: textStem + end, reading: readStem + end });
  }
  return out;
}

/** 来る (e o que termina nele): as formas em kana, com o 来 no lugar do primeiro kana quando a escrita tem kanji. */
function kuru(text: string, reading: string): Conjugation {
  const kanji = text.endsWith('来る');
  const textStem = text.slice(0, -2);
  const readStem = reading.slice(0, -2);
  const out = new Map<FormId, Conjugated | null>();
  for (const form of FORMS) {
    const end = KURU[form.id];
    if (end === null) out.set(form.id, null);
    else out.set(form.id, { form, text: textStem + (kanji ? '来' + end.slice(1) : end), reading: readStem + end });
  }
  return out;
}

/** As formas conjugadas do verbo, dobradas para a busca (katakana = hiragana), sem a de dicionário (a palavra já é). */
export function conjugatedKeys(w: Word): string[] {
  const c = conjugate(w);
  if (!c) return [];
  const keys = new Set<string>();
  for (const f of c.values()) {
    if (!f || f.form.id === 'dic') continue;
    keys.add(foldJa(f.text));
    keys.add(foldJa(f.reading));
  }
  return [...keys];
}

/**
 * A forma do verbo que um texto é, inteiro (行かなかった, いかなかった, イカナカッタ), ou null. A de dicionário não
 * conta: ela é a própria palavra. Das que se escrevem igual (a passiva e o potencial dos ichidan: 食べられる), a
 * primeira na ordem da nota.
 */
export function formOf(w: Word, raw: string): Conjugated | null {
  const c = conjugate(w);
  const t = foldJa(raw.trim());
  if (!c || !t) return null;
  for (const f of c.values()) if (f && f.form.id !== 'dic' && (foldJa(f.text) === t || foldJa(f.reading) === t)) return f;
  return null;
}

/**
 * A escrita de uma forma em dois pedaços, para a folha pintar o que muda: o radical que ela tem em comum com a forma
 * de dicionário (行) e o resto (かない). Em ある → ない, tudo muda.
 */
export function formParts(dic: string, form: string): [string, string] {
  const limit = Math.max(0, Math.min(dic.length - 1, form.length));
  let n = 0;
  while (n < limit && dic[n] === form[n]) n++;
  return [form.slice(0, n), form.slice(n)];
}

/** O grupo do verbo, como a folha diz: "Grupo 1 · godan". */
export function groupSaid(verbGroup: string | null): string {
  if (!verbGroup) return '';
  if (verbGroup === 'godan') return 'Grupo 1 · godan';
  if (verbGroup === 'ichidan') return 'Grupo 2 · ichidan';
  return 'Grupo 3 · irregular';
}
