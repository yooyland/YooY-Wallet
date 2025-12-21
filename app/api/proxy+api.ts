// Simple server-side proxy to bypass CORS for allowed upstreams
// Supports: GET /api/proxy?url=<encoded>

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const target = String(searchParams.get('url') || '');
    if (!target) {
      return json({ error: 'Missing url' }, 400);
    }

    // Allowlist to prevent open proxy abuse
    const allowedHosts = [
      'api.binance.com',
      'api.upbit.com',
      'api.exchangerate-api.com',
      'api.qrserver.com'
    ];

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return json({ error: 'Invalid url' }, 400);
    }

    if (!allowedHosts.includes(parsed.host)) {
      return json({ error: 'Host not allowed' }, 403);
    }

    const upstream = await fetch(parsed.toString(), {
      method: 'GET',
      headers: {
        'Accept': '*/*',
        'User-Agent': 'YooyLandApp/1.0'
      }
    });

    const ct = upstream.headers.get('content-type') || '';
    // If image or binary, stream bytes back
    if (ct.startsWith('image/')) {
      const buf = await upstream.arrayBuffer();
      return new Response(buf, {
        status: upstream.status,
        headers: corsHeaders({ 'Content-Type': ct })
      });
    } else {
      const text = await upstream.text();
      // Try JSON first; if fails, return as text
      try {
        const data = JSON.parse(text);
        return new Response(JSON.stringify(data), {
          status: upstream.status,
          headers: corsHeaders({ 'Content-Type': 'application/json' })
        });
      } catch {
        return new Response(text, {
          status: upstream.status,
          headers: corsHeaders({ 'Content-Type': ct || 'text/plain; charset=utf-8' })
        });
      }
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'proxy failed' }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }
}

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Vary': 'Origin',
    ...extra
  } as Record<string, string>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders({ 'Content-Type': 'application/json' })
  });
}

































