import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRuntimeConfig, loadRuntimeConfig } from '../config/runtime-config.js';
import { AppService } from '../services/app-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.BOOK_AGENT_READER_PORT || 4317);
const homeDir =
  process.env.BOOK_AGENT_READER_HOME || path.join(process.cwd(), 'var', 'book-agent-reader-preview');
const runtimeConfig = loadRuntimeConfig();
applyRuntimeConfig(runtimeConfig);
const service = new AppService(homeDir, runtimeConfig);
const rendererDir = path.join(__dirname, '..', 'renderer');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: String((error as Error).message || error) });
  }
});

server.listen(port, () => {
  console.log(`图书智能伴读器预览服务：http://127.0.0.1:${port}`);
});

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  if (req.method === 'GET' && url.pathname === '/api/books') {
    sendJson(res, 200, await service.listBooks());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/import-sample') {
    sendJson(res, 200, await service.importSampleBook());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/import-text') {
    sendJson(res, 200, await service.importText(await readJsonBody(req)));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/import-binary') {
    sendJson(res, 200, await service.importBinary(await readJsonBody(req)));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/ask') {
    sendJson(res, 200, await service.ask(await readJsonBody(req)));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/vocab') {
    sendJson(res, 200, await service.saveVocab(await readJsonBody(req)));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/highlights') {
    sendJson(res, 200, await service.saveHighlight(await readJsonBody(req)));
    return;
  }

  const bookMatch = /^\/api\/books\/([^/]+)(?:\/([^/]+))?$/.exec(url.pathname);
  if (bookMatch && req.method === 'GET' && !bookMatch[2]) {
    sendJson(res, 200, await service.loadBook(decodeURIComponent(bookMatch[1]!)));
    return;
  }
  if (bookMatch && req.method === 'GET' && bookMatch[2] === 'sessions') {
    sendJson(res, 200, await service.listSessions(decodeURIComponent(bookMatch[1]!)));
    return;
  }
  if (bookMatch && req.method === 'GET' && bookMatch[2] === 'vocab') {
    sendJson(res, 200, await service.listVocab(decodeURIComponent(bookMatch[1]!)));
    return;
  }
  if (bookMatch && req.method === 'GET' && bookMatch[2] === 'highlights') {
    sendJson(res, 200, await service.listHighlights(decodeURIComponent(bookMatch[1]!)));
    return;
  }
  if (bookMatch && req.method === 'GET' && bookMatch[2] === 'summaries') {
    sendJson(res, 200, await service.listChapterSummaries(decodeURIComponent(bookMatch[1]!)));
    return;
  }
  if (bookMatch && req.method === 'POST' && bookMatch[2] === 'export-note') {
    sendJson(res, 200, { path: await service.exportReadingNote(decodeURIComponent(bookMatch[1]!)) });
    return;
  }
  if (bookMatch && req.method === 'POST' && bookMatch[2] === 'export-skill') {
    sendJson(res, 200, { path: await service.exportSkill(decodeURIComponent(bookMatch[1]!)) });
    return;
  }

  sendJson(res, 404, { error: '接口不存在' });
}

async function serveStatic(res: http.ServerResponse, pathname: string): Promise<void> {
  const safePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(rendererDir, safePath);
  if (!filePath.startsWith(rendererDir)) {
    sendJson(res, 403, { error: '路径不允许' });
    return;
  }
  const body = await readStaticFile(filePath);
  if (!body) {
    sendJson(res, 404, { error: '文件不存在' });
    return;
  }
  res.writeHead(200, { 'content-type': contentType(filePath) });
  res.end(body);
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res: http.ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

async function readStaticFile(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
