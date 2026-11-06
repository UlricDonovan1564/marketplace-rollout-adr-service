import { createServer } from 'node:http';
import { ZodError } from 'zod';
import { ensureMarketplaceFlag, processMarketplaceOrder } from './marketplace_service.js';
import { InfraiError } from './infrai.js';

const port = Number(process.env.PORT ?? '3000');

function json(body: unknown, status = 200): { status: number; payload: string; headers: Record<string, string> } {
  return {
    status,
    payload: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  };
}

async function readJson(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/rollout/bootstrap') {
    try {
      const body = (await readJson(req)) as { featureFlagKey?: string };
      await ensureMarketplaceFlag(String(body.featureFlagKey ?? 'marketplace-order-handoff'));
      const response = json({ status: 'flag_ready' });
      res.writeHead(response.status, response.headers);
      res.end(response.payload);
      return;
    } catch (error) {
      const response = json({ error: error instanceof Error ? error.message : 'unknown error' }, 400);
      res.writeHead(response.status, response.headers);
      res.end(response.payload);
      return;
    }
  }

  if (req.method === 'POST' && req.url === '/orders/handoff') {
    try {
      const body = await readJson(req);
      const result = await processMarketplaceOrder(body as never);
      const response = json(result, 200);
      res.writeHead(response.status, response.headers);
      res.end(response.payload);
      return;
    } catch (error) {
      if (error instanceof ZodError) {
        const response = json({ error: 'invalid request body', issues: error.issues }, 400);
        res.writeHead(response.status, response.headers);
        res.end(response.payload);
        return;
      }
      if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
        const response = json({ error: error.message, code: error.code }, error.status);
        res.writeHead(response.status, response.headers);
        res.end(response.payload);
        return;
      }
      const response = json({ error: error instanceof Error ? error.message : 'internal error' }, 500);
      res.writeHead(response.status, response.headers);
      res.end(response.payload);
      return;
    }
  }

  const response = json({ error: 'not found' }, 404);
  res.writeHead(response.status, response.headers);
  res.end(response.payload);
});

server.listen(port, () => {
  console.log(`marketplace rollout service listening on http://localhost:${port}`);
});
