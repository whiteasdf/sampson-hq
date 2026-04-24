// ACCELO GOTCHAS:
// - Tasks have NO `standing=active` filter. Open work = `standing_not(complete),standing_not(inactive)`
// - Activities logged against tasks get re-parented to the parent Job. Never filter `against_type=task` — it returns nothing. Always use nested `activity.task?.id` field.
// - Accelo does NOT auto-apply billing rate when posting activities — `rate_id` must be passed explicitly.

const ACCELO_CLIENT_ID = process.env.ACCELO_CLIENT_ID!;
const ACCELO_CLIENT_SECRET = process.env.ACCELO_CLIENT_SECRET!;
const ACCELO_API_BASE = process.env.ACCELO_API_BASE!;
const ACCELO_TOKEN_URL = process.env.ACCELO_TOKEN_URL!;

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: ACCELO_CLIENT_ID,
    client_secret: ACCELO_CLIENT_SECRET,
    scope: "read(all) write(all)",
  });

  const res = await fetch(ACCELO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Accelo token fetch failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Accelo token response missing access_token: ${JSON.stringify(data)}`);
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };

  return tokenCache.token;
}

/**
 * Fetch all pages from a paginated Accelo list endpoint.
 * Stops when a page returns fewer items than `pageLimit`.
 */
export async function acceloFetchAll<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string> = {},
  pageLimit = 100
): Promise<T[]> {
  const all: T[] = [];
  let page = 0;

  while (true) {
    const data = (await acceloFetch(path, {
      ...params,
      _limit: String(pageLimit),
      _page: String(page),
    })) as T[] | null;

    const items = Array.isArray(data) ? data : [];
    all.push(...items);

    if (items.length < pageLimit) break;
    page++;
  }

  return all;
}

export async function acceloFetch(
  path: string,
  params?: Record<string, string>
): Promise<unknown> {
  const url = new URL(`${ACCELO_API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const doRequest = async (token: string): Promise<Response> => {
    return fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  let token = await getAccessToken();
  let res = await doRequest(token);

  if (res.status === 401) {
    tokenCache = null;
    token = await getAccessToken();
    res = await doRequest(token);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Accelo API error ${res.status} on ${path}: ${text}`);
  }

  const json = await res.json();
  return json.response;
}

/**
 * POST to an Accelo endpoint with a JSON-like body (form-encoded, as Accelo requires).
 */
export async function acceloPost(
  path: string,
  body: Record<string, string | number | boolean>
): Promise<unknown> {
  const url = `${ACCELO_API_BASE}${path}`;
  const formBody = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    formBody.set(key, String(value));
  }

  const doRequest = async (token: string): Promise<Response> => {
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });
  };

  let token = await getAccessToken();
  let res = await doRequest(token);

  if (res.status === 401) {
    tokenCache = null;
    token = await getAccessToken();
    res = await doRequest(token);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Accelo POST error ${res.status} on ${path}: ${text}`);
  }

  const json = await res.json();
  return json.response;
}

/**
 * PUT to an Accelo endpoint (for status/assignee updates).
 */
export async function acceloPut(
  path: string,
  body: Record<string, string | number | boolean>
): Promise<unknown> {
  const url = `${ACCELO_API_BASE}${path}`;
  const formBody = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    formBody.set(key, String(value));
  }

  const doRequest = async (token: string): Promise<Response> => {
    return fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });
  };

  let token = await getAccessToken();
  let res = await doRequest(token);

  if (res.status === 401) {
    tokenCache = null;
    token = await getAccessToken();
    res = await doRequest(token);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Accelo PUT error ${res.status} on ${path}: ${text}`);
  }

  const json = await res.json();
  return json.response;
}
