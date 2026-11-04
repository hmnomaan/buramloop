// client/src/lib/apiClient.ts
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly fieldErrors?: Record<string, string[]>;

  constructor(
    message: string,
    status: number,
    code = 'API_ERROR',
    fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export interface AuditedMutationOptions<TBody> {
  body: TBody;
  reason: string; // Mandatory per R2, R3, R5, R6, R14
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

class BuramApiClient {
  private lastLatencyMs: number | null = null;
  private lastSyncIso: string | null = null;

  public getTelemetry() {
    return {
      baseUrl: API_BASE_URL,
      lastLatencyMs: this.lastLatencyMs,
      lastSyncIso: this.lastSyncIso,
    };
  }

  public async request<TResponse>(
    path: string,
    init?: RequestInit
  ): Promise<TResponse> {
    const start = performance.now();
    const token = window.sessionStorage.getItem('buram_jwt');

    const headers = new Headers(init?.headers);
    headers.set('Accept', 'application/json');
    if (init?.body && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });

    this.lastLatencyMs = Math.round(performance.now() - start);
    this.lastSyncIso = new Date().toISOString();

    if (!response.ok) {
      let errorPayload: { message?: string; code?: string; errors?: Record<string, string[]> } = {};
      try {
        errorPayload = await response.json();
      } catch {
        // Non-JSON error response
      }
      throw new ApiError(
        errorPayload.message || `HTTP ${response.status} on ${path}`,
        response.status,
        errorPayload.code || `HTTP_${response.status}`,
        errorPayload.errors
      );
    }

    const payload = await response.json();
    // Unwrap standard { success: true, data: ... } envelope if present
    return (payload && typeof payload === 'object' && 'data' in payload
      ? payload.data
      : payload) as TResponse;
  }

  /**
   * Enforces mandatory audit reason on every state-changing operation.
   */
  public async auditedMutation<TResponse, TBody extends Record<string, unknown>>(
    path: string,
    method: 'POST' | 'PATCH' | 'PUT',
    options: AuditedMutationOptions<TBody>
  ): Promise<TResponse> {
    const trimmedReason = options.reason.trim();
    if (trimmedReason.length < 5) {
      throw new ApiError(
        'Audit compliance rule violation: An explicit reason (minimum 5 characters) is mandatory.',
        422,
        'AUDIT_REASON_REQUIRED'
      );
    }

    return this.request<TResponse>(path, {
      method,
      headers: {
        'X-Audit-Reason': encodeURIComponent(trimmedReason),
      },
      body: JSON.stringify({
        ...options.body,
        reason: trimmedReason,
      }),
    });
  }
}

export const apiClient = new BuramApiClient();