import React from 'react';
import { Song, PlaybackStatus } from '../types';
import { Disc, Music } from 'lucide-react';

interface CoverArtProps {
  currentSong: Song | null;
  playbackStatus: PlaybackStatus;
  tempoPercent: number;
}

export const CoverArt: React.FC<CoverArtProps> = ({ currentSong, playbackStatus, tempoPercent }) => {
  const isPlaying = playbackStatus === 'playing';
  const calculatedBpm = currentSong ? Math.round(currentSong.bpm * (tempoPercent / 100)) : 0;

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl p-5 shadow-xl flex flex-col items-center text-center relative overflow-hidden" id="cover-art-panel">
      {/* Absolute abstract background decoration */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-600" />

      {/* Album / Track Vinyl Record Art */}
      <div className="relative w-44 h-44 flex items-center justify-center mb-4 mt-2">
        {/* Outer Vinyl ring */}
        <div
          className={`absolute inset-0 rounded-full bg-brand-bg border border-brand-border shadow-xl flex items-center justify-center transition-transform ${
            isPlaying ? 'animate-spin' : ''
          }`}
          style={{
            animationDuration: '4s',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7), inset 0 0 40px rgba(0, 0, 0, 0.9)',
          }}
        >
          {/* Vinyl grooves lines */}
          <div className="absolute inset-2 rounded-full border border-brand-bg/60" />
          <div className="absolute inset-6 rounded-full border border-brand-bg/40" />
          <div className="absolute inset-10 rounded-full border border-brand-bg/20" />

          {/* Album artwork thumbnail inside the record */}
          <div className="absolute w-20 h-20 rounded-full overflow-hidden border border-brand-border flex items-center justify-center bg-brand-card">
            {currentSong?.coverUrl ? (
              <img
                src={currentSong.coverUrl}
                alt="Song Cover"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover select-none pointer-events-none"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber-600 to-amber-900 flex items-center justify-center text-slate-300">
                <Disc className="w-8 h-8 opacity-40 animate-pulse" />
              </div>
            )}
          </div>

          {/* Inner hole */}
          <div className="absolute w-3 h-3 rounded-full bg-brand-card border border-brand-border shadow-inner z-10" />
        </div>
      </div>

      {/* Song details */}
      <div className="w-full mt-1">
        {currentSong ? (
          <>
            <h2 className="text-base font-bold text-white truncate max-w-full" id="current-song-title">
              {currentSong.title}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-full font-medium">
              {currentSong.book}
            </p>

            <div className="flex justify-center items-center gap-3 mt-3">
              <span className="text-[10px] bg-brand-bg border border-brand-border text-slate-400 px-2 py-1 rounded font-mono">
                Original: {currentSong.bpm} BPM
              </span>
              <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-1 rounded font-mono font-semibold">
                Tempo: {calculatedBpm} BPM ({tempoPercent}%)
              </span>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-slate-400">Kein Song geladen</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-[200px] mx-auto">
              Wähle links ein Songbuch und einen Titel aus oder lade deine eigene Spur hoch!
            </p>
          </>
        )}
      </div>
    </div>
  );
};
