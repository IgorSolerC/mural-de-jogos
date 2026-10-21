/**
 * O código de recuperação (seções 6.1 e 8.3 do PLANO-COFRE.md): 128 bits sorteados, impressos uma
 * vez no kit de emergência. Com ele, o Google e a senha mestra, o cofre abre sem a passkey.
 *
 * Escrito em base32 de Crockford (sem I, L, O e U, que se confundem com 1, 0 e V), mais 12 bits de
 * conferência (o começo do SHA-256 dos 16 bytes): 140 bits, 28 caracteres, 7 grupos de 4. A
 * conferência pega um erro de digitação aqui mesmo, antes de gastar uma tentativa no servidor; ela
 * não entra na cripto, que usa só os 16 bytes.
 *
 * Ao ler, aceita minúsculas, espaços e hífens, e troca O por 0 e I ou L por 1, como manda o
 * Crockford, porque é isso que quem copia do papel costuma escrever.
 */
import { aleatorios, type Bytes, zerar } from './bytes';
import { ErroCofre, TAM_CODIGO } from './crypto';

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const VALOR = new Map([...ALFABETO].map((c, i) => [c, i]));
const TROCAS: Record<string, string> = { O: '0', I: '1', L: '1' };
const BITS_CONFERENCIA = 12;
export const TAM_TEXTO_CODIGO = 28;
const GRUPO = 4;

async function conferencia(codigo: Uint8Array): Promise<number> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', codigo as Bytes));
  return (h[0] << 4) | (h[1] >> 4);
}

/** Um código novo: os 16 bytes (que vão para a cripto) e o texto (que vai para o papel). */
export async function sortearCodigo(): Promise<{ bytes: Bytes; texto: string }> {
  const bytes = aleatorios(TAM_CODIGO);
  return { bytes, texto: await escreverCodigo(bytes) };
}

/** Os 16 bytes em texto, com a conferência, em grupos de 4 separados por hífen. */
export async function escreverCodigo(bytes: Uint8Array): Promise<string> {
  if (bytes.length !== TAM_CODIGO) throw new ErroCofre('formato', 'código: esperava 16 bytes');
  const bits = [...bytes].map((b) => b.toString(2).padStart(8, '0')).join('') + (await conferencia(bytes)).toString(2).padStart(BITS_CONFERENCIA, '0');
  let texto = '';
  for (let i = 0; i < bits.length; i += 5) texto += ALFABETO[parseInt(bits.slice(i, i + 5), 2)];
  return texto.match(new RegExp(`.{1,${GRUPO}}`, 'g'))!.join('-');
}

/**
 * O texto digitado de volta para os 16 bytes. Faltou ou sobrou caractere: "incompleto"; a
 * conferência não bate: "digitação". Os dois são `ErroCofre('formato')`, com a mensagem dizendo qual.
 */
export async function lerCodigo(digitado: string): Promise<Bytes> {
  const limpo = [...digitado.toUpperCase().replace(/[\s-]/g, '')].map((c) => TROCAS[c] ?? c).join('');
  if (limpo.length !== TAM_TEXTO_CODIGO) throw new ErroCofre('formato', 'código incompleto');
  let bits = '';
  for (const c of limpo) {
    const v = VALOR.get(c);
    if (v === undefined) throw new ErroCofre('formato', 'código com erro de digitação');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = new Uint8Array(TAM_CODIGO);
  for (let i = 0; i < TAM_CODIGO; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  if ((await conferencia(bytes)) !== parseInt(bits.slice(TAM_CODIGO * 8), 2)) {
    zerar(bytes);
    throw new ErroCofre('formato', 'código com erro de digitação');
  }
  return bytes;
}
