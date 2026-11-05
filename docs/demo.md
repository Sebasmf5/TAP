# Guion de Demostración en Vivo — Tap (Prototipo Funcional)

Este documento describe el paso a paso de 5 minutos para presentar todos los módulos del prototipo **Tap** en vivo.

## 1. Puesta en marcha rápida

```bash
# 1. Generar variables de entorno y claves Ed25519 (si no existe .env)
pnpm setup:env

# 2. Levantar PostgreSQL 17 y Mailpit en Docker
docker compose up -d db mailpit

# 3. Aplicar migraciones SQL (esquemas access, organizations, people, events, attendance, certificates, notifications, inventory, loans, reports)
pnpm db:migrate

# 4. Iniciar API (puerto 3000) y aplicación web (puerto 5173)
pnpm dev
```

- **Panel administrativo (funcionarios):** `http://localhost:5173/login`
  - **Correo:** `admin@demo.tap`
  - **Contraseña:** consultar la clave generada localmente por `pnpm setup:env` en `.env` (`SEED_ADMIN_PASSWORD`)
- **Bandeja de correos de desarrollo (Mailpit):** `http://localhost:8025`

---

## 2. Recorrido de la demostración (5 escenas)

### Escena 1: Inicio de sesión seguro y cambio de tema (Stripe Claro / Linear Oscuro)

1. Ingresa a `http://localhost:5173/login` con las credenciales de `admin@demo.tap`.
2. En la barra superior del panel (`/app`), alterna el selector de tema entre **Claro (referencia Stripe)** y **Oscuro (referencia Linear)**.
3. Recarga la página (`F5`) para demostrar que la sesión se restaura mediante cookie `HttpOnly; SameSite=Strict` sin almacenar ningún token en `localStorage`.

### Escena 2: Creación de evento, afiche QR en PDF y check-in público sin cuenta (`/c/:code`)

1. Ve a **Eventos y talleres** (`/app/events`), crea un evento masivo, publícalo y ábrelo.
2. Descarga el **Afiche PDF A4 con QR** o copia el enlace público `/c/:code`.
3. Abre `/c/:code` en una ventana de incógnito (simulando el celular de un estudiante):
   - Ingresa un documento nuevo (ej. `1116443322`), observa que el botón permanece **bloqueado** hasta aceptar la cláusula de la **Ley 1581 de 2012**, regístrate y recibe confirmación inmediata.
   - Ingresa el mismo documento nuevamente: el sistema muestra únicamente el nombre abreviado (`Laura A.`) y documento enmascarado (`•••3322`) e informa que la asistencia ya fue registrada (**idempotencia**).
4. En el panel del funcionario (`/app/events/:id/attendance`), observa cómo el contador y la tabla se actualizan en tiempo real por **SSE**.

### Escena 3: Emisión de certificados en lote, envío de correo y verificación pública (`/v/:code`)

1. Ve a **Certificados** (`/app/certificates`), selecciona el evento y haz clic en **Emitir certificados en lote**.
2. Descarga el **PDF del certificado** con código QR y huella SHA-256.
3. Haz clic en **Verificar** (`/v/:code`): se muestra la página pública de autenticidad con el nombre del titular, intensidad horaria y huella criptográfica, **sin exponer el número de documento**.
4. Regresa al panel, **revoca** el certificado indicando un motivo y recarga `/v/:code`: el estado cambia de inmediato a **Certificado revocado**.

### Escena 4: Inventario QR, préstamo público con firma digital (`/p/PREST1`) y devolución rápida

1. Ve a **Inventario QR** (`/app/inventory`) para ver los modelos sembrados (`Balón de Futsal FIFA`, `Raqueta de Tenis de Mesa`), crear un lote de unidades (`BAL-003`..`BAL-007`) y descargar la hoja de **Etiquetas QR en PDF**.
2. Abre el formulario público del punto de préstamo en `http://localhost:5173/p/PREST1`:
   - Observa que todo el formulario está **bloqueado** hasta aceptar la autorización de datos personales (Ley 1581).
   - Identifícate, elige un implemento disponible, traza tu **firma manuscrita digital** en el lienzo y confirma el préstamo.
   - Se asigna atómicamente una unidad física (ej. `BAL-001`).
3. En **Préstamos y mora** (`/app/loans`), escribe `BAL-001` en el cuadro de **Devolución rápida por código o QR** y haz clic en **Registrar devolución**: la unidad queda disponible de inmediato.

### Escena 5: Estadísticas con gráficos y reportes descargables (CSV, Excel `.xlsx` y PDF)

1. Ve a **Estadísticas y reportes** (`/app/reports`).
2. Revisa los indicadores consolidados y gráficos comparativos.
3. Descarga el reporte en **Excel (`.xlsx`)**, **CSV** y **PDF** verificando que los documentos salen enmascarados por defecto (`•••1234`).
