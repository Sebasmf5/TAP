# ADR 0001: Ajustes de contraste WCAG 2.2 AA en tokens y decisiones de Fase 0

- **Estado:** Aceptado
- **Fecha:** 2026-11-04

## Contexto

En la Fase 0 se construye el sistema de diseño de dos temas (`AGENTS.md` A9), la configuración de herramientas de análisis estático y la infraestructura base de persistencia y colas.

## Decisiones

1. **Ajuste de `--action-hover` y series de gráficos en el tema claro por contraste WCAG 2.2 AA:**
   - La referencia de estilo clara sugiere `#7389ff` como acento de hover, pero `AGENTS.md` A9 indica expresamente: _«`#7389ff` (verifica el contraste del texto)»_ y establece que las reglas de accesibilidad prevalecen (4.5:1 para texto normal, 3.0:1 para gráficos y bordes fuertes).
   - El par `#ffffff` sobre `#7389ff` arroja un contraste de `3.16:1` (inferior a `4.5:1`). Por ello, `--action-hover` en el tema claro se fijó en `#3f27d8` (contraste `7.82:1` con texto `#ffffff`).
   - De igual forma, en la paleta de gráficos del tema claro sobre `--surface` (`#ffffff`), `#b9b9f9` (`1.74:1`) y `#7f71e6` (`3.81:1`) se ajustaron a `#6b5be2` (`4.82:1`) y `#182659` (`13.84:1`) para que las 5 series superen ampliamente el umbral `3.0:1` exigido por `AGENTS.md` A9.
2. **Ubicación del proveedor de tema en `apps/web/src/shared/theme/`:**
   - El archivo CSS único permanece en `apps/web/src/app/theme/tokens.css` (tal como pide `AGENTS.md` A9), mientras que `ThemeProvider` y `palette.ts` residen en `apps/web/src/shared/theme/` (y se reexportan desde `app/theme/`) para que los componentes base de `shared/ui` (`ChartFrame`, `ThemeToggle`) no importen desde la capa `app`, cumpliendo la regla de fronteras de `eslint-plugin-boundaries`.
3. **Esquema `pgboss` dedicado en PostgreSQL:**
   - `pg-boss` v12 se configura sobre su propio esquema `pgboss` (creado también en `docker/init/01-init-app-role.sh` con autorización al rol sin privilegios `tap_app`), manteniendo limpios los 10 esquemas de módulos de negocio y el esquema `shared`.
4. **Fijación de `typescript@~6.0.0`:**
   - Se fijó TypeScript en la rama `6.0.x` (`6.0.3`) porque `typescript-eslint@8.72.1` declara `peerDependencies: ">=4.8.4 <6.1.0"`. Así `pnpm peers check` pasa con cero advertencias.
