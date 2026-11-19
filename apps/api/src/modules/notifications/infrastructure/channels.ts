import nodemailer, { type Transporter } from 'nodemailer';
import type { Logger } from 'pino';
import type { NotificationChannel, OutboundNotificationMessage } from '../domain/entities.ts';

export interface SmtpChannelConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
  logger?: Logger;
  fallbackToLogInDev?: boolean;
}

/**
 * Adaptador SMTP con nodemailer para envío real hacia Mailpit en desarrollo o proveedor SMTP en producción.
 */
export class EmailNotificationChannel implements NotificationChannel {
  public readonly channelType = 'email' as const;
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly logger?: Logger;
  private readonly fallbackToLogInDev: boolean;
  private readonly resendApiKey: string | null;

  public constructor(config: SmtpChannelConfig) {
    this.from = config.from;
    this.logger = config.logger;
    this.fallbackToLogInDev = config.fallbackToLogInDev ?? false;
    this.resendApiKey =
      config.host.trim().toLowerCase() === 'smtp.resend.com' &&
      config.password?.trim().startsWith('re_')
        ? config.password.trim()
        : null;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth:
        config.user && config.password
          ? {
              user: config.user,
              pass: config.password,
            }
          : undefined,
      connectionTimeout: 4000,
      greetingTimeout: 4000,
    });
  }

  public async verifyConnection(): Promise<void> {
    if (this.resendApiKey) {
      const response = await fetch('https://api.resend.com/domains', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        return;
      }
      const bodyText = await response.text();
      // Una clave con permiso solo de envío devuelve 401 restricted_api_key en GET /domains
      if (response.status === 401 && bodyText.includes('restricted_api_key')) {
        return;
      }
      throw new Error(`Resend API (${response.status}): ${bodyText}`);
    }

    await this.transporter.verify();
  }

  public async send(message: OutboundNotificationMessage): Promise<void> {
    try {
      if (this.resendApiKey) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          const bodyText = await response.text();
          throw new Error(`Resend API (${response.status}): ${bodyText}`);
        }
        return;
      }

      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } catch (err) {
      if (this.fallbackToLogInDev) {
        this.logger?.warn(
          { err, subject: message.subject },
          'Servidor SMTP no disponible en desarrollo; notificación registrada localmente',
        );
        return;
      }
      throw err;
    }
  }
}

/**
 * Adaptador en memoria y registro estructurado (LogChannel) para entornos sin servidor SMTP externo.
 */
export class LogNotificationChannel implements NotificationChannel {
  public readonly channelType = 'log' as const;
  public readonly sentMessages: OutboundNotificationMessage[] = [];
  private readonly logger?: Logger;

  public constructor(logger?: Logger) {
    this.logger = logger;
  }

  public async verifyConnection(): Promise<void> {
    // Canal en memoria siempre disponible en desarrollo/pruebas
  }

  public async send(message: OutboundNotificationMessage): Promise<void> {
    this.sentMessages.push(message);
    this.logger?.info(
      {
        channel: 'log',
        subject: message.subject,
      },
      'Notificación registrada en canal de desarrollo (LogChannel)',
    );
  }
}
