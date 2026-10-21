import { deHex } from './bytes';
import { lerCodigo, escreverCodigo, sortearCodigo, TAM_TEXTO_CODIGO } from './codigo';
import { ErroCofre } from './crypto';

async function falhaCom(digitado: string, mensagem: RegExp): Promise<void> {
  await expectAsync(lerCodigo(digitado)).toBeRejectedWith(jasmine.any(ErroCofre));
  await expectAsync(lerCodigo(digitado)).toBeRejectedWithError(ErroCofre, mensagem);
}

describe('código de recuperação', () => {
  it('sai em 7 grupos de 4, só com as letras do Crockford', async () => {
    const { bytes, texto } = await sortearCodigo();
    expect(bytes.length).toBe(16);
    expect(texto).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){6}$/);
    expect(texto.replace(/-/g, '').length).toBe(TAM_TEXTO_CODIGO);
  });

  it('vai e volta', async () => {
    for (let i = 0; i < 20; i++) {
      const { bytes, texto } = await sortearCodigo();
      expect(await lerCodigo(texto)).toEqual(bytes);
    }
  });

  it('o mesmo código sempre sai igual (formato fixo da versão 1)', async () => {
    const bytes = deHex('000102030405060708090a0b0c0d0e0f');
    const texto = await escreverCodigo(bytes);
    expect(texto).toBe('000G-40R4-0M30-E209-185G-R38E-1YZ4');
    expect(await lerCodigo(texto)).toEqual(bytes);
  });

  it('aceita minúsculas, espaços, sem hífen, e O, I, L no lugar de 0 e 1', async () => {
    const bytes = deHex('000102030405060708090a0b0c0d0e0f');
    expect(await lerCodigo(' 000g 40r4 0m30 e209 185g r38e 1yz4 ')).toEqual(bytes);
    expect(await lerCodigo('000G40R40M30E209185GR38E1YZ4')).toEqual(bytes);
    expect(await lerCodigo('OOOG-4OR4-OM3O-E2O9-I85G-R38E-IYZ4')).toEqual(bytes);
    expect(await lerCodigo('000G-40R4-0M30-E209-L85G-R38E-lYZ4')).toEqual(bytes);
  });

  it('pega erro de digitação e código incompleto antes de ir ao servidor', async () => {
    await falhaCom('000G-40R4-0M30-E209-185G-R38E-1YZ5', /digitação/);
    await falhaCom('100G-40R4-0M30-E209-185G-R38E-1YZ4', /digitação/);
    await falhaCom('000G-40R4-0M30-E209-185G-R38E-1YZU', /digitação/);
    await falhaCom('000G-40R4-0M30-E209-185G-R38E-1YZ', /incompleto/);
    await falhaCom('000G-40R4-0M30-E209-185G-R38E-1YZ44', /incompleto/);
    await falhaCom('', /incompleto/);
  });

  it('pega toda troca de um caractere por outro', async () => {
    const { texto } = await sortearCodigo();
    const limpo = texto.replace(/-/g, '');
    let pegos = 0;
    let trocas = 0;
    for (let i = 0; i < limpo.length; i++) {
      const outro = limpo[i] === 'A' ? 'B' : 'A';
      trocas++;
      try {
        await lerCodigo(limpo.slice(0, i) + outro + limpo.slice(i + 1));
      } catch {
        pegos++;
      }
    }
    // 12 bits de conferência: a chance de uma troca passar é 1 em 4.096
    expect(pegos).toBeGreaterThanOrEqual(trocas - 1);
  });
});
