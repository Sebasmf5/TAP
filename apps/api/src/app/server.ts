import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import { HealthResponseSchema, ProblemDetailsSchema, ReadyResponseSchema } from '@tap/contracts';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import {
  AppError,
  buildLoggerOptions,
  generateUuidV7,
  ValidationError,
  type FieldValidationIssue,
} from '../shared/index.ts';
import type { AppContainer } from './container.ts';

function hasZodValidationIssues(err: unknown): err is {
  validation: Array<{ instancePath?: string; message?: string }>;
} {
  return (
    typeof err === 'object' &&
    err !== null &&
    'validation' in err &&
    Array.isArray((err as { validation: unknown }).validation)
  );
}

export async function buildServer(container: AppContainer): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerOptions(container.config.LOG_LEVEL),
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      if (typeof incoming === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(incoming)) {
        return incoming;
      }
      return generateUuidV7();
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Propaga el requestId en la respuesta para trazabilidad.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });

  const allowedOrigins = new Set(container.config.CORS_ALLOWED_ORIGINS);
  await app.register(cors, {
    credentials: true,
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.has(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error('Origen CORS no permitido'), false);
    },
  });

  // Documentación OpenAPI disponible en /docs solo en desarrollo (AGENTS.md A5.10).
  if (container.config.NODE_ENV === 'development') {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Tap API',
          description:
            'API REST de Tap para toma de asistencia, certificados, inventario y préstamos.',
          version: '0.1.0',
        },
      },
      transform: jsonSchemaTransform,
    });

    app.get('/docs', async (_req, reply) => {
      return reply.send(app.swagger());
    });
  }

  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.status)
        .type('application/problem+json')
        .send(error.toProblemDetails(request.id));
    }

    if (hasZodValidationIssues(error)) {
      const issues: FieldValidationIssue[] = error.validation.map((item) => ({
        path: item.instancePath?.replace(/^\//, '').replaceAll('/', '.') || 'body',
        message: item.message ?? 'Valor inválido',
      }));
      const validationError = new ValidationError(
        'Revisa los campos del formulario e inténtalo de nuevo.',
        issues,
      );
      return reply
        .status(validationError.status)
        .type('application/problem+json')
        .send(validationError.toProblemDetails(request.id));
    }

    request.log.error({ err: error, requestId: request.id }, 'Error no controlado en la petición');
    return reply.status(500).type('application/problem+json').send({
      type: 'https://tap.local/problems/internal-error',
      title: 'Error interno del servidor',
      status: 500,
      detail: 'Ocurrió un error inesperado al procesar la solicitud.',
      code: 'INTERNAL_ERROR',
      requestId: request.id,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply
      .status(404)
      .type('application/problem+json')
      .send({
        type: 'https://tap.local/problems/not-found',
        title: 'Ruta no encontrada',
        status: 404,
        detail: `No existe la ruta ${request.method} ${request.url}.`,
        code: 'NOT_FOUND',
        requestId: request.id,
      });
  });

  const registerHealthRoutes = async (scope: FastifyInstance) => {
    const typed = scope.withTypeProvider<ZodTypeProvider>();

    typed.get(
      '/health',
      {
        schema: {
          response: {
            200: HealthResponseSchema,
          },
        },
      },
      async () => ({
        status: 'ok' as const,
        service: 'tap-api' as const,
        timestamp: container.clock.now().toISOString(),
      }),
    );

    typed.get(
      '/ready',
      {
        schema: {
          response: {
            200: ReadyResponseSchema,
            503: ReadyResponseSchema,
            500: ProblemDetailsSchema,
          },
        },
      },
      async (_req, reply) => {
        const dbUp = await container.database.ping();
        const queueUp = container.jobQueue.isReady();
        const ready = dbUp && queueUp;

        return reply.status(ready ? 200 : 503).send({
          status: ready ? ('ready' as const) : ('not_ready' as const),
          checks: {
            database: dbUp ? ('up' as const) : ('down' as const),
            jobQueue: queueUp ? ('up' as const) : ('down' as const),
          },
          timestamp: container.clock.now().toISOString(),
        });
      },
    );
  };

  await registerHealthRoutes(app);
  await app.register(registerHealthRoutes, { prefix: '/api/v1' });

  return app;
}
