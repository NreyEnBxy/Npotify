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
  try {
    // Clean up title and artist (remove (feat. ...), [Official Video], etc.)
    const cleanTitle = title.replace(/\(feat\..*?\)|\[.*?\]|\(.*?Video.*?\)/gi, '').trim();
    const cleanArtist = artist.replace(/\(feat\..*?\)|\[.*?\]/gi, '').trim();
    
    // Search for the track on LRCLIB
    const query = encodeURIComponent(`${cleanTitle} ${cleanArtist}`);
    const response = await fetch(`https://lrclib.net/api/search?q=${query}`);
    
    if (!response.ok) return null;
    
    const results: LrcLibResponse[] = await response.json();
    
    // Find the best match (prefer synced lyrics)
    const syncedMatch = results.find(r => r.syncedLyrics);
    if (syncedMatch) return syncedMatch.syncedLyrics;
    
    const plainMatch = results.find(r => r.plainLyrics);
    return plainMatch ? plainMatch.plainLyrics : null;
  } catch (error) {
    console.error("Error fetching lyrics from LRCLIB:", error);
    return null;
  }
};
