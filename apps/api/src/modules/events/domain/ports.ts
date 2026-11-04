import type { EventStatus } from '@tap/contracts';
import type { EventEntity } from './entities.ts';

export interface EventPosterRenderer {
  generateQrCodes(checkinUrl: string): Promise<{ qrDataUrl: string; qrSvg: string }>;
  renderPosterPdf(params: {
    event: EventEntity;
    organizationName: string;
    siteName: string | null;
    checkinUrl: string;
  }): Promise<Buffer>;
}

export interface EventsRepository {
  findById(organizationId: string, eventId: string): Promise<EventEntity | null>;
  findByPublicCode(publicCode: string): Promise<EventEntity | null>;
  listByOrganization(organizationId: string, status?: EventStatus): Promise<EventEntity[]>;
  findScheduledToOpen(now: Date): Promise<EventEntity[]>;
  findOpenToClose(now: Date): Promise<EventEntity[]>;
  create(event: EventEntity): Promise<void>;
  update(event: EventEntity): Promise<void>;
}
