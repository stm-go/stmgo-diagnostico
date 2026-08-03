import http from "node:http";

import {
  readFile,
  stat,
} from "node:fs/promises";

import {
  extname,
  join,
  normalize,
  relative,
} from "node:path";

import {
  fileURLToPath,
} from "node:url";

const root =
  fileURLToPath(
    new URL(
      ".",
      import.meta.url
    )
  );

const port =
  Number(
    process.env.PORT ||
    5173
  );

const mimeTypes = {
  ".html":
    "text/html; charset=utf-8",

  ".js":
    "text/javascript; charset=utf-8",

  ".mjs":
    "text/javascript; charset=utf-8",

  ".css":
    "text/css; charset=utf-8",

  ".json":
    "application/json; charset=utf-8",

  ".svg":
    "image/svg+xml",

  ".png":
    "image/png",

  ".jpg":
    "image/jpeg",

  ".jpeg":
    "image/jpeg",

  ".webp":
    "image/webp",

  ".csv":
    "text/csv; charset=utf-8",
};

function securityHeaders(
  contentType
) {
  return {
    "Content-Type":
      contentType,

    "Cache-Control":
      "no-store",

    "X-Content-Type-Options":
      "nosniff",

    "X-Frame-Options":
      "DENY",

    "Referrer-Policy":
      "strict-origin-when-cross-origin",

    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=()",

    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://*.supabase.co wss://*.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'",
  };
}

const server =
  http.createServer(
    async (
      request,
      response
    ) => {
      try {
        const url =
          new URL(
            request.url,
            `http://${request.headers.host}`
          );

        const requestedPath =
          decodeURIComponent(
            url.pathname
          );

        const relativePath =
          requestedPath === "/"
            ? "index.html"
            : requestedPath.replace(
                /^\/+/,
                ""
              );

        const safePath =
          normalize(
            relativePath
          );

        const filePath =
          join(
            root,
            safePath
          );

        if (
          relative(
            root,
            filePath
          ).startsWith("..")
        ) {
          throw new Error(
            "Caminho inválido."
          );
        }

        const fileStat =
          await stat(
            filePath
          );

        const finalPath =
          fileStat.isDirectory()
            ? join(
                filePath,
                "index.html"
              )
            : filePath;

        const content =
          await readFile(
            finalPath
          );

        const headers =
          securityHeaders(
            mimeTypes[
              extname(
                finalPath
              ).toLowerCase()
            ] ||
              "application/octet-stream"
          );

        response.writeHead(
          200,
          headers
        );

        if (
          request.method ===
          "HEAD"
        ) {
          response.end();
        } else {
          response.end(
            content
          );
        }
      } catch {
        response.writeHead(
          404,
          securityHeaders(
            "text/plain; charset=utf-8"
          )
        );

        response.end(
          "Arquivo não encontrado."
        );
      }
    }
  );

server.listen(
  port,
  "127.0.0.1",
  () => {
    console.log(
      `Diagnóstico stmgo disponível em http://localhost:${port}`
    );

    console.log(
      "Para encerrar, pressione Ctrl + C."
    );
  }
);