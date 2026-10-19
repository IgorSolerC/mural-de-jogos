import { ICON } from './icons';
import { KIND_PROFILES } from '../core/kinds';
import { bonusIcon } from './bonus';

describe('adesivos de bônus', () => {
  it('todo bônus da cartela pronta tem desenho próprio (o mais e o menos são dos escritos à mão)', () => {
    for (const p of Object.values(KIND_PROFILES)) {
      for (const b of p.bonuses) {
        const icon = bonusIcon(b);
        expect(icon === ICON.adicionar || icon === ICON.tirar).withContext(`${p.kind}: ${b.label}`).toBeFalse();
      }
    }
  });
});
