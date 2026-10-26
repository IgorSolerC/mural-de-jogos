import { fold } from './text';
import {
  Entry,
  Flow,
  MAX_INSTALLMENTS,
  MAX_PEOPLE,
  ME,
  NEED_WORDS,
  PERSON_NAME_MAX,
  Need,
  PayMethod,
  SpendingCategory,
  SpendingPerson,
  Shift,
  TITLE_MAX,
  dayIn,
  isDay,
  monthOfDay,
  parseMoney,
  shiftMonth,
  suggestions,
  titleKey,
} from './spending';

/**
 * A linha de anotar dos Gastos: um gasto escrito como se fala, numa linha só, vira um lançamento.
 *
 *   ifood 44,90                 → Ifood, R$ 44,90, saída (a categoria e o pagamento do último Ifood)
 *   violão 10x 139,90           → parcelado em 10 de R$ 139,90, a primeira neste mês
 *   violão 7/10 139,90          → a 7ª de 10 parcelas (a primeira foi 6 meses atrás)
 *   salário +4559 fixo          → entrada, todo mês
 *   uber 23 pix ontem #transporte
 *   cinema 38 #luxo               → e se precisava: #luxo, #conforto, #indispensável
 *   jantar 600 @bruna @biel       → com quem foi (você está sempre, a não ser que tire no adesivo)
 *
 * Nada aqui adivinha em silêncio: o que foi entendido volta em `Quick` e a linha mostra, em adesivos que
 * se trocam com um toque, antes de lançar.
 */

/** Uma pessoa do gasto: uma do livro (`id`) ou uma nova, escrita agora (`id` null, criada ao lançar). */
export interface PersonRef {
  id: string | null;
  name: string;
}

export interface Quick {
  title: string;
  /** Em centavos; null enquanto não há valor. */
  amount: number | null;
  flow: Flow;
  category: string;
  pay?: PayMethod;
  /** Saída: se precisava (a escrita, ou a do mesmo gasto lançado antes). */
  need?: Need;
  /** Saída: com quem foi, quando não é só você (você primeiro, depois as escritas com @). */
  people?: PersonRef[];
  /** Uma vez ou parcelado: conta no mês de antes ou no de depois do dia (escolhido no adesivo). */
  shift?: Shift;
  /** Parcelado: quantas parcelas. */
  installments?: number;
  /** Parcelado: qual parcela é a deste mês (1 é a primeira). */
  part?: number;
  monthly?: true;
  /** O dia do lançamento (no parcelado, o da primeira parcela). */
  date: string;
  /** De onde veio a categoria: do mesmo gasto lançado antes, do nome escrito, ou nenhuma (a de sempre). */
  from: 'historico' | 'escrita' | 'padrao';
}

export interface QuickContext {
  entries: readonly Entry[];
  categories: readonly SpendingCategory[];
  /** As pessoas do livro (para achar "@bru"); sem elas, toda pessoa escrita é nova. */
  people?: readonly SpendingPerson[];
  /** Hoje, 'AAAA-MM-DD'. */
  today: string;
  /** O mês aberto na página. */
  month: string;
}

const PIX = new Set(['pix']);
const AVISTA = new Set(['avista', 'vista', 'debito', 'dinheiro', 'especie', 'credito', 'cartao']);
const FIXO = new Set(['fixo', 'fixa', 'mensal', 'mensalmente']);
const IN = new Set(['recebi', 'entrou', 'ganhei', 'entrada']);
const OUT = new Set(['gastei', 'paguei', 'saiu', 'saida', 'comprei']);
/** Palavras que só ligam as outras ("10x de 139", "em 3x", "no pix"): saem do nome quando sobram ao lado de uma marca. */
const GLUE = new Set(['de', 'em', 'no', 'na', 'a', 'à', 'por', 'pelo', 'pela']);

/** O dia de `n` dias antes. */
function daysBefore(day: string, n: number): string {
  const d = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) - n));
  return d.toISOString().slice(0, 10);
}

/** A primeira letra em maiúscula (o resto como foi escrito). */
function capFirst(s: string): string {
  return s ? s[0].toLocaleUpperCase('pt-BR') + s.slice(1) : s;
}

/** A categoria pelo nome escrito ("comida", "#merc", "item"), em qualquer direção. */
function categoryByName(word: string, categories: readonly SpendingCategory[]): SpendingCategory | undefined {
  const w = fold(word.replace(/^#/, ''));
  if (w.length < 3) return undefined;
  return (
    categories.find((c) => fold(c.name) === w) ??
    categories.find((c) => fold(c.name).split(/[\/\s]+/).includes(w)) ??
    (word.startsWith('#') ? categories.find((c) => fold(c.name).startsWith(w)) : undefined)
  );
}

/** Os nomes de quem estava, curtos para caber num adesivo: "Eu, Bruna", "Eu +2". */
export function peopleText(refs: readonly PersonRef[]): string {
  const names = refs.map((r) => r.name);
  const all = names.join(', ');
  return names.length <= 2 && all.length <= 20 ? all : `${names[0]} +${names.length - 1}`;
}

/**
 * A pessoa escrita depois do @ ("@bruna", "@Bru", "@ana_paula"): a do livro com esse nome, ou a única cujo
 * nome começa assim (com 3 letras ou mais); senão, uma pessoa nova com o nome escrito.
 */
function personByName(word: string, people: readonly SpendingPerson[]): PersonRef | null {
  const name = word.replace(/^@+/, '').replace(/[.,;:!]+$/, '').replace(/_+/g, ' ').trim().slice(0, PERSON_NAME_MAX);
  const w = fold(name);
  if (!w) return null;
  const same = people.find((p) => fold(p.name) === w);
  if (same) return { id: same.id, name: same.name };
  const starts = w.length >= 3 ? people.filter((p) => fold(p.name).startsWith(w)) : [];
  if (starts.length === 1) return { id: starts[0].id, name: starts[0].name };
  return { id: null, name: capFirst(name) };
}

export function readQuick(text: string, ctx: QuickContext): Quick {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const used = new Array<boolean>(tokens.length).fill(false);
  let amount: number | null = null;
  let sign: Flow | null = null;
  let installments: number | undefined;
  let part: number | undefined;
  let pay: PayMethod | undefined;
  let monthly = false;
  let date: string | null = null;
  let named: SpendingCategory | undefined;
  let need: Need | undefined;
  const mentioned: PersonRef[] = [];
  /** Onde estava o "pix": numa entrada ele é o nome ("Pix da Bru"), não o pagamento. */
  let pixAt = -1;

  const take = (i: number) => (used[i] = true);
  const word = (i: number) => fold(tokens[i] ?? '').replace(/[.,;:!]+$/, '');

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const w = word(i);
    // parcelas: "10x", "x10", "10 x"
    let m = /^(\d{1,2})x$/i.exec(raw) ?? /^x(\d{1,2})$/i.exec(raw);
    if (m || (/^\d{1,2}$/.test(raw) && word(i + 1) === 'x')) {
      const n = Number(m ? m[1] : raw);
      if (n >= 2 && n <= MAX_INSTALLMENTS) {
        installments = n;
        take(i);
        if (!m) take(i + 1);
        if (GLUE.has(word(i - 1))) take(i - 1);
        if (word(i + (m ? 1 : 2)) === 'de') take(i + (m ? 1 : 2));
        continue;
      }
    }
    // a parcela de agora: "7/10", "(7/10)"
    m = /^\(?(\d{1,2})\/(\d{1,2})\)?$/.exec(raw);
    if (m && word(i - 1) !== 'dia') {
      const k = Number(m[1]);
      const n = Number(m[2]);
      if (n >= 2 && n <= MAX_INSTALLMENTS && k >= 1 && k <= n) {
        installments = n;
        part = k;
        take(i);
        continue;
      }
    }
    // o dia: hoje, ontem, anteontem, "dia 5", "dia 5/10", "05/10/2026"
    if (w === 'hoje' || w === 'ontem' || w === 'anteontem') {
      date = daysBefore(ctx.today, w === 'hoje' ? 0 : w === 'ontem' ? 1 : 2);
      take(i);
      continue;
    }
    if (w === 'dia' && /^\d{1,2}(\/\d{1,2}(\/\d{2,4})?)?$/.test(tokens[i + 1] ?? '')) {
      const [d, mo, y] = tokens[i + 1].split('/').map(Number);
      const month = mo ? `${y ? (y < 100 ? 2000 + y : y) : ctx.month.slice(0, 4)}-${String(mo).padStart(2, '0')}` : ctx.month;
      const day = `${month}-${String(d).padStart(2, '0')}`;
      if (isDay(day)) {
        date = day;
        take(i);
        take(i + 1);
        continue;
      }
    }
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
    if (m) {
      const day = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      if (isDay(day)) {
        date = day;
        take(i);
        continue;
      }
    }
    // como pagou
    if (PIX.has(w)) {
      pay = 'pix';
      pixAt = i;
      take(i);
      if (GLUE.has(word(i - 1))) take(i - 1);
      continue;
    }
    if (AVISTA.has(w) || (w === 'a' && word(i + 1) === 'vista')) {
      pay = 'avista';
      take(i);
      if (w === 'a') take(i + 1);
      if (GLUE.has(word(i - 1))) take(i - 1);
      continue;
    }
    if (w === 'parcelado' || w === 'parcelada') {
      pay = 'parcelado';
      take(i);
      continue;
    }
    // todo mês
    if (FIXO.has(w) || (w === 'todo' && (word(i + 1) === 'mes' || word(i + 1) === 'mês'))) {
      monthly = true;
      take(i);
      if (w === 'todo') take(i + 1);
      continue;
    }
    if (IN.has(w)) {
      sign = 'entrada';
      take(i);
      continue;
    }
    if (OUT.has(w)) {
      sign = 'saida';
      take(i);
      continue;
    }
    // com quem foi: "@bruna"
    if (/^@\S/.test(raw)) {
      const ref = personByName(raw, ctx.people ?? []);
      if (ref) {
        mentioned.push(ref);
        take(i);
        continue;
      }
    }
    // a categoria marcada ("#comida") ou se precisava ("#luxo"); uma categoria com o mesmo nome vale mais
    if (raw.startsWith('#')) {
      const tag = fold(raw.slice(1)).replace(/[.,;:!]+$/, '');
      if (NEED_WORDS[tag] && !ctx.categories.some((c) => fold(c.name) === tag)) {
        need = NEED_WORDS[tag];
        take(i);
        continue;
      }
      const c = categoryByName(raw, ctx.categories);
      if (c) {
        named = c;
        take(i);
        continue;
      }
    }
  }

  // o valor: o último número que sobrou ("+4559", "R$ 44,90", "-12")
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (used[i]) continue;
    let raw = tokens[i];
    if (/^r\$$/i.test(raw)) continue;
    const s = raw[0] === '+' ? 'entrada' : raw[0] === '-' || raw[0] === '−' ? 'saida' : null;
    if (s) raw = raw.slice(1);
    if (!/^(r\$)?\d[\d.,]*$/i.test(raw)) continue;
    const cents = parseMoney(raw);
    if (cents === null) continue;
    amount = cents;
    if (s) sign = s;
    take(i);
    if (/^r\$$/i.test(tokens[i - 1] ?? '')) take(i - 1);
    break;
  }

  // o que sobrou é o nome; uma palavra de ligação solta nas pontas sai
  const nameOf = () => {
    const rest = tokens.filter((_, i) => !used[i]);
    while (rest.length && GLUE.has(fold(rest[rest.length - 1]))) rest.pop();
    while (rest.length > 1 && GLUE.has(fold(rest[0]))) rest.shift();
    return rest;
  };
  let rest = nameOf();
  // uma palavra que é o nome de uma categoria vale como ela, mas fica no nome
  const namedIn = (words: string[]) => {
    for (const t of words) {
      const c = categoryByName(t, ctx.categories);
      if (c) return c;
    }
    return undefined;
  };
  named ??= namedIn(rest);
  let title = capFirst(rest.join(' ').slice(0, TITLE_MAX));

  // o mesmo gasto, lançado antes: a categoria, o pagamento e a direção dele
  const key = titleKey(title);
  const before = key ? suggestions(ctx.entries, title, 12).find((s) => titleKey(s.title) === key) : undefined;
  const byName = new Map(ctx.categories.map((c) => [c.id, c]));
  const flow: Flow = sign ?? before?.flow ?? named?.flow ?? 'saida';
  // numa entrada, o "pix" é de onde veio o dinheiro (a categoria Pix), e fica no nome
  if (flow === 'entrada' && pixAt >= 0) {
    used[pixAt] = false;
    rest = nameOf();
    title = capFirst(rest.join(' ').slice(0, TITLE_MAX));
    if (!named || named.flow !== 'entrada') named = namedIn(rest);
  }
  let from: Quick['from'] = 'padrao';
  let category = flow === 'saida' ? 'outros' : 'outras-entradas';
  if (named && named.flow === flow) {
    category = named.id;
    from = 'escrita';
  } else if (before && before.flow === flow && byName.has(before.category)) {
    category = before.category;
    from = 'historico';
  }
  if (flow === 'saida') {
    if (installments) pay = 'parcelado';
    else if (pay === 'parcelado') installments = 2;
    else pay ??= before?.pay ?? 'avista';
    if (before?.flow === 'saida') need ??= before.need;
  } else {
    mentioned.length = 0;
    need = undefined;
    pay = undefined;
    installments = undefined;
    part = undefined;
  }
  if (monthly) {
    installments = undefined;
    part = undefined;
    if (pay === 'parcelado') pay = 'avista';
  }

  // o dia: o escrito; senão hoje, se hoje é do mês aberto, ou o mesmo dia no mês aberto
  let day = date ?? (monthOfDay(ctx.today) === ctx.month ? ctx.today : dayIn(ctx.month, ctx.today));
  // a 7ª de 10 neste mês: o lançamento começa 6 meses antes
  if (installments && part && part > 1) day = dayIn(shiftMonth(monthOfDay(day), -(part - 1)), day);

  // você está em todo gasto (tirar é no adesivo); as escritas vêm depois, uma vez cada
  const people: PersonRef[] = [{ id: ME, name: ctx.people?.find((p) => p.id === ME)?.name ?? 'Eu' }];
  for (const m of mentioned) {
    const seen = people.some((p) => (m.id ? p.id === m.id : !p.id && fold(p.name) === fold(m.name)));
    if (!seen && people.length < MAX_PEOPLE) people.push(m);
  }

  return {
    title,
    amount,
    flow,
    category,
    ...(pay ? { pay } : {}),
    ...(need ? { need } : {}),
    ...(people.length > 1 ? { people } : {}),
    ...(installments ? { installments, part: part ?? 1 } : {}),
    ...(monthly ? { monthly: true as const } : {}),
    date: day,
    from,
  };
}

/**
 * O lançamento que a linha vai criar (sem o id nem as datas de criação). As pessoas novas (sem id) ficam de
 * fora: quem lança as cria antes (`SpendingStore.addPerson`) e passa os ids.
 */
export function quickToEntry(q: Quick): Omit<Entry, 'id' | 'createdAt' | 'at'> | null {
  if (!q.title || !q.amount) return null;
  const people = q.flow === 'saida' ? (q.people ?? []).flatMap((p) => (p.id ? [p.id] : [])) : [];
  return {
    title: q.title,
    amount: q.amount,
    flow: q.flow,
    category: q.category,
    ...(q.pay ? { pay: q.pay } : {}),
    ...(q.need && q.flow === 'saida' ? { need: q.need } : {}),
    ...(people.length && !(people.length === 1 && people[0] === ME) ? { people } : {}),
    ...(q.shift && !q.monthly ? { shift: q.shift } : {}),
    ...(q.installments ? { installments: q.installments } : {}),
    ...(q.monthly ? { monthly: true as const } : {}),
    date: q.date,
  };
}
