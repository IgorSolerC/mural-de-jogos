import { dropMask, holdMask, maskClass, maskRuleCount } from './mask-rules';

/** O recorte do papel como regra de CSS: uma por recorte, enquanto houver quem use. */
describe('as regras dos recortes (mask-rules)', () => {
  const mask = (n: number) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${n}' height='10'%3E%3Crect width='${n}' height='10'/%3E%3C/svg%3E")`;

  beforeEach(() => jasmine.clock().install());
  afterEach(() => {
    // o que sobrou sem dono sai
    jasmine.clock().tick(10_000);
    jasmine.clock().uninstall();
  });

  it('o mesmo recorte tem sempre a mesma classe; recortes diferentes, classes diferentes', () => {
    const a = maskClass(mask(901));
    expect(maskClass(mask(901))).toBe(a);
    expect(maskClass(mask(902))).not.toBe(a);
  });

  it('a classe põe a máscara no elemento, como o style punha', () => {
    const value = mask(903);
    holdMask(value);
    const el = document.createElement('div');
    el.className = maskClass(value);
    document.body.append(el);
    expect(getComputedStyle(el).maskImage).toContain('data:image/svg+xml');
    el.remove();
    dropMask(value);
  });

  it('vale acima de uma regra mais específica, como o style valia', () => {
    const value = mask(904);
    holdMask(value);
    const style = document.createElement('style');
    style.textContent = '#teste-mascara.forte.forte { mask-image: none; -webkit-mask-image: none; }';
    document.head.append(style);
    const el = document.createElement('div');
    el.id = 'teste-mascara';
    el.className = `forte ${maskClass(value)}`;
    document.body.append(el);
    expect(getComputedStyle(el).maskImage).toContain('data:image/svg+xml');
    el.remove();
    style.remove();
    dropMask(value);
  });

  it('a regra fica enquanto alguém segura e sai um pouco depois de o último soltar', () => {
    const before = maskRuleCount();
    const value = mask(905);
    holdMask(value);
    holdMask(value);
    expect(maskRuleCount()).toBe(before + 1);
    dropMask(value);
    jasmine.clock().tick(10_000);
    expect(maskRuleCount()).withContext('ainda tem um dono').toBe(before + 1);
    dropMask(value);
    jasmine.clock().tick(1000);
    expect(maskRuleCount()).withContext('a cópia do papel antigo ainda está sumindo').toBe(before + 1);
    jasmine.clock().tick(10_000);
    expect(maskRuleCount()).toBe(before);
  });

  it('quem volta a segurar antes de a regra sair fica com ela', () => {
    const value = mask(906);
    holdMask(value);
    const cls = maskClass(value);
    dropMask(value);
    jasmine.clock().tick(1000);
    holdMask(value);
    jasmine.clock().tick(10_000);
    expect(maskClass(value)).toBe(cls);
    const el = document.createElement('div');
    el.className = cls;
    document.body.append(el);
    expect(getComputedStyle(el).maskImage).toContain('data:image/svg+xml');
    el.remove();
    dropMask(value);
  });
});
