/**
 * Security Utilities for Bluesky MCP Server
 * Input sanitization, validation, and security helpers
 */

import { z } from 'zod';

// Maximum lengths
export const MAX_TEXT_LENGTH = 300;
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 20;
export const MAX_URI_LENGTH = 2048;
export const MAX_DID_LENGTH = 100;

// Sanitization patterns - remove potentially dangerous characters
const DANGEROUS_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const EXCESSIVE_WHITESPACE = /\s{3,}/g;
const CONTROL_CHARS = /[\u200B-\u200F\uFEFF]/g;

/**
 * Sanitize a string input by removing dangerous characters
 */
export function sanitizeString(input: string, maxLength?: number): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .replace(DANGEROUS_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(EXCESSIVE_WHITESPACE, ' ')
    .trim()
    .slice(0, maxLength ?? MAX_TEXT_LENGTH * 2); // Allow some buffer for processing
}

/**
 * Sanitize a URI/URL input
 */
export function sanitizeUri(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Check for valid AT Protocol URI format
  const trimmed = input.trim().slice(0, MAX_URI_LENGTH);

  // Only allow at:// URIs
  if (!trimmed.startsWith('at://')) {
    return '';
  }

  return trimmed;
}

/**
 * Sanitize a DID identifier
 */
export function sanitizeDid(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  const trimmed = input.trim().slice(0, MAX_DID_LENGTH);

  // DID format: did:plc:xxx or did:web:xxx
  if (!/^did:[a-z]+:[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return '';
  }

  return trimmed;
}

/**
 * Sanitize a handle/identifier
 */
export function sanitizeHandle(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .toLowerCase()
    .slice(0, 100)
    .replace(/[^a-z0-9@._-]/g, '');
}

/**
 * Sanitize a numeric limit parameter
 */
export function sanitizeLimit(input: unknown, defaultValue = DEFAULT_LIMIT): number {
  const num = Number(input);

  if (isNaN(num) || num < 1) {
    return defaultValue;
  }

  return Math.min(Math.floor(num), MAX_LIMIT);
}

/**
 * Sanitize cursor for pagination
 */
export function sanitizeCursor(input: unknown): string | undefined {
  if (typeof input !== 'string' || !input.trim()) {
    return undefined;
  }

  // Cursors are base64-like encoded strings
  return input.trim().slice(0, 500);
}

/**
 * Validate a post text
 */
export function validatePostText(text: unknown): { valid: boolean; text?: string; error?: string } {
  if (typeof text !== 'string') {
    return { valid: false, error: 'Post text must be a string' };
  }

  const sanitized = sanitizeString(text);

  if (sanitized.length === 0) {
    return { valid: false, error: 'Post text cannot be empty' };
  }

  if (sanitized.length > MAX_TEXT_LENGTH) {
    return { valid: false, error: `Post text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` };
  }

  return { valid: true, text: sanitized };
}

/**
 * Validate an AT Protocol URI
 */
export function validateAtUri(uri: unknown): { valid: boolean; uri?: string; error?: string } {
  if (typeof uri !== 'string') {
    return { valid: false, error: 'URI must be a string' };
  }

  const sanitized = sanitizeUri(uri);

  if (!sanitized) {
    return { valid: false, error: 'Invalid AT Protocol URI format' };
  }

  // Parse URI to validate structure
  const match = sanitized.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return { valid: false, error: 'Malformed AT Protocol URI' };
  }

  return { valid: true, uri: sanitized };
}

/**
 * Extract the rkey (record key) from an AT Protocol URI
 */
export function extractRkeyFromUri(uri: string): string | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return match[3] || null;
}

/**
 * Validate a record key (rkey)
 */
export function validateRkey(rkey: unknown): { valid: boolean; rkey?: string; error?: string } {
  if (typeof rkey !== 'string') {
    return { valid: false, error: 'Rkey must be a string' };
  }

  const trimmed = rkey.trim();
  if (!trimmed) {
    return { valid: false, error: 'Rkey cannot be empty' };
  }

  return { valid: true, rkey: trimmed };
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(input: string): string {
  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  return input.replace(/[&<>"']/g, char => htmlEscapeMap[char]);
}

// Zod Schemas for validation
export const CreatePostSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
  langs: z.array(z.string().max(10)).max(5).optional(),
  reply: z.object({
    rootUri: z.string(),
    rootCid: z.string(),
    parentUri: z.string(),
    parentCid: z.string()
  }).optional()
});

export const GetTimelineSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional()
});

export const GetAuthorFeedSchema = z.object({
  actor: z.string().min(1),
  filter: z.enum(['posts_with_replies', 'posts_no_replies', 'posts_with_media', 'posts_and_author_threads']).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional()
});

export const GetThreadSchema = z.object({
  uri: z.string(),
  depth: z.number().int().min(0).max(1000).optional(),
  parentHeight: z.number().int().min(0).max(1000).optional()
});

export const GetProfileSchema = z.object({
  actor: z.string().min(1)
});

export const SearchActorsSchema = z.object({
  term: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional()
});

export const SearchPostsSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  cursor: z.string().optional(),
  sort: z.enum(['latest', 'top']).optional(),
  mentions: z.string().optional(),
  author: z.string().optional(),
  lang: z.string().optional()
});

export const GetFeedSchema = z.object({
  feed: z.string(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional()
});

export const DeletePostSchema = z.object({
  uri: z.string().optional(),
  rkey: z.string().optional()
});

export const DraftSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
  langs: z.array(z.string().max(10)).max(5).optional()
});

export const DeleteDraftSchema = z.object({
  id: z.string().min(1)
});

export const GetDraftsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional()
});

export const SearchAccountsSchema = z.object({
  email: z.string().email().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional()
});

/**
 * Security headers to apply to all responses
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen'
} as const;