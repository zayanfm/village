/**
 * httpClient.js — thin fetch wrapper shared by every service client.
 *
 * Responsibilities:
 *   - JSON in / JSON out
 *   - a request timeout (mobile networks stall; never hang forever)
 *   - normalized errors: any non-2xx throws an ApiError carrying { status, body }
 *     so screens can render real error states instead of guessing.
 */

const DEFAULT_TIMEOUT_MS = 10000;

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * @param {string} url absolute URL (built from config.baseUrl)
 * @param {{ method?:string, body?:any, headers?:object, timeoutMs?:number }} [opts]
 */
export async function request(url, opts = {}) {
  const { method = 'GET', body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${timeoutMs}ms`, { status: 0 });
    }
    // Network failure (server down, wrong IP, no Wi-Fi, etc.)
    throw new ApiError(`Network request failed: ${err.message}`, { status: 0 });
  } finally {
    clearTimeout(timer);
  }

  // Parse the body if present (some 204s have none).
  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text; // non-JSON error pages, etc.
    }
  }

  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status} for ${method} ${url}`, {
      status: res.status,
      body: parsed,
    });
  }
  return parsed;
}

export const http = {
  get:   (url, opts)       => request(url, { ...opts, method: 'GET' }),
  post:  (url, body, opts) => request(url, { ...opts, method: 'POST',  body }),
  put:   (url, body, opts) => request(url, { ...opts, method: 'PUT',   body }),
  patch: (url, body, opts) => request(url, { ...opts, method: 'PATCH', body }),
};
