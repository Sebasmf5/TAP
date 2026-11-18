import { describe, expect, it } from 'vitest';
import {
  enqueueOfflineAttendance,
  listOfflineAttendance,
  maskIdentifierForQueue,
  syncOfflineAttendanceQueue,
} from '../src/shared/offline/attendance-queue.ts';

describe('Cola offline de asistencia (IndexedDB / respaldo en memoria)', () => {
  it('enmascara identificadores sin guardar datos sensibles completos', () => {
    expect(maskIdentifierForQueue('1116254789')).toBe('•••4789');
    expect(maskIdentifierForQueue('9K4M7P2X8R3T')).toBe('•••8R3T');
  });

  it('encola asistencias sin conexión y sincroniza en FIFO al reconectar, conservando fallos de red', async () => {
    await enqueueOfflineAttendance({
      kind: 'kiosk_scan',
      endpoint: '/events/ev-1/attendance/scan',
      payload: { qrToken: 'TOKEN123456' },
      maskedLabel: 'Carné QR •••3456',
    });
    await enqueueOfflineAttendance({
      kind: 'staff_manual',
      endpoint: '/events/ev-1/attendance',
      payload: { identificationMode: 'document', identifier: '100200300' },
      maskedLabel: 'Manual •••0300',
    });

    const beforeSync = await listOfflineAttendance();
    expect(beforeSync).toHaveLength(2);

    // Primera sincronización: el primero pasa, el segundo reintenta por fallo de red
    let callCount = 0;
    const firstPass = await syncOfflineAttendanceQueue(async () => {
      callCount += 1;
      return callCount === 1 ? { status: 'ok' } : { status: 'retry' };
    });

    expect(firstPass.syncedCount).toBe(1);
    expect(firstPass.failedNetworkCount).toBe(1);
    expect(firstPass.remainingCount).toBe(1);

    // Segunda sincronización: el segundo pasa al volver la red
    const secondPass = await syncOfflineAttendanceQueue(async () => ({ status: 'ok' }));
    expect(secondPass.syncedCount).toBe(1);
    expect(secondPass.remainingCount).toBe(0);
  });
});
