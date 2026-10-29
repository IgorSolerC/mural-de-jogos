import type { EnvelopeV1, LancamentoV1, PessoaV1 } from '../../../contrato/api-v1/gastos';
import {
  ENVELOPE_PADRAO,
  acharEnvelope,
  acharPessoa,
  conferirOpGasto,
  type CamposDoLancamento,
  type CriarEnvelopeV1,
  type EditarEnvelopeV1,
  type EditarLancamentoV1,
  type LancarV1,
  type OpGasto,
  type PessoaV1Escrita,
} from '../../../contrato/api-v1/operacoes-gastos';
import { andList } from './api-keys';
import { contextoGastosV1, envelopeV1, lancamentoV1 } from './api-mirror-spending';
import { ME, type Entry, type Flow, type SpendingState, money, monthOfDay, sanitizeEntry } from './spending';
import { quickToEntry, readQuick } from './spending-quick';
import type { SpendingStore } from './spending-store';

/**
 * Os pedidos dos Gastos aplicados pelo site (PLANO-API.md, 9.2; rodada 6), pelas mesmas funções da
 * tela: o lançamento pelo `SpendingStore.save` (e a frase pela linha de anotar, `readQuick` +
 * `quickToEntry`, com o histórico), envelopes e pessoas pelo `addCategory`/`saveCategory` e
 * `addPerson`/`savePerson`. Tudo passa por `sanitizeEntry`, como o que vem do armazenamento.
 */

export type SpendingResult = { lancamento: LancamentoV1 | null } | { envelope: EnvelopeV1 } | { pessoa: PessoaV1 } | { erro: string; lancamento?: LancamentoV1 };

export interface SpendingApplied {
  estado: 'aplicado' | 'conflito' | 'falhou';
  resultado: SpendingResult;
  /** O lançamento, o envelope ou a pessoa como era (o Desfazer); null no lançar e no criar. */
  antes: unknown;
  carimbo?: string;
  /** A versão de antes do carimbo (null: o pedido criou a coisa). */
  desde?: string | null;
}

/**
 * As mudanças feitas aqui por pedidos ainda não concluídos: `id@versão depois` → a versão de antes
 * (null: o pedido criou). Elas não contam como mudança de outra pessoa.
 */
export type RequestStamps = ReadonlyMap<string, string | null>;

/**
 * A versão `versao` que a AI leu chega à de agora (`current`) só por pedidos aplicados aqui? Então não
 * é conflito. Uma mudança da pessoa no meio quebra a corrente: aí a pessoa venceu, mesmo que um pedido
 * tenha mexido depois dela.
 */
export function onlyOwnSince(id: string, current: string, versao: string, stamps: RequestStamps): boolean {
  let v: string | null | undefined = current;
  // a corrente é curta (os pedidos de uma rodada); o teto só protege de uma roda
  for (let i = 0; i <= stamps.size && v; i++) {
    if (v === versao) return true;
    v = stamps.get(`${id}@${v}`);
  }
  return false;
}

export interface SpendingApplyContext {
  now: string;
  /** Hoje, `AAAA-MM-DD` (o dia de um lançamento que não diz qual). */
  today: string;
  /** As mudanças feitas aqui por pedidos (ver `RequestStamps`). */
  stamps: RequestStamps;
}

const failed = (erro: string, lancamento?: LancamentoV1): SpendingApplied => ({ estado: 'falhou', resultado: lancamento ? { erro, lancamento } : { erro }, antes: null });

/** O id que fica no lugar de um envelope ou pessoa a criar, enquanto o pedido só é conferido (`dry`). */
const TO_CREATE = 'a-criar';

/** O envelope (id) do pedido: o achado pelo nome, um criado agora (se pedido), ou o erro. */
function envelopeOf(store: SpendingStore, raw: string | undefined, flow: Flow, create: boolean, dry: boolean): string | { erro: string } {
  if (!raw) return ENVELOPE_PADRAO[flow];
  const st = store.state();
  const found = acharEnvelope(contextoGastosV1(st), raw);
  if (found) return found.tipo === flow ? found.id : { erro: `O envelope "${found.nome}" é de ${found.tipo === 'saida' ? 'saída' : 'entrada'}.` };
  if (!create) return { erro: `O envelope "${raw}" não existe. Os que existem: ${st.categories.filter((c) => c.flow === flow).map((c) => c.name).join(', ')}.` };
  return dry ? TO_CREATE : store.addCategory(raw, flow).id;
}

/** As pessoas (ids) do pedido: as achadas pelo nome, as criadas agora (se pedido), ou o erro. Só você: nada. */
function peopleOf(store: SpendingStore, names: readonly string[] | undefined, create: boolean, dry: boolean): string[] | undefined | { erro: string } {
  if (!names?.length) return undefined;
  const ids: string[] = [];
  for (const n of names) {
    const found = acharPessoa(contextoGastosV1(store.state()), n);
    if (found) ids.push(found.id);
    else if (create) ids.push(dry ? `${TO_CREATE}-${ids.length}` : store.addPerson(n).id);
    else return { erro: `Não há "${n}" nas pessoas dos Gastos. As que existem: ${store.state().people.map((p) => p.name).join(', ')}.` };
  }
  const unique = [...new Set(ids)];
  return unique.length === 1 && unique[0] === ME ? undefined : unique;
}

/**
 * O lançamento com os campos do pedido (no lançar, a partir de um em branco). Primeiro conferido sem
 * criar nada: só o pedido que vai entrar cria o envelope e as pessoas novas, e o que falha (o reembolso
 * de um gasto que não existe, um campo que não combina) não deixa nada para trás.
 */
function withFields(
  store: SpendingStore,
  base: Entry,
  c: CamposDoLancamento & { criar_envelope?: true; criar_pessoas?: true },
): Entry | { erro: string } {
  const tried = fieldsOn(store, base, c, true);
  if ('erro' in tried) return tried;
  if (!sanitizeEntry(tried)) return { erro: 'O lançamento não pôde ser gravado (algum campo não combina).' };
  return fieldsOn(store, base, c, false);
}

/** Os campos do pedido no lançamento; `dry`: sem criar o envelope e as pessoas novas (só conferir). */
function fieldsOn(
  store: SpendingStore,
  base: Entry,
  c: CamposDoLancamento & { criar_envelope?: true; criar_pessoas?: true },
  dry: boolean,
): Entry | { erro: string } {
  const flow = c.tipo ?? base.flow;
  const next: Entry = { ...base, flow };
  if (c.titulo !== undefined) next.title = c.titulo;
  if (c.centavos !== undefined) next.amount = c.centavos;
  if (c.envelope !== undefined || flow !== base.flow) {
    const cat = envelopeOf(store, c.envelope, flow, !!c.criar_envelope, dry);
    if (typeof cat !== 'string') return cat;
    next.category = cat;
  }
  if (c.dia !== undefined) next.date = c.dia;
  if (c.parcelas !== undefined) next.installments = c.parcelas;
  if (c.pagamento !== undefined) {
    next.pay = c.pagamento;
    if (c.pagamento !== 'parcelado' && c.parcelas === undefined) delete next.installments;
  }
  if (next.installments) next.pay = 'parcelado';
  if (c.precisava !== undefined) {
    if (c.precisava) next.need = c.precisava;
    else delete next.need;
  }
  if (c.pessoas !== undefined) {
    const people = peopleOf(store, c.pessoas, !!c.criar_pessoas, dry);
    if (people && !Array.isArray(people)) return people;
    if (people) next.people = people;
    else delete next.people;
  }
  if (c.fatura !== undefined) {
    if (c.fatura) next.shift = c.fatura;
    else delete next.shift;
  }
  if (c.mensal !== undefined) {
    if (c.mensal) {
      next.monthly = true;
      delete next.installments;
      delete next.shift;
    } else {
      delete next.monthly;
      delete next.until;
    }
  }
  if (c.ate !== undefined) {
    if (c.ate) next.until = c.ate;
    else delete next.until;
  }
  if (c.reembolso_de !== undefined) {
    if (c.reembolso_de) {
      const of = store.get(c.reembolso_de);
      if (!of || of.flow !== 'saida') return { erro: `Não achei o gasto ${c.reembolso_de} para o reembolso.` };
      next.refundOf = c.reembolso_de;
    } else delete next.refundOf;
  }
  if (flow === 'entrada') {
    delete next.pay;
    delete next.need;
    delete next.people;
    delete next.installments;
  } else if (!next.pay) next.pay = 'avista';
  return next;
}

/** Aplica um pedido dos Gastos e diz como foi. */
export function applySpendingRequest(store: SpendingStore, req: { op: string; alvo: string; dados: unknown }, ctx: SpendingApplyContext): SpendingApplied {
  const op = req.op as OpGasto;
  const checked = conferirOpGasto(op, req.dados);
  if (!checked.ok) return failed(`${checked.erro} (campo ${checked.campo})`);
  const v1 = (e: Entry) => lancamentoV1(e, store.state());
  /** Grava pelo `sanitizeEntry` (as conferências de sempre) e diz como ficou. */
  const save = (e: Entry, antes: Entry | null): SpendingApplied => {
    const clean = sanitizeEntry(e);
    if (!clean) return failed('O lançamento não pôde ser gravado (algum campo não combina).');
    store.save(clean);
    const after = store.get(clean.id) ?? clean;
    return { estado: 'aplicado', resultado: { lancamento: v1(after) }, antes, carimbo: after.at, desde: antes?.at ?? null };
  };

  switch (op) {
    case 'gasto.lancar': {
      // já entrou (aplicado aqui antes, numa aba que fechou sem concluir): o mesmo id, nada de novo
      const there = store.get(req.alvo);
      if (there) return { estado: 'aplicado', resultado: { lancamento: v1(there) }, antes: null };
      const d = checked.dados as LancarV1;
      const blank: Entry = { id: req.alvo, title: '', amount: 0, flow: 'saida', category: ENVELOPE_PADRAO.saida, date: ctx.today, createdAt: ctx.now, at: ctx.now };
      if ('frase' in d) {
        // a linha de anotar da tela: a categoria e o pagamento do mesmo gasto lançado antes, as pessoas com @
        const st: SpendingState = store.state();
        const q = readQuick(d.frase, { entries: st.entries, categories: st.categories, people: st.people, today: ctx.today, month: monthOfDay(ctx.today) });
        const newPeople = (q.people ?? []).filter((p) => !p.id);
        if (newPeople.length && !d.criar_pessoas) {
          return failed(`Não há ${newPeople.map((p) => `"${p.name}"`).join(', ')} nas pessoas dos Gastos. Mande "criar_pessoas": true para criar.`);
        }
        // conferida antes de criar as pessoas novas: a frase que não entra não deixa ninguém para trás
        const tried = quickToEntry(q);
        if (!tried) return failed(`Não entendi o valor em “${d.frase}”. Escreva como na linha de anotar: "mercado 230,50 ontem".`);
        if (!sanitizeEntry({ ...blank, ...tried })) return failed('O lançamento não pôde ser gravado (algum campo não combina).');
        const people = (q.people ?? []).map((p) => (p.id ? p : { id: store.addPerson(p.name).id, name: p.name }));
        return save({ ...blank, ...quickToEntry({ ...q, people })! }, null);
      }
      const next = withFields(store, blank, d);
      if ('erro' in next) return failed(next.erro);
      return save(next, null);
    }
    case 'gasto.editar':
    case 'gasto.apagar': {
      const before = store.get(req.alvo);
      if (!before) return failed('O lançamento não existe mais (foi apagado).');
      const versao = (checked.dados as { versao: string }).versao;
      // mudou depois que a AI leu (e não por um pedido dela aplicado aqui): a pessoa venceu
      if (!onlyOwnSince(before.id, before.at, versao, ctx.stamps)) {
        return { estado: 'conflito', resultado: { erro: 'O lançamento mudou depois que você o leu. Leia de novo e mande a versao nova.', lancamento: v1(before) }, antes: null };
      }
      if (op === 'gasto.apagar') {
        // a volta mora no pedido: o Desfazer põe o lançamento de antes de novo
        store.remove(before.id);
        return { estado: 'aplicado', resultado: { lancamento: null }, antes: before };
      }
      const { versao: _v, ...campos } = checked.dados as EditarLancamentoV1;
      const next = withFields(store, before, campos);
      if ('erro' in next) return failed(next.erro, v1(before));
      return save(next, before);
    }
    case 'envelope.criar': {
      const d = checked.dados as CriarEnvelopeV1;
      const c = store.addCategory(d.nome, d.tipo);
      if (d.limite_centavos !== undefined && d.tipo === 'saida' && (c.budget ?? null) !== d.limite_centavos) {
        const next = { ...c };
        if (d.limite_centavos === null) delete next.budget;
        else next.budget = d.limite_centavos;
        store.saveCategory(next);
      }
      const after = store.category(c.id) ?? c;
      return { estado: 'aplicado', resultado: { envelope: envelopeV1(after) }, antes: null };
    }
    case 'envelope.editar': {
      const before = store.category(req.alvo);
      if (!before) return failed('O envelope não existe mais.');
      const d = checked.dados as EditarEnvelopeV1;
      const next = { ...before, ...(d.nome ? { name: d.nome } : {}) };
      if (d.limite_centavos !== undefined && before.flow === 'saida') {
        if (d.limite_centavos === null) delete next.budget;
        else next.budget = d.limite_centavos;
      }
      store.saveCategory(next);
      return { estado: 'aplicado', resultado: { envelope: envelopeV1(store.category(before.id) ?? next) }, antes: before };
    }
    case 'pessoa.criar': {
      const p = store.addPerson((checked.dados as PessoaV1Escrita).nome);
      return { estado: 'aplicado', resultado: { pessoa: { id: p.id, nome: p.name, eu: p.id === ME } }, antes: null };
    }
    case 'pessoa.editar': {
      const before = store.person(req.alvo);
      if (!before) return failed('A pessoa não existe mais.');
      store.savePerson({ ...before, name: (checked.dados as PessoaV1Escrita).nome });
      const after = store.person(before.id)!;
      return { estado: 'aplicado', resultado: { pessoa: { id: after.id, nome: after.name, eu: after.id === ME } }, antes: before };
    }
    default:
      return failed('Este site não sabe aplicar esse pedido.');
  }
}

/** "R$ 230,50" a partir dos centavos. */
const reais = (cents: unknown) => (typeof cents === 'number' ? `R$ ${money(cents)}` : '');

const FIELD_WORDS: Record<string, string> = {
  titulo: 'o título',
  centavos: 'o valor',
  tipo: 'o tipo',
  envelope: 'o envelope',
  pagamento: 'o pagamento',
  parcelas: 'as parcelas',
  precisava: 'o Precisava?',
  pessoas: 'as pessoas',
  dia: 'o dia',
  fatura: 'o mês da fatura',
  mensal: 'o mensal',
  ate: 'até quando',
  reembolso_de: 'o reembolso',
};

/**
 * O pedido dos Gastos em palavras: "Lançar “Padaria”, R$ 18,50" (esperando) ou "lançou “Padaria”,
 * R$ 18,50" (no histórico, `past`). `title` é o nome do lançamento, do envelope ou da pessoa.
 */
export function spendingWords(op: string, dados: unknown, title: string, past = false): string | null {
  const d = (dados ?? {}) as Record<string, unknown>;
  const v = (now: string, then: string) => (past ? then : now);
  const t = `“${title}”`;
  switch (op) {
    case 'gasto.lancar': {
      if (typeof d['frase'] === 'string') return `${v('Lançar', 'lançou')} “${d['frase']}”`;
      const extra = [reais(d['centavos']), typeof d['parcelas'] === 'number' ? `em ${d['parcelas']}x` : '', d['mensal'] ? 'todo mês' : ''].filter(Boolean).join(' ');
      return `${v('Lançar', 'lançou')} ${d['tipo'] === 'entrada' ? 'a entrada ' : ''}${t}${extra ? `, ${extra}` : ''}`;
    }
    case 'gasto.editar': {
      const fields = Object.keys(FIELD_WORDS).filter((k) => d[k] !== undefined);
      const what = fields.length ? `${andList(fields.map((k) => FIELD_WORDS[k]!))} de ` : '';
      const value = d['centavos'] !== undefined ? ` (agora ${reais(d['centavos'])})` : '';
      return `${v('Mudar', 'mudou')} ${what}${t}${value}`;
    }
    case 'gasto.apagar':
      return `${v('Apagar', 'apagou')} o lançamento ${t}`;
    case 'envelope.criar':
      return `${v('Criar', 'criou')} o envelope ${t}`;
    case 'envelope.editar':
      return `${v('Mudar', 'mudou')} o envelope ${t}${d['nome'] ? ` (para “${d['nome']}”)` : ''}${d['limite_centavos'] !== undefined ? (d['limite_centavos'] === null ? ', sem limite' : `, limite de ${reais(d['limite_centavos'])}`) : ''}`;
    case 'pessoa.criar':
      return `${v('Pôr', 'pôs')} ${t} nas pessoas dos Gastos`;
    case 'pessoa.editar':
      return `${v('Mudar', 'mudou')} o nome de ${t} para “${String(d['nome'] ?? '')}”`;
    default:
      return null;
  }
}

/** O nome que a pessoa reconhece num pedido dos Gastos: o do pedido, o de agora, o de depois, o de antes. */
export function spendingTitle(store: SpendingStore, t: { op: string; alvo: string; dados: unknown; resultado?: unknown; antes?: unknown }): string {
  const d = (t.dados ?? {}) as Record<string, unknown>;
  const r = (t.resultado ?? {}) as { lancamento?: LancamentoV1 | null; envelope?: EnvelopeV1; pessoa?: PessoaV1 };
  if (t.op === 'gasto.lancar') return (d['titulo'] as string | undefined) ?? r.lancamento?.titulo ?? (d['frase'] as string | undefined) ?? 'um gasto';
  if (t.op === 'envelope.criar' || t.op === 'pessoa.criar') return (d['nome'] as string | undefined) ?? 'um nome';
  if (t.op.startsWith('envelope.')) return store.category(t.alvo)?.name ?? r.envelope?.nome ?? (t.antes as { name?: string } | null)?.name ?? 'um envelope';
  if (t.op.startsWith('pessoa.')) return (t.antes as { name?: string } | null)?.name ?? store.person(t.alvo)?.name ?? 'alguém';
  return store.get(t.alvo)?.title ?? r.lancamento?.titulo ?? (t.antes as Entry | null)?.title ?? 'um lançamento que não existe mais';
}

/**
 * Desfaz um pedido dos Gastos aplicado: o lançamento lançado sai, o mudado ou apagado volta como era
 * (carimbado agora, para valer nos outros aparelhos), o envelope e a pessoa mudados voltam ao nome de
 * antes. Criar envelope ou pessoa não tem volta por aqui (apaga-se na tela).
 */
export function undoSpending(store: SpendingStore, t: { op: string; alvo: string; antes?: unknown; resultado?: unknown }): void {
  if (t.op === 'gasto.lancar') {
    const id = ((t.resultado as { lancamento?: LancamentoV1 | null } | null)?.lancamento?.id ?? t.alvo) || t.alvo;
    store.remove(id);
    return;
  }
  if (t.op === 'gasto.editar' || t.op === 'gasto.apagar') {
    const before = sanitizeEntry(t.antes);
    if (before) store.restore(before);
    return;
  }
  if (t.op === 'envelope.editar') {
    const before = t.antes as { id?: string; name?: unknown; budget?: unknown } | null;
    const cur = before?.id ? store.category(before.id) : undefined;
    if (!cur || !before) return;
    // o nome e o limite de antes: sem limite antes, o que o pedido pôs sai (espalhar o de antes o deixava)
    const back = { ...cur, ...(typeof before.name === 'string' && before.name ? { name: before.name } : {}) };
    if (typeof before.budget === 'number') back.budget = before.budget;
    else delete back.budget;
    store.saveCategory(back);
    return;
  }
  if (t.op === 'pessoa.editar') {
    const before = t.antes as { id?: string; name?: string } | null;
    const cur = before?.id ? store.person(before.id) : undefined;
    if (cur && before?.name) store.savePerson({ ...cur, name: before.name });
  }
}
