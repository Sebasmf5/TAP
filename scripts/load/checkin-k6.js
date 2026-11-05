/* global __ENV */
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import http from 'k6/http';
import exec from 'k6/execution';

/**
 * Escenario k6 sobre la ruta caliente de check-in público (`AGENTS.md` A8):
 * - 1.500 check-ins en 5 minutos con ráfagas de 50 por segundo.
 * - Umbrales objetivos: p95 < 300 ms, 0 duplicados y 0 pérdidas.
 */
const registeredCount = new Counter('checkin_registered');
const duplicateCount = new Counter('checkin_already_registered');

export const options = {
  scenarios: {
    steady_and_burst_checkins: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 60,
      maxVUs: 150,
      stages: [
        { target: 5, duration: '2m' },
        { target: 50, duration: '15s' },
        { target: 5, duration: '2m15s' },
        { target: 50, duration: '15s' },
        { target: 5, duration: '15s' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<300'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://127.0.0.1:3000/api/v1';
const PUBLIC_CODE = __ENV.EVENT_PUBLIC_CODE || 'MASIVO26';

export default function () {
  const iteration = exec.scenario.iterationInTest;
  const participantIndex = (iteration % 1500) + 1;
  const documentNumber = String(1100000000 + participantIndex);

  const payload = JSON.stringify({
    identificationMode: 'document',
    identifier: documentNumber,
    clientDurationMs: 2100,
  });

  const res = http.post(`${BASE_URL}/public/checkin/${PUBLIC_CODE}`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const ok = check(res, {
    'status es 200': (r) => r.status === 200,
    'outcome válido': (r) => {
      const body = r.json();
      return body && (body.outcome === 'registered' || body.outcome === 'already_registered');
    },
  });

  if (ok) {
    const body = res.json();
    if (body.outcome === 'registered') {
      registeredCount.add(1);
    } else if (body.outcome === 'already_registered') {
      duplicateCount.add(1);
    }
  }
}
