/**
 * MCP Server Helper - Factory function to create server instances
 */

import { createMCPServer } from './mcp-server.js';

/**
 * Get or create MCP server instance
 */
let serverInstance: ReturnType<typeof createMCPServer> | null = null;

export function getMCPServer(): ReturnType<typeof createMCPServer> {
  if (!serverInstance) {
    serverInstance = createMCPServer();
  }
  return serverInstance;
}

/**
 * Reset server instance (for testing)
 */
export function resetMCPServer(): void {
  serverInstance = null;
}