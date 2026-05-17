import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'Bluesky MCP Server',
    timestamp: new Date().toISOString()
  });
}
