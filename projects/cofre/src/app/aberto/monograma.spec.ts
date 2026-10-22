import { diasNaLixeira } from './lixeira';
import { CORES_DO_MONOGRAMA, corDoMonograma, dominio, letraDoMonograma, nomeDoItem } from './monograma';

describe('o monograma e o nome de cada senha', () => {
  it('o nome: o título, senão o site, senão "Sem título"', () => {
    expect(nomeDoItem({ titulo: ' Banco ', url: 'banco.exemplo' })).toBe('Banco');
    expect(nomeDoItem({ titulo: '', url: 'https://www.banco.exemplo/login' })).toBe('banco.exemplo');
    expect(nomeDoItem({ titulo: '', url: 'javascript:alert(1)' })).toBe('javascript:alert(1)');
    expect(nomeDoItem({ titulo: '  ', url: '' })).toBe('Sem título');
  });

  it('a letra: a primeira letra ou número, sem acento, em maiúscula', () => {
    expect(letraDoMonograma('Água de casa')).toBe('A');
    expect(letraDoMonograma('  (99) Telefone')).toBe('9');
    expect(letraDoMonograma('éter')).toBe('E');
    expect(letraDoMonograma('— · —')).toBe('?');
  });

  it('a cor: sempre a mesma para o mesmo nome, sem ligar para maiúsculas e acentos', () => {
    expect(corDoMonograma('Banco')).toBe(corDoMonograma('banco'));
    expect(corDoMonograma('Ágape')).toBe(corDoMonograma('agape'));
    const cores = new Set(['Banco', 'E-mail', 'Wi-Fi', 'Streaming', 'Netflix', 'Gov', 'Steam', 'Trabalho'].map(corDoMonograma));
    expect(cores.size).toBeGreaterThan(2);
    for (const c of cores) expect(CORES_DO_MONOGRAMA).toContain(c);
  });

  it('o domínio: só de http e https, sem o www', () => {
    expect(dominio('www.exemplo.com.br/entrar')).toBe('exemplo.com.br');
    expect(dominio('http://192.168.0.1')).toBe('192.168.0.1');
    expect(dominio('data:text/html,oi')).toBe('');
    expect(dominio('')).toBe('');
  });

  it('na lixeira: 30 dias a partir de quando foi para lá, nunca menos que zero', () => {
    const agora = Date.parse('2026-10-22T12:00:00.000Z');
    const item = (desde: string | null) => ({ id: 'x', versao: 1, item: null, naLixeira: true, naLixeiraDesde: desde }) as never;
    expect(diasNaLixeira(item('2026-10-22T11:00:00.000Z'), agora)).toBe(30);
    expect(diasNaLixeira(item('2026-10-12T12:00:00.000Z'), agora)).toBe(20);
    expect(diasNaLixeira(item('2026-08-01T12:00:00.000Z'), agora)).toBe(0);
    expect(diasNaLixeira(item(null), agora)).toBe(30);
  });
});
