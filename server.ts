import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }
      console.log(`Searching for: ${query}`);
      const apiUrl = `https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query=${encodeURIComponent(query)}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        console.error(`API error: ${response.status} ${response.statusText}`);
        throw new Error(`API responded with status: ${response.status}`);
      }
      const data = await response.json();
      console.log(`Found ${data.data?.results?.length || 0} results`);
      res.json(data);
    } catch (error) {
      console.error("Search proxy error:", error);
      res.status(500).json({ error: "Failed to fetch songs" });
    }
  });

  app.get("/api/proxy-audio", async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).send("URL is required");
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }
      
      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      
      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      if (response.body) {
        const body = Readable.fromWeb(response.body as any);
        body.pipe(res);
      } else {
        res.status(500).send("No body");
      }
    } catch (error) {
      console.error("Audio proxy error:", error);
      res.status(500).send("Failed to proxy audio");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
