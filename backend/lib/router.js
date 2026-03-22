export function parseQuery(reqUrl) {
  const query = {};
  const queryString = reqUrl.split('?')[1];
  if (!queryString) return query;

  queryString.split('&').forEach((pair) => {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      query[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  });

  return query;
}

export async function parseBody(req) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : {};
}

export function matchRoute(routes, req) {
  const pathname = decodeURIComponent(req.url).split('?')[0];

  for (const [route, handler] of Object.entries(routes)) {
    const [method, path] = route.split(' ');
    if (req.method !== method) continue;

    const pathParts = path.split('/');
    const urlParts = pathname.split('/');
    if (pathParts.length !== urlParts.length) continue;

    const params = {};
    let matched = true;

    for (let i = 0; i < pathParts.length; i += 1) {
      if (pathParts[i].startsWith(':')) {
        params[pathParts[i].slice(1)] = urlParts[i];
      } else if (pathParts[i] !== urlParts[i]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return { handler, params };
    }
  }

  return null;
}

export function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}
