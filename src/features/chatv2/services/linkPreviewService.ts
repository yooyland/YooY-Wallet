/**
 * 링크 전송 시 제목·썸네일 보강 (YouTube / Vimeo oEmbed). 실패해도 URL 전송은 유지.
 */

export type LinkPreviewEnrichment = {
  title?: string;
  description?: string;
  image?: string;
};

export function parseYoutubeVideoId(rawUrl: string): string | null {
  try {
    const u = String(rawUrl || '').trim();
    if (!u) return null;
    const q = /[?&]v=([a-zA-Z0-9_-]{11})/.exec(u);
    if (q?.[1]) return q[1];
    const be = /youtu\.be\/([a-zA-Z0-9_-]{11})/.exec(u);
    if (be?.[1]) return be[1];
    const emb = /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/.exec(u);
    if (emb?.[1]) return emb[1];
    const sh = /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/.exec(u);
    if (sh?.[1]) return sh[1];
    const m = u.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/);
    if (m?.[1]) return m[1];
    return null;
  } catch {
    return null;
  }
}

export function youtubeThumbnailFromVideoId(id: string): string {
  const v = String(id || '').trim();
  return v ? `https://i.ytimg.com/vi/${v}/hqdefault.jpg` : '';
}

async function fetchJsonWithTimeout(url: string, ms: number): Promise<any | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function enrichLinkPreviewForSend(
  url: string,
  existing?: Partial<LinkPreviewEnrichment>
): Promise<LinkPreviewEnrichment> {
  const u = String(url || '').trim();
  if (!u) return { ...existing };
  const out: LinkPreviewEnrichment = {
    title: existing?.title,
    description: existing?.description,
    image: existing?.image,
  };

  try {
    const yid = parseYoutubeVideoId(u);
    if (yid) {
      if (!out.image) out.image = youtubeThumbnailFromVideoId(yid);
      const j = await fetchJsonWithTimeout(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`,
        10000
      );
      if (j && typeof j === 'object') {
        if (typeof j.title === 'string' && j.title.trim()) out.title = j.title.trim();
        if (typeof j.thumbnail_url === 'string' && j.thumbnail_url.trim()) out.image = j.thumbnail_url.trim();
        if (typeof j.author_name === 'string' && j.author_name.trim() && !out.description) {
          out.description = j.author_name.trim();
        }
      }
      return out;
    }

    if (/vimeo\.com\//i.test(u)) {
      const j = await fetchJsonWithTimeout(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`, 10000);
      if (j && typeof j === 'object') {
        if (typeof j.title === 'string' && j.title.trim()) out.title = j.title.trim();
        if (typeof j.thumbnail_url === 'string' && j.thumbnail_url.trim()) out.image = j.thumbnail_url.trim();
        if (typeof j.author_name === 'string' && j.author_name.trim() && !out.description) {
          out.description = j.author_name.trim();
        }
      }
      return out;
    }
  } catch {
    /* noop */
  }

  return out;
}
