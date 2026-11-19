import type {
  NotificationChannelType,
  NotificationStatus,
  NotificationTemplateKey,
} from '@tap/contracts';

export interface NotificationRecord {
  id: string;
  organizationId: string;
  channel: NotificationChannelType;
  template: NotificationTemplateKey;
  recipient: string;
  subject: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  deduplicationKey: string;
  sentAt: Date | null;
  createdAt: Date;
}

export interface NotificationTemplateRecord {
  id: string;
  organizationId: string;
  templateKey: NotificationTemplateKey;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
  updatedAt: Date;
}

export interface OutboundNotificationMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  metadata?: Record<string, unknown>;
}

/**
 * Patrón Strategy + Adapter para canales de notificación (`AGENTS.md` A6, B1.9).
 */
export interface NotificationChannel {
  readonly channelType: NotificationChannelType;
  send(message: OutboundNotificationMessage): Promise<void>;
  verifyConnection?(): Promise<void>;
}

export interface DefaultTemplateDefinition {
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
}

export const DEFAULT_NOTIFICATION_TEMPLATES: Record<
  NotificationTemplateKey,
  DefaultTemplateDefinition
> = {
  certificate_issued: {
    subjectTemplate: 'Tu certificado de participación: {{event_name}} — {{organization_name}}',
    htmlTemplate: `<!DOCTYPE html>
<html lang="es-CO">
  <body style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; color: #061b31; background: #f8fafd; padding: 24px;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5edf5; border-radius: 4px; padding: 28px;">
      <p style="font-size: 12px; color: #64748d; margin: 0 0 8px 0;">{{organization_name}}</p>
      <h1 style="font-size: 20px; font-weight: 500; margin: 0 0 16px 0; color: #061b31;">Certificado emitido</h1>
      <p style="font-size: 14px; line-height: 1.5; color: #273951;">Hola <strong>{{holder_name}}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.5; color: #273951;">
        Tu certificado de participación en <strong>{{event_name}}</strong> ({{hours}} horas) ha sido emitido.
      </p>
      <p style="font-size: 13px; color: #273951;">
        Código público de verificación: <code style="font-family: monospace; background: #f8fafd; padding: 2px 6px; border: 1px solid #e5edf5;">{{certificate_code}}</code>
      </p>
      <p style="margin: 24px 0;">
        <a href="{{verification_url}}" style="display: inline-block; background: #533afd; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 4px; font-size: 14px; font-weight: 500;">
          Verificar certificado en línea
        </a>
      </p>
      <p style="font-size: 12px; color: #64748d; margin-top: 24px;">
        Este mensaje fue generado automáticamente por Tap para {{organization_name}}.
      </p>
    </div>
  </body>
</html>`,
    textTemplate:
      '{{organization_name}} — Hola {{holder_name}}, tu certificado de participación en "{{event_name}}" ({{hours}} horas) ha sido emitido. Código de verificación: {{certificate_code}}. Verifícalo en: {{verification_url}}',
  },
  loan_delivered: {
    subjectTemplate: 'Comprobante de préstamo de implementos — {{organization_name}}',
    htmlTemplate: `<p>Hola <strong>{{holder_name}}</strong>, se registró la entrega de tu préstamo en <strong>{{organization_name}}</strong>. Fecha límite de devolución: {{due_at}}.</p>`,
    textTemplate:
      'Hola {{holder_name}}, se registró la entrega de tu préstamo en {{organization_name}}. Fecha límite de devolución: {{due_at}}.',
  },
  loan_overdue: {
    subjectTemplate: 'Recordatorio: préstamo pendiente de devolución — {{organization_name}}',
    htmlTemplate: `<p>Hola <strong>{{holder_name}}</strong>, tienes un préstamo vencido en <strong>{{organization_name}}</strong> ({{item_summary}}). Por favor acércate al punto de préstamo para realizar la devolución.</p>`,
    textTemplate:
      'Hola {{holder_name}}, tienes un préstamo vencido en {{organization_name}} ({{item_summary}}). Por favor acércate al punto de préstamo para realizar la devolución.',
  },
  loan_returned: {
    subjectTemplate: 'Paz y salvo de devolución de implementos — {{organization_name}}',
    htmlTemplate: `<p>Hola <strong>{{holder_name}}</strong>, confirmamos la devolución de los implementos prestados en <strong>{{organization_name}}</strong>. ¡Gracias!</p>`,
    textTemplate:
      'Hola {{holder_name}}, confirmamos la devolución de los implementos prestados en {{organization_name}}. ¡Gracias!',
  },
  marketing_campaign: {
    subjectTemplate: '{{campaign_subject}}',
    htmlTemplate: `<!doctype html>
<html lang="es-CO">
  <body style="font-family: Inter, -apple-system, sans-serif; color: #273951; background: #ffffff; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e5edf5; border-radius: 6px; padding: 24px;">
      <p style="font-size: 12px; color: #64748d; margin: 0 0 8px;">{{organization_name}}</p>
      <h1 style="font-size: 20px; font-weight: 500; color: #061b31; margin: 0 0 12px;">{{campaign_subject}}</h1>
      <p style="font-size: 14px; line-height: 1.6; white-space: pre-line;">Hola {{holder_name}},

{{campaign_message}}</p>
      <p style="margin-top: 18px; font-size: 13px;">{{cta_block}}</p>
      <hr style="border: none; border-top: 1px solid #e5edf5; margin: 24px 0 12px;" />
      <p style="font-size: 11px; color: #64748d; margin: 0;">
        Recibes este mensaje porque autorizaste recibir comunicaciones comerciales de {{organization_name}} (Ley 1581 de 2012 y Ley 2300 de 2023). Si no deseas recibir más publicidad, puedes
        <a href="{{unsubscribe_url}}" style="color: #533afd;">darte de baja aquí en 1 clic</a>.
      </p>
    </div>
  </body>
</html>`,
    textTemplate:
      '{{organization_name}} — Hola {{holder_name}}, {{campaign_message}} {{cta_url}} — Para dejar de recibir publicidad (Ley 2300 de 2023), abre: {{unsubscribe_url}}',
  },
  test_email: {
    subjectTemplate: 'Prueba de entrega de correo — {{organization_name}} (Tap)',
    htmlTemplate: `<!doctype html>
<html lang="es-CO">
  <body style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; color: #061b31; background: #f8fafd; padding: 24px;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5edf5; border-radius: 6px; padding: 28px;">
      <p style="font-size: 12px; color: #64748d; margin: 0 0 8px 0;">{{organization_name}} · Tap</p>
      <h1 style="font-size: 20px; font-weight: 500; margin: 0 0 14px 0; color: #061b31;">Comprobación de envío exitosa</h1>
      <p style="font-size: 14px; line-height: 1.5; color: #273951;">
        Este es un correo de prueba generado desde el panel de notificaciones de <strong>Tap</strong> para verificar la conexión SMTP y la entregabilidad.
      </p>
      <p style="font-size: 13px; color: #64748d; margin-top: 16px;">
        Fecha y hora (Bogotá): <strong>{{checked_at}}</strong>
      </p>
    </div>
  </body>
</html>`,
    textTemplate:
      '{{organization_name}} — Comprobación de envío exitosa en Tap. Fecha y hora (Bogotá): {{checked_at}}.',
  },
  event_preregistration: {
    subjectTemplate: 'Preregistro confirmado: {{event_name}} — {{organization_name}}',
    htmlTemplate: `<!doctype html>
<html lang="es-CO">
  <body style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; color: #061b31; background: #f8fafd; padding: 24px;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5edf5; border-radius: 6px; padding: 28px;">
      <p style="font-size: 12px; color: #64748d; margin: 0 0 8px 0;">{{organization_name}}</p>
      <h1 style="font-size: 20px; font-weight: 500; margin: 0 0 14px 0; color: #061b31;">Preregistro confirmado</h1>
      <p style="font-size: 14px; line-height: 1.5; color: #273951;">Hola <strong>{{holder_name}}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.5; color: #273951;">
        Tu preregistro para <strong>{{event_name}}</strong> quedó confirmado.
      </p>
      <div style="background: #f8fafd; border: 1px solid #e5edf5; border-radius: 4px; padding: 14px; margin: 18px 0;">
        <p style="font-size: 13px; color: #273951; margin: 0 0 6px 0;"><strong>Fecha:</strong> {{event_date}}</p>
        <p style="font-size: 13px; color: #273951; margin: 0 0 6px 0;"><strong>Lugar:</strong> {{event_location}}</p>
        <p style="font-size: 13px; color: #273951; margin: 0;"><strong>Código personal de ingreso:</strong> <code style="font-family: monospace; background: #ffffff; padding: 2px 6px; border: 1px solid #e5edf5;">{{qr_token}}</code></p>
      </div>
      <p style="margin: 20px 0;">
        <a href="{{checkin_url}}" style="display: inline-block; background: #533afd; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 4px; font-size: 14px; font-weight: 500;">
          Ir al enlace de check-in del evento
        </a>
      </p>
      <p style="font-size: 12px; color: #64748d; margin-top: 20px;">
        Presenta tu documento o código personal al llegar al evento. Mensaje automático de Tap para {{organization_name}}.
      </p>
    </div>
  </body>
</html>`,
    textTemplate:
      '{{organization_name}} — Hola {{holder_name}}, tu preregistro para "{{event_name}}" ({{event_date}}, {{event_location}}) está confirmado. Código personal de ingreso: {{qr_token}}. Enlace de check-in: {{checkin_url}}',
  },
};

/**
 * Valida la franja horaria permitida en Colombia por la Ley 2300 de 2023 (Art. 3):
 * lunes a viernes de 7:00 a. m. a 7:00 p. m., sábados de 8:00 a. m. a 3:00 p. m.
 * Prohibido los domingos.
 */
export function isWithinLaw2300Schedule(date: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const hour = Number.parseInt(hourStr, 10) % 24;

  if (weekday === 'Sun') return false;
  if (weekday === 'Sat') return hour >= 8 && hour < 15;
  return hour >= 7 && hour < 19;
}

export function interpolateNotificationTemplate(
  raw: string,
  variables: Record<string, unknown>,
): string {
  return raw.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const val = variables[key];
    if (val === undefined || val === null) {
      return '';
    }
    return String(val);
  });
}
