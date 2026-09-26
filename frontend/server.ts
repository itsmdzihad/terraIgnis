import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
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

  // Initialize the server-side Gemini SDK using the process.env key
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Server-side route for generating live telemetry and fire anomaly insights
  app.post('/api/ai-analyze', async (req, res) => {
    try {
      const { year, region, additionalPrompt } = req.body;
      
      if (!apiKey) {
        return res.status(400).json({ error: 'API key is not configured inside settings.' });
      }

      const prompt = `You are a NASA senior satellite data scientist and wildfire analyst specializing in active fire remote sensing.
Analyze the following fire event context using the MODIS and VIIRS harmonized dataset.
Year: ${year}
Region: ${region || "Global Fire Systems"}
Context details: ${additionalPrompt || "General anomaly interpretation"}

Provide a concise, 2-3 paragraph scientific analysis of this fire anomaly. Talk about specific drivers (climatic phenomena such as El Niño, Indian Ocean Dipole, severe dry spells, land use changes, fuel accumulation). 
Discuss how the harmonization of MODIS (polar orbiters Terra/Aqua, coarser 1km pixels, longer baseline since 2000) and VIIRS (SNPP/JPSS-1, higher-resolution 375m pixels, active since 2011/2017) resolves discrepancies, e.g. how VIIRS captures smaller, under-canopy fires that MODIS misses, while MODIS preserves historical context.

Write in a highly authoritative, precise, yet accessible scientific journal style. Use paragraph breaks and do not output any markdown headings, list items, or conversational chatter.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      res.json({ analysis: response.text });
    } catch (error: any) {
      console.error('Error generating analysis:', error);
      res.status(500).json({ error: error.message || 'Error occurred during AI modeling.' });
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
