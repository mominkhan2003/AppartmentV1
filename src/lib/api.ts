/**
 * Thin fetch client for the self-managed PHP/MySQL backend (backend/api).
 * Same-origin cookies carry the session (HttpOnly), so no tokens live in JS.
 * Every unsafe call sends X-Requested-With as the CSRF fallback header; browsers
 * also send Origin on same-origin POSTs, both accepted by backend/src/Csrf.php.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const BASE: string = import.meta.env["VITE_API_BASE"] ?? "/api";

async function unwrap(res: Response): Promise<unknown> {
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON (should not happen) */
  }
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return payload;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = { method, headers, credentials: "same-origin" };
  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body; // browser sets the multipart boundary itself
    } else {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
  }
  if (method !== "GET" && method !== "HEAD") {
    headers["X-Requested-With"] = "XMLHttpRequest";
  }
  const res = await fetch(BASE + path, init);
  return (await unwrap(res)) as T;
}

export const api = {
  get: <T,>(path: string) => request<T>("GET", path),
  post: <T,>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T,>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T,>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T,>(path: string) => request<T>("DELETE", path),
};

/** Media files are never addressable by raw disk path; they stream through the API. */
export const mediaUrl = (mediaId: string) => `${BASE}/media/${mediaId}/file`;
export function openMedia(mediaId: string | null | undefined) {
  if (mediaId) window.open(mediaUrl(mediaId), "_blank", "noopener");
}
