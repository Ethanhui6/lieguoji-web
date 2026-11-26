// 列国纪全速边缘分发代理：将 GitHub Releases 安装包与 163 项热更静态资源经由 Cloudflare 全球边缘节点满速流式分发。
// 彻底绕过源站 3 Mbps 带宽上限与 25 MB 单文件缓存限制，完整透传 HTTP Range（206 Partial Content）支持 8 路并发分块下载。

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
const CDN_USER_AGENT = 'Lieguoji-CDN/5.6';

const ROUTE_IPA_TAG = /^\/api\/cdn\/ipa\/([A-Za-z0-9._-]{1,40})\/([A-Za-z0-9._-]{1,120}\.ipa)$/;
const ROUTE_IPA_LATEST = /^\/api\/cdn\/ipa\/latest\/?$/;
const ROUTE_RAW = /^\/api\/cdn\/raw\/(.+)$/;

const RAW_ALLOWED_PREFIXES = [
  'ios-native/Resources/',
  'server-deploy/platform/hotpack-content/',
] as const;

function cfFetch(url: string, init: CFRequestInit): Promise<Response> {
  return fetch(url, init as RequestInit);
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
  if (range) headers.set('Range', range);
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch) headers.set('If-None-Match', ifNoneMatch);
  const ifModifiedSince = request.headers.get('If-Modified-Since');
  if (ifModifiedSince) headers.set('If-Modified-Since', ifModifiedSince);
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
    headers.set('Content-Disposition', `attachment; filename="${options.downloadFilename}"`);
  }

  const noBody = request.method === 'HEAD' || upstream.status === 204 || upstream.status === 304;
  return new Response(noBody ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function handleIpaTagged(request: Request, tag: string, filename: string): Promise<Response> {
  if (tag.includes('..') || filename.includes('..')) {
    return jsonError('Invalid release path', 400);
  }
  const upstreamUrl = `https://github.com/${REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`;
  const upstream = await cfFetch(upstreamUrl, {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
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
    if (typeof asset.name !== 'string' || typeof asset.browser_download_url !== 'string') continue;
    if (!asset.name.toLowerCase().endsWith('.ipa')) continue;
    if (!asset.browser_download_url.startsWith('https://')) continue;
    return { name: asset.name, url: asset.browser_download_url };
  }
  return null;
}

async function handleIpaLatest(request: Request): Promise<Response> {
  const apiUrl = `https://api.github.com/repos/${REPO}/releases/latest`;
  const metaResp = await cfFetch(apiUrl, {
    method: 'GET',
    headers: {
      'User-Agent': CDN_USER_AGENT,
      Accept: 'application/vnd.github+json',
    },
    redirect: 'follow',
    cf: {
      cacheTtl: 300,
      cacheEverything: true,
    },
  });

  if (!metaResp.ok) {
    return jsonError(`Upstream release lookup failed (${metaResp.status})`, 502);
  }

  let releaseData: unknown;
  try {
    releaseData = await metaResp.json();
  } catch {
    return jsonError('Invalid release metadata', 502);
  }

  const asset = pickIpaAsset(releaseData);
  if (!asset) {
    return jsonError('No IPA asset found in latest release', 404);
  }

  const upstream = await cfFetch(asset.url, {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: buildUpstreamRequestHeaders(request),
    redirect: 'follow',
  });

  const safeName = asset.name.replace(/[^A-Za-z0-9._-]/g, '') || 'lieguoji-latest.ipa';
  return buildProxiedResponse(request, upstream, {
    routeTag: 'ipa-latest',
    cacheControl: 'public, max-age=300',
    fallbackContentType: 'application/octet-stream',
    downloadFilename: safeName,
  });
}

async function handleRawAsset(request: Request, rawSubpath: string): Promise<Response> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawSubpath);
  } catch {
    return jsonError('Malformed path encoding', 400);
  }

  if (
    !decoded ||
    decoded.includes('..') ||
    decoded.includes('\\') ||
    decoded.includes('\0') ||
    decoded.startsWith('/')
  ) {
    return jsonError('Forbidden path', 400);
  }

  const allowed = RAW_ALLOWED_PREFIXES.some((prefix) => decoded.startsWith(prefix));
  if (!allowed) {
    return jsonError('Path outside allowed hotpack prefixes', 403);
  }

  const segments = decoded.split('/');
  if (segments.some((seg) => seg.length === 0 || seg === '.' || seg === '..')) {
    return jsonError('Invalid path segment', 400);
  }

  const encodedPath = segments.map((seg) => encodeURIComponent(seg)).join('/');
  const upstreamUrl = `https://raw.githubusercontent.com/${REPO}/main/${encodedPath}`;
  const upstream = await cfFetch(upstreamUrl, {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
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

export const onRequest = async (context: { request: Request }): Promise<Response> => {
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

  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
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

    if (pathname === '/api/cdn' || pathname === '/api/cdn/') {
      const headers = new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      applyCorsHeaders(headers);
      return new Response(
        JSON.stringify({ ok: true, service: 'lieguoji-edge-cdn', version: '5.6.0' }),
        { status: 200, headers },
      );
    }

    return jsonError('Unknown CDN route', 404);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Upstream fetch error';
    return jsonError(detail, 502);
  }
};
