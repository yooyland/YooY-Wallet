/**
 * 역지오코딩: 도로명 주소 우선 (예: 서울 강남구 테헤란로 323)
 * 우선순위: (1) Google Geocoding(route+번지 조합 또는 formatted) — API 키 있을 때
 * (2) expo street 조합이 도로명(로/길/대로) 포함·충분할 때 (3) expo 불완전·Google 실패 시 폴백 (4) region 요약 (5) 좌표
 */

import Constants from 'expo-constants';

/** Maps/Geocoding 공통 키: env → app.config extra (EAS/네이티브 빌드에서 process.env 미인라인 대비) */
export function resolveGoogleMapsApiKey(): string {
  const a = String((process as any)?.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
  if (a) return a;
  const b = String((process as any)?.env?.GOOGLE_MAPS_API_KEY || '').trim();
  if (b) return b;
  try {
    const extra =
      ((Constants as any)?.expoConfig?.extra as Record<string, string | undefined>) ||
      ((Constants as any)?.manifest2?.extra as any)?.expoClient?.extra ||
      ((Constants as any)?.manifest?.extra as Record<string, string | undefined>) ||
      {};
    const c = String(extra.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || extra.GOOGLE_MAPS_API_KEY || '').trim();
    if (c) return c;
  } catch {}
  return '';
}

function getGoogleGeocodingApiKey(): string {
  return resolveGoogleMapsApiKey();
}

/** 정적 지도 PNG (키 없으면 null — 호출측에서 OSM WebView 등 사용) */
export function buildGoogleStaticMapImageUrlForPreview(
  lat: number,
  lng: number,
  widthPx: number,
  heightPx: number,
): string | null {
  const key = resolveGoogleMapsApiKey();
  if (!key) return null;
  const sw = Math.min(640, Math.max(1, Math.floor(widthPx)));
  const sh = Math.min(640, Math.max(1, Math.floor(heightPx)));
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=${sw}x${sh}&scale=2&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(key)}`;
}

/** WebView에 직접 로드 가능한 OSM 임베드 페이지 (외부 정적 타일 CDN 실패 시 대안) */
export function buildOpenStreetMapEmbedPageUrl(lat: number, lng: number, spanDeg = 0.01): string {
  const d = spanDeg;
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** 정적 지도 PNG (OSM) — Web에서 WebView 폴백 대신 사용 */
export function buildOpenStreetMapStaticMapImageUrlForPreview(
  lat: number,
  lng: number,
  widthPx: number,
  heightPx: number,
  zoom = 16,
): string {
  const sw = Math.min(1024, Math.max(1, Math.floor(widthPx)));
  const sh = Math.min(1024, Math.max(1, Math.floor(heightPx)));
  const center = `${lat},${lng}`;
  // https://staticmap.openstreetmap.de/ 사용 (키 불필요, 단 외부 서비스 의존)
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(center)}&zoom=${encodeURIComponent(
    String(zoom)
  )}&size=${encodeURIComponent(`${sw}x${sh}`)}&markers=${encodeURIComponent(`${center},red-pushpin`)}`;
}

export type ReverseGeocodeFullV2 = {
  /** UI 우선 표시: 예) 강남구 테헤란로 323 */
  roadAddress: string;
  /** 짧은 요약: 예) 강남구 */
  shortAddress: string;
  /** Google 등에서 온 전체 문자열 */
  formattedAddress?: string;
  mapUrl: string;
};

function buildMapUrl(lat: number, lng: number) {
  return `https://maps.google.com/?q=${encodeURIComponent(String(lat) + ',' + String(lng))}`;
}

/** Google formatted / 조합 문자열을 카드용으로 정리 (도로명은 유지) */
function normalizeKoreanFormattedForDisplay(formatted: string): string {
  let t = String(formatted || '').trim();
  t = t.replace(/^대한민국\s+/, '');
  t = t.replace(/^서울특별시\s*/i, '서울 ');
  t = t.replace(/^부산광역시\s*/i, '부산 ');
  t = t.replace(/^대구광역시\s*/i, '대구 ');
  t = t.replace(/^인천광역시\s*/i, '인천 ');
  t = t.replace(/^광주광역시\s*/i, '광주 ');
  t = t.replace(/^대전광역시\s*/i, '대전 ');
  t = t.replace(/^울산광역시\s*/i, '울산 ');
  t = t.replace(/^세종특별자치시\s*/i, '세종 ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function shortFromRoadOrFormatted(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  const parts = t.split(/[,\s]+/).filter(Boolean);
  if (parts.length >= 2 && /구$/.test(parts[0])) return parts[0];
  const gu = t.match(/([가-힣]+(?:구|군))/);
  return gu ? gu[1] : t.slice(0, 24);
}

/**
 * 도로명(로/길/대로/번길/거리)이 없는 한국식 주소는 불완전으로 본다.
 * 예: "서울 강남구 323", "대한민국 서울 강남구 323" — 기존 정규식은 '서울 … 구 숫자'를 놓침.
 */
function isIncompleteRoadAddressKorea(roadAddress: string): boolean {
  const t = roadAddress
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^대한민국\s+/, '');
  if (!t) return true;
  if (/(로|길|대로|번길|거리)/.test(t)) return false;
  // 한글이 있는데 도로명 토큰이 없으면 행정구역+번지만 있는 경우가 많음
  if (/[가-힣]/.test(t)) return true;
  return false;
}

/**
 * expo-location 한 건 → street(도로명) 우선, name은 도로명 패턴일 때만 번지와 조합
 */
function buildFromExpoStreetFirst(a: Record<string, unknown>): { road: string; shortAddr: string } | null {
  if (!a) return null;
  const gu = String(a.subregion || a.district || a.city || '').trim();
  const street = String(a.street || '').trim();
  const name = String(a.name || '').trim();
  const num = String(a.streetNumber || '').trim();

  const nameLooksLikeRoad = name && /(로|길|대로|번길|거리)/.test(name);

  let roadLine = '';
  if (street) {
    roadLine = [street, num].filter(Boolean).join(' ').trim();
  } else if (nameLooksLikeRoad) {
    roadLine = [name, num].filter(Boolean).join(' ').trim();
  } else if (name && num) {
    roadLine = `${name} ${num}`.trim();
  } else {
    roadLine = name || num;
  }

  if (!roadLine) return null;

  const roadAddress = [gu, roadLine].filter(Boolean).join(' ').trim();
  const shortAddress = gu || roadAddress;
  if (!roadAddress) return null;
  return { road: roadAddress, shortAddr: shortAddress };
}

/** Google address_components 로 도로명 + 번지 조합 (한국에서 테헤란로 323 등) */
function buildRoadFromGoogleComponents(result: any): string | null {
  const comps = Array.isArray(result?.address_components) ? result.address_components : [];
  const pick = (...types: string[]) => {
    for (const typ of types) {
      const c = comps.find((x: any) => Array.isArray(x?.types) && x.types.includes(typ));
      if (c?.long_name) return String(c.long_name).trim();
    }
    return '';
  };
  const route = pick('route');
  const streetNum = pick('street_number');
  if (!route) return null;
  const roadLine = [route, streetNum].filter(Boolean).join(' ').trim();
  const admin1 = pick('administrative_area_level_1');
  const admin2 = pick('administrative_area_level_2', 'sublocality_level_1');
  const locality = pick('locality', 'sublocality', 'sublocality_level_2');
  const leftParts = [admin1, admin2, locality].filter(Boolean);
  let left = leftParts.join(' ').replace(/\s+/g, ' ').trim();
  left = left
    .replace(/서울특별시/gi, '서울')
    .replace(/부산광역시/gi, '부산')
    .replace(/대구광역시/gi, '대구')
    .replace(/인천광역시/gi, '인천')
    .replace(/광주광역시/gi, '광주')
    .replace(/대전광역시/gi, '대전')
    .replace(/울산광역시/gi, '울산')
    .replace(/세종특별자치시/gi, '세종')
    .trim();
  const full = [left, roadLine].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return full || null;
}

/** route 번지가 들어 있는 결과 우선 */
function pickGoogleResultPreferringRoute(results: any[]): any {
  for (const x of results) {
    if (buildRoadFromGoogleComponents(x)) return x;
  }
  return (
    results.find((x: any) => Array.isArray(x?.types) && x.types.includes('street_address')) ||
    results.find((x: any) => Array.isArray(x?.types) && x.types.includes('premise')) ||
    results[0]
  );
}

async function tryGoogleReverseFull(latN: number, lngN: number, mapUrl: string): Promise<ReverseGeocodeFullV2 | null> {
  const key = getGoogleGeocodingApiKey();
  if (!key) return null;

  const u = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latN},${lngN}&key=${encodeURIComponent(
    key
  )}&language=ko`;
  const r = await fetch(u);
  const j = await r.json();
  const results = Array.isArray(j?.results) ? j.results : [];
  if (!results.length) return null;

  const streetPref = pickGoogleResultPreferringRoute(results);
  const formattedRaw = String(streetPref?.formatted_address || '').trim();
  const fromComp = buildRoadFromGoogleComponents(streetPref);
  const normFormatted = formattedRaw ? normalizeKoreanFormattedForDisplay(formattedRaw) : '';

  let roadAddress = '';
  if (fromComp && /(로|길|대로|번길|거리)/.test(fromComp)) {
    roadAddress = normalizeKoreanFormattedForDisplay(fromComp);
  } else if (normFormatted && /(로|길|대로|번길|거리)/.test(normFormatted)) {
    roadAddress = normFormatted;
  } else if (fromComp) {
    roadAddress = normalizeKoreanFormattedForDisplay(fromComp);
  } else {
    roadAddress = normFormatted;
  }

  if (!roadAddress) return null;

  const shortAddress = shortFromRoadOrFormatted(roadAddress);
  return {
    roadAddress,
    shortAddress,
    formattedAddress: formattedRaw || roadAddress,
    mapUrl,
  };
}

async function tryOsmReverseFull(latN: number, lngN: number, mapUrl: string): Promise<ReverseGeocodeFullV2 | null> {
  try {
    // Nominatim reverse (키 불필요). Web에서도 동작.
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&namedetails=1&lat=${encodeURIComponent(
      String(latN)
    )}&lon=${encodeURIComponent(String(lngN))}&accept-language=ko,en`;
    const r = await fetch(u, {
      headers: {
        Accept: 'application/json',
        // 일부 환경에서 UA가 없으면 차단될 수 있어 간단히 명시
        'User-Agent': 'yooyland-app',
      } as any,
    });
    if (!r.ok) return null;
    const j: any = await r.json().catch(() => ({}));
    const dispRaw = String(j?.display_name || '').trim();
    const addr = j?.address && typeof j.address === 'object' ? j.address : {};
    const road = String(addr.road || addr.pedestrian || addr.path || '').trim();
    const house = String(addr.house_number || '').trim();
    const suburb = String(addr.suburb || addr.neighbourhood || '').trim();
    const city = String(addr.city || addr.town || addr.village || '').trim();
    const county = String(addr.county || '').trim(); // 한국: 구/군
    const state = String(addr.state || '').trim(); // 시/도

    const left =
      [state, city, county, suburb]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    const roadLine = [road, house].filter(Boolean).join(' ').trim();
    let roadAddress = [left, roadLine].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    roadAddress = normalizeKoreanFormattedForDisplay(roadAddress);

    const formatted = dispRaw ? normalizeKoreanFormattedForDisplay(dispRaw) : '';
    const primary = roadAddress || formatted;
    if (!primary) return null;
    const shortAddress = shortFromRoadOrFormatted(primary);
    return {
      roadAddress: primary,
      shortAddress,
      formattedAddress: formatted || primary,
      mapUrl,
    };
  } catch {
    return null;
  }
}

export async function reverseGeocodeFullV2(lat: number, lng: number): Promise<ReverseGeocodeFullV2> {
  const mapUrl = buildMapUrl(lat, lng);
  const latN = Number(lat);
  const lngN = Number(lng);

  let expoBuilt: ReverseGeocodeFullV2 | null = null;
  let expoRegionOnly: ReverseGeocodeFullV2 | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Location = require('expo-location');
    const rows = await Location.reverseGeocodeAsync({ latitude: latN, longitude: lngN });
    if (Array.isArray(rows) && rows[0]) {
      const built = buildFromExpoStreetFirst(rows[0] as any);
      if (built?.road) {
        expoBuilt = {
          roadAddress: built.road,
          shortAddress: built.shortAddr,
          formattedAddress: built.road,
          mapUrl,
        };
      } else {
        const a = rows[0] as any;
        const region = String(a.region || '').trim();
        const city = String(a.city || '').trim();
        const district = String(a.district || a.subregion || '').trim();
        const fallback = [region, city, district].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        if (fallback) {
          expoRegionOnly = {
            roadAddress: fallback,
            shortAddress: district || fallback,
            formattedAddress: fallback,
            mapUrl,
          };
        }
      }
    }
  } catch {
    /* noop */
  }

  let googleFull: ReverseGeocodeFullV2 | null = null;
  try {
    googleFull = await tryGoogleReverseFull(latN, lngN, mapUrl);
  } catch {
    /* noop */
  }

  let osmFull: ReverseGeocodeFullV2 | null = null;
  try {
    osmFull = await tryOsmReverseFull(latN, lngN, mapUrl);
  } catch {
    /* noop */
  }

  // (1) Google — API 키가 있으면 도로명 정확도가 높아 먼저 채택 (완전한 도로명일 때)
  if (googleFull?.roadAddress && !isIncompleteRoadAddressKorea(googleFull.roadAddress)) {
    return googleFull;
  }
  // (2) expo 조합에 도로명(로/길/대로)이 명확히 있을 때만 우선 (플랫폼 역지오코딩이 빠른 경우)
  if (expoBuilt && !isIncompleteRoadAddressKorea(expoBuilt.roadAddress)) {
    return expoBuilt;
  }
  // (3) OSM — Web에서 Google 키가 없을 때도 도로명/표시명 제공 가능
  if (osmFull?.roadAddress && !isIncompleteRoadAddressKorea(osmFull.roadAddress)) {
    return osmFull;
  }
  // (3) Google 결과가 있으면 expo 불완전보다 우선 (도로명이 약해도)
  if (googleFull?.roadAddress) {
    return googleFull;
  }
  // (4) OSM fallback
  if (osmFull?.roadAddress) {
    return osmFull;
  }
  // (4) expo만 있을 때
  if (expoBuilt?.roadAddress) {
    return expoBuilt;
  }
  // (5) region 요약
  if (expoRegionOnly?.roadAddress) {
    return expoRegionOnly;
  }

  const fb = `대한민국 ${latN}, ${lngN}`;
  return { roadAddress: fb, shortAddress: fb, mapUrl };
}

/** 기존 호환: 한 줄 문자열 */
export async function reverseGeocodeDisplayAddressV2(lat: number, lng: number): Promise<string> {
  const full = await reverseGeocodeFullV2(lat, lng);
  return full.roadAddress || full.formattedAddress || '';
}
