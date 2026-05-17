import { NextRequest } from "next/server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getMCPServer } from "../../../src/mcp-server.js";

const server = getMCPServer();

async function handleRequest(req: NextRequest) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdFactory: undefined,
    onSessionExistsAnimation: "none",
  });

  await server.connect(transport);

  return transport.handleRequest(req as Request);
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

export async function DELETE(request: NextRequest) {
  return handleRequest(request);
}