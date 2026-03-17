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
  ArrowLeft,
  Download,
  Camera,
  X
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

interface User {
  name: string;
  email: string;
  password?: string;
  profilePic?: string;
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
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'premium' | 'library'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [showPremiumFrame, setShowPremiumFrame] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // Auth States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [likedSongIds, setLikedSongIds] = useState<number[]>([]);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', password: '', profilePic: '' });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load user and likes from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('spotify_user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      setCurrentUser(user);
      
      const savedLikes = localStorage.getItem(`spotify_likes_${user.email}`);
      if (savedLikes) {
        setLikedSongIds(JSON.parse(savedLikes));
      }
    }
  }, []);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'signup') {
      if (!authForm.name || !authForm.email || !authForm.password) {
        alert("Please fill all fields");
        return;
      }
      const users = JSON.parse(localStorage.getItem('spotify_all_users') || '[]');
      if (users.find((u: User) => u.email === authForm.email)) {
        alert("User already exists");
        return;
      }
      const newUser = { 
        name: authForm.name, 
        email: authForm.email, 
        password: authForm.password,
        profilePic: "https://files.catbox.moe/uxcbs7.jpeg" // Default PFP
      };
      users.push(newUser);
      localStorage.setItem('spotify_all_users', JSON.stringify(users));
      localStorage.setItem('spotify_user', JSON.stringify({ 
        name: newUser.name, 
        email: newUser.email, 
        profilePic: newUser.profilePic 
      }));
      setCurrentUser({ name: newUser.name, email: newUser.email, profilePic: newUser.profilePic });
      setShowAuthModal(false);
    } else {
      const users = JSON.parse(localStorage.getItem('spotify_all_users') || '[]');
      const user = users.find((u: User) => u.email === authForm.email && u.password === authForm.password);
      if (user) {
        localStorage.setItem('spotify_user', JSON.stringify({ 
          name: user.name, 
          email: user.email, 
          profilePic: user.profilePic || "https://files.catbox.moe/uxcbs7.jpeg" 
        }));
        setCurrentUser({ 
          name: user.name, 
          email: user.email, 
          profilePic: user.profilePic || "https://files.catbox.moe/uxcbs7.jpeg" 
        });
        
        const savedLikes = localStorage.getItem(`spotify_likes_${user.email}`);
        if (savedLikes) {
          setLikedSongIds(JSON.parse(savedLikes));
        } else {
          setLikedSongIds([]);
        }
        setShowAuthModal(false);
      } else {
        alert("Invalid email or password");
      }
    }
  };

  const handleUpdateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const users = JSON.parse(localStorage.getItem('spotify_all_users') || '[]');
    const userIndex = users.findIndex((u: User) => u.email === currentUser.email);

    if (userIndex !== -1) {
      const updatedUser = { 
        ...users[userIndex], 
        name: accountForm.name || users[userIndex].name,
        profilePic: accountForm.profilePic || users[userIndex].profilePic
      };
      
      if (accountForm.password) {
        updatedUser.password = accountForm.password;
      }

      users[userIndex] = updatedUser;
      localStorage.setItem('spotify_all_users', JSON.stringify(users));
      
      const sessionUser = { 
        name: updatedUser.name, 
        email: updatedUser.email, 
        profilePic: updatedUser.profilePic 
      };
      localStorage.setItem('spotify_user', JSON.stringify(sessionUser));
      setCurrentUser(sessionUser);
      setShowAccountSettings(false);
      alert("Account updated successfully!");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAccountForm({ ...accountForm, profilePic: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('spotify_user');
    setCurrentUser(null);
    setLikedSongIds([]);
    setIsSidebarOpen(false);
  };

  const toggleLike = (songId: number) => {
    if (!currentUser) {
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }

    const newLikes = likedSongIds.includes(songId)
      ? likedSongIds.filter(id => id !== songId)
      : [...likedSongIds, songId];
    
    setLikedSongIds(newLikes);
    localStorage.setItem(`spotify_likes_${currentUser.email}`, JSON.stringify(newLikes));
  };

  const downloadSong = async (song: Song) => {
    try {
      const formattedUrl = formatAudioUrl(song.url);
      const response = await fetch(formattedUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${song.title} - ${song.artist}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      setShowDownloadMenu(false);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Download failed. This might be due to CORS restrictions on the source file.");
    }
  };

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

  const SidebarContent = ({ isPersistent = false }: { isPersistent?: boolean }) => (
    <div className="flex flex-col h-full">
      <div 
        className="flex flex-col items-center gap-4 mb-8 text-center cursor-pointer hover:bg-white/5 p-4 rounded-xl transition-colors group"
        onClick={() => {
          if (currentUser) {
            setAccountForm({ name: currentUser.name, password: '', profilePic: currentUser.profilePic || '' });
            setShowAccountSettings(true);
            if (!isPersistent) setIsSidebarOpen(false);
          } else {
            setAuthMode('login');
            setShowAuthModal(true);
            if (!isPersistent) setIsSidebarOpen(false);
          }
        }}
      >
        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-spotify-green shadow-lg shrink-0 relative">
          <img 
            src={currentUser?.profilePic || "https://files.catbox.moe/uxcbs7.jpeg"} 
            className="w-full h-full object-cover" 
            alt="User Profile"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera size={20} className="text-white" />
          </div>
        </div>
        <div className="w-full overflow-hidden">
          <h3 className="font-bold text-xl truncate px-2">{currentUser ? currentUser.name : 'Guest User'}</h3>
          <p className="text-spotify-gray text-sm truncate px-2">{currentUser ? currentUser.email : 'Login to save your data'}</p>
          {currentUser && <span className="text-[10px] text-spotify-green font-bold uppercase tracking-widest mt-1 block">View Account</span>}
        </div>
      </div>

      <nav className="flex-1 space-y-4">
        <button 
          onClick={() => { setActiveTab('home'); if (!isPersistent) setIsSidebarOpen(false); }}
          className={`flex items-center gap-4 w-full text-left font-bold text-lg transition-colors ${activeTab === 'home' ? 'text-spotify-green' : 'hover:text-spotify-green'}`}
        >
          <Home size={24} />
          Home
        </button>
        <button 
          onClick={() => { setActiveTab('library'); if (!isPersistent) setIsSidebarOpen(false); }}
          className={`flex items-center gap-4 w-full text-left font-bold text-lg transition-colors ${activeTab === 'library' ? 'text-spotify-green' : 'hover:text-spotify-green'}`}
        >
          <Heart size={24} />
          Liked Songs
        </button>
        <button 
          onClick={() => { setActiveTab('premium'); if (!isPersistent) setIsSidebarOpen(false); }}
          className={`flex items-center gap-4 w-full text-left font-bold text-lg transition-colors ${activeTab === 'premium' ? 'text-spotify-green' : 'hover:text-spotify-green'}`}
        >
          <Music size={24} />
          Premium
        </button>
      </nav>

      <div className="pt-6 border-t border-white/10">
        {currentUser ? (
          <button 
            onClick={handleLogout}
            className="flex items-center gap-4 w-full text-left font-bold text-lg text-red-500 hover:text-red-400 transition-colors"
          >
            <ArrowLeft size={24} />
            Log Out
          </button>
        ) : (
          <button 
            onClick={() => { setAuthMode('login'); setShowAuthModal(true); if (!isPersistent) setIsSidebarOpen(false); }}
            className="flex items-center gap-4 w-full text-left font-bold text-lg text-spotify-green hover:text-spotify-green/80 transition-colors"
          >
            <CheckCircle2 size={24} />
            Log In / Sign Up
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-spotify-base text-white overflow-hidden font-sans">
      {/* Persistent Sidebar for Desktop */}
      <aside className="hidden lg:flex w-[280px] flex-col bg-black border-r border-white/10 p-6 shrink-0 h-full">
        <SidebarContent isPersistent={true} />
      </aside>
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
            <header className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div 
                  onClick={() => setIsSidebarOpen(true)}
                  className="w-8 h-8 rounded-full overflow-hidden border border-white/10 cursor-pointer hover:scale-105 transition-transform shrink-0 lg:hidden"
                >
                  <img 
                    src={currentUser?.profilePic || "https://files.catbox.moe/uxcbs7.jpeg"} 
                    className="w-full h-full object-cover" 
                    alt="User Profile"
                    referrerPolicy="no-referrer"
                  />
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
              </div>

              {!currentUser && (
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                    className="text-spotify-gray hover:text-white font-bold text-sm transition-colors"
                  >
                    Sign up
                  </button>
                  <button 
                    onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
                    className="bg-white text-black font-bold py-2 px-6 rounded-full text-sm hover:scale-105 transition-transform"
                  >
                    Log in
                  </button>
                </div>
              )}
            </header>

            {/* Recent Grid */}
            <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-4 mb-8">
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
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div 
                  onClick={() => setIsSidebarOpen(true)}
                  className="w-8 h-8 rounded-full overflow-hidden border border-white/10 cursor-pointer hover:scale-105 transition-transform shrink-0 lg:hidden"
                >
                  <img 
                    src={currentUser?.profilePic || "https://files.catbox.moe/uxcbs7.jpeg"} 
                    className="w-full h-full object-cover" 
                    alt="User Profile"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <h2 className="text-3xl font-bold tracking-tight">Search</h2>
              </div>

              {!currentUser && (
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                    className="text-spotify-gray hover:text-white font-bold text-sm transition-colors"
                  >
                    Sign up
                  </button>
                  <button 
                    onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
                    className="bg-white text-black font-bold py-2 px-6 rounded-full text-sm hover:scale-105 transition-transform"
                  >
                    Log in
                  </button>
                </div>
              )}
            </div>
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
        ) : activeTab === 'library' ? (
          <div className="p-4 pt-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div 
                  onClick={() => setIsSidebarOpen(true)}
                  className="w-8 h-8 rounded-full overflow-hidden border border-white/10 cursor-pointer hover:scale-105 transition-transform shrink-0 lg:hidden"
                >
                  <img 
                    src={currentUser?.profilePic || "https://files.catbox.moe/uxcbs7.jpeg"} 
                    className="w-full h-full object-cover" 
                    alt="User Profile"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <h2 className="text-3xl font-bold tracking-tight">Your Library</h2>
              </div>

              {!currentUser && (
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
                    className="text-spotify-gray hover:text-white font-bold text-sm transition-colors"
                  >
                    Sign up
                  </button>
                  <button 
                    onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
                    className="bg-white text-black font-bold py-2 px-6 rounded-full text-sm hover:scale-105 transition-transform"
                  >
                    Log in
                  </button>
                </div>
              )}
            </div>

            {!currentUser ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Heart size={60} className="text-spotify-gray mb-4" />
                <h3 className="text-xl font-bold mb-2">Login to see your library</h3>
                <p className="text-spotify-gray mb-6">Save your favorite songs and access them anytime.</p>
                <button 
                  onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
                  className="bg-white text-black font-bold py-3 px-8 rounded-full hover:scale-105 transition-transform"
                >
                  LOG IN
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4 mb-6 bg-gradient-to-br from-[#450af5] to-[#c4efd9] p-4 rounded-lg">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#450af5] to-[#8e8ee5] flex items-center justify-center rounded shadow-lg">
                    <Heart size={24} className="fill-white text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Liked Songs</h3>
                    <p className="text-sm opacity-80">{likedSongIds.length} songs</p>
                  </div>
                </div>

                {likedSongIds.length > 0 ? (
                  songs.filter(s => likedSongIds.includes(s.id)).map((song) => (
                    <div 
                      key={song.id} 
                      onClick={() => playSong(song.id)}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <img src={song.cover} className="w-12 h-12 rounded object-cover aspect-square" referrerPolicy="no-referrer" />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className={`text-sm font-medium truncate ${currentSongIndex === song.id ? 'text-spotify-green' : 'text-white'}`}>
                          {song.title}
                        </span>
                        <span className="text-xs text-spotify-gray truncate">{song.artist}</span>
                      </div>
                      <Heart 
                        size={18} 
                        className="text-spotify-green fill-current" 
                        onClick={(e) => { e.stopPropagation(); toggleLike(song.id); }}
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20">
                    <p className="text-spotify-gray">You haven't liked any songs yet.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {!showPremiumFrame ? (
              <div className="p-4 pt-6 text-center flex-1 lg:flex lg:flex-col lg:justify-center">
                <div className="flex justify-start mb-10 lg:hidden">
                  <div 
                    onClick={() => setIsSidebarOpen(true)}
                    className="w-8 h-8 rounded-full overflow-hidden border border-white/10 cursor-pointer hover:scale-105 transition-transform shrink-0"
                  >
                    <img 
                      src={currentUser?.profilePic || "https://files.catbox.moe/uxcbs7.jpeg"} 
                      className="w-full h-full object-cover" 
                      alt="User Profile"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
                <Music size={60} className="mx-auto mb-4 text-spotify-green lg:w-24 lg:h-24" />
                <h2 className="text-2xl font-bold mb-2 lg:text-4xl">Spotify Premium</h2>
                <p className="text-spotify-gray mb-6 lg:text-xl lg:max-w-md lg:mx-auto">Apni amader donation korle ei taka Tula-chashi der kache jabe</p>
                <button 
                  onClick={() => setShowPremiumFrame(true)}
                  className="bg-white text-black font-bold py-3 px-8 rounded-full hover:scale-105 transition-transform lg:py-4 lg:px-12 lg:text-lg"
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

      {/* Sidebar / Slidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
            />
            {/* Sidebar Content */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-spotify-base z-[70] shadow-2xl border-r border-white/10 p-6 lg:hidden"
            >
              <SidebarContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAuthModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-spotify-base rounded-2xl p-8 border border-white/10 shadow-2xl"
            >
              <h2 className="text-3xl font-bold mb-6 text-center">
                {authMode === 'login' ? 'Welcome back' : 'Create account'}
              </h2>
              <form onSubmit={handleAuth} className="space-y-4">
                {authMode === 'signup' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-spotify-gray mb-2">Name</label>
                    <input 
                      type="text" 
                      required
                      className="w-full bg-[#333] border-none rounded-md py-3 px-4 focus:ring-2 focus:ring-spotify-green outline-none"
                      value={authForm.name}
                      onChange={(e) => setAuthForm({...authForm, name: e.target.value})}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-spotify-gray mb-2">Email</label>
                  <input 
                    type="email" 
                    required
                    className="w-full bg-[#333] border-none rounded-md py-3 px-4 focus:ring-2 focus:ring-spotify-green outline-none"
                    value={authForm.email}
                    onChange={(e) => setAuthForm({...authForm, email: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-spotify-gray mb-2">Password</label>
                  <input 
                    type="password" 
                    required
                    className="w-full bg-[#333] border-none rounded-md py-3 px-4 focus:ring-2 focus:ring-spotify-green outline-none"
                    value={authForm.password}
                    onChange={(e) => setAuthForm({...authForm, password: e.target.value})}
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-spotify-green text-black font-bold py-4 rounded-full mt-4 hover:scale-105 transition-transform"
                >
                  {authMode === 'login' ? 'LOG IN' : 'SIGN UP'}
                </button>
              </form>
              <p className="mt-6 text-center text-spotify-gray text-sm">
                {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}
                <button 
                  onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  className="ml-2 text-white font-bold hover:underline"
                >
                  {authMode === 'login' ? 'Sign up' : 'Log in'}
                </button>
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Account Settings Modal */}
      <AnimatePresence>
        {showAccountSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAccountSettings(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#181818] w-full max-w-md rounded-2xl p-8 relative z-10 shadow-2xl border border-white/10"
            >
              <button 
                onClick={() => setShowAccountSettings(false)}
                className="absolute top-4 right-4 text-spotify-gray hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
              
              <h2 className="text-2xl font-bold mb-6 text-center">Account Settings</h2>
              
              <form onSubmit={handleUpdateAccount} className="space-y-6">
                {/* Profile Picture Upload */}
                <div className="flex flex-col items-center gap-4 mb-6">
                  <div className="relative group cursor-pointer" onClick={() => document.getElementById('profile-upload')?.click()}>
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-spotify-green shadow-xl relative">
                      <img 
                        src={accountForm.profilePic || currentUser?.profilePic || "https://files.catbox.moe/uxcbs7.jpeg"} 
                        className="w-full h-full object-cover" 
                        alt="Profile Preview"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera size={24} className="text-white" />
                      </div>
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-spotify-green text-black p-1.5 rounded-full shadow-lg">
                      <Camera size={14} />
                    </div>
                  </div>
                  <input 
                    id="profile-upload"
                    type="file" 
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <p className="text-[10px] text-spotify-gray uppercase tracking-widest font-bold">Click to change photo</p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-spotify-gray mb-2">Full Name</label>
                  <input 
                    type="text" 
                    required
                    className="w-full bg-[#333] border-none rounded-md py-3 px-4 focus:ring-2 focus:ring-spotify-green outline-none"
                    value={accountForm.name}
                    onChange={(e) => setAccountForm({...accountForm, name: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-spotify-gray mb-2">Email Address</label>
                  <input 
                    type="email" 
                    disabled
                    className="w-full bg-[#222] border-none rounded-md py-3 px-4 text-spotify-gray cursor-not-allowed outline-none"
                    value={currentUser?.email || ''}
                  />
                  <p className="text-[10px] text-spotify-gray mt-1 italic">Email cannot be changed</p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-spotify-gray mb-2">New Password (optional)</label>
                  <input 
                    type="password" 
                    placeholder="Leave blank to keep current"
                    className="w-full bg-[#333] border-none rounded-md py-3 px-4 focus:ring-2 focus:ring-spotify-green outline-none"
                    value={accountForm.password}
                    onChange={(e) => setAccountForm({...accountForm, password: e.target.value})}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowAccountSettings(false)}
                    className="flex-1 bg-transparent border border-white/20 text-white font-bold py-3 rounded-full hover:bg-white/5 transition-colors"
                  >
                    CANCEL
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-spotify-green text-black font-bold py-3 rounded-full hover:scale-105 transition-transform"
                  >
                    SAVE CHANGES
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Player & Nav Container */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-2 pb-2 pointer-events-none lg:left-[280px]">
        {/* Floating Player */}
        <AnimatePresence>
          {currentSong && !isPlayerExpanded && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-[#282828] rounded-lg p-2 flex items-center justify-between shadow-2xl pointer-events-auto mb-2 lg:mb-4 lg:mx-4"
              onClick={() => setIsPlayerExpanded(true)}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <img src={currentSong.cover} className="w-10 h-10 lg:w-14 lg:h-14 rounded object-cover aspect-square" referrerPolicy="no-referrer" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs lg:text-sm font-bold truncate">{currentSong.title}</span>
                  <span className="text-[10px] lg:text-xs text-spotify-gray truncate">{currentSong.artist}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 px-2">
                <div className="hidden lg:flex items-center gap-6 mr-4">
                  <button onClick={(e) => { e.stopPropagation(); prevSong(); }} className="text-spotify-gray hover:text-white transition-colors">
                    <SkipBack size={24} />
                  </button>
                  <button 
                    className="bg-white text-black rounded-full p-2 hover:scale-105 transition-transform"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlay();
                    }}
                  >
                    {isPlaying ? <Pause size={24} className="fill-current" /> : <Play size={24} className="fill-current" />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); nextSong(); }} className="text-spotify-gray hover:text-white transition-colors">
                    <SkipForward size={24} />
                  </button>
                </div>
                <div className="lg:hidden">
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
                <Smartphone size={20} className="text-spotify-green hidden md:block" />
                <CheckCircle2 size={20} className="text-spotify-green fill-spotify-green text-black" />
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
                <div className="relative">
                  <button 
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)} 
                    className="text-white p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <MoreHorizontal size={24} />
                  </button>
                  <AnimatePresence>
                    {showDownloadMenu && (
                      <>
                        <div 
                          className="fixed inset-0 z-[55]" 
                          onClick={() => setShowDownloadMenu(false)} 
                        />
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 10 }}
                          className="absolute right-0 top-12 bg-[#282828] min-w-[200px] rounded-md shadow-2xl z-[60] overflow-hidden border border-white/10"
                        >
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (currentSong) downloadSong(currentSong);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-white/10 transition-colors text-left"
                          >
                            <Download size={20} className="text-spotify-green" />
                            <span className="text-sm font-bold text-white">Download this song</span>
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
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
                  <button 
                    onClick={() => toggleLike(currentSong.id)}
                    className={`${likedSongIds.includes(currentSong.id) ? 'text-spotify-green' : 'text-white'} transition-colors`}
                  >
                    <Heart size={28} className={likedSongIds.includes(currentSong.id) ? 'fill-current' : ''} />
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
                  <div className="relative">
                    <button 
                      onClick={() => setShowDownloadMenu(!showDownloadMenu)} 
                      className="text-white p-1 hover:bg-white/10 rounded-full transition-colors"
                    >
                      <MoreHorizontal size={20} />
                    </button>
                    <AnimatePresence>
                      {showDownloadMenu && (
                        <>
                          <div 
                            className="fixed inset-0 z-[55]" 
                            onClick={() => setShowDownloadMenu(false)} 
                          />
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -10 }}
                            className="absolute right-0 bottom-full mb-2 bg-[#282828] min-w-[200px] rounded-md shadow-2xl z-[60] overflow-hidden border border-white/10"
                          >
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (currentSong) downloadSong(currentSong);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-white/10 transition-colors text-left"
                            >
                              <Download size={20} className="text-spotify-green" />
                              <span className="text-sm font-bold text-white">Download this song</span>
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </footer>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Navigation */}
        <nav className="bg-black/90 backdrop-blur-md rounded-2xl flex items-center justify-around py-3 pointer-events-auto border border-white/5 lg:hidden">
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
          <button 
            onClick={() => setActiveTab('library')}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'library' ? 'text-white scale-110' : 'text-spotify-gray hover:text-white'}`}
          >
            <div className="relative">
              <Heart 
                size={24} 
                strokeWidth={activeTab === 'library' ? 3 : 2}
                className={activeTab === 'library' ? 'fill-spotify-green text-spotify-green' : ''}
              />
            </div>
            <span className={`text-[10px] ${activeTab === 'library' ? 'font-bold' : 'font-medium'}`}>Library</span>
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
