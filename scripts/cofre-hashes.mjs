// Os hashes dos arquivos do cofre (PLANO-COFRE.md, seção 11): o SHA-256 de cada arquivo do build da
// página (dist/cofre/browser), guardado no repositório em cofre-hashes.json.
//
//   node scripts/cofre-hashes.mjs                  escreve cofre-hashes.json a partir do build
//   node scripts/cofre-hashes.mjs --conferir       o build daqui dá os mesmos hashes? (o deploy roda
//                                                  isto: um build que não bate não é publicado)
//   node scripts/cofre-hashes.mjs --no-ar <url>    o que está no ar é o do repositório? (o vigia, de
//                                                  hora em hora, e o deploy, logo depois de publicar)
//
// Para o build dar igual no Windows e no Linux, os arquivos do cofre ficam com LF (.gitattributes).
// O index.html no ar vem com o nonce do pedido no <cofre-root> (o Worker põe): ele é tirado antes de
// calcular o hash.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const build = join(raiz, 'dist', 'cofre', 'browser');
const arquivo = join(raiz, 'cofre-hashes.json');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** O index.html sem o nonce que o Worker põe em cada pedido (o HTMLRewriter escreve o nome em minúsculas). */
export function semNonce(html) {
  return html.replace(/ ngcspnonce="[^"]*"/gi, '');
}

function arquivos(pasta) {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? arquivos(join(pasta, e.name)) : [join(pasta, e.name)]));
}

function doBuild() {
  const out = {};
  for (const f of arquivos(build).sort()) out[relative(build, f).split(sep).join('/')] = sha256(readFileSync(f));
  return out;
}

function guardados() {
  return JSON.parse(readFileSync(arquivo, 'utf8')).arquivos;
}

function diferencas(esperado, veio) {
  const out = [];
  for (const nome of new Set([...Object.keys(esperado), ...Object.keys(veio)])) {
    if (esperado[nome] !== veio[nome]) out.push(`${nome}: esperava ${esperado[nome] ?? '(nada)'}, veio ${veio[nome] ?? '(nada)'}`);
  }
  return out;
}

async function noAr(base) {
  const veio = {};
  for (const nome of Object.keys(guardados())) {
    // o index.html é servido na raiz (o servidor de arquivos redireciona /index.html para /)
    const res = await fetch(new URL(nome === 'index.html' ? '/' : `/${nome}`, base), { redirect: 'error', cache: 'no-store' });
    if (!res.ok) {
      veio[nome] = `HTTP ${res.status}`;
      continue;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    veio[nome] = sha256(nome.endsWith('.html') ? Buffer.from(semNonce(bytes.toString('utf8')), 'utf8') : bytes);
  }
  return veio;
}

const [modo, url] = process.argv.slice(2);
if (!modo) {
  const arquivosDoBuild = doBuild();
  writeFileSync(arquivo, JSON.stringify({ nota: 'Gerado por scripts/cofre-hashes.mjs depois de `npx ng build cofre`. Não editar à mão.', arquivos: arquivosDoBuild }, null, 2) + '\n');
  console.log(`cofre-hashes.json: ${Object.keys(arquivosDoBuild).length} arquivos`);
} else if (modo === '--conferir' || modo === '--no-ar') {
  if (modo === '--no-ar' && !url) {
    console.log('Uso: node scripts/cofre-hashes.mjs --no-ar <endereço do cofre>');
    process.exit(2);
  }
  const problemas = diferencas(guardados(), modo === '--conferir' ? doBuild() : await noAr(url));
  if (problemas.length) {
    console.log(modo === '--conferir' ? 'O build daqui NÃO é o do repositório:' : 'O que está no ar NÃO é o do repositório:');
    for (const p of problemas) console.log(`  ${p}`);
    process.exit(1);
  }
  console.log(modo === '--conferir' ? 'O build bate com cofre-hashes.json.' : `O que está no ar bate com cofre-hashes.json (${url}).`);
} else {
  console.log('Uso: node scripts/cofre-hashes.mjs [--conferir | --no-ar <endereço>]');
  process.exit(2);
}
