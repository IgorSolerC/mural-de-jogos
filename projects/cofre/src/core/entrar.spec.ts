import { desafioPkce, descreverAparelho, type Guarda, lerVolta, urlDoLogin } from './entrar';

function guardaDeTeste(): Guarda & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return { dados, getItem: (c) => dados.get(c) ?? null, setItem: (c, v) => void dados.set(c, v), removeItem: (c) => void dados.delete(c) };
}

const ORIGEM = 'https://cofre.murall.igorsc.com.br';
const AGORA = Date.parse('2026-10-21T15:00:00Z');

describe('o login com o Google na página', () => {
  it('o desafio do PKCE é o da RFC 7636 (S256)', async () => {
    expect(await desafioPkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('a ida ao Google: só openid, o desafio, o state e a volta em /entrar', async () => {
    const guarda = guardaDeTeste();
    const url = new URL(await urlDoLogin('cliente.apps.googleusercontent.com', ORIGEM, guarda, AGORA));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const p = url.searchParams;
    expect(p.get('client_id')).toBe('cliente.apps.googleusercontent.com');
    expect(p.get('redirect_uri')).toBe(`${ORIGEM}/entrar`);
    expect(p.get('response_type')).toBe('code');
    expect(p.get('scope')).toBe('openid');
    expect(p.get('prompt')).toBe('select_account');
    expect(p.get('code_challenge_method')).toBe('S256');
    const guardado = JSON.parse(guarda.dados.get('cofre:login')!);
    expect(p.get('state')).toBe(guardado.state);
    expect(p.get('code_challenge')).toBe(await desafioPkce(guardado.verificador));
    // o verificador nunca vai na URL
    expect(url.href).not.toContain(guardado.verificador);
    expect(guardado.verificador).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('a volta certa devolve o código e o verificador, e o pendente some', async () => {
    const guarda = guardaDeTeste();
    const url = new URL(await urlDoLogin('c', ORIGEM, guarda, AGORA));
    const { verificador } = JSON.parse(guarda.dados.get('cofre:login')!);
    const volta = lerVolta(`?state=${url.searchParams.get('state')}&code=codigo-do-google`, guarda, AGORA + 30_000);
    expect(volta).toEqual({ ok: true, codigo: 'codigo-do-google', verificador });
    expect(guarda.dados.size).toBe(0);
    // a mesma volta de novo não vale
    expect(lerVolta(`?state=${url.searchParams.get('state')}&code=codigo-do-google`, guarda, AGORA + 31_000)).toEqual({ ok: false, motivo: 'outra-origem' });
  });

  it('recusa state trocado, login que não começou aqui, demora, cancelamento e volta sem código', async () => {
    const casos: [string, number, string][] = [
      ['?state=outro&code=x', 1000, 'outra-origem'],
      ['?error=access_denied&state=S', 1000, 'cancelado'],
      ['?state=S&code=x', 11 * 60_000, 'vencido'],
      ['?state=S', 1000, 'incompleto'],
    ];
    for (const [busca, depois, motivo] of casos) {
      const guarda = guardaDeTeste();
      const url = new URL(await urlDoLogin('c', ORIGEM, guarda, AGORA));
      const volta = lerVolta(busca.replace('state=S', `state=${url.searchParams.get('state')}`), guarda, AGORA + depois);
      expect(volta).withContext(busca).toEqual({ ok: false, motivo } as never);
      expect(guarda.dados.size).toBe(0);
    }
    expect(lerVolta('?state=x&code=y', guardaDeTeste(), AGORA)).toEqual({ ok: false, motivo: 'outra-origem' });
    const estragado = guardaDeTeste();
    estragado.setItem('cofre:login', '{não é json');
    expect(lerVolta('?state=x&code=y', estragado, AGORA)).toEqual({ ok: false, motivo: 'outra-origem' });
  });

  it('o aparelho em palavras, para o histórico', () => {
    expect(descreverAparelho('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36')).toBe('Chrome no Windows');
    expect(descreverAparelho('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari no iPhone');
    expect(descreverAparelho('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36')).toBe('Chrome no Android');
    expect(descreverAparelho('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0')).toBe('Edge no Windows');
    expect(descreverAparelho('curl/8')).toBe('Navegador no outro sistema');
    // no iPad e no iPhone, o Chrome, o Firefox e o Edge têm nome próprio (e o "Safari/" de todos)
    expect(descreverAparelho('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari no iPad');
    expect(descreverAparelho('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1')).toBe('Chrome no iPhone');
    expect(descreverAparelho('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15')).toBe('Firefox no iPhone');
    expect(descreverAparelho('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/141.0 Mobile/15E148 Safari/605.1.15')).toBe('Edge no iPhone');
    expect(descreverAparelho('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36 EdgA/141.0')).toBe('Edge no Android');
  });
});
