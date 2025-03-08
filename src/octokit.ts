import {
  fetch as undiciFetch,
  ProxyAgent,
  RequestInfo as undiciRequestInfo,
  RequestInit as undiciRequestInit,
} from 'undici';
import { Octokit, RequestError } from 'octokit';
import { paginateGraphQL } from '@octokit/plugin-paginate-graphql';
import { throttling } from '@octokit/plugin-throttling';
import { Logger, LoggerFn } from './types.js';
import { AuthConfig } from './auth.js';

const OctokitWithPlugins = Octokit.plugin(paginateGraphQL).plugin(throttling);

interface OnRateLimitOptions {
  method: string;
  url: string;
}

export const createOctokit = (
  authConfig: AuthConfig,
  baseUrl: string,
  proxyUrl: string | undefined,
  logger: Logger,
  fetch?: any,
): Octokit => {
  const customFetch = (url: undiciRequestInfo, options: undiciRequestInit) => {
    return undiciFetch(url, {
      ...options,
      dispatcher: proxyUrl ? new ProxyAgent(proxyUrl) : undefined,
    });
  };

  const wrappedWarn: LoggerFn = (message: string, meta: unknown) => {
    if (message.includes('https://gh.io/tag-protection-sunset')) return;
    logger.warn(message, meta);
  };

  const octokit = new OctokitWithPlugins({
    auth: authConfig.auth,
    authStrategy: authConfig.authStrategy,
    baseUrl,
    request: {
      fetch: fetch || customFetch,
      log: { ...logger, warn: wrappedWarn },
    },
    retry: {
      enabled: false,
    },
    throttle: {
      onRateLimit: (retryAfter: any, options: any) => {
        const { method, url } = options as OnRateLimitOptions;

        logger.warn(
          `Primary rate limit exceeded for request \`${method} ${url}\` - retrying after ${retryAfter} seconds`,
        );

        return true;
      },
      onSecondaryRateLimit: (retryAfter: any, options: any) => {
        const { method, url } = options as OnRateLimitOptions;

        logger.warn(
          `Secondary rate limit exceeded for request \`${method} ${url}\` - retrying after ${retryAfter} seconds`,
        );

        return true;
      },
    },
  });

  octokit.hook.after('request', async (response: any, options: any) => {
    logger.debug(`${options.method} ${options.url}: ${response.status}`);
  });

  octokit.hook.error('request', async (error: any, options: any) => {
    if (error instanceof RequestError) {
      logger.debug(
        `${options.method} ${options.url}: ${error.status} - ${error.message}`,
      );
    } else {
      logger.debug(
        `${options.method} ${options.url}: ${error.name} - ${error.message}`,
      );
    }

    throw error;
  });

  return octokit;
};
