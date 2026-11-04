import { describe, expect, it } from 'vitest';
import {
  HealthResponseSchema,
  PaginationQuerySchema,
  ProblemDetailsSchema,
  StaffRoleSchema,
} from '../src/index.ts';

describe('@tap/contracts', () => {
  it('valida los roles permitidos del personal', () => {
    expect(StaffRoleSchema.parse('org_admin')).toBe('org_admin');
    expect(() => StaffRoleSchema.parse('guest')).toThrow();
  });

  it('aplica valores por defecto en paginación y rechaza tamaños fuera de rango', () => {
    expect(PaginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(() => PaginationQuerySchema.parse({ page: 0 })).toThrow();
    expect(() => PaginationQuerySchema.parse({ pageSize: 500 })).toThrow();
  });

  it('valida esquemas de salud y RFC 9457 Problem Details', () => {
    const health = HealthResponseSchema.parse({
      status: 'ok',
      service: 'tap-api',
      timestamp: new Date().toISOString(),
    });
    expect(health.status).toBe('ok');

    const problem = ProblemDetailsSchema.parse({
      type: 'https://tap.local/problems/not-found',
      title: 'Recurso no encontrado',
      status: 404,
      detail: 'El evento solicitado no existe.',
      code: 'NOT_FOUND',
    });
    expect(problem.status).toBe(404);
  });
});
