# ADR 0003: Patrones en eventos, check-in idempotente y alto rendimiento en Fases 2 y 3

- **Estado:** Aceptado
- **Fecha:** 2026-11-04

## Contexto

Las Fases 2 y 3 implementan los módulos de participantes (`people`), eventos (`events`) y asistencia rápida (`attendance`) según `AGENTS.md` A3, A6, B3.3 y B3.4. El sistema debe soportar picos masivos de asistencia (2.000 a 2.500 registros con ráfagas concurrentes), garantizar 0 duplicados y 0 pérdidas bajo concurrencia, proteger datos personales en endpoints públicos y aplicar los patrones de diseño sin sobre-ingeniería.

## Decisiones

1. **Patrones en la creación y ciclo de vida de eventos (`events`):**
   - **Factory Method (`EventFactory`):** Centraliza la instanciación según el tipo (`mass`, `course`, `recurring_class`), validando valores por defecto y modos de identificación permitidos.
   - **Builder (`EventBuilder`):** Permite configurar sesiones, reglas de elegibilidad de certificado, ventana de check-in y confirmación de identidad paso a paso, validando invariantes antes de persistir (`build()`).
   - **State Machine:** Modela transiciones formales (`draft → published → open → closed`, y `cancelled` desde cualquier estado previo al cierre), emitiendo eventos de dominio por cada transición.
   - **Prototype (`duplicate()`):** Permite duplicar la configuración íntegra de un evento (sesiones, reglas de certificación) sin arrastrar registros de asistencia.

2. **Estrategias de identificación intercambiables (`IdentificationStrategy`):**
   - Se desacopla la resolución de identidad mediante cuatro estrategias polimórficas: `DocumentIdentificationStrategy`, `InstitutionalCodeIdentificationStrategy`, `PersonQrIdentificationStrategy` (código de carné) y `ManualStaffIdentificationStrategy`. Cada una valida formato, normaliza y localiza a la persona en el directorio institucional.

3. **Garantía estricta de idempotencia en check-in masivo:**
   - Para asegurar cero duplicados ante doble escaneo, conexiones inestables o reintentos de red, se definió un índice único parcial en PostgreSQL:
     ```sql
     CREATE UNIQUE INDEX uq_attendance_event_session_person_valid
       ON attendance.records (event_id, session_id, person_id)
       WHERE status = 'valid';
     ```
   - El repositorio ejecuta `INSERT ... ON CONFLICT (event_id, session_id, person_id) WHERE status = 'valid' DO NOTHING RETURNING *`. Si no retorna filas, significa que ya existía un registro válido, retornando `{ status: 'already_registered' }` con HTTP 200 sin error, sin duplicar ni degradar el rendimiento.

4. **Ruta caliente de check-in de baja latencia (p95 < 300 ms):**
   - En la ruta `/api/v1/attendance/public/checkin` no se generan PDFs ni se envían correos sincrónicos.
   - El contador de asistentes se mantiene en memoria y se reconcilia con la base de datos cada 30 segundos.
   - La difusión en vivo al panel del funcionario se realiza mediante Server-Sent Events (SSE) autenticado con cabecera `Authorization: Bearer` vía streaming fetch.

5. **Protección de datos personales y Ley 1581 de 2012:**
   - La búsqueda previa en endpoint público `/lookup` enmascara el nombre completo (ej: «Juan P.») y nunca expone documento, correo ni teléfono.
   - En registros de primera vez (walk-in), el formulario bloquea la acción de envío hasta la aceptación explícita de la política de tratamiento de datos, registrando versión, fecha, canal e IP hash.
