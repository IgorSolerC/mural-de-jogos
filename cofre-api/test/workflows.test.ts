import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Os secrets nos workflows (PLANO-COFRE.md, 17.5, opção b): nunca no nível do workflow nem do job, só
 * no `env` do passo que os usa. Assim o `npm ci`, os testes e o build (e o script de instalação de
 * qualquer pacote) não os veem. O token da Cloudflare alcança a conta toda, inclusive o cofre: ele só
 * vai para passos que rodam o `wrangler`.
 */
const pasta = new URL('../../.github/workflows/', import.meta.url);
const workflows = readdirSync(pasta)
  .filter((f) => f.endsWith('.yml'))
  .map((nome) => ({ nome, linhas: readFileSync(new URL(nome, pasta), 'utf8').split(/\r?\n/) }));

interface Uso {
  onde: string;
  secret: string;
  /** No `env:` de um passo (o `env:` com 8 espaços, logo dentro de um `- ` com 6). */
  noPasso: boolean;
  /** O `run:` desse passo, numa linha. */
  run: string;
}

function usos(): Uso[] {
  const out: Uso[] = [];
  for (const { nome, linhas } of workflows) {
    linhas.forEach((linha, i) => {
      const m = /secrets\.(\w+)/.exec(linha);
      if (!m || /^\s*#/.test(linha)) return;
      // sobe até o `env:` deste bloco e até o começo do passo
      let j = i - 1;
      while (j >= 0 && /^ {10}\S/.test(linhas[j]!)) j--;
      const envDoPasso = linhas[j] === '        env:' && /^ {10}\S/.test(linha);
      let inicio = j;
      while (inicio >= 0 && !/^ {6}- /.test(linhas[inicio]!) && /^ {8}\S/.test(linhas[inicio]!)) inicio--;
      const noPasso = envDoPasso && inicio >= 0 && /^ {6}- /.test(linhas[inicio]!);
      let fim = inicio + 1;
      while (fim < linhas.length && !/^ {0,6}\S/.test(linhas[fim]!)) fim++;
      const passo = noPasso ? linhas.slice(inicio, fim) : [];
      const run = passo.map((l) => /^ {6}(?:- | {2})run: (.+)$/.exec(l)?.[1]).find(Boolean) ?? '';
      out.push({ onde: `${nome}:${i + 1}`, secret: m[1]!, noPasso, run });
    });
  }
  return out;
}

describe('os secrets nos workflows', () => {
  const todos = usos();

  it('os workflows usam secrets (a conferência não está vazia)', () => {
    expect(todos.filter((u) => u.secret === 'CLOUDFLARE_API_TOKEN').length).toBeGreaterThanOrEqual(6);
  });

  it('todo secret fica no env de um passo, nunca no do job ou do workflow', () => {
    expect(todos.filter((u) => !u.noPasso).map((u) => u.onde)).toEqual([]);
  });

  it('o token da Cloudflare só vai para passos que rodam o wrangler', () => {
    const fora = todos.filter((u) => u.secret === 'CLOUDFLARE_API_TOKEN' && !/^npx wrangler /.test(u.run));
    expect(fora.map((u) => `${u.onde} (${u.run || 'sem run de uma linha'})`)).toEqual([]);
  });

  it('a conferência pega um token no nível do job', () => {
    const job = ['jobs:', '  publicar:', '    env:', '      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}', '    steps:', '      - run: npm ci'];
    workflows.push({ nome: 'teste.yml', linhas: job });
    try {
      expect(usos().find((u) => u.onde === 'teste.yml:4')?.noPasso).toBe(false);
    } finally {
      workflows.pop();
    }
  });
});
