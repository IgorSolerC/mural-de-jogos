/**
 * O aviso de senha vazada (seção 10 do PLANO-COFRE.md), pela base do Have I Been Pwned, sem mandar a
 * senha nem o hash dela: o SHA-1 é feito aqui, só os 5 primeiros caracteres vão para
 * `api.pwnedpasswords.com/range/` (com `Add-Padding`, para o tamanho da resposta não dizer nada), e o resto
 * é conferido aqui mesmo. Só roda quando a pessoa pede (nada é guardado: a conferência se repete a cada
 * vez). Sem rede ou com a base fora do ar, não avisa nada e não atrapalha o cofre.
 */
const BASE = 'https://api.pwnedpasswords.com/range/';

/** O SHA-1 da senha, em hexadecimal maiúsculo (o formato da base). */
export async function sha1(senha: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(senha)));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Lê a resposta da base: "SUFIXO:VEZES" por linha (as de preenchimento têm 0 vezes). */
export function lerFaixa(texto: string): Map<string, number> {
  const faixa = new Map<string, number>();
  for (const linha of texto.split(/\r?\n/)) {
    const [sufixo, vezes] = linha.trim().split(':');
    const n = Number(vezes);
    if (sufixo && /^[0-9A-F]{35}$/.test(sufixo) && n > 0) faixa.set(sufixo, n);
  }
  return faixa;
}

/**
 * Confere várias senhas: devolve, para cada uma, quantas vezes ela aparece em vazamentos (0: nenhuma) ou
 * null quando não deu para conferir. Senhas com o mesmo começo de hash fazem um pedido só.
 */
export async function conferirVazadas(senhas: readonly string[], buscar: typeof fetch = (url, init) => fetch(url, init)): Promise<(number | null)[]> {
  const hashes = await Promise.all(senhas.map((s) => (s ? sha1(s) : Promise.resolve(''))));
  const faixas = new Map<string, Promise<Map<string, number> | null>>();
  const faixa = (prefixo: string) => {
    let f = faixas.get(prefixo);
    if (!f) {
      f = buscar(`${BASE}${prefixo}`, { headers: { 'Add-Padding': 'true' }, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', mode: 'cors' })
        .then(async (r) => (r.ok ? lerFaixa(await r.text()) : null))
        .catch(() => null);
      faixas.set(prefixo, f);
    }
    return f;
  };
  return Promise.all(
    hashes.map(async (h) => {
      if (!h) return 0;
      const f = await faixa(h.slice(0, 5));
      return f ? (f.get(h.slice(5)) ?? 0) : null;
    }),
  );
}
