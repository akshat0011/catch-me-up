import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

// In production, files in /api run as Vercel Functions (Node.js, Web handler signature). In dev, this plugin
// routes /api/* to the same handlers so `npm run dev` works without the Vercel CLI.
function devApi(): Plugin {
  return {
    name: "dev-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = url.pathname.match(/^\/api\/([a-z-]+)$/);
        if (!match) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`);
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const request = new Request(url, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
          });
          const handler = mod[req.method ?? "GET"];
          const response: Response = handler
            ? await handler(request)
            : new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          if (!response.body) return res.end();
          const reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        } catch (err) {
          console.error(err);
          res.statusCode = 500;
          res.end("dev api error");
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const k of ["GEMINI_API_KEY", "GEMINI_MODEL"]) if (env[k]) process.env[k] = env[k];
  return { plugins: [react(), devApi()] };
});
