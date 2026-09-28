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
