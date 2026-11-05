import { NextResponse } from "next/server";

export function makeRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

export function okResponse(
  data: unknown,
  requestId: string,
  status = 200
): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "x-request-id": requestId },
  });
}

export function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
        requestId,
      },
    },
    {
      status,
      headers: { "x-request-id": requestId },
    }
  );
}
