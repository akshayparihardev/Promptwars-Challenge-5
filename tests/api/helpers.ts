import type { ApiRequest, ApiResponse } from '../../api/_lib/http';

export interface Captured {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export function mockReq(over: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: {},
    ...over,
  };
}

export function mockRes(): { res: ApiResponse; out: Captured } {
  const out: Captured = { status: 0, body: undefined, headers: {} };
  const res: ApiResponse = {
    status(code) {
      out.status = code;
      return res;
    },
    json(body) {
      out.body = body;
    },
    setHeader(name, value) {
      out.headers[name] = value;
    },
  };
  return { res, out };
}
