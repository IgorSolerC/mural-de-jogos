// Os secrets do cofre com a cópia em papel (PLANO-COFRE.md, 16.2). A Cloudflare não mostra um secret
// depois de gravado, e sem a pimenta e a chave dos envelopes ninguém abre o cofre: a cópia em papel
// é a única volta. Por isso este script só grava depois de você digitar de volta o que escreveu.
//
//   node scripts/segredo.mjs COFRE_PIMENTA_1                 gera, mostra para o papel, confere e grava
//   node scripts/segredo.mjs COFRE_PIMENTA_1 --do-papel      grava de novo a partir do papel
//   node scripts/segredo.mjs --conferir-papel                só confere uma cópia em papel (não grava)
//
// Rode dentro de cofre-api, depois do `npx wrangler login`. O segredo nunca vai na linha de comando
// (que fica no histórico): o wrangler o recebe pela entrada padrão.
//
// No papel vai em hexadecimal (0-9 e a-f, sem maiúsculas nem letras parecidas), em 16 grupos de 4,
// mais um grupo de conferência (o começo do SHA-256), que pega um erro de cópia. No Worker, o mesmo
// valor fica em base64url, o formato que src/secrets.ts lê.
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Os nomes que este script grava (os mesmos de src/secrets.ts). */
export function nomeValido(nome) {
  return /^COFRE_(PIMENTA|ENVELOPES)_[1-9][0-9]{0,2}$/.test(nome ?? '');
}

const conferencia = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 4);

/** O que vai para o papel: 16 grupos de 4 e a conferência. */
export function paraPapel(bytes) {
  if (bytes.length !== 32) throw new Error('o segredo tem 32 bytes');
  const hex = Buffer.from(bytes).toString('hex');
  return { grupos: hex.match(/.{4}/g), conferencia: conferencia(bytes) };
}

/** O que foi digitado do papel → os 32 bytes, ou o motivo de não valer. */
export function doPapel(texto) {
  const limpo = String(texto).toLowerCase().replace(/[\s-]/g, '');
  if (!/^[0-9a-f]*$/.test(limpo)) return { erro: 'Só vale 0-9 e a-f (o papel não tem outras letras).' };
  if (limpo.length !== 68) return { erro: `Vieram ${limpo.length} caracteres; são 68 (16 grupos de 4 e a conferência).` };
  const bytes = Buffer.from(limpo.slice(0, 64), 'hex');
  if (conferencia(bytes) !== limpo.slice(64)) return { erro: 'A conferência não bate: algum caractere foi copiado errado.' };
  return { bytes };
}

export const base64url = (bytes) => Buffer.from(bytes).toString('base64url');

function mostrar(bytes) {
  const { grupos, conferencia: c } = paraPapel(bytes);
  const linhas = [0, 4, 8, 12].map((i) => `    ${grupos.slice(i, i + 4).join('  ')}`);
  return ['', ...linhas, '', `    conferência: ${c}`, ''].join('\n');
}

function gravar(nome, bytes) {
  // com shell no Windows (o npx é um .cmd): o nome já foi conferido, e o segredo vai pela entrada
  const r = spawnSync('npx', ['wrangler', 'secret', 'put', nome], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    input: base64url(bytes),
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  return r.status === 0;
}

async function main(args) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const fala = (t) => process.stderr.write(`${t}\n`);
  // a entrada acabou (Ctrl+Z, Ctrl+D ou um arquivo no lugar do teclado): conta como "não confere"
  const fechou = new Promise((resolve) => rl.once('close', () => resolve(null)));
  const pedePapel = async (pergunta) => {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const texto = await Promise.race([rl.question(pergunta), fechou]);
      if (texto === null) return null;
      const lido = doPapel(texto);
      if (lido.bytes) return lido.bytes;
      fala(lido.erro);
    }
    return null;
  };
  try {
    if (args[0] === '--conferir-papel') {
      const bytes = await pedePapel('Digite o que está no papel (os 17 grupos): ');
      fala(bytes ? 'O papel está certo.' : 'O papel não confere.');
      return bytes ? 0 : 1;
    }
    const [nome, modo] = args;
    if (!nomeValido(nome) || (modo && modo !== '--do-papel')) {
      fala('Uso: node scripts/segredo.mjs COFRE_PIMENTA_1 | COFRE_ENVELOPES_1 [--do-papel]  ou  --conferir-papel');
      return 2;
    }
    let bytes;
    if (modo === '--do-papel') {
      bytes = await pedePapel(`Digite o ${nome} que está no papel (os 17 grupos): `);
      if (!bytes) return 1;
    } else {
      bytes = randomBytes(32);
      fala(`\nEscreva no papel, com o nome ${nome}:\n${mostrar(bytes)}`);
      fala('Guarde o papel num lugar só seu. Agora digite de volta o que você escreveu (do papel, não da tela).');
      const volta = await pedePapel('> ');
      if (!volta || !volta.equals(bytes)) {
        fala('O que foi digitado não é o que está na tela. Nada foi gravado; rode de novo para um segredo novo.');
        return 1;
      }
      // tira o segredo da tela (e da rolagem) antes de gravar
      process.stderr.write('\x1b[2J\x1b[3J\x1b[H');
      fala('O papel está certo.');
    }
    if (!gravar(nome, bytes)) {
      fala(`O wrangler não gravou ${nome}. O papel continua valendo: rode com --do-papel para tentar de novo.`);
      return 1;
    }
    fala(`${nome} gravado na Cloudflare. Feche este terminal.`);
    return 0;
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
