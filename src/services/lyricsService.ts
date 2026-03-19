export interface LrcLibResponse {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string;
  syncedLyrics: string;
}

export const fetchSyncedLyrics = async (title: string, artist: string): Promise<string | null> => {
  const isReelOrShort = (t: string, a: string) => {
    const noise = /\b(shorts|reels|tiktok|meme|clip|funny|viral|status|whatsapp|instagram|edit|ambatukam|epstein|pedophile|meetup)\b/gi;
    return noise.test(t) || noise.test(a) || t.includes('#');
  };

  if (isReelOrShort(title, artist)) {
    // Silently skip for reels/shorts as requested
    return null;
  }

  const cleanString = (str: string, isTitle: boolean = false) => {
    if (!str) return '';
    const lowerStr = str.toLowerCase();
    if (lowerStr === 'unknown artist' || lowerStr === 'various artists') return '';
    
    let cleaned = str
      .replace(/\(feat\..*?\)|\[.*?\]|\(.*?Video.*?\)/gi, '')
      .replace(/\b(feat|ft|featuring|with|prod|by|presents|presents:|feat:|feat\.)\b.*$/gi, '')
      .replace(/#\w+/g, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F3FB}-\u{1F3FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '')
      .replace(/\b(dj song|remix|official|video|lyrics|audio|hd|4k|shorts|reels|edit|remake|cover|version|instrumental|karaoke|superhit|bhojpuri|new|latest|video|song|full|hd|4k|1080p|720p|360p|240p|144p|mp3|mp4|wav|flac|aac|ogg|m4a|wma|alac|opus|dsd|dsf|dff|dts|ac3|eac3|truehd|atmos|dolby|surround|5.1|7.1|stereo|mono|hi-res|high|resolution|quality|bitrate|kbps|mbps|gbps|tbps|pbps|ebps|zbps|ybps|hz|khz|mhz|ghz|thz|phz|ehz|zhz|yhz|db|dbfs|dbu|dbv|dbm|dbw|dbk|dba|dbc|dbz|dbj|dbq|dbr|dbs|dbt|dbu|dbv|dbw|dbx|dby|dbz|ka naya|ka naya superhit|ka naya video|ka naya bhojpuri video)\b/gi, '')
      .replace(/[^\w\s\u0980-\u09FF\u0900-\u097F]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Normalization: common spelling variations
    cleaned = cleaned
      .replace(/\braat\b/gi, 'rat')
      .replace(/\braat\b/gi, 'rat'); // Double check for case sensitivity if needed

    if (isTitle) {
      const words = cleaned.split(' ');
      if (words.length > 8) {
        cleaned = words.slice(0, 6).join(' ');
      }
    }

    return cleaned;
  };

  const cleanArtist = cleanString(artist);
  const titleParts = title.split(/[|:-]/).map(p => cleanString(p, true)).filter(p => p.length > 2);
  
  const searchQueries: string[] = [];
  
  if (artist && artist.toLowerCase() !== 'unknown artist') {
    searchQueries.push(`${title} ${artist}`);
  }
  searchQueries.push(title);

  titleParts.forEach(part => {
    if (cleanArtist) {
      searchQueries.push(`${part} ${cleanArtist}`);
      searchQueries.push(`${cleanArtist} ${part}`);
    }
    searchQueries.push(part);
    const words = part.split(' ');
    if (words.length > 3) {
      searchQueries.push(words.slice(0, 3).join(' '));
    }
  });

  const uniqueQueries = Array.from(new Set(searchQueries))
    .map(q => q.trim())
    .filter(q => q.length > 2);

  const extractLyrics = (results: any[]): string | null => {
    if (!Array.isArray(results) || results.length === 0) return null;
    
    // Strict check: Only accept if it looks like a "real" song (has an album or artist match)
    // This helps filter out user-uploaded noise that might be on lrclib but isn't "Spotify-like"
    const bestMatch = results.find(r => 
      r.syncedLyrics && 
      r.albumName && 
      r.albumName.toLowerCase() !== 'unknown album'
    ) || results.find(r => r.syncedLyrics);

    if (bestMatch) return bestMatch.syncedLyrics;
    
    const plainMatch = results.find(r => r.plainLyrics && r.albumName);
    return plainMatch ? plainMatch.plainLyrics : null;
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  for (const query of uniqueQueries) {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://lrclib.net/api/search?q=${encodedQuery}`;

    // Direct Fetch
    try {
      const response = await fetch(url);
      if (response.ok) {
        const results = await response.json();
        const lyrics = extractLyrics(results);
        if (lyrics) {
          console.log(`Lyrics found for query: "${query}"`);
          return lyrics;
        }
      }
    } catch (e) {
      console.warn(`Direct fetch failed for "${query}"`);
    }

    await sleep(150);

    // Proxy 1: corsproxy.io
    try {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (response.ok) {
        const results = await response.json();
        const lyrics = extractLyrics(results);
        if (lyrics) {
          console.log(`Lyrics found via Proxy 1 for: "${query}"`);
          return lyrics;
        }
      }
    } catch (e) {
      console.warn(`Proxy 1 failed for "${query}"`);
    }

    await sleep(150);

    // Proxy 2: allorigins.win
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (response.ok) {
        const data = await response.json();
        const results = JSON.parse(data.contents);
        const lyrics = extractLyrics(results);
        if (lyrics) {
          console.log(`Lyrics found via Proxy 2 for: "${query}"`);
          return lyrics;
        }
      }
    } catch (e) {
      console.warn(`Proxy 2 failed for "${query}"`);
    }
  }

  console.debug(`Lyrics not found for: "${title}" by "${artist}". Tried ${uniqueQueries.length} queries.`);
  return null;
};
