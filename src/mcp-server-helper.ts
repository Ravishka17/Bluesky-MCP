import { MCPServer } from './mcp-server';
import type { MCPConfiguration } from './types';

export function loadMCPConfiguration(): MCPConfiguration {
  const bskyIdentifier = process.env.BSKY_IDENTIFIER;
  const bskyPassword = process.env.BSKY_PASSWORD;

  if (!bskyIdentifier || !bskyPassword) {
    throw new Error(
      'Missing Bluesky credentials. Please set BSKY_IDENTIFIER and BSKY_PASSWORD environment variables.'
    );
  }

  return {
    identifier: bskyIdentifier,
    password: bskyPassword,
  };
}
