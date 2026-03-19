/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  Home, 
  Search, 
  Music,
  Loader2,
  CheckCircle2,
  Smartphone,
  SkipBack,
  SkipForward,
  MoreHorizontal,
  Heart,
  Shuffle,
  Repeat,
  RefreshCw,
  ArrowLeft,
  Download,
  Camera,
  X,
  AlertCircle,
  MoreVertical,
  Plus,
  Share2,
  ListMusic,
  Timer,
  ChevronDown,
  Clapperboard,
  Volume2,
  VolumeX,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  updateProfile,
  updatePassword
} from 'firebase/auth';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot, 
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { fetchSyncedLyrics } from "./services/lyricsService";

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

const parseLyrics = (lyricsStr: string): SyncedLyric[] => {
  if (!lyricsStr) return [];
  
  const lines = lyricsStr.split('\n');
  const syncedLyrics: SyncedLyric[] = [];
  // More flexible regex for various LRC formats
  const timeRegex = /\[(\d{1,2}):(\d{1,2})[.:](\d{1,3})\]/;

  lines.forEach(line => {
    const match = line.match(timeRegex);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const milliseconds = parseInt(match[3]);
      
      // Handle different millisecond lengths (e.g. .8, .80, .800)
      let msFactor = 1;
      if (match[3].length === 1) msFactor = 100;
      else if (match[3].length === 2) msFactor = 10;
      else if (match[3].length === 3) msFactor = 1;
      
      const time = minutes * 60 + seconds + (milliseconds * msFactor) / 1000;
      const text = line.replace(timeRegex, '').trim();
      if (text) {
        syncedLyrics.push({ time, text });
      }
    }
  });
  
  return syncedLyrics.sort((a, b) => a.time - b.time);
};

const Skeleton = ({ className, ...props }: any) => (
  <div className={`animate-pulse bg-white/10 rounded-md ${className}`} {...props} />
);

interface SyncedLyric {
  time: number;
  text: string;
}

interface Song {
  id: number;
  title: string;
  artist: string;
  cover: string;
  url: string;
  isReel?: boolean;
  lyrics?: string;
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
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'reels' | 'premium' | 'library'>(() => {
    const path = window.location.pathname.replace('/', '');
    const validTabs = ['home', 'search', 'reels', 'premium', 'library'];
    return validTabs.includes(path) ? (path as any) : 'home';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(() => {
    return window.location.pathname.replace('/', '') === 'player';
  });
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [showPremiumFrame, setShowPremiumFrame] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [hasHandledDeepLink, setHasHandledDeepLink] = useState(false);
  const [isReelsMuted, setIsReelsMuted] = useState(false);
  const [tapAnimation, setTapAnimation] = useState<{ id: number; type: 'play' | 'pause' } | null>(null);
  const [selectedReelId, setSelectedReelId] = useState<number | null>(null);
  const [reelScrollTarget, setReelScrollTarget] = useState<number | null>(null);
  const [syncedLyrics, setSyncedLyrics] = useState<SyncedLyric[]>([]);
  const [isSyncingLyrics, setIsSyncingLyrics] = useState(false);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  const reelSongs = useMemo(() => songs.filter(s => s.isReel), [songs]);

  // Auth States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [likedSongIds, setLikedSongIds] = useState<number[]>([]);
  const [showAccountSettings, setShowAccountSettings] = useState(() => {
    return window.location.pathname.replace('/', '') === 'account';
  });
  const [accountForm, setAccountForm] = useState({ name: '', password: '', profilePic: '' });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reelsContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});

  // Handle URL sub-pages and back button
  useEffect(() => {
    const path = location.pathname.replace('/', '');
    
    // Handle Account Settings
    if (path === 'account') {
      setShowAccountSettings(true);
      setIsPlayerExpanded(false);
    } else if (path === 'player') {
      setIsPlayerExpanded(true);
      setShowAccountSettings(false);
    } else {
      setShowAccountSettings(false);
      setIsPlayerExpanded(false);
      
      const validTabs = ['home', 'search', 'reels', 'premium', 'library'];
      if (validTabs.includes(path)) {
        setActiveTab(path as any);
      } else if (path === '') {
        setActiveTab('home');
      }
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!hasHandledDeepLink || loading) return;

    let targetPath = activeTab === 'home' ? '' : activeTab;
    
    if (showAccountSettings) {
      targetPath = 'account';
    } else if (isPlayerExpanded) {
      targetPath = 'player';
    }

    const newParams = new URLSearchParams();
    if (currentSongIndex !== null && songs[currentSongIndex]) {
      newParams.set('songId', songs[currentSongIndex].id.toString());
    }
    
    if (activeTab === 'reels' && selectedReelId !== null) {
      newParams.set('reelId', selectedReelId.toString());
    }

    const targetUrl = `/${targetPath}${newParams.toString() ? '?' + newParams.toString() : ''}`;
    
    // If we have a songId or reelId in the current URL but not in our targetUrl,
    // and we just handled the deep link, it might be a race condition.
    // We should avoid navigating if the current URL has the parameters we're looking for.
    const currentSongId = searchParams.get('songId');
    const currentReelId = searchParams.get('reelId');
    
    if (currentSongId && currentSongIndex === null) return;
    if (currentReelId && selectedReelId === null) return;

    if (location.pathname + location.search !== targetUrl) {
      // If the path itself changed (e.g. home -> player), add to history
      // If only parameters changed (e.g. song1 -> song2), replace history
      const isPathChange = location.pathname !== `/${targetPath}`;
      navigate(targetUrl, { replace: !isPathChange });
    }
  }, [activeTab, isPlayerExpanded, showAccountSettings, currentSongIndex, selectedReelId, navigate, location.pathname, location.search, hasHandledDeepLink, loading, searchParams, songs]);

  useEffect(() => {
    if (showAccountSettings && currentUser) {
      setAccountForm({ 
        name: currentUser.name, 
        password: '', 
        profilePic: currentUser.profilePic || '' 
      });
    }
  }, [showAccountSettings, currentUser]);

  useEffect(() => {
    if (isPlayerExpanded && syncedLyrics.length > 0 && lyricsContainerRef.current) {
      const activeIndex = syncedLyrics.findIndex((lyric, index) => 
        progress >= lyric.time && (index === syncedLyrics.length - 1 || progress < syncedLyrics[index + 1].time)
      );
      
      if (activeIndex !== -1) {
        const activeElement = lyricsContainerRef.current.children[activeIndex] as HTMLElement;
        if (activeElement) {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [progress, isPlayerExpanded, syncedLyrics]);
  
  useEffect(() => {
    if (activeTab === 'reels') {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const video = entry.target as HTMLVideoElement;
            if (entry.isIntersecting) {
              video.play().catch(err => console.log("Auto-play blocked:", err));
              // Update selectedReelId when it becomes visible
              const reelId = Object.keys(videoRefs.current).find(key => videoRefs.current[key] === video);
              if (reelId) {
                setSelectedReelId(Number(reelId));
              }
            } else {
              video.pause();
            }
          });
        },
        { threshold: 0.6 }
      );

      const currentVideos = videoRefs.current;
      Object.values(currentVideos).forEach((video) => {
        if (video instanceof HTMLVideoElement) {
          observer.observe(video);
        }
      });

      return () => {
        Object.values(currentVideos).forEach((video) => {
          if (video instanceof HTMLVideoElement) {
            observer.unobserve(video);
          }
        });
        observer.disconnect();
      };
    }
  }, [activeTab, songs]);

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Fetch user profile from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        
        // Get PFP from localStorage (as requested)
        const savedPfp = localStorage.getItem(`spotify_pfp_${user.email}`);
        
        setCurrentUser({
          name: userData?.name || user.displayName || 'User',
          email: user.email!,
          profilePic: savedPfp || "https://files.catbox.moe/uxcbs7.jpeg"
        });

        // Listen for likes in real-time
        const likesUnsubscribe = onSnapshot(collection(db, 'users', user.uid, 'likes'), (snapshot) => {
          const likes = snapshot.docs.map(doc => Number(doc.id));
          setLikedSongIds(likes);
        });

        return () => likesUnsubscribe();
      } else {
        setCurrentUser(null);
        setLikedSongIds([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (authMode === 'signup') {
        if (!authForm.name || !authForm.email || !authForm.password) {
          showToast("Please fill all fields", 'error');
          return;
        }
        
        const userCredential = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        const user = userCredential.user;

        // Save profile to Firestore
        await setDoc(doc(db, 'users', user.uid), {
          name: authForm.name,
          email: authForm.email,
          createdAt: serverTimestamp()
        });

        // Update Firebase profile
        await updateProfile(user, { displayName: authForm.name });

        // Save default PFP to localStorage
        localStorage.setItem(`spotify_pfp_${authForm.email}`, "https://files.catbox.moe/uxcbs7.jpeg");

        setShowAuthModal(false);
      } else {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
        setShowAuthModal(false);
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      if (error.code === 'auth/operation-not-allowed') {
        showToast("Email/Password login is not enabled in Firebase Console.", 'error');
      } else {
        showToast("Error: " + error.message, 'error');
      }
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !currentUser) return;

    try {
      // Update name in Firestore
      if (accountForm.name) {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          name: accountForm.name
        }, { merge: true });
        
        await updateProfile(auth.currentUser, { displayName: accountForm.name });
      }

      // Update password in Firebase Auth
      if (accountForm.password) {
        await updatePassword(auth.currentUser, accountForm.password);
      }

      // Update PFP in localStorage (as requested)
      if (accountForm.profilePic) {
        localStorage.setItem(`spotify_pfp_${currentUser.email}`, accountForm.profilePic);
        setCurrentUser({ ...currentUser, profilePic: accountForm.profilePic });
      }

      setShowAccountSettings(false);
      showToast("Account updated successfully!", 'success');
    } catch (error: any) {
      console.error("Update error:", error);
      showToast(error.message, 'error');
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

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsSidebarOpen(false);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const toggleLike = async (songId: number) => {
    if (!auth.currentUser) {
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }

    const likeDocRef = doc(db, 'users', auth.currentUser.uid, 'likes', songId.toString());

    try {
      if (likedSongIds.includes(songId)) {
        await deleteDoc(likeDocRef);
      } else {
        await setDoc(likeDocRef, {
          songId: songId,
          userId: auth.currentUser.uid,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  const downloadSong = async (song: Song) => {
    if (!currentUser) {
      setShowDownloadMenu(false);
      showToast("You must be logged in to download songs. Please log in or sign up.", 'info');
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }
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
      showToast("Download failed. This might be due to CORS restrictions.", 'error');
    }
  };

  const shareContent = async (item: Song) => {
    try {
      const url = new URL(window.location.href);
      url.search = ''; // Clear existing parameters
      
      if (item.isReel) {
        url.searchParams.set('reelId', item.id.toString());
      } else {
        url.searchParams.set('songId', item.id.toString());
      }
      const shareUrl = url.toString();

      if (navigator.share) {
        try {
          await navigator.share({
            title: item.title,
            text: `Check out ${item.title} by ${item.artist} on Npotify!`,
            url: shareUrl,
          });
        } catch (error: any) {
          if (error.name !== 'AbortError') {
            console.error("Share failed:", error);
          }
          try {
            await navigator.clipboard.writeText(shareUrl);
            showToast("Link copied to clipboard!", 'success');
          } catch (clipboardError) {
            console.error("Clipboard fallback failed:", clipboardError);
          }
        }
      } else {
        try {
          await navigator.clipboard.writeText(shareUrl);
          showToast("Link copied to clipboard!", 'success');
        } catch (error) {
          console.error("Clipboard failed:", error);
        }
      }
    } catch (error) {
      console.error("Share failed:", error);
    }
  };

  useEffect(() => {
    // Wait for songs to load
    if (loading || songs.length === 0 || hasHandledDeepLink) return;

    const params = new URLSearchParams(window.location.search);
    const songId = params.get('songId');
    const reelId = params.get('reelId');

    if (songId) {
      const id = parseInt(songId);
      const songIndex = songs.findIndex(s => s.id === id);
      if (songIndex !== -1) {
        playSong(songIndex);
        setIsPlayerExpanded(true);
        setHasHandledDeepLink(true);
        return;
      }
    } 
    
    if (reelId) {
      const id = parseInt(reelId);
      const reel = songs.find(s => s.id === id && s.isReel);
      if (reel) {
        setActiveTab('reels');
        setSelectedReelId(id);
        setReelScrollTarget(id);
        setHasHandledDeepLink(true);
        return;
      }
    }

    setHasHandledDeepLink(true);
  }, [loading, songs, hasHandledDeepLink]);

  useEffect(() => {
    // Only pause if we are NOT in the middle of handling a deep link for a reel
    if (activeTab === 'reels' && isPlaying && hasHandledDeepLink) {
      const reelId = searchParams.get('reelId');
      if (!reelId) {
        setIsPlaying(false);
        audioRef.current?.pause();
      }
    }
  }, [activeTab, isPlaying, hasHandledDeepLink, searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchSongs = async () => {
      try {
        if (GOOGLE_SHEET_ID.includes('U_U_U')) {
          const initialMockSongs: Song[] = [
            { id: 0, title: "Midnight City", artist: "M83", cover: "https://picsum.photos/seed/m83/400/400", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", lyrics: "" },
            { id: 1, title: "Starboy", artist: "The Weeknd", cover: "https://picsum.photos/seed/weeknd/400/400", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", lyrics: "" },
            { id: 2, title: "Blinding Lights", artist: "The Weeknd", cover: "https://picsum.photos/seed/blinding/400/400", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", lyrics: "" }
          ];
          
          const mockSongs = await Promise.all(initialMockSongs.map(async (song) => {
            const fetched = await fetchSyncedLyrics(song.title, song.artist);
            return { ...song, lyrics: fetched || song.lyrics };
          }));
          
          setSongs(mockSongs);
          setLoading(false);
          return;
        }
        const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json`;
        const response = await fetch(url);
        const text = await response.text();
        const json = JSON.parse(text.substring(47, text.length - 2));
        const fetchedSongs: Song[] = await Promise.all(json.table.rows.map(async (row: any, index: number) => {
          const title = row.c[0]?.v || "Unknown Title";
          const artist = row.c[1]?.v || "Unknown Artist";
          const lyricsVal = row.c[4]?.v || "";
          
          let lyrics = lyricsVal;
          
          // If lyrics is empty or a Spotify link, try to fetch synced lyrics automatically
          if (!lyrics || lyrics.includes('spotify.com')) {
            const fetched = await fetchSyncedLyrics(title, artist);
            if (fetched) {
              lyrics = fetched;
            }
          }

          return {
            id: index,
            title: title,
            artist: artist,
            cover: row.c[2]?.v || "https://picsum.photos/seed/music/400/400",
            url: formatAudioUrl(row.c[3]?.v || ""),
            isReel: title.includes('#'),
            lyrics: lyrics
          };
        }));
        setSongs(fetchedSongs.filter((s: Song) => s.url !== ""));
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
      if (songs[currentSongIndex].lyrics) {
        const parsed = parseLyrics(songs[currentSongIndex].lyrics!);
        setSyncedLyrics(parsed);
        // If lyrics exist but aren't synced, try to fetch synced ones automatically
        if (parsed.length === 0) {
          syncLyrics();
        }
      } else {
        setSyncedLyrics([]);
        // Automatically try to fetch lyrics if missing
        syncLyrics();
      }
    }
  }, [currentSongIndex, songs]);

  const syncLyrics = async () => {
    if (!currentSong) return;
    setIsSyncingLyrics(true);
    try {
      const fetched = await fetchSyncedLyrics(currentSong.title, currentSong.artist);
      if (fetched) {
        const parsed = parseLyrics(fetched);
        setSyncedLyrics(parsed);
        // Update the song object in the list
        setSongs(prev => prev.map(s => s.id === currentSong.id ? { ...s, lyrics: fetched } : s));
        showToast("Lyrics synced successfully!", 'success');
      } else {
        showToast("Could not find synced lyrics for this song.", 'error');
      }
    } catch (error) {
      showToast("Error syncing lyrics.", 'error');
    } finally {
      setIsSyncingLyrics(false);
    }
  };

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
    setIsPlayerExpanded(true);
  };

  const nextSong = () => {
    if (currentSongIndex !== null) {
      const mainSongs = songs.filter(s => !s.isReel);
      if (mainSongs.length === 0) return;
      
      const currentMainIndex = mainSongs.findIndex(s => s.id === currentSongIndex);
      
      if (isShuffle) {
        let nextIndex;
        do {
          nextIndex = Math.floor(Math.random() * mainSongs.length);
        } while (mainSongs[nextIndex].id === currentSongIndex && mainSongs.length > 1);
        setCurrentSongIndex(mainSongs[nextIndex].id);
      } else {
        const nextMainIndex = currentMainIndex === -1 ? 0 : (currentMainIndex + 1) % mainSongs.length;
        setCurrentSongIndex(mainSongs[nextMainIndex].id);
      }
    }
  };

  const prevSong = () => {
    if (currentSongIndex !== null) {
      const mainSongs = songs.filter(s => !s.isReel);
      if (mainSongs.length === 0) return;
      
      const currentMainIndex = mainSongs.findIndex(s => s.id === currentSongIndex);
      
      if (isShuffle) {
        let prevIndex;
        do {
          prevIndex = Math.floor(Math.random() * mainSongs.length);
        } while (mainSongs[prevIndex].id === currentSongIndex && mainSongs.length > 1);
        setCurrentSongIndex(mainSongs[prevIndex].id);
      } else {
        const prevMainIndex = currentMainIndex === -1 ? 0 : (currentMainIndex - 1 + mainSongs.length) % mainSongs.length;
        setCurrentSongIndex(mainSongs[prevMainIndex].id);
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

  useEffect(() => {
    if (activeTab === 'reels' && reelScrollTarget !== null && reelsContainerRef.current) {
      const container = reelsContainerRef.current;
      const index = reelSongs.findIndex(s => s.id === reelScrollTarget);
      
      if (index !== -1) {
        // Use a small timeout to ensure the DOM is ready and clientHeight is accurate
        const scrollTimeout = setTimeout(() => {
          if (container.clientHeight > 0) {
            container.scrollTo({
              top: index * container.clientHeight,
              behavior: 'auto' // Use auto to avoid conflict with CSS snap
            });
            setReelScrollTarget(null);
          }
        }, 150);
        return () => clearTimeout(scrollTimeout);
      } else {
        setReelScrollTarget(null);
      }
    }
  }, [activeTab, reelScrollTarget, reelSongs]);

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
      <main className={`flex-1 h-full relative ${
        (activeTab === 'premium' && showPremiumFrame) || activeTab === 'reels' 
          ? 'overflow-hidden' 
          : 'overflow-y-auto pb-40'
      } scrollbar-hide`}>
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
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-white/5 rounded flex items-center gap-2 overflow-hidden h-14">
                    <Skeleton className="w-14 h-14 rounded-none" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))
              ) : (
                songs.filter(s => !s.isReel).slice(0, 8).map((song, i) => (
                  <div 
                    key={i} 
                    onClick={() => playSong(song.id)}
                    className="bg-white/10 hover:bg-white/20 transition-colors rounded flex items-center gap-2 overflow-hidden group cursor-pointer h-14"
                  >
                    <img 
                      src={song.cover} 
                      className="w-14 h-14 object-cover shrink-0 rounded-md aspect-square" 
                      referrerPolicy="no-referrer" 
                    />
                    <span className="text-xs font-bold truncate pr-2">{song.artist}</span>
                  </div>
                ))
              )}
            </section>

            {/* Jump back in */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4 tracking-tight">Jump back in</h2>
              <div className="flex overflow-x-auto gap-4 scrollbar-hide -mx-4 px-4">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="min-w-[160px] max-w-[160px] space-y-3">
                      <Skeleton className="aspect-square w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))
                ) : (
                  songs.filter(s => !s.isReel).map((song, i) => (
                    <div key={i} onClick={() => playSong(song.id)} className="min-w-[160px] max-w-[160px] cursor-pointer group">
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
                        Playlist • {song.artist}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Reels on Home */}
            {(loading || reelSongs.length > 0) && (
              <section className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold tracking-tight">Reels</h2>
                  <button 
                    onClick={() => setActiveTab('reels')}
                    className="text-spotify-gray hover:text-white text-sm font-bold transition-colors"
                  >
                    Show all
                  </button>
                </div>
                <div className="flex overflow-x-auto gap-3 scrollbar-hide -mx-4 px-4">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="min-w-[120px] max-w-[120px] aspect-[9/16] shrink-0" />
                    ))
                  ) : (
                    reelSongs.map((reel, i) => (
                      <div 
                        key={i} 
                        onClick={() => {
                          setReelScrollTarget(reel.id);
                          setSelectedReelId(reel.id);
                          setActiveTab('reels');
                        }}
                        className="min-w-[120px] max-w-[120px] aspect-[9/16] relative rounded-lg overflow-hidden cursor-pointer group shrink-0"
                      >
                        <img 
                          src={reel.cover} 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                          referrerPolicy="no-referrer" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-2">
                          <div className="flex items-center gap-1 mb-1">
                            <Clapperboard size={12} className="text-white" />
                            <span className="text-[10px] font-bold text-white truncate">{reel.artist}</span>
                          </div>
                          <h3 className="text-[10px] text-white/80 line-clamp-1">{reel.title}</h3>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {/* Albums featuring songs you like */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4 tracking-tight">Albums featuring songs you like</h2>
              <div className="flex overflow-x-auto gap-4 scrollbar-hide -mx-4 px-4">
                {songs.filter(s => !s.isReel).slice().reverse().map((song, i) => (
                  <div key={i} onClick={() => playSong(song.id)} className="min-w-[160px] max-w-[160px] cursor-pointer">
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
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="w-12 h-12 rounded" />
                      <div className="flex flex-col gap-2 flex-1">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                    </div>
                  ))
                ) : filteredSongs.length > 0 ? (
                  filteredSongs.map((song) => (
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
                      <motion.button
                        whileTap={{ scale: 0.8 }}
                        whileHover={{ scale: 1.1 }}
                        onClick={(e) => { e.stopPropagation(); toggleLike(song.id); }}
                        className={`${likedSongIds.includes(song.id) ? 'text-spotify-green' : 'text-white/60'}`}
                      >
                        {likedSongIds.includes(song.id) ? (
                          <Heart size={18} className="fill-current" />
                        ) : (
                          <Plus size={18} />
                        )}
                      </motion.button>
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
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-[1.6/1] rounded-lg" />
                    ))
                  ) : (
                    [
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
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'reels' ? (
          <div 
            ref={reelsContainerRef}
            className="h-full w-full overflow-y-scroll snap-y snap-mandatory bg-black scrollbar-hide relative"
          >
            {loading ? (
              // Reels Skeleton
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-full w-full snap-start relative flex items-center justify-center bg-black overflow-hidden">
                  <div className="relative h-full w-full max-w-[calc(100vh*9/16)] bg-zinc-900 flex items-center justify-center overflow-hidden">
                    <Skeleton className="w-full h-full rounded-none" />
                    <div className="absolute bottom-24 left-4 right-16 z-10 space-y-2">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                    <div className="absolute bottom-28 right-4 flex flex-col gap-6 items-center z-10">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <Skeleton className="w-10 h-10 rounded-full" />
                    </div>
                  </div>
                </div>
              ))
            ) : reelSongs.length > 0 ? (
              reelSongs.map((reel, index) => (
                <div 
                  key={reel.id} 
                  id={`reel-${reel.id}`}
                  className="h-full w-full snap-start relative flex items-center justify-center bg-black overflow-hidden"
                >
                  <div 
                    className="relative h-full w-full md:max-w-[calc(100vh*9/16)] bg-zinc-900 shadow-2xl flex items-center justify-center overflow-hidden"
                    style={{ aspectRatio: '9/16' }}
                  >
                    <video 
                      ref={el => videoRefs.current[reel.id] = el}
                      src={reel.url} 
                      className="h-full w-full object-cover" 
                      loop 
                      muted={isReelsMuted}
                      playsInline
                      webkit-playsinline="true"
                      onClick={(e) => {
                        const video = e.currentTarget;
                        if (video.paused) {
                          video.play().catch(err => console.error("Play failed:", err));
                          setTapAnimation({ id: reel.id, type: 'play' });
                        } else {
                          video.pause();
                          setTapAnimation({ id: reel.id, type: 'pause' });
                        }
                        setTimeout(() => setTapAnimation(null), 500);
                      }}
                    />

                    {/* Tap Animation Overlay */}
                    <AnimatePresence>
                      {tapAnimation?.id === reel.id && (
                        <motion.div 
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1.2, opacity: 1 }}
                          exit={{ scale: 1.5, opacity: 0 }}
                          className="absolute z-20 pointer-events-none"
                        >
                          <div className="bg-black/40 p-4 rounded-full backdrop-blur-sm">
                            {tapAnimation.type === 'play' ? <Play size={32} className="text-white fill-current" /> : <Pause size={32} className="text-white fill-current" />}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    {/* Overlay Info */}
                    <div className="absolute bottom-36 left-4 right-16 z-10 pointer-events-none">
                      <h3 className="text-lg font-bold text-white drop-shadow-lg mb-1">{reel.title}</h3>
                      <p className="text-sm text-white/80 drop-shadow-md flex items-center gap-2">
                        <Music size={14} />
                        {reel.artist}
                      </p>
                    </div>

                    {/* Side Actions */}
                    <div className="absolute bottom-40 right-4 flex flex-col gap-6 items-center z-10">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsReelsMuted(!isReelsMuted); }}
                        className="flex flex-col items-center gap-1 group"
                      >
                        <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm group-hover:bg-black/40 transition-colors">
                          {isReelsMuted ? <VolumeX size={28} className="text-white drop-shadow-lg" /> : <Volume2 size={28} className="text-spotify-green drop-shadow-lg" />}
                        </div>
                        <span className="text-[10px] font-bold text-white drop-shadow-md">{isReelsMuted ? 'Muted' : 'Unmuted'}</span>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleLike(reel.id); }}
                        className="flex flex-col items-center gap-1 group"
                      >
                        <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm group-hover:bg-black/40 transition-colors">
                          <Heart 
                            size={28} 
                            className={`${likedSongIds.includes(reel.id) ? 'fill-spotify-green text-spotify-green' : 'text-white'} drop-shadow-lg transition-transform active:scale-125`} 
                          />
                        </div>
                        <span className="text-[10px] font-bold text-white drop-shadow-md">Like</span>
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          shareContent(reel);
                        }}
                        className="flex flex-col items-center gap-1 group"
                      >
                        <div className="p-2 rounded-full bg-black/20 backdrop-blur-sm group-hover:bg-black/40 transition-colors">
                          <Share2 size={28} className="text-white drop-shadow-lg" />
                        </div>
                        <span className="text-[10px] font-bold text-white drop-shadow-md">Share</span>
                      </button>
                    </div>
                  </div>

                  {/* Desktop Navigation Arrows */}
                  <div className="hidden lg:flex absolute right-8 top-1/2 -translate-y-1/2 flex-col gap-6 z-20">
                    <button 
                      onClick={() => {
                        if (reelsContainerRef.current) {
                          reelsContainerRef.current.scrollBy({ top: -reelsContainerRef.current.clientHeight, behavior: 'smooth' });
                        }
                      }}
                      className="p-4 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all hover:scale-110 shadow-2xl border border-white/10"
                      title="Previous Reel"
                    >
                      <ChevronUp size={28} />
                    </button>
                    <button 
                      onClick={() => {
                        if (reelsContainerRef.current) {
                          reelsContainerRef.current.scrollBy({ top: reelsContainerRef.current.clientHeight, behavior: 'smooth' });
                        }
                      }}
                      className="p-4 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all hover:scale-110 shadow-2xl border border-white/10"
                      title="Next Reel"
                    >
                      <ChevronDown size={28} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-4 text-center">
                <Clapperboard size={64} className="text-spotify-gray mb-4" />
                <h2 className="text-2xl font-bold mb-2">No Reels yet</h2>
                <p className="text-spotify-gray">Add songs with # in the title to see them here.</p>
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
              <div className="space-y-8">
                {/* Liked Songs */}
                <div>
                  <div className="flex items-center gap-4 mb-6 bg-gradient-to-br from-[#450af5] to-[#c4efd9] p-4 rounded-lg">
                    <div className="w-12 h-12 bg-gradient-to-br from-[#450af5] to-[#8e8ee5] flex items-center justify-center rounded shadow-lg">
                      <Heart size={24} className="fill-white text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Liked Songs</h3>
                      <p className="text-sm opacity-80">{loading ? '...' : songs.filter(s => !s.isReel && likedSongIds.includes(s.id)).length} songs</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {loading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <Skeleton className="w-12 h-12 rounded" />
                          <div className="flex flex-col gap-2 flex-1">
                            <Skeleton className="h-4 w-1/2" />
                            <Skeleton className="h-3 w-1/4" />
                          </div>
                        </div>
                      ))
                    ) : songs.filter(s => !s.isReel && likedSongIds.includes(s.id)).length > 0 ? (
                      songs.filter(s => !s.isReel && likedSongIds.includes(s.id)).map((song) => (
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
                          <motion.button
                            whileTap={{ scale: 0.8 }}
                            whileHover={{ scale: 1.1 }}
                            onClick={(e) => { e.stopPropagation(); toggleLike(song.id); }}
                            className="text-spotify-green"
                          >
                            <Heart 
                              size={18} 
                              className="fill-current" 
                            />
                          </motion.button>
                        </div>
                      ))
                    ) : (
                      <p className="text-spotify-gray text-sm text-center py-4">No liked songs yet.</p>
                    )}
                  </div>
                </div>

                {/* Liked Reels */}
                <div>
                  <div className="flex items-center gap-4 mb-6 bg-gradient-to-br from-[#058c42] to-[#0d47a1] p-4 rounded-lg">
                    <div className="w-12 h-12 bg-gradient-to-br from-[#058c42] to-[#0a6b32] flex items-center justify-center rounded shadow-lg">
                      <Clapperboard size={24} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Liked Reels</h3>
                      <p className="text-sm opacity-80">{loading ? '...' : songs.filter(s => s.isReel && likedSongIds.includes(s.id)).length} reels</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {loading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-[9/16] rounded-md" />
                      ))
                    ) : songs.filter(s => s.isReel && likedSongIds.includes(s.id)).length > 0 ? (
                      songs.filter(s => s.isReel && likedSongIds.includes(s.id)).map((reel) => (
                        <div 
                          key={reel.id} 
                          onClick={() => {
                            setSelectedReelId(reel.id);
                            setActiveTab('reels');
                          }}
                          className="aspect-[9/16] relative rounded-md overflow-hidden cursor-pointer group"
                        >
                          <img src={reel.cover} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-end p-2">
                            <span className="text-[10px] font-bold text-white truncate">{reel.title}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-3 text-center py-4">
                        <p className="text-spotify-gray text-sm">No liked reels yet.</p>
                      </div>
                    )}
                  </div>
                </div>
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
                <h2 className="text-2xl font-bold mb-2 lg:text-4xl">Npotify Premium</h2>
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
              className="bg-[#282828] rounded-lg p-2 flex items-center justify-between shadow-2xl pointer-events-auto mb-2 lg:mb-4 lg:mx-4 relative overflow-hidden touch-none"
              onClick={() => setIsPlayerExpanded(true)}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_e, info) => {
                if (info.offset.y > 50) {
                  setIsPlaying(false);
                  setCurrentSongIndex(null);
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0;
                  }
                }
              }}
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
              className="fixed inset-0 z-50 bg-[#121212] p-6 flex flex-col pointer-events-auto overflow-y-auto"
            >
              <div className="max-w-md mx-auto w-full flex flex-col h-full min-h-[700px]">
                <header className="flex items-center justify-between mb-8">
                  <button onClick={() => setIsPlayerExpanded(false)} className="text-white">
                    <ChevronDown size={32} />
                  </button>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-white/60">Playing from playlist</span>
                    <span className="text-xs font-bold">Jump back in</span>
                  </div>
                  <div className="relative">
                    <button 
                      onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                      className="text-white p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                      <MoreVertical size={24} />
                    </button>
                    <AnimatePresence>
                      {showDownloadMenu && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 10 }}
                          className="absolute right-0 top-12 w-48 bg-[#282828] rounded-md shadow-2xl z-50 overflow-hidden border border-white/10"
                        >
                          <button 
                            onClick={() => downloadSong(currentSong)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 text-white text-sm font-medium transition-colors"
                          >
                            <Download size={18} />
                            Download
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </header>

                <div className="flex-1 flex flex-col">
                  {/* Album Art */}
                  <motion.div 
                    key="cover"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    onDragEnd={(_, info) => {
                      if (info.offset.x > 100) prevSong();
                      else if (info.offset.x < -100) nextSong();
                    }}
                    className="aspect-square w-full shadow-2xl overflow-hidden rounded-lg mb-8"
                  >
                    <img src={currentSong.cover} className="w-full h-full object-cover pointer-events-none" referrerPolicy="no-referrer" />
                  </motion.div>

                  {/* Active Lyric Line */}
                  <div className="mb-8 min-h-[48px] flex items-center">
                    {syncedLyrics.length > 0 ? (
                      <motion.p
                        key={syncedLyrics.findIndex((l, i) => progress >= l.time && (i === syncedLyrics.length - 1 || progress < syncedLyrics[i+1].time))}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-2xl font-bold text-white leading-tight"
                      >
                        {syncedLyrics.find((l, i) => progress >= l.time && (i === syncedLyrics.length - 1 || progress < syncedLyrics[i+1].time))?.text}
                      </motion.p>
                    ) : (
                      <p className="text-xl font-bold text-white/40 italic">
                        {isSyncingLyrics ? "Loading lyrics..." : ""}
                      </p>
                    )}
                  </div>

                  {/* Song Info */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex flex-col min-w-0">
                      <h2 className="text-2xl font-bold truncate">{currentSong.title}</h2>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-white/20 text-white/60 px-1 rounded-sm font-bold">E</span>
                        <p className="text-white/60 text-lg truncate">{currentSong.artist}</p>
                      </div>
                    </div>
                    <motion.button 
                      whileTap={{ scale: 0.8 }}
                      whileHover={{ scale: 1.1 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(currentSong.id);
                      }}
                      className={`transition-colors duration-300 ${likedSongIds.includes(currentSong.id) ? 'text-spotify-green' : 'text-white'}`}
                    >
                      {likedSongIds.includes(currentSong.id) ? (
                        <motion.div
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 15 }}
                        >
                          <CheckCircle2 size={32} className="fill-current text-spotify-green" />
                        </motion.div>
                      ) : (
                        <Plus size={32} />
                      )}
                    </motion.button>
                  </div>

                  {/* Progress Bar */}
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
                    </div>
                    <div className="flex justify-between text-[10px] text-white/60 font-medium">
                      <span>{formatTime(progress)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-between mb-8">
                    <button 
                      onClick={toggleShuffle}
                      className={`${isShuffle ? 'text-spotify-green' : 'text-white/60'}`}
                    >
                      <Shuffle size={24} />
                    </button>
                    <button onClick={prevSong} className="text-white">
                      <SkipBack size={36} className="fill-current" />
                    </button>
                    <button 
                      onClick={togglePlay}
                      className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-black"
                    >
                      {isPlaying ? <Pause size={32} className="fill-current" /> : <Play size={32} className="fill-current ml-1" />}
                    </button>
                    <button onClick={nextSong} className="text-white">
                      <SkipForward size={36} className="fill-current" />
                    </button>
                    <button 
                      onClick={toggleRepeat}
                      className={`${repeatMode !== 'off' ? 'text-spotify-green' : 'text-white/60'}`}
                    >
                      <Timer size={24} />
                    </button>
                  </div>

                  {/* Footer Icons */}
                  <div className="flex items-center justify-between mb-8">
                    <Smartphone size={24} className="text-spotify-green" />
                    <div className="flex items-center gap-8">
                      <button onClick={() => shareContent(currentSong)} className="text-white hover:text-spotify-green transition-colors">
                        <Share2 size={24} />
                      </button>
                      <ListMusic size={24} className="text-white" />
                    </div>
                  </div>

                  {/* Lyrics Card */}
                  <div className="bg-[#4d4d33] rounded-xl p-4 mt-auto mb-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-bold text-white">Lyrics preview</h3>
                      <div className="flex items-center gap-2">
                        {isSyncingLyrics && <Loader2 size={12} className="animate-spin text-white/60" />}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            syncLyrics();
                          }}
                          className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold hover:bg-white/30 transition-colors"
                        >
                          {isSyncingLyrics ? 'SYNCING...' : 'MORE'}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-[120px] overflow-hidden">
                       {syncedLyrics.length > 0 ? (
                         syncedLyrics.slice(0, 3).map((l, i) => (
                           <p key={i} className="text-lg font-bold text-white/60">{l.text}</p>
                         ))
                       ) : currentSong.lyrics ? (
                         <p className="text-sm font-medium text-white/60 line-clamp-4 italic">
                           {currentSong.lyrics}
                         </p>
                       ) : (
                         <p className="text-lg font-bold text-white/60 italic">
                           {isSyncingLyrics ? "Searching for lyrics..." : "Lyrics not available."}
                         </p>
                       )}
                    </div>
                  </div>
                </div>
              </div>
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
            onClick={() => setActiveTab('reels')}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'reels' ? 'text-white scale-110' : 'text-spotify-gray hover:text-white'}`}
          >
            <Clapperboard 
              size={24} 
              strokeWidth={activeTab === 'reels' ? 3 : 2}
            />
            <span className={`text-[10px] ${activeTab === 'reels' ? 'font-bold' : 'font-medium'}`}>Reels</span>
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

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 50, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: 50, opacity: 0, x: '-50%' }}
            className={`fixed bottom-24 left-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 min-w-[300px] justify-center ${
              toast.type === 'success' ? 'bg-spotify-green text-black' : 
              toast.type === 'error' ? 'bg-red-500 text-white' : 
              'bg-[#282828] text-white border border-white/10'
            }`}
          >
            {toast.type === 'error' && <AlertCircle size={20} />}
            {toast.type === 'success' && <CheckCircle2 size={20} />}
            {toast.type === 'info' && <AlertCircle size={20} className="text-spotify-green" />}
            <span className="text-sm font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

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
