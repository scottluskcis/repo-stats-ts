import { components } from '@octokit/openapi-types/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoggerFn = (message: string, meta?: any) => unknown;
export interface Logger {
  debug: LoggerFn;
  info: LoggerFn;
  warn: LoggerFn;
  error: LoggerFn;
}

export type RepositoryType = components['schemas']['repository'];

export type RepositoryCsvRow = {
  name: string;
  full_name: string;
  created_at: string;
  archived: boolean;
};
