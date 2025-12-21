// @ts-nocheck
import express from 'express';
import cors from 'cors';
import pino from 'pino';
import metascraper from 'metascraper';
import msTitle from 'metascraper-title';
import msDescription from 'metascraper-description';
import msImage from 'metascraper-image';
import msAuthor from 'metascraper-author';
import got from 'got';
// server-side fallback
import { getLinkPreview } from 'link-preview-js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
app.use(cors());
app.use(express.json());

// in-memory cache (simple)
const cache: Record<string, { at: number; data: any }> = {};
const TTL_MS = 24 * 60 * 60 * 1000;

const scraper = metascraper([msTitle(), msDescription(), msImage(), msAuthor()]);

async function fetchHtmlSafe(targetUrl: string): Promise<string> {
  try {
    const res = await got(targetUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 YoYBot/1.0', 'accept-language': 'ko,en' },
      throwHttpErrors: false,
    });
    if ((res as any).statusCode && (res as any).statusCode >= 400) return '';
    return res.body as unknown as string;
  } catch {
    return '';
  }
}

function youtubeFallback(urlStr: string) {
  try {
    const u = new URL(urlStr);
    const host = u.host.replace(/^www\./, '');
    if (!/(^|\.)youtube\.com$/.test(host) && !/^youtu\.be$/.test(host)) return null;
    let id: string | null = null;
    if (host === 'youtu.be') id = (u.pathname || '').slice(1) || null;
    if (!id && /youtube\.com$/.test(host)) {
      const p = u.pathname || '';
      if (p.startsWith('/shorts/')) id = p.split('/')[2] || null;
      if (!id && p.startsWith('/watch')) id = u.searchParams.get('v');
    }
    if (!id) return { siteName: 'youtube.com' } as any;
    return {
      title: 'YouTube',
      image: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      siteName: 'youtube.com',
    } as any;
  } catch {
    return null;
  }
}

app.post('/api/link-preview', async (req, res) => {
  try {
    const url = String(req.body?.url || req.query?.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Invalid url' });
    }
    const key = url.toLowerCase();
    const now = Date.now();
    const c = cache[key];
    if (c && now - c.at < TTL_MS) return res.json({ cached: true, ...c.data });

    const html = await fetchHtmlSafe(url);
    const meta = html ? await scraper({ html, url }) : ({} as any);
    const host = new URL(url).host;
    let data: any = {
      url,
      title: meta.title || undefined,
      description: meta.description || undefined,
      image: meta.image || undefined,
      siteName: host,
    };

    // Fallback: link-preview-js (보강)
    const isBadImage = (s?: string) => {
      if (!s) return true;
      const u = String(s);
      return /favicon|\/logo|sprite|brand|badge|placeholder|\.ico($|\?)/i.test(u) || /\.svg($|\?)/i.test(u);
    };
    if (!data.title || (!data.image || isBadImage(data.image))) {
      try {
        const lp: any = await getLinkPreview(url, { followRedirects: 'follow' } as any);
        if (lp) {
          const img0 = (Array.isArray(lp.images) && lp.images[0]) || (lp.favicons && lp.favicons[0]);
          data = {
            url,
            title: data.title || lp.title || host,
            description: data.description || lp.description || undefined,
            image: !isBadImage(img0) ? (img0 || data.image) : (isBadImage(data.image) ? undefined : data.image),
            siteName: data.siteName || lp.siteName || host,
          };
        }
      } catch {}
      // YouTube 전용 보강(쇼츠 포함)
      try {
        const yt = youtubeFallback(url);
        if (yt) {
          data = {
            url,
            title: data.title || yt.title || host,
            description: data.description,
            image: data.image || yt.image,
            siteName: data.siteName || yt.siteName || host,
          };
        }
      } catch {}
    }

    // 최종 보정: 타이틀 없으면 host
    if (!data.title) data.title = host;
    // 마지막 보정: 이미지가 여전히 나쁠 경우 제거하여 텍스트 카드로 노출
    if (isBadImage(data.image)) delete data.image;
    cache[key] = { at: now, data };
    res.json(data);
  } catch (e: any) {
    logger.warn({ err: e?.message }, 'preview-error');
    try {
      const host = new URL(String(req.body?.url || req.query?.url || '')).host;
      return res.json({ url: req.body?.url || req.query?.url, title: host, siteName: host });
    } catch {
      res.status(200).json({ url: req.body?.url || req.query?.url, title: 'link', siteName: 'link' });
    }
  }
});

// GET variant for easier manual testing in browsers (same logic as POST)
app.get('/api/link-preview', async (req, res) => {
  try {
    const url = String(req.query?.url || req.body?.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Invalid url' });
    }
    const key = url.toLowerCase();
    const now = Date.now();
    const c = cache[key];
    if (c && now - c.at < TTL_MS) return res.json({ cached: true, ...c.data });

    const html = await fetchHtmlSafe(url);
    const meta = html ? await scraper({ html, url }) : ({} as any);
    const host = new URL(url).host;
    let data: any = {
      url,
      title: meta.title || undefined,
      description: meta.description || undefined,
      image: meta.image || undefined,
      siteName: host,
    };

    const isBadImage = (s?: string) => {
      if (!s) return true;
      const u = String(s);
      return /favicon|\/logo|sprite|brand|badge|placeholder|\.ico($|\?)/i.test(u) || /\.svg($|\?)/i.test(u);
    };
    if (!data.title || (!data.image || isBadImage(data.image))) {
      try {
        const lp: any = await getLinkPreview(url, { followRedirects: 'follow' } as any);
        if (lp) {
          const img0 = (Array.isArray(lp.images) && lp.images[0]) || (lp.favicons && lp.favicons[0]);
          data = {
            url,
            title: data.title || lp.title || host,
            description: data.description || lp.description || undefined,
            image: !isBadImage(img0) ? (img0 || data.image) : (isBadImage(data.image) ? undefined : data.image),
            siteName: data.siteName || lp.siteName || host,
          };
        }
      } catch {}
      try {
        const yt = youtubeFallback(url);
        if (yt) {
          data = {
            url,
            title: data.title || yt.title || host,
            description: data.description,
            image: data.image || yt.image,
            siteName: data.siteName || yt.siteName || host,
          };
        }
      } catch {}
    }

    if (!data.title) data.title = host;
    if (isBadImage(data.image)) delete data.image;
    cache[key] = { at: now, data };
    res.json(data);
  } catch (e: any) {
    logger.warn({ err: e?.message }, 'preview-error');
    try {
      const host = new URL(String(req.query?.url || req.body?.url || '')).host;
      return res.json({ url: req.query?.url || req.body?.url, title: host, siteName: host });
    } catch {
      res.status(200).json({ url: req.query?.url || req.body?.url, title: 'link', siteName: 'link' });
    }
  }
});

// Lightweight PDF proxy to bypass X-Frame-Options and strict CORS on third-party hosts
// - Supports range requests so pdf.js can stream efficiently
app.get('/api/pdf-proxy', async (req, res) => {
  try {
    const target = String(req.query?.url || '').trim();
    if (!target || !/^https?:\/\//i.test(target)) {
      return res.status(400).json({ error: 'Invalid url' });
    }

    const headers: Record<string, string> = {};
    const range = req.headers['range'];
    if (typeof range === 'string') headers['Range'] = range;
    if (typeof req.headers['user-agent'] === 'string') headers['User-Agent'] = req.headers['user-agent'] as string;

    const upstream = got.stream(target, { http2: false, headers, throwHttpErrors: false });

    upstream.on('response', (uRes: any) => {
      try {
        const status = uRes.statusCode || 200;
        // Pass-through important headers for pdf.js range loading
        const pass = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'last-modified', 'etag', 'cache-control'];
        for (const k of pass) {
          const v = uRes.headers[k];
          if (v) res.setHeader(k, v as any);
        }
        // Force sensible defaults
        if (!uRes.headers['content-type']) res.setHeader('content-type', 'application/pdf');
        res.setHeader('access-control-allow-origin', '*');
        res.setHeader('access-control-expose-headers', 'accept-ranges, content-range, content-length, content-type');
        res.status(status);
        upstream.pipe(res);
      } catch (e) {
        res.status(500).end();
      }
    });

    upstream.on('error', () => {
      if (!res.headersSent) res.status(502).end();
      try { upstream.destroy(); } catch {}
    });

    req.on('aborted', () => {
      try { upstream.destroy(); } catch {}
    });
  } catch {
    res.status(500).end();
  }
});

// Optional: image proxy (very simple)
app.get('/api/img', async (req, res) => {
  const src = String(req.query.src || '');
  if (!/^https?:\/\//i.test(src)) return res.status(400).end();
  try {
    const stream = got.stream(src, { headers: { 'user-agent': 'Mozilla/5.0 YoYBot/1.0', 'accept-language': 'ko,en' } });
    stream.on('response', (r: any) => {
      res.setHeader('content-type', r.headers['content-type'] || 'image/jpeg');
      res.setHeader('cache-control', 'public, max-age=86400');
    });
    stream.pipe(res);
  } catch {
    res.status(500).end();
  }
});

// Generic file proxy (PDF 등 iframe 차단/코르스 회피용)
app.get('/api/file', async (req, res) => {
  const src = String(req.query.src || '');
  if (!/^https?:\/\//i.test(src)) return res.status(400).end();
  try {
    const stream = got.stream(src, { headers: { 'user-agent': 'Mozilla/5.0 YoYBot/1.0', 'accept-language': 'ko,en' } });
    stream.on('response', (r: any) => {
      const ct = r.headers['content-type'] || 'application/octet-stream';
      res.setHeader('content-type', ct);
      res.setHeader('cache-control', 'public, max-age=86400');
      // remove anti-embed headers
      res.removeHeader('x-frame-options');
      res.removeHeader('content-security-policy');
    });
    stream.pipe(res);
  } catch {
    res.status(500).end();
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => logger.info({ port: PORT }, 'link-preview server running'));


