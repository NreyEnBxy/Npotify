import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

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

    // Try primary API
    let apiResponse = await fetch(`https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query=${encodeURIComponent(query)}`);
    
    // Fallback to another API if primary fails
    if (!apiResponse.ok) {
      console.warn("Primary search API failed, trying fallback...");
      apiResponse = await fetch(`https://jiosaavn-api.vercel.app/search/songs?query=${encodeURIComponent(query)}`);
    }

    if (!apiResponse.ok) {
      throw new Error(`Both APIs responded with status: ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
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

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
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

  // Only listen if not on Vercel
  if (!process.env.VERCEL) {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
