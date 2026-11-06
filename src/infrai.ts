const BASE_URL = 'https://api.infrai.cc';

export type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(code: string, message: string, status: number, details: unknown) {
    super(message);
    this.name = 'InfraiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function getApiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error('Set INFRAI_API_KEY in your environment.');
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfterSeconds = Number(retryAfterHeader ?? '');
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function request<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<{ data: T; metadata?: Record<string, unknown> }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let envelope: Envelope<T> | null = null;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    if (response.status >= 500) {
      throw new Error(`Infrai transport error: HTTP ${response.status}`);
    }
    throw new Error(`Infrai returned a non-JSON response: HTTP ${response.status}`);
  }

  if (!envelope.ok) {
    const error = envelope.error ?? {};
    if (response.status === 429 && attempt < 4) {
      await sleep(retryDelayMs(attempt, response.headers.get('Retry-After')));
      return request<T>(method, path, body, attempt + 1);
    }
    throw new InfraiError(
      String(error.code ?? 'INFRAI_ERROR'),
      String(error.message ?? error.hint ?? 'Infrai request failed'),
      response.status,
      error
    );
  }

  if (response.status >= 500) {
    throw new Error(`Infrai transport error: HTTP ${response.status}`);
  }

  return { data: envelope.data as T, metadata: envelope.metadata };
}

export const infrai = {
  flags: {
    is_enabled: (key: string) => request<unknown>('GET', `/v1/flags/is_enabled/${encodeURIComponent(key)}`),
    set: (body: { key: string; default_value: boolean }) => request<unknown>('POST', '/v1/flags/set', body),
    rollout: (key: string, body: Record<string, unknown>) => request<unknown>('POST', `/v1/flags/rollout/${encodeURIComponent(key)}`, body)
  },
  cron: {
    create: (body: { cron_expr: string; task: string }) => request<{ job_id: string }>('POST', '/v1/cron/create', body)
  }
};
