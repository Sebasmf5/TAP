import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  apiRequest,
  getAccessTokenFromMemory,
  setAccessTokenInMemory,
} from '../src/shared/api/http-client.ts';

describe('Almacenamiento del token de acceso en memoria (AGENTS.md A7.1)', () => {
  it('conserva el token exclusivamente en memoria de ejecución sin tocar localStorage ni sessionStorage', () => {
    const fakeStorage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => fakeStorage.get(k) ?? null,
      setItem: (k: string, v: string) => fakeStorage.set(k, v),
    });
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => fakeStorage.get(k) ?? null,
      setItem: (k: string, v: string) => fakeStorage.set(k, v),
    });

    const ephemeralToken = `token_${randomBytes(8).toString('hex')}`;
    setAccessTokenInMemory(ephemeralToken);
    expect(getAccessTokenFromMemory()).toBe(ephemeralToken);
    expect(fakeStorage.size).toBe(0);

    setAccessTokenInMemory(null);
    expect(getAccessTokenFromMemory()).toBeNull();
    vi.unstubAllGlobals();
  });

  it('adjunta Authorization Bearer y reintenta tras refresco silencioso ante un 401', async () => {
    const initialToken = `initial_${randomBytes(6).toString('hex')}`;
    const rotatedToken = `rotated_${randomBytes(6).toString('hex')}`;
    setAccessTokenInMemory(initialToken);

    const seenHeaders: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const auth = headers.get('authorization') ?? '';

      if (url.endsWith('/auth/refresh')) {
        return new Response(
          JSON.stringify({
            accessToken: rotatedToken,
            expiresInSeconds: 900,
            user: {
              id: '018f0000-0000-7000-8000-000000000001',
              organizationId: '018f0000-0000-7000-8000-000000000002',
              email: 'admin@demo.tap',
              fullName: 'Coordinación Bienestar',
              role: 'org_admin',
              status: 'active',
              createdAt: '2026-11-04T15:00:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      seenHeaders.push(auth);
      if (auth === `Bearer ${initialToken}`) {
        return new Response(
          JSON.stringify({
            type: 'https://tap.local/problems/unauthorized',
            title: 'No autorizado',
            status: 401,
            detail: 'Token vencido',
            code: 'UNAUTHORIZED',
          }),
          { status: 401, headers: { 'content-type': 'application/problem+json' } },
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    const result = await apiRequest<{ ok: boolean }>('/organization');
    expect(result).toEqual({ ok: true });
    expect(seenHeaders).toEqual([`Bearer ${initialToken}`, `Bearer ${rotatedToken}`]);
    expect(getAccessTokenFromMemory()).toBe(rotatedToken);

    setAccessTokenInMemory(null);
    vi.unstubAllGlobals();
  });
});
