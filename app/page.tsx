export default function Home() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      background: '#0a0a0a',
      color: '#fff'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Bluesky MCP Server</h1>
      <p style={{ color: '#888' }}>Model Context Protocol server for Bluesky</p>
      <div style={{ marginTop: '2rem', padding: '1rem', background: '#1a1a1a', borderRadius: '8px' }}>
        <code style={{ color: '#4ade80' }}>
          POST /mcp - Send JSON-RPC requests
        </code>
      </div>
    </div>
  );
}