import express from "express";
import serverless from "serverless-http";
import { Readable } from "stream";
import dotenv from "dotenv";
import yts from "yt-search";

dotenv.config();

const app = express();

// API routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// YouTube Search API (using yt-search package - no key required)
app.get("/api/youtube/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    const searchResults = await yts(query);
    const videos = searchResults.videos.slice(0, 10);
    
    const results = videos.map((video: any) => ({
      id: video.videoId,
      title: video.title,
      artist: video.author.name,
      cover: video.thumbnail,
      url: video.url,
      isYouTube: true
    }));

    res.json({ results });
  } catch (error: any) {
    console.error("YouTube search error:", error);
    res.status(500).json({ error: error.message || "Failed to search YouTube" });
  }
});

app.get("/api/youtube/stream", async (req, res) => {
  try {
    const videoId = req.query.id as string;
    if (!videoId) {
      return res.status(400).send("Video ID is required");
    }

    const instances = [
      "https://pipedapi.kavin.rocks",
      "https://pipedapi.leptons.xyz",
      "https://pipedapi.moomoo.me",
      "https://pipedapi.rivo.gg",
      "https://pipedapi.drgns.space",
      "https://pipedapi.mha.fi",
      "https://pipedapi.privacy.com.de",
      "https://pipedapi.v-m-p.org",
      "https://pipedapi.r4fo.com",
      "https://pipedapi.reallyaweso.me"
    ];

    let streamData = null;
    for (const instance of instances) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(`${instance}/streams/${videoId}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            streamData = await response.json();
            if (streamData && streamData.audioStreams && streamData.audioStreams.length > 0) {
              break;
            }
          } else {
            console.error(`Non-JSON response from ${instance}:`, contentType);
          }
        }
      } catch (e) {
        console.error(`Failed to fetch from ${instance}:`, e instanceof Error ? e.message : String(e));
      }
    }

    if (!streamData || !streamData.audioStreams || streamData.audioStreams.length === 0) {
      throw new Error("Failed to get audio stream from YouTube");
    }

    const audioStream = streamData.audioStreams.sort((a: any, b: any) => b.bitrate - a.bitrate)[0];
    const streamUrl = audioStream.url;

    const response = await fetch(streamUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch stream: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    
    const contentLength = response.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    if (response.body) {
      const body = Readable.fromWeb(response.body as any);
      body.pipe(res);
    } else {
      res.status(500).send("No body");
    }
  } catch (error: any) {
    console.error("YouTube stream error:", error);
    res.status(500).send(error.message || "Failed to stream YouTube audio");
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }
    const response = await fetch(`https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    const data = await response.json();
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
    if (contentType) res.setHeader("Content-Type", contentType);
    
    const contentLength = response.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

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

export const handler = serverless(app);
