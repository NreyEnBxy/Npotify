/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Home, 
  Search, 
  Music,
  Loader2,
  CheckCircle2,
  Smartphone,
  ChevronDown,
  SkipBack,
  SkipForward,
  MoreHorizontal,
  Heart,
  Shuffle,
  Repeat,
  Circle,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- CONFIGURATION ---
// You can set this in your environment variables as VITE_GOOGLE_SHEET_ID
const GOOGLE_SHEET_ID = (import.meta as any).env?.VITE_GOOGLE_SHEET_ID || '1t9EOXyRMcyX-bzkHCO_wr4HNmSmSm3VJoQNDsEIJcBU'; 
// ---------------------

// --- HELPERS ---
const formatAudioUrl = (url: string) => {
  if (!url) return "";
  
  // Handle Google Drive links
  if (url.includes('drive.google.com')) {
    const fileIdMatch = url.match(/\/d\/([^/]+)/) || url.match(/id=([^&]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
    }
  }
  
  // Handle Dropbox links
  if (url.includes('dropbox.com')) {
    return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '').replace('&dl=0', '');
  }

  return url;
};

interface Song {
  id: number;
  title: string;
  artist: string;
  cover: string;
  url: string;
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSongIndex, setCurrentSongIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeFilter, setActiveFilter] = useState('All');
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'premium'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [showPremiumFrame, setShowPremiumFrame] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchSongs = async () => {
      try {
        if (GOOGLE_SHEET_ID.includes('U_U_U')) {
          const mockSongs: Song[] = [
            { id: 0, title: "Midnight City", artist: "M83", cover: "https://picsum.photos/seed/m83/400/400", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
            { id: 1, title: "Starboy", artist: "The Weeknd", cover: "https://picsum.photos/seed/weeknd/400/400", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
            { id: 2, title: "Blinding Lights", artist: "The Weeknd", cover: "https://picsum.photos/seed/blinding/400/400", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
            { id: 3, title: "Levitating", artist: "Dua Lipa", cover: "https://picsum.photos/seed/dua/400/400", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
            { id: 4, title: "Save Your Tears", artist: "The Weeknd", cover: "https://picsum.photos/seed/tears/400/400", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3" },
            { id: 5, title: "After Hours", artist: "The Weeknd", cover: "https://picsum.photos/seed/after/400/400", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" },
            { id: 6, title: "One Dance", artist: "Drake", cover: "https://picsum.photos/seed/drake/400/400", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3" },
            { id: 7, title: "Shape of You", artist: "Ed Sheeran", cover: "https://picsum.photos/seed/ed/400/400", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3" }
          ];
          setSongs(mockSongs);
          setLoading(false);
          return;
        }
        const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json`;
        const response = await fetch(url);
        const text = await response.text();
        const json = JSON.parse(text.substring(47, text.length - 2));
        const fetchedSongs: Song[] = json.table.rows.map((row: any, index: number) => ({
          id: index,
          title: row.c[0]?.v || "Unknown Title",
          artist: row.c[1]?.v || "Unknown Artist",
          cover: row.c[2]?.v || "https://picsum.photos/seed/music/400/400",
          url: formatAudioUrl(row.c[3]?.v || "")
        })).filter((s: Song) => s.url !== "");
        setSongs(fetchedSongs);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching songs:", error);
        setLoading(false);
      }
    };
    if (!showSplash) fetchSongs();
  }, [showSplash]);

  useEffect(() => {
    const audio = audioRef.current;
    if (currentSongIndex !== null && audio && songs[currentSongIndex]) {
      const newSrc = songs[currentSongIndex].url;
      
      // Only update src if it's different to prevent interrupting current load
      if (audio.src !== newSrc) {
        audio.src = newSrc;
      }
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          // Ignore AbortError caused by rapid navigation/interruption
          if (error.name !== 'AbortError') {
            console.error("Playback failed:", error);
          }
        });
      }
      setIsPlaying(true);
    }
  }, [currentSongIndex, songs]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || currentSongIndex === null) return;
    
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          if (error.name !== 'AbortError') {
            console.error("Playback failed:", error);
          }
        });
      }
      setIsPlaying(true);
    }
  };

  const playSong = (index: number) => {
    if (currentSongIndex === index) {
      togglePlay();
    } else {
      setCurrentSongIndex(index);
    }
  };

  const nextSong = () => {
    if (currentSongIndex !== null) {
      if (isShuffle) {
        let nextIndex;
        do {
          nextIndex = Math.floor(Math.random() * songs.length);
        } while (nextIndex === currentSongIndex && songs.length > 1);
        setCurrentSongIndex(nextIndex);
      } else {
        setCurrentSongIndex((currentSongIndex + 1) % songs.length);
      }
    }
  };

  const prevSong = () => {
    if (currentSongIndex !== null) {
      if (isShuffle) {
        let prevIndex;
        do {
          prevIndex = Math.floor(Math.random() * songs.length);
        } while (prevIndex === currentSongIndex && songs.length > 1);
        setCurrentSongIndex(prevIndex);
      } else {
        setCurrentSongIndex((currentSongIndex - 1 + songs.length) % songs.length);
      }
    }
  };

  const toggleShuffle = () => setIsShuffle(!isShuffle);
  const toggleRepeat = () => {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  };

  const currentSong = currentSongIndex !== null ? songs[currentSongIndex] : null;

  const filteredSongs = songs.filter(song => 
    song.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    song.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col bg-spotify-base text-white overflow-hidden font-sans">
      <AnimatePresence>
        {showSplash && (
          <motion.div 
            initial={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-spotify-base"
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}>
              <Music size={60} className="text-spotify-green" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Scrollable Area */}
      <main className={`flex-1 ${activeTab === 'premium' && showPremiumFrame ? 'overflow-hidden' : 'overflow-y-auto pb-40'} scrollbar-hide`}>
        {activeTab === 'home' ? (
          <div className="p-4 pt-6">
            {/* Top Bar */}
            <header className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10">
                <img src="https://picsum.photos/seed/user/100/100" className="w-full h-full object-cover" />
              </div>
              <div className="flex gap-2">
                {['All', 'Music'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      activeFilter === filter 
                        ? 'bg-spotify-green text-black' 
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </header>

            {/* Recent Grid */}
            <section className="grid grid-cols-2 gap-2 mb-8">
              {songs.slice(0, 8).map((song, i) => (
                <div 
                  key={i} 
                  onClick={() => playSong(i)}
                  className="bg-white/10 hover:bg-white/20 transition-colors rounded flex items-center gap-2 overflow-hidden group cursor-pointer h-14"
                >
                  <img 
                    src={song.cover} 
                    className="w-14 h-14 object-cover shrink-0 rounded-md aspect-square" 
                    referrerPolicy="no-referrer" 
                  />
                  <span className="text-xs font-bold truncate pr-2">{song.artist}</span>
                </div>
              ))}
            </section>

            {/* Jump back in */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4 tracking-tight">Jump back in</h2>
              <div className="flex overflow-x-auto gap-4 scrollbar-hide -mx-4 px-4">
                {songs.map((song, i) => (
                  <div key={i} onClick={() => playSong(i)} className="min-w-[160px] max-w-[160px] cursor-pointer group">
                    <div className="relative aspect-square mb-3">
                      <img src={song.cover} className="w-full h-full object-cover rounded-md shadow-lg aspect-square" referrerPolicy="no-referrer" />
                      {i % 3 === 0 && (
                        <div className="absolute top-2 left-2 w-5 h-5 bg-spotify-green rounded-full flex items-center justify-center">
                          <Music size={10} className="text-black" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-bold text-sm truncate">{song.title}</h3>
                    <p className="text-spotify-gray text-xs mt-1 line-clamp-2 leading-tight">
                      Playlist • {song.artist}, {songs[(i+1)%songs.length].artist}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Albums featuring songs you like */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4 tracking-tight">Albums featuring songs you like</h2>
              <div className="flex overflow-x-auto gap-4 scrollbar-hide -mx-4 px-4">
                {songs.slice().reverse().map((song, i) => (
                  <div key={i} onClick={() => playSong(songs.length - 1 - i)} className="min-w-[160px] max-w-[160px] cursor-pointer">
                    <div className="relative aspect-square mb-3">
                      <img src={song.cover} className="w-full h-full object-cover rounded-md shadow-lg aspect-square" referrerPolicy="no-referrer" />
                    </div>
                    <h3 className="font-bold text-sm truncate">{song.title}</h3>
                    <p className="text-spotify-gray text-xs mt-1">Album • {song.artist}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : activeTab === 'search' ? (
          <div className="p-4 pt-6">
            <h2 className="text-3xl font-bold mb-6 tracking-tight">Search</h2>
            <div className="relative mb-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/60" size={20} />
              <input 
                type="text" 
                placeholder="What do you want to listen to?" 
                className="w-full bg-white py-3 pl-10 pr-4 rounded-md text-black font-medium focus:outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {searchQuery ? (
              <div className="space-y-4">
                {filteredSongs.length > 0 ? (
                  filteredSongs.map((song) => (
                    <div 
                      key={song.id} 
                      onClick={() => playSong(song.id)}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <img src={song.cover} className="w-12 h-12 rounded object-cover aspect-square" referrerPolicy="no-referrer" />
                      <div className="flex flex-col min-w-0">
                        <span className={`text-sm font-medium truncate ${currentSongIndex === song.id ? 'text-spotify-green' : 'text-white'}`}>
                          {song.title}
                        </span>
                        <span className="text-xs text-spotify-gray truncate">{song.artist}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20">
                    <p className="text-spotify-gray">No results found for "{searchQuery}"</p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h3 className="text-base font-bold mb-4">Browse all</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { name: 'Podcasts', color: 'bg-[#E13300]' },
                    { name: 'Live Events', color: 'bg-[#7358FF]' },
                    { name: 'Made For You', color: 'bg-[#1E3264]' },
                    { name: 'New Releases', color: 'bg-[#E8115B]' },
                    { name: 'Hindi', color: 'bg-[#608108]' },
                    { name: 'Punjabi', color: 'bg-[#B02897]' },
                    { name: 'Tamil', color: 'bg-[#A56752]' },
                    { name: 'Telugu', color: 'bg-[#D84000]' },
                  ].map((cat, i) => (
                    <div key={i} className={`${cat.color} aspect-[1.6/1] rounded-lg p-3 relative overflow-hidden cursor-pointer`}>
                      <span className="font-bold text-lg leading-tight">{cat.name}</span>
                      <div className="absolute -right-4 -bottom-2 w-20 h-20 rotate-[25deg] shadow-xl">
                        <img src={`https://picsum.photos/seed/${cat.name}/100/100`} className="w-full h-full object-cover rounded" referrerPolicy="no-referrer" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {!showPremiumFrame ? (
              <div className="p-4 pt-20 text-center flex-1">
                <Music size={60} className="mx-auto mb-4 text-spotify-green" />
                <h2 className="text-2xl font-bold mb-2">Spotify Premium</h2>
                <p className="text-spotify-gray mb-6">Apni amader donation korle ei taka Tula-chashi der kache jabe</p>
                <button 
                  onClick={() => setShowPremiumFrame(true)}
                  className="bg-white text-black font-bold py-3 px-8 rounded-full hover:scale-105 transition-transform"
                >
                  GET PREMIUM
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col bg-black">
                <div className="p-4 flex items-center gap-4 border-b border-white/10">
                  <button 
                    onClick={() => setShowPremiumFrame(false)}
                    className="text-white hover:text-spotify-green transition-colors"
                  >
                    <ArrowLeft size={24} />
                  </button>
                  <span className="font-bold">Premium Donation</span>
                </div>
                <iframe 
                  src="https://www.supportkori.com/nuet" 
                  className="w-full flex-1 border-none bg-white"
                  title="Premium Donation"
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
                  loading="lazy"
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Player & Nav Container */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-2 pb-2 pointer-events-none">
        {/* Floating Player */}
        <AnimatePresence>
          {currentSong && !isPlayerExpanded && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-[#282828] rounded-lg p-2 flex items-center justify-between shadow-2xl pointer-events-auto mb-2"
              onClick={() => setIsPlayerExpanded(true)}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <img src={currentSong.cover} className="w-10 h-10 rounded object-cover aspect-square" referrerPolicy="no-referrer" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold truncate">{currentSong.title}</span>
                  <span className="text-[10px] text-spotify-gray truncate">{currentSong.artist}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 px-2">
                <Smartphone size={20} className="text-spotify-green" />
                <CheckCircle2 size={20} className="text-spotify-green fill-spotify-green text-black" />
                <button 
                  className="text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                >
                  {isPlaying ? <Pause size={24} className="fill-current" /> : <Play size={24} className="fill-current" />}
                </button>
              </div>
              {/* Mini Progress Bar */}
              <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white transition-all duration-300" 
                  style={{ width: `${(progress / duration) * 100 || 0}%` }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Full Screen Player */}
        <AnimatePresence>
          {currentSong && isPlayerExpanded && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-0 z-50 bg-gradient-to-b from-[#5c5c5c] to-black p-6 flex flex-col pointer-events-auto"
            >
              <header className="flex items-center justify-between mb-10">
                <button onClick={() => setIsPlayerExpanded(false)} className="text-white">
                  <ChevronDown size={32} />
                </button>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-white/80">Playing from playlist</span>
                  <span className="text-xs font-bold">Jump back in</span>
                </div>
                <button className="text-white">
                  <MoreHorizontal size={24} />
                </button>
              </header>

              <div className="flex-1 flex flex-col justify-center">
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    onDragEnd={(_, info) => {
                      if (info.offset.x > 100) {
                        prevSong();
                      } else if (info.offset.x < -100) {
                        nextSong();
                      }
                    }}
                    whileDrag={{ scale: 0.95 }}
                    className="aspect-square w-full mb-12 shadow-2xl cursor-grab active:cursor-grabbing overflow-hidden rounded-lg"
                  >
                    <img src={currentSong.cover} className="w-full h-full object-cover pointer-events-none aspect-square" referrerPolicy="no-referrer" />
                  </motion.div>

                <div className="flex items-center justify-between mb-8">
                  <div className="flex flex-col min-w-0">
                    <h2 className="text-2xl font-bold truncate">{currentSong.title}</h2>
                    <p className="text-spotify-gray text-lg truncate">{currentSong.artist}</p>
                  </div>
                  <button className="text-spotify-green">
                    <Heart size={28} className="fill-current" />
                  </button>
                </div>

                <div className="space-y-2 mb-8">
                  <div className="relative h-1 w-full group">
                    <input 
                      type="range"
                      min={0}
                      max={duration || 0}
                      value={progress}
                      onChange={handleSeek}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="absolute inset-0 bg-white/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-white group-hover:bg-spotify-green transition-colors"
                        style={{ width: `${(progress / duration) * 100 || 0}%` }}
                      />
                    </div>
                    <div 
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ left: `${(progress / duration) * 100 || 0}%`, marginLeft: '-6px' }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-spotify-gray font-medium">
                    <span>{formatTime(progress)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between px-2">
                  <button 
                    onClick={toggleShuffle}
                    className={`${isShuffle ? 'text-spotify-green' : 'text-spotify-gray'} transition-colors`}
                  >
                    <Shuffle size={24} />
                  </button>
                  <button onClick={prevSong} className="text-white">
                    <SkipBack size={36} className="fill-current" />
                  </button>
                  <button 
                    onClick={togglePlay}
                    className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 transition-transform"
                  >
                    {isPlaying ? <Pause size={32} className="fill-current" /> : <Play size={32} className="fill-current ml-1" />}
                  </button>
                  <button onClick={nextSong} className="text-white">
                    <SkipForward size={36} className="fill-current" />
                  </button>
                  <button 
                    onClick={toggleRepeat}
                    className={`${repeatMode !== 'off' ? 'text-spotify-green' : 'text-spotify-gray'} transition-colors relative`}
                  >
                    {repeatMode === 'one' ? (
                      <div className="relative">
                        <Repeat size={24} />
                        <span className="absolute -top-1 -right-1 bg-spotify-green text-black text-[8px] font-bold w-3 h-3 rounded-full flex items-center justify-center">1</span>
                      </div>
                    ) : (
                      <Repeat size={24} />
                    )}
                  </button>
                </div>
              </div>

              <footer className="mt-8 flex items-center justify-between">
                <Smartphone size={20} className="text-spotify-green" />
                <div className="flex items-center gap-6">
                  <Music size={20} className="text-white" />
                  <MoreHorizontal size={20} className="text-white" />
                </div>
              </footer>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Navigation */}
        <nav className="bg-black/90 backdrop-blur-md rounded-2xl flex items-center justify-around py-3 pointer-events-auto border border-white/5">
          <button 
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'home' ? 'text-white scale-110' : 'text-spotify-gray hover:text-white'}`}
          >
            <Home 
              size={24} 
              strokeWidth={activeTab === 'home' ? 3 : 2}
            />
            <span className={`text-[10px] ${activeTab === 'home' ? 'font-bold' : 'font-medium'}`}>Home</span>
          </button>
          <button 
            onClick={() => setActiveTab('search')}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'search' ? 'text-white scale-110' : 'text-spotify-gray hover:text-white'}`}
          >
            <Search 
              size={24} 
              strokeWidth={activeTab === 'search' ? 3 : 2}
            />
            <span className={`text-[10px] ${activeTab === 'search' ? 'font-bold' : 'font-medium'}`}>Search</span>
          </button>
          <button 
            onClick={() => setActiveTab('premium')}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'premium' ? 'text-white scale-110' : 'text-spotify-gray hover:text-white'}`}
          >
            <Music 
              size={24} 
              strokeWidth={activeTab === 'premium' ? 3 : 2}
            />
            <span className={`text-[10px] ${activeTab === 'premium' ? 'font-bold' : 'font-medium'}`}>Premium</span>
          </button>
        </nav>
      </div>

      <audio 
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setProgress(audioRef.current.currentTime);
            setDuration(audioRef.current.duration || 0);
          }
        }}
        onError={(e) => {
          console.error("Audio playback error:", e);
          // You could add a state here to show a toast or error message in the UI
        }}
        onEnded={() => {
          if (repeatMode === 'one') {
            const audio = audioRef.current;
            if (audio) {
              audio.currentTime = 0;
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                playPromise.catch(error => {
                  if (error.name !== 'AbortError') {
                    console.error("Playback failed:", error);
                  }
                });
              }
            }
          } else {
            nextSong();
          }
        }}
      />

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
