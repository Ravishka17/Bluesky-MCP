/**
 * Health Check Endpoint
 */

import type { NextResponse } from 'next/server';
import { BlueskyClient } from '../../src/bluesky-client.js';

export const runtime = 'edge';

export async function GET(): Promise<NextResponse> {
  const client = new BlueskyClient();

  try {
    // Test connectivity
    const connectivity = await client.testConnectivity();

    // Get authentication status (won't throw if not authenticated)
    const sessionInfo = client.getSessionInfo();

    const health = {
      status: connectivity.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'bluesky-mcp',
      bluesky: {
        connected: connectivity.connected,
        error: connectivity.error,
        authenticated: sessionInfo.authenticated,
        handle: sessionInfo.handle
      }
    };

    return NextResponse.json(health, {
      status: connectivity.connected ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        service: 'bluesky-mcp',
        error: 'Service unavailable'
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  }
}