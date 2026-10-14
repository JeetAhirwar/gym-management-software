import { apiUrl } from "@/config/env";
import { DataError } from "@/data/types";

/**
 * Tiny REST client for the Pulse Gym backend.
 *
 * - Base URL comes from `VITE_API_URL`.
 * - Every request carries `Authorization: Bearer <token>` (except where the
 *   caller opts out, e.g. login).
 * - Backend errors arrive as `{ message, code? }` paired with a status code;
 *   they are re-thrown as `ApiError` (a `DataError`) so the pages' existing
 *   error handling (`isDataError`, `.message`) keeps working unchanged.
 */

export const TOKEN_STORAGE_KEY = "pulse-gym-token";

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* private mode / quota — auth simply won't persist */
  }
}

function codeForStatus(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  return "server_error";
}

function defaultMessageForStatus(status: number): string {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested record was not found.";
  if (status === 400) return "The request was invalid.";
  if (status >= 500) return "The server had a problem. Please try again.";
  return "Something went wrong. Please try again.";
}

/** Thrown for every failed HTTP response (and for network failures). */
export class ApiError extends DataError {
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(code, message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Send the bearer token (default true). */
  auth?: boolean;
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  if (!apiUrl) {
    throw new ApiError(0, "not_configured", "The API URL is not configured. Set VITE_API_URL and restart the app.");
  }
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return `${apiUrl}${path}${qs ? `?${qs}` : ""}`;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal, auth = true } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getAuthToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted = err instanceof DOMException && err.name === "AbortError";
    throw new ApiError(0, aborted ? "aborted" : "network", aborted ? "The request was cancelled." : "Unable to reach the server. Check your connection and try again.");
  }

  const payload = await parseBody(response);

  if (!response.ok) {
    const record = (payload ?? {}) as { message?: unknown; code?: unknown };
    const message =
      typeof record.message === "string" && record.message.trim().length > 0
        ? record.message
        : defaultMessageForStatus(response.status);
    const code = typeof record.code === "string" && record.code.trim().length > 0 ? record.code : codeForStatus(response.status);
    // A 401 means the stored token is no longer usable — drop it so the app
    // falls back to the signed-out state immediately.
    if (response.status === 401) setAuthToken(null);
    throw new ApiError(response.status, code, message);
  }

  return payload as T;
}

export function apiGet<T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { method: "GET", query, signal });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", body });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE" });
}
