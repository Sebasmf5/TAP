import type { AuthTokenResponse, ProblemDetails } from '@tap/contracts';

const API_BASE_URL = (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? '/api/v1';

/**
 * El token de acceso JWT vive únicamente en memoria de ejecución del cliente (AGENTS.md A7.1).
 * Jamás se guarda en localStorage ni sessionStorage.
 */
let memoryAccessToken: string | null = null;
let inflightRefreshPromise: Promise<AuthTokenResponse | null> | null = null;

export function getAccessTokenFromMemory(): string | null {
  return memoryAccessToken;
}

export function setAccessTokenInMemory(token: string | null): void {
  memoryAccessToken = token;
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly detail: string;
  public readonly fieldErrors: ReadonlyArray<{ path: string; message: string }>;

  constructor(problem: Partial<ProblemDetails> & { status: number; detail: string }) {
    super(problem.detail);
    this.name = 'ApiClientError';
    this.status = problem.status;
    this.code = problem.code ?? 'API_ERROR';
    this.detail = problem.detail;
    this.fieldErrors = problem.errors ?? [];
  }
}

export async function refreshAccessTokenSilently(): Promise<AuthTokenResponse | null> {
  if (inflightRefreshPromise) {
    return inflightRefreshPromise;
  }

  inflightRefreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setAccessTokenInMemory(null);
        return null;
      }
      const data = (await res.json()) as AuthTokenResponse;
      setAccessTokenInMemory(data.accessToken);
      return data;
    } catch {
      setAccessTokenInMemory(null);
      return null;
    } finally {
      inflightRefreshPromise = null;
    }
  })();

  return inflightRefreshPromise;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  readonly body?: unknown;
  readonly skipAuthRefresh?: boolean;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;

  const execute = async (token: string | null): Promise<Response> => {
    const headers = new Headers(options.headers);
    if (options.body !== undefined) {
      headers.set('content-type', 'application/json');
    }
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }

    return fetch(url, {
      ...options,
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let response = await execute(memoryAccessToken);

  const isAuthEndpoint = normalizedPath.startsWith('/auth/');
  if (response.status === 401 && !isAuthEndpoint && !options.skipAuthRefresh) {
    const refreshed = await refreshAccessTokenSilently();
    if (refreshed) {
      response = await execute(refreshed.accessToken);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson =
    contentType.includes('application/json') || contentType.includes('application/problem+json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const problem = (payload ?? {}) as Partial<ProblemDetails>;
    throw new ApiClientError({
      status: response.status,
      code: problem.code ?? 'HTTP_ERROR',
      detail:
        problem.detail ??
        'No fue posible completar la operación. Inténtalo de nuevo en unos segundos.',
      errors: problem.errors,
    });
  }

  return payload as T;
}

/**
 * Descarga un archivo binario (PDF, CSV, XLSX) autenticándose con cabecera Authorization Bearer
 * sin exponer jamás el JWT en la URL (AGENTS.md A7.1).
 */
export async function apiDownloadFile(path: string, fallbackFilename: string): Promise<void> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;

  const execute = async (token: string | null): Promise<Response> => {
    const headers = new Headers();
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include',
    });
  };

  let response = await execute(memoryAccessToken);
  if (response.status === 401) {
    const refreshed = await refreshAccessTokenSilently();
    if (refreshed) {
      response = await execute(refreshed.accessToken);
    }
  }

  if (!response.ok) {
    throw new ApiClientError({
      status: response.status,
      code: 'DOWNLOAD_ERROR',
      detail: 'No fue posible descargar el archivo solicitado.',
    });
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fallbackFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Conecta a un flujo continuo Server-Sent Events (SSE) usando `fetch` con streaming y
 * cabecera `Authorization: Bearer` (sin usar EventSource ni poner jamás el JWT en la URL, AGENTS.md A7.1).
 */
export function subscribeServerSentEvents<T>(params: {
  path: string;
  onMessage: (data: T) => void;
  onError?: (err: unknown) => void;
}): () => void {
  const abortController = new AbortController();
  const normalizedPath = params.path.startsWith('/') ? params.path : `/${params.path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;

  void (async () => {
    try {
      const execute = async (token: string | null) => {
        const headers = new Headers({
          Accept: 'text/event-stream',
        });
        if (token) {
          headers.set('authorization', `Bearer ${token}`);
        }
        return fetch(url, {
          method: 'GET',
          headers,
          credentials: 'include',
          signal: abortController.signal,
        });
      };

      let response = await execute(memoryAccessToken);
      if (response.status === 401) {
        const refreshed = await refreshAccessTokenSilently();
        if (refreshed) {
          response = await execute(refreshed.accessToken);
        }
      }

      if (!response.ok || !response.body) {
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!abortController.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const rawJson = line.slice(5).trim();
              if (rawJson) {
                try {
                  params.onMessage(JSON.parse(rawJson) as T);
                } catch {
                  // Ignorar fragmento malformado
                }
              }
            }
          }
        }
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        params.onError?.(err);
      }
    }
  })();

  return () => {
    abortController.abort();
  };
}
