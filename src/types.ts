export type TrackType = 'Drum' | 'Gesang' | 'Instrumente' | 'Klick';

export interface SongTrack {
  name: string;
  file?: File;
  audioBuffer?: AudioBuffer;
  synthPatternType?: string; // e.g. 'rock_drums', 'rock_bass', etc.
  fileHandle?: FileSystemFileHandle;
}

export interface Song {
  id: string;
  title: string;
  book: string;
  bpm: number;
  duration: number; // in seconds
  tracks: Partial<Record<TrackType, SongTrack>>;
  coverUrl?: string;
  isUserAdded?: boolean;
  isLocalFolderSong?: boolean;
  subtitle?: string;
  localCoverFile?: File;
  localFlacFile?: File;
  localCoverFileHandle?: FileSystemFileHandle;
  localFlacFileHandle?: FileSystemFileHandle;
}

export type PlaybackStatus = 'stopped' | 'playing' | 'paused' | 'counting';

export interface MixerSettings {
  volumes: Record<TrackType, number>;
  masterVolume: number;
  tempoPercent: number; // 50 to 120
  countInEnabled: boolean;
  countInBeats: number; // usually 4
  loopEnabled: boolean;
  loopA: number | null; // in seconds
  loopB: number | null; // in seconds
}
