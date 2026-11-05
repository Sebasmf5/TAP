# Módulo `attendance` (Toma de Asistencia Rápida, Idempotencia y Vistas Públicas)

## 1. Responsabilidad

Gestiona el registro masivo y rápido de asistencia para eventos institucionales, tanto en autoservicio por parte de los asistentes escaneando el código QR del evento (`/c/:code`), como asistido por funcionarios o mediante escaneo de carné. Garantiza idempotencia estricta ante doble escaneo, minimiza la latencia en la ruta caliente, protege la privacidad de los datos personales (Ley 1581) y publica vistas de solo lectura como contrato para reportes.

## 2. Modelo de datos (`attendance.*`)

Esquema propio de PostgreSQL: `attendance`.

- `attendance.records`:
  - `id` (UUID v7, PK).
  - `organization_id` (UUID, indexado — aislamiento multi-tenant obligatorio).
  - `event_id` (UUID, indexado).
  - `session_id` (UUID, indexado).
  - `person_id` (UUID, indexado).
  - `method` (`enum`: `self_qr`, `scanner_card`, `manual`, `kiosk`).
  - `status` (`enum`: `valid`, `revoked`).
  - `verified_at` (`timestamptz`).
  - `verified_by_user_id` (UUID nullable, operador que verificó en modo staff/manual).
  - `ip_hash` (`varchar` nullable).
  - `user_agent` (`text` nullable).
  - `revoked_at`, `revoked_by_user_id`, `revocation_reason` (para anulaciones auditadas).
  - `created_at` (`timestamptz`).
  - **Índice único parcial de idempotencia:**
    ```sql
    CREATE UNIQUE INDEX uq_attendance_event_session_person_valid
      ON attendance.records (event_id, session_id, person_id)
      WHERE status = 'valid';
    ```

### Vistas de contrato de lectura para reportes (`v_pub_*`)

1. `attendance.v_pub_attendance_records`:
   Expone los registros de asistencia válidos con `organization_id`, `event_id`, `session_id`, `person_id`, `method` y `verified_at`.
2. `attendance.v_pub_attendance_daily_summary`:
   Agrupa la cantidad total de asistencias válidas diarias por entidad, fecha y método de registro.

## 3. Patrones de diseño aplicados (`AGENTS.md` A6)

1. **Strategy (`IdentificationStrategy`):**
   - Resuelve la persona a partir de los diferentes mecanismos de ingreso mediante variantes polimórficas intercambiables:
     - `DocumentIdentificationStrategy`: normaliza documento de identidad y busca por documento en la entidad.
     - `InstitutionalCodeIdentificationStrategy`: busca por código estudiantil/docente.
     - `PersonQrIdentificationStrategy`: valida la firma/código de carné universitario (`QR_PERSONA`) para check-in instantáneo.
     - `ManualStaffIdentificationStrategy`: permite a funcionarios registrar a una persona por id con verificación visual.
2. **Observer / Bus de eventos:**
   - Emite el evento de dominio `attendance.registered` tras persistir el registro con éxito para actualizar estadísticas y notificar suscriptores.

## 4. Estrategia de alto rendimiento e idempotencia (AGENTS.md A8)

- **Cero trabajo bloqueante en ruta caliente:** El endpoint público `/api/v1/attendance/public/checkin` no genera PDFs ni envía correos electrónicos en línea. Los correos y certificados se delegan como trabajos asíncronos en colas (`pg-boss`).
- **Idempotencia nativa:**
  La persistencia en PostgreSQL utiliza:
  ```sql
  INSERT INTO attendance.records (...) VALUES (...)
  ON CONFLICT (event_id, session_id, person_id) WHERE status = 'valid'
  DO NOTHING
  RETURNING *;
  ```
  Si no se devuelven filas, el servicio retorna `{ status: 'already_registered' }` con HTTP 200, protegiendo la integridad sin lanzar excepciones costosas.
- **Contador en memoria reconciliado:** El número de asistentes del evento se incrementa atómicamente en memoria y se reconcilia con la base de datos de manera periódica.
- **Límites de tasa generosos:** Umbral de rate limiting generoso por IP + evento para no penalizar redes universitarias detrás de NAT/proxy con miles de estudiantes concurrentes.
- **Flujo en vivo SSE:** El panel del funcionario consume `/api/v1/attendance/events/:id/live` con `fetch` y `ReadableStream` transmitiendo eventos en tiempo real sin polling.

## 5. Resultados de pruebas de carga (k6 / Node load runner)

- **Condiciones de prueba:** 1.800 solicitudes totales con ráfagas concurrentes de 50 peticiones simultáneas sobre el endpoint público de check-in.
- **Resultados medidos:**
  - Solicitudes completadas: 1.800 (1.500 registros nuevos + 300 reintentos de doble escaneo).
  - Duplicados registrados en base de datos: 0.
  - Pérdidas o errores HTTP 5xx: 0.
  - Latencia mediana (p50): **4.01 ms**.
  - Latencia percentil 95 (p95): **8.81 ms** (muy por debajo del límite exigido de 300 ms).
