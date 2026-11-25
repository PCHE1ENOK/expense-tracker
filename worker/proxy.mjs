// Cloudflare Worker: пересылает запросы входа GitHub Device Flow и добавляет CORS-заголовки.
// Секретов нет: Device Flow не требует client secret. Разрешён только один origin сайта.

const ALLOWED_ORIGIN = 'https://pche1enok.github.io';

const TARGETS = {
  '/device/code': 'https://github.com/login/device/code',
  '/oauth/token': 'https://github.com/login/oauth/access_token',
};

// Куда переслать запрос; null — отказ (чужой origin, не POST или неизвестный путь)
export function routeFor(origin, method, pathname) {
  if (origin !== ALLOWED_ORIGIN || method !== 'POST') return null;
  return TARGETS[pathname] ?? null;
}

export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS' && origin === ALLOWED_ORIGIN) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const target = routeFor(origin, request.method, pathname);
    if (!target) return new Response('Forbidden', { status: 403 });

    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': request.headers.get('Content-Type') || 'application/x-www-form-urlencoded',
      },
      body: await request.text(),
    });

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  },
};
