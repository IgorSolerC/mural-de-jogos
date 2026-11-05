import { SERVICOS } from '../../../contrato/uso-apis/servicos';
import { ApiUsage, CloudflareReport, UsageFailure, UsageLine, ago, clock, dayLabel, dayShort, dayTurn, daysOf, duration, failureText, howItIs, levelOf, megabytes, operationsOf, parseCloudflare, parseUsage, percent, quotasOf, runsOutOn, shortNumber, statusOf, totalsOf, usageView, when } from './api-usage';

const NOW = new Date('2026-11-20T22:40:00.000Z');
const NOW_ISO = NOW.toISOString();
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

function line(over: Partial<UsageLine> = {}): UsageLine {
  return { dia: '2026-11-20', servico: 'rawg', operacao: 'busca', medidoEm: 'worker', desfecho: 'ok', pedidos: 1, msTotal: 100, msMax: 100, ultimoEm: minutesAgo(5), ...over };
}

function failure(over: Partial<UsageFailure> = {}): UsageFailure {
  return { em: minutesAgo(5), servico: 'rawg', operacao: 'busca', medidoEm: 'worker', desfecho: 'fora', status: 522, repeticoes: 1, ...over };
}

function usage(over: Partial<ApiUsage> = {}): ApiUsage {
  return { geradoEm: NOW_ISO, contandoDesde: '2026-11-01', linhas: [], falhas: [], proprias: { dia: '2026-11-20', linhasGravadas: 0, cotaLinhas: 60_000, imagens: { imagens: 1, bytes: 1024 * 1024, cota: 400 * 1024 * 1024 } }, ...over };
}

describe('as contas do Uso das APIs', () => {
  describe('o que veio da API', () => {
    it('as linhas vêm como listas, e o que não tem a forma certa sai', () => {
      const u = parseUsage({ geradoEm: NOW_ISO, contandoDesde: '2026-11-01', linhas: [['2026-11-20', 'rawg', 'busca', 'worker', 'ok', 3, 300, 200, NOW_ISO], ['curta'], 'nada', [1, 2, 3, 4, 5, 6, 7, 8, 9]], falhas: [failure(), { em: 1 }, null] });
      expect(u.linhas).toEqual([line({ pedidos: 3, msTotal: 300, msMax: 200, ultimoEm: NOW_ISO })]);
      expect(u.falhas.length).toBe(1);
    });

    it('uma resposta vazia não quebra a tela', () => {
      const u = parseUsage(null);
      expect(u.linhas).toEqual([]);
      expect(u.contandoDesde).toBeNull();
      expect(u.proprias.cotaLinhas).toBe(0);
      expect(() => usageView(u)).not.toThrow();
    });
  });

  describe('os totais', () => {
    it('hoje, 7 dias, 30 dias e o mês, cada um na sua janela', () => {
      const t = totalsOf(
        [
          line({ pedidos: 1 }),
          line({ dia: '2026-11-14', pedidos: 10 }), // 7 dias: até o dia 14
          line({ dia: '2026-11-13', pedidos: 100 }),
          line({ dia: '2026-11-01', pedidos: 1000 }),
          line({ dia: '2026-10-22', pedidos: 10000 }), // 30 dias: até 22/out, fora do mês
          line({ dia: '2026-10-21', pedidos: 100000 }),
        ],
        NOW,
      );
      expect(t.hoje).toBe(1);
      expect(t.semana).toBe(11);
      expect(t.mes).toBe(1111);
      expect(t.trinta).toBe(11111);
    });

    it('a falha é a parte dos últimos 7 dias, e sem pedido não há número', () => {
      expect(totalsOf([], NOW).falhas).toBeNull();
      const t = totalsOf([line({ pedidos: 3 }), line({ desfecho: 'fora', pedidos: 1 }), line({ dia: '2026-11-01', desfecho: 'fora', pedidos: 50 })], NOW);
      expect(t.falhas).toBe(0.25);
    });

    it('não achar é uma resposta normal, e desistir de digitar não conta para nada', () => {
      const t = totalsOf([line({ desfecho: 'nao-achou', pedidos: 3 }), line({ desfecho: 'cancelada', pedidos: 50, ultimoEm: minutesAgo(1) })], NOW);
      expect(t.hoje).toBe(3);
      expect(t.falhas).toBe(0);
      expect(t.ultimoDesfecho).toBe('nao-achou');
      expect(t.ultimaBoa).toBe(minutesAgo(5));
    });

    it('o tempo é só o das respostas boas: um prazo de 8 s não vira lentidão', () => {
      const t = totalsOf([line({ pedidos: 2, msTotal: 400 }), line({ desfecho: 'prazo', pedidos: 1, msTotal: 8000 })], NOW);
      expect(t.tempoMs).toBe(200);
    });
  });

  describe('as cotas', () => {
    const rawg = (u: ApiUsage) => quotasOf(u, NOW).find((q) => q.id === 'rawg')!;

    it('a RAWG conta o mês, e o Google Agenda, o dia', () => {
      const u = usage({ linhas: [line({ pedidos: 2 }), line({ dia: '2026-11-02', pedidos: 3 }), line({ dia: '2026-10-30', pedidos: 500 }), line({ servico: 'google-agenda', pedidos: 7 }), line({ servico: 'google-agenda', dia: '2026-11-19', pedidos: 900 })] });
      expect(rawg(u)).toEqual(jasmine.objectContaining({ usado: 5, total: 20_000, falta: 19_995, janela: 'mes', nivel: 'folga' }));
      expect(quotasOf(u, NOW).find((q) => q.id === 'google-agenda')).toEqual(jasmine.objectContaining({ usado: 7, total: 1_000_000, janela: 'dia' }));
    });

    it('as falhas também gastam a cota da chave, e a chave própria não', () => {
      const u = usage({ linhas: [line({ desfecho: 'fora', pedidos: 4 }), line({ servico: 'chave-propria', operacao: 'rawg', medidoEm: 'navegador', pedidos: 1000 })] });
      expect(rawg(u).usado).toBe(4);
    });

    it('as faltas nunca ficam negativas', () => {
      const q = rawg(usage({ linhas: [line({ pedidos: 25_000 })] }));
      expect(q.falta).toBe(0);
      expect(q.nivel).toBe('quase');
    });

    it('os níveis: 70% e 90%, os mesmos da checagem diária', () => {
      expect(levelOf(0.699)).toBe('folga');
      expect(levelOf(0.7)).toBe('perto');
      expect(levelOf(0.899)).toBe('perto');
      expect(levelOf(0.9)).toBe('quase');
    });

    it('no primeiro mês, diz desde quando conta; nos outros, não', () => {
      expect(rawg(usage({ contandoDesde: '2026-11-05' })).desde).toBe('2026-11-05');
      expect(rawg(usage({ contandoDesde: '2026-11-01' })).desde).toBeNull();
      expect(rawg(usage({ contandoDesde: '2026-08-15' })).desde).toBeNull();
    });

    it('a cota própria e as imagens entram; sem elas, não', () => {
      const ids = (u: ApiUsage) => quotasOf(u, NOW).map((q) => q.id);
      expect(ids(usage())).toEqual(['rawg', 'google-agenda', 'linhas', 'imagens']);
      expect(ids(usage({ proprias: { dia: '', linhasGravadas: 0, cotaLinhas: 0, imagens: null } }))).toEqual(['rawg', 'google-agenda']);
    });

    it('quem limita por pessoa nunca vira régua', () => {
      const ids = quotasOf(usage(), NOW).map((q) => q.id);
      for (const s of SERVICOS.filter((x) => x.limite.tipo === 'por-pessoa')) expect(ids).not.toContain(s.id);
    });

    describe('o ritmo do mês', () => {
      it('com poucos dias contados, não diz nada', () => {
        const u = usage({ contandoDesde: '2026-11-16', linhas: [line({ pedidos: 15_000 })] });
        expect(runsOutOn(rawg(u), u, NOW)).toBeNull();
      });

      it('diz o dia em que acaba', () => {
        // 16 mil em 20 dias: 800 por dia; faltam 4 mil, 5 dias
        const u = usage({ linhas: [line({ pedidos: 16_000 })] });
        expect(runsOutOn(rawg(u), u, NOW)).toBe(25);
      });

      it('não promete um dia depois do fim do mês', () => {
        const u = usage({ linhas: [line({ pedidos: 12_000 })] });
        expect(runsOutOn(rawg(u), u, NOW)).toBeNull();
      });

      it('sem nada gasto, ou já acabada, não há ritmo', () => {
        const none = usage();
        expect(runsOutOn(rawg(none), none, NOW)).toBeNull();
        const over = usage({ linhas: [line({ pedidos: 20_000 })] });
        expect(runsOutOn(rawg(over), over, NOW)).toBeNull();
      });
    });
  });

  describe('o estado de um serviço', () => {
    function status(lines: UsageLine[], failures: UsageFailure[] = [], level: 'folga' | 'perto' | 'quase' | null = null, counted = true) {
      return statusOf(totalsOf(lines, NOW), lines, failures, level, NOW, counted);
    }

    it('sem contagem ainda, não finge que não foi usado', () => {
      expect(status([], [], null, false).status).toBe('sem-contagem');
    });

    it('nada em 7 dias é sem uso, mesmo com chamadas mais velhas', () => {
      expect(status([]).status).toBe('sem-uso');
      expect(status([line({ dia: '2026-11-01', ultimoEm: '2026-11-01T10:00:00.000Z' })]).status).toBe('sem-uso');
    });

    it('a última boa é respondendo', () => {
      expect(status([line()]).status).toBe('ok');
      expect(status([line({ desfecho: 'nao-achou' })]).status).toBe('ok');
    });

    it('fora do ar: três falhas depois da última resposta boa, e diz desde quando', () => {
      const lines = [line({ ultimoEm: minutesAgo(60) }), line({ desfecho: 'fora', pedidos: 3, ultimoEm: minutesAgo(5) })];
      const r = status(lines, [failure({ em: minutesAgo(5) }), failure({ em: minutesAgo(30), repeticoes: 2 })]);
      expect(r).toEqual({ status: 'fora', desde: minutesAgo(30) });
    });

    it('prazo vencido também é queda: é o que a RAWG faz', () => {
      expect(status([line({ desfecho: 'prazo', pedidos: 3 })], [failure({ desfecho: 'prazo', status: null, repeticoes: 3 })]).status).toBe('fora');
    });

    it('duas falhas ainda não são queda', () => {
      expect(status([line({ desfecho: 'fora', pedidos: 2 })], [failure({ repeticoes: 2 })]).status).toBe('falhou');
    });

    it('as falhas de antes de uma resposta boa não contam: voltou', () => {
      const lines = [line({ desfecho: 'fora', pedidos: 9, ultimoEm: minutesAgo(30) }), line({ ultimoEm: minutesAgo(1) })];
      expect(status(lines, [failure({ em: minutesAgo(30), repeticoes: 9 })]).status).toBe('ok');
    });

    it('uma queda sem chamada há mais de uma hora não diz que continua fora: só que a última falhou', () => {
      const lines = [line({ desfecho: 'fora', pedidos: 5, ultimoEm: minutesAgo(90) })];
      expect(status(lines, [failure({ em: minutesAgo(90), repeticoes: 5 })]).status).toBe('falhou');
    });

    it('o limite vale por uma hora, e a chave recusada, até responder de novo', () => {
      expect(status([line({ desfecho: 'limite', ultimoEm: minutesAgo(10) })]).status).toBe('limite');
      expect(status([line({ ultimoEm: minutesAgo(1) }), line({ desfecho: 'limite', ultimoEm: minutesAgo(90) })]).status).toBe('ok');
      expect(status([line({ desfecho: 'recusada', ultimoEm: minutesAgo(600) })]).status).toBe('recusada');
    });

    it('a cota acabando aparece, e uma queda fala mais alto que ela', () => {
      expect(status([line()], [], 'perto').status).toBe('perto');
      expect(status([line()], [], 'quase').status).toBe('quase');
      expect(status([line({ desfecho: 'fora', pedidos: 3 })], [failure({ repeticoes: 3 })], 'quase').status).toBe('fora');
    });
  });

  describe('a frase', () => {
    const sentence = (u: ApiUsage) => usageView(u).sentence;
    const goodDays = [line({ dia: '2026-11-18', ultimoEm: '2026-11-18T10:00:00.000Z' }), line({ servico: 'tmdb', dia: '2026-11-18', ultimoEm: '2026-11-18T10:00:00.000Z' })];

    it('sem contagem nenhuma', () => {
      expect(sentence(usage({ contandoDesde: null }))).toContain('A contagem ainda não começou.');
    });

    it('a contagem começou hoje', () => {
      expect(sentence(usage({ contandoDesde: '2026-11-20', linhas: [line()] }))).toContain('A contagem começou hoje.');
    });

    it('tudo bem: quem está mais perto do fim', () => {
      const u = usage({ linhas: [...goodDays, line({ pedidos: 2400 })] });
      expect(sentence(u)).toBe('Tudo respondendo. O mais perto do fim: a RAWG, com 12% do mês.');
    });

    it('tudo bem, com as cotas no começo', () => {
      expect(sentence(usage({ linhas: goodDays, proprias: { dia: '', linhasGravadas: 0, cotaLinhas: 0, imagens: null } }))).toBe('Tudo respondendo, e nenhuma cota passou de 1%.');
    });

    it('o mais perto do fim pode ser outra coisa, com o nome certo', () => {
      const own = (linhasGravadas: number, bytes: number) => ({ dia: '2026-11-20', linhasGravadas, cotaLinhas: 60_000, imagens: { imagens: 1, bytes, cota: 400 * 1024 * 1024 } });
      expect(sentence(usage({ linhas: goodDays, proprias: own(6_000, 0) }))).toBe('Tudo respondendo. O mais perto do fim: a cota de gravações, com 10% de hoje.');
      expect(sentence(usage({ linhas: goodDays, proprias: own(0, 80 * 1024 * 1024) }))).toBe('Tudo respondendo. O mais perto do fim: o espaço das imagens, com 20% ocupado.');
    });

    it('nada chamado em 7 dias', () => {
      expect(sentence(usage({ contandoDesde: '2026-08-01' }))).toBe('Nada foi chamado nos últimos 7 dias.');
    });

    it('um catálogo fora: desde quando, e para onde as buscas foram, sem esconder o resto', () => {
      const u = usage({ linhas: [line({ desfecho: 'fora', pedidos: 3 }), line({ servico: 'tmdb' })], falhas: [failure({ em: '2026-11-20T22:30:00.000Z', repeticoes: 3 })] });
      expect(sentence(u)).toBe('A RAWG está fora do ar desde 19:30: as buscas de jogos estão indo para a Wikipedia. O resto está respondendo.');
    });

    it('com um artigo masculino, e sem falar do resto quando não há resto', () => {
      const u = usage({ linhas: [line({ servico: 'tmdb', desfecho: 'prazo', pedidos: 3 })], falhas: [failure({ servico: 'tmdb', desfecho: 'prazo', status: null, em: '2026-11-20T22:30:00.000Z', repeticoes: 3 })] });
      expect(sentence(u)).toBe('O TMDB está fora do ar desde 19:30: as buscas de filmes e séries estão indo para a Wikipedia.');
    });

    it('a última chamada falhou, com o artigo certo', () => {
      expect(sentence(usage({ linhas: [line({ desfecho: 'outro' })] }))).toContain('A última chamada à RAWG falhou.');
      expect(sentence(usage({ linhas: [line({ servico: 'tmdb', desfecho: 'outro' })] }))).toContain('A última chamada ao TMDB falhou.');
    });

    it('uma cota perto do fim: quanto falta e, com dias bastantes, quando acaba', () => {
      expect(sentence(usage({ linhas: [line({ pedidos: 16_000 })] }))).toBe('Faltam 4.000 pedidos na RAWG até dia 1º. No ritmo deste mês, acabam dia 25.');
    });

    it('uma cota do dia diz a hora em que a conta vira', () => {
      const own = { dia: '2026-11-20', linhasGravadas: 48_000, cotaLinhas: 60_000, imagens: null };
      expect(sentence(usage({ linhas: goodDays, proprias: own }))).toBe('Faltam 12.000 linhas na cota de gravações até as 21h.');
    });

    it('várias coisas ao mesmo tempo viram uma lista', () => {
      const u = usage({ linhas: [line({ desfecho: 'fora', pedidos: 3 }), line({ servico: 'tmdb', desfecho: 'limite', ultimoEm: minutesAgo(2) })], falhas: [failure({ em: '2026-11-20T22:30:00.000Z', repeticoes: 3 })] });
      expect(sentence(u)).toBe('Duas coisas pedem atenção: a RAWG está fora do ar desde 19:30 e o TMDB bateu no limite.');
    });
  });

  describe('a tela inteira', () => {
    it('cada grupo tem os serviços dele, com o que pede atenção em cima', () => {
      const v = usageView(usage({ linhas: [line({ servico: 'tmdb' }), line({ desfecho: 'fora', pedidos: 3 })], falhas: [failure({ repeticoes: 3 })] }));
      expect(v.groups.map((g) => g.id)).toEqual(['worker', 'navegador', 'cloudflare']);
      expect(v.groups[0]!.rows.slice(0, 2).map((r) => [r.service.id, r.status])).toEqual([
        ['rawg', 'fora'],
        ['tmdb', 'ok'],
      ]);
    });

    it('sem a leitura, só a Cloudflare diz que ainda não conta', () => {
      const v = usageView(usage());
      for (const g of v.groups) for (const r of g.rows) expect(r.status).withContext(r.service.id).toBe(g.id === 'cloudflare' ? 'sem-contagem' : 'sem-uso');
    });

    it('o que o navegador contou aparece, e é uma conta só daquele serviço', () => {
      const v = usageView(usage({ linhas: [line({ servico: 'wikipedia', operacao: 'geral', medidoEm: 'navegador', pedidos: 7 })] }));
      const row = v.groups.find((g) => g.id === 'navegador')!.rows.find((r) => r.service.id === 'wikipedia')!;
      expect(row.status).toBe('ok');
      expect(row.totals.hoje).toBe(7);
      expect(v.quotas.find((q) => q.id === 'rawg')!.usado).toBe(0);
    });

    it('visto do navegador, a tela não afirma que o serviço caiu: pode ser a rede de uma pessoa', () => {
      const lines = [line({ servico: 'kitsu', operacao: 'geral', medidoEm: 'navegador', desfecho: 'fora', pedidos: 3 })];
      const failures = [failure({ servico: 'kitsu', operacao: 'geral', medidoEm: 'navegador', em: '2026-11-20T22:30:00.000Z', status: null, repeticoes: 3 })];
      const v = usageView(usage({ linhas: lines, falhas: failures }));
      const row = v.groups.find((g) => g.id === 'navegador')!.rows[0]!;
      expect(row.status).toBe('falhando');
      expect(v.sentence).toContain('O Kitsu está falhando nos navegadores desde 19:30');
      expect(v.sentence).not.toContain('fora do ar');
    });

    it('uma linha da chave própria nunca vira a linha da RAWG', () => {
      const v = usageView(usage({ linhas: [line({ servico: 'chave-propria', operacao: 'rawg', medidoEm: 'navegador', pedidos: 9 })] }));
      expect(v.groups[0]!.rows.find((r) => r.service.id === 'rawg')!.totals.hoje).toBe(0);
    });

    it('todo serviço tem a frase pronta', () => {
      for (const s of SERVICOS) expect(s.chamado).withContext(s.id).toMatch(/^[ao] /);
      expect(SERVICOS.filter((s) => s.reserva).map((s) => s.id)).toEqual(['rawg', 'tmdb']);
    });
  });

  describe('a Cloudflare', () => {
    const cf = (over: Partial<CloudflareReport['dias'][number]> = {}, rest: Partial<CloudflareReport> = {}): CloudflareReport => ({
      estado: 'ok',
      geradoEm: NOW_ISO,
      dias: [
        { dia: '2026-11-20', pedidos: 7000, erros: 7, cortados: 0, linhasLidas: 400_000, linhasGravadas: 3000, ...over },
        { dia: '2026-11-19', pedidos: 5000, erros: 0, cortados: 0, linhasLidas: 100_000, linhasGravadas: 1000 },
      ],
      workers: [],
      bancos: [{ nome: 'mural', bytes: 5 * 1024 * 1024 }],
      ...rest,
    });

    it('o que veio da rota, sem confiar na forma', () => {
      expect(parseCloudflare(null).estado).toBe('fora');
      expect(parseCloudflare({ estado: 'qualquer' }).estado).toBe('fora');
      expect(parseCloudflare({ estado: 'sem-token' })).toEqual({ estado: 'sem-token', geradoEm: '', dias: [], workers: [], bancos: [] });
      expect(parseCloudflare({ estado: 'ok', dias: 'x', workers: 1, bancos: null }).dias).toEqual([]);
    });

    it('os limites da conta inteira entram, com os números do plano grátis', () => {
      const q = quotasOf(usage(), NOW, cf());
      expect(q.map((x) => x.id)).toEqual(['rawg', 'cf-pedidos', 'cf-lidas', 'cf-gravadas', 'google-agenda', 'linhas', 'banco-mural', 'imagens']);
      expect(q.find((x) => x.id === 'cf-pedidos')).toEqual(jasmine.objectContaining({ usado: 7000, total: 100_000, falta: 93_000, janela: 'dia' }));
      expect(q.find((x) => x.id === 'cf-lidas')).toEqual(jasmine.objectContaining({ total: 5_000_000 }));
      expect(q.find((x) => x.id === 'cf-gravadas')).toEqual(jasmine.objectContaining({ total: 100_000 }));
      expect(q.find((x) => x.id === 'banco-mural')).toEqual(jasmine.objectContaining({ total: 500 * 1024 * 1024, janela: 'sempre', unidade: 'bytes' }));
    });

    it('sem a leitura, nenhuma régua inventada', () => {
      for (const report of [null, parseCloudflare({ estado: 'sem-token' }), parseCloudflare({ estado: 'fora' })]) {
        expect(quotasOf(usage(), NOW, report).map((x) => x.id)).toEqual(['rawg', 'google-agenda', 'linhas', 'imagens']);
      }
    });

    it('a resposta guardada de ontem não vira o número de hoje', () => {
      const old = cf({}, { dias: [{ dia: '2026-11-19', pedidos: 99_000, erros: 0, cortados: 0, linhasLidas: 0, linhasGravadas: 0 }] });
      expect(quotasOf(usage(), NOW, old).some((x) => x.id === 'cf-pedidos')).toBeFalse();
    });

    it('a linha dela: os pedidos de hoje, só de hoje, e o pior nível', () => {
      const row = (report: CloudflareReport | null) => usageView(usage(), report).groups.find((g) => g.id === 'cloudflare')!.rows[0]!;
      expect(row(null).status).toBe('sem-contagem');
      const ok = row(cf());
      expect(ok.status).toBe('ok');
      expect(ok.soHoje).toBeTrue();
      expect(ok.totals.hoje).toBe(7000);
      expect(ok.totals.falhas).toBe(0.001);
      expect(row(cf({ pedidos: 75_000 })).status).toBe('perto');
      expect(row(cf({ linhasGravadas: 95_000 })).status).toBe('quase');
      expect(row(cf({}, { bancos: [{ nome: 'mural', bytes: 480 * 1024 * 1024 }] })).status).toBe('quase');
    });

    it('sem pedido hoje, a falha fica em branco', () => {
      expect(usageView(usage(), cf({ pedidos: 0, erros: 0 })).groups.find((g) => g.id === 'cloudflare')!.rows[0]!.totals.falhas).toBeNull();
    });

    it('o dia de ontem fica à mão, e só com a leitura', () => {
      expect(usageView(usage(), cf()).ontem?.pedidos).toBe(5000);
      expect(usageView(usage()).ontem).toBeNull();
    });

    it('a frase fala dela quando há o que dizer', () => {
      const s = (report: CloudflareReport) => usageView(usage({ linhas: [line({ servico: 'tmdb', dia: '2026-11-18', ultimoEm: '2026-11-18T10:00:00.000Z' })] }), report).sentence;
      expect(s(cf())).toBe('Tudo respondendo. O mais perto do fim: as linhas lidas, com 8% de hoje.');
      expect(s(cf({ linhasLidas: 1000 }))).toBe('Tudo respondendo. O mais perto do fim: os pedidos aos Workers, com 7% de hoje.');
      expect(s(cf({ pedidos: 80_000 }))).toBe('Faltam 20.000 pedidos aos Workers até as 21h.');
      expect(s(cf({ linhasGravadas: 80_000 }))).toBe('Faltam 20.000 linhas gravadas no D1 até as 21h.');
      expect(s(cf({ cortados: 3 }))).toBe('A Cloudflare cortou 3 pedidos hoje por passar do limite.');
      expect(s(cf({ cortados: 1 }))).toBe('A Cloudflare cortou 1 pedido hoje por passar do limite.');
      expect(s(cf({}, { bancos: [{ nome: 'mural', bytes: 400 * 1024 * 1024 }] }))).toBe('Faltam 100 MB no banco mural.');
    });
  });

  describe('o detalhe de um serviço', () => {
    it('30 dias, do mais velho para hoje; o antes da contagem é desconhecido, não zero', () => {
      const days = daysOf([], NOW, '2026-11-05');
      expect(days.length).toBe(30);
      expect(days[0]!.dia).toBe('2026-10-22');
      expect(days.at(-1)!.dia).toBe('2026-11-20');
      expect(days.filter((d) => !d.contado).map((d) => d.dia).at(-1)).toBe('2026-11-04');
      expect(days.find((d) => d.dia === '2026-11-05')!.contado).toBeTrue();
      expect(daysOf([], NOW, null).every((d) => !d.contado)).toBeTrue();
    });

    it('cada dia soma as boas e as falhas; cancelar não conta, e o tempo é só das boas', () => {
      const days = daysOf(
        [
          line({ desfecho: 'ok', pedidos: 4, msTotal: 800 }),
          line({ desfecho: 'nao-achou', pedidos: 1, msTotal: 9000 }),
          line({ desfecho: 'prazo', pedidos: 2, msTotal: 16000 }),
          line({ desfecho: 'cancelada', pedidos: 5 }),
          line({ dia: '2026-10-01', pedidos: 50 }),
        ],
        NOW,
        '2026-11-01',
      );
      const today = days.at(-1)!;
      expect(today).toEqual({ dia: '2026-11-20', boas: 5, falhas: 2, total: 7, tempoMs: 200, contado: true });
      expect(days.reduce((n, d) => n + d.total, 0)).toBe(7);
    });

    it('por operação: todas as da lista, na ordem dela, mesmo as que nunca vieram', () => {
      const rows = operationsOf(
        ['busca', 'jogo', 'lojas'],
        [line({ operacao: 'jogo', pedidos: 3, msTotal: 600 }), line({ operacao: 'jogo', desfecho: 'fora', pedidos: 1 }), line({ operacao: 'jogo', dia: '2026-10-01', pedidos: 99 })],
        NOW,
      );
      expect(rows.map((r) => r.nome)).toEqual(['Busca', 'Ficha do jogo', 'Lojas']);
      expect(rows[0]).toEqual({ operacao: 'busca', nome: 'Busca', pedidos: 0, falhas: null, tempoMs: null });
      expect(rows[1]).toEqual({ operacao: 'jogo', nome: 'Ficha do jogo', pedidos: 4, falhas: 0.25, tempoMs: 200 });
    });

    it('a hora de uma falha é a de Brasília, com hoje e ontem por extenso', () => {
      expect(when('2026-11-20T22:12:00.000Z', NOW)).toBe('hoje 19:12');
      // 01:30 UTC do dia 20 ainda é dia 19 em Brasília
      expect(when('2026-11-20T01:30:00.000Z', NOW)).toBe('ontem 22:30');
      expect(when('2026-11-03T17:02:00.000Z', NOW)).toBe('03/nov 14:02');
      expect(dayShort('2026-11-05')).toBe('05/nov');
    });

    it('uma falha em palavras: o que houve, o número de lá e quantas vezes', () => {
      expect(failureText(failure({ status: 522, repeticoes: 3 }))).toBe('Fora do ar · 522 · 3 vezes');
      expect(failureText(failure({ desfecho: 'prazo', status: null }))).toBe('Demorou demais');
      expect(failureText(failure({ desfecho: 'limite', status: 429 }))).toBe('Bateu no limite · 429');
    });
  });

  describe('as palavras', () => {
    it('os números', () => {
      expect(shortNumber(2470)).toBe('2.470');
      expect(shortNumber(20_000)).toBe('20 mil');
      expect(shortNumber(60_000)).toBe('60 mil');
      expect(shortNumber(1_000_000)).toBe('1 mi');
      expect(shortNumber(5_000_000)).toBe('5 mi');
      expect(shortNumber(1_250_000)).toBe('1,3 mi');
      expect(megabytes(1024 * 1024 * 1.5)).toBe('1,5 MB');
    });

    it('a porcentagem nunca arredonda um gasto para zero', () => {
      expect(percent(0)).toBe('0%');
      expect(percent(0.001)).toBe('menos de 1%');
      expect(percent(0.124)).toBe('12%');
      expect(percent(1.2)).toBe('120%');
    });

    it('o tempo', () => {
      expect(duration(420)).toBe('420 ms');
      expect(duration(1234)).toBe('1,2 s');
    });

    it('a hora é a de Brasília, de onde quer que se abra', () => {
      expect(clock('2026-11-20T22:40:00.000Z')).toBe('19:40');
      expect(dayTurn(NOW)).toBe('21h');
    });

    it('há quanto tempo', () => {
      expect(ago(minutesAgo(0), NOW)).toBe('agora');
      expect(ago(minutesAgo(3), NOW)).toBe('há 3 min');
      expect(ago(minutesAgo(120), NOW)).toBe('há 2 h');
      expect(ago(minutesAgo(60 * 25), NOW)).toBe('ontem');
      expect(ago(minutesAgo(60 * 24 * 5), NOW)).toBe('há 5 dias');
    });

    it('a data, sem fuso', () => {
      expect(dayLabel('2026-11-05')).toBe('05/nov/2026');
      expect(dayLabel('2027-01-31')).toBe('31/jan/2027');
    });

    it('a frase usa as funções de sempre', () => {
      const u = usage({ linhas: [line()] });
      expect(howItIs([], [], u, NOW)).toBe('Nada foi chamado nos últimos 7 dias.');
    });
  });
});
