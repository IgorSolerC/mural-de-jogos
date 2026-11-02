import { fold } from './text';

/**
 * As linguagens do bloco de código (ver core/code-highlight.ts): o nome que aparece na etiqueta do bloco e
 * no menu "Código" da régua, e os jeitos de escrever cada uma depois das crases, como no Obsidian e no
 * GitHub ("```js", "```javascript"). `id` é o nome da gramática no colorir (o highlight.js), que só chega
 * num pedaço à parte, quando um bloco com linguagem aparece. Esta lista é leve: mora no site desde o começo.
 *
 * Uma palavra que não está aqui continua escrita como está (a etiqueta mostra a palavra, sem cores).
 */
export interface CodeLang {
  id: string;
  /** O nome na etiqueta e no menu ("JavaScript"). */
  name: string;
  /** Como se escreve depois das crases: o primeiro é o que o menu escreve; todos valem na leitura. */
  words: readonly string[];
}

export const CODE_LANGS: readonly CodeLang[] = [
  { id: 'javascript', name: 'JavaScript', words: ['js', 'javascript', 'jsx', 'mjs', 'cjs', 'node'] },
  { id: 'typescript', name: 'TypeScript', words: ['ts', 'typescript', 'tsx', 'mts', 'cts'] },
  { id: 'xml', name: 'HTML', words: ['html', 'htm', 'xhtml', 'vue', 'svelte', 'angular'] },
  { id: 'css', name: 'CSS', words: ['css'] },
  { id: 'json', name: 'JSON', words: ['json', 'jsonc', 'json5'] },
  { id: 'python', name: 'Python', words: ['python', 'py', 'py3', 'gyp'] },
  { id: 'sql', name: 'SQL', words: ['sql', 'sqlite', 'mysql', 'postgres', 'postgresql', 'psql', 'plsql', 'tsql'] },
  { id: 'bash', name: 'Bash', words: ['bash', 'sh', 'shell', 'zsh', 'console', 'terminal'] },
  { id: 'csharp', name: 'C#', words: ['cs', 'csharp', 'c#'] },
  { id: 'java', name: 'Java', words: ['java', 'jsp'] },
  { id: 'markdown', name: 'Markdown', words: ['md', 'markdown', 'mkd'] },
  { id: 'yaml', name: 'YAML', words: ['yaml', 'yml'] },
  { id: 'xml', name: 'XML', words: ['xml', 'svg', 'rss', 'plist', 'xsl'] },
  { id: 'scss', name: 'SCSS', words: ['scss', 'sass'] },
  { id: 'powershell', name: 'PowerShell', words: ['powershell', 'ps1', 'ps', 'pwsh'] },
  { id: 'c', name: 'C', words: ['c', 'h'] },
  { id: 'cpp', name: 'C++', words: ['cpp', 'c++', 'cc', 'cxx', 'hpp', 'hh'] },
  { id: 'go', name: 'Go', words: ['go', 'golang'] },
  { id: 'rust', name: 'Rust', words: ['rust', 'rs'] },
  { id: 'kotlin', name: 'Kotlin', words: ['kotlin', 'kt', 'kts'] },
  { id: 'php', name: 'PHP', words: ['php'] },
  { id: 'ruby', name: 'Ruby', words: ['ruby', 'rb', 'gemspec', 'podspec'] },
  { id: 'ini', name: 'TOML / INI', words: ['toml', 'ini', 'cfg', 'conf', 'properties'] },
  { id: 'dockerfile', name: 'Dockerfile', words: ['dockerfile', 'docker'] },
  { id: 'diff', name: 'Diff', words: ['diff', 'patch'] },
  { id: 'plaintext', name: 'Texto', words: ['text', 'txt', 'plaintext', 'plain'] },
];

/** As do menu curto (as mais comuns); as outras aparecem escrevendo no campo dele. */
export const COMMON_CODE_LANGS: readonly CodeLang[] = CODE_LANGS.slice(0, 12);

/** As gramáticas que o colorir carrega (cada `id` uma vez). */
export const CODE_GRAMMARS: readonly string[] = [...new Set(CODE_LANGS.map((l) => l.id))].filter((id) => id !== 'plaintext');

const BY_WORD = new Map<string, CodeLang>();
for (const l of CODE_LANGS) for (const w of l.words) if (!BY_WORD.has(w)) BY_WORD.set(w, l);

/** A primeira palavra do que vem depois das crases ("js" de "js title=x"), como está escrita. */
export function codeLangWord(info: string): string {
  return /^\S*/.exec(info.trim())?.[0] ?? '';
}

/** A linguagem do que vem depois das crases (pela primeira palavra, sem maiúsculas), ou null. */
export function codeLangOf(info: string): CodeLang | null {
  const w = codeLangWord(info).toLowerCase();
  return w ? (BY_WORD.get(w) ?? null) : null;
}

/** O nome da etiqueta do bloco: o da linguagem conhecida, ou a palavra escrita; "" sem linguagem. */
export function codeLangName(info: string): string {
  return codeLangOf(info)?.name ?? codeLangWord(info);
}

/**
 * As linguagens que respondem ao que se escreve no campo do menu (pelo nome ou por um jeito de escrever,
 * sem acento nem maiúscula), as que começam com ele primeiro. Vazio: as comuns.
 */
export function codeLangsFor(query: string): readonly CodeLang[] {
  const q = fold(query.trim());
  if (!q) return COMMON_CODE_LANGS;
  const hits = CODE_LANGS.filter((l) => fold(l.name).includes(q) || l.words.some((w) => w.includes(q)));
  const starts = (l: CodeLang) => fold(l.name).startsWith(q) || l.words.some((w) => w.startsWith(q));
  return [...hits.filter(starts), ...hits.filter((l) => !starts(l))];
}

/** O que o menu escreve depois das crases para a linguagem (o primeiro jeito dela). */
export function codeLangInfo(l: CodeLang): string {
  return l.words[0];
}

/**
 * O que vai depois das crases com a linguagem trocada: só a primeira palavra muda, e o resto do que estava
 * escrito ali ("title=main.py") fica. Sem linguagem (""), nada.
 */
export function withCodeLang(info: string, lang: string): string {
  const l = lang.trim();
  if (!l) return '';
  const t = info.trim();
  return l + t.slice(codeLangWord(t).length);
}

/**
 * O que se escreveu no campo do menu, pronto para ir depois das crases: uma palavra só, sem espaços nem
 * crases (que fechariam a cerca). "" quando não sobra nada.
 */
export function typedCodeLang(text: string): string {
  return codeLangWord(text.replace(/[`~]/g, ''));
}
