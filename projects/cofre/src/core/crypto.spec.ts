import { argon2id } from 'hash-wasm';
import { deBase64url, deHex, deUtf8, paraBase64url, paraHex, utf8 } from './bytes';
import {
  abrirCofre,
  abrirEnvelope,
  abrirRecuperacao,
  BLOCO,
  chaveDaSenha,
  type ChaveDoCofre,
  cifrarItem,
  cifrarManifesto,
  conferirItens,
  conferirKdf,
  criarCofre,
  decifrarItem,
  decifrarManifesto,
  derivarBytes,
  entradaPrf,
  ErroCofre,
  KDF_PADRAO,
  type Manifesto,
  type MotivoErro,
  novaChaveDoMeio,
  novoId,
  novoSal,
  novoSegredoDeAparelho,
  provaDaSenha,
  provaDoCodigo,
  reselarCofre,
  selarEnvelope,
  selarRecuperacao,
  SOBRA_SELADO,
} from './crypto';

/** Espera que a promessa falhe com um `ErroCofre` deste motivo. */
async function falha(promessa: Promise<unknown> | (() => unknown), motivo: MotivoErro): Promise<void> {
  try {
    await (typeof promessa === 'function' ? promessa() : promessa);
  } catch (e) {
    expect(e).toBeInstanceOf(ErroCofre);
    expect((e as ErroCofre).motivo).withContext((e as Error).message).toBe(motivo);
    return;
  }
  fail(`devia falhar com "${motivo}"`);
}

/** Uma cópia com um bit trocado na posição dada. */
function mexido(bytes: Uint8Array, pos: number): Uint8Array {
  const c = bytes.slice();
  c[pos] ^= 1;
  return c;
}

const seq = (n: number, ini: number) => Uint8Array.from({ length: n }, (_, i) => (ini + i) & 255);

const USUARIO = '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';
const OUTRO_USUARIO = '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7d';
const ENVELOPE = '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';
const ITEM = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';

/** O Argon2id com 64 MiB leva perto de um segundo; os testes que o rodam têm mais prazo. */
const LENTO = 60_000;

describe('bytes do cofre', () => {
  it('base64url vai e volta em todos os tamanhos', () => {
    for (let n = 0; n < 70; n++) {
      const b = seq(n, n * 7);
      expect(deBase64url(paraBase64url(b))).toEqual(b);
    }
  });

  it('base64url só aceita o formato canônico', () => {
    expect(paraBase64url(utf8('cofre?>'))).toBe('Y29mcmU_Pg');
    expect(deBase64url('Y29mcmU_Pg')).toEqual(utf8('cofre?>'));
    expect(deBase64url('Y29mcmU_Pg==')).toBeNull(); // padding
    expect(deBase64url('Y29mcmU/Pg')).toBeNull(); // base64 comum, não url
    expect(deBase64url('Y29mc mU_Pg')).toBeNull(); // espaço
    expect(deBase64url('Y29mcmU_P')).toBeNull(); // tamanho impossível
    expect(deBase64url('Y29mcmU_Ph')).toBeNull(); // bits sobrando no fim
    expect(deBase64url('QQ')).toEqual(utf8('A'));
    expect(deBase64url('QR')).toBeNull(); // o mesmo "A", escrito de outro jeito
  });

  it('UTF-8 inválido é erro, nunca um caractere trocado', () => {
    expect(() => deUtf8(Uint8Array.of(0xc3, 0x28))).toThrow();
  });
});

describe('Argon2id (hash-wasm)', () => {
  // Os vetores da implementação de referência (phc-winner-argon2, test.c, Argon2id versão 0x13).
  // Os da RFC 9106 usam "dado associado", que o hash-wasm não expõe (e o cofre não usa).
  const referencia: [number, number, number, string, string, string][] = [
    [2, 16, 1, 'password', 'somesalt', '09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7'],
    [2, 8, 1, 'password', 'somesalt', '9dfeb910e80bad0311fee20f9c0e2b12c17987b4cac90c2ef54d5b3021c68bfe'],
    [2, 8, 2, 'password', 'somesalt', '6d093c501fd5999645e0ea3bf620d7b8be7fd2db59c20d9fff9539da2bf57037'],
    [1, 16, 1, 'password', 'somesalt', 'f6a5adc1ba723dddef9b5ac1d464e180fcd9dffc9d1cbf76cca2fed795d9ca98'],
    [4, 16, 1, 'password', 'somesalt', '9025d48e68ef7395cca9079da4c4ec3affb3c8911fe4f86d1a2520856f63172c'],
    [2, 16, 1, 'differentpassword', 'somesalt', '0b84d652cf6b0c4beaef0dfe278ba6a80df6696281d7e0d2891b817d8c458fde'],
    [2, 16, 1, 'password', 'diffsalt', 'bdf32b05ccc42eb15d58fd19b1f856b113da1e9a5874fdcc544308565aa8141c'],
  ];
  for (const [t, m, p, senha, sal, esperado] of referencia) {
    it(
      `confere o vetor de referência t=${t} m=2^${m} p=${p} ${senha}/${sal}`,
      async () => {
        const h = await argon2id({ password: senha, salt: sal, iterations: t, memorySize: 1 << m, parallelism: p, hashLength: 32, outputType: 'hex' });
        expect(h).toBe(esperado);
      },
      LENTO,
    );
  }
});

describe('HKDF-SHA-256 (RFC 5869)', () => {
  it('confere o caso de teste 1', async () => {
    const okm = await derivarBytes(new Uint8Array(22).fill(0x0b), deHex('000102030405060708090a0b0c'), deHex('f0f1f2f3f4f5f6f7f8f9'), 42);
    expect(paraHex(okm)).toBe('3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
  });

  it('confere o caso de teste 2 (entradas longas)', async () => {
    const okm = await derivarBytes(seq(80, 0), seq(80, 0x60), seq(80, 0xb0), 82);
    expect(paraHex(okm)).toBe(
      'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71cc30c58179ec3e87c14c01d5c1f3434f1d87',
    );
  });

  it('confere o caso de teste 3 (sem sal e sem info)', async () => {
    const okm = await derivarBytes(new Uint8Array(22).fill(0x0b), new Uint8Array(0), new Uint8Array(0), 42);
    expect(paraHex(okm)).toBe('8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8');
  });
});

describe('rebaixamento e parâmetros de fora', () => {
  it('aceita o padrão e mais forte', () => {
    expect(() => conferirKdf(KDF_PADRAO, 1)).not.toThrow();
    expect(() => conferirKdf({ m: 256 * 1024, t: 4, p: 2 }, 1)).not.toThrow();
  });

  it('recusa Argon2id abaixo do mínimo', async () => {
    await falha(() => conferirKdf({ m: 64 * 1024 - 1, t: 3, p: 1 }, 1), 'kdf-fraco');
    await falha(() => conferirKdf({ m: 64 * 1024, t: 2, p: 1 }, 1), 'kdf-fraco');
    await falha(() => conferirKdf({ m: 64 * 1024, t: 3, p: 0 }, 1), 'kdf-fraco');
  });

  it('recusa parâmetros exagerados ou que não são inteiros', async () => {
    await falha(() => conferirKdf({ m: 4 * 1024 * 1024, t: 3, p: 1 }, 1), 'kdf-invalido');
    await falha(() => conferirKdf({ m: 64 * 1024, t: 100, p: 1 }, 1), 'kdf-invalido');
    await falha(() => conferirKdf({ m: 65536.5, t: 3, p: 1 }, 1), 'kdf-invalido');
    await falha(() => conferirKdf({ m: '65536', t: 3, p: 1 } as never, 1), 'kdf-invalido');
    await falha(() => conferirKdf(null as never, 1), 'kdf-invalido');
  });

  it('recusa versão desconhecida', async () => {
    await falha(() => conferirKdf(KDF_PADRAO, 2), 'versao');
    await falha(() => conferirKdf(KDF_PADRAO, 0), 'versao');
  });

  it('chaveDaSenha recusa o rebaixamento antes de calcular, e sal de tamanho errado', async () => {
    await falha(chaveDaSenha('frase', novoSal(), { m: 8, t: 1, p: 1 }), 'kdf-fraco');
    await falha(chaveDaSenha('frase', new Uint8Array(8), KDF_PADRAO), 'formato');
    await falha(chaveDaSenha('', novoSal(), KDF_PADRAO), 'formato');
    await falha(chaveDaSenha('frase', novoSal(), KDF_PADRAO, 2), 'versao');
  });

  it('recusa ids fora do formato (nada de "|" no AAD)', async () => {
    const m = novaChaveDoMeio();
    const s = novoSegredoDeAparelho();
    await falha(selarEnvelope(s, `${USUARIO}|x`, ENVELOPE, m), 'formato');
    await falha(selarEnvelope(s, USUARIO.toUpperCase(), ENVELOPE, m), 'formato');
    await falha(selarEnvelope(s, USUARIO, 'env', m), 'formato');
  });
});

describe('abre o que a versão 1 selou', () => {
  // Gerados uma vez com este código. Se algum falhar, a mudança quebra os cofres que já existem.
  const sal = seq(16, 0);
  const m = seq(32, 0x20);
  const prf = seq(32, 0x40);
  const codigo = seq(16, 0x70);
  const V1 = {
    kSenha: '203bc3442d7e4ffef3280e0ae4822ddab340c0aea33d4ac805ee1130f9f80366',
    kAuth: '5333b7c4a2b44f75b8d83928b7c2caa4c7ffd6daf43d055277e8cdadc41e38df',
    kRec: 'bcf57de9025de59d05ce579c3e1000c8e44c9766e31a1bcbb345d61912117bc3',
    entradaPrf: 'dedf5caaccb20b6504535eac7a5d2c88229efd6426913c9f8f1717389892a9cd',
    env: '01548ed14b7ba53c1b5f0420b615412a265423563f2d62d851f21fc2fd27611b2eb096e409002bf3c1718b1fa8f661e82fe1099f739d366cc58c176fad',
    rec: '01fbaeeaf4d446611a3fa317dd66e0ab69b9a28536be93db9784ea997bf8b474dcab3e698f74d89cd1f07b9778162f6faceaf5d120b50f35da6f997e3a',
    v: '0186e67b893456a3bacbc0735aa52bf971a0cc883b71c3a539a6cae433a4f7fab8f8327b5cf1c195c6797df0c3635a36c6482ee7d90d0673141d7a7096',
    item:
      '0134bfa98f9658a1884c666166ee99322e7853e85d37be7a3ee5198b6492c3fb53dbceb82ab0f42a75713ced2dd4b0be37baf7d1f26deef64c2eed8fe760118a2b485c2001c332dbb11b8d0531ec09e1429c74f11875e4f28d6e666e8d8b66b9cfba3069efc1045c8d8229e66e437da692d191c10a26d078e3a8da060d88173e8073263fb5b0afad04008b480833ab44b6c147fa91a3bc414f11be27d3e6764042db3f7c9e05d39aa9e9b9166ab21618fa8dee817330c8a6d88618e8b9fbddd4be38d9ce3fbeece0fdea13daab4781389bb28f9e057c7c9ea138c7b5137f78d29a647ecd61df5ffe2b0fc66b17ba57d4d4f7afb1ec3744228fe710842b7eb199469140e48f6e76e3cae23999b2391f3ea265ad20525b3f63fc63e2f006c6a549077917f6ef6e1887b026c005884231beb5f54f06e4247e6c9cc826f12b2e3b244abf6168c869da59d8ab5777071c07b64f0d47c9754f30d14a1127160cba0923aef4ce5f6a8c555d7d903cfb12363e347054be36c1c663acbcb1093938c9daa0ea2643d725f8951dac8d59e10000ddb32c06d1452295294ecd856295364a64a5e6b2babe5f7bee5bbf9b9ea156fc7859744335e0cd83e0dd5c2bdec7cf8d8ffd70ce1a27ae682602b76f65bc60a75ca3a102295f6438add2d18b56359bb9d3d424e070c10155cfee435ddd94af6943c7e35deac7d344a7d93903f5cada13634c10eaced2acf486756494d451bcb1b290ff5c37fd0db7fbe4ece06acd2e',
    manifesto:
      '01848756a2a2e4a5c91b45c8531fbb6fa805d429b7e63a589ea54f10281992d67cc5a215284c3b5c6802acde0c6c1b0ef08458ec3948f2673bf684452cdcc6459e45ae6f390621d1baf074e86e028fd273cba428a5d3584bb08c1f9c924520a08c3af6ce89f0243724c5acfddb36aca1f30f40851d4828e6b2f81692babd34c526dd916bf53c9337f9048ea66c8508b799500e005f60b12a91398ef7102b3fae3c73c78ad1bb5e31ea7b82e1b75376de049094d0e1ddf69548a1d52058fff35f347c4e2865e676f8e43ada42dfdb01fcb8118538b307e2ae013b1dbe55016e5f8db084750aaed61abc0f5cad0b99842b1ec97ee3c2e16428dc525f7ef973665e8c5e148bb0712ca71890b879a445ae15efce50403e5eb824fcda0016110bd73844a71b36fb8adaf20d93176598e7bc55c13b92212c180767fc6b00cb7e7b99638275ed050a1182ebe59c5e689077122eb8e58b0b71f690fae8ffb0d601acc5317a1ad517bf8e7c4245f4ccdd784638f2c31bcf9fe0ce80e21cc13788dee4f50fa9551c07f89b64d290419c416b818f4172dbece21f8ed2c1d6367d392f9711663415459d6e4f8c2802ce597861d9c4e33b80722606b62eb6cefe05ccc451abf5f762965acf454be6c94400edcd0d93643315564f33d52d55281c167763046de185341d11501274b2dc1906d787a916c07dac234b71781ee2223b3865fa26a33ee361f6d2d86dbbaec3a492bba0f18d2e4d67fced5436779941ed379f53',
  };

  it(
    'kSenha sai igual da mesma senha e do mesmo sal',
    async () => {
      expect(paraHex(await chaveDaSenha('cofre-de-teste-nunca-use-esta', sal, KDF_PADRAO))).toBe(V1.kSenha);
    },
    LENTO,
  );

  it('as provas e a entrada do PRF saem iguais', async () => {
    expect(paraHex(await provaDaSenha(deHex(V1.kSenha), m))).toBe(V1.kAuth);
    expect(paraHex(await provaDoCodigo(codigo))).toBe(V1.kRec);
    expect(paraHex(await entradaPrf())).toBe(V1.entradaPrf);
  });

  it('abre o envelope do aparelho, o do código, o cofre, o item e o manifesto', async () => {
    expect(await abrirEnvelope(prf, USUARIO, ENVELOPE, deHex(V1.env))).toEqual(m);
    expect(await abrirRecuperacao(codigo, USUARIO, deHex(V1.rec))).toEqual(m);
    const chave = await abrirCofre(deHex(V1.kSenha), m, USUARIO, deHex(V1.v));
    expect(await decifrarItem(chave, USUARIO, ITEM, 3, deHex(V1.item))).toEqual({ titulo: 'Banco', usuario: 'eu', senha: 's3nh@-ção' });
    expect(await decifrarManifesto(chave, USUARIO, 7, deHex(V1.manifesto))).toEqual({
      contador: 7,
      itens: { [ITEM]: 3 },
      lixeira: {},
      mudadoEm: '2026-10-21T15:00:00.000Z',
      aparelho: 'Celular',
    });
  });
});

describe('senha mestra', () => {
  it(
    'a mesma frase em formas Unicode diferentes dá a mesma chave; outra frase, outro sal, outra',
    async () => {
      const sal = novoSal();
      const composta = await chaveDaSenha('pão-de-açúcar', sal, KDF_PADRAO);
      const decomposta = await chaveDaSenha('pão-de-açúcar'.normalize('NFD'), sal, KDF_PADRAO);
      expect(decomposta).toEqual(composta);
      expect(await chaveDaSenha('pao-de-acucar', sal, KDF_PADRAO)).not.toEqual(composta);
      expect(await chaveDaSenha('pão-de-açúcar', novoSal(), KDF_PADRAO)).not.toEqual(composta);
    },
    LENTO,
  );
});

describe('ida e volta', () => {
  let kSenha: Uint8Array;
  let m: Uint8Array;
  let v: Uint8Array;
  let chave: ChaveDoCofre;

  beforeEach(async () => {
    kSenha = novaChaveDoMeio(); // 32 bytes quaisquer fazem o papel da saída do Argon2id
    m = novaChaveDoMeio();
    ({ v, chave } = await criarCofre(kSenha, m, USUARIO));
  });

  it('a chave do cofre não é exportável', async () => {
    expect(chave.base.extractable).toBeFalse();
    await expectAsync(crypto.subtle.exportKey('raw', chave.base)).toBeRejected();
  });

  it('cada envelope de aparelho devolve M', async () => {
    const prf = novoSegredoDeAparelho();
    const servidor = novoSegredoDeAparelho();
    const id1 = novoId();
    const id2 = novoId();
    expect(await abrirEnvelope(prf, USUARIO, id1, await selarEnvelope(prf, USUARIO, id1, m))).toEqual(m);
    expect(await abrirEnvelope(servidor, USUARIO, id2, await selarEnvelope(servidor, USUARIO, id2, m))).toEqual(m);
  });

  it('o código de recuperação devolve M', async () => {
    const codigo = crypto.getRandomValues(new Uint8Array(16));
    expect(await abrirRecuperacao(codigo, USUARIO, await selarRecuperacao(codigo, USUARIO, m))).toEqual(m);
  });

  it('o cofre abre com kSenha e M, e os itens de antes continuam abrindo', async () => {
    const dados = await cifrarItem(chave, USUARIO, ITEM, 1, { senha: 'x' });
    const reaberta = await abrirCofre(kSenha, m, USUARIO, v);
    expect(await decifrarItem(reaberta, USUARIO, ITEM, 1, dados)).toEqual({ senha: 'x' });
  });

  it('trocar a senha mantém a chave do cofre e deixa a senha antiga de fora', async () => {
    const dados = await cifrarItem(chave, USUARIO, ITEM, 1, { senha: 'x' });
    const nova = novaChaveDoMeio();
    const v2 = await reselarCofre(kSenha, nova, m, USUARIO, v);
    const reaberta = await abrirCofre(nova, m, USUARIO, v2);
    expect(await decifrarItem(reaberta, USUARIO, ITEM, 1, dados)).toEqual({ senha: 'x' });
    await falha(abrirCofre(kSenha, m, USUARIO, v2), 'abrir');
    await falha(reselarCofre(novaChaveDoMeio(), nova, m, USUARIO, v), 'abrir');
  });

  it('kAuth muda com a senha e com M', async () => {
    const a = await provaDaSenha(kSenha, m);
    expect(a.length).toBe(32);
    expect(await provaDaSenha(kSenha, m)).toEqual(a);
    expect(await provaDaSenha(novaChaveDoMeio(), m)).not.toEqual(a);
    expect(await provaDaSenha(kSenha, novaChaveDoMeio())).not.toEqual(a);
  });

  it('o item tem o tamanho arredondado, e o grande demais é recusado', async () => {
    const pequeno = await cifrarItem(chave, USUARIO, ITEM, 1, { s: 'a' });
    const medio = await cifrarItem(chave, USUARIO, ITEM, 1, { s: 'a'.repeat(400) });
    const maior = await cifrarItem(chave, USUARIO, ITEM, 1, { s: 'a'.repeat(600) });
    expect(pequeno.length).toBe(BLOCO + SOBRA_SELADO);
    expect(medio.length).toBe(BLOCO + SOBRA_SELADO);
    expect(maior.length).toBe(2 * BLOCO + SOBRA_SELADO);
    await falha(cifrarItem(chave, USUARIO, ITEM, 1, { s: 'a'.repeat(16 * 1024) }), 'grande');
  });

  it('o mesmo item cifrado duas vezes sai diferente (IV novo)', async () => {
    const a = await cifrarItem(chave, USUARIO, ITEM, 1, { s: 'a' });
    const b = await cifrarItem(chave, USUARIO, ITEM, 1, { s: 'a' });
    expect(paraHex(a)).not.toBe(paraHex(b));
  });
});

describe('ataques: adulteração e troca de lugar', () => {
  let m: Uint8Array;
  let kSenha: Uint8Array;
  let v: Uint8Array;
  let chave: ChaveDoCofre;
  const prf = seq(32, 9);
  let envelope: Uint8Array;
  let item: Uint8Array;
  let manifesto: Uint8Array;
  const base: Manifesto = { contador: 4, itens: { [ITEM]: 2 }, lixeira: {}, mudadoEm: '2026-10-21T12:00:00.000Z', aparelho: 'PC' };

  beforeEach(async () => {
    m = novaChaveDoMeio();
    kSenha = novaChaveDoMeio();
    ({ v, chave } = await criarCofre(kSenha, m, USUARIO));
    envelope = await selarEnvelope(prf, USUARIO, ENVELOPE, m);
    item = await cifrarItem(chave, USUARIO, ITEM, 2, { senha: 'segredo' });
    manifesto = await cifrarManifesto(chave, USUARIO, base);
  });

  /** Mexe em cada parte do selado: versão, IV, texto cifrado e etiqueta. */
  async function cadaBit(selado: Uint8Array, abre: (s: Uint8Array) => Promise<unknown>): Promise<void> {
    await falha(abre(mexido(selado, 0)), 'versao');
    for (const pos of [1, 12, 13, Math.floor(selado.length / 2), selado.length - 17, selado.length - 1]) {
      await falha(abre(mexido(selado, pos)), 'abrir');
    }
    await falha(abre(selado.slice(0, 20)), 'formato');
    await falha(abre(selado.slice(0, selado.length - 1)), 'abrir');
  }

  it('servidor adulterado: um bit mexido no envelope não abre', async () => {
    await cadaBit(envelope, (s) => abrirEnvelope(prf, USUARIO, ENVELOPE, s));
  });

  it('servidor adulterado: um bit mexido em V não abre', async () => {
    await cadaBit(v, (s) => abrirCofre(kSenha, m, USUARIO, s));
  });

  it('servidor adulterado: um bit mexido no item não abre', async () => {
    await cadaBit(item, (s) => decifrarItem(chave, USUARIO, ITEM, 2, s));
  });

  it('servidor adulterado: um bit mexido no manifesto não abre', async () => {
    await cadaBit(manifesto, (s) => decifrarManifesto(chave, USUARIO, 4, s));
  });

  it('passkey errada, outra conta ou outro envelope: o envelope não abre', async () => {
    await falha(abrirEnvelope(seq(32, 10), USUARIO, ENVELOPE, envelope), 'abrir');
    await falha(abrirEnvelope(prf, OUTRO_USUARIO, ENVELOPE, envelope), 'abrir');
    await falha(abrirEnvelope(prf, USUARIO, novoId(), envelope), 'abrir');
  });

  it('só a senha ou só M não abrem o cofre', async () => {
    await falha(abrirCofre(novaChaveDoMeio(), m, USUARIO, v), 'abrir');
    await falha(abrirCofre(kSenha, novaChaveDoMeio(), USUARIO, v), 'abrir');
    await falha(abrirCofre(kSenha, m, OUTRO_USUARIO, v), 'abrir');
  });

  it('código errado ou de outra conta não abre o envelope do código', async () => {
    const codigo = seq(16, 1);
    const rec = await selarRecuperacao(codigo, USUARIO, m);
    await falha(abrirRecuperacao(seq(16, 2), USUARIO, rec), 'abrir');
    await falha(abrirRecuperacao(codigo, OUTRO_USUARIO, rec), 'abrir');
    // o envelope do código não serve no lugar do de um aparelho, nem o contrário
    await falha(abrirEnvelope(prf, USUARIO, ENVELOPE, rec), 'abrir');
    expect(await provaDoCodigo(codigo)).not.toEqual(await provaDoCodigo(seq(16, 2)));
  });

  it('item trocado de id, de versão (versão velha) ou de conta não abre', async () => {
    await falha(decifrarItem(chave, USUARIO, novoId(), 2, item), 'abrir');
    await falha(decifrarItem(chave, USUARIO, ITEM, 1, item), 'abrir');
    await falha(decifrarItem(chave, USUARIO, ITEM, 3, item), 'abrir');
    await falha(decifrarItem(chave, OUTRO_USUARIO, ITEM, 2, item), 'abrir');
  });

  it('item de outro cofre não abre', async () => {
    const outro = await criarCofre(novaChaveDoMeio(), novaChaveDoMeio(), USUARIO);
    await falha(decifrarItem(outro.chave, USUARIO, ITEM, 2, item), 'abrir');
  });

  it('manifesto velho com o contador novo não abre', async () => {
    await falha(decifrarManifesto(chave, USUARIO, 5, manifesto), 'abrir');
    await falha(decifrarManifesto(chave, OUTRO_USUARIO, 4, manifesto), 'abrir');
  });

  it('o manifesto não serve como item, nem o item como manifesto', async () => {
    await falha(decifrarItem(chave, USUARIO, ITEM, 2, manifesto), 'abrir');
    await falha(decifrarManifesto(chave, USUARIO, 2, item), 'abrir');
  });

  it('selado de uma versão desconhecida é recusado', async () => {
    const futuro = item.slice();
    futuro[0] = 2;
    await falha(decifrarItem(chave, USUARIO, ITEM, 2, futuro), 'versao');
  });
});

describe('manifesto', () => {
  const A = '00000000-0000-4000-8000-00000000000a';
  const B = '00000000-0000-4000-8000-00000000000b';
  const C = '00000000-0000-4000-8000-00000000000c';
  const manifesto: Manifesto = { contador: 9, itens: { [A]: 1, [B]: 4 }, lixeira: { [C]: 2 }, mudadoEm: '2026-10-21T12:00:00.000Z', aparelho: 'Celular' };
  const certos = [
    { id: A, versao: 1, naLixeira: false },
    { id: B, versao: 4, naLixeira: false },
    { id: C, versao: 2, naLixeira: true },
  ];

  it('aceita exatamente os itens do manifesto, em qualquer ordem', () => {
    expect(() => conferirItens(manifesto, certos)).not.toThrow();
    expect(() => conferirItens(manifesto, [...certos].reverse())).not.toThrow();
  });

  it('servidor esconde um item: recusado', async () => {
    await falha(() => conferirItens(manifesto, certos.slice(1)), 'manifesto');
  });

  it('servidor põe um item a mais: recusado', async () => {
    await falha(() => conferirItens(manifesto, [...certos, { id: novoId(), versao: 1, naLixeira: false }]), 'manifesto');
  });

  it('servidor devolve uma versão velha de um item: recusado', async () => {
    await falha(() => conferirItens(manifesto, [certos[0], { ...certos[1], versao: 3 }, certos[2]]), 'manifesto');
  });

  it('servidor tira um item da lixeira, ou põe nela: recusado', async () => {
    await falha(() => conferirItens(manifesto, [certos[0], certos[1], { ...certos[2], naLixeira: false }]), 'manifesto');
    await falha(() => conferirItens(manifesto, [{ ...certos[0], naLixeira: true }, certos[1], certos[2]]), 'manifesto');
  });

  it('servidor repete um item: recusado', async () => {
    await falha(() => conferirItens(manifesto, [...certos, certos[0]]), 'manifesto');
  });

  it('não cifra um manifesto malformado', async () => {
    const { chave } = await criarCofre(novaChaveDoMeio(), novaChaveDoMeio(), USUARIO);
    await falha(cifrarManifesto(chave, USUARIO, { ...manifesto, lixeira: { [A]: 1 } }), 'formato');
    await falha(cifrarManifesto(chave, USUARIO, { ...manifesto, itens: { 'nao-e-uuid': 1 } }), 'formato');
    await falha(cifrarManifesto(chave, USUARIO, { ...manifesto, itens: { [A]: 0 } }), 'formato');
    await falha(cifrarManifesto(chave, USUARIO, { ...manifesto, contador: -1 }), 'formato');
    await falha(cifrarManifesto(chave, USUARIO, { ...manifesto, mudadoEm: 'ontem' }), 'formato');
  });

  it('vai e volta, e o tamanho cresce em blocos', async () => {
    const { chave } = await criarCofre(novaChaveDoMeio(), novaChaveDoMeio(), USUARIO);
    const dados = await cifrarManifesto(chave, USUARIO, manifesto);
    expect((dados.length - SOBRA_SELADO) % BLOCO).toBe(0);
    expect(await decifrarManifesto(chave, USUARIO, 9, dados)).toEqual(manifesto);
  });
});
