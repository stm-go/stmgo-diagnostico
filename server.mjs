import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 5173);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

const server = http.createServer(async (request, response) => {
  try {
    const requestedPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '');
    const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(root, safePath);

    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = join(filePath, 'index.html');

    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Arquivo nao encontrado.');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Diagnostico stmgo disponivel em http://localhost:${port}`);
  console.log('Para encerrar, pressione Ctrl + C.');
});
