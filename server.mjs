import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const host = argument("host", process.env.HOST || "0.0.0.0");
const port = Number(argument("port", process.env.PORT || "8765"));
const root = path.resolve(argument("dir", process.env.STATIC_DIR || path.join(projectRoot, "dist")));

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "img-src 'self' data: https:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const compressionCache = new Map();

function isCompressible(contentType) {
  return (
    contentType.startsWith("text/") ||
    contentType.includes("javascript") ||
    contentType.includes("json") ||
    contentType.includes("svg") ||
    contentType.includes("font")
  );
}

function cacheControl(pathname) {
  if (pathname.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  if (pathname === "/" || pathname.endsWith(".html")) {
    return "no-cache";
  }
  return "public, max-age=3600, stale-while-revalidate=86400";
}

function encode(content, encoding) {
  const cacheKey = `${encoding}:${crypto.createHash("sha1").update(content).digest("base64url")}`;
  const cached = compressionCache.get(cacheKey);
  if (cached) return cached;
  const encoded =
    encoding === "br"
      ? zlib.brotliCompressSync(content, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 10,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: content.length,
          },
        })
      : zlib.gzipSync(content, { level: 9 });
  compressionCache.set(cacheKey, encoded);
  return encoded;
}

async function resolveFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const requested = decoded === "/" ? "/index.html" : decoded;
  const candidate = path.resolve(root, `.${requested}`);
  if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) {
    return null;
  }

  try {
    const stat = await fs.promises.stat(candidate);
    if (stat.isFile()) return { filePath: candidate, stat, pathname: requested };
    if (stat.isDirectory()) {
      const indexPath = path.join(candidate, "index.html");
      const indexStat = await fs.promises.stat(indexPath);
      return { filePath: indexPath, stat: indexStat, pathname: `${requested}index.html` };
    }
  } catch {
    // Fall through to SPA fallback below.
  }

  if (!path.extname(decoded)) {
    const indexPath = path.join(root, "index.html");
    try {
      const indexStat = await fs.promises.stat(indexPath);
      return { filePath: indexPath, stat: indexStat, pathname: "/index.html" };
    } catch {
      return null;
    }
  }
  return null;
}

const server = http.createServer(async (request, response) => {
  const startedAt = performance.now();
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    const resolved = await resolveFile(requestUrl.pathname);
    if (!resolved) {
      response.writeHead(404, {
        ...securityHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end("Not found");
      return;
    }

    const contentType =
      mimeTypes.get(path.extname(resolved.filePath).toLowerCase()) ||
      "application/octet-stream";
    const etag = `W/"${resolved.stat.size.toString(16)}-${resolved.stat.mtimeMs.toString(16)}"`;
    const headers = {
      ...securityHeaders,
      "Cache-Control": cacheControl(resolved.pathname),
      "Content-Type": contentType,
      ETag: etag,
      Vary: "Accept-Encoding",
    };

    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, headers);
      response.end();
      return;
    }

    let body = await fs.promises.readFile(resolved.filePath);
    const acceptedEncoding = String(request.headers["accept-encoding"] || "");
    if (
      body.length > 1024 &&
      isCompressible(contentType) &&
      (acceptedEncoding.includes("br") || acceptedEncoding.includes("gzip"))
    ) {
      const encoding = acceptedEncoding.includes("br") ? "br" : "gzip";
      body = encode(body, encoding);
      headers["Content-Encoding"] = encoding;
    }
    headers["Content-Length"] = String(body.length);

    response.writeHead(200, headers);
    if (request.method === "HEAD") response.end();
    else response.end(body);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      response.writeHead(500, {
        ...securityHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
    }
    response.end("Internal server error");
  } finally {
    if (process.env.LOG_REQUESTS === "1") {
      const duration = (performance.now() - startedAt).toFixed(1);
      console.log(
        `${request.method} ${requestUrl.pathname} ${response.statusCode} ${duration}ms`,
      );
    }
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.listen(port, host, () => {
  console.log(`Agent Systems Field Guide listening on http://${host}:${port} (${root})`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; closing server`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
