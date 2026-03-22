import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import yts from "yt-search";
import play from "play-dl";

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

  app.get("/api/youtube/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }
      console.log(`YouTube Searching for: ${query}`);
      const results = await yts(query + " music");
      const songs = results.videos.slice(0, 15).map(video => ({
        id: video.videoId,
        title: video.title,
        artist: video.author.name,
        cover: video.thumbnail,
        url: `/api/youtube/stream?id=${video.videoId}`,
        isApiSong: true,
        source: 'youtube'
      }));
      res.json({ data: { results: songs } });
    } catch (error) {
      console.error("YouTube search error:", error);
      res.status(500).json({ error: "Failed to search YouTube" });
    }
  });

  app.get("/api/youtube/stream", async (req, res) => {
    try {
      const videoId = req.query.id as string;
      if (!videoId) {
        return res.status(400).send("Video ID is required");
      }
      
      console.log(`Streaming YouTube video with play-dl: ${videoId}`);
      
      // play-dl is generally more resilient to 429s
      const stream = await play.stream(`https://www.youtube.com/watch?v=${videoId}`, {
        quality: 2 // highest audio
      });
      
      res.setHeader("Content-Type", "audio/mpeg");
      stream.stream.pipe(res);
    } catch (error: any) {
      console.error("YouTube stream error (play-dl):", error.message || error);
      if (error.message?.includes('429')) {
        res.status(429).send("YouTube is rate-limiting this request. Please try again later.");
      } else {
        res.status(500).send("Failed to stream YouTube audio");
      }
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
