import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_TOKENS, type ThemeMode } from '../src/app/theme/palette.ts';
import { contrastRatio } from '../src/shared/lib/contrast.ts';

describe('Contraste WCAG 2.2 AA de los tokens en ambos temas (AGENTS.md A9)', () => {
  const modes: ReadonlyArray<ThemeMode> = ['light', 'dark'];

  for (const mode of modes) {
    describe(`tema ${mode}`, () => {
      const t = THEME_TOKENS[mode];

      it('cumple >= 4.5:1 en todos los textos informativos sobre canvas, surface y surface-raised', () => {
        const backgrounds = [
          { name: 'canvas', value: t.canvas },
          { name: 'surface', value: t.surface },
          { name: 'surfaceRaised', value: t.surfaceRaised },
        ];
        const foregrounds = [
          { name: 'textHeading', value: t.textHeading },
          { name: 'textBody', value: t.textBody },
          { name: 'textMuted', value: t.textMuted },
          { name: 'link', value: t.link },
        ];

        for (const bg of backgrounds) {
          for (const fg of foregrounds) {
            const ratio = contrastRatio(fg.value, bg.value);
            expect(
              ratio,
              `[${mode}] ${fg.name} (${fg.value}) sobre ${bg.name} (${bg.value}) = ${ratio}:1`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      });

      it('cumple >= 4.5:1 en botón primario (action y actionHover) con su texto', () => {
        expect(contrastRatio(t.actionText, t.action)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.actionText, t.actionHover)).toBeGreaterThanOrEqual(4.5);
      });

      it('cumple >= 4.5:1 en todas las etiquetas de estado (éxito, peligro, advertencia, información)', () => {
        expect(contrastRatio(t.statusSuccessText, t.statusSuccessBg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.statusDangerText, t.statusDangerBg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.statusWarningText, t.statusWarningBg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.statusInfoText, t.statusInfoBg)).toBeGreaterThanOrEqual(4.5);
      });

      it('cumple >= 3.0:1 en borderStrong, textSubtle, focusRing y las 5 series de gráficos', () => {
        expect(contrastRatio(t.borderStrong, t.canvas)).toBeGreaterThanOrEqual(3.0);
        expect(contrastRatio(t.textSubtle, t.canvas)).toBeGreaterThanOrEqual(3.0);
        expect(contrastRatio(t.focusRing, t.canvas)).toBeGreaterThanOrEqual(3.0);

        for (const [idx, color] of t.chartSeries.entries()) {
          const ratio = contrastRatio(color, t.surface);
          expect(
            ratio,
            `[${mode}] serie de gráfico #${idx + 1} (${color}) sobre surface (${t.surface}) = ${ratio}:1`,
          ).toBeGreaterThanOrEqual(3.0);
        }
      });
    });
  }

  it('mantiene sincronizados los valores de tokens.css con palette.ts', () => {
    const cssPath = resolve(import.meta.dirname, '../src/app/theme/tokens.css');
    const css = readFileSync(cssPath, 'utf8');

    for (const mode of modes) {
      const t = THEME_TOKENS[mode];
      expect(css).toContain(t.canvas);
      expect(css).toContain(t.action);
      expect(css).toContain(t.actionHover);
      expect(css).toContain(t.textHeading);
      expect(css).toContain(t.textBody);
      expect(css).toContain(t.textMuted);
    }
  });
});
