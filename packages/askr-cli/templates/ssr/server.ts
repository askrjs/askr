import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);

const app = express();

let vite: import('vite').ViteDevServer | undefined;

if (!isProd) {
  const { createServer } = await import('vite');
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });
  app.use(vite.middlewares);
} else {
  app.use(
    express.static(path.resolve(__dirname, '../client'), { index: false })
  );
}

app.get('/api/*', (_req, res) => {
  res.json({ message: 'API endpoint' });
});

app.get('*', async (req, res) => {
  try {
    const url = req.originalUrl;

    let template: string;
    let render: (url: string) => Promise<string> | string;

    if (!isProd) {
      template = fs.readFileSync(
        path.resolve(__dirname, 'index.html'),
        'utf-8'
      );
      template = await vite!.transformIndexHtml(url, template);
      ({ render } = await vite!.ssrLoadModule('/src/entry-server.tsx'));
    } else {
      template = fs.readFileSync(
        path.resolve(__dirname, '../client/index.html'),
        'utf-8'
      );
      const modUrl = pathToFileURL(
        path.resolve(__dirname, 'entry-server.js')
      ).href;
      ({ render } = await import(modUrl));
    }

    const appHtml = await render(url);
    const html = template.replace('<!--ssr-outlet-->', appHtml);

    res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
  } catch (e) {
    if (!isProd && vite) {
      vite.ssrFixStacktrace(e as Error);
    }
    console.error(e);
    res.status(500).end('Internal Server Error');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

export default app;
