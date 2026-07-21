import React from 'react';
import { Song } from '../types';
import { BOOKS } from '../songsData';
import { BookOpen, Disc, Music, Plus, Folder, FolderOpen, RefreshCw, CheckCircle2, Trash2, Star, RotateCcw, Search, Clock } from 'lucide-react';

const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0 || isNaN(seconds)) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface SidebarProps {
  songs: Song[];
  selectedBook: string | null;
  currentSong: Song | null;
  onSelectBook: (book: string) => void;
  onSelectSong: (song: Song) => void;
  onOpenImporter: () => void;
  
  // Local folder connection states & handlers
  localFolderHandle: FileSystemDirectoryHandle | null;
  isLocalFolderConnected: boolean;
  isScanningLocalFolder: boolean;
  localFolderStats: { scanned: number; found: number } | null;
  onConnectLocalFolder: () => void;
  onReconnectStoredFolder: () => void;
  onDisconnectLocalFolder: () => void;
  onLoadLocalFiles: (files: File[]) => void;

  // New features
  onDeleteSong?: (songId: string) => void;
  onToggleFavorite?: (songId: string) => void;
  favorites?: Record<string, boolean>;
  onRestorePresets?: () => void;
  hasDeletedPresets?: boolean;
  onResetAllSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  songs,
  selectedBook,
  currentSong,
  onSelectBook,
  onSelectSong,
  onOpenImporter,
  localFolderHandle,
  isLocalFolderConnected,
  isScanningLocalFolder,
  localFolderStats,
  onConnectLocalFolder,
  onReconnectStoredFolder,
  onDisconnectLocalFolder,
  onLoadLocalFiles,
  onDeleteSong,
  onToggleFavorite,
  favorites = {},
  onRestorePresets,
  hasDeletedPresets = false,
  onResetAllSettings,
}) => {
  // Compute dynamic unique books based on standard books plus current songs list
  const dynamicBooks = Array.from(new Set([...BOOKS, ...songs.map((s) => s.book as string)]));
  
  const [songIdToConfirmDelete, setSongIdToConfirmDelete] = React.useState<string | null>(null);

  // Filter/Sort/Search local states
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterType, setFilterType] = React.useState<'all' | 'favorites' | 'practiced'>('all');
  const [sortBy, setSortBy] = React.useState<'name' | 'bpm-asc' | 'bpm-desc' | 'duration-asc' | 'duration-desc' | 'practice' | 'confidence'>('name');
  const [showConfirmReset, setShowConfirmReset] = React.useState(false);

  // Processed songs list based on search, filter, and sort
  const processedSongs = React.useMemo(() => {
    let list = songs.filter((s) => s.book === selectedBook);

    // Filter by search query if any
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) => 
        s.title.toLowerCase().includes(q) || 
        (s.subtitle && s.subtitle.toLowerCase().includes(q))
      );
    }

    // Filter by favorites / practice status
    if (filterType === 'favorites') {
      list = list.filter((s) => favorites[s.id]);
    } else if (filterType === 'practiced') {
      list = list.filter((s) => {
        const pLevel = localStorage.getItem(`drumpractice_practice_${s.id}`);
        return pLevel && parseInt(pLevel) > 0;
      });
    }

    // Sort list
    list = [...list].sort((a, b) => {
      if (sortBy === 'name') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'bpm-asc') {
        return a.bpm - b.bpm;
      }
      if (sortBy === 'bpm-desc') {
        return b.bpm - a.bpm;
      }
      if (sortBy === 'duration-asc') {
        return (a.duration || 0) - (b.duration || 0);
      }
      if (sortBy === 'duration-desc') {
        return (b.duration || 0) - (a.duration || 0);
      }
      if (sortBy === 'practice') {
        const pA = parseInt(localStorage.getItem(`drumpractice_practice_${a.id}`) || '0');
        const pB = parseInt(localStorage.getItem(`drumpractice_practice_${b.id}`) || '0');
        return pB - pA;
      }
      if (sortBy === 'confidence') {
        const cA = parseInt(localStorage.getItem(`drumpractice_confidence_${a.id}`) || '0');
        const cB = parseInt(localStorage.getItem(`drumpractice_confidence_${b.id}`) || '0');
        return cB - cA;
      }
      return 0;
    });

    return list;
  }, [songs, selectedBook, searchQuery, filterType, sortBy, favorites]);

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl p-4 shadow-xl h-full flex flex-col gap-4" id="app-sidebar">
      {/* 1. Mediathek & Ordner */}
      <div>
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Music className="w-4 h-4 text-amber-500" />
          1. Mediathek & Ordner
        </h2>
        <p className="text-[10px] text-slate-500 mt-0.5">Wähle ein Übungsbuch und deine Songs</p>
      </div>

      {/* 📁 NEW: Offline-Ordner Integration (E:\DrumMixer Songs) */}
      <div className="bg-black/25 border border-brand-border/80 rounded-xl p-3 flex flex-col gap-2.5 shadow-inner">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className={`w-4 h-4 ${isLocalFolderConnected ? 'text-amber-500' : 'text-slate-400'}`} />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Offline-Ordner (E:)</span>
          </div>
          {isLocalFolderConnected && !isScanningLocalFolder && (
            <button
              onClick={onDisconnectLocalFolder}
              className="p-1 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded transition cursor-pointer"
              title="Ordner-Verbindung trennen"
              id="disconnect-folder-btn"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* State A: Scanning in progress */}
        {isScanningLocalFolder && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 text-xs text-amber-500 font-medium">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Scanne Musik-Verzeichnis...</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {localFolderStats 
                ? `${localFolderStats.scanned} Ordner durchsucht, ${localFolderStats.found} Songs geladen.`
                : 'Analysiere Unterordner...'}
            </div>
          </div>
        )}

        {/* State B: Saved handle from IndexedDB needs permission reactivation */}
        {!isScanningLocalFolder && isLocalFolderConnected && localFolderHandle && songs.filter(s => s.isLocalFolderSong).length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Dein Verzeichnis <span className="text-slate-300 font-semibold font-mono">E:\DrumMixer Songs</span> ist im Browser gespeichert. Klicke auf Aktivieren, um den Zugriff freizuschalten.
            </p>
            <button
              onClick={onReconnectStoredFolder}
              className="w-full py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 hover:text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
              id="reactivate-folder-btn"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Zugriff reaktivieren
            </button>
          </div>
        )}

        {/* State C: Connected & Fully Loaded */}
        {!isScanningLocalFolder && isLocalFolderConnected && songs.filter(s => s.isLocalFolderSong).length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold font-mono">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>AKTIV VERBUNDEN</span>
            </div>
            <div className="text-[10px] text-slate-400 leading-tight">
              Pfad: <span className="text-slate-300 font-mono">E:\DrumMixer Songs</span>
              <br />
              <span className="text-amber-500 font-semibold font-mono">{songs.filter(s => s.isLocalFolderSong).length}</span> eigene Songs geladen.
            </div>
            <button
              onClick={onConnectLocalFolder}
              className="w-full mt-1 py-1 px-2.5 bg-brand-bg hover:bg-brand-border/40 text-slate-400 hover:text-slate-200 border border-brand-border rounded-md text-[10px] font-mono flex items-center justify-center gap-1.5 transition cursor-pointer"
              id="rescan-folder-btn"
            >
              <RefreshCw className="w-3 h-3" /> Ordner neu einlesen / aktualisieren
            </button>
          </div>
        )}

        {/* State D: Not Connected */}
        {!isScanningLocalFolder && !isLocalFolderConnected && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Wähle deinen Ordner aus, um alle Songs mit FLAC-Covern offline einzulesen.
            </p>
            
            {/* Standard HTML5 Folder Upload (100% compatible with iFrame & all browsers) */}
            <button
              onClick={() => document.getElementById('local-folder-upload-input')?.click()}
              className="w-full py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/30 transition cursor-pointer"
              id="upload-folder-btn"
            >
              <Folder className="w-4 h-4 fill-black" />
              Ordner "E:\DrumMixer Songs" öffnen
            </button>
            
            <input
              type="file"
              id="local-folder-upload-input"
              // @ts-ignore
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  onLoadLocalFiles(Array.from(files));
                }
              }}
            />

            <div className="text-[9px] text-slate-500 text-center italic mt-1">
              Kompatibilitätsmodus für eingebettete Browser-Vorschau aktiv.
            </div>
          </div>
        )}
      </div>

      <hr className="border-brand-border/60" />

      {/* Book selector buttons */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" />
          Songbücher (Books)
        </h3>
        <div className="flex flex-col gap-1 overflow-y-auto max-h-[160px] pr-1 scrollbar-thin">
          {dynamicBooks.map((book) => {
            const isActive = selectedBook === book;
            const songCount = songs.filter((s) => s.book === book).length;

            return (
              <button
                key={book}
                onClick={() => onSelectBook(book)}
                className={`w-full text-left p-2.5 rounded-lg text-[11px] font-medium border transition duration-200 flex items-center justify-between group cursor-pointer ${
                  isActive
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 font-semibold'
                    : 'bg-brand-bg/40 border-brand-border/60 text-slate-400 hover:text-slate-200 hover:border-brand-border'
                }`}
                id={`book-btn-${(book as string).toLowerCase().replace(/\s+/g, '-')}`}
              >
                <span className="truncate pr-2">{book}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono shrink-0 transition ${
                    isActive ? 'bg-amber-500/20 text-amber-300 font-bold' : 'bg-brand-card text-slate-500 group-hover:text-slate-300'
                  }`}
                >
                  {songCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <hr className="border-brand-border/60" />

      {/* Song List based on active Book selection */}
      <div className="flex-1 flex flex-col min-h-[180px] lg:min-h-[250px]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5" />
            Songs ({processedSongs.length})
          </h3>
          <button
            onClick={onOpenImporter}
            className="text-[9px] font-semibold text-amber-500 hover:text-amber-400 flex items-center gap-0.5 px-2 py-1 bg-brand-bg rounded-lg border border-brand-border hover:border-amber-500/30 transition cursor-pointer"
            id="open-importer-sidebar-btn"
          >
            <Plus className="w-3 h-3" /> Import
          </button>
        </div>

        {/* 🔍 Search, Filter & Sort Controls */}
        <div className="space-y-1.5 bg-black/15 border border-brand-border/40 p-2 rounded-xl mb-2.5">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-brand-border/80 focus:border-amber-500/50 rounded-lg pl-8 pr-3 py-1 text-[11px] text-white placeholder-slate-500 outline-none transition"
            />
          </div>

          {/* Filter & Sort selectors */}
          <div className="grid grid-cols-2 gap-1.5">
            {/* Filter Dropdown */}
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider font-mono">Filter</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full bg-black/60 border border-brand-border/80 text-slate-300 rounded px-1 py-0.5 text-[10px] outline-none cursor-pointer focus:border-amber-500/50 font-medium"
              >
                <option value="all" className="bg-brand-card">Alle Songs</option>
                <option value="favorites" className="bg-brand-card">★ Favoriten</option>
                <option value="practiced" className="bg-brand-card">✓ Geübt</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider font-mono">Sortieren</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-black/60 border border-brand-border/80 text-slate-300 rounded px-1 py-0.5 text-[10px] outline-none cursor-pointer focus:border-amber-500/50 font-medium"
              >
                <option value="name" className="bg-brand-card">Name (A-Z)</option>
                <option value="bpm-asc" className="bg-brand-card">BPM (langsam)</option>
                <option value="bpm-desc" className="bg-brand-card">BPM (schnell)</option>
                <option value="duration-asc" className="bg-brand-card">Songlänge (kurz)</option>
                <option value="duration-desc" className="bg-brand-card">Songlänge (lang)</option>
                <option value="practice" className="bg-brand-card">Übungsstufe</option>
                <option value="confidence" className="bg-brand-card">Sicherheit</option>
              </select>
            </div>
          </div>
        </div>

        {selectedBook ? (
          processedSongs.length > 0 ? (
            <div className="flex-1 overflow-y-auto max-h-[500px] lg:max-h-[560px] xl:max-h-[620px] pr-1 space-y-1.5 scrollbar-thin">
              {processedSongs.map((song) => {
                const isSelected = currentSong?.id === song.id;
                const isFav = favorites[song.id] || false;
                const songLenStr = formatDuration(song.duration);

                return (
                  <div
                    key={song.id}
                    className={`w-full group rounded-lg text-xs transition flex items-center justify-between p-2 border ${
                      isSelected
                        ? 'bg-brand-bg border-amber-500/30 text-amber-500 font-semibold shadow'
                        : 'bg-brand-bg/20 border-transparent text-slate-400 hover:text-slate-200 hover:bg-brand-bg/40'
                    }`}
                  >
                    <button
                      onClick={() => onSelectSong(song)}
                      className="flex-1 text-left truncate flex flex-col gap-0.5 cursor-pointer mr-2"
                      id={`song-item-${song.id}`}
                    >
                      <span className="font-medium truncate pr-1 flex items-center gap-1.5">
                        {isFav && <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />}
                        {song.title}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 flex-wrap">
                        {song.subtitle ? <span className="text-slate-400 font-medium truncate max-w-[120px]">{song.subtitle}</span> : null}
                        {songLenStr ? (
                          <span className="text-amber-500/90 font-medium inline-flex items-center gap-0.5">
                            {song.subtitle ? '• ' : ''}
                            <Clock className="w-2.5 h-2.5 shrink-0 inline" />
                            {songLenStr}
                          </span>
                        ) : null}
                        <span>
                          {(song.subtitle || songLenStr) ? '• ' : ''}{song.bpm} BPM
                        </span>
                      </span>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Favorite Toggle Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite?.(song.id);
                        }}
                        className={`p-1 rounded hover:bg-black/40 transition cursor-pointer ${
                          isFav ? 'text-amber-500' : 'text-slate-600 hover:text-slate-400'
                        }`}
                        title={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                      >
                        <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-500' : ''}`} />
                      </button>

                      {/* Delete button for any song */}
                      {onDeleteSong && (
                        songIdToConfirmDelete === song.id ? (
                          <div className="flex items-center gap-1.5 bg-red-950/50 border border-red-500/20 rounded-md px-2 py-1" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] text-red-400 font-bold font-mono">Sicher?</span>
                            <button
                              onClick={() => {
                                onDeleteSong(song.id);
                                setSongIdToConfirmDelete(null);
                              }}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold px-1.5 py-0.5 rounded bg-black/40 hover:bg-black/60 transition cursor-pointer"
                              title="Ja, löschen"
                            >
                              Ja
                            </button>
                            <button
                              onClick={() => setSongIdToConfirmDelete(null)}
                              className="text-[10px] text-slate-400 hover:text-slate-200 font-bold px-1.5 py-0.5 rounded bg-black/40 hover:bg-black/60 transition cursor-pointer"
                              title="Abbrechen"
                            >
                              Nein
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSongIdToConfirmDelete(song.id);
                            }}
                            className="p-1 text-slate-600 hover:text-red-400 hover:bg-red-950/25 rounded transition cursor-pointer"
                            title="Song löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}

                      {song.isUserAdded && !song.isLocalFolderSong && (
                        <span className="text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1 py-0.5 rounded uppercase font-mono font-bold tracking-wider shrink-0">
                          OFFLINE
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4 rounded-xl border border-dashed border-brand-border bg-brand-bg/20">
              <p className="text-xs text-slate-500">
                Keine passenden Songs in diesem Buch.
              </p>
              <button
                onClick={onOpenImporter}
                className="mt-3 text-xs text-amber-500 font-semibold underline hover:text-amber-400"
              >
                Song jetzt importieren
              </button>
            </div>
          )
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-4 rounded-xl border border-dashed border-brand-border bg-brand-bg/20 text-xs text-slate-500">
            Wähle ein Songbuch aus, um dessen Songs zu sehen.
          </div>
        )}
      </div>

      {/* 4. Reset & Werkseinstellungen */}
      <hr className="border-brand-border/60" />
      <div className="pt-1">
        {showConfirmReset ? (
          <div className="bg-red-950/30 border border-red-500/40 rounded-xl p-3 text-center space-y-2.5">
            <span className="text-xs font-bold text-red-400 block leading-tight">
              Sicher? Alle Notizen, Favoriten und Übungsstufen gehen verloren!
            </span>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  onResetAllSettings?.();
                  setShowConfirmReset(false);
                }}
                className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded text-[11px] transition cursor-pointer shadow-md shadow-red-950/50"
              >
                Ja, alles löschen
              </button>
              <button
                onClick={() => setShowConfirmReset(false)}
                className="px-3 py-1 bg-black/60 hover:bg-black/80 text-slate-400 font-bold rounded text-[11px] border border-brand-border transition cursor-pointer"
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirmReset(true)}
            className="w-full py-2 bg-black/35 hover:bg-red-950/20 text-slate-400 hover:text-red-400 border border-brand-border hover:border-red-500/20 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
            id="factory-reset-btn"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Werkseinstellungen zurücksetzen
          </button>
        )}
      </div>
    </div>
  );
};
