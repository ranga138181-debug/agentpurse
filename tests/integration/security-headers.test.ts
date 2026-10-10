import { NextRequest } from "next/server";
import { expect, test } from "vitest";
import { proxy } from "@/proxy";

const PAYPAL = "https://*.paypal.com https://*.paypalobjects.com";

function headersFor(path = "/") {
  return proxy(new NextRequest(`http://localhost:3000${path}`)).headers;
}

function directives(headers: Headers) {
  return Object.fromEntries(
    (headers.get("Content-Security-Policy") ?? "")
      .split(";")
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...sources] = directive.split(" ");
        return [name, sources.join(" ")];
      }),
  );
}

test.each([
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
  ["X-Frame-Options", "DENY"],
])("IT-SEC-003 the %s header is %s", (name, value) => {
  expect(headersFor().get(name)).toBe(value);
});

test("IT-SEC-003 the Content-Security-Policy has the specified directives", () => {
  const csp = directives(headersFor());
  const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp["script-src"])?.[1];

  expect(nonce).toBeTruthy();
  expect(csp).toEqual({
    "default-src": "'self'",
    "script-src": `'self' 'nonce-${nonce}' ${PAYPAL}`,
    "style-src": `'self' 'unsafe-inline' ${PAYPAL}`,
    "frame-src": PAYPAL,
    "connect-src": `'self' ${PAYPAL}`,
    "img-src": `'self' data: ${PAYPAL}`,
    "object-src": "'none'",
    "base-uri": "'self'",
    "frame-ancestors": "'none'",
  });
});

test("IT-SEC-003 scripts are never allowed inline or by eval in production", () => {
  const scripts = directives(headersFor())["script-src"];

  expect(scripts).not.toContain("unsafe-inline");
  expect(scripts).not.toContain("unsafe-eval");
});

test("IT-SEC-003 every response gets a fresh nonce", () => {
  const nonces = [headersFor(), headersFor()].map(
    (headers) => directives(headers)["script-src"],
  );

  expect(nonces[0]).not.toBe(nonces[1]);
});
