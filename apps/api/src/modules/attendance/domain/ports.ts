import type { AttendanceStatus } from '@tap/contracts';
import type { AttendanceRecord } from './entities.ts';

export interface InsertCheckinResult {
  readonly inserted: boolean;
  readonly record: AttendanceRecord;
}

export interface AttendanceRepository {
  /**
   * Ejecuta un único `INSERT ... ON CONFLICT DO NOTHING` sobre `(event_id, session_id, person_id)`
   * donde `status = 'valid'`. Si ya existía, devuelve `{ inserted: false, record: existing }`.
   */
  insertCheckinIfNotExists(record: AttendanceRecord): Promise<InsertCheckinResult>;
  findById(organizationId: string, attendanceId: string): Promise<AttendanceRecord | null>;
  listByEvent(
    organizationId: string,
    eventId: string,
    filters?: {
      sessionId?: string;
      status?: AttendanceStatus;
    },
  ): Promise<AttendanceRecord[]>;
  countValidByEvent(organizationId: string, eventId: string): Promise<number>;
  voidRecord(params: {
    organizationId: string;
    attendanceId: string;
    reason: string;
    voidedAt: Date;
    voidedBy: string;
  }): Promise<AttendanceRecord | null>;
}
