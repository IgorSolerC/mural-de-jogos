import { swallowNextClick, tabStep } from './focus';

describe('tabStep (as setas numa fileira de abas)', () => {
  it('← e → dão a volta; Home e End vão às pontas', () => {
    expect(tabStep('ArrowRight', 0, 3)).toBe(1);
    expect(tabStep('ArrowRight', 2, 3)).toBe(0);
    expect(tabStep('ArrowLeft', 0, 3)).toBe(2);
    expect(tabStep('Home', 2, 3)).toBe(0);
    expect(tabStep('End', 0, 3)).toBe(2);
  });

  it('↑ e ↓ contam como ← e →, a não ser numa fileira só deitada', () => {
    expect(tabStep('ArrowDown', 0, 3)).toBe(1);
    expect(tabStep('ArrowUp', 0, 3)).toBe(2);
    expect(tabStep('ArrowDown', 0, 3, false)).toBe(-1);
  });

  it('outra tecla não é de aba', () => {
    expect(tabStep('Enter', 1, 3)).toBe(-1);
    expect(tabStep('a', 1, 3)).toBe(-1);
  });
});

describe('swallowNextClick', () => {
  it('engole só o primeiro clique, e só logo depois de soltar', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    let clicks = 0;
    el.addEventListener('click', () => clicks++);
    swallowNextClick(el);
    el.click();
    expect(clicks).toBe(0);
    el.click();
    expect(clicks).toBe(1);
    swallowNextClick(el);
    await new Promise((r) => setTimeout(r));
    el.click();
    expect(clicks).toBe(2);
    el.remove();
  });
});
