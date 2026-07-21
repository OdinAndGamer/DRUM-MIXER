import React, { useState, useCallback } from 'react';
import { TrackType, Song, SongTrack } from '../types';
import { Upload, FileAudio, Check, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { BOOKS } from '../songsData';

interface SongImporterProps {
  onSongImported: (song: Song, audioBuffers: Record<TrackType, AudioBuffer>) => void;
}

export const SongImporter: React.FC<SongImporterProps> = ({ onSongImported }) => {
  const [title, setTitle] = useState('');
  const [bpm, setBpm] = useState<number>(100);
  const [book, setBook] = useState(BOOKS[0] || 'Eigene Songs');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [decodingProgress, setDecodingProgress] = useState(0);

  // Loaded Files State
  const [loadedFiles, setLoadedFiles] = useState<Partial<Record<TrackType, { file: File; name: string }>>>({});
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  // Automatically detect channel type from filename
  const detectTrackType = (filename: string): TrackType | null => {
    const lower = filename.toLowerCase();
    if (lower.includes('drum') || lower.includes('-drum-') || lower.includes('schlagzeug')) return 'Drum';
    if (lower.includes('vocal') || lower.includes('-vocals-') || lower.includes('gesang') || lower.includes('sing')) return 'Gesang';
    if (lower.includes('other') || lower.includes('-other-') || lower.includes('instrument') || lower.includes('track')) return 'Instrumente';
    if (lower.includes('metronome') || lower.includes('-metronome-') || lower.includes('click') || lower.includes('klick')) return 'Klick';
    return null;
  };

  const handleFiles = (files: FileList) => {
    setError(null);
    const newFiles = { ...loadedFiles };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const name = file.name;

      // Check if image
      if (file.type.startsWith('image/')) {
        setCoverFile(file);
        const url = URL.createObjectURL(file);
        setCoverUrl(url);
        continue;
      }

      // Check if audio
      if (file.type.startsWith('audio/') || name.endsWith('.wav') || name.endsWith('.mp3') || name.endsWith('.flac')) {
        const detectedType = detectTrackType(name);
        if (detectedType) {
          newFiles[detectedType] = { file, name };
        } else {
          // If not detected, assign to first free channel
          const channels: TrackType[] = ['Drum', 'Gesang', 'Instrumente', 'Klick'];
          const emptyChannel = channels.find((ch) => !newFiles[ch]);
          if (emptyChannel) {
            newFiles[emptyChannel] = { file, name };
          }
        }

        // Try to parse BPM from filename (e.g. "highway_to_hell-116bpm.wav")
        const bpmMatch = name.match(/(\d+)\s*bpm/i);
        if (bpmMatch && bpmMatch[1]) {
          const parsedBpm = parseInt(bpmMatch[1], 10);
          if (!isNaN(parsedBpm) && parsedBpm > 40 && parsedBpm < 250) {
            setBpm(parsedBpm);
          }
        }
      }
    }

    setLoadedFiles(newFiles);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [loadedFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (track: TrackType) => {
    const updated = { ...loadedFiles };
    delete updated[track];
    setLoadedFiles(updated);
  };

  const removeCover = () => {
    setCoverFile(null);
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    setCoverUrl(null);
  };

  const manualAssign = (track: TrackType, fileData: { file: File; name: string }) => {
    setLoadedFiles((prev) => ({
      ...prev,
      [track]: fileData,
    }));
  };

  const handleImport = async () => {
    if (!title.trim()) {
      setError('Bitte geben Sie einen Songtitel ein.');
      return;
    }

    const fileKeys = Object.keys(loadedFiles) as TrackType[];
    if (fileKeys.length === 0) {
      setError('Bitte fügen Sie mindestens eine Audiospur hinzu.');
      return;
    }

    setIsDecoding(true);
    setError(null);
    setDecodingProgress(0);

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const tempCtx = new AudioCtx();

    try {
      const decodedBuffers: Record<TrackType, AudioBuffer> = {} as any;
      const tracksMeta: Partial<Record<TrackType, SongTrack>> = {};
      const totalToDecode = fileKeys.length;
      let decodedCount = 0;

      for (const trackType of fileKeys) {
        const fileData = loadedFiles[trackType];
        if (!fileData) continue;

        const arrayBuffer = await fileData.file.arrayBuffer();
        
        // Decode audio data
        const decodedBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
          tempCtx.decodeAudioData(arrayBuffer, resolve, reject);
        });

        decodedBuffers[trackType] = decodedBuffer;
        tracksMeta[trackType] = {
          name: fileData.name,
          file: fileData.file,
          audioBuffer: decodedBuffer,
        };

        decodedCount++;
        setDecodingProgress(Math.round((decodedCount / totalToDecode) * 100));
      }

      // Determine duration of imported song
      let longestDuration = 0;
      Object.values(decodedBuffers).forEach((buf) => {
        if (buf.duration > longestDuration) {
          longestDuration = buf.duration;
        }
      });

      // Construct Song object
      const newSong: Song = {
        id: `user_song_${Date.now()}`,
        title: title.trim(),
        book,
        bpm,
        duration: longestDuration,
        tracks: tracksMeta,
        coverUrl: coverUrl || undefined,
        isUserAdded: true,
      };

      onSongImported(newSong, decodedBuffers);

      // Reset form
      setTitle('');
      setLoadedFiles({});
      setCoverFile(null);
      setCoverUrl(null);
      setDecodingProgress(0);
      setIsDecoding(false);
    } catch (err: any) {
      console.error('Decoding error:', err);
      setError('Fehler beim Dekodieren der Audiodateien. Stellen Sie sicher, dass es sich um gültige WAV/MP3 Dateien handelt.');
      setIsDecoding(false);
    } finally {
      tempCtx.close();
    }
  };

  const allAvailableChannels: TrackType[] = ['Drum', 'Gesang', 'Instrumente', 'Klick'];

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl p-5 shadow-xl" id="song-importer">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Upload className="w-5 h-5 text-amber-500" />
        Song importieren (Eigene Spuren)
      </h3>

      {/* Basic song metadata */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Songtitel
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z.B. Enter Sandman Drum Practice"
            className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition"
            id="import-title-input"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Original BPM
          </label>
          <input
            type="number"
            value={bpm}
            onChange={(e) => setBpm(Math.max(30, Math.min(300, parseInt(e.target.value) || 100)))}
            className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition"
            id="import-bpm-input"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Buch / Kategorie zuweisen
          </label>
          <input
            type="text"
            value={book}
            onChange={(e) => setBook(e.target.value)}
            placeholder="z.B. Eigene Songs, Rock, Live-Set"
            className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition"
            id="import-book-input"
          />
        </div>
      </div>

      {/* Drag & Drop Box */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition flex flex-col items-center justify-center min-h-[140px] cursor-pointer ${
          dragActive
            ? 'border-amber-500 bg-amber-500/10'
            : 'border-brand-border hover:border-brand-border/80 bg-brand-bg/40 hover:bg-brand-bg/60'
        }`}
        onClick={() => document.getElementById('file-upload-input')?.click()}
      >
        <input
          id="file-upload-input"
          type="file"
          multiple
          accept="audio/*,image/*"
          className="hidden"
          onChange={handleFileInput}
        />

        <Upload className="w-8 h-8 text-slate-500 mb-2.5" />
        <p className="text-sm text-slate-300 font-medium">
          Dateien hierher ziehen oder <span className="text-amber-500 hover:underline">durchsuchen</span>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Unterstützt WAV, MP3 und Bilder (.jpg/.png) für das Coverart
        </p>
      </div>

      {/* Loaded files visualization */}
      {(Object.keys(loadedFiles).length > 0 || coverFile) && (
        <div className="mt-5 space-y-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Zugeordnete Spuren
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {allAvailableChannels.map((track) => {
              const fileData = loadedFiles[track];
              return (
                <div
                  key={track}
                  className={`flex items-center justify-between p-2.5 rounded-lg border text-sm font-mono ${
                    fileData
                      ? 'bg-black/40 border-amber-500/30 text-amber-500'
                      : 'bg-brand-bg/20 border-brand-border/60 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileAudio className={`w-4 h-4 shrink-0 ${fileData ? 'text-amber-500' : 'text-slate-700'}`} />
                    <div className="text-left overflow-hidden">
                      <div className="text-xs font-semibold uppercase text-slate-400">{track}</div>
                      <div className="truncate text-xs max-w-[180px]">
                        {fileData ? fileData.name : 'Keine Spur geladen'}
                      </div>
                    </div>
                  </div>

                  {fileData && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(track);
                      }}
                      className="text-red-500 hover:text-red-400 px-1 text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}

            {/* Cover art line */}
            {coverFile && (
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-400 text-sm font-mono sm:col-span-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <ImageIcon className="w-4 h-4 shrink-0 text-amber-500" />
                  <div className="text-left overflow-hidden">
                    <div className="text-xs font-semibold uppercase text-amber-300">Coverart</div>
                    <div className="truncate text-xs">{coverFile.name}</div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCover();
                  }}
                  className="text-red-500 hover:text-red-400 px-1 text-xs font-bold"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error/Feedback banner */}
      {error && (
        <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading bar for decoding */}
      {isDecoding && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-400 font-mono mb-1">
            <span>Audio wird dekodiert...</span>
            <span>{decodingProgress}%</span>
          </div>
          <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${decodingProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Import Button */}
      <button
        onClick={handleImport}
        disabled={isDecoding || Object.keys(loadedFiles).length === 0}
        className="w-full mt-5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-brand-border disabled:to-brand-border text-white font-semibold py-2 px-4 rounded-lg text-sm shadow-lg shadow-amber-950/20 disabled:shadow-none hover:shadow-amber-500/10 transition flex items-center justify-center gap-2 cursor-pointer"
        id="import-submit-btn"
      >
        {isDecoding ? 'Verarbeite Audiodateien...' : 'In den Mixer laden'}
        <Check className="w-4 h-4" />
      </button>
    </div>
  );
};
