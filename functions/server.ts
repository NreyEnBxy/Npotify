import express from "express";
import serverless from "serverless-http";
import { Readable } from "stream";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// API routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Spotify Auth Token Helper
let spotifyToken = "";
let tokenExpiry = 0;

async function getSpotifyToken() {
  if (spotifyToken && Date.now() < tokenExpiry) {
    return spotifyToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const errorMsg = "Spotify Client ID or Secret missing. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in the environment.";
    console.warn(errorMsg);
    return { error: errorMsg };
  }

  try {
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${authHeader}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Spotify token (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;
    spotifyToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return spotifyToken;
  } catch (error: any) {
    console.error("Error getting Spotify token:", error);
    return { error: error.message || "Failed to authenticate with Spotify" };
  }
}

// Spotify Search API
app.get("/api/spotify/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    const tokenOrError = await getSpotifyToken();
    if (typeof tokenOrError === 'object' && tokenOrError.error) {
      return res.status(500).json({ error: tokenOrError.error });
    }
    const token = tokenOrError as string;

    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const results = data.tracks.items.map((track: any) => ({
      id: track.id,
      title: track.name,
      artist: track.artists.map((a: any) => a.name).join(", "),
      cover: track.album.images[0]?.url || "https://picsum.photos/seed/music/400/400",
      url: track.preview_url || "", // Spotify only provides 30s previews via API
      duration: Math.floor(track.duration_ms / 1000),
      isSpotify: true,
      externalUrl: track.external_urls.spotify
    }));

    res.json({ results });
  } catch (error: any) {
    console.error("Spotify search error:", error);
    res.status(500).json({ error: error.message || "Failed to search Spotify" });
  }
});

export const handler = serverless(app);
