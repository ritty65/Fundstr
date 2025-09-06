export default { fetch: handle };

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // WS bridge: browser -> (your domain) -> relay
  if (url.pathname === '/ws' && req.headers.get('Upgrade') === 'websocket') {
    const target = url.searchParams.get('target');
    if (!target || !target.startsWith('wss://')) {
      return new Response('bad target', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    server.accept();

    // Dial upstream relay and accept
    const upstreamResp = await fetch(target, {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade' }
    });
    const upstream = (upstreamResp as any).webSocket as WebSocket;
    if (!upstream) return new Response('upstream failed', { status: 502 });
    upstream.accept();

    // Pipe frames both ways
    server.addEventListener('message', (e: MessageEvent) => upstream.send(e.data));
    upstream.addEventListener('message', (e: MessageEvent) => server.send(e.data));
    server.addEventListener('close', () => upstream.close());
    upstream.addEventListener('close', () => server.close());

    // **Return 101 with the client end**
    return new Response(null, { status: 101, webSocket: client });
  }

  if (url.pathname === '/http') {
    const target = url.searchParams.get('target');
    if (!target || !/^https:\/\/[^?]+$/.test(target)) return new Response('bad target', { status: 400 });

    const resp = await fetch(target, { headers: { Accept: 'application/nostr+json' }});
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: {
        'Content-Type': resp.headers.get('Content-Type') ?? 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS'
      }
    });
  }

  // Health check / default
  return new Response('ok');
}
