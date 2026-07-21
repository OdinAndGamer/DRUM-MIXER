import { TrackType } from '../types';

// Convert AudioBuffer to a standard 16-bit PCM WAV Blob
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  let result;
  if (numOfChan === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }
  
  const bufferLength = result.length * 2;
  const bufferArray = new ArrayBuffer(44 + bufferLength);
  const view = new DataView(bufferArray);
  
  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + bufferLength, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numOfChan, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numOfChan * (bitDepth / 8), true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, bufferLength, true);
  
  // Write PCM data
  floatTo16BitPCM(view, 44, result);
  
  return new Blob([bufferArray], { type: 'audio/wav' });
}

function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);
  let index = 0;
  let inputIndex = 0;
  
  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

class DrumPracticeAudioEngine {
  private ctx: AudioContext | null = null;
  private audios: Partial<Record<TrackType, HTMLAudioElement>> = {};
  private mediaSources: Partial<Record<TrackType, MediaElementAudioSourceNode>> = {};
  private gains: Partial<Record<TrackType, GainNode>> = {};
  private masterGain: GainNode | null = null;
  private waveUrls: Partial<Record<TrackType, string>> = {};

  // State
  private bpm: number = 120;
  private songDuration: number = 0;
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private startOffset: number = 0;

  // Settings
  private volumes: Record<TrackType, number> = {
    Drum: 1.0,
    Gesang: 1.0,
    Instrumente: 1.0,
    Klick: 1.0,
  };
  private masterVolume: number = 1.0;
  private tempoPercent: number = 100;
  private countInEnabled: boolean = false;
  private countInBeats: number = 4;

  // Looping
  private loopEnabled: boolean = false;
  private loopA: number | null = null;
  private loopB: number | null = null;

  // Intervals and listeners
  private timerId: number | null = null;
  private countInTimerId: number | null = null;
  private onTimeUpdateCallback: ((seconds: number) => void) | null = null;
  private onStateChangeCallback: ((state: 'stopped' | 'playing' | 'paused' | 'counting', countValue?: number) => void) | null = null;
  private onLoopCompletedCallback: (() => void) | null = null;

  // Timing Trainer settings
  private timingTrainerEnabled: boolean = false;
  private timingTrainerHearBars: number = 4;
  private timingTrainerMuteBars: number = 4;
  private timingTrainerMuteTracks: Record<TrackType, boolean> = {
    Drum: false,
    Gesang: false,
    Instrumente: false,
    Klick: true,
  };

  constructor() {
    // Lazy initialization
  }

  public init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.setupMasterGain();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private setupMasterGain() {
    if (!this.ctx) return;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Create channel gain nodes
    const tracks: TrackType[] = ['Drum', 'Gesang', 'Instrumente', 'Klick'];
    tracks.forEach((track) => {
      const gainNode = this.ctx!.createGain();
      gainNode.gain.setValueAtTime(this.volumes[track], this.ctx!.currentTime);
      gainNode.connect(this.masterGain!);
      this.gains[track] = gainNode;
    });
  }

  public setBuffers(buffers: Record<TrackType, AudioBuffer>, bpm: number) {
    const tracks: Partial<Record<TrackType, { buffer: AudioBuffer }>> = {};
    Object.keys(buffers).forEach((tr) => {
      const track = tr as TrackType;
      tracks[track] = { buffer: buffers[track] };
    });
    this.setTracks(tracks, bpm);
  }

  public async setTracks(
    tracks: Partial<Record<TrackType, { buffer?: AudioBuffer; file?: File; fileHandle?: FileSystemFileHandle }>>,
    bpm: number
  ) {
    this.init();
    this.stop();

    // Clean up old audio sources and elements
    Object.keys(this.audios).forEach((key) => {
      const track = key as TrackType;
      const audio = this.audios[track];
      if (audio) {
        audio.pause();
        audio.src = '';
        audio.load();
        delete this.audios[track];
      }
    });

    Object.values(this.waveUrls).forEach((url) => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    this.waveUrls = {};

    this.bpm = bpm;

    const trackTypes = Object.keys(tracks) as TrackType[];
    let maxDur = 0;

    // We load all audio elements and await their 'loadedmetadata' event in parallel to determine the exact duration.
    const loadPromises = trackTypes.map(async (tr) => {
      const data = tracks[tr];
      if (!data) return;

      let url = '';
      if (data.file) {
        url = URL.createObjectURL(data.file);
      } else if (data.fileHandle) {
        try {
          const file = await data.fileHandle.getFile();
          url = URL.createObjectURL(file);
        } catch (e) {
          console.warn(`Failed to get file from fileHandle for track ${tr}:`, e);
          return;
        }
      } else if (data.buffer) {
        const wavBlob = audioBufferToWavBlob(data.buffer);
        url = URL.createObjectURL(wavBlob);
      }

      if (url) {
        this.waveUrls[tr] = url;
        const audio = new Audio(url);
        audio.preservesPitch = true;
        // @ts-ignore
        audio.webkitPreservesPitch = true;
        
        audio.playbackRate = this.tempoPercent / 100;
        audio.volume = this.volumes[tr] * this.masterVolume;
        
        if (this.ctx && this.gains[tr]) {
          // Check if we already have a MediaElementSource for this audio
          const source = this.ctx.createMediaElementSource(audio);
          source.connect(this.gains[tr]!);
          this.mediaSources[tr] = source;
        }

        this.audios[tr] = audio;

        // Await the metadata of this track so we can read its exact duration
        await new Promise<void>((resolve) => {
          // Fallback timer of 2.5 seconds to prevent locking the UI if an audio fails to load metadata
          const timeoutId = setTimeout(() => {
            console.warn(`Timeout waiting for metadata of track ${tr}`);
            resolve();
          }, 2500);

          audio.addEventListener('loadedmetadata', () => {
            clearTimeout(timeoutId);
            if (audio.duration && audio.duration > maxDur) {
              maxDur = audio.duration;
            }
            resolve();
          });

          audio.addEventListener('error', (err) => {
            clearTimeout(timeoutId);
            console.warn(`Error loading track ${tr}:`, err);
            resolve();
          });
        });
      }
    });

    await Promise.all(loadPromises);

    let fallbackDur = 0;
    trackTypes.forEach(tr => {
      const data = tracks[tr];
      if (data?.buffer && data.buffer.duration > fallbackDur) {
        fallbackDur = data.buffer.duration;
      }
    });
    this.songDuration = maxDur || fallbackDur || 180;
    this.startOffset = 0;
  }

  public getDuration(): number {
    return this.songDuration;
  }

  public setVolume(track: TrackType, volume: number) {
    this.volumes[track] = volume;
    const gainNode = this.gains[track];
    if (gainNode && this.ctx) {
      gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
    }
    const audio = this.audios[track];
    if (audio) {
      audio.volume = volume * this.masterVolume;
    }
  }

  public setMasterVolume(volume: number) {
    this.masterVolume = volume;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(volume, this.ctx.currentTime);
    }
    Object.keys(this.audios).forEach((tr) => {
      const audio = this.audios[tr as TrackType];
      if (audio) {
        audio.volume = this.volumes[tr as TrackType] * volume;
      }
    });
  }

  public setTempoPercent(percent: number) {
    this.tempoPercent = percent;
    const rate = percent / 100;
    Object.values(this.audios).forEach((audio) => {
      if (audio) {
        audio.playbackRate = rate;
      }
    });
  }

  public setBpm(bpm: number) {
    this.bpm = bpm;
  }

  public setLoop(enabled: boolean, a: number | null, b: number | null) {
    this.loopEnabled = enabled;
    this.loopA = a;
    this.loopB = b;
  }

  public setCountIn(enabled: boolean, beats: number = 4) {
    this.countInEnabled = enabled;
    this.countInBeats = beats;
  }

  public setTimingTrainer(enabled: boolean, hearBars: number, muteBars: number, muteTracks?: Record<TrackType, boolean>) {
    this.timingTrainerEnabled = enabled;
    this.timingTrainerHearBars = hearBars;
    this.timingTrainerMuteBars = muteBars;
    if (muteTracks) {
      this.timingTrainerMuteTracks = muteTracks;
    }
    
    if (!enabled) {
      this.applyTrackVolumes();
    }
  }

  public registerLoopCallback(onLoopCompleted: () => void) {
    this.onLoopCompletedCallback = onLoopCompleted;
  }

  public applyTrackVolumes() {
    const trackTypes: TrackType[] = ['Drum', 'Gesang', 'Instrumente', 'Klick'];
    trackTypes.forEach((tr) => {
      const gainNode = this.gains[tr];
      if (gainNode && this.ctx) {
        gainNode.gain.setTargetAtTime(this.volumes[tr], this.ctx.currentTime, 0.02);
      }
      const audio = this.audios[tr];
      if (audio) {
        audio.volume = this.volumes[tr] * this.masterVolume;
      }
    });
  }

  public registerCallbacks(
    onTimeUpdate: (seconds: number) => void,
    onStateChange: (state: 'stopped' | 'playing' | 'paused' | 'counting', countValue?: number) => void
  ) {
    this.onTimeUpdateCallback = onTimeUpdate;
    this.onStateChangeCallback = onStateChange;
  }

  public getCurrentPosition(): number {
    const activeAudio = Object.values(this.audios).find(a => a && !a.paused) || Object.values(this.audios)[0];
    if (activeAudio) {
      return activeAudio.currentTime;
    }
    return this.startOffset;
  }

  public seek(seconds: number) {
    const wasPlaying = this.isPlaying && !this.isPaused;
    const boundedSeconds = Math.max(0, Math.min(seconds, this.songDuration));

    this.startOffset = boundedSeconds;

    Object.values(this.audios).forEach((audio) => {
      if (audio) {
        audio.currentTime = boundedSeconds;
      }
    });

    if (!wasPlaying && this.onTimeUpdateCallback) {
      this.onTimeUpdateCallback(boundedSeconds);
    }
  }

  public play() {
    this.init();
    if (!this.ctx) return;

    if (this.isPlaying) {
      if (this.isPaused) {
        this.resume();
      }
      return;
    }

    if (this.countInEnabled) {
      this.playCountIn();
    } else {
      this.startSources(this.startOffset);
    }
  }

  private playCountIn() {
    if (!this.ctx) return;
    this.isPlaying = true;
    this.isPaused = false;

    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('counting', this.countInBeats);
    }

    const effectiveBpm = this.bpm * (this.tempoPercent / 100);
    const beatDur = 60 / effectiveBpm;
    let count = this.countInBeats;

    const playClickSound = (isHigh: boolean, playTime: number) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isHigh ? 1200 : 800, playTime);

      gain.gain.setValueAtTime(0.3, playTime);
      gain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(playTime);
      osc.stop(playTime + 0.12);
    };

    const startTime = this.ctx.currentTime + 0.05;

    for (let i = 0; i < this.countInBeats; i++) {
      const clickTime = startTime + i * beatDur;
      const isFirst = i === 0;
      const countdownVal = this.countInBeats - i;

      playClickSound(isFirst, clickTime);

      setTimeout(() => {
        if (this.isPlaying && !this.isPaused && this.onStateChangeCallback) {
          this.onStateChangeCallback('counting', countdownVal);
        }
      }, i * beatDur * 1000);
    }

    const timeoutMs = (this.countInBeats * beatDur) * 1000;

    this.countInTimerId = window.setTimeout(() => {
      this.countInTimerId = null;
      this.startSources(this.startOffset);
    }, timeoutMs);
  }

  private startSources(offset: number) {
    if (!this.ctx) return;

    const rate = this.tempoPercent / 100;
    this.startOffset = offset;
    this.isPlaying = true;
    this.isPaused = false;

    if (this.countInTimerId) {
      clearTimeout(this.countInTimerId);
      this.countInTimerId = null;
    }

    Object.keys(this.audios).forEach((key) => {
      const track = key as TrackType;
      const audio = this.audios[track];
      if (audio) {
        audio.playbackRate = rate;
        audio.currentTime = offset;
        audio.play().catch(err => console.warn('Audio play failed:', err));
      }
    });

    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('playing');
    }

    this.startTimer();
  }

  public pause() {
    if (!this.isPlaying || this.isPaused) return;

    this.startOffset = this.getCurrentPosition();
    this.isPaused = true;

    Object.values(this.audios).forEach((audio) => {
      if (audio) {
        audio.pause();
      }
    });

    this.stopTimer();

    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('paused');
    }
  }

  private resume() {
    if (!this.isPaused) return;
    this.startSources(this.startOffset);
  }

  public stop() {
    if (this.countInTimerId) {
      clearTimeout(this.countInTimerId);
      this.countInTimerId = null;
    }

    Object.values(this.audios).forEach((audio) => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    this.stopTimer();

    this.startOffset = 0;
    this.isPlaying = false;
    this.isPaused = false;

    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('stopped');
    }
    if (this.onTimeUpdateCallback) {
      this.onTimeUpdateCallback(0);
    }
  }

  private stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private startTimer() {
    this.stopTimer();
    this.timerId = window.setInterval(() => {
      const current = this.getCurrentPosition();

      // Handle Timing Trainer (Inner Clock Trainer)
      if (this.timingTrainerEnabled) {
        const barDuration = 240 / this.bpm; // 4 beats * 60 / BPM
        const elapsedBars = Math.floor(current / barDuration);
        const cycleBars = this.timingTrainerHearBars + this.timingTrainerMuteBars;
        const barInCycle = elapsedBars % cycleBars;
        const shouldMute = barInCycle >= this.timingTrainerHearBars;
        
        // Apply volumes smoothly
        const trackTypes: TrackType[] = ['Drum', 'Gesang', 'Instrumente', 'Klick'];
        trackTypes.forEach((tr) => {
          const gainNode = this.gains[tr];
          const audio = this.audios[tr];
          const isMuteTrack = this.timingTrainerMuteTracks[tr];
          const targetVolume = (shouldMute && isMuteTrack) ? 0 : this.volumes[tr];
          
          if (gainNode && this.ctx) {
            gainNode.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.02);
          }
          if (audio) {
            audio.volume = targetVolume * this.masterVolume;
          }
        });
      }

      // Handle Loop Wrap Around
      if (this.loopEnabled && this.loopA !== null && this.loopB !== null) {
        if (current >= this.loopB) {
          this.seek(this.loopA);
          if (this.onLoopCompletedCallback) {
            this.onLoopCompletedCallback();
          }
          return;
        }
      }

      // Auto-stop at end
      if (current >= this.songDuration - 0.1) {
        if (!this.loopEnabled) {
          this.stop();
          return;
        } else if (this.loopA !== null) {
          this.seek(this.loopA);
          if (this.onLoopCompletedCallback) {
            this.onLoopCompletedCallback();
          }
          return;
        }
      }

      if (this.onTimeUpdateCallback) {
        this.onTimeUpdateCallback(current);
      }
    }, 50);
  }
}

export const audioEngine = new DrumPracticeAudioEngine();
