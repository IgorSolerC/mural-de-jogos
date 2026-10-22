import { emGrupos, urlSegura } from './item';

describe('o item: o endereço e a senha para digitar', () => {
  it('abre só http e https; sem esquema, entende como https', () => {
    expect(urlSegura('https://banco.exemplo/login')).toBe('https://banco.exemplo/login');
    expect(urlSegura('http://192.168.0.1')).toBe('http://192.168.0.1/');
    expect(urlSegura('mail.google.com')).toBe('https://mail.google.com/');
    expect(urlSegura('  banco.exemplo  ')).toBe('https://banco.exemplo/');
    for (const ruim of ['javascript:alert(1)', 'data:text/html,oi', 'file:///C:/x', 'vbscript:x', '', '   ', 'https://']) {
      expect(urlSegura(ruim)).withContext(ruim).toBeNull();
    }
  });

  it('a senha em grupos de 4, o último com o que sobrar', () => {
    expect(emGrupos('Xk9#mQ2$vL')).toEqual(['Xk9#', 'mQ2$', 'vL']);
    expect(emGrupos('abcd')).toEqual(['abcd']);
    expect(emGrupos('')).toEqual([]);
  });
});
