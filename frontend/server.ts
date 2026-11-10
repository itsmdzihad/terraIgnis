import express from 'express';
import { createServer as createViteServer } from 'vite';

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json());



  const BACKEND_URL = (process.env.BACKEND_API_URL || process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000')
    .replace('localhost', '127.0.0.1')
    .replace(/\/$/, '');

  // Proxy /api and /health requests directly to FastAPI backend
  app.use(['/api', '/health'], async (req, res) => {
    try {
      const targetUrl = `${BACKEND_URL}${req.originalUrl}`;
      const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
      const isJsonBody = req.headers['content-type']?.includes('application/json') ?? false;
      const proxyBody = !hasBody ? undefined : isJsonBody ? JSON.stringify(req.body) : req;
      const fetchOptions: RequestInit & { duplex?: 'half' } = {
        method: req.method,
        headers: {
          'Accept': 'application/json',
          ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] as string } : {}),
          ...(req.headers['x-filename'] ? { 'X-Filename': req.headers['x-filename'] as string } : {}),
        },
        body: proxyBody as BodyInit | undefined,
        ...(hasBody && !isJsonBody ? { duplex: 'half' as const } : {}),
      };
      const backendRes = await fetch(targetUrl, fetchOptions);

      res.status(backendRes.status);
      backendRes.headers.forEach((value, key) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });
      const data = await backendRes.arrayBuffer();
      res.send(Buffer.from(data));
    } catch (error) {
      res.status(502).json({
        detail: `Cannot connect to backend server at ${BACKEND_URL}. Ensure FastAPI is running on port 8000.`,
      });
    }
  });

  // Mount Vite's development server as middleware inside Express
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });
  app.use(vite.middlewares);

  // Serve the index.html or bundle assets
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      // Read the raw index.html from workspace root
      const indexPath = path.resolve(__dirname, 'index.html');
      let template = fs.readFileSync(indexPath, 'utf-8');

      // Transform index.html with Vite's injection logic (e.g. inject dev scripts)
      template = await vite.transformIndexHtml(url, template);

      // Respond with the rendered template
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`TerraIgnis Console running at http://localhost:${port}`);
  });
}

startServer();
