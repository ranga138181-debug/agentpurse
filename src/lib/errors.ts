export function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        request_id: requestId,
        ...(details && { details }),
      },
    },
    { status },
  );
}
