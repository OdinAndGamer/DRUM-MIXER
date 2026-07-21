import React from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, Music } from 'lucide-react';
import { PlaybackStatus } from '../types';

interface PlayerControlsProps {
  playbackStatus: PlaybackStatus;
  countdownValue?: number;
  originalBpm: number;
  tempoPercent: number;
  countInEnabled: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onSkip: (seconds: number) => void;
  onTempoPercentChange: (percent: number) => void;
  onToggleCountIn: () => void;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  playbackStatus,
  countdownValue,
  originalBpm,
  tempoPercent,
  countInEnabled,
  onPlayPause,
  onStop,
  onSkip,
  onTempoPercentChange,
  onToggleCountIn,
}) => {
  const currentBpm = Math.round(originalBpm * (tempoPercent / 100));

  const speedPresets = [25, 50, 75, 100, 125, 150, 175, 200];

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl p-5 shadow-xl flex flex-col gap-6" id="player-controls">
      {/* 1. Play / Pause / Stop Core Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto justify-center">
          {/* Skip -5s */}
          <button
            onClick={() => onSkip(-5)}
            className="p-3 bg-brand-bg hover:bg-brand-border/40 text-slate-300 hover:text-white rounded-lg border border-brand-border transition"
            title="5 Sekunden zurückspringen"
            id="skip-back-btn"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Combined Play/Pause / Resume button */}
          <button
            onClick={onPlayPause}
            className={`px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 shadow-lg cursor-pointer transition w-36 ${
              playbackStatus === 'playing'
                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-950/20 hover:shadow-amber-500/10'
                : playbackStatus === 'counting'
                ? 'bg-rose-600 animate-pulse text-white font-bold'
                : 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-950/20 hover:shadow-amber-500/10'
            }`}
            id="play-pause-btn"
          >
            {playbackStatus === 'playing' ? (
              <>
                <Pause className="w-5 h-5 fill-black" />
                <span>Pause</span>
              </>
            ) : playbackStatus === 'counting' ? (
              <span className="text-sm">Bereit...</span>
            ) : (
              <>
                <Play className="w-5 h-5 fill-black" />
                <span>Play</span>
              </>
            )}
          </button>

          {/* Stop Button */}
          <button
            onClick={onStop}
            className="p-3 bg-brand-bg hover:bg-red-900/40 text-slate-300 hover:text-red-400 rounded-lg border border-brand-border hover:border-red-900/30 transition cursor-pointer"
            title="An den Anfang zurücksetzen"
            id="stop-btn"
          >
            <Square className="w-5 h-5" />
          </button>

          {/* Skip +5s */}
          <button
            onClick={() => onSkip(5)}
            className="p-3 bg-brand-bg hover:bg-brand-border/40 text-slate-300 hover:text-white rounded-lg border border-brand-border transition"
            title="5 Sekunden vorspringen"
            id="skip-forward-btn"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Interactive Count-In Visualizer Banner */}
        <div className="flex items-center gap-3 bg-black/40 border border-brand-border rounded-xl px-4 py-2.5 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="count-in-toggle"
              checked={countInEnabled}
              onChange={onToggleCountIn}
              className="w-4 h-4 text-amber-500 focus:ring-amber-500 border-brand-border rounded bg-brand-bg"
            />
            <label htmlFor="count-in-toggle" className="text-xs font-semibold text-slate-300 select-none cursor-pointer">
              Einzähler (Count-In)
            </label>
          </div>

          {playbackStatus === 'counting' && countdownValue !== undefined && (
            <div className="flex items-center gap-2 pl-3 border-l border-brand-border">
              <span className="text-xs text-rose-400 font-bold uppercase tracking-wider animate-pulse">
                Click:
              </span>
              <div className="flex items-center justify-center bg-rose-600 text-white font-black rounded-full w-7 h-7 text-sm shadow-lg shadow-rose-900/50 scale-110 animate-bounce">
                {countdownValue}
              </div>
            </div>
          )}
        </div>
      </div>

      <hr className="border-brand-border/60" />

      {/* 2. Speed / Tempo settings slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Geschwindigkeit & Tempo
            </span>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-white font-mono">{currentBpm} BPM</div>
            <div className="text-[10px] text-slate-500 font-mono">
              Original: {originalBpm} BPM ({tempoPercent}%)
            </div>
          </div>
        </div>

        {/* Interactive Range Slider */}
        <div className="flex items-center gap-4 mt-1.5">
          <span className="text-xs font-mono text-slate-500">25%</span>
          <input
            type="range"
            min="25"
            max="200"
            value={tempoPercent}
            onChange={(e) => onTempoPercentChange(parseInt(e.target.value))}
            className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-amber-500"
            id="tempo-slider"
          />
          <span className="text-xs font-mono text-slate-500">200%</span>
        </div>

        {/* Quick Speed Preset Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-4">
          <span className="text-xs text-slate-500 font-medium shrink-0 mr-1">Voreinstellungen:</span>
          {speedPresets.map((pct) => (
            <button
              key={pct}
              onClick={() => onTempoPercentChange(pct)}
              className={`px-2.5 py-1 rounded-md text-xs font-mono border transition ${
                tempoPercent === pct
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 font-bold'
                  : 'bg-brand-bg/40 border-brand-border/60 text-slate-400 hover:bg-brand-border/40'
              }`}
              id={`preset-${pct}-btn`}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
