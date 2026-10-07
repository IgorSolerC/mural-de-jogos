import { Injectable, computed, inject, signal } from '@angular/core';
import { Cloud, CloudNotice } from './cloud-config';
import { ReviewStore } from './review-store';

/**
 * As novidades do site: o que mudou em cada atualização, escrito aqui, no mesmo commit da mudança.
 * Chegam junto com a versão nova do site, então não gastam nenhuma chamada à API, funcionam offline e
 * sempre falam da versão que a pessoa está usando.
 *
 * Para publicar uma atualização: ponha uma entrada nova no topo de `NEWS`, com um `id` que nunca mais
 * muda. Com `notice`, ela aparece também na faixa do topo do site (com um X para fechar) até a pessoa
 * fechar, abrir a página de novidades ou passar a data de `until`. Sem `notice`, só na página.
 *
 * Um aviso urgente que não pode esperar uma versão nova (manutenção, a nuvem fora do ar) vai no
 * `public/cloud.json`, no campo `aviso` (ver `parseCloudNotice` em `cloud-config.ts`).
 */
export interface NewsEntry {
  /** Fixo para sempre: é o que fica guardado como visto neste navegador. */
  id: string;
  /** O dia da atualização, AAAA-MM-DD. */
  date: string;
  title: string;
  /** O que mudou, uma frase por item. */
  items: string[];
  /** A frase da faixa no topo do site. Sem ela, a novidade só aparece na página. */
  notice?: string;
  /** Até quando a faixa aparece (AAAA-MM-DD, inclusive). */
  until?: string;
}

/** Da mais nova para a mais velha. */
export const NEWS: NewsEntry[] = [
  {
    id: '2026-10-06-consertos-amigos-nuvem',
    date: '2026-10-06',
    title: 'Consertos em Amigos e na nuvem',
    items: [
      'O nome trocado em um aparelho não volta mais ao antigo quando outro aparelho abre o site.',
      'Em Amigos, a rejogada (ou releitura, ou reassistida) de algo que você já avaliou mostra a sua nota, em vez de "Você ainda não avaliou".',
      'Em Amigos, uma resenha que chega com a página aberta busca o mural do amigo de novo, em vez de dizer que ele tirou a ficha do mural. Sem conexão, aparece "Tentar de novo".',
      'A resenha de alguém que aparece em Amigos com a página já aberta não fica mais em "Buscando a ficha…" para sempre.',
      'Avaliar várias coisas seguidas não para mais a sincronização com "envios demais". Se ela precisar dar uma pausa, volta sozinha, sem recarregar a página.',
      'O "Desfazer" depois de deixar de seguir alguém mantém a pessoa silenciada, se ela estava.',
    ],
  },
  {
    id: '2026-10-06-amigos-de-cara-nova',
    date: '2026-10-06',
    title: 'Amigos de cara nova',
    items: [
      'Enquanto o mural de um amigo chega, a resenha mostra uma ficha em branco com o nome da obra, em vez de dizer que ela saiu do mural. Se não der para buscar, aparece "Tentar de novo".',
      'O bilhete com "+1,4 que você" agora fica preso na ficha com um pedaço de fita, e resenhas seguidas da mesma pessoa ficam sob uma fita só.',
      'Na tela grande, ao lado do que chegou: o seu crachá com o código (e o link para copiar), o bilhete para seguir alguém e quem você segue.',
      'Pessoas virou uma lista só: cada pessoa aparece uma vez, com "Vocês se seguem", "Você segue" ou "Segue você". Silenciar, deixar de seguir e remover seguidor ficam no "⋯" de cada um.',
      'O cadeado das resenhas privadas fica sempre escuro, também nas cartolinas escuras.',
    ],
  },
  {
    id: '2026-10-06-privadas-e-segredos',
    date: '2026-10-06',
    title: 'Resenhas privadas e notas em segredo',
    items: [
      'Ao pregar uma resenha, escolha "Quem vê?": Todo mundo ou Só eu. A privada ganha um cadeado, fica fora do mural que os outros veem e não avisa ninguém. Quando você troca para Todo mundo, quem segue você é avisado.',
      'Evitar spoilers agora vale para as fichas de qualquer pessoa, amiga ou não: em Amigos, no mural de alguém e em Comparar, o que você ainda não avaliou fica em segredo.',
      'Abriu uma ficha em segredo? "Revelar a nota" mostra só aquela, só daquela vez.',
      'No mural de alguém e em Comparar, "Mostrar notas" revela tudo enquanto a tela estiver aberta. Na próxima vez, volta a seguir Ajustes.',
      'No feed de Amigos, a ficha tem a mesma largura e altura que no mural.',
    ],
  },
  {
    id: '2026-10-06-amigos-e-chaves',
    date: '2026-10-06',
    title: 'Amigos com as fichas de verdade',
    items: [
      'O Correio virou a aba Amigos, com as pessoas que acenam quando chega algo.',
      'Cada resenha nova de um amigo chega como a ficha dele, igual à do mural. Do lado, quanto ele deu a mais ou a menos que você, ou "Quero jogar" se você ainda não tem. Tocar no nome abre o mural da pessoa.',
      'Sem spoilers: o que você ainda não avaliou chega em segredo (dá para desligar em Ajustes › Mural).',
      'Misturado ou separado: as novidades de todos os murais juntas, ou só as do mural aberto no cartaz.',
      'Com a conta, as chaves da RAWG e do TMDB valem em todos os seus aparelhos. Elas nunca vão no arquivo de backup.',
      'Quem ainda tem o mural só no navegador vê, no máximo a cada 2 dias, um convite para entrar com o Google.',
      'Os botões que esperam a nuvem (seguir, sair, apagar, sincronizar, abrir um mural) mostram que estão trabalhando.',
    ],
  },
  {
    id: '2026-10-seguir',
    date: '2026-10-06',
    title: 'Seguir pelo código e a aba Amigos',
    notice: 'Agora dá para seguir os amigos pelo código e ver, na aba Amigos, o que eles pregaram no mural.',
    items: [
      'Siga alguém pelo código, ou com o botão "Seguir" no mural da pessoa. Ela recebe um aviso de que você começou a seguir.',
      'A aba Amigos, ao lado da engrenagem, mostra as resenhas novas de quem você segue, um cartão por pessoa por dia. Um número amarelo aparece quando chega algo.',
      'Em cada resenha: a nota que você deu para a mesma obra, ou "Quero" para pôr na sua wishlist. E o quanto vocês combinam.',
      'Silencie quem você quiser (continua seguindo, sem contar no número), deixe de seguir ou tire alguém da lista de quem segue você.',
    ],
  },
  {
    id: '2026-10-beta',
    date: '2026-10-06',
    title: 'O Meu Mural entrou em beta',
    notice: 'O Meu Mural entrou em beta: agora dá para entrar com o Google e ter o mesmo mural em todos os aparelhos.',
    items: [
      'Conta com o Google, se você quiser: o mural fica salvo na nuvem e igual no computador e no celular. Sem conta, tudo continua só neste navegador, como sempre.',
      'Cada conta tem um código. Mande o código ou o link para um amigo e ele abre o seu mural em Comparar, sem arquivo de backup.',
      'Ajustes agora vem em abas: Perfil, Backup, Mural e Busca e capas.',
      'O lembrete de backup some para quem está salvo na nuvem.',
      'Uma página de privacidade que explica o que a nuvem guarda.',
      'Esta página, com o que mudou em cada atualização.',
    ],
  },
  {
    id: '2026-10-06-rejogadas',
    date: '2026-10-06',
    title: 'Rejogadas, releituras e reassistidas',
    items: [
      'Jogou de novo, releu ou reassistiu? Abra a resenha e escreva a rejogada: ela vira uma ficha própria, ligada à original.',
      'A ficha nova nasce com a mesma cartolina da original, e dá para trazer as notas dela com "Manter notas".',
      'Na resenha aberta, as setas passam pela original e por todas as outras vezes.',
    ],
  },
  {
    id: '2026-10-05-extras',
    date: '2026-10-05',
    title: 'Extras e estatísticas',
    items: [
      'Uma aba nova, Extras, com o Ranking, o Comparar e três jogos: Mata-mata, Maior ou menor e Muraldle.',
      'Estatísticas: sete páginas de números sobre o seu mural.',
      'Escolha como a nota aparece: livre, arredondada ou só inteiros.',
      'O seu nome vai no backup, e quem compara com você vê o seu nome.',
      '"Apagar o save", em Ajustes, para começar do zero (ele pergunta antes).',
      'O mural passou a caber muito mais resenhas, e muitos bugs foram corrigidos.',
    ],
  },
  {
    id: '2026-10-04-spoilers',
    date: '2026-10-04',
    title: 'Sem spoilers, filtros e um estojo maior',
    items: [
      'Modo sem spoilers: esconde notas, vereditos e textos, para mostrar o mural sem entregar o que você achou.',
      'Uma cartela de filtros no mural: veredito, status, nota, dificuldade, ano e mais.',
      'Vista só com capa e nome, para ver muita coisa de uma vez.',
      '18 estampas novas, separadas por assunto, e 39 estragos, manchas, rabiscos e decorações novos.',
    ],
  },
  {
    id: '2026-09-30-comparar',
    date: '2026-09-30',
    title: 'Comparar murais',
    items: [
      'Abra o backup de um amigo e veja se vocês combinam, onde concordam e onde brigam.',
      'As dicas do amigo: o que só ele resenhou, com "Quero jogar" para pôr na sua wishlist.',
      'A data da resenha pode ser só o mês e o ano, ou só o ano.',
      'Nota final na mão, se você quiser, até 11.',
    ],
  },
  {
    id: '2026-09-29-papel',
    date: '2026-09-29',
    title: 'Fichas do seu jeito, Wishlist e Pra depois',
    items: [
      'Personalize cada ficha: cartolinas claras e escuras, estampas, estragos e decorações.',
      'Wishlist em recortes de revista e Pra depois em folhas de caderno.',
      'Escolha a capa de cada resenha.',
    ],
  },
  {
    id: '2026-09-28-murais',
    date: '2026-09-28',
    title: 'Cinco murais e o site offline',
    items: [
      'Cinco murais: jogos, livros, filmes, séries e animes. Para trocar, toque na palavra do cartaz.',
      'O site abre sem internet e pode ser instalado como um app.',
      'Bônus a favor e contra, a dificuldade em caveiras e a nota 10 em folha holográfica.',
      'Um lembrete para baixar o backup de vez em quando.',
    ],
  },
  {
    id: '2026-09-27-no-ar',
    date: '2026-09-27',
    title: 'O mural foi para o ar',
    items: ['A primeira versão: o mural de jogos, o Pra depois, o Ranking, o Lado a lado e os Ajustes.'],
  },
];

/** O que a faixa do topo mostra. */
export interface Notice {
  /** O que fica guardado como visto quando a pessoa fecha. */
  key: string;
  text: string;
  /** Tem link para a página de novidades (os avisos da nuvem não têm). */
  news: boolean;
}

const KEY = 'meu-mural:novidades';
/** Um limite para a lista de vistos não crescer para sempre (os ids da nuvem não estão em NEWS). */
const MAX_SEEN = 200;

/** Hoje, AAAA-MM-DD, no fuso de quem usa. */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * Quem nunca passou por aqui: quem chega agora não recebe notícia velha (tudo conta como visto);
 * quem já tinha um mural antes desta página existir vê só a mais nova.
 */
export function firstSeen(news: NewsEntry[], hadWall: boolean): string[] {
  return hadWall ? news.slice(1).map((n) => n.id) : news.map((n) => n.id);
}

/**
 * A faixa da vez: o aviso da nuvem, se houver um não visto e no prazo; senão, a novidade mais nova
 * que tem aviso (uma atualização pequena, sem aviso, não esconde a faixa da anterior). Só essa:
 * fechar a faixa nunca faz uma mais velha aparecer no lugar.
 */
export function noticeOf(news: NewsEntry[], cloud: CloudNotice | null, seen: ReadonlySet<string>, day: string): Notice | null {
  if (cloud && !seen.has(`nuvem:${cloud.id}`) && (!cloud.until || cloud.until >= day)) {
    return { key: `nuvem:${cloud.id}`, text: cloud.text, news: false };
  }
  const latest = news.find((n) => n.notice);
  if (!latest?.notice || seen.has(latest.id) || (latest.until && latest.until < day)) return null;
  return { key: latest.id, text: latest.notice, news: true };
}

/** Lê o que ficou guardado; null se nunca foi gravado (ou não serve). */
export function readSeen(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as { vistas?: unknown };
    const list = data?.vistas;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class News {
  private readonly cloud = inject(Cloud);
  private readonly store = inject(ReviewStore);

  readonly entries = NEWS;
  private readonly seen = signal<ReadonlySet<string>>(this.load());
  /** Hoje, uma vez por abertura: o prazo de um aviso não precisa de relógio. */
  private readonly day = today();

  /** A faixa do topo, ou null. */
  readonly notice = computed(() => noticeOf(this.entries, this.cloud.notice(), this.seen(), this.day));
  /** Quantas novidades esta pessoa ainda não viu. */
  readonly unseen = computed(() => this.entries.filter((n) => !this.seen().has(n.id)).length);

  constructor() {
    // fechar a faixa numa aba fecha nas outras
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key !== KEY) return;
        const list = readSeen(e.newValue);
        if (list) this.seen.set(new Set(list));
      });
    }
  }

  /** As novidades que esta pessoa ainda não tinha visto. */
  unseenIds(): Set<string> {
    return new Set(this.entries.filter((n) => !this.seen().has(n.id)).map((n) => n.id));
  }

  /** Fecha a faixa: ela não volta. */
  dismiss(key: string): void {
    this.mark([key]);
  }

  /** Abriu a página: tudo conta como visto, e a faixa de novidade vai embora. */
  seeAll(): void {
    this.mark(this.entries.map((n) => n.id));
  }

  private mark(keys: string[]): void {
    const next = new Set(this.seen());
    let changed = false;
    for (const k of keys) {
      if (!next.has(k)) {
        next.add(k);
        changed = true;
      }
    }
    if (!changed) return;
    this.seen.set(next);
    this.save(next);
  }

  private load(): ReadonlySet<string> {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      /* sem localStorage: a faixa volta a cada abertura, o que é melhor que nunca avisar */
    }
    const list = readSeen(raw);
    if (list) return new Set(list);
    const first = new Set(firstSeen(this.entries, this.store.hasContent()));
    this.save(first);
    return first;
  }

  private save(seen: ReadonlySet<string>): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ vistas: [...seen].slice(-MAX_SEEN) }));
    } catch {
      /* cota cheia ou sem localStorage: só esta aba lembra */
    }
  }
}
