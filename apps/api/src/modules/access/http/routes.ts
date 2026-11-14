import '@fastify/cookie';
import {
  AuthTokenResponseSchema,
  ChangePasswordRequestSchema,
  CreateUserRequestSchema,
  GoogleAuthUrlResponseSchema,
  LoginRequestSchema,
  UpdateUserRequestSchema,
  UserProfileSchema,
} from '@tap/contracts';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UnauthorizedError, type TenantContext } from '../../../shared/index.ts';
import type { AccessService } from '../application/use-cases.ts';

export const REFRESH_COOKIE_NAME = 'tap_refresh_token';
export const OAUTH_STATE_COOKIE_NAME = 'tap_oauth_state';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    throw new UnauthorizedError('Cabecera Authorization requerida.');
  }
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  if (!match?.[1]) {
    throw new UnauthorizedError('Formato de Authorization inválido. Usa Bearer <token>.');
  }
  return match[1];
}

export function createAuthenticateRequest(
  service: AccessService,
): (req: FastifyRequest) => Promise<TenantContext> {
  return async (req: FastifyRequest): Promise<TenantContext> => {
    const token = extractBearerToken(req.headers.authorization);
    return service.verifyAccessToken(token);
  };
}

function resolveCookieSameSite(cookieSecure: boolean, appUrl: string): 'strict' | 'none' {
  if (cookieSecure && appUrl.startsWith('https://')) {
    return 'none';
  }
  return 'strict';
}

function setRefreshCookie(
  reply: FastifyReply,
  token: string,
  maxAgeSeconds: number,
  cookieSecure: boolean,
  sameSite: 'strict' | 'none',
): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite,
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeSeconds,
  });
}

function clearRefreshCookie(
  reply: FastifyReply,
  cookieSecure: boolean,
  sameSite: 'strict' | 'none',
): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite,
    path: REFRESH_COOKIE_PATH,
  });
}

export function createAccessRoutes(deps: {
  service: AccessService;
  cookieSecure: boolean;
  appUrl: string;
}): FastifyPluginAsync {
  const authenticate = createAuthenticateRequest(deps.service);
  const cookieSameSite = resolveCookieSameSite(deps.cookieSecure, deps.appUrl);

  return async function accessRoutes(app: FastifyInstance) {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.post(
      '/auth/login',
      {
        schema: {
          tags: ['access'],
          summary:
            'Inicia sesión con correo y contraseña y emite par de tokens (JWT + cookie HttpOnly)',
          body: LoginRequestSchema,
          response: {
            200: AuthTokenResponseSchema,
          },
        },
      },
      async (req, reply) => {
        const userAgentHeader = req.headers['user-agent'];
        const session = await deps.service.loginWithPassword({
          email: req.body.email,
          password: req.body.password,
          ip: req.ip,
          userAgent: typeof userAgentHeader === 'string' ? userAgentHeader : undefined,
        });
        setRefreshCookie(
          reply,
          session.refreshTokenOpaque,
          session.refreshCookieMaxAgeSeconds,
          deps.cookieSecure,
          cookieSameSite,
        );
        return session.response;
      },
    );

    typed.post(
      '/auth/refresh',
      {
        schema: {
          tags: ['access'],
          summary:
            'Rota el token de refresco desde cookie HttpOnly y devuelve un nuevo JWT de acceso',
          response: {
            200: AuthTokenResponseSchema,
          },
        },
      },
      async (req, reply) => {
        const rawCookie = req.cookies?.[REFRESH_COOKIE_NAME];
        const userAgentHeader = req.headers['user-agent'];
        try {
          const session = await deps.service.refreshSession({
            refreshTokenOpaque: rawCookie,
            ip: req.ip,
            userAgent: typeof userAgentHeader === 'string' ? userAgentHeader : undefined,
          });
          setRefreshCookie(
            reply,
            session.refreshTokenOpaque,
            session.refreshCookieMaxAgeSeconds,
            deps.cookieSecure,
            cookieSameSite,
          );
          return session.response;
        } catch (error) {
          clearRefreshCookie(reply, deps.cookieSecure, cookieSameSite);
          throw error;
        }
      },
    );

    typed.post(
      '/auth/logout',
      {
        schema: {
          tags: ['access'],
          summary: 'Revoca la familia del token de refresco y limpia la cookie HttpOnly',
          response: {
            204: z.null(),
          },
        },
      },
      async (req, reply) => {
        const rawCookie = req.cookies?.[REFRESH_COOKIE_NAME];
        await deps.service.logout(rawCookie);
        clearRefreshCookie(reply, deps.cookieSecure, cookieSameSite);
        return reply.status(204).send(null);
      },
    );

    typed.get(
      '/auth/google',
      {
        schema: {
          tags: ['access'],
          summary: 'Obtiene la URL de autorización OIDC con Google',
          response: {
            200: GoogleAuthUrlResponseSchema,
          },
        },
      },
      async (_req, reply) => {
        const { authorizationUrl, state } = deps.service.buildGoogleAuthorizationUrl();
        reply.setCookie(OAUTH_STATE_COOKIE_NAME, state, {
          httpOnly: true,
          secure: deps.cookieSecure,
          sameSite: 'lax',
          path: REFRESH_COOKIE_PATH,
          maxAge: 600,
        });
        return { authorizationUrl };
      },
    );

    typed.get(
      '/auth/google/callback',
      {
        schema: {
          tags: ['access'],
          summary: 'Completa el flujo OIDC de Google en el servidor y emite tokens propios',
          querystring: z.object({
            code: z.string().min(1),
            state: z.string().min(1),
          }),
        },
      },
      async (req, reply) => {
        const expectedState = req.cookies?.[OAUTH_STATE_COOKIE_NAME];
        reply.clearCookie(OAUTH_STATE_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
        if (!expectedState || expectedState !== req.query.state) {
          throw new UnauthorizedError('El estado de validación OAuth no coincide.');
        }

        const userAgentHeader = req.headers['user-agent'];
        const session = await deps.service.completeGoogleCallback({
          code: req.query.code,
          ip: req.ip,
          userAgent: typeof userAgentHeader === 'string' ? userAgentHeader : undefined,
        });

        setRefreshCookie(
          reply,
          session.refreshTokenOpaque,
          session.refreshCookieMaxAgeSeconds,
          deps.cookieSecure,
          cookieSameSite,
        );

        return reply.redirect(`${deps.appUrl}/app`);
      },
    );

    typed.get(
      '/auth/me',
      {
        schema: {
          tags: ['access'],
          summary: 'Obtiene el perfil del funcionario autenticado',
          response: {
            200: UserProfileSchema,
          },
        },
      },
      async (req) => {
        const ctx = await authenticate(req);
        return deps.service.getMe(ctx);
      },
    );

    typed.post(
      '/auth/change-password',
      {
        schema: {
          tags: ['access'],
          summary: 'Actualiza la contraseña del usuario actual y revoca sesiones anteriores',
          body: ChangePasswordRequestSchema,
          response: {
            204: z.null(),
          },
        },
      },
      async (req, reply) => {
        const ctx = await authenticate(req);
        await deps.service.changePassword(ctx, req.body);
        clearRefreshCookie(reply, deps.cookieSecure, cookieSameSite);
        return reply.status(204).send(null);
      },
    );

    typed.get(
      '/users',
      {
        schema: {
          tags: ['access'],
          summary: 'Lista los usuarios de la entidad actual (solo org_admin)',
          response: {
            200: z.array(UserProfileSchema),
          },
        },
      },
      async (req) => {
        const ctx = await authenticate(req);
        return deps.service.listUsers(ctx);
      },
    );

    typed.post(
      '/users',
      {
        schema: {
          tags: ['access'],
          summary: 'Crea un usuario en la entidad actual (solo org_admin)',
          body: CreateUserRequestSchema,
          response: {
            201: UserProfileSchema,
          },
        },
      },
      async (req, reply) => {
        const ctx = await authenticate(req);
        const created = await deps.service.createUser(ctx, req.body);
        return reply.status(201).send(created);
      },
    );

    typed.patch(
      '/users/:id',
      {
        schema: {
          tags: ['access'],
          summary: 'Actualiza el rol, nombre o estado de un usuario de la entidad (solo org_admin)',
          params: z.object({ id: z.string().uuid() }),
          body: UpdateUserRequestSchema,
          response: {
            200: UserProfileSchema,
          },
        },
      },
      async (req) => {
        const ctx = await authenticate(req);
        return deps.service.updateUser(ctx, req.params.id, req.body);
      },
    );

    typed.post(
      '/users/:id/disable',
      {
        schema: {
          tags: ['access'],
          summary: 'Deshabilita un usuario de la entidad e invalida sus sesiones inmediatamente',
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: UserProfileSchema,
          },
        },
      },
      async (req) => {
        const ctx = await authenticate(req);
        return deps.service.disableUser(ctx, req.params.id);
      },
    );
  };
}
