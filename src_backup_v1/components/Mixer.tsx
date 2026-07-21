import React, { useEffect, useState } from 'react';
import { TrackType } from '../types';
import { Volume2, VolumeX, Radio } from 'lucide-react';

interface MixerProps {
  volumes: Record<TrackType, number>;
  masterVolume: number;
  onVolumeChange: (track: TrackType, volume: number) => void;
  onMasterVolumeChange: (volume: number) => void;
  isPlaying: boolean;
}

export const Mixer: React.FC<MixerProps> = ({
  volumes,
  masterVolume,
  onVolumeChange,
  onMasterVolumeChange,
  isPlaying,
}) => {
  const tracks: TrackType[] = ['Drum', 'Gesang', 'Instrumente', 'Klick'];

  // Simulated live peaks for the LED meters
  const [peaks, setPeaks] = useState<Record<TrackType | 'Master', number>>({
    Drum: 0,
    Gesang: 0,
    Instrumente: 0,
    Klick: 0,
    Master: 0,
  });

  // Keep meters bouncing if audio is playing with organic attack and decay
  useEffect(() => {
    if (!isPlaying) {
      setPeaks({ Drum: 0, Gesang: 0, Instrumente: 0, Klick: 0, Master: 0 });
      return;
    }

    let prevPeaks = { Drum: 0, Gesang: 0, Instrumente: 0, Klick: 0, Master: 0 };

    const interval = setInterval(() => {
      const getTargetPeak = (track: TrackType) => {
        const volume = volumes[track];
        if (volume === 0) return 0;

        const timeSecs = Date.now() / 1000;

        // Metronome / Click has sharp, periodic metronomic pulse beats
        if (track === 'Klick') {
          const clickPulse = Math.sin(timeSecs * Math.PI * 4) > 0.82 ? 0.95 : 0.05;
          return clickPulse * volume;
        }

        // Drums are punchy and dynamic
        if (track === 'Drum') {
          const drumBase = Math.sin(timeSecs * Math.PI * 2) > 0.5 ? 0.85 : 0.35;
          const noise = Math.random() * 0.3;
          return Math.min(1.0, (drumBase + noise) * volume);
        }

        // Vocals have fluid, smooth flowing wave intensity
        if (track === 'Gesang') {
          const wave = Math.abs(Math.sin(timeSecs * Math.PI * 1.4)) * 0.55 + 0.35;
          const noise = Math.random() * 0.15;
          return Math.min(1.0, (wave + noise) * volume);
        }

        // Instruments have rich, harmonic flowing wave levels
        if (track === 'Instrumente') {
          const wave = Math.abs(Math.sin(timeSecs * Math.PI * 0.95)) * 0.5 + 0.4;
          const noise = Math.random() * 0.15;
          return Math.min(1.0, (wave + noise) * volume);
        }

        return 0;
      };

      const drumTarget = getTargetPeak('Drum');
      const vocalTarget = getTargetPeak('Gesang');
      const instTarget = getTargetPeak('Instrumente');
      const clickTarget = getTargetPeak('Klick');

      // Lowpass smoothing filter: fast attack (0.75), slow decay (0.22)
      const filter = (prev: number, target: number) => {
        if (target > prev) {
          return prev * 0.25 + target * 0.75;
        } else {
          return prev * 0.78 + target * 0.22;
        }
      };

      const drumP = filter(prevPeaks.Drum, drumTarget);
      const vocalP = filter(prevPeaks.Gesang, vocalTarget);
      const instP = filter(prevPeaks.Instrumente, instTarget);
      const clickP = filter(prevPeaks.Klick, clickTarget);

      // Master output is the organic summation of active tracks, amplified slightly for headroom
      const sum = (drumP + vocalP + instP + clickP) / 4;
      const masterTarget = Math.min(1.0, sum * masterVolume * 1.5);
      const masterP = filter(prevPeaks.Master, masterTarget);

      const nextPeaks = {
        Drum: drumP,
        Gesang: vocalP,
        Instrumente: instP,
        Klick: clickP,
        Master: masterP,
      };

      prevPeaks = nextPeaks;
      setPeaks(nextPeaks);
    }, 45); // ~22 fps smooth visual update rate

    return () => clearInterval(interval);
  }, [isPlaying, volumes, masterVolume]);

  const renderMeter = (val: number) => {
    const segments = 14;
    const activeSegments = Math.round(val * segments);

    return (
      <div className="flex flex-col gap-[3px] w-3 h-36 bg-black/60 p-1 rounded border border-brand-border/40 justify-between">
        {Array.from({ length: segments }).map((_, idx) => {
          const segIdx = segments - 1 - idx;
          const isActive = segIdx < activeSegments;

          // Color grades: Red top, Amber middle, Green bottom, Slate gray default
          let colorClass = 'bg-brand-border/30'; // Slate default unlit
          if (isActive) {
            if (segIdx >= segments - 2) {
              colorClass = 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]';
            } else if (segIdx >= segments - 6) {
              colorClass = 'bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.5)]';
            } else {
              colorClass = 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]';
            }
          }

          return (
            <div
              key={idx}
              className={`w-full flex-1 rounded-[1px] transition-colors duration-75 ${colorClass}`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl p-5 shadow-xl" id="mixer-panel">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
        <Radio className="w-4 h-4 text-amber-500 animate-pulse" />
        Mischpult / Mixer
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {/* Track Channels */}
        {tracks.map((track) => {
          const volumeVal = volumes[track];
          const displayVal = Math.round(volumeVal * 100);

          return (
            <div
              key={track}
              className="bg-brand-bg/40 border border-brand-border rounded-xl p-3 flex flex-col items-center justify-between text-center relative"
            >
              {/* LED meter and Slider side-by-side */}
              <div className="flex items-center gap-3 my-2 w-full justify-center">
                {renderMeter(peaks[track])}

                {/* Vertical-like slider representation using a standard styled slider */}
                <div className="flex flex-col items-center justify-center relative w-12 h-36">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volumeVal}
                    onChange={(e) => onVolumeChange(track, parseFloat(e.target.value))}
                    className="absolute appearance-none bg-brand-bg h-1 rounded-lg w-32 cursor-pointer transform -rotate-90 origin-center"
                    style={{
                      WebkitAppearance: 'none',
                    }}
                    id={`slider-${track.toLowerCase()}`}
                  />
                </div>
              </div>

              {/* Volume text indicator */}
              <span className="text-xs font-mono text-slate-400 mt-2">{displayVal}%</span>

              {/* Mute button quick-toggle */}
              <button
                onClick={() => onVolumeChange(track, volumeVal > 0 ? 0 : 1.0)}
                className={`mt-3 p-1.5 rounded-lg border transition ${
                  volumeVal === 0
                    ? 'bg-red-950/30 border-red-950 text-red-400 hover:bg-red-900/30'
                    : 'bg-brand-bg border border-brand-border text-slate-400 hover:text-slate-200'
                }`}
                id={`mute-btn-${track.toLowerCase()}`}
              >
                {volumeVal === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              <div className="mt-2 text-xs font-semibold text-slate-300 uppercase tracking-wide">
                {track === 'Gesang' ? 'Gesang' : track === 'Instrumente' ? 'Instrumente' : track === 'Klick' ? 'Klick' : 'Drum'}
              </div>
            </div>
          );
        })}

        {/* Master Output Channel */}
        <div className="bg-black/40 border-2 border-brand-border rounded-xl p-3 flex flex-col items-center justify-between text-center col-span-2 sm:col-span-1">
          <div className="flex items-center gap-3 my-2 w-full justify-center">
            {renderMeter(peaks.Master)}

            <div className="flex flex-col items-center justify-center relative w-12 h-36">
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value={masterVolume}
                onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
                className="absolute appearance-none bg-amber-950 h-1 rounded-lg w-32 cursor-pointer transform -rotate-90 origin-center"
                style={{
                  WebkitAppearance: 'none',
                }}
                id="slider-master"
              />
            </div>
          </div>

          <span className="text-xs font-mono text-amber-500 font-semibold mt-2">
            {Math.round(masterVolume * 100)}%
          </span>

          <button
            onClick={() => onMasterVolumeChange(masterVolume > 0 ? 0 : 1.0)}
            className={`mt-3 p-1.5 rounded-lg border transition ${
              masterVolume === 0
                ? 'bg-red-950/30 border-red-950 text-red-400'
                : 'bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:bg-amber-500/20'
            }`}
            id="mute-btn-master"
          >
            {masterVolume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <div className="mt-2 text-xs font-bold text-amber-500 uppercase tracking-widest">
            MASTER
          </div>
        </div>
      </div>
    </div>
  );
};
