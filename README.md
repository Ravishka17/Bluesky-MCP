# Bluesky MCP Server

A Model Context Protocol (MCP) server that provides comprehensive Bluesky/AT Protocol access for AI assistants. Built in TypeScript, deployed on Vercel, and fully compatible with the **MCP Streamable HTTP transport** (protocol version `2025-03-26`).

## Features

- **Post Operations** - Create posts, get posts, view likes and reposts
- **Feed Management** - Timeline, custom feeds, author feeds
- **Search Engine** - Search posts and users/actors for AI agents
- **Profile Access** - View profiles, follower counts, bios
- **Thread Viewing** - Explore post threads and conversations
- **Secure Credential Management** - Credentials injected externally via headers (not stored)
- **Streamable HTTP** - Full MCP transport support (POST + GET SSE + DELETE)
- **Security Hardened** - Input sanitization, tiered rate limiting, security headers
- **Vercel Ready** - Stateless serverless deployment, zero cold-start friction

---

## Quick Start

### 1. Deploy to Vercel

```bash
git clone https://github.com/Ravishka17/Bluesky-MCP.git
cd Bluesky-MCP
vercel
```

Or use the **Deploy with Vercel** button above.

### 2. Connect to Your AI Client

The server implements **MCP Streamable HTTP transport** (`2025-03-26`).

**MCP endpoint:** `https://your-app.vercel.app/mcp`

#### Claude Desktop

```json
{
  "mcpServers": {
    "bluesky": {
      "type": "http",
      "url": "https://your-app.vercel.app/mcp"
    }
  }
}
```

#### Claude Code / CLI

```bash
claude mcp add bluesky --transport http https://your-app.vercel.app/mcp
```

#### Any MCP Client (Generic)

Configure the client with transport type `streamable-http` and the endpoint URL above.

### 3. Authentication (External Credential Injection)

**Security Note:** Bluesky credentials are **NEVER stored** in Vercel environment variables or committed to version control.

For write operations (posting, timeline access), provide credentials via request headers:

| Header | Description |
|--------|-------------|
| `X-BLUESKY-IDENTIFIER` | Your Bluesky handle or email |
| `X-BLUESKY-PASSWORD` | Your app-specific password |

**Example:**

```bash
curl -X POST https://your-app.vercel.app/api/post \
  -H "Content-Type: application/json" \
  -H "X-BLUESKY-IDENTIFIER: your-handle.bsky.social" \
  -H "X-BLUESKY-PASSWORD: your-app-password" \
  -d '{"text": "Hello from Bluesky MCP!"}'
```

**Creating an App Password:**
1. Log in to Bluesky
2. Go to Settings > App Passwords
3. Create a new app password
4. Use it as the `X-BLUESKY-PASSWORD` header value

### 4. Verify Deployment

```bash
# Health check
curl https://your-app.vercel.app/health

# Test MCP initialize
curl -X POST https://your-app.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

---

## MCP Tools

### Post Operations

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `create_post` | Create a new post on Bluesky | Yes |
| `get_posts` | Get specific posts by URI | No |
| `get_likes` | Get users who liked a post | No |
| `get_reposted_by` | Get users who reposted a post | No |

### Feed Operations

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `get_timeline` | Get authenticated user's home timeline | Yes |
| `get_feed` | Get posts from a feed generator | No |
| `get_author_feed` | Get posts by a specific user | No |

### Search Operations (AI Search Engine)

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `search_posts` | Search posts by keyword | No |
| `search_actors` | Search for users/actors | No |
| `search_actors_typeahead` | Quick autocomplete suggestions | No |

### Profile Operations

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `get_profile` | Get user profile information | No |
| `get_profiles` | Get multiple profiles (batch) | No |
| `get_suggestions` | Get suggested users to follow | Yes |

### Thread Operations

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `get_thread` | Get post thread with replies | No |

### Utility

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `test_connectivity` | Test Bluesky connection | No |

---

## MCP Prompts

Three prompt templates are available:

| Prompt | Description |
|--------|-------------|
| `bluesky_usage_guide` | Comprehensive guide for Bluesky tasks |
| `search_posts_template` | Template for searching posts |
| `compose_post` | Template for composing posts |

---

## REST API Endpoints

For non-MCP usage, REST endpoints are available:

```
GET  /health                           # Health check
GET  /api/connectivity                 # Test connection
GET  /api/profile/:actor               # Get profile
GET  /api/timeline                     # Get timeline (auth required)
POST /api/post                          # Create post (auth required)
GET  /api/post/search?q=...            # Search posts
GET  /api/search/actors?q=...         # Search actors
GET  /api/search/posts?q=...          # Search posts
GET  /api/search/typeahead?q=...      # Actor typeahead
GET  /api/thread/:encoded-uri         # Get thread
GET  /api/feed?feed=...               # Get feed
GET  /api/feed?author=...             # Get author feed
GET  /api/actor/:actor?view=profile   # Get profile
GET  /api/actor/:actor?view=feed      # Get author feed
```

---

## Security Features

1. **External Credential Injection** - Credentials are never stored in environment variables or committed to git
2. **Input Sanitization** - All inputs are validated and sanitized
3. **Rate Limiting** - Tiered rate limits for read/write operations
4. **Security Headers** - X-Frame-Options, X-Content-Type-Options, etc.
5. **No Server Identification** - Server header removed
6. **Request Validation** - Content-Type validation, payload size limits

---

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run shell script tests
./test_mcp_endpoint.sh
```

**Note:** For local development, you can set environment variables:
```bash
export BLUESKY_IDENTIFIER="your-handle.bsky.social"
export BLUESKY_APP_PASSWORD="your-app-password"
```

---

## Architecture

```
Bluesky-MCP/
├── api/                    # Vercel API routes
│   ├── mcp.ts              # MCP Streamable HTTP transport
│   ├── health.ts           # Health check
│   ├── connectivity.ts     # Connection test
│   ├── profile/[actor].ts  # Profile endpoint
│   ├── timeline/index.ts   # Timeline endpoint
│   ├── post/index.ts       # Post creation/search
│   ├── search/[type].ts    # Search endpoints
│   ├── thread/[uri].ts     # Thread endpoint
│   ├── feed/index.ts       # Feed endpoint
│   └── actor/[actor].ts    # Actor endpoint
├── src/                    # Source code
│   ├── server.ts           # Express server (for local dev)
│   ├── mcp-server.ts       # MCP server implementation
│   ├── bluesky-client.ts   # Bluesky API client
│   ├── handlers.ts         # Tool handlers
│   ├── toolDefinitions.ts   # Tool schemas
│   ├── sanitize.ts         # Input sanitization
│   ├── middleware.ts       # Security middleware
│   ├── types.ts           # TypeScript types
│   └── utils.ts           # Utilities
├── test_mcp.js            # Test client
├── test_mcp_endpoint.sh   # Shell test script
└── vercel.json            # Vercel configuration
```

---

## License

MIT