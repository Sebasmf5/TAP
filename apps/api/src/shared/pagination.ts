import type { PaginationQuery } from '@tap/contracts';

export interface Page<TItem> {
  readonly items: ReadonlyArray<TItem>;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export function toLimitOffset(query: PaginationQuery): { limit: number; offset: number } {
  const page = Math.max(1, query.page);
  const pageSize = Math.min(100, Math.max(1, query.pageSize));
  return {
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}

export function createPage<TItem>(params: {
  items: ReadonlyArray<TItem>;
  total: number;
  query: PaginationQuery;
}): Page<TItem> {
  const pageSize = Math.min(100, Math.max(1, params.query.pageSize));
  const totalPages = Math.max(1, Math.ceil(params.total / pageSize));
  return {
    items: params.items,
    page: Math.max(1, params.query.page),
    pageSize,
    total: params.total,
    totalPages,
  };
}
