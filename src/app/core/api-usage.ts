import { Desfecho, FALHAS } from '../../../contrato/uso-apis/contagem';
import { ALERTA, PLANO_GRATIS } from '../../../contrato/uso-apis/plano-gratis';
import { MedidoEm, SERVICOS, ServicoExterno } from '../../../contrato/uso-apis/servicos';
import { MONTHS_SHORT } from './dates';

/**
 * As contas da tela Uso das APIs (PLANO-ADMIN-APIS.md, seções 4 e 11): a API só entrega as linhas, e aqui se
 * decide o que elas querem dizer. Tudo puro: o "agora" é o da resposta, e nada olha o relógio do aparelho.
 */

const DAY_MS = 86_400_000;
/** A partir daqui, "perto do fim": o mesmo número da checagem diária. */
export const NEAR_END = ALERTA;
export const ALMOST_OUT = 0.9;
/** Quantas falhas seguidas, sem nenhuma resposta boa no meio, querem dizer que caiu. */
const DOWN_AFTER = 3;
const RECENT_MS = 3_600_000;
/** Com menos dias contados que isto, o ritmo do mês não diz nada. */
const PACE_MIN_DAYS = 7;

export interface UsageLine {
  dia: string;
  servico: string;
  operacao: string;
  medidoEm: string;
  desfecho: Desfecho;
  pedidos: number;
  msTotal: number;
  msMax: number;
  ultimoEm: string;
}

export interface UsageFailure {
  em: string;
  servico: string;
  operacao: string;
  medidoEm: string;
  desfecho: Desfecho;
  status: number | null;
  repeticoes: number;
}

export interface ApiUsage {
  geradoEm: string;
  contandoDesde: string | null;
  linhas: UsageLine[];
  falhas: UsageFailure[];
  proprias: { dia: string; linhasGravadas: number; cotaLinhas: number; imagens: { imagens: number; bytes: number; cota: number } | null };
}

/** O uso oficial na Cloudflare (a rota à parte): hoje e ontem, e cada Worker só hoje. */
export interface CloudflareReport {
  estado: 'ok' | 'sem-token' | 'fora';
  geradoEm: string;
  dias: { dia: string; pedidos: number; erros: number; cortados: number; linhasLidas: number; linhasGravadas: number }[];
  workers: { nome: string; pedidos: number; erros: number; cortados: number; cpuP99: number | null }[];
  bancos: { nome: string; bytes: number }[];
}

/** O que veio da rota da Cloudflare; o que não tem a forma certa é como se ela não tivesse respondido. */
export function parseCloudflare(raw: unknown): CloudflareReport {
  const r = (raw ?? {}) as Partial<CloudflareReport>;
  const estado = r.estado === 'ok' || r.estado === 'sem-token' ? r.estado : 'fora';
  return { estado, geradoEm: typeof r.geradoEm === 'string' ? r.geradoEm : '', dias: Array.isArray(r.dias) ? r.dias : [], workers: Array.isArray(r.workers) ? r.workers : [], bancos: Array.isArray(r.bancos) ? r.bancos : [] };
}

/** O que veio da API, sem confiar na forma: o que não tem a forma certa sai. */
export function parseUsage(raw: unknown): ApiUsage {
  const r = (raw ?? {}) as Record<string, unknown>;
  const linhas: UsageLine[] = (Array.isArray(r['linhas']) ? r['linhas'] : []).flatMap((l): UsageLine[] => {
    if (!Array.isArray(l) || l.length < 9) return [];
    const [dia, servico, operacao, medidoEm, desfecho, pedidos, msTotal, msMax, ultimoEm] = l as unknown[];
    if (typeof dia !== 'string' || typeof servico !== 'string' || typeof pedidos !== 'number') return [];
    return [{ dia, servico, operacao: String(operacao), medidoEm: String(medidoEm), desfecho: desfecho as Desfecho, pedidos, msTotal: Number(msTotal) || 0, msMax: Number(msMax) || 0, ultimoEm: String(ultimoEm) }];
  });
  const falhas = (Array.isArray(r['falhas']) ? r['falhas'] : []).filter((f): f is UsageFailure => !!f && typeof (f as UsageFailure).em === 'string' && typeof (f as UsageFailure).servico === 'string');
  const own = (r['proprias'] ?? {}) as Partial<ApiUsage['proprias']>;
  return {
    geradoEm: typeof r['geradoEm'] === 'string' ? r['geradoEm'] : new Date(0).toISOString(),
    contandoDesde: typeof r['contandoDesde'] === 'string' ? r['contandoDesde'] : null,
    linhas,
    falhas,
    proprias: { dia: own.dia ?? '', linhasGravadas: own.linhasGravadas ?? 0, cotaLinhas: own.cotaLinhas ?? 0, imagens: own.imagens ?? null },
  };
}

// ===== Os dias =====

const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const daysBack = (now: Date, n: number) => utcDay(new Date(now.getTime() - n * DAY_MS));
const firstOfMonth = (now: Date) => `${utcDay(now).slice(0, 7)}-01`;
const daysInMonth = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

// ===== Os totais de um serviço =====

export interface ServiceTotals {
  hoje: number;
  semana: number;
  trinta: number;
  mes: number;
  /** A parte que falhou nos últimos 7 dias, de 0 a 1; null sem nenhum pedido. */
  falhas: number | null;
  /** O tempo médio das respostas boas nos últimos 7 dias. */
  tempoMs: number | null;
  /** A última resposta boa e a última chamada de qualquer jeito (ISO). */
  ultimaBoa: string | null;
  ultima: string | null;
  ultimoDesfecho: Desfecho | null;
}

const GOOD: readonly Desfecho[] = ['ok', 'nao-achou'];

export function totalsOf(lines: readonly UsageLine[], now: Date): ServiceTotals {
  const today = utcDay(now);
  const week = daysBack(now, 6);
  const thirty = daysBack(now, 29);
  const month = firstOfMonth(now);
  const out: ServiceTotals = { hoje: 0, semana: 0, trinta: 0, mes: 0, falhas: null, tempoMs: null, ultimaBoa: null, ultima: null, ultimoDesfecho: null };
  let failed = 0;
  let okCount = 0;
  let okMs = 0;
  for (const l of lines) {
    // desistir de digitar não é chamada que conte, nem falha
    if (l.desfecho === 'cancelada') continue;
    if (l.dia === today) out.hoje += l.pedidos;
    if (l.dia >= week) out.semana += l.pedidos;
    if (l.dia >= thirty) out.trinta += l.pedidos;
    if (l.dia >= month) out.mes += l.pedidos;
    if (l.dia >= week && FALHAS.includes(l.desfecho)) failed += l.pedidos;
    if (l.dia >= week && l.desfecho === 'ok') {
      okCount += l.pedidos;
      okMs += l.msTotal;
    }
    if (GOOD.includes(l.desfecho) && (!out.ultimaBoa || l.ultimoEm > out.ultimaBoa)) out.ultimaBoa = l.ultimoEm;
    if (!out.ultima || l.ultimoEm > out.ultima) {
      out.ultima = l.ultimoEm;
      out.ultimoDesfecho = l.desfecho;
    }
  }
  if (out.semana > 0) out.falhas = failed / out.semana;
  if (okCount > 0) out.tempoMs = okMs / okCount;
  return out;
}

// ===== As cotas: o que tem fim =====

export type QuotaLevel = 'folga' | 'perto' | 'quase';
export type QuotaWindow = 'mes' | 'dia' | 'sempre';

export interface Quota {
  id: string;
  nome: string;
  /** "na RAWG", para a frase. */
  onde: string;
  /** "a RAWG", para a frase. */
  chamado: string;
  janela: QuotaWindow;
  usado: number;
  total: number;
  falta: number;
  /** De 0 a 1 (pode passar de 1 se a conta passou do limite). */
  parte: number;
  nivel: QuotaLevel;
  /** O que se conta: "bytes" escreve em MB, e o resto vai como está na frase ("4.000 pedidos"). */
  unidade: 'pedidos' | 'linhas' | 'linhas lidas' | 'linhas gravadas' | 'bytes';
  /** A conta começou depois do início da janela: o número não tem o que veio antes. */
  desde: string | null;
}

export function levelOf(part: number): QuotaLevel {
  return part >= ALMOST_OUT ? 'quase' : part >= NEAR_END ? 'perto' : 'folga';
}

function quota(q: Omit<Quota, 'falta' | 'parte' | 'nivel' | 'desde'> & { desde?: string | null }): Quota {
  const parte = q.total > 0 ? q.usado / q.total : 0;
  return { ...q, desde: q.desde ?? null, falta: Math.max(0, q.total - q.usado), parte, nivel: levelOf(parte) };
}

/** "a RAWG" vira "na RAWG"; "o Google Agenda", "no Google Agenda". */
const inPrep = (called: string) => called.replace(/^a /, 'na ').replace(/^o /, 'no ');
/** "a RAWG" vira "à RAWG"; "o TMDB", "ao TMDB". */
const toPrep = (called: string) => called.replace(/^a /, 'à ').replace(/^o /, 'ao ');

export function quotasOf(usage: ApiUsage, now: Date, cf: CloudflareReport | null = null): Quota[] {
  const ofService = (s: ServicoExterno): Quota | null => {
    const cota = s.limite.cota;
    if (!cota) return null;
    const totals = totalsOf(usage.linhas.filter((l) => l.servico === s.id), now);
    const monthly = cota.janela === 'mes';
    // no primeiro mês, a conta só tem o que veio depois de ligada
    const late = monthly && !!usage.contandoDesde && usage.contandoDesde > firstOfMonth(now);
    return quota({ id: s.id, nome: s.nome, onde: inPrep(s.chamado), chamado: s.chamado, janela: cota.janela, usado: monthly ? totals.mes : totals.hoje, total: cota.valor, unidade: 'pedidos', desde: late ? usage.contandoDesde : null });
  };
  const services = SERVICOS.flatMap((s) => ofService(s) ?? []);
  const today = cf?.estado === 'ok' ? cf.dias.find((d) => d.dia === utcDay(now)) : undefined;
  const own = usage.proprias;
  return [
    ...services.filter((q) => q.janela === 'mes'),
    // os limites da conta inteira na Cloudflare vêm antes: são eles que param tudo
    ...(today
      ? [
          quota({ id: 'cf-pedidos', nome: 'Pedidos aos Workers', onde: 'aos Workers', chamado: 'os pedidos aos Workers', janela: 'dia', usado: today.pedidos, total: PLANO_GRATIS.pedidosWorkers, unidade: 'pedidos' }),
          quota({ id: 'cf-lidas', nome: 'Linhas lidas no D1', onde: 'no D1', chamado: 'as linhas lidas', janela: 'dia', usado: today.linhasLidas, total: PLANO_GRATIS.linhasLidas, unidade: 'linhas lidas' }),
          quota({ id: 'cf-gravadas', nome: 'Linhas gravadas no D1', onde: 'no D1', chamado: 'as linhas gravadas', janela: 'dia', usado: today.linhasGravadas, total: PLANO_GRATIS.linhasGravadas, unidade: 'linhas gravadas' }),
        ]
      : []),
    ...services.filter((q) => q.janela === 'dia'),
    ...(own.cotaLinhas > 0 ? [quota({ id: 'linhas', nome: 'Cota de gravações do Murall', onde: 'na cota de gravações', chamado: 'a cota de gravações', janela: 'dia', usado: own.linhasGravadas, total: own.cotaLinhas, unidade: 'linhas' })] : []),
    ...(cf?.estado === 'ok' ? cf.bancos.map((b) => quota({ id: `banco-${b.nome}`, nome: `Banco ${b.nome}`, onde: `no banco ${b.nome}`, chamado: `o banco ${b.nome}`, janela: 'sempre', usado: b.bytes, total: PLANO_GRATIS.bytesPorBanco, unidade: 'bytes' })) : []),
    ...(own.imagens && own.imagens.cota > 0 ? [quota({ id: 'imagens', nome: 'Imagens guardadas', onde: 'no espaço das imagens', chamado: 'o espaço das imagens', janela: 'sempre', usado: own.imagens.bytes, total: own.imagens.cota, unidade: 'bytes' })] : []),
  ];
}

/**
 * Em que dia do mês uma cota mensal acaba, no ritmo de agora. Null sem dias bastantes para dizer, ou se o
 * ritmo não a acaba neste mês.
 */
export function runsOutOn(q: Quota, usage: ApiUsage, now: Date): number | null {
  if (q.janela !== 'mes' || q.usado <= 0 || q.falta <= 0) return null;
  const from = usage.contandoDesde && usage.contandoDesde > firstOfMonth(now) ? usage.contandoDesde : firstOfMonth(now);
  const counted = Math.floor((Date.parse(`${utcDay(now)}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  if (counted < PACE_MIN_DAYS) return null;
  const day = now.getUTCDate() + Math.ceil(q.falta / (q.usado / counted));
  return day <= daysInMonth(now) ? day : null;
}

// ===== O estado =====

export type ServiceStatus = 'fora' | 'falhando' | 'limite' | 'recusada' | 'quase' | 'perto' | 'falhou' | 'ok' | 'sem-uso' | 'sem-contagem';

/** A ordem da tabela: o que precisa de atenção em cima. */
export const STATUS_ORDER: readonly ServiceStatus[] = ['fora', 'falhando', 'limite', 'recusada', 'quase', 'perto', 'falhou', 'ok', 'sem-uso', 'sem-contagem'];

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  fora: 'Fora do ar',
  falhando: 'Falhando',
  limite: 'No limite',
  recusada: 'Chave recusada',
  quase: 'Quase no fim',
  perto: 'Perto do fim',
  falhou: 'A última falhou',
  ok: 'Respondendo',
  'sem-uso': 'Sem uso',
  'sem-contagem': 'Ainda não conta',
};

export function statusOf(totals: ServiceTotals, lines: readonly UsageLine[], failures: readonly UsageFailure[], level: QuotaLevel | null, now: Date, counted = true): { status: ServiceStatus; desde: string | null } {
  if (!counted) return { status: 'sem-contagem', desde: null };
  const recent = (iso: string) => now.getTime() - Date.parse(iso) <= RECENT_MS;
  // caiu: as falhas de queda depois da última resposta boa, a mais nova há pouco tempo
  const downs = failures.filter((f) => (f.desfecho === 'fora' || f.desfecho === 'prazo') && (!totals.ultimaBoa || f.em > totals.ultimaBoa));
  const count = downs.reduce((n, f) => n + f.repeticoes, 0);
  if (count >= DOWN_AFTER && downs.some((f) => recent(f.em))) {
    return { status: 'fora', desde: downs.reduce((min, f) => (f.em < min ? f.em : min), downs[0]!.em) };
  }
  if (lines.some((l) => l.desfecho === 'limite' && recent(l.ultimoEm))) return { status: 'limite', desde: null };
  if (totals.ultimoDesfecho === 'recusada') return { status: 'recusada', desde: null };
  if (level === 'quase' || level === 'perto') return { status: level, desde: null };
  if (totals.ultimoDesfecho && FALHAS.includes(totals.ultimoDesfecho)) return { status: 'falhou', desde: null };
  return { status: totals.semana > 0 ? 'ok' : 'sem-uso', desde: null };
}

// ===== As palavras =====

const int = (n: number) => Math.round(n).toLocaleString('pt-BR');
const comma = (n: number) => String(n).replace('.', ',');

/** "2.470", "20 mil", "1,2 mi": curto, para a régua. A tabela usa o número inteiro. */
export function shortNumber(n: number): string {
  const trim = (v: number) => comma(Math.round(v * 10) / 10);
  if (n >= 1_000_000) return `${trim(n / 1_000_000)} mi`;
  if (n >= 10_000) return `${trim(n / 1_000)} mil`;
  return int(n);
}

export const wholeNumber = int;

export function megabytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${comma(Math.round(mb * 10) / 10)} MB`;
}

export function percent(part: number): string {
  if (part <= 0) return '0%';
  if (part < 0.01) return 'menos de 1%';
  return `${Math.round(part * 100)}%`;
}

export function duration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${comma(Math.round(ms / 100) / 10)} s`;
}

/** A hora em Brasília, de onde quer que se abra: "19:40". */
export function clock(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** A que horas o dia UTC vira, em Brasília: "21h". */
export function dayTurn(now: Date): string {
  const hour = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(new Date(`${utcDay(now)}T00:00:00Z`));
  return `${Number(hour)}h`;
}

export function ago(iso: string, now: Date): string {
  const min = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'ontem' : `há ${days} dias`;
}

/** "2026-11-05" vira "05/nov/2026". Sem `Date`: a data é um dia, sem fuso. */
export function dayLabel(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${MONTHS_SHORT[Number(month) - 1]}/${year}`;
}

/** Uma parte da frase, em minúscula: quem junta decide a maiúscula. */
function problemOf(row: ServiceRow): string | null {
  const called = row.service.chamado;
  switch (row.status) {
    case 'fora':
      return `${called} está fora do ar${row.desde ? ` desde ${clock(row.desde)}` : ''}`;
    case 'falhando':
      return `${called} está falhando nos navegadores${row.desde ? ` desde ${clock(row.desde)}` : ''}`;
    case 'limite':
      return `${called} bateu no limite`;
    case 'recusada':
      return `${called} recusou a chave`;
    case 'falhou':
      return `a última chamada ${toPrep(called)} falhou`;
    default:
      return null;
  }
}

const QUOTA_WHEN: Record<QuotaWindow, string> = { mes: 'do mês', dia: 'de hoje', sempre: 'ocupado' };
const turnOf = (q: Quota, now: Date) => (q.janela === 'mes' ? 'até dia 1º' : q.janela === 'dia' ? `até as ${dayTurn(now)}` : '');
const amountOf = (q: Quota, n: number) => (q.unidade === 'bytes' ? megabytes(n) : `${int(n)} ${q.unidade}`);

function quotaProblem(q: Quota, now: Date): string {
  const when = turnOf(q, now);
  return `faltam ${amountOf(q, q.falta)} ${q.onde}${when ? ` ${when}` : ''}`;
}

const COUNT_WORD = ['', 'Uma', 'Duas', 'Três', 'Quatro', 'Cinco', 'Seis'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const joined = (items: readonly string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`);

/** A frase que responde "alguma coisa está caindo ou perto do fim?" (PLANO-ADMIN-APIS.md, 11.5). */
export function howItIs(rows: readonly ServiceRow[], quotas: readonly Quota[], usage: ApiUsage, now: Date, cut = 0): string {
  if (!usage.contandoDesde) return 'A contagem ainda não começou. Os números vão aparecendo conforme o site é usado.';
  const down = rows.flatMap((r) => {
    const text = problemOf(r);
    return text ? [{ row: r, text }] : [];
  });
  const ending = quotas.filter((q) => q.nivel !== 'folga').sort((a, b) => b.parte - a.parte);
  const cutText = cut > 0 ? `a Cloudflare cortou ${int(cut)} ${cut === 1 ? 'pedido' : 'pedidos'} hoje por passar do limite` : null;
  const parts = [...down.map((d) => d.text), ...(cutText ? [cutText] : []), ...ending.map((q) => quotaProblem(q, now))];

  if (parts.length === 1) {
    const only = down[0];
    if (only) {
      const backup = only.row.status === 'fora' && only.row.service.reserva ? `: ${only.row.service.reserva} estão indo para a Wikipedia` : '';
      const others = rows.some((r) => r !== only.row && r.status === 'ok');
      return `${cap(only.text)}${backup}.${others ? ' O resto está respondendo.' : ''}`;
    }
    if (cutText) return `${cap(cutText)}.`;
    const q = ending[0]!;
    const day = runsOutOn(q, usage, now);
    return `${cap(parts[0]!)}.${day ? ` No ritmo deste mês, acabam dia ${day}.` : ''}`;
  }
  if (parts.length > 1) {
    const word = COUNT_WORD[parts.length] ?? String(parts.length);
    return `${word} coisas pedem atenção: ${joined(parts)}.`;
  }
  if (usage.contandoDesde === utcDay(now)) return 'A contagem começou hoje. Os números vão aparecendo conforme o site é usado.';
  if (!rows.some((r) => r.status === 'ok')) return 'Nada foi chamado nos últimos 7 dias.';
  const top = [...quotas].sort((a, b) => b.parte - a.parte)[0];
  if (!top || top.parte < 0.01) return 'Tudo respondendo, e nenhuma cota passou de 1%.';
  return `Tudo respondendo. O mais perto do fim: ${top.chamado}, com ${percent(top.parte)} ${QUOTA_WHEN[top.janela]}.`;
}

// ===== O detalhe de um serviço (PLANO-ADMIN-APIS.md, 11.6) =====

/** Como uma chamada terminou, em palavras. */
export const OUTCOME_LABEL: Record<Desfecho, string> = {
  ok: 'Respondeu',
  'nao-achou': 'Não achou',
  limite: 'Bateu no limite',
  recusada: 'Chave recusada',
  fora: 'Fora do ar',
  prazo: 'Demorou demais',
  outro: 'Erro',
  cancelada: 'Cancelada',
};

/** O nome de cada operação das listas fechadas (`contrato/uso-apis/contagem.ts`). */
const OPERATION_LABEL: Record<string, string> = {
  busca: 'Busca',
  jogo: 'Ficha do jogo',
  lojas: 'Lojas',
  posteres: 'Pôsteres',
  listar: 'Ler a agenda',
  criar: 'Criar evento',
  mudar: 'Mudar evento',
  apagar: 'Apagar evento',
  renovar: 'Renovar o acesso',
  trocar: 'Ligar a conta',
  revogar: 'Desligar a conta',
  ler: 'Ler o documento',
  geral: 'Tudo',
  rawg: 'RAWG',
  tmdb: 'TMDB',
};

export const operationLabel = (op: string): string => OPERATION_LABEL[op] ?? op;

/** Um dia do gráfico de 30 dias. */
export interface UsageDay {
  dia: string;
  /** Respostas boas (o "não achou" é resposta). */
  boas: number;
  falhas: number;
  total: number;
  /** Tempo médio das respostas boas; null sem nenhuma. */
  tempoMs: number | null;
  /** Antes de a contagem começar, o dia não é zero: é desconhecido. */
  contado: boolean;
}

/** Os últimos `n` dias UTC, do mais velho para hoje, com o que cada um teve. */
export function daysOf(lines: readonly UsageLine[], now: Date, since: string | null, n = 30): UsageDay[] {
  const days: UsageDay[] = Array.from({ length: n }, (_, i) => {
    const dia = daysBack(now, n - 1 - i);
    return { dia, boas: 0, falhas: 0, total: 0, tempoMs: null, contado: !!since && dia >= since };
  });
  const byDay = new Map(days.map((d) => [d.dia, d]));
  const okMs = new Map<string, { n: number; ms: number }>();
  for (const l of lines) {
    const day = byDay.get(l.dia);
    if (!day || l.desfecho === 'cancelada') continue;
    if (FALHAS.includes(l.desfecho)) day.falhas += l.pedidos;
    else day.boas += l.pedidos;
    day.total += l.pedidos;
    if (l.desfecho === 'ok') {
      const acc = okMs.get(l.dia) ?? { n: 0, ms: 0 };
      acc.n += l.pedidos;
      acc.ms += l.msTotal;
      okMs.set(l.dia, acc);
    }
  }
  for (const [dia, acc] of okMs) if (acc.n > 0) byDay.get(dia)!.tempoMs = acc.ms / acc.n;
  return days;
}

/** Uma linha da tabela "Por operação": 30 dias. */
export interface OperationRow {
  operacao: string;
  nome: string;
  pedidos: number;
  /** De 0 a 1; null sem pedido. */
  falhas: number | null;
  tempoMs: number | null;
}

/** As operações de um serviço nos últimos 30 dias, na ordem da lista fechada; as que nunca vieram também. */
export function operationsOf(operations: readonly string[], lines: readonly UsageLine[], now: Date): OperationRow[] {
  const from = daysBack(now, 29);
  return operations.map((operacao) => {
    let pedidos = 0;
    let failed = 0;
    let okN = 0;
    let okMs = 0;
    for (const l of lines) {
      if (l.operacao !== operacao || l.dia < from || l.desfecho === 'cancelada') continue;
      pedidos += l.pedidos;
      if (FALHAS.includes(l.desfecho)) failed += l.pedidos;
      if (l.desfecho === 'ok') {
        okN += l.pedidos;
        okMs += l.msTotal;
      }
    }
    return { operacao, nome: operationLabel(operacao), pedidos, falhas: pedidos > 0 ? failed / pedidos : null, tempoMs: okN > 0 ? okMs / okN : null };
  });
}

const BRASILIA_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** "2026-11-05" vira "05/nov". */
export function dayShort(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${MONTHS_SHORT[Number(month) - 1]}`;
}

/** Quando foi uma falha, em Brasília: "hoje 20:12", "ontem 19:40", "03/nov 14:02". */
export function when(iso: string, now: Date): string {
  const day = BRASILIA_DAY.format(new Date(iso));
  const today = BRASILIA_DAY.format(now);
  const yesterday = BRASILIA_DAY.format(new Date(now.getTime() - DAY_MS));
  const prefix = day === today ? 'hoje' : day === yesterday ? 'ontem' : dayShort(day);
  return `${prefix} ${clock(iso)}`;
}

/** Uma falha em palavras: "Fora do ar · 522 · 3 vezes". */
export function failureText(f: UsageFailure): string {
  const status = f.status ? ` · ${f.status}` : '';
  const times = f.repeticoes > 1 ? ` · ${f.repeticoes} vezes` : '';
  return `${OUTCOME_LABEL[f.desfecho] ?? f.desfecho}${status}${times}`;
}

// ===== A tela inteira =====

export interface ServiceRow {
  service: ServicoExterno;
  totals: ServiceTotals;
  status: ServiceStatus;
  desde: string | null;
  /** Só sabe de hoje (a Cloudflare): 7 e 30 dias ficam em branco, em vez de um zero falso. */
  soHoje: boolean;
}

export interface UsageView {
  sentence: string;
  quotas: Quota[];
  groups: { id: MedidoEm; rows: ServiceRow[] }[];
  now: Date;
  cloudflare: CloudflareReport | null;
  /** O dia de ontem na Cloudflare, para comparar. */
  ontem: CloudflareReport['dias'][number] | null;
}

const GROUP_ORDER: readonly MedidoEm[] = ['worker', 'navegador', 'cloudflare'];

/** A linha da Cloudflare: os pedidos de hoje e o pior nível das cotas dela; sem a leitura, "Ainda não conta". */
function cloudflareRow(service: ServicoExterno, cf: CloudflareReport | null, quotas: readonly Quota[], now: Date): ServiceRow {
  const empty: ServiceTotals = { hoje: 0, semana: 0, trinta: 0, mes: 0, falhas: null, tempoMs: null, ultimaBoa: null, ultima: null, ultimoDesfecho: null };
  const today = cf?.estado === 'ok' ? cf.dias.find((d) => d.dia === utcDay(now)) : undefined;
  if (!today) return { service, totals: empty, status: 'sem-contagem', desde: null, soHoje: true };
  const levels = quotas.filter((q) => q.id.startsWith('cf-') || q.id.startsWith('banco-')).map((q) => q.nivel);
  const status: ServiceStatus = levels.includes('quase') ? 'quase' : levels.includes('perto') ? 'perto' : 'ok';
  return { service, totals: { ...empty, hoje: today.pedidos, falhas: today.pedidos > 0 ? today.erros / today.pedidos : null }, status, desde: null, soHoje: true };
}

export function usageView(usage: ApiUsage, cf: CloudflareReport | null = null): UsageView {
  const now = new Date(usage.geradoEm);
  const quotas = quotasOf(usage, now, cf);
  const rows = SERVICOS.map((service): ServiceRow => {
    if (service.id === 'cloudflare') return cloudflareRow(service, cf, quotas, now);
    const lines = usage.linhas.filter((l) => l.servico === service.id);
    const totals = totalsOf(lines, now);
    const level = quotas.find((q) => q.id === service.id)?.nivel ?? null;
    const failures = usage.falhas.filter((f) => f.servico === service.id);
    const { status, desde } = statusOf(totals, lines, failures, level, now);
    // visto do navegador, pode ser a rede de uma pessoa só: a tela não afirma que o serviço caiu
    return { service, totals, status: status === 'fora' && service.medidoEm === 'navegador' ? 'falhando' : status, desde, soHoje: false };
  });
  const rank = (r: ServiceRow) => STATUS_ORDER.indexOf(r.status);
  const days = cf?.estado === 'ok' ? cf.dias : [];
  const cut = days.find((d) => d.dia === utcDay(now))?.cortados ?? 0;
  return {
    now,
    quotas,
    cloudflare: cf,
    ontem: days.find((d) => d.dia === daysBack(now, 1)) ?? null,
    sentence: howItIs(rows, quotas, usage, now, cut),
    // a ordem do catálogo desempata: `sort` é estável
    groups: GROUP_ORDER.map((id) => ({ id, rows: rows.filter((r) => r.service.medidoEm === id).sort((a, b) => rank(a) - rank(b)) })),
  };
}
