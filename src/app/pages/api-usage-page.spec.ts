import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SEM_CONTAGEM, SERVICOS } from '../../../contrato/uso-apis/servicos';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { ApiUsagePage } from './api-usage-page';

const NOW = '2026-11-20T22:40:00.000Z';
const minutesAgo = (n: number) => new Date(Date.parse(NOW) - n * 60_000).toISOString();

const answer = {
  geradoEm: NOW,
  contandoDesde: '2026-11-05',
  linhas: [
    ['2026-11-20', 'rawg', 'busca', 'worker', 'prazo', 3, 24000, 8000, minutesAgo(3)],
    ['2026-11-20', 'tmdb', 'busca', 'worker', 'ok', 2, 800, 500, minutesAgo(10)],
    ['2026-11-18', 'tmdb', 'busca', 'worker', 'ok', 8, 3200, 500, '2026-11-18T10:00:00.000Z'],
  ],
  falhas: [{ em: minutesAgo(3), servico: 'rawg', operacao: 'busca', medidoEm: 'worker', desfecho: 'prazo', status: null, repeticoes: 3 }],
  proprias: { dia: '2026-11-20', linhasGravadas: 900, cotaLinhas: 60000, imagens: { imagens: 25, bytes: 524288, cota: 419430400 } },
  agenda: { contasLigadas: 1 },
};

const nothing = { ...answer, contandoDesde: null, linhas: [], falhas: [] };

const cloudflareOk = {
  estado: 'ok',
  geradoEm: NOW,
  dias: [
    { dia: '2026-11-20', pedidos: 7062, erros: 12, cortados: 0, linhasLidas: 433965, linhasGravadas: 3154 },
    { dia: '2026-11-19', pedidos: 5351, erros: 1, cortados: 0, linhasLidas: 142883, linhasGravadas: 1409 },
  ],
  workers: [
    { nome: 'mural-api', pedidos: 7000, erros: 12, cortados: 0, cpuP99: 4.25 },
    { nome: 'cofre-api', pedidos: 62, erros: 0, cortados: 0, cpuP99: null },
  ],
  bancos: [
    { nome: 'mural', bytes: 3565158 },
    { nome: 'cofre', bytes: 209715 },
  ],
};

describe('a página Uso das APIs', () => {
  /** `cloudflare`: o que a rota à parte responde; por padrão, que falta o token. */
  function setup(
    request: () => Promise<unknown>,
    cloudflare: () => Promise<unknown> = async () => ({ estado: 'sem-token', geradoEm: NOW, dias: [], workers: [], bancos: [] }),
    probe: (path: string) => Promise<unknown> = async () => ({}),
  ) {
    const route = (path: string) => (path.startsWith('/v1/admin/cloudflare') ? cloudflare() : path.startsWith('/v1/admin/testar/') ? probe(path) : request());
    const refresh = jasmine.createSpy('refresh').and.resolveTo();
    TestBed.configureTestingModule({
      imports: [ApiUsagePage],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: CloudAccount, useValue: { request: jasmine.createSpy('request').and.callFake(route), refresh } }],
    });
    const fixture = TestBed.createComponent(ApiUsagePage);
    const host: HTMLElement = fixture.nativeElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
    };
    const text = (sel: string) => host.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim();
    const rowOf = (name: string) => [...host.querySelectorAll('.razao tbody tr')].find((r) => r.querySelector('.nome')?.textContent === name) as HTMLTableRowElement;
    const cells = (name: string) => [...rowOf(name).querySelectorAll('td')].map((c) => c.textContent?.trim());
    return { fixture, host, settle, text, rowOf, cells, sentence: () => text('.frase'), refresh, account: TestBed.inject(CloudAccount) as unknown as { request: jasmine.Spy } };
  }

  it('confere com a nuvem ao abrir: o lugar das coisas, sem número de mentira', async () => {
    let release!: (v: unknown) => void;
    const t = setup(() => new Promise((resolve) => (release = resolve)));
    t.fixture.detectChanges();
    expect(t.sentence()).toBe('Conferindo…');
    expect(t.account.request).toHaveBeenCalledWith('/v1/admin/uso');
    expect(t.account.request).toHaveBeenCalledWith('/v1/admin/cloudflare');
    expect(t.host.querySelectorAll('.esqueleto').length).toBeGreaterThan(0);
    expect(t.host.querySelector('.razao')).toBeNull();
    expect(t.host.querySelector('.topo .botao')).toBeNull();
    release(answer);
    await t.settle();
    expect(t.host.querySelector('.esqueleto')).toBeNull();
    expect(t.host.querySelector('.frase')?.getAttribute('role')).toBe('status');
  });

  describe('o carimbo da frase', () => {
    it('pede atenção quando algo está errado, com a palavra e o ícone', async () => {
      const t = setup(async () => answer);
      await t.settle();
      const stamp = t.host.querySelector('.pauta .carimbo')!;
      expect(stamp.getAttribute('data-tom')).toBe('atencao');
      expect(stamp.textContent?.trim()).toBe('Pede atenção');
      expect(stamp.querySelector('lucide-icon')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('tudo em ordem quando tudo responde', async () => {
      const t = setup(async () => ({ ...answer, linhas: [['2026-11-18', 'tmdb', 'busca', 'worker', 'ok', 8, 3200, 500, '2026-11-18T10:00:00.000Z']], falhas: [] }));
      await t.settle();
      expect(t.text('.pauta .carimbo')).toBe('Tudo em ordem');
      expect(t.host.querySelector('.pauta .carimbo')?.getAttribute('data-tom')).toBe('calmo');
    });

    it('nenhum carimbo sem nada contado', async () => {
      const t = setup(async () => nothing);
      await t.settle();
      expect(t.host.querySelector('.carimbo')).toBeNull();
    });
  });

  it('a frase responde, com a queda em cima e os outros embaixo', async () => {
    const t = setup(async () => answer);
    await t.settle();
    expect(t.sentence()).toBe('A RAWG está fora do ar desde 19:37: as buscas de jogos estão indo para a Wikipedia. O resto está respondendo.');
    const worker = [...t.host.querySelectorAll('.razao tbody')][0]!;
    const names = [...worker.querySelectorAll('.nome')].map((n) => n.textContent);
    expect(names.slice(0, 2)).toEqual(['RAWG', 'TMDB']);
  });

  it('a linha traz os números, e o estado em palavra, nunca só na cor', async () => {
    const t = setup(async () => answer);
    await t.settle();
    expect(t.rowOf('RAWG').querySelector('.estado')?.textContent).toBe('Fora do ar');
    expect(t.rowOf('TMDB').querySelector('.estado')?.textContent).toBe('Respondendo');
    // Hoje, 7 dias, 30 dias, Falhas, Tempo, Última
    expect(t.cells('TMDB')).toEqual(['2', '10', '10', '0%', '400 ms', 'há 10 min']);
    expect(t.cells('RAWG')).toEqual(['3', '3', '3', '100%', '—', 'há 3 min']);
  });

  it('sem uso, um traço, e não um zero que parece bom', async () => {
    const t = setup(async () => answer);
    await t.settle();
    expect(t.rowOf('Google Agenda').querySelector('.estado')?.textContent).toBe('Sem uso');
    expect(t.cells('Google Agenda')).toEqual(['0', '0', '0', '—', '—', '—']);
  });

  it('sem a leitura, a Cloudflare diz que ainda não conta, sem número nenhum', async () => {
    const t = setup(async () => answer);
    await t.settle();
    expect(t.rowOf('Cloudflare').querySelector('.estado')?.textContent).toBe('Ainda não conta');
    expect(t.cells('Cloudflare')).toEqual(['—', '—', '—', '—', '—', '—']);
  });

  it('o que o navegador conta tem número, e a tela diz que é aproximado', async () => {
    const t = setup(async () => ({ ...answer, linhas: [...answer.linhas, ['2026-11-20', 'wikipedia', 'geral', 'navegador', 'ok', 7, 700, 200, minutesAgo(2)]] }));
    await t.settle();
    expect(t.rowOf('Wikipedia').querySelector('.estado')?.textContent).toBe('Respondendo');
    expect(t.cells('Wikipedia')).toEqual(['7', '7', '7', '0%', '100 ms', 'há 2 min']);
    expect(t.rowOf('iTunes').querySelector('.estado')?.textContent).toBe('Sem uso');
    expect(t.text('.razao')).toContain('Conta aproximada, só de quem está logado.');
  });

  it('a régua diz quanto falta, em número e para o leitor de tela', async () => {
    const t = setup(async () => answer);
    await t.settle();
    const rulers = [...t.host.querySelectorAll('app-cota')];
    expect(rulers.map((r) => r.querySelector('.nome')?.textContent)).toEqual(['RAWG', 'Google Agenda', 'Cota de gravações do Murall', 'Imagens guardadas']);
    expect(rulers[0]!.querySelector('.falta')?.textContent).toBe('faltam 19.997');
    expect(rulers[0]!.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('RAWG: 3 de 20.000, faltam 19.997, menos de 1%.');
    // folgada: a régua fina, com o percentual ao lado; o "de quanto" fica só na frase do leitor de tela
    expect(rulers[0]!.classList).toContain('folgada');
    expect(rulers[0]!.querySelector('.fina .regua')).not.toBeNull();
    expect(rulers[0]!.querySelector('.fina .parte')?.textContent?.trim()).toBe('<1%');
    expect(rulers[0]!.querySelector('.miudo')).toBeNull();
    // o primeiro mês: o que veio antes não está na conta
    expect(rulers[0]!.textContent).toContain('Contando desde 05/nov/2026');
    expect(t.text('.prateleiras')).toContain('Este mês');
    expect(t.text('.prateleiras')).toContain('Hoje · a conta vira às 21h');
  });

  describe('a Cloudflare', () => {
    it('sem o token: diz o que falta, e o resto da tela está de pé', async () => {
      const t = setup(async () => answer);
      await t.settle();
      expect(t.text('.cf-aviso')).toContain('Falta ligar a leitura da Cloudflare');
      expect(t.host.querySelector('.cf-aviso button')).toBeNull();
      expect(t.rowOf('Cloudflare').querySelector('.estado')?.textContent).toBe('Ainda não conta');
      expect(t.text('.razao')).toContain('A leitura dos números ainda não está ligada.');
      expect(t.host.querySelectorAll('app-cota').length).toBe(4);
    });

    it('com os números: as réguas de hoje e dos bancos, e a linha dela', async () => {
      const t = setup(async () => answer, async () => cloudflareOk);
      await t.settle();
      expect(t.host.querySelector('.cf-aviso')).toBeNull();
      const names = [...t.host.querySelectorAll('app-cota .nome')].map((n) => n.textContent);
      expect(names).toEqual(['RAWG', 'Pedidos aos Workers', 'Linhas lidas no D1', 'Linhas gravadas no D1', 'Google Agenda', 'Cota de gravações do Murall', 'Banco mural', 'Banco cofre', 'Imagens guardadas']);
      const pedidos = t.host.querySelectorAll('app-cota')[1]!;
      expect(pedidos.querySelector('.falta')?.textContent).toBe('faltam 92.938');
      expect(t.rowOf('Cloudflare').querySelector('.estado')?.textContent).toBe('Respondendo');
      // só sabe de hoje: 7 e 30 dias ficam em branco, e não com um zero falso
      expect(t.cells('Cloudflare')).toEqual(['7.062', '—', '—', '<1%', '—', '—']);
      expect(t.text('.razao')).toContain('Os números oficiais de hoje');
    });

    it('o detalhe mostra cada Worker, com a CPU, e o dia de ontem', async () => {
      const t = setup(async () => answer, async () => cloudflareOk);
      await t.settle();
      t.rowOf('Cloudflare').querySelector('button')!.click();
      await t.settle();
      const rows = [...t.host.querySelectorAll('.workers tbody tr')].map((r) => [...r.children].map((c) => c.textContent?.trim()));
      expect(rows).toEqual([
        ['mural-api', '7.000', '12', '0', '4,3 ms'],
        ['cofre-api', '62', '0', '0', '—'],
      ]);
      expect(t.text('.detalhe')).toContain('O limite de CPU do plano grátis é 10 ms');
      expect(t.text('.detalhe')).toContain('Ontem: 5.351 pedidos, 142.883 linhas lidas e 1.409 gravadas.');
      expect(t.host.querySelector('.workers caption')).not.toBeNull();
    });

    it('nos outros serviços, o detalhe não traz os Workers', async () => {
      const t = setup(async () => answer, async () => cloudflareOk);
      await t.settle();
      t.rowOf('RAWG').querySelector('button')!.click();
      await t.settle();
      expect(t.host.querySelector('.workers')).toBeNull();
    });

    it('fora do ar: diz isso e deixa tentar só ela de novo', async () => {
      let calls = 0;
      let usages = 0;
      const t = setup(
        async () => {
          usages++;
          return answer;
        },
        async () => (++calls === 1 ? { estado: 'fora', geradoEm: NOW, dias: [], workers: [], bancos: [] } : cloudflareOk),
      );
      await t.settle();
      expect(t.text('.cf-aviso')).toContain('A Cloudflare não respondeu. Os outros números estão certos.');
      expect(t.sentence()).toContain('A RAWG está fora do ar');
      t.host.querySelector<HTMLButtonElement>('.cf-aviso button')!.click();
      await t.settle();
      expect(calls).toBe(2);
      expect(usages).toBe(1);
      expect(t.host.querySelector('.cf-aviso')).toBeNull();
    });

    it('sem rede só nela, é o mesmo aviso, e um 403 ali não tira ninguém da página', async () => {
      const t = setup(
        async () => answer,
        async () => {
          throw new CloudError('Só a conta de admin vê isto.', 'so-admin', 403);
        },
      );
      const go = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
      await t.settle();
      expect(t.text('.cf-aviso')).toContain('A Cloudflare não respondeu');
      expect(go).not.toHaveBeenCalled();
    });

    it('os outros números não esperam por ela', async () => {
      let release!: (v: unknown) => void;
      const t = setup(async () => answer, () => new Promise((resolve) => (release = resolve)));
      await t.settle();
      expect(t.sentence()).toContain('A RAWG está fora do ar');
      expect(t.text('.cf-aviso')).toBe('Buscando os números da Cloudflare…');
      release(cloudflareOk);
      await t.settle();
      expect(t.host.querySelector('.cf-aviso')).toBeNull();
    });

    it('o Atualizar pede os números novos dela; abrir a página, não', async () => {
      const t = setup(async () => answer, async () => cloudflareOk);
      await t.settle();
      expect(t.account.request).not.toHaveBeenCalledWith('/v1/admin/cloudflare?novo=1');
      t.host.querySelector<HTMLButtonElement>('.topo .botao')!.click();
      await t.settle();
      expect(t.account.request).toHaveBeenCalledWith('/v1/admin/cloudflare?novo=1');
    });
  });

  it('a cota acabando ganha a palavra e a fita da cor certa', async () => {
    const t = setup(async () => ({ ...answer, falhas: [], linhas: [['2026-11-20', 'rawg', 'busca', 'worker', 'ok', 19000, 1000, 100, minutesAgo(1)]] }));
    await t.settle();
    const rawg = t.host.querySelector('app-cota')!;
    expect(rawg.querySelector('.aviso')?.textContent).toBe('Quase no fim');
    expect(rawg.querySelector('.regua')?.getAttribute('data-nivel')).toBe('quase');
    // perto do fim, a régua grande volta, com o "de quanto" escrito
    expect(rawg.classList).not.toContain('folgada');
    expect(rawg.querySelector('.fina')).toBeNull();
    expect(rawg.querySelector('.miudo')?.textContent).toContain('de 20 mil');
    expect(rawg.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('quase no fim');
    expect(t.rowOf('RAWG').querySelector('.estado')?.textContent).toBe('Quase no fim');
  });

  it('o detalhe abre e fecha pelo botão da linha, com o limite e de onde ele veio', async () => {
    const t = setup(async () => answer);
    await t.settle();
    const button = t.rowOf('RAWG').querySelector('button')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(t.host.querySelector('.detalhe')).toBeNull();
    button.click();
    await t.settle();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const detail = t.host.querySelector('.detalhe')!;
    expect(detail.id).toBe(button.getAttribute('aria-controls')!);
    expect(detail.textContent).toContain('20 mil pedidos por mês');
    expect(detail.textContent).toContain('Busca e capas de jogos');
    const labels = [...detail.querySelectorAll('a')].map((a) => a.getAttribute('aria-label'));
    expect(labels).toEqual(['Fonte do limite de RAWG, conferida em 05/nov/2026', 'Abrir o painel de RAWG']);
    for (const a of detail.querySelectorAll('a')) {
      expect(a.getAttribute('rel')).toBe('noreferrer');
      expect(a.getAttribute('href')).toMatch(/^https:\/\//);
    }
    // só um aberto de cada vez
    t.rowOf('TMDB').querySelector('button')!.click();
    await t.settle();
    expect(t.host.querySelectorAll('.detalhe').length).toBe(1);
    t.rowOf('TMDB').querySelector('button')!.click();
    await t.settle();
    expect(t.host.querySelector('.detalhe')).toBeNull();
  });

  describe('o detalhe de um serviço', () => {
    async function opened(name: string, answerWith: unknown = answer) {
      const t = setup(async () => answerWith);
      await t.settle();
      t.rowOf(name).querySelector('button')!.click();
      await t.settle();
      return { ...t, detail: t.host.querySelector('.detalhe')! };
    }

    it('traz os 30 dias, cada operação e as falhas dele', async () => {
      const { detail } = await opened('RAWG');
      const chart = detail.querySelector('app-uso-dias [role="img"]')!;
      expect(chart.getAttribute('aria-label')).toBe('Pedidos por dia nos últimos 30 dias: 3 no total, 3 falharam. O maior dia foi 20/nov, com 3. Hoje, 3.');
      expect(detail.querySelectorAll('app-uso-dias .coluna').length).toBe(30);
      expect(detail.querySelector('app-uso-dias .pe')?.textContent).toContain('contando desde 05/nov');
      const ops = [...detail.querySelectorAll('.operacoes tbody tr')].map((r) => [...r.children].map((c) => c.textContent?.trim()));
      expect(ops).toEqual([
        ['Busca', '3', '100%', '—'],
        ['Ficha do jogo', '—', '—', '—'],
        ['Lojas', '—', '—', '—'],
      ]);
      expect(detail.querySelector('.falhas-dele')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('hoje 19:37 Demorou demais · 3 vezes · Busca');
      expect(detail.querySelector('.oficial')?.textContent).toContain('A conta daqui começou em 05/nov/2026; o número oficial é o do painel.');
    });

    it('os números de cada dia também estão numa tabela', async () => {
      const { detail } = await opened('TMDB');
      const rows = [...detail.querySelectorAll('app-uso-dias tbody tr')].map((r) => [...r.children].map((c) => c.textContent?.trim()));
      expect(rows).toEqual([
        ['20/nov', '2', '—', '400 ms'],
        ['18/nov', '8', '—', '400 ms'],
      ]);
      expect(detail.querySelector('app-uso-dias caption')).not.toBeNull();
      expect(detail.textContent).toContain('Nenhuma entre as 50 falhas mais novas de todos os serviços.');
      // sem falhas, a legenda some: com uma cor só, o título já diz o que é
      expect(detail.querySelector('app-uso-dias .legenda')).toBeNull();
    });

    it('a dica mostra o dia que o mouse aponta', async () => {
      const { detail, fixture } = await opened('TMDB');
      const columns = detail.querySelectorAll('app-uso-dias .coluna');
      columns[27]!.dispatchEvent(new PointerEvent('pointerenter'));
      await fixture.whenStable();
      expect(detail.querySelector('app-uso-dias .dica')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('18/nov8 pedidos');
      columns[0]!.dispatchEvent(new PointerEvent('pointerenter'));
      await fixture.whenStable();
      expect(detail.querySelector('app-uso-dias .dica')?.textContent).toContain('antes da contagem');
    });

    it('com uma operação só, não há tabela de operações; sem uso, diz isso no lugar do gráfico', async () => {
      const { detail } = await opened('Wikipedia');
      expect(detail.querySelector('.operacoes')).toBeNull();
      expect(detail.querySelector('app-uso-dias [role="img"]')).toBeNull();
      expect(detail.textContent).toContain('Nenhuma chamada nos últimos 30 dias.');
    });
  });

  describe('o Testar agora', () => {
    async function openRawg(probe: (path: string) => Promise<unknown>) {
      const t = setup(async () => answer, undefined, probe);
      await t.settle();
      t.rowOf('RAWG').querySelector('button')!.click();
      await t.settle();
      return t;
    }

    it('só nos catálogos que dá para testar, dizendo que gasta da cota', async () => {
      const t = await openRawg(async () => ({}));
      expect(t.text('.detalhe .teste-texto')).toBe('Uma chamada de verdade, pela chave do site: gasta 1 pedido da cota.');
      t.rowOf('Wikipedia').querySelector('button')!.click();
      await t.settle();
      expect(t.host.querySelector('.detalhe .teste')).toBeNull();
    });

    it('chama a API, diz o que achou e busca os números de novo', async () => {
      const t = await openRawg(async () => ({ servico: 'rawg', desfecho: 'ok', status: 200, ms: 420, em: NOW }));
      t.account.request.calls.reset();
      t.host.querySelector<HTMLButtonElement>('.detalhe .teste button')!.click();
      await t.settle();
      expect(t.account.request).toHaveBeenCalledWith('/v1/admin/testar/rawg', { method: 'POST' });
      expect(t.account.request).toHaveBeenCalledWith('/v1/admin/uso');
      expect(t.text('.detalhe .teste-texto')).toBe('Respondeu em 420 ms, às 19:40.');
      expect(t.host.querySelector('.detalhe .teste-texto .ruim')).toBeNull();
    });

    it('a queda vem em vermelho, e a recusa do intervalo em palavras', async () => {
      let calls = 0;
      const t = await openRawg(async () => {
        if (++calls === 1) return { servico: 'rawg', desfecho: 'fora', status: 522, ms: 7900, em: NOW };
        throw new CloudError('Espere', 'teste-devagar', 429);
      });
      const button = () => t.host.querySelector<HTMLButtonElement>('.detalhe .teste button')!;
      button().click();
      await t.settle();
      expect(t.text('.detalhe .teste-texto .ruim')).toBe('Fora do ar · 522, às 19:40.');
      button().click();
      await t.settle();
      expect(t.text('.detalhe .teste-texto')).toBe('Espere uns segundos para testar de novo.');
    });
  });

  describe('as últimas falhas', () => {
    it('cada falha diz quando, quem e o que houve; tocar abre o detalhe do serviço', async () => {
      const t = setup(async () => answer);
      await t.settle();
      const items = [...t.host.querySelectorAll('.lista-falhas .falha')];
      expect(items.length).toBe(1);
      expect(items[0]!.querySelector('.quando')?.textContent).toBe('hoje 19:37');
      expect(items[0]!.querySelector('.falha-nome')?.textContent).toBe('RAWG');
      expect(items[0]!.querySelector('.falha-texto')?.textContent).toBe('Demorou demais · 3 vezes');
      (items[0] as HTMLButtonElement).click();
      await t.settle();
      const button = t.rowOf('RAWG').querySelector('button')!;
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(button);
    });

    it('só as das últimas 24 h ficam em vermelho', async () => {
      const old = { em: '2026-11-17T10:00:00.000Z', servico: 'tmdb', operacao: 'busca', medidoEm: 'worker', desfecho: 'fora', status: 502, repeticoes: 1 };
      const t = setup(async () => ({ ...answer, falhas: [...answer.falhas, old] }));
      await t.settle();
      const texts = [...t.host.querySelectorAll('.falha-texto')];
      expect(texts.map((x) => x.classList.contains('recente'))).toEqual([true, false]);
      expect(t.host.querySelectorAll('.falha .quando')[1]?.textContent).toBe('17/nov 07:00');
    });

    it('sem falhas, diz isso', async () => {
      const t = setup(async () => ({ ...answer, falhas: [] }));
      await t.settle();
      expect(t.text('.falhas')).toContain('Nenhuma falha nos últimos 30 dias.');
    });

    it('mostra as mais novas, e o resto num toque', async () => {
      const many = Array.from({ length: 12 }, (_, i) => ({ em: minutesAgo(i + 1), servico: 'tmdb', operacao: 'busca', medidoEm: 'worker', desfecho: 'fora', status: 502, repeticoes: 1 }));
      const t = setup(async () => ({ ...answer, falhas: many }));
      await t.settle();
      expect(t.host.querySelectorAll('.lista-falhas li').length).toBe(8);
      const more = t.host.querySelector<HTMLButtonElement>('.falhas .mais')!;
      expect(more.textContent?.trim()).toBe('Ver as 12');
      more.click();
      await t.settle();
      expect(t.host.querySelectorAll('.lista-falhas li').length).toBe(12);
      expect(t.host.querySelector('.falhas .mais')).toBeNull();
    });
  });

  it('todo limite do catálogo está ao alcance, e o que não se conta também', async () => {
    const t = setup(async () => nothing);
    await t.settle();
    for (const s of SERVICOS) {
      t.rowOf(s.nome).querySelector('button')!.click();
      await t.settle();
      expect(t.host.querySelector('.detalhe')?.textContent).withContext(s.id).toContain(s.limite.texto);
    }
    expect(t.host.querySelectorAll('.manilha dt').length).toBe(SEM_CONTAGEM.length);
    expect(t.text('.manilha summary')).toContain(`(${SEM_CONTAGEM.length})`);
  });

  it('a tabela tem nome e cabeçalhos para o leitor de tela', async () => {
    const t = setup(async () => answer);
    await t.settle();
    expect(t.host.querySelector('.razao caption')?.textContent).toContain('serviço');
    expect(t.host.querySelector('.razao thead th')?.getAttribute('scope')).toBe('col');
    expect(t.rowOf('RAWG').querySelector('th')?.getAttribute('scope')).toBe('row');
  });

  it('sem nada contado ainda, a tela não quebra e diz isso', async () => {
    const t = setup(async () => nothing);
    await t.settle();
    expect(t.sentence()).toContain('A contagem ainda não começou.');
    expect(t.host.querySelector('.razao')).not.toBeNull();
    expect(t.cells('RAWG')).toEqual(['0', '0', '0', '—', '—', '—']);
  });

  it('Atualizar busca de novo, sem apagar o que está na tela enquanto isso', async () => {
    let release!: (v: unknown) => void;
    let calls = 0;
    const t = setup(() => {
      calls++;
      return calls === 1 ? Promise.resolve(answer) : new Promise((resolve) => (release = resolve));
    });
    await t.settle();
    expect(t.text('.intro')).toBe('Atualizado às 19:40.');
    const button = t.host.querySelector<HTMLButtonElement>('.topo .botao')!;
    button.click();
    await t.settle();
    expect(calls).toBe(2);
    expect(t.text('.intro')).toBe('Atualizando…');
    expect(button.disabled).toBeTrue();
    expect(t.host.querySelector('.razao')).not.toBeNull();
    release({ ...answer, geradoEm: '2026-11-20T22:50:00.000Z' });
    await t.settle();
    expect(t.text('.intro')).toBe('Atualizado às 19:50.');
    expect(button.disabled).toBeFalse();
  });

  it('o erro ao atualizar não tira os números: diz de quando eles são', async () => {
    let calls = 0;
    const t = setup(async () => {
      if (++calls === 2) throw new CloudError('Sem conexão', 'sem-rede', 0);
      return answer;
    });
    await t.settle();
    t.host.querySelector<HTMLButtonElement>('.topo .botao')!.click();
    await t.settle();
    expect(t.text('.intro')).toBe('Não deu para atualizar. Os números são das 19:40.');
    expect(t.host.querySelector('.razao')).not.toBeNull();
    expect(t.sentence()).toContain('A RAWG está fora do ar');
  });

  it('sem resposta na primeira vez: diz, deixa tentar de novo, e sem cartolina vazia', async () => {
    let fail = true;
    const t = setup(async () => {
      if (fail) throw new CloudError('Sem conexão', 'sem-rede', 0);
      return answer;
    });
    await t.settle();
    expect(t.sentence()).toBe('Não deu para buscar os números agora.');
    expect(t.host.querySelector('.cotas')).toBeNull();
    expect(t.host.querySelector('.esqueleto')).toBeNull();
    // nada que finja ter números: nem a tabela, nem as falhas; o catálogo do que não se conta fica
    expect(t.host.querySelector('.mesa')).toBeNull();
    expect(t.text('.intro')).toBe('Sem números agora.');
    expect(t.host.querySelector('.manilha')).not.toBeNull();
    fail = false;
    t.host.querySelector<HTMLButtonElement>('.frase + button')!.click();
    await t.settle();
    expect(t.host.querySelector('.razao')).not.toBeNull();
    expect(t.host.querySelector('.frase + button')).toBeNull();
  });

  it('a nuvem disse que não é mais admin: atualiza a conta e volta para Extras', async () => {
    const t = setup(async () => {
      throw new CloudError('Só a conta de admin vê isto.', 'so-admin', 403);
    });
    const go = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    await t.settle();
    expect(t.refresh).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledOnceWith('/extras');
  });

  it('quem já saiu da página não é levado para lugar nenhum', async () => {
    let refuse!: (e: unknown) => void;
    const t = setup(() => new Promise((_, reject) => (refuse = reject)));
    const go = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    t.fixture.destroy();
    refuse(new CloudError('Só a conta de admin vê isto.', 'so-admin', 403));
    await new Promise((r) => setTimeout(r));
    expect(go).not.toHaveBeenCalled();
  });

  it('nada do que ela mostra fica no navegador', async () => {
    localStorage.clear();
    sessionStorage.clear();
    const t = setup(async () => answer);
    await t.settle();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe('o catálogo das APIs', () => {
  it('cada id aparece uma vez, e só uma cota global diz o total', () => {
    expect(new Set(SERVICOS.map((s) => s.id)).size).toBe(SERVICOS.length);
    const quotas = SERVICOS.filter((s) => s.limite.cota);
    expect(quotas.map((s) => s.id)).toEqual(['rawg', 'google-agenda']);
    for (const s of quotas) expect(s.limite.tipo).toBe('cota-global');
  });

  it('todo limite com fonte diz quando foi conferido', () => {
    for (const s of SERVICOS) {
      expect(!!s.limite.fonte).withContext(s.id).toBe(!!s.limite.conferidoEm);
      if (s.limite.conferidoEm) expect(s.limite.conferidoEm).withContext(s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('quem limita por pessoa nunca promete um total', () => {
    for (const s of SERVICOS.filter((x) => x.limite.tipo === 'por-pessoa')) {
      expect(s.limite.cota).withContext(s.id).toBeUndefined();
      expect(s.limite.texto).withContext(s.id).toContain('Não há um total para acabar.');
    }
  });

  it('a chave própria não gasta a cota do site', () => {
    const own = SERVICOS.find((s) => s.id === 'chave-propria')!;
    expect(own.limite.tipo).toBe('da-pessoa');
    expect(own.limite.cota).toBeUndefined();
  });
});
