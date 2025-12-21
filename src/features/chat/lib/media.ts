// src/features/chat/lib/media.ts
// Shared media utilities: type detection, map URLs, reverse geocoding

export type MediaKind = 'image'|'video'|'file'|'link'|'qr';

export function detectType(u: string): MediaKind {
  if (!u) return 'file';
  const src = u.toLowerCase();
  try {
    if (/chart\.googleapis\.com\/chart/.test(src) && /[?&]cht=qr\b/.test(src)) return 'qr';
    try {
      const url = new URL(src);
      const path = decodeURIComponent(String(url.pathname||''));
      if (path.includes('/qr/')) return 'qr';
    } catch {}
  } catch {}
  if (src.startsWith('data:image/')) return 'image';
  if (src.startsWith('blob:')) return 'image';
  if (src.startsWith('file:')) {
    const base = src.split('?')[0];
    if (/(\.jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)$/.test(base)) return 'image';
    if (/(\.mp4|mov|m4v|webm|mkv|avi)$/.test(base)) return 'video';
    return 'file';
  }
  const lower = src.split('?')[0];
  if (/(\.jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)$/.test(lower)) return 'image';
  if (/(\.mp4|mov|m4v|webm|mkv|avi)$/.test(lower)) return 'video';
  if (/(\.pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z|tar|gz|json|xml|psd|ai|svg|apk|ipa)$/.test(lower)) return 'file';
  if (/^https?:/.test(src)) return 'link';
  return 'file';
}

// Google Static Maps (fallback to OSM)
export function buildStaticMapUrl(rawUrl: string): string {
  try {
    const u = new URL(String(rawUrl||''));
    let lat: string | null = null;
    let lng: string | null = null;
    let q: string | null = null;
    try { const m = u.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/i); if (m) { lat = m[1]; lng = m[2]; } } catch {}
    if (!lat || !lng) {
      try { const ll = u.searchParams.get('ll'); if (ll && /-?\d+\.?\d*,-?\d+\.?\d*/.test(ll)) { const [a,b] = ll.split(','); lat=a; lng=b; } } catch {}
    }
    try { q = u.searchParams.get('q'); } catch {}
    const hasLatLng = !!(lat && lng);
    const key = (globalThis as any)?.Constants?.expoConfig?.extra?.GOOGLE_STATIC_MAPS_KEY
      || (process as any)?.env?.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      || (process as any)?.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
      || '';
    const zoom = 16;
    const size = '1280x720';
    if (key) {
      if (hasLatLng) {
        return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(String(lat)+','+String(lng))}&zoom=${zoom}&size=${size}&scale=2&maptype=roadmap&markers=color:red%7C${encodeURIComponent(String(lat)+','+String(lng))}&key=${encodeURIComponent(key)}`;
      }
      const center = q ? q : 'Seoul';
      return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(center||'Seoul')}&zoom=${zoom}&size=${size}&scale=2&maptype=roadmap&markers=color:red%7C${encodeURIComponent(center||'Seoul')}&key=${encodeURIComponent(key)}`;
    }
    const center = hasLatLng ? `${lat},${lng}` : (q || 'Seoul');
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(center||'Seoul')}&zoom=${zoom}&size=1280x720&markers=${encodeURIComponent(center||'Seoul')},red-pushpin`;
  } catch {
    return '';
  }
}

// Google embed URL (with zoom/layers UI)
export function buildMapEmbedUrl(rawUrl: string): string {
  try {
    const u = new URL(String(rawUrl||''));
    let lat: string | undefined; let lng: string | undefined; let q: string | undefined;
    try { const m = u.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/i); if (m) { lat=m[1]; lng=m[2]; } } catch {}
    if (!(lat&&lng)) { try { const ll = u.searchParams.get('ll'); if (ll && /-?\d+\.?\d*,-?\d+\.?\d*/.test(ll)) { const [a,b]=ll.split(','); lat=a; lng=b; } } catch {} }
    if (!(lat&&lng)) { try { const qq = u.searchParams.get('q'); if (qq) { q=qq; if (/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(qq)) { const [a,b]=qq.split(','); lat=a; lng=b; } } } catch {} }
    const zoom = 16;
    const base = 'https://www.google.com/maps';
    if (lat && lng) return `${base}?hl=ko&output=embed&q=${encodeURIComponent(lat+','+lng)}&z=${zoom}`;
    if (q) return `${base}?hl=ko&output=embed&q=${encodeURIComponent(q)}`;
    return `${base}?hl=ko&output=embed&q=${encodeURIComponent(u.toString())}`;
  } catch {
    return `https://www.google.com/maps?hl=ko&output=embed&q=${encodeURIComponent(String(rawUrl||''))}`;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const key = (process as any)?.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
      || (process as any)?.env?.GOOGLE_MAPS_API_KEY
      || (globalThis as any)?.Constants?.expoConfig?.extra?.GOOGLE_MAPS_API_KEY
      || ((globalThis as any)?.Constants as any)?.manifest?.extra?.GOOGLE_MAPS_API_KEY;
    if (key) {
      const url1 = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&language=ko&result_type=street_address&location_type=ROOFTOP|RANGE_INTERPOLATED`;
      const url2 = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&language=ko`;
      const fetchJson = async (u: string) => { const r = await fetch(u); return r.json(); };
      const d1 = await fetchJson(url1);
      const d2 = d1?.results?.length ? null : await fetchJson(url2);
      const results: any[] = d1?.results?.length ? d1.results : (Array.isArray(d2?.results) ? d2.results : []);
      if (results.length) {
        const r = results[0] || {};
        const comps = r.address_components || [];
        const byType = (t: string) => comps.find((c: any) => (c.types || []).includes(t))?.long_name;
        const streetNum = byType('street_number');
        const route = byType('route');
        const building = byType('premise') || byType('subpremise') || byType('establishment') || byType('point_of_interest') || '';
        const sublocal1 = byType('sublocality_level_1') || byType('sublocality') || '';
        const sublocal2 = byType('sublocality_level_2') || '';
        const neighbourhood = byType('neighborhood') || '';
        const admin3 = byType('administrative_area_level_3') || '';
        const admin2 = byType('administrative_area_level_2') || '';
        const city = byType('locality') || '';
        const state = byType('administrative_area_level_1') || '';
        const postal = byType('postal_code') || '';
        const country = byType('country') || '';

        // 우선: 한국 주소 최적화(도로명 우선)
        if (country && /대한민국|Korea/i.test(country)) {
          // 일반적으로 state=서울특별시/경기도, sublocal1=구, sublocal2=동
          const gu = sublocal1 || admin2; // 강남구 등
          const dong = sublocal2 || neighbourhood || admin3;
          const road = route || '';
          const roadLine = `${road}${streetNum ? ' ' + streetNum : ''}`.trim();
          // 형식: 시/도 구 동 도로명 번지 (건물명)
          const region = [state, gu, dong].filter(Boolean).join(' ');
          const head = [region, roadLine].filter(Boolean).join(' ').trim();
          const withBuilding = [head, building].filter(Boolean).join(' ').trim();
          if (withBuilding) return withBuilding;
        }

        // 기타 국가: 기존 로직(도로명, 번지, 건물 + 나머지 파츠)
        const lineRoad = `${route || ''}${streetNum ? ' ' + streetNum : ''}`.trim();
        const head = [building, lineRoad].filter(Boolean).join(', ');
        if (head) {
          const rawParts = [sublocal1, neighbourhood, admin2 || admin3, city, state, postal, country].filter(Boolean);
          const seen: Record<string, boolean> = {};
          const parts = rawParts.filter((p) => { const k = String(p); if (seen[k]) return false; seen[k] = true; return true; });
          return parts.length ? `${head}, ${parts.join(', ')}` : head;
        }
        const addr = r.formatted_address || null;
        if (addr) return addr;
      }
    }
  } catch {}
  // Fallback: OSM Nominatim
  try {
    const osm = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&namedetails=1&lat=${lat}&lon=${lng}&accept-language=ko,en`, {
      headers: { 'User-Agent': 'YoYApp/1.0 (contact: support@example.com)' },
    });
    const j = await osm.json();
    const a = j?.address || {};
    const building2 = j?.namedetails?.name || j?.name || '';
    const line1 = [a.road, a.house_number].filter(Boolean).join(' ').trim();
    const head = [building2, line1].filter(Boolean).join(', ').trim();
    const rawParts = [a.neighbourhood, a.suburb, a.city_district, a.district, a.borough, a.city || a.town || a.village || a.county, a.state || a.region, a.postcode, a.country].filter(Boolean);
    const seen: Record<string, boolean> = {};
    const parts = (rawParts as string[]).filter((p) => { const k = String(p); if (seen[k]) return false; seen[k] = true; return true; });
    if (head) return parts.length ? `${head}, ${parts.join(', ')}` : head;
    return j?.display_name || '';
  } catch { return ''; }
}
