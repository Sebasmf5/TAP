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

  public constructor(config: SmtpChannelConfig) {
    this.from = config.from;
    this.logger = config.logger;
    this.fallbackToLogInDev = config.fallbackToLogInDev ?? false;
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
    await this.transporter.verify();
  }

  public async send(message: OutboundNotificationMessage): Promise<void> {
    try {
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
