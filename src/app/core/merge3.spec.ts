import { commonPairs, merge3, mergeText } from './merge3';

/**
 * A junção de três vias, como a do git: o que só um lado mexeu entra, o que os dois acrescentaram
 * fica, e o que os dois mudaram diferente vira conflito.
 */
describe('merge3', () => {
  describe('commonPairs (a maior subsequência comum)', () => {
    const lcs = (a: string, b: string) => commonPairs([...a], [...b]).map(([i]) => a[i]).join('');

    it('acha a subsequência comum de exemplos clássicos', () => {
      expect(lcs('ABCABBA', 'CBABAC').length).toBe(4);
      expect(lcs('abc', 'abc')).toBe('abc');
      expect(lcs('', 'abc')).toBe('');
      expect(lcs('abc', '')).toBe('');
      expect(lcs('abc', 'xyz')).toBe('');
      expect(lcs('xaybzc', 'abc')).toBe('abc');
    });

    it('os pares saem em ordem e apontam para elementos iguais', () => {
      for (let n = 0; n < 200; n++) {
        const rnd = (len: number) => Array.from({ length: len }, () => 'abcd'[Math.floor(Math.random() * 4)]).join('');
        const a = rnd(Math.floor(Math.random() * 30));
        const b = rnd(Math.floor(Math.random() * 30));
        const pairs = commonPairs([...a], [...b]);
        for (let i = 0; i < pairs.length; i++) {
          const [x, y] = pairs[i];
          expect(a[x]).toBe(b[y]);
          if (i) {
            expect(x).toBeGreaterThan(pairs[i - 1][0]);
            expect(y).toBeGreaterThan(pairs[i - 1][1]);
          }
        }
        // o tamanho é o da subsequência comum máxima (conferido pela programação dinâmica)
        const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
        for (let i = a.length - 1; i >= 0; i--)
          for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        expect(pairs.length).toBe(dp[0][0]);
      }
    });

    it('aguenta textos longos parecidos sem demorar', () => {
      const a = Array.from({ length: 20000 }, (_, i) => `linha ${i}`);
      const b = [...a];
      b.splice(10000, 3, 'mudou');
      const t = performance.now();
      expect(commonPairs(a, b).length).toBe(19997);
      expect(performance.now() - t).toBeLessThan(500);
    });
  });

  describe('merge3 (listas)', () => {
    const m = (o: string, a: string, b: string, keepBoth = true) => merge3([...o], [...a], [...b], keepBoth);

    it('sem mudança dos dois lados: igual', () => {
      expect(m('abc', 'abc', 'abc')).toEqual([{ ok: [...'abc'] }]);
    });

    it('só um lado mudou: fica a mudança', () => {
      expect(m('abc', 'aXc', 'abc')).toEqual([{ ok: [...'aXc'] }]);
      expect(m('abc', 'abc', 'abYc')).toEqual([{ ok: [...'abYc'] }]);
      expect(m('abc', 'ac', 'abc')).toEqual([{ ok: [...'ac'] }]);
    });

    it('os dois mudaram lugares diferentes: as duas mudanças ficam', () => {
      expect(m('abcde', 'Xbcde', 'abcdY')).toEqual([{ ok: [...'XbcdY'] }]);
    });

    it('os dois mudaram igual: fica uma vez', () => {
      expect(m('abc', 'aXc', 'aXc')).toEqual([{ ok: [...'aXc'] }]);
    });

    it('inserção dos dois no mesmo lugar: as duas ficam (ou conflito, sem keepBoth)', () => {
      expect(m('ac', 'aXc', 'aYc')).toEqual([{ ok: [...'aXYc'] }]);
      expect(m('ac', 'aXc', 'aYc', false)).toEqual([{ ok: ['a'] }, { conflict: { o: [], a: ['X'], b: ['Y'] } }, { ok: ['c'] }]);
    });

    it('o mesmo trecho mudado diferente: conflito', () => {
      expect(m('abc', 'aXc', 'aYc')).toEqual([{ ok: ['a'] }, { conflict: { o: ['b'], a: ['X'], b: ['Y'] } }, { ok: ['c'] }]);
    });

    it('um apagou e o outro mudou o mesmo trecho: conflito', () => {
      expect(m('abc', 'ac', 'aYc')).toEqual([{ ok: ['a'] }, { conflict: { o: ['b'], a: [], b: ['Y'] } }, { ok: ['c'] }]);
    });

    it('os dois apagaram o mesmo: some uma vez', () => {
      expect(m('abc', 'ac', 'ac')).toEqual([{ ok: [...'ac'] }]);
    });

    it('a base vazia', () => {
      expect(m('', 'a', 'b')).toEqual([{ ok: ['a', 'b'] }]);
      expect(m('', '', 'b')).toEqual([{ ok: ['b'] }]);
      expect(m('', '', '')).toEqual([]);
    });
  });

  describe('mergeText', () => {
    it('linhas novas no fim, dos dois lados: ficam as duas, a de quem gravou antes primeiro', () => {
      const r = mergeText('arroz\nfeijão', 'arroz\nfeijão\nleite', 'arroz\nfeijão\novos');
      expect(r.clean).toBeTrue();
      expect(r.a).toBe('arroz\nfeijão\nleite\novos');
    });

    it('cada um mexe numa linha diferente: as duas mudanças ficam', () => {
      const r = mergeText('um\ndois\ntrês\nquatro', 'UM\ndois\ntrês\nquatro', 'um\ndois\ntrês\nQUATRO');
      expect(r.clean).toBeTrue();
      expect(r.a).toBe('UM\ndois\ntrês\nQUATRO');
    });

    it('um apaga uma linha, o outro mexe em outra: as duas ficam', () => {
      const r = mergeText('a\nb\nc\nd', 'a\nc\nd', 'a\nb\nc\nD');
      expect(r.clean).toBeTrue();
      expect(r.a).toBe('a\nc\nD');
    });

    it('linhas vizinhas mexidas por pessoas diferentes não brigam (o git brigaria)', () => {
      expect(mergeText('a\nb\nc', 'a\nc', 'a\nb\nC')).toEqual(jasmine.objectContaining({ clean: true, a: 'a\nC' }));
      expect(mergeText('a\nb\nc', 'A\nb\nc', 'a\nB\nc')).toEqual(jasmine.objectContaining({ clean: true, a: 'A\nB\nc' }));
      // uma muda a linha, a outra acrescenta logo depois dela
      expect(mergeText('a\nb', 'A\nb', 'a\nnova\nb')).toEqual(jasmine.objectContaining({ clean: true, a: 'A\nnova\nb' }));
      // uma acrescenta antes da linha que a outra apagou
      expect(mergeText('a\nb\nc', 'a\nnova\nb\nc', 'a\nc')).toEqual(jasmine.objectContaining({ clean: true, a: 'a\nnova\nc' }));
    });

    it('uma mudança no meio de um trecho que a outra trocou inteiro: conflito', () => {
      const r = mergeText('a\nb\nc\nd', 'a\nX\nd', 'a\nb\nnova\nc\nd');
      expect(r.clean).toBeFalse();
    });

    it('palavras diferentes da mesma linha: junta por palavras, sem conflito', () => {
      const r = mergeText('O gato preto subiu no telhado.', 'O gato branco subiu no telhado.', 'O gato preto desceu do telhado.');
      expect(r.clean).toBeTrue();
      expect(r.a).toBe('O gato branco desceu do telhado.');
    });

    it('a mesma palavra trocada por coisas diferentes: conflito, com as duas versões', () => {
      const r = mergeText('O gato preto.', 'O gato branco.', 'O gato cinza.');
      expect(r.clean).toBeFalse();
      expect(r.a).toBe('O gato branco.');
      expect(r.b).toBe('O gato cinza.');
      expect(r.segments).toEqual([{ o: 'O gato preto.', a: 'O gato branco.', b: 'O gato cinza.' }]);
    });

    it('o conflito vem marcado entre os trechos iguais', () => {
      const r = mergeText('topo\nmeio\nfim', 'topo\nMEIO A\nfim', 'topo\nmeio B\nfim');
      expect(r.clean).toBeFalse();
      expect(r.segments).toEqual([{ same: 'topo' }, { o: 'meio', a: 'MEIO A', b: 'meio B' }, { same: 'fim' }]);
      expect(r.a).toBe('topo\nMEIO A\nfim');
      expect(r.b).toBe('topo\nmeio B\nfim');
    });

    it('dois conflitos e uma mudança limpa entre eles', () => {
      const r = mergeText('1\n2\n3\n4\n5', 'A\n2\n3\n4\nE', 'B\n2\nC\n4\nF');
      expect(r.clean).toBeFalse();
      expect(r.a).toBe('A\n2\nC\n4\nE');
      expect(r.b).toBe('B\n2\nC\n4\nF');
      expect(r.segments.filter((s) => 'a' in s).length).toBe(2);
    });

    it('apagar a linha que o outro mudou: conflito (não some calado)', () => {
      const r = mergeText('a\nb\nc', 'a\nc', 'a\nB!\nc');
      expect(r.clean).toBeFalse();
      expect(r.a).toBe('a\nc');
      expect(r.b).toBe('a\nB!\nc');
    });

    it('as quebras do Windows não contam como mudança', () => {
      const r = mergeText('a\nb', 'a\r\nb\r\nc', 'x\nb');
      expect(r.clean).toBeTrue();
      expect(r.a).toBe('x\nb\nc');
    });

    it('as linhas em branco e as listas de tarefas ficam como estão', () => {
      const o = '- [ ] pão\n\n- [ ] leite';
      const r = mergeText(o, '- [x] pão\n\n- [ ] leite', '- [ ] pão\n\n- [ ] leite\n- [ ] café');
      expect(r.clean).toBeTrue();
      expect(r.a).toBe('- [x] pão\n\n- [ ] leite\n- [ ] café');
    });

    it('marcar a mesma tarefa dos dois lados não briga', () => {
      const r = mergeText('- [ ] pão', '- [x] pão', '- [x] pão');
      expect(r.clean).toBeTrue();
      expect(r.a).toBe('- [x] pão');
    });

    it('nada de nenhum lado se perde numa junção limpa (propriedade com textos sorteados)', () => {
      const pool = ['alfa', 'beta', 'gama', 'delta', 'épsilon', 'zeta', 'eta', 'teta'];
      const pickLines = (n: number) => Array.from({ length: n }, (_, i) => `${pool[Math.floor(Math.random() * pool.length)]} ${i}`);
      for (let run = 0; run < 150; run++) {
        const o = pickLines(8);
        // cada lado acrescenta linhas próprias em lugares sorteados
        const a = [...o];
        const b = [...o];
        a.splice(Math.floor(Math.random() * a.length), 0, `só de A ${run}`);
        b.splice(Math.floor(Math.random() * b.length), 0, `só de B ${run}`);
        const r = mergeText(o.join('\n'), a.join('\n'), b.join('\n'));
        expect(r.clean).toBeTrue();
        const lines = r.a.split('\n');
        expect(lines).toContain(`só de A ${run}`);
        expect(lines).toContain(`só de B ${run}`);
        for (const l of o) expect(lines).toContain(l);
      }
    });

    it('a junção é a mesma não importa quem junta: os trechos limpos não dependem do lado', () => {
      const o = 'a\nb\nc\nd\ne';
      const x = 'A\nb\nc\nd\ne\nf';
      const y = 'a\nb\nC\nd\ne';
      expect(mergeText(o, x, y).a).toBe('A\nb\nC\nd\ne\nf');
      expect(mergeText(o, y, x).a).toBe('A\nb\nC\nd\ne\nf');
    });
  });
});
