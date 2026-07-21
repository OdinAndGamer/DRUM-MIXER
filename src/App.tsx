import { useState, useEffect } from 'react';
import { Song, TrackType, PlaybackStatus } from './types';
import { PRESET_SONGS, BOOKS } from './songsData';
import { synthesizeSongTracks } from './utils/audioSynth';
import { audioEngine } from './utils/audioEngine';
import { getDirectoryHandle, saveDirectoryHandle, clearDirectoryHandle } from './utils/db';
import { scanLocalDirectory, scanLocalFilesList, extractFlacCover } from './utils/localFolderScanner';

// Components
import { Sidebar } from './components/Sidebar';
import { CoverArt } from './components/CoverArt';
import { Timeline } from './components/Timeline';
import { Mixer } from './components/Mixer';
import { PlayerControls } from './components/PlayerControls';
import { SongImporter } from './components/SongImporter';
import { SongPracticeDashboard } from './components/SongPracticeDashboard';

// Icons
import { AlertTriangle, Disc, Sliders, Volume2, Info, Moon, Settings, Zap, FolderOpen, Cpu, Folder, Plus } from 'lucide-react';

export default function App() {
  const [deletedSongIds, setDeletedSongIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('drumpractice_deleted_songs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [songs, setSongs] = useState<Song[]>(() => {
    try {
      const deletedSaved = localStorage.getItem('drumpractice_deleted_songs');
      const deletedIds: string[] = deletedSaved ? JSON.parse(deletedSaved) : [];
      return PRESET_SONGS.filter((s) => !deletedIds.includes(s.id));
    } catch {
      return PRESET_SONGS;
    }
  });

  const [selectedBook, setSelectedBook] = useState<string | null>(() => {
    try {
      const deletedSaved = localStorage.getItem('drumpractice_deleted_songs');
      const deletedIds: string[] = deletedSaved ? JSON.parse(deletedSaved) : [];
      const remainingPresets = PRESET_SONGS.filter((s) => !deletedIds.includes(s.id));
      return remainingPresets.length > 0 ? remainingPresets[0].book : (BOOKS.length > 0 ? BOOKS[0] : null);
    } catch {
      return BOOKS.length > 0 ? BOOKS[0] : null;
    }
  });

  const [currentSong, setCurrentSong] = useState<Song | null>(() => {
    try {
      const deletedSaved = localStorage.getItem('drumpractice_deleted_songs');
      const deletedIds: string[] = deletedSaved ? JSON.parse(deletedSaved) : [];
      const remainingPresets = PRESET_SONGS.filter((s) => !deletedIds.includes(s.id));
      return remainingPresets.length > 0 ? remainingPresets[0] : null;
    } catch {
      return PRESET_SONGS.length > 0 ? PRESET_SONGS[0] : null;
    }
  });

  // Local folder connection states
  const [localFolderHandle, setLocalFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isLocalFolderConnected, setIsLocalFolderConnected] = useState<boolean>(false);
  const [isScanningLocalFolder, setIsScanningLocalFolder] = useState<boolean>(false);
  const [localFolderStats, setLocalFolderStats] = useState<{ scanned: number; found: number } | null>(null);

  // 1b. Load stored folder handle on startup
  useEffect(() => {
    async function checkSavedHandle() {
      try {
        const handle = await getDirectoryHandle();
        if (handle) {
          setLocalFolderHandle(handle);
          setIsLocalFolderConnected(true);
        }
      } catch (err) {
        console.warn('Failed to load saved directory handle:', err);
      }
    }
    checkSavedHandle();
  }, []);
  
  // Player state
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('stopped');
  const [countdownValue, setCountdownValue] = useState<number | undefined>(undefined);
  const [currentPosition, setCurrentPosition] = useState<number>(0);
  const [songDuration, setSongDuration] = useState<number>(0);

  // Settings
  const [volumes, setVolumes] = useState<Record<TrackType, number>>({
    Drum: 1.0,
    Gesang: 1.0,
    Instrumente: 1.0,
    Klick: 1.0,
  });
  const [masterVolume, setMasterVolume] = useState<number>(1.0);
  const [tempoPercent, setTempoPercent] = useState<number>(100);
  const [countInEnabled, setCountInEnabled] = useState<boolean>(true);

  // Looping
  const [loopEnabled, setLoopEnabled] = useState<boolean>(false);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);

  // UI state
  const [isLoadingSong, setIsLoadingSong] = useState<boolean>(false);
  const [showImporter, setShowImporter] = useState<boolean>(false);

  // Buffer Cache to prevent repeated synthesis
  const [bufferCache] = useState<Record<string, Record<TrackType, AudioBuffer>>>({});

  // Favorites, Notes, and Practice Stats
  const [favorites, setFavorites] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('drumpractice_favorites');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [songNotes, setSongNotes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('drumpractice_notes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [practiceStats, setPracticeStats] = useState<Record<string, { playCount: number; lastPracticed: string; totalDuration: number }>>(() => {
    try {
      const saved = localStorage.getItem('drumpractice_stats');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Custom Song BPM Override State
  const [songBpms, setSongBpms] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('drumpractice_custom_bpms');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Speed Trainer States
  const [speedTrainerEnabled, setSpeedTrainerEnabled] = useState<boolean>(() => {
    return localStorage.getItem('drumpractice_speed_trainer_enabled') === 'true';
  });
  const [speedTrainerStep, setSpeedTrainerStep] = useState<number>(() => {
    return parseInt(localStorage.getItem('drumpractice_speed_trainer_step') || '5');
  });
  const [speedTrainerMax, setSpeedTrainerMax] = useState<number>(() => {
    return parseInt(localStorage.getItem('drumpractice_speed_trainer_max') || '150');
  });

  // Timing Trainer States
  const [timingTrainerEnabled, setTimingTrainerEnabled] = useState<boolean>(() => {
    return localStorage.getItem('drumpractice_timing_trainer_enabled') === 'true';
  });
  const [timingTrainerHear, setTimingTrainerHear] = useState<number>(() => {
    return parseInt(localStorage.getItem('drumpractice_timing_trainer_hear') || '4');
  });
  const [timingTrainerMute, setTimingTrainerMute] = useState<number>(() => {
    return parseInt(localStorage.getItem('drumpractice_timing_trainer_mute') || '4');
  });
  const [timingTrainerMuteTracks, setTimingTrainerMuteTracks] = useState<Record<TrackType, boolean>>(() => {
    try {
      const saved = localStorage.getItem('drumpractice_timing_trainer_mute_tracks');
      return saved ? JSON.parse(saved) : { Drum: false, Gesang: false, Instrumente: false, Klick: true };
    } catch {
      return { Drum: false, Gesang: false, Instrumente: false, Klick: true };
    }
  });

  // Toast visual notification for Speed Trainer
  const [trainerToastMsg, setTrainerToastMsg] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setTrainerToastMsg(msg);
    setTimeout(() => {
      setTrainerToastMsg((prev) => prev === msg ? null : prev);
    }, 4000);
  };

  const handleUpdateSongBpm = (songId: string, newBpm: number) => {
    setSongBpms((prev) => {
      const updated = { ...prev, [songId]: newBpm };
      localStorage.setItem('drumpractice_custom_bpms', JSON.stringify(updated));
      return updated;
    });
    audioEngine.setBpm(newBpm);
  };

  const triggerSpeedTrainerToast = (newTempo: number) => {
    triggerToast(`Tempo gesteigert auf ${newTempo}%! 🚀`);
  };

  // Sync Speed Trainer values to localStorage
  useEffect(() => {
    localStorage.setItem('drumpractice_speed_trainer_enabled', String(speedTrainerEnabled));
    localStorage.setItem('drumpractice_speed_trainer_step', String(speedTrainerStep));
    localStorage.setItem('drumpractice_speed_trainer_max', String(speedTrainerMax));
  }, [speedTrainerEnabled, speedTrainerStep, speedTrainerMax]);

  // Sync Timing Trainer values to localStorage & AudioEngine
  useEffect(() => {
    localStorage.setItem('drumpractice_timing_trainer_enabled', String(timingTrainerEnabled));
    localStorage.setItem('drumpractice_timing_trainer_hear', String(timingTrainerHear));
    localStorage.setItem('drumpractice_timing_trainer_mute', String(timingTrainerMute));
    localStorage.setItem('drumpractice_timing_trainer_mute_tracks', JSON.stringify(timingTrainerMuteTracks));
    
    audioEngine.setTimingTrainer(
      timingTrainerEnabled,
      timingTrainerHear,
      timingTrainerMute,
      timingTrainerMuteTracks
    );
  }, [timingTrainerEnabled, timingTrainerHear, timingTrainerMute, timingTrainerMuteTracks, currentSong?.id]);

  // Register Loop Wrap callback to automatically increment speed if Speed Trainer is active
  useEffect(() => {
    audioEngine.registerLoopCallback(() => {
      if (speedTrainerEnabled) {
        setTempoPercent((prev) => {
          const next = Math.min(speedTrainerMax, prev + speedTrainerStep);
          if (next !== prev) {
            audioEngine.setTempoPercent(next);
            triggerSpeedTrainerToast(next);
          }
          return next;
        });
      }
    });
  }, [speedTrainerEnabled, speedTrainerStep, speedTrainerMax]);

  // Write changes to local storage
  useEffect(() => {
    localStorage.setItem('drumpractice_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('drumpractice_notes', JSON.stringify(songNotes));
  }, [songNotes]);

  useEffect(() => {
    localStorage.setItem('drumpractice_stats', JSON.stringify(practiceStats));
  }, [practiceStats]);

  // Track session counters and daily statistics
  useEffect(() => {
    if (playbackStatus === 'playing' && currentSong) {
      const songId = currentSong.id;
      setPracticeStats((prev) => {
        const existing = prev[songId] || { playCount: 0, lastPracticed: '', totalDuration: 0 };
        return {
          ...prev,
          [songId]: {
            ...existing,
            playCount: existing.playCount + 1,
            lastPracticed: new Date().toISOString(),
          },
        };
      });
    }
  }, [playbackStatus, currentSong?.id]);

  // Track actual active playing duration in seconds
  useEffect(() => {
    if (playbackStatus !== 'playing' || !currentSong) return;

    const songId = currentSong.id;
    const interval = setInterval(() => {
      setPracticeStats((prev) => {
        const existing = prev[songId] || { playCount: 0, lastPracticed: '', totalDuration: 0 };
        return {
          ...prev,
          [songId]: {
            ...existing,
            totalDuration: existing.totalDuration + 1,
          },
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [playbackStatus, currentSong?.id]);

  const handleToggleFavorite = (songId: string) => {
    setFavorites((prev) => ({
      ...prev,
      [songId]: !prev[songId],
    }));
  };

  const handleResetSongStats = (songId: string) => {
    setPracticeStats((prev) => {
      const updated = {
        ...prev,
        [songId]: { playCount: 0, lastPracticed: '', totalDuration: 0 },
      };
      localStorage.setItem('drumpractice_stats', JSON.stringify(updated));
      return updated;
    });
    localStorage.removeItem(`drumpractice_history_${songId}`);
    localStorage.removeItem(`drumpractice_practice_${songId}`);
    localStorage.removeItem(`drumpractice_confidence_${songId}`);
  };

  const handleResetAllSettings = () => {
    // Clear all localStorage keys matching drumpractice_
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('drumpractice_')) {
        localStorage.removeItem(key);
      }
    });
    
    // Clear in-memory state variables to factory defaults
    setDeletedSongIds([]);
    setFavorites({});
    setSongNotes({});
    setSongBpms({});
    setPracticeStats({});
    setSpeedTrainerEnabled(false);
    setSpeedTrainerStep(5);
    setSpeedTrainerMax(150);
    setTimingTrainerEnabled(false);
    setTimingTrainerHear(4);
    setTimingTrainerMute(4);
    setTimingTrainerMuteTracks({ Drum: false, Gesang: false, Instrumente: false, Klick: true });
    
    setVolumes({
      Drum: 1.0,
      Gesang: 1.0,
      Instrumente: 1.0,
      Klick: 1.0,
    });
    setMasterVolume(1.0);
    setTempoPercent(100);
    setCountInEnabled(true);
    
    // Reload original PRESET_SONGS list
    setSongs(PRESET_SONGS);
    if (PRESET_SONGS.length > 0) {
      setCurrentSong(PRESET_SONGS[0]);
    }
    
    // Reset A-B loops
    setLoopA(null);
    setLoopB(null);
    setLoopEnabled(false);

    // Stop current playbacks and reset audio engine values
    audioEngine.stop();
    audioEngine.setBpm(PRESET_SONGS.length > 0 ? PRESET_SONGS[0].bpm : 120);
    audioEngine.setTempoPercent(100);
    audioEngine.setMasterVolume(1.0);
    audioEngine.setVolume('Drum', 1.0);
    audioEngine.setVolume('Gesang', 1.0);
    audioEngine.setVolume('Instrumente', 1.0);
    audioEngine.setVolume('Klick', 1.0);

    triggerToast("Werkseinstellungen reaktiviert & alle Notizen gelöscht! ⚙️");
  };

  const handleSaveNote = (songId: string, note: string) => {
    setSongNotes((prev) => ({
      ...prev,
      [songId]: note,
    }));
  };

  const handleDeleteSong = (songId: string) => {
    let nextSongToSelect: Song | null = null;
    if (currentSong?.id === songId) {
      audioEngine.stop();
      
      const remainingSongs = songs.filter((s) => s.id !== songId);
      const sameBookSongs = remainingSongs.filter((s) => s.book === selectedBook);
      if (sameBookSongs.length > 0) {
        nextSongToSelect = sameBookSongs[0];
      } else if (remainingSongs.length > 0) {
        nextSongToSelect = remainingSongs[0];
      }
      
      setCurrentSong(nextSongToSelect);
      if (nextSongToSelect) {
        setSelectedBook(nextSongToSelect.book);
      } else {
        setSelectedBook(null);
      }
    }

    setDeletedSongIds((prev) => {
      const next = prev.includes(songId) ? prev : [...prev, songId];
      localStorage.setItem('drumpractice_deleted_songs', JSON.stringify(next));
      return next;
    });

    setSongs((prev) => prev.filter((s) => s.id !== songId));
    delete bufferCache[songId];
    
    // Clean up local states
    setFavorites((prev) => {
      const updated = { ...prev };
      delete updated[songId];
      return updated;
    });
    setSongNotes((prev) => {
      const updated = { ...prev };
      delete updated[songId];
      return updated;
    });
    setPracticeStats((prev) => {
      const updated = { ...prev };
      delete updated[songId];
      return updated;
    });
  };

  // 1. Initial configuration load (settings.json equivalent)
  useEffect(() => {
    try {
      const savedVolumes = localStorage.getItem('drum_practice_mixer_volumes');
      if (savedVolumes) {
        const parsed = JSON.parse(savedVolumes);
        setVolumes(parsed);
        // Sync with engine
        Object.keys(parsed).forEach((k) => {
          audioEngine.setVolume(k as TrackType, parsed[k]);
        });
      }

      const savedMaster = localStorage.getItem('drum_practice_mixer_master');
      if (savedMaster) {
        const parsed = parseFloat(savedMaster);
        setMasterVolume(parsed);
        audioEngine.setMasterVolume(parsed);
      }

      const savedCountIn = localStorage.getItem('drum_practice_mixer_count_in');
      if (savedCountIn !== null) {
        const parsed = savedCountIn === 'true';
        setCountInEnabled(parsed);
        audioEngine.setCountIn(parsed);
      }
    } catch (e) {
      console.warn('Failed to load local settings:', e);
    }
  }, []);

  // 2. Synchronise Audio Engine parameters
  useEffect(() => {
    audioEngine.setTempoPercent(tempoPercent);
  }, [tempoPercent]);

  useEffect(() => {
    audioEngine.setLoop(loopEnabled, loopA, loopB);
  }, [loopEnabled, loopA, loopB]);

  useEffect(() => {
    audioEngine.setCountIn(countInEnabled);
  }, [countInEnabled]);

  // Save volume changes to localStorage (equivalent of save_settings in python)
  const handleVolumeChange = (track: TrackType, volume: number) => {
    const updated = { ...volumes, [track]: volume };
    setVolumes(updated);
    audioEngine.setVolume(track, volume);
    localStorage.setItem('drum_practice_mixer_volumes', JSON.stringify(updated));
  };

  const handleMasterVolumeChange = (volume: number) => {
    setMasterVolume(volume);
    audioEngine.setMasterVolume(volume);
    localStorage.setItem('drum_practice_mixer_master', volume.toString());
  };

  const handleToggleCountIn = () => {
    const nextVal = !countInEnabled;
    setCountInEnabled(nextVal);
    audioEngine.setCountIn(nextVal);
    localStorage.setItem('drum_practice_mixer_count_in', nextVal.toString());
  };

  // 3. Register AudioEngine callback listeners
  useEffect(() => {
    audioEngine.registerCallbacks(
      (time) => {
        setCurrentPosition(time);
      },
      (status, countVal) => {
        setPlaybackStatus(status);
        if (status === 'counting') {
          setCountdownValue(countVal);
        } else {
          setCountdownValue(undefined);
        }
      }
    );
  }, []);

  // 4. Load Song into AudioEngine (Synthesis or User Upload)
  const loadSongIntoEngine = async (song: Song) => {
    setIsLoadingSong(true);
    audioEngine.stop();
    setLoopA(null);
    setLoopB(null);
    setLoopEnabled(false);
    setCurrentPosition(0);

    try {
      audioEngine.init();

      // Extract cover art lazily if not loaded yet
      if (!song.coverUrl) {
        if (song.localFlacFile) {
          try {
            const flacCover = await extractFlacCover(song.localFlacFile);
            if (flacCover) {
              song.coverUrl = flacCover;
            }
          } catch (coverErr) {
            console.warn('Failed to extract FLAC cover from file:', coverErr);
          }
        } else if (song.localFlacFileHandle) {
          try {
            const file = await song.localFlacFileHandle.getFile();
            const flacCover = await extractFlacCover(file);
            if (flacCover) {
              song.coverUrl = flacCover;
            }
          } catch (coverErr) {
            console.warn('Failed to extract FLAC cover:', coverErr);
          }
        }
        
        // Fallback to local image file in the same folder if FLAC has no cover or failed
        if (!song.coverUrl && song.localCoverFile) {
          song.coverUrl = URL.createObjectURL(song.localCoverFile);
        } else if (!song.coverUrl && song.localCoverFileHandle) {
          try {
            const file = await song.localCoverFileHandle.getFile();
            song.coverUrl = URL.createObjectURL(file);
          } catch (coverErr) {
            console.warn('Failed to load local image cover:', coverErr);
          }
        }
      }

      // Build target tracks structure for the audio engine
      const tracksToLoad: Partial<Record<TrackType, { buffer?: AudioBuffer; file?: File; fileHandle?: FileSystemFileHandle }>> = {};

      if (song.isLocalFolderSong) {
        (Object.keys(song.tracks) as TrackType[]).forEach((tr) => {
          const trackData = song.tracks[tr];
          if (trackData) {
            tracksToLoad[tr] = {
              file: trackData.file,
              fileHandle: trackData.fileHandle,
              buffer: trackData.audioBuffer,
            };
          }
        });
      } else if (song.isUserAdded) {
        (Object.keys(song.tracks) as TrackType[]).forEach((tr) => {
          const trackData = song.tracks[tr];
          if (trackData) {
            tracksToLoad[tr] = {
              file: trackData.file,
              buffer: trackData.audioBuffer,
            };
          }
        });
      } else {
        // Preset songs - synthesize buffers
        const targetBpm = songBpms[song.id] || song.bpm || 120;
        const cacheKey = `${song.id}_${targetBpm}`;
        let buffers = bufferCache[cacheKey];
        if (!buffers) {
          buffers = await synthesizeSongTracks(song.id, targetBpm, 16);
          bufferCache[cacheKey] = buffers;
        }
        (Object.keys(buffers) as TrackType[]).forEach((tr) => {
          tracksToLoad[tr] = { buffer: buffers[tr] };
          // Store in song metadata so the structure analyzer has access
          if (song.tracks[tr]) {
            song.tracks[tr]!.audioBuffer = buffers[tr];
          }
        });
      }

      const bpm = songBpms[song.id] || song.bpm || 120;
      await audioEngine.setTracks(tracksToLoad, bpm);
      setSongDuration(audioEngine.getDuration());
    } catch (error) {
      console.error('Error loading song:', error);
    } finally {
      setIsLoadingSong(false);
    }
  };

  const songBpm = currentSong ? (songBpms[currentSong.id] || currentSong.bpm || 120) : 120;

  // Load song on start or when song/BPM changes
  useEffect(() => {
    if (currentSong) {
      loadSongIntoEngine(currentSong);
    }
  }, [currentSong?.id, songBpm]);

  // Local folder connection handlers
  const handleConnectLocalFolder = async () => {
    try {
      setIsScanningLocalFolder(true);
      setLocalFolderStats({ scanned: 0, found: 0 });
      
      const handle = await (window as any).showDirectoryPicker();
      await saveDirectoryHandle(handle);
      setLocalFolderHandle(handle);
      setIsLocalFolderConnected(true);
      
      const localSongs = await scanLocalDirectory(handle, (scanned, found) => {
        setLocalFolderStats({ scanned, found });
      });
      
      const filteredLocalSongs = localSongs.filter((s) => !deletedSongIds.includes(s.id));
      
      if (filteredLocalSongs.length > 0) {
        setSongs((prev) => {
          const presetsOnly = prev.filter((s) => !s.isLocalFolderSong);
          return [...filteredLocalSongs, ...presetsOnly];
        });
        
        setCurrentSong(filteredLocalSongs[0]);
        setSelectedBook(filteredLocalSongs[0].book);
      }
    } catch (err) {
      console.error("Fehler beim Verbinden des lokalen Ordners:", err);
    } finally {
      setIsScanningLocalFolder(false);
    }
  };

  const handleLoadLocalFiles = async (files: File[]) => {
    try {
      setIsScanningLocalFolder(true);
      setLocalFolderStats({ scanned: 0, found: 0 });
      setIsLocalFolderConnected(true);

      const localSongs = await scanLocalFilesList(files, (scanned, found) => {
        setLocalFolderStats({ scanned, found });
      });

      const filteredLocalSongs = localSongs.filter((s) => !deletedSongIds.includes(s.id));

      if (filteredLocalSongs.length > 0) {
        setSongs((prev) => {
          const presetsOnly = prev.filter((s) => !s.isLocalFolderSong);
          return [...filteredLocalSongs, ...presetsOnly];
        });

        setCurrentSong(filteredLocalSongs[0]);
        setSelectedBook(filteredLocalSongs[0].book);
      } else {
        triggerToast("Keine gültigen Songs im Ordner gefunden. Stelle sicher, dass Songs in Unterordnern liegen.");
        setIsLocalFolderConnected(false);
      }
    } catch (err) {
      console.error("Fehler beim Laden der lokalen Dateien:", err);
      setIsLocalFolderConnected(false);
    } finally {
      setIsScanningLocalFolder(false);
    }
  };

  const handleReconnectStoredFolder = async () => {
    if (!localFolderHandle) return;
    try {
      setIsScanningLocalFolder(true);
      setLocalFolderStats({ scanned: 0, found: 0 });
      
      // Request permission
      // @ts-ignore
      const permission = await localFolderHandle.requestPermission({ mode: 'read' });
      if (permission === 'granted') {
        const localSongs = await scanLocalDirectory(localFolderHandle, (scanned, found) => {
          setLocalFolderStats({ scanned, found });
        });
        
        const filteredLocalSongs = localSongs.filter((s) => !deletedSongIds.includes(s.id));
        
        if (filteredLocalSongs.length > 0) {
          setSongs((prev) => {
            const presetsOnly = prev.filter((s) => !s.isLocalFolderSong);
            return [...filteredLocalSongs, ...presetsOnly];
          });
          setCurrentSong(filteredLocalSongs[0]);
          setSelectedBook(filteredLocalSongs[0].book);
        }
      } else {
        triggerToast("Zugriff verweigert. Manuelle Bestätigung im Browser erforderlich.");
      }
    } catch (err) {
      console.error("Fehler beim Reaktivieren des Ordners:", err);
      await clearDirectoryHandle();
      setLocalFolderHandle(null);
      setIsLocalFolderConnected(false);
    } finally {
      setIsScanningLocalFolder(false);
    }
  };

  const handleDisconnectLocalFolder = async () => {
    await clearDirectoryHandle();
    setLocalFolderHandle(null);
    setIsLocalFolderConnected(false);
    setLocalFolderStats(null);
    
    // Restore remaining preset songs
    const remainingPresets = PRESET_SONGS.filter((s) => !deletedSongIds.includes(s.id));
    setSongs(remainingPresets);
    if (remainingPresets.length > 0) {
      setCurrentSong(remainingPresets[0]);
      setSelectedBook(remainingPresets[0].book);
    } else {
      setCurrentSong(null);
      setSelectedBook(null);
    }
  };

  // Handlers
  const handleSelectBook = (book: string) => {
    setSelectedBook(book);
    // Auto-select first song of the book
    const bookSongs = songs.filter((s) => s.book === book);
    if (bookSongs.length > 0) {
      setCurrentSong(bookSongs[0]);
    }
  };

  const handleSelectSong = (song: Song) => {
    setCurrentSong(song);
  };

  const handlePlayPause = () => {
    // If stopped, play. If playing, pause. If paused, play.
    if (playbackStatus === 'playing') {
      audioEngine.pause();
    } else {
      audioEngine.play();
    }
  };

  const handleStop = () => {
    audioEngine.stop();
  };

  const handleSkip = (seconds: number) => {
    const cur = audioEngine.getCurrentPosition();
    audioEngine.seek(cur + seconds);
  };

  const handleSeek = (seconds: number) => {
    audioEngine.seek(seconds);
  };

  const handleImportedSong = (newSong: Song, decodedBuffers: Record<TrackType, AudioBuffer>) => {
    // Cache the decoded buffers directly
    bufferCache[newSong.id] = decodedBuffers;

    // Add song to list
    setSongs((prev) => [newSong, ...prev]);

    // Select the newly imported song
    setSelectedBook(newSong.book);
    setCurrentSong(newSong);
    setShowImporter(false);
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text font-sans flex flex-col justify-between relative overflow-x-hidden">
      {/* Floating Trainer Toast Notification */}
      {trainerToastMsg && (
        <div className="fixed top-6 right-6 z-50 bg-amber-500 text-black font-black px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce border border-amber-400">
          <span>🚀</span>
          <span>{trainerToastMsg}</span>
        </div>
      )}

      {/* Dynamic top background neon glow bar */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-amber-500/5 blur-3xl rounded-full pointer-events-none" />

      {/* Unified Top Navigation Header */}
      <header className="border-b border-brand-border bg-brand-card/35 backdrop-blur-md relative z-20">
        <div className="w-full max-w-7xl xl:max-w-[1600px] mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Disc className="w-6 h-6 text-amber-500 animate-spin shrink-0" style={{ animationDuration: '8s' }} />
            <div>
              <h1 className="text-base font-black text-white tracking-tight flex items-center gap-2">
                DRUM MIXER <span className="text-amber-500 font-mono text-[9px] font-bold px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded">V1.0</span>
              </h1>
              <p className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">Professioneller Multi-Spur Übungs-Mixer am PC</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {currentSong && (
              <div className="text-[10px] font-mono bg-black/40 border border-brand-border rounded-lg px-2.5 py-1 text-slate-400">
                Aktiver Song: <span className="text-amber-500 font-bold">{currentSong.title}</span> ({currentSong.bpm} BPM)
              </div>
            )}
            <button
              onClick={() => setShowImporter(true)}
              className="px-3 py-1 bg-amber-500 text-black hover:bg-amber-400 text-[10px] font-bold rounded-lg transition flex items-center gap-1 cursor-pointer shadow-md shadow-amber-500/10"
              id="top-header-import-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              Spuren importieren
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="w-full max-w-[1600px] mx-auto px-4 py-6 flex-1 flex flex-col gap-6 relative z-10">
        
        {/* Three Column Landscape Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Spalte 1: Sidebar (Songs & Alben) */}
          <div className="lg:col-span-3 flex flex-col">
            <Sidebar
              songs={songs}
              selectedBook={selectedBook}
              currentSong={currentSong}
              onSelectBook={handleSelectBook}
              onSelectSong={handleSelectSong}
              onOpenImporter={() => setShowImporter(true)}
              localFolderHandle={localFolderHandle}
              isLocalFolderConnected={isLocalFolderConnected}
              isScanningLocalFolder={isScanningLocalFolder}
              localFolderStats={localFolderStats}
              onConnectLocalFolder={handleConnectLocalFolder}
              onReconnectStoredFolder={handleReconnectStoredFolder}
              onDisconnectLocalFolder={handleDisconnectLocalFolder}
              onLoadLocalFiles={handleLoadLocalFiles}
              onDeleteSong={handleDeleteSong}
              onToggleFavorite={handleToggleFavorite}
              favorites={favorites}
              onResetAllSettings={handleResetAllSettings}
            />
          </div>

          {/* Spalte 2: Player & Mixer (Mitte) */}
          <div className="lg:col-span-5 flex flex-col gap-5 justify-start">
            {/* Song cover art and core details banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
              <div className="sm:col-span-1">
                <CoverArt
                  currentSong={currentSong}
                  playbackStatus={playbackStatus}
                  tempoPercent={tempoPercent}
                />
              </div>

              {/* High-level status panel & speed info */}
              <div className="sm:col-span-2 bg-brand-card border border-brand-border rounded-xl p-4 shadow-xl flex flex-col justify-between relative overflow-hidden">
                {isLoadingSong && (
                  <div className="absolute inset-0 bg-brand-card/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
                    <Disc className="w-8 h-8 text-amber-500 animate-spin" />
                    <span className="text-xs text-amber-500 font-mono font-bold uppercase tracking-wider animate-pulse">
                      Lade Audio...
                    </span>
                  </div>
                )}

                <div>
                  <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Settings className="w-3 h-3" />
                    Systemstatus / Hilfe
                  </h3>
                  <div className="grid grid-cols-2 gap-2 mt-0.5">
                    <div className="bg-black/40 rounded-lg p-2 border border-brand-border">
                      <div className="text-[9px] uppercase font-bold text-slate-500 font-mono tracking-wider">
                        Status
                      </div>
                      <div className="text-xs font-semibold mt-0.5 font-mono flex items-center gap-1.5">
                        {playbackStatus === 'playing' && (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                            <span className="text-emerald-400 font-bold uppercase text-[10px]">Wiedergabe</span>
                          </>
                        )}
                        {playbackStatus === 'paused' && (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                            <span className="text-amber-400 font-bold uppercase text-[10px]">Pausiert</span>
                          </>
                        )}
                        {playbackStatus === 'stopped' && (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-600 inline-block" />
                            <span className="text-slate-500 font-bold uppercase text-[10px]">Bereit</span>
                          </>
                        )}
                        {playbackStatus === 'counting' && (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping inline-block" />
                            <span className="text-rose-400 font-bold uppercase text-[10px]">Count-In</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="bg-black/40 rounded-lg p-2 border border-brand-border">
                      <div className="text-[9px] uppercase font-bold text-slate-500 font-mono tracking-wider">
                        A-B Looping
                      </div>
                      <div className="text-xs font-semibold mt-0.5 font-mono text-[10px]">
                        {loopA !== null && loopB !== null ? (
                          <span className={loopEnabled ? 'text-amber-500 font-bold' : 'text-slate-400 font-medium'}>
                            {loopEnabled ? 'AKTIV' : 'BEREIT'}
                          </span>
                        ) : (
                          <span className="text-slate-600">INAKTIV</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-1.5 p-1.5 rounded bg-amber-500/5 border border-amber-500/10 text-[9px] text-slate-400 flex items-start gap-1">
                  <Info className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    Langsamer üben bei <span className="text-amber-500 font-bold">50%</span> oder <span className="text-amber-500 font-bold">75%</span> Tempo!
                  </div>
                </div>
              </div>
            </div>

            {/* Main Interactive Controls & Pitch */}
            <PlayerControls
              playbackStatus={playbackStatus}
              countdownValue={countdownValue}
              originalBpm={songBpm}
              tempoPercent={tempoPercent}
              countInEnabled={countInEnabled}
              onPlayPause={handlePlayPause}
              onStop={handleStop}
              onSkip={handleSkip}
              onTempoPercentChange={setTempoPercent}
              onToggleCountIn={handleToggleCountIn}
            />

            {/* Interactive Timeline Canvas */}
            <Timeline
              currentPosition={currentPosition}
              duration={songDuration}
              loopEnabled={loopEnabled}
              loopA={loopA}
              loopB={loopB}
              onSeek={handleSeek}
              onSetLoopA={(val) => {
                setLoopA(val);
                if (loopB !== null && val < loopB) {
                  setLoopEnabled(true);
                }
              }}
              onSetLoopB={(val) => {
                if (loopA !== null && val > loopA) {
                  setLoopB(val);
                  setLoopEnabled(true);
                }
              }}
              onClearLoop={() => {
                setLoopA(null);
                setLoopB(null);
                setLoopEnabled(false);
              }}
              onToggleLoop={() => setLoopEnabled(!loopEnabled)}
            />

            {/* Multi-Channel Mixer Board directly inside Column 2 */}
            <div className="w-full">
              <Mixer
                volumes={volumes}
                masterVolume={masterVolume}
                onVolumeChange={handleVolumeChange}
                onMasterVolumeChange={handleMasterVolumeChange}
                isPlaying={playbackStatus === 'playing'}
              />
            </div>
          </div>

          {/* Spalte 3: Practice Dashboard (Übungshilfen, Sektionen, Notizen, Streaks) */}
          <div className="lg:col-span-4 flex flex-col">
            <SongPracticeDashboard
              currentSong={currentSong}
              currentPosition={currentPosition}
              duration={songDuration}
              onSeek={handleSeek}
              onSetLoopA={(val) => {
                setLoopA(val);
                if (loopB !== null && val < loopB) {
                  setLoopEnabled(true);
                }
              }}
              onSetLoopB={(val) => {
                setLoopB(val);
                if (loopA !== null && val > loopA) {
                  setLoopEnabled(true);
                }
              }}
              isFavorite={currentSong ? !!favorites[currentSong.id] : false}
              onToggleFavorite={() => currentSong && handleToggleFavorite(currentSong.id)}
              note={currentSong ? songNotes[currentSong.id] || '' : ''}
              onSaveNote={(text) => currentSong && handleSaveNote(currentSong.id, text)}
              stats={currentSong ? practiceStats[currentSong.id] || { playCount: 0, lastPracticed: '', totalDuration: 0 } : { playCount: 0, lastPracticed: '', totalDuration: 0 }}
              loopA={loopA}
              loopB={loopB}
              songBpm={songBpm}
              onUpdateSongBpm={(bpm) => currentSong && handleUpdateSongBpm(currentSong.id, bpm)}
              playbackStatus={playbackStatus}
              speedTrainerEnabled={speedTrainerEnabled}
              onToggleSpeedTrainer={setSpeedTrainerEnabled}
              speedTrainerStep={speedTrainerStep}
              onUpdateSpeedTrainerStep={setSpeedTrainerStep}
              speedTrainerMax={speedTrainerMax}
              onUpdateSpeedTrainerMax={setSpeedTrainerMax}
              timingTrainerEnabled={timingTrainerEnabled}
              onToggleTimingTrainer={setTimingTrainerEnabled}
              timingTrainerHear={timingTrainerHear}
              onUpdateTimingTrainerHear={setTimingTrainerHear}
              timingTrainerMute={timingTrainerMute}
              onUpdateTimingTrainerMute={setTimingTrainerMute}
              timingTrainerMuteTracks={timingTrainerMuteTracks}
              onUpdateTimingTrainerMuteTracks={setTimingTrainerMuteTracks}
              onResetSongStats={() => currentSong && handleResetSongStats(currentSong.id)}
            />
          </div>

        </div>

        {/* Importer Section (Drawer or collapsible bottom banner) */}
        <div className="w-full">
          {showImporter ? (
            <div className="relative mt-2">
              <button
                onClick={() => setShowImporter(false)}
                className="absolute top-4 right-4 text-xs font-semibold text-slate-500 hover:text-slate-300 border border-brand-border px-2 py-1 rounded bg-brand-bg transition cursor-pointer"
                id="close-importer-btn"
              >
                Abbrechen
              </button>
              <SongImporter onSongImported={handleImportedSong} />
            </div>
          ) : (
            <div className="text-center">
              <button
                onClick={() => setShowImporter(true)}
                className="text-xs font-medium text-slate-500 hover:text-amber-500 border border-dashed border-brand-border rounded-xl px-6 py-4 w-full bg-brand-bg/20 hover:bg-brand-bg/40 transition cursor-pointer"
                id="show-importer-trigger-btn"
              >
                + Eigenes Song-Verzeichnis oder Drum-Spuren (.WAV/.MP3) importieren, um mit deinen eigenen Songs zu üben!
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Humble professional footer */}
      <footer className="w-full py-4 text-center border-t border-brand-border/60 bg-brand-footer text-[10px] text-slate-600 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Drum Mixer V1.0 - Präzises Üben am PC</span>
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-500" /> Web Audio API Engine
          </span>
        </div>
      </footer>
    </div>
  );
}
