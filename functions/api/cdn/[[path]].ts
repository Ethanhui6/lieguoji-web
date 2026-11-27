// 列国纪边缘分发代理：将 GitHub Releases 安装包与 163 项热更静态资源经由 Cloudflare 全球边缘节点流式分发（海外加速与容错节点）。
// 完整透传 HTTP Range（206 Partial Content），严格路径校验并及时释放未消费响应流。

type CFRequestInit = RequestInit & {
  cf?: {
    cacheTtl?: number;
    cacheEverything?: boolean;
  };
};

interface GitHubAsset {
  name?: unknown;
  browser_download_url?: unknown;
}

interface GitHubRelease {
  assets?: unknown;
}

const REPO = 'Ethanhui6/lieguoji-web';
const CDN_USER_AGENT = 'Lieguoji-CDN/8.0';

const ROUTE_IPA_TAG = /^\/api\/cdn\/ipa\/([A-Za-z0-9._-]{1,40})\/([A-Za-z0-9._-]{1,120}\.ipa)$/;
const ROUTE_IPA_LATEST = /^\/api\/cdn\/ipa\/latest\/?$/;
const ROUTE_RAW = /^\/api\/cdn\/raw\/(.+)$/;
const ROUTE_HOTPACK = /^\/api\/cdn\/hotpack\/(.+)$/;

const HOTPACK_V7_RELEASE_TAG = 'hotpack-v7';
const HOTPACK_V7_PREFIXES = [
  'HDMeshes/',
  'ReliefTiles/',
  'Encyclopedia/',
  'EraUnits/',
  'EventScrolls/',
  'GeneralPortraits/',
  'AudioHD/',
] as const;

const HOTPACK_V6_RELEASE_TAG = 'hotpack-v6';
const HOTPACK_V6_PREFIXES = [
  'Eras45/',
] as const;

const HOTPACK_RELEASE_TAG = 'hotpack-v5';
const HOTPACK_ALLOWED_PREFIXES = [
  'gis-basemaps-10m/',
  'gis-historical-45eras/',
  'gis-cities-encyclopedia/',
] as const;

const RAW_ALLOWED_PREFIXES = [
  'ios-native/Resources/',
  'server-deploy/platform/hotpack-content/',
] as const;

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
const ALLOWED_ASSET_PREFIXES = [
  `https://github.com/${REPO}/releases/download/`,
  'https://objects.githubusercontent.com/',
] as const;

function cfFetch(url: string, init: CFRequestInit): Promise<Response> {
  return fetch(url, init as RequestInit);
}

function cancelBodyQuietly(resp: Response): void {
  if (!resp.body) return;
  try {
    void resp.body.cancel().catch(() => {});
  } catch {
    // Body stream may already be locked or disturbed.
  }
}

function sanitizeDownloadFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '');
  if (!cleaned || cleaned.startsWith('.') || cleaned.includes('..')) {
    return 'lieguoji-latest.ipa';
  }
  return cleaned;
}

function applyCorsHeaders(headers: Headers): void {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Range, If-None-Match, If-Modified-Since');
  headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, ETag, X-CDN-Route');
}

function jsonError(message: string, status: number): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  applyCorsHeaders(headers);
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers });
}

function buildUpstreamRequestHeaders(request: Request): Headers {
  const headers = new Headers();
  headers.set('User-Agent', CDN_USER_AGENT);
  const range = request.headers.get('Range');
  if (range && !hasControlChars(range)) headers.set('Range', range);
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && !hasControlChars(ifNoneMatch)) headers.set('If-None-Match', ifNoneMatch);
  const ifModifiedSince = request.headers.get('If-Modified-Since');
  if (ifModifiedSince && !hasControlChars(ifModifiedSince)) headers.set('If-Modified-Since', ifModifiedSince);
  return headers;
}

function buildProxiedResponse(
  request: Request,
  upstream: Response,
  options: {
    routeTag: string;
    cacheControl: string;
    fallbackContentType: string;
    downloadFilename?: string;
  },
): Response {
  const headers = new Headers();
  applyCorsHeaders(headers);
  headers.set('X-CDN-Route', options.routeTag);
  headers.set('Cache-Control', upstream.ok ? options.cacheControl : 'no-store');
  headers.set('Content-Type', upstream.headers.get('Content-Type') || options.fallbackContentType);

  const passthrough = [
    'Content-Length',
    'Content-Range',
    'ETag',
    'Last-Modified',
    'Content-Disposition',
  ];
  for (const name of passthrough) {
    const val = upstream.headers.get(name);
    if (val) headers.set(name, val);
  }

  if (upstream.status === 200 || upstream.status === 206) {
    headers.set('Accept-Ranges', upstream.headers.get('Accept-Ranges') || 'bytes');
  }
  if (options.downloadFilename && !headers.has('Content-Disposition') && (upstream.status === 200 || upstream.status === 206)) {
    const safeFilename = sanitizeDownloadFilename(options.downloadFilename);
    headers.set('Content-Disposition', `attachment; filename="${safeFilename}"`);
  }

  const noBody = request.method.toUpperCase() === 'HEAD' || upstream.status === 204 || upstream.status === 304;
  if (noBody) {
    cancelBodyQuietly(upstream);
  }
  return new Response(noBody ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function handleIpaTagged(request: Request, tag: string, filename: string): Promise<Response> {
  if (
    tag.includes('..') ||
    filename.includes('..') ||
    tag.startsWith('.') ||
    filename.startsWith('.') ||
    hasControlChars(tag) ||
    hasControlChars(filename)
  ) {
    return jsonError('Invalid release path', 400);
  }
  const upstreamUrl = `https://github.com/${REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`;
  const upstream = await cfFetch(upstreamUrl, {
    method: request.method.toUpperCase() === 'HEAD' ? 'HEAD' : 'GET',
    headers: buildUpstreamRequestHeaders(request),
    redirect: 'follow',
  });
  return buildProxiedResponse(request, upstream, {
    routeTag: 'ipa-tag',
    cacheControl: 'public, max-age=3600',
    fallbackContentType: 'application/octet-stream',
    downloadFilename: filename,
  });
}

function pickIpaAsset(release: unknown): { name: string; url: string } | null {
  if (!release || typeof release !== 'object') return null;
  const assets = (release as GitHubRelease).assets;
  if (!Array.isArray(assets)) return null;
  for (const item of assets) {
    if (!item || typeof item !== 'object') continue;
    const asset = item as GitHubAsset;
    const assetName = asset.name;
    const downloadUrl = asset.browser_download_url;
    if (typeof assetName !== 'string' || typeof downloadUrl !== 'string') continue;
    if (!assetName.toLowerCase().endsWith('.ipa')) continue;
    const allowedOrigin = ALLOWED_ASSET_PREFIXES.some((prefix) => downloadUrl.startsWith(prefix));
    if (!allowedOrigin) continue;
    return { name: assetName, url: downloadUrl };
  }
  return null;
}

async function handleIpaLatest(request: Request): Promise<Response> {
  const apiUrl = `https://api.github.com/repos/${REPO}/releases/latest`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  let metaResp: Response;
  try {
    metaResp = await cfFetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': CDN_USER_AGENT,
        Accept: 'application/vnd.github+json',
      },
      redirect: 'follow',
      signal: controller.signal,
      cf: {
        cacheTtl: 300,
        cacheEverything: true,
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!metaResp.ok) {
    cancelBodyQuietly(metaResp);
    return jsonError(`Upstream release lookup failed (${metaResp.status})`, 502);
  }

  let releaseData: unknown;
  try {
    releaseData = await metaResp.json();
  } catch {
    cancelBodyQuietly(metaResp);
    return jsonError('Invalid release metadata', 502);
  }

  const asset = pickIpaAsset(releaseData);
  if (!asset) {
    return jsonError('No IPA asset found in latest release', 404);
  }

  const upstream = await cfFetch(asset.url, {
    method: request.method.toUpperCase() === 'HEAD' ? 'HEAD' : 'GET',
    headers: buildUpstreamRequestHeaders(request),
    redirect: 'follow',
  });

  const safeName = sanitizeDownloadFilename(asset.name);
  return buildProxiedResponse(request, upstream, {
    routeTag: 'ipa-latest',
    cacheControl: 'public, max-age=300',
    fallbackContentType: 'application/octet-stream',
    downloadFilename: safeName,
  });
}

async function handleRawAsset(request: Request, rawSubpath: string): Promise<Response> {
  if (!rawSubpath || rawSubpath.length > 512) {
    return jsonError('Invalid path length', 400);
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawSubpath);
  } catch {
    return jsonError('Malformed path encoding', 400);
  }

  // Reject traversal, backslashes, control characters, and double-encoded traversal sequences
  const lowerDecoded = decoded.toLowerCase();
  if (
    !decoded ||
    decoded.includes('..') ||
    decoded.includes('\\') ||
    decoded.startsWith('/') ||
    hasControlChars(decoded) ||
    lowerDecoded.includes('%2e') ||
    lowerDecoded.includes('%2f') ||
    lowerDecoded.includes('%5c')
  ) {
    return jsonError('Forbidden path', 400);
  }

  const allowed = RAW_ALLOWED_PREFIXES.some((prefix) => decoded.startsWith(prefix));
  if (!allowed) {
    return jsonError('Path outside allowed hotpack prefixes', 403);
  }

  const segments = decoded.split('/');
  if (segments.some((seg) => seg.length === 0 || seg === '.' || seg === '..' || seg.includes('..'))) {
    return jsonError('Invalid path segment', 400);
  }

  const encodedPath = segments.map((seg) => encodeURIComponent(seg)).join('/');
  const upstreamUrl = `https://raw.githubusercontent.com/${REPO}/main/${encodedPath}`;
  const upstream = await cfFetch(upstreamUrl, {
    method: request.method.toUpperCase() === 'HEAD' ? 'HEAD' : 'GET',
    headers: buildUpstreamRequestHeaders(request),
    redirect: 'follow',
    cf: {
      cacheTtl: 86400,
      cacheEverything: true,
    },
  });

  return buildProxiedResponse(request, upstream, {
    routeTag: 'raw',
    cacheControl: 'public, max-age=86400',
    fallbackContentType: 'application/octet-stream',
  });
}

async function handleHotpackAsset(request: Request, rawSubpath: string): Promise<Response> {
  if (!rawSubpath || rawSubpath.length > 512) {
    return jsonError('Invalid hotpack path length', 400);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawSubpath);
  } catch {
    return jsonError('Malformed path encoding', 400);
  }
  const lowerDecoded = decoded.toLowerCase();
  if (
    !decoded ||
    decoded.includes('..') ||
    decoded.includes('\\') ||
    decoded.startsWith('/') ||
    hasControlChars(decoded) ||
    lowerDecoded.includes('%2e') ||
    lowerDecoded.includes('%2f') ||
    lowerDecoded.includes('%5c')
  ) {
    return jsonError('Forbidden hotpack path', 400);
  }
  const isV7 = HOTPACK_V7_PREFIXES.some((prefix) => decoded.startsWith(prefix));
  const isV6 = !isV7 && HOTPACK_V6_PREFIXES.some((prefix) => decoded.startsWith(prefix));
  const isV5 = !isV7 && !isV6 && HOTPACK_ALLOWED_PREFIXES.some((prefix) => decoded.startsWith(prefix));
  if (!isV7 && !isV6 && !isV5) {
    return jsonError('Path outside allowed hotpack modules', 403);
  }
  const segments = decoded.split('/');
  if (segments.length < 2 || segments.length > 4 || segments.some((s) => !s || s === '.' || s === '..')) {
    return jsonError('Invalid hotpack asset segment', 400);
  }
  const releaseTag = isV7 ? HOTPACK_V7_RELEASE_TAG : (isV6 ? HOTPACK_V6_RELEASE_TAG : HOTPACK_RELEASE_TAG);
  const assetName = (isV7 || isV6) ? segments.join('__') : segments[1];
  const upstreamUrl = `https://github.com/${REPO}/releases/download/${releaseTag}/${encodeURIComponent(assetName)}`;
  const upstream = await cfFetch(upstreamUrl, {
    method: request.method.toUpperCase() === 'HEAD' ? 'HEAD' : 'GET',
    headers: buildUpstreamRequestHeaders(request),
    redirect: 'follow',
    cf: {
      cacheTtl: 86400,
      cacheEverything: true,
    },
  });
  return buildProxiedResponse(request, upstream, {
    routeTag: releaseTag,
    cacheControl: 'public, max-age=86400',
    fallbackContentType: 'application/octet-stream',
  });
}

export const onRequest = async (context: { request: Request }): Promise<Response> => {
  try {
    const { request } = context;
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      const headers = new Headers({ 'Access-Control-Max-Age': '86400' });
      applyCorsHeaders(headers);
      return new Response(null, { status: 204, headers });
    }

    if (method !== 'GET' && method !== 'HEAD') {
      const headers = new Headers({ Allow: 'GET, HEAD, OPTIONS' });
      applyCorsHeaders(headers);
      return new Response('Method Not Allowed', { status: 405, headers });
    }

    let pathname: string;
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      return jsonError('Invalid request URL', 400);
    }

    const tagMatch = ROUTE_IPA_TAG.exec(pathname);
    if (tagMatch) {
      return await handleIpaTagged(request, tagMatch[1], tagMatch[2]);
    }

    if (ROUTE_IPA_LATEST.test(pathname)) {
      return await handleIpaLatest(request);
    }

    const rawMatch = ROUTE_RAW.exec(pathname);
    if (rawMatch) {
      return await handleRawAsset(request, rawMatch[1]);
    }

    const hotpackMatch = ROUTE_HOTPACK.exec(pathname);
    if (hotpackMatch) {
      return await handleHotpackAsset(request, hotpackMatch[1]);
    }

    if (pathname === '/api/cdn' || pathname === '/api/cdn/') {
      const headers = new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      applyCorsHeaders(headers);
      return new Response(
        JSON.stringify({ ok: true, service: 'lieguoji-edge-cdn', version: '5.7.0' }),
        { status: 200, headers },
      );
    }

    return jsonError('Unknown CDN route', 404);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Upstream fetch error';
    return jsonError(detail, 502);
  }
};
