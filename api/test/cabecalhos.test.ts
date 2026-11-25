import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REQUEST_HEADERS } from '../src/app';

/**
 * Todo cabeçalho que uma rota lê passa na pré-consulta do CORS. Sem isso, o navegador bloqueia o pedido inteiro antes
 * de ele chegar, e o teste das rotas (que chama o app direto, sem pré-consulta) não vê: foi assim que os quadros dos
 * grupos compartilhados ficaram sem subir (o `Quadro-Grupo` não estava na lista).
 */

/** Os que o navegador ou a Cloudflare põem sozinhos (o site não manda, e a pré-consulta não pergunta por eles). */
const FROM_BROWSER = new Set(['origin', 'content-length', 'cf-connecting-ip']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('os cabeçalhos do pedido e o CORS', () => {
  it('todo cabeçalho que a API lê está liberado na pré-consulta', () => {
    const src = fileURLToPath(new URL('../src', import.meta.url));
    const read = new Set<string>();
    for (const file of sources(src)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/(?:req\.header|headers\.get)\(['"]([A-Za-z-]+)['"]\)/g)) read.add(m[1]!.toLowerCase());
    }
    // (a busca acha o que se lê hoje: se ela parar de achar, o teste não vale mais nada)
    expect(read).toContain('quadro-grupo');
    const allowed = new Set(REQUEST_HEADERS.map((h) => h.toLowerCase()));
    expect([...read].filter((h) => !FROM_BROWSER.has(h) && !allowed.has(h))).toEqual([]);
  });
});
