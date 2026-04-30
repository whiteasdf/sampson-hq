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

// ── Typed helpers for outbound sync (Pivot 1D) ──────────────────────────────

interface AcceloTaskPayload {
  title: string;
  against_type: "job";
  against_id: number;
  assignee?: number;
  date_due?: string;
  budgeted?: number;
  status?: number;
}

interface AcceloActivityPayload {
  against_type: "task";
  against_id: number;
  owner_id: number;
  rate_id: number;
  billable: number;
  nonbillable: number;
  subject: string;
  body?: string;
  medium: string;
  standing: "complete";
  date_logged: number;
}

export async function acceloCreateTask(
  task: AcceloTaskPayload
): Promise<{ id: number }> {
  const body: Record<string, string | number | boolean> = {
    title: task.title,
    against_type: task.against_type,
    against_id: task.against_id,
  };
  if (task.assignee != null) body.assignee = task.assignee;
  if (task.date_due != null) body.date_due = task.date_due;
  if (task.budgeted != null) body.budgeted = task.budgeted;
  if (task.status != null) body.status = task.status;

  const res = await acceloPost("/tasks", body);
  const obj = res as Record<string, unknown>;
  if (typeof obj?.id !== "number") {
    throw new Error(`Accelo create task returned unexpected response: ${JSON.stringify(obj)}`);
  }
  return { id: obj.id };
}

export async function acceloUpdateTask(
  acceloId: number,
  fields: Partial<Omit<AcceloTaskPayload, "against_type" | "against_id">>
): Promise<unknown> {
  const body: Record<string, string | number | boolean> = {};
  if (fields.title != null) body.title = fields.title;
  if (fields.assignee != null) body.assignee = fields.assignee;
  if (fields.date_due != null) body.date_due = fields.date_due;
  if (fields.budgeted != null) body.budgeted = fields.budgeted;
  if (fields.status != null) body.status = fields.status;

  if (Object.keys(body).length === 0) return;

  return acceloPut(`/tasks/${acceloId}`, body);
}

export async function acceloCreateActivity(
  entry: AcceloActivityPayload
): Promise<{ id: number }> {
  const res = await acceloPost("/activities", {
    against_type: entry.against_type,
    against_id: entry.against_id,
    owner_id: entry.owner_id,
    rate_id: entry.rate_id,
    billable: entry.billable,
    nonbillable: entry.nonbillable,
    subject: entry.subject,
    body: entry.body ?? "",
    medium: entry.medium,
    standing: entry.standing,
    date_logged: entry.date_logged,
  });
  const obj = res as Record<string, unknown>;
  if (typeof obj?.id !== "number") {
    throw new Error(`Accelo create activity returned unexpected response: ${JSON.stringify(obj)}`);
  }
  return { id: obj.id };
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
