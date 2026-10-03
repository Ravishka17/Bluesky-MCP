/**
 * Utility Functions for Bluesky MCP Server
 */

import { randomUUID } from 'crypto';

/**
 * Generate a unique request ID for tracking
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Get current ISO timestamp
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Parse languages from string or array
 */
export function parseLanguages(langs: unknown): string[] | undefined {
  if (!langs) return undefined;

  if (Array.isArray(langs)) {
    return langs
      .filter((l): l is string => typeof l === 'string' && l.length > 0)
      .slice(0, 5);
  }

  if (typeof langs === 'string') {
    return langs.split(',').map(l => l.trim()).filter(l => l.length > 0).slice(0, 5);
  }

  return undefined;
}

/**
 * Parse a comma-separated string into an array
 */
export function parseCommaSeparated(input: unknown): string[] | undefined {
  if (!input) return undefined;

  if (Array.isArray(input)) {
    return input.map(String).filter(s => s.length > 0);
  }

  if (typeof input === 'string') {
    return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }

  return undefined;
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Format error message for API response
 */
/** Turn any value (string, array, object) into readable text. */
export function stringifyDetail(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value);
  }
}

/** Build a readable message from a failed HTTP response body (JSON or text). */
export function describeHttpError(status: number, statusText: string, bodyText: string): string {
  const fallback = `${status} ${statusText}`.trim();
  try {
    const parsed = JSON.parse(bodyText) as { error?: unknown; message?: unknown };
    const message = stringifyDetail(parsed.message);
    const name = stringifyDetail(parsed.error);
    if (message && name && message !== name) return `${name}: ${message}`;
    return message || name || fallback;
  } catch {
    return bodyText.trim().slice(0, 300) || fallback;
  }
}

function addHints(message: string): string {
  if (/bad token scope/i.test(message)) {
    return `${message} (this app password lacks the needed permission; create one with "Allow access to your direct messages" enabled, or the endpoint may not be available to app passwords)`;
  }
  return message;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      return 'Unable to connect to Bluesky service';
    }
    if (error.message.includes('429') || error.message.toLowerCase().includes('rate limit')) {
      return 'Rate limit exceeded. Please try again later.';
    }
    return addHints(error.message || error.name);
  }

  if (typeof error === 'string') return addHints(error);

  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    const data = (e.data && typeof e.data === 'object' ? e.data : {}) as Record<string, unknown>;
    for (const c of [e.message, data.message, e.error, data.error]) {
      const text = stringifyDetail(c);
      if (text) return addHints(text);
    }
    const whole = stringifyDetail(error);
    if (whole) return whole;
  }

  return 'An unexpected error occurred';
}

/**
 * Format a Bluesky post for display
 */
export function formatPost(post: {
  author: { handle: string; displayName?: string };
  record: { text: string; createdAt: string };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
}): string {
  const author = post.author.displayName || post.author.handle;
  const text = post.record.text;
  const stats = [];

  if (post.likeCount) stats.push(`${post.likeCount} likes`);
  if (post.repostCount) stats.push(`${post.repostCount} reposts`);
  if (post.replyCount) stats.push(`${post.replyCount} replies`);

  return `@${author}: ${text}${stats.length ? ` (${stats.join(', ')})` : ''}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Check if a value is a valid non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Create a sanitized error response object
 */
export function createErrorResponse(message: string, code = 'ERROR'): Record<string, unknown> {
  return {
    success: false,
    error: {
      code,
      message
    },
    timestamp: getCurrentTimestamp()
  };
}

/**
 * Create a success response object
 */
export function createSuccessResponse<T>(data: T): Record<string, unknown> {
  return {
    success: true,
    data,
    timestamp: getCurrentTimestamp()
  };
}
