import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import dotenv from "dotenv";
import ytdl from "@distube/ytdl-core";
import * as saavn from "saavnapi";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // JioSaavn Search API
  app.get("/api/saavn/search", async (req, res) => {
    try {
      const query = req.query.query as string;
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }
      
      // Use saavnapi to search
      // saavnapi exposes searchSongs, but let's wrap it in try catch and handle potential different exports
      let results;
      try {
        if (typeof saavn.searchSongs === 'function') {
           results = await saavn.searchSongs(query);
        } else if (saavn.default && typeof saavn.default.searchSongs === 'function') {
           results = await saavn.default.searchSongs(query);
        } else {
           // fallback to direct API call if package acts weird
           const url = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${encodeURIComponent(query)}&_format=json&_marker=0&ctx=web6dot0`;
           const response = await fetch(url);
           const data = await response.json();
           results = { data: { results: data.songs?.data || [] } };
        }
      } catch (err) {
        console.error("Saavnapi error:", err);
        const url = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${encodeURIComponent(query)}&_format=json&_marker=0&ctx=web6dot0`;
        const response = await fetch(url);
        const data = await response.json();
        results = { data: { results: data.songs?.data || [] } };
      }

      // Format for frontend
      const formattedSongs = (results.data?.results || results.data || []).map((song: any) => {
        // Handle different saavnapi response formats vs autocomplete.get
        const id = song.id || song.song?.id;
        const title = song.name || song.title || "Unknown Title";
        const artist = song.primaryArtists || song.description || song.subtitle || "Unknown Artist";
        let cover = "https://picsum.photos/seed/music/400/400";
        if (song.image && Array.isArray(song.image)) {
           cover = song.image[song.image.length - 1]?.url || song.image[song.image.length - 1]?.link || cover;
        } else if (typeof song.image === 'string') {
           cover = song.image.replace('150x150', '500x500');
        }

        let url = "";
        if (song.downloadUrl && Array.isArray(song.downloadUrl)) {
          url = song.downloadUrl[song.downloadUrl.length - 1]?.url || song.downloadUrl[song.downloadUrl.length - 1]?.link || "";
        } else if (song.media_url) {
          url = song.media_url;
        }

        return {
          id: id || Math.random().toString(),
          title: title.replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
          artist: artist.replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
          cover: cover,
          url: url || `/api/saavn/song?id=${id}`, // Fallback url if not direct
          isApiSong: true
        };
      });

      res.json(formattedSongs);
    } catch (error: any) {
      console.error("JioSaavn proxy error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get single song details (to get media url)
  app.get("/api/saavn/song", async (req, res) => {
    try {
      const id = req.query.id as string;
      if (!id) return res.status(400).send("ID required");

      let songUrl = "";
      try {
        if (typeof saavn.getSongDetails === 'function') {
           const details = await saavn.getSongDetails(id);
           if (details.data && details.data[0] && details.data[0].downloadUrl) {
              songUrl = details.data[0].downloadUrl[details.data[0].downloadUrl.length - 1]?.url || details.data[0].downloadUrl[details.data[0].downloadUrl.length - 1]?.link;
           }
        }
      } catch (err) {}

      if (!songUrl) {
         // Direct fetch to jiosaavn song details API as fallback
         const response = await fetch(`https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${id}&_format=json&_marker=0&ctx=web6dot0`);
         const data = await response.json();
         const songData = data[id];
         if (songData && songData.encrypted_media_url) {
           // Provide proxy to a public decrypter if available, or just stream it directly
           // In this fallback without crypto-js, we redirect to a public decrypter api if needed
           // For now, redirecting to Youtube proxy since decryption is hard in plain server.ts
           songUrl = `/api/stream?url=https://www.youtube.com/results?search_query=${encodeURIComponent(songData.song + " " + songData.primary_artists)}`;
         }
      }

      if (songUrl) {
         res.redirect(songUrl);
      } else {
         res.status(404).send("Song URL not found");
      }
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  });

  // YouTube Audio Stream Proxy
  app.get("/api/stream", async (req, res) => {
    try {
      let videoUrl = req.query.url as string;
      if (!videoUrl) {
        return res.status(400).send("URL is required");
      }

      // If it's just a video ID, convert it to a full URL
      if (!videoUrl.includes('http') && videoUrl.length === 11) {
        videoUrl = `https://www.youtube.com/watch?v=${videoUrl}`;
      }

      const commonHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com',
        'Sec-Ch-Ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      };

      // If it's a YouTube link
      if (ytdl.validateURL(videoUrl)) {
        try {
          // Get video info first to get direct stream URL
          let info;
          let retries = 2;
          while (retries > 0) {
            try {
              info = await ytdl.getInfo(videoUrl, {
                requestOptions: { headers: commonHeaders }
              });
              break;
            } catch (err: any) {
              retries--;
              if (retries === 0 || !err.message?.includes('429')) throw err;
              // Wait a bit before retrying on 429
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          if (!info) {
            throw new Error("Failed to get video info");
          }

          if (info.videoDetails.isLiveContent) {
            throw new Error("Live videos are not supported");
          }
          
          const format = ytdl.chooseFormat(info.formats, { 
            quality: 'highestaudio', 
            filter: 'audioonly' 
          });

          if (!format || !format.url) {
            throw new Error("No suitable audio format found");
          }

          // Set headers for the client
          const mimeType = format.mimeType?.split(';')[0] || 'audio/mpeg';
          res.setHeader('Content-Type', mimeType);
          res.setHeader('Accept-Ranges', 'bytes');
          if (format.contentLength) {
            res.setHeader('Content-Length', format.contentLength);
          }

          // Stream the direct URL using ytdl's internal downloader
          const stream = ytdl.downloadFromInfo(info, { 
            format,
            highWaterMark: 1 << 25, // 32MB buffer for fast start
            requestOptions: { headers: commonHeaders }
          });

          stream.pipe(res);

          stream.on('error', (err: any) => {
            console.error("YTDL Stream error:", err);
            if (!res.headersSent) {
              res.status(500).send("Failed to stream audio: " + err.message);
            } else {
              res.end();
            }
          });
        } catch (err: any) {
          console.error("YTDL Setup error:", err);
          if (err.message?.includes('429')) {
            console.error("YouTube is rate-limiting this IP (429).");
            if (!res.headersSent) {
              return res.status(429).send("YouTube is rate-limiting the server. Please try again later.");
            }
          }
          if (!res.headersSent) {
            res.status(500).send("Failed to initialize stream: " + err.message);
          }
        }
      } else {
        // For other links (Google Drive, Dropbox, direct links), stream them
        let finalUrl = videoUrl;
        
        if (finalUrl.includes('drive.google.com')) {
          const fileIdMatch = finalUrl.match(/\/d\/([^/]+)/) || finalUrl.match(/id=([^&]+)/);
          if (fileIdMatch && fileIdMatch[1]) {
            finalUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
          }
        }
        
        if (finalUrl.includes('dropbox.com')) {
          finalUrl = finalUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '').replace('&dl=0', '');
        }

        const response = await fetch(finalUrl, { headers: commonHeaders });
        if (!response.ok) {
          throw new Error(`Failed to fetch source: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);
        
        const contentLength = response.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        
        res.setHeader('Accept-Ranges', 'bytes');

        if (response.body) {
          const reader = response.body.getReader();
          const stream = new Readable({
            async read() {
              const { done, value } = await reader.read();
              if (done) {
                this.push(null);
              } else {
                this.push(Buffer.from(value));
              }
            }
          });
          stream.pipe(res);
        } else {
          res.status(500).send("No body in response");
        }
      }
    } catch (error: any) {
      console.error("Stream error:", error);
      if (!res.headersSent) {
        res.status(500).send(error.message || "Failed to stream audio");
      }
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
