export interface ApiError {
  readonly code: string;
  readonly message?: string;
  readonly field?: string;
  /** The rest of what the server sent, for an answer that carries more than a message: the Days it names, or the effect of a change. */
  readonly details?: Readonly<Record<string, unknown>>;
}

export type ApiResult<T> =
  | { readonly ok: true; readonly status: number; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly error: ApiError };

const NETWORK_ERROR: ApiError = { code: 'NETWORK', message: 'Could not reach the server. Try again.' };

/** Calls the Web API. Never throws: every outcome, including a network failure, is a result. */
export async function api<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.ok) {
      return { ok: true, status: response.status, data: payload as T };
    }
    return { ok: false, status: response.status, error: toApiError(payload) };
  } catch {
    // A failed fetch is reported to the caller as a result, not rethrown.
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
}

function toApiError(payload: unknown): ApiError {
  if (typeof payload === 'object' && payload !== null && 'code' in payload) {
    const details = payload as Record<string, unknown>;
    const { code, message, field } = details;
    return {
      code: String(code),
      ...(typeof message === 'string' ? { message } : {}),
      ...(typeof field === 'string' ? { field } : {}),
      details,
    };
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Try again.' };
}
