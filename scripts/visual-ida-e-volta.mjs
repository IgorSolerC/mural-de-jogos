// O tradutor do modo Visual (src/app/core/rich-doc.ts) nas notas de verdade: lê cada texto de um backup
// (o arquivo baixado em Ajustes › Backup, na máquina de quem escreveu; nunca no repositório) e diz
// quantas linhas viram trecho cru e por quê, se algum texto muda ao abrir e sair sem mexer (I1) e se
// algum, reescrito do zero, não volta igual na leitura (I3). Ver PLANO-EDITOR-VISUAL.md, seção 5.5.
//   node scripts/visual-ida-e-volta.mjs caminho/do/backup.json   (ou o .json.gz, como o site baixa)
// Mostra só contagens e o começo das linhas com problema (para achar o caso), nada mais do texto.
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('uso: node scripts/visual-ida-e-volta.mjs caminho/do/backup.json');
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'visual-ida-e-volta-'));
const bundle = join(tmp, 'rich-doc.mjs');
await build({ entryPoints: [join(root, 'src/app/core/rich-doc.ts')], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' });
const { textToDoc, docToText } = await import(pathToFileURL(bundle).href);
rmSync(tmp, { recursive: true, force: true });

/** Todo texto com formatação do backup: o `text` das fichas, das anotações, dos rascunhos e o que mais houver. */
function textos(no, out = []) {
  if (Array.isArray(no)) for (const x of no) textos(x, out);
  else if (no && typeof no === 'object')
    for (const [k, v] of Object.entries(no)) {
      if ((k === 'text' || k === 'texto' || k === 'about') && typeof v === 'string' && v) out.push(v);
      else textos(v, out);
    }
  return out;
}

const corte = (s) => JSON.stringify(s.length > 60 ? s.slice(0, 60) + '…' : s);
const bruto = readFileSync(arquivo);
const lista = textos(JSON.parse((arquivo.endsWith('.gz') ? gunzipSync(bruto) : bruto).toString('utf8')));
let linhas = 0;
let crus = 0;
let falhaI1 = 0;
let falhaI3 = 0;
const exemplos = [];
const t0 = performance.now();
for (const t of lista) {
  const d = textToDoc(t);
  linhas += d.linhas.length;
  for (const l of d.linhas)
    if (l.kind === 'cru') {
      crus++;
      if (exemplos.length < 20) exemplos.push('cru: ' + corte(l.linhas.join('⏎')));
    }
  const e = docToText(d);
  if (e.texto !== t || !e.exato) {
    falhaI1++;
    if (exemplos.length < 20) exemplos.push('I1: ' + corte(t));
  }
  const sem = { ...d, linhas: d.linhas.map(({ fonte: _, ...l }) => l) };
  const e2 = docToText(sem);
  if (!e2.exato) {
    falhaI3++;
    const diferente = e2.texto.split(/\r\n|\r|\n/).find((l, i) => l !== t.split(/\r\n|\r|\n/)[i]) ?? '';
    if (exemplos.length < 20) exemplos.push('I3: ' + corte(diferente));
  }
}
const ms = performance.now() - t0;
console.log(`${lista.length} textos, ${linhas} linhas, em ${ms.toFixed(0)} ms`);
console.log(`trechos crus: ${crus} (${linhas ? ((100 * crus) / linhas).toFixed(2) : 0}% das linhas)`);
console.log(`mudam ao abrir e sair (I1): ${falhaI1}`);
console.log(`reescritos do zero não voltam iguais (I3): ${falhaI3}`);
for (const x of exemplos) console.log('  ' + x);
process.exit(falhaI1 ? 1 : 0);
