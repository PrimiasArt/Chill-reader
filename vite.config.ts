import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'local-crawler-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api/tts')) {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                if (body) {
                  try { (req as any).body = JSON.parse(body); } catch {}
                }
                const mockRes = {
                  statusCode: 200,
                  setHeader(k: string, v: string) { res.setHeader(k, v); },
                  status(code: number) { res.statusCode = code; return this; },
                  send(data: any) { res.end(data); },
                  json(data: any) {
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify(data));
                  },
                  end(data?: any) { res.end(data); }
                };
                // @ts-ignore
                const { default: ttsHandler } = await import('./api/tts.js');
                await ttsHandler(req, mockRes);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
            return;
          }

          if (req.url && req.url.startsWith('/api/crawler')) {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                if (body) {
                  try { (req as any).body = JSON.parse(body); } catch {}
                }
                const mockRes = {
                  statusCode: 200,
                  setHeader(k: string, v: string) { res.setHeader(k, v); },
                  status(code: number) { res.statusCode = code; return this; },
                  json(data: any) {
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify(data));
                  },
                  end(data?: any) { res.end(data); }
                };
                // @ts-ignore
                const { default: crawlerHandler } = await import('./api/crawler.js');
                await crawlerHandler(req, mockRes);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
            return;
          }
          next();
        });
      }
    }
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pdfjs-dist')) {
            return 'pdfjs';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'lucide';
          }
          if (id.includes('node_modules/@supabase') || id.includes('node_modules/dexie')) {
            return 'db-vendor';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    open: false
  }
})
