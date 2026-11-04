export const BOGOTA_TIMEZONE = 'America/Bogota';

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  private current: Date;

  constructor(initial: Date | string) {
    this.current = typeof initial === 'string' ? new Date(initial) : new Date(initial.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export function formatBogotaDateTime(date: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
