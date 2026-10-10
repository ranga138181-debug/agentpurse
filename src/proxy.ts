import { NextResponse, type NextRequest } from "next/server";

const PAYPAL = "https://*.paypal.com https://*.paypalobjects.com";

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // React's development tooling needs eval; production never allows it.
  const devEval =
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${devEval} ${PAYPAL}`,
    `style-src 'self' 'unsafe-inline' ${PAYPAL}`,
    `frame-src ${PAYPAL}`,
    `connect-src 'self' ${PAYPAL}`,
    `img-src 'self' data: ${PAYPAL}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  // Next.js reads the nonce from the request's policy and applies it to its own scripts.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
