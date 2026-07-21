import { TrackType } from '../types';

/**
 * Helper to determine section based on bar and total bars count.
 */
export function getSectionForBar(bar: number, totalBars: number): 'Intro' | 'Verse' | 'Chorus' | 'Outro' {
  if (totalBars <= 4) {
    if (bar === 0) return 'Intro';
    if (bar === totalBars - 1) return 'Outro';
    return 'Verse';
  }
  const introEnd = Math.max(2, Math.floor(totalBars * 0.125)); // 2 bars for 16 total bars
  const verseEnd = Math.floor(totalBars * 0.625);             // 10 bars for 16 total bars
  const chorusEnd = Math.floor(totalBars * 0.875);            // 14 bars for 16 total bars
  
  if (bar < introEnd) return 'Intro';
  if (bar < verseEnd) return 'Verse';
  if (bar < chorusEnd) return 'Chorus';
  return 'Outro';
}

/**
 * Generates white noise buffer.
 */
function createNoiseBuffer(ctx: OfflineAudioContext | AudioContext): AudioBuffer {
  const bufferSize = ctx.sampleRate * 2; // 2 seconds of noise
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Synthesizes a drum practice song multi-track onto OfflineAudioContext.
 * Returns an object with AudioBuffers for each track.
 * This version synthesizes realistic section-based structural variations on all 4 tracks.
 */
export async function synthesizeSongTracks(
  songId: string,
  bpm: number,
  barsCount: number = 16
): Promise<Record<TrackType, AudioBuffer>> {
  const sampleRate = 44100;
  const beatsPerBar = 4;
  const totalBeats = barsCount * beatsPerBar;
  const beatDuration = 60 / bpm;
  const totalDuration = totalBeats * beatDuration;

  // Create OfflineAudioContext for rendering each track
  const createTrackContext = () => new OfflineAudioContext(2, sampleRate * totalDuration, sampleRate);

  const tracks: Record<TrackType, OfflineAudioContext> = {
    Drum: createTrackContext(),
    Gesang: createTrackContext(),
    Instrumente: createTrackContext(),
    Klick: createTrackContext(),
  };

  const noiseBuffer = createNoiseBuffer(tracks.Drum);

  // 1. CLICK TRACK (Continuous metronome across the whole song)
  const klickCtx = tracks.Klick;
  for (let beat = 0; beat < totalBeats; beat++) {
    const time = beat * beatDuration;
    const isFirstBeat = beat % beatsPerBar === 0;

    const osc = klickCtx.createOscillator();
    const gain = klickCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isFirstBeat ? 1000 : 600, time);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.connect(gain);
    gain.connect(klickCtx.destination);

    osc.start(time);
    osc.stop(time + 0.06);
  }

  // 2. DRUM TRACK (Kick, Snare, Hi-hat, with clear section-based arrangements)
  const drumCtx = tracks.Drum;
  for (let bar = 0; bar < barsCount; bar++) {
    const barTime = bar * beatsPerBar * beatDuration;
    const section = getSectionForBar(bar, barsCount);

    // Fade multiplier for Outro section
    let outroFade = 1.0;
    if (section === 'Outro') {
      const outroBars = barsCount - Math.floor(barsCount * 0.875);
      const currentOutroBarIdx = bar - Math.floor(barsCount * 0.875);
      outroFade = Math.max(0.0, 1.0 - (currentOutroBarIdx / Math.max(1, outroBars)));
    }

    // We synthesize beat-by-beat inside the bar
    for (let beat = 0; beat < beatsPerBar; beat++) {
      const beatTime = barTime + beat * beatDuration;

      // --- CRASH CYMBAL (High-frequency noise hit on Chorus start and accented parts) ---
      if (section === 'Chorus' && beat === 0) {
        const crashNode = drumCtx.createBufferSource();
        crashNode.buffer = noiseBuffer;
        
        const crashFilter = drumCtx.createBiquadFilter();
        crashFilter.type = 'highpass';
        crashFilter.frequency.setValueAtTime(7500, beatTime);

        const crashGain = drumCtx.createGain();
        crashGain.gain.setValueAtTime(0.4, beatTime);
        crashGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 1.5);

        crashNode.connect(crashFilter);
        crashFilter.connect(crashGain);
        crashGain.connect(drumCtx.destination);

        crashNode.start(beatTime);
        crashNode.stop(beatTime + 1.6);
      }

      // --- KICK DRUM (Beats 1 and 3) ---
      let shouldPlayKick = false;
      let kickVolume = 0.8;

      if (section === 'Intro' || section === 'Outro') {
        // Simple/reduced drum part: only kick on beat 1
        shouldPlayKick = beat === 0;
        kickVolume = 0.6 * outroFade;
      } else {
        // Standard full beat: kick on beats 1 and 3
        shouldPlayKick = beat === 0 || beat === 2;
        kickVolume = (section === 'Chorus' ? 0.95 : 0.8) * outroFade;
      }

      if (shouldPlayKick && kickVolume > 0.005) {
        const kickOsc = drumCtx.createOscillator();
        const kickGain = drumCtx.createGain();

        kickOsc.frequency.setValueAtTime(150, beatTime);
        kickOsc.frequency.exponentialRampToValueAtTime(45, beatTime + 0.1);

        kickGain.gain.setValueAtTime(kickVolume, beatTime);
        kickGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.2);

        kickOsc.connect(kickGain);
        kickGain.connect(drumCtx.destination);

        kickOsc.start(beatTime);
        kickOsc.stop(beatTime + 0.25);
      }

      // --- SNARE DRUM (Beats 2 and 4 - COMPLETELY MUTED in Intro & Outro!) ---
      const shouldPlaySnare = (section === 'Verse' || section === 'Chorus') && (beat === 1 || beat === 3);
      const snareVolume = (section === 'Chorus' ? 0.45 : 0.3) * outroFade;

      if (shouldPlaySnare && snareVolume > 0.005) {
        // Snare snap oscillator
        const snareOsc = drumCtx.createOscillator();
        const snareOscGain = drumCtx.createGain();
        snareOsc.type = 'triangle';
        snareOsc.frequency.setValueAtTime(180, beatTime);
        snareOscGain.gain.setValueAtTime(snareVolume, beatTime);
        snareOscGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.1);
        snareOsc.connect(snareOscGain);
        snareOscGain.connect(drumCtx.destination);
        snareOsc.start(beatTime);
        snareOsc.stop(beatTime + 0.12);

        // Snare noise rattle
        const noiseNode = drumCtx.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        const noiseFilter = drumCtx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(1000, beatTime);
        noiseFilter.Q.setValueAtTime(2, beatTime);

        const noiseGain = drumCtx.createGain();
        noiseGain.gain.setValueAtTime(snareVolume * 1.33, beatTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.18);

        noiseNode.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(drumCtx.destination);

        noiseNode.start(beatTime);
        noiseNode.stop(beatTime + 0.2);
      }

      // --- HI-HAT (Every eighth note, simplified to quarter notes in Outro) ---
      const hihatVolume = (section === 'Chorus' ? 0.15 : 0.1) * outroFade;
      const offsets = (section === 'Outro') ? [0] : [0, 0.5]; // Simple hi-hats in outro

      if (hihatVolume > 0.005) {
        for (const offset of offsets) {
          const hhTime = beatTime + offset * beatDuration;
          const isUpbeat = offset === 0.5;

          const hhNode = drumCtx.createBufferSource();
          hhNode.buffer = noiseBuffer;

          const hhFilter = drumCtx.createBiquadFilter();
          hhFilter.type = 'highpass';
          hhFilter.frequency.setValueAtTime(7000, hhTime);

          const hhGain = drumCtx.createGain();
          hhGain.gain.setValueAtTime(isUpbeat ? (hihatVolume * 0.6) : hihatVolume, hhTime);
          hhGain.gain.exponentialRampToValueAtTime(0.001, hhTime + 0.04);

          hhNode.connect(hhFilter);
          hhFilter.connect(hhGain);
          hhGain.connect(drumCtx.destination);

          hhNode.start(hhTime);
          hhNode.stop(hhTime + 0.05);
        }
      }
    }
  }

  // 3. INSTRUMENTE (Bassline + Keyboards, arranged section-by-section)
  const instCtx = tracks.Instrumente;
  for (let bar = 0; bar < barsCount; bar++) {
    const barTime = bar * beatsPerBar * beatDuration;
    const section = getSectionForBar(bar, barsCount);

    // Outro fade multiplier
    let outroFade = 1.0;
    if (section === 'Outro') {
      const outroBars = barsCount - Math.floor(barsCount * 0.875);
      const currentOutroBarIdx = bar - Math.floor(barsCount * 0.875);
      outroFade = Math.max(0.0, 1.0 - (currentOutroBarIdx / Math.max(1, outroBars)));
    }

    if (songId === 'billie_jean') {
      const isEvenBar = bar % 2 === 0;
      const rootFreq1 = isEvenBar ? 92.5 : 110; // F#2 (92.5Hz) or A2 (110Hz)
      const rootFreq2 = isEvenBar ? 103.8 : 103.8; // G#2 (103.8Hz)

      // Section-based volume modifications
      let bassVolume = 0.25 * outroFade;
      let padVolume = 0.05 * outroFade;

      if (section === 'Intro') {
        bassVolume = 0.15; // Quieter in Intro
        padVolume = 0.0;   // Muted keyboard in Intro!
      } else if (section === 'Chorus') {
        bassVolume = 0.35; // Loud/powerful bass
        padVolume = 0.10;  // Beautiful thick pad chords
      } else if (section === 'Outro') {
        bassVolume = 0.15 * outroFade;
        padVolume = 0.0;
      }

      // Bass notes
      if (bassVolume > 0.005) {
        const notes = [
          { time: 0.0, freq: rootFreq1 },
          { time: 0.5, freq: rootFreq1 * 1.5 }, // C#3
          { time: 1.0, freq: rootFreq1 * 1.2 }, // A2 or C3
          { time: 1.5, freq: rootFreq1 },
          { time: 2.0, freq: rootFreq2 },
          { time: 2.5, freq: rootFreq2 * 1.5 }, // D#3
          { time: 3.0, freq: rootFreq2 * 1.25 }, // B2
          { time: 3.5, freq: rootFreq2 },
        ];

        notes.forEach((n) => {
          const playTime = barTime + n.time * beatDuration;
          const osc = instCtx.createOscillator();
          const gain = instCtx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(n.freq, playTime);

          // Add higher octave oscillator if Chorus to create high-energy density
          if (section === 'Chorus') {
            const octaveOsc = instCtx.createOscillator();
            const octaveGain = instCtx.createGain();
            octaveOsc.type = 'sine';
            octaveOsc.frequency.setValueAtTime(n.freq * 2, playTime);
            octaveGain.gain.setValueAtTime(bassVolume * 0.3, playTime);
            octaveGain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.35 * beatDuration);
            octaveOsc.connect(octaveGain);
            octaveGain.connect(instCtx.destination);
            octaveOsc.start(playTime);
            octaveOsc.stop(playTime + 0.4 * beatDuration);
          }

          gain.gain.setValueAtTime(bassVolume, playTime);
          gain.gain.linearRampToValueAtTime(bassVolume * 0.6, playTime + 0.15 * beatDuration);
          gain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.35 * beatDuration);

          osc.connect(gain);
          gain.connect(instCtx.destination);

          osc.start(playTime);
          osc.stop(playTime + 0.4 * beatDuration);
        });
      }

      // Keyboard backing pad
      if (padVolume > 0.005) {
        const padOsc1 = instCtx.createOscillator();
        const padOsc2 = instCtx.createOscillator();
        const padOsc3 = instCtx.createOscillator();
        const padGain = instCtx.createGain();

        padOsc1.type = 'sine';
        padOsc2.type = 'sine';
        padOsc3.type = 'sine';

        // F#m triad (F#3, A3, C#4) or Amaj triad (A3, C#4, E4)
        if (isEvenBar) {
          padOsc1.frequency.setValueAtTime(185.0, barTime); // F#3
          padOsc2.frequency.setValueAtTime(220.0, barTime); // A3
          padOsc3.frequency.setValueAtTime(277.2, barTime); // C#4
        } else {
          padOsc1.frequency.setValueAtTime(220.0, barTime); // A3
          padOsc2.frequency.setValueAtTime(277.2, barTime); // C#4
          padOsc3.frequency.setValueAtTime(329.6, barTime); // E4
        }

        padGain.gain.setValueAtTime(0, barTime);
        padGain.gain.linearRampToValueAtTime(padVolume, barTime + 0.5);
        padGain.gain.exponentialRampToValueAtTime(0.001, barTime + beatsPerBar * beatDuration - 0.2);

        padOsc1.connect(padGain);
        padOsc2.connect(padGain);
        padOsc3.connect(padGain);
        padGain.connect(instCtx.destination);

        padOsc1.start(barTime);
        padOsc2.start(barTime);
        padOsc3.start(barTime);

        padOsc1.stop(barTime + beatsPerBar * beatDuration);
        padOsc2.stop(barTime + beatsPerBar * beatDuration);
        padOsc3.stop(barTime + beatsPerBar * beatDuration);
      }

    } else if (songId === 'highway_to_hell') {
      // Rock Guitar-style chords: A5, D, G, D (4 bars loop)
      const chordIndex = bar % 4;
      const bassNotes = [110, 146.8, 196, 146.8]; // A2, D3, G3, D3
      const playBassFreq = bassNotes[chordIndex];

      let bassVolume = 0.15 * outroFade;
      let guitarVolume = 0.12 * outroFade;

      if (section === 'Intro') {
        bassVolume = 0.1;
        guitarVolume = 0.04; // Very quiet guitar intro chords
      } else if (section === 'Chorus') {
        bassVolume = 0.22;   // Pumping bass in Chorus
        guitarVolume = 0.20;  // Screaming loud guitar
      } else if (section === 'Outro') {
        bassVolume = 0.1 * outroFade;
        guitarVolume = 0.04 * outroFade;
      }

      // Play rock bass line (eighth notes pumping)
      if (bassVolume > 0.005) {
        for (let eighth = 0; eighth < 8; eighth++) {
          const playTime = barTime + eighth * 0.5 * beatDuration;
          const osc = instCtx.createOscillator();
          const gain = instCtx.createGain();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(playBassFreq / 2, playTime); // low octave

          // Filter out very high buzz
          const filter = instCtx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(300, playTime);

          gain.gain.setValueAtTime(bassVolume, playTime);
          gain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.4 * beatDuration);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(instCtx.destination);

          osc.start(playTime);
          osc.stop(playTime + 0.45 * beatDuration);
        }
      }

      // Play sharp guitar chords on specific beats
      if (guitarVolume > 0.005) {
        const guitarBeats =
          chordIndex === 0
            ? [{ t: 0.0, freqs: [220, 277, 330] }] // A Chord
            : chordIndex === 1
            ? [
                { t: 1.0, freqs: [146, 220, 293] }, // D Chord
                { t: 1.5, freqs: [146, 220, 293] },
              ]
            : chordIndex === 2
            ? [
                { t: 0.0, freqs: [196, 246, 293] }, // G Chord
                { t: 0.5, freqs: [196, 246, 293] },
                { t: 2.0, freqs: [146, 220, 293] }, // D Chord
              ]
            : [{ t: 0.0, freqs: [220, 277, 330] }]; // A Chord

        guitarBeats.forEach((chord) => {
          const playTime = barTime + chord.t * beatDuration;
          const gGain = instCtx.createGain();
          const gFilter = instCtx.createBiquadFilter();
          gFilter.type = 'bandpass';
          gFilter.frequency.setValueAtTime(section === 'Chorus' ? 800 : 600, playTime); // brighter filter in chorus
          gFilter.Q.setValueAtTime(1.2, playTime);

          chord.freqs.forEach((f) => {
            const gOsc = instCtx.createOscillator();
            gOsc.type = 'sawtooth';
            // In chorus, double-track with an added high harmony oscillator
            gOsc.frequency.setValueAtTime(f, playTime);
            gOsc.connect(gFilter);
            gOsc.start(playTime);
            gOsc.stop(playTime + 0.4 * beatDuration);

            if (section === 'Chorus') {
              const subOsc = instCtx.createOscillator();
              subOsc.type = 'sawtooth';
              subOsc.frequency.setValueAtTime(f * 2, playTime); // High oct
              subOsc.connect(gFilter);
              subOsc.start(playTime);
              subOsc.stop(playTime + 0.35 * beatDuration);
            }
          });

          gGain.gain.setValueAtTime(guitarVolume, playTime);
          gGain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.35 * beatDuration);

          gFilter.connect(gGain);
          gGain.connect(instCtx.destination);
        });
      }

    } else {
      // Song: Stand by Me (Classic Soul bass 8 bars progression)
      const songStep = bar % 8;
      const progressBPMFreqs = [
        110, 110, // A2 (110 Hz)
        82.4, 82.4, // F#2 (82.4 Hz)
        73.4, // D2 (73.4 Hz)
        82.4, // E2 (82.4 Hz)
        110, 110, // A2 (110 Hz)
      ];
      const rootFreq = progressBPMFreqs[songStep];

      let bassVolume = 0.28 * outroFade;
      let padVolume = 0.05 * outroFade;

      if (section === 'Intro') {
        bassVolume = 0.18;
        padVolume = 0.0; // Organ pad is fully muted in intro!
      } else if (section === 'Chorus') {
        bassVolume = 0.38;
        padVolume = 0.10; // Loud warm organ pad + high string effect
      } else if (section === 'Outro') {
        bassVolume = 0.15 * outroFade;
        padVolume = 0.0;
      }

      // Classic Stand by Me bassline on each bar
      if (bassVolume > 0.005) {
        const soulNotes = [
          { t: 0.0, f: rootFreq },
          { t: 1.5, f: rootFreq * 1.5 }, // Fifth
          { t: 2.0, f: rootFreq },
          { t: 3.0, f: rootFreq * 2 }, // Octave
        ];

        soulNotes.forEach((note) => {
          const playTime = barTime + note.t * beatDuration;
          const osc = instCtx.createOscillator();
          const gain = instCtx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(note.f, playTime);

          gain.gain.setValueAtTime(bassVolume, playTime);
          gain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.6 * beatDuration);

          osc.connect(gain);
          gain.connect(instCtx.destination);

          osc.start(playTime);
          osc.stop(playTime + 0.7 * beatDuration);
        });
      }

      // Organ backing
      if (padVolume > 0.005) {
        const padOsc1 = instCtx.createOscillator();
        const padOsc2 = instCtx.createOscillator();
        const padGain = instCtx.createGain();

        padOsc1.type = 'sine';
        padOsc2.type = 'sine';

        padOsc1.frequency.setValueAtTime(rootFreq * 2, barTime);
        padOsc2.frequency.setValueAtTime(rootFreq * 2.5, barTime); // Third

        padGain.gain.setValueAtTime(0, barTime);
        padGain.gain.linearRampToValueAtTime(padVolume, barTime + 0.8);
        padGain.gain.exponentialRampToValueAtTime(0.001, barTime + beatsPerBar * beatDuration - 0.2);

        padOsc1.connect(padGain);
        padOsc2.connect(padGain);
        padGain.connect(instCtx.destination);

        padOsc1.start(barTime);
        padOsc2.start(barTime);
        padOsc1.stop(barTime + beatsPerBar * beatDuration);
        padOsc2.stop(barTime + beatsPerBar * beatDuration);

        // High String effect in Chorus
        if (section === 'Chorus') {
          const stringOsc = instCtx.createOscillator();
          const stringGain = instCtx.createGain();
          stringOsc.type = 'sine';
          stringOsc.frequency.setValueAtTime(rootFreq * 4, barTime); // High oct octave

          stringGain.gain.setValueAtTime(0, barTime);
          stringGain.gain.linearRampToValueAtTime(padVolume * 0.5, barTime + 1.2);
          stringGain.gain.exponentialRampToValueAtTime(0.001, barTime + beatsPerBar * beatDuration - 0.1);

          stringOsc.connect(stringGain);
          stringGain.connect(instCtx.destination);

          stringOsc.start(barTime);
          stringOsc.stop(barTime + beatsPerBar * beatDuration);
        }
      }
    }
  }

  // 4. GESANG TRACK (Lead Vocal Melody Synth, with clear structural activity)
  const vocalCtx = tracks.Gesang;
  const songMelodies: Record<string, Array<{ timeBeat: number; durationBeats: number; note: number }>> = {
    billie_jean: [
      { timeBeat: 1.0, durationBeats: 0.8, note: 330 }, // E4
      { timeBeat: 2.0, durationBeats: 0.8, note: 370 }, // F#4
      { timeBeat: 3.0, durationBeats: 0.8, note: 370 }, // F#4
      { timeBeat: 4.5, durationBeats: 0.4, note: 330 }, // E4
      { timeBeat: 5.0, durationBeats: 0.8, note: 370 }, // F#4
      { timeBeat: 6.0, durationBeats: 0.8, note: 370 }, // F#4
      { timeBeat: 7.0, durationBeats: 0.8, note: 415 }, // G#4
      { timeBeat: 8.5, durationBeats: 0.8, note: 440 }, // A4
      { timeBeat: 10.0, durationBeats: 0.8, note: 415 }, // G#4
      { timeBeat: 11.5, durationBeats: 0.8, note: 370 }, // F#4
      { timeBeat: 12.5, durationBeats: 0.8, note: 330 }, // E4
      { timeBeat: 13.5, durationBeats: 1.5, note: 370 }, // F#4
    ],
    highway_to_hell: [
      { timeBeat: 2.0, durationBeats: 0.6, note: 293 }, // D4
      { timeBeat: 2.6, durationBeats: 0.6, note: 293 }, // D4
      { timeBeat: 3.2, durationBeats: 0.8, note: 330 }, // E4
      { timeBeat: 4.5, durationBeats: 1.0, note: 370 }, // F#4
      { timeBeat: 6.0, durationBeats: 0.4, note: 370 }, // F#4
      { timeBeat: 6.5, durationBeats: 0.4, note: 370 }, // F#4
      { timeBeat: 7.0, durationBeats: 0.4, note: 370 }, // F#4
      { timeBeat: 7.5, durationBeats: 1.2, note: 330 }, // E4
    ],
    stand_by_me: [
      { timeBeat: 1.0, durationBeats: 1.2, note: 440 }, // A4
      { timeBeat: 2.5, durationBeats: 0.8, note: 440 }, // A4
      { timeBeat: 3.5, durationBeats: 0.8, note: 415 }, // G#4
      { timeBeat: 4.5, durationBeats: 0.8, note: 370 }, // F#4
      { timeBeat: 5.5, durationBeats: 1.5, note: 330 }, // E4
      { timeBeat: 8.0, durationBeats: 0.6, note: 370 }, // F#4
      { timeBeat: 8.6, durationBeats: 0.6, note: 415 }, // G#4
      { timeBeat: 9.5, durationBeats: 1.5, note: 440 }, // A4
      { timeBeat: 11.5, durationBeats: 2.0, note: 440 }, // A4
    ],
  };

  const melodyList = songMelodies[songId] || songMelodies.stand_by_me;
  const melodyCycleLength = 16; // beats (4 bars)

  for (let cycle = 0; cycle < Math.ceil(totalBeats / melodyCycleLength); cycle++) {
    const cycleTime = cycle * melodyCycleLength * beatDuration;

    melodyList.forEach((m) => {
      const playTime = cycleTime + m.timeBeat * beatDuration;
      if (playTime + m.durationBeats * beatDuration > totalDuration) return;

      // Determine which bar this note starts in
      const noteBar = Math.floor(playTime / (beatsPerBar * beatDuration));
      const section = getSectionForBar(noteBar, barsCount);

      // --- VOCAL CONTROL: COMPLETELY MUTED in Intro and Outro! ---
      if (section === 'Intro' || section === 'Outro') {
        return; // Dead silent
      }

      // Setup main vocal sound
      const osc = vocalCtx.createOscillator();
      const gain = vocalCtx.createGain();

      osc.type = 'triangle'; // Smooth flute/voice wave
      osc.frequency.setValueAtTime(m.note, playTime);

      // Add vocal vibrato
      const lfo = vocalCtx.createOscillator();
      const lfoGain = vocalCtx.createGain();
      lfo.frequency.setValueAtTime(6, playTime); // 6Hz vibrato
      lfoGain.gain.setValueAtTime(4, playTime); // 4Hz frequency swing
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      // --- CHORUS VOCAL HARMONY SWELL (Adds beautiful dual-harmony layer!) ---
      if (section === 'Chorus') {
        const harmOsc = vocalCtx.createOscillator();
        const harmGain = vocalCtx.createGain();
        harmOsc.type = 'sine'; // softer harmony wave
        
        // Chorus harmony is a perfect fifth above (1.5x frequency) or perfect third (1.2x)
        const harmFreq = m.note * 1.5;
        harmOsc.frequency.setValueAtTime(harmFreq, playTime);

        // Slow vibrato on harmony
        const harmLfo = vocalCtx.createOscillator();
        const harmLfoGain = vocalCtx.createGain();
        harmLfo.frequency.setValueAtTime(5.5, playTime);
        harmLfoGain.gain.setValueAtTime(3, playTime);
        harmLfo.connect(harmLfoGain);
        harmLfoGain.connect(harmOsc.frequency);

        harmGain.gain.setValueAtTime(0, playTime);
        harmGain.gain.linearRampToValueAtTime(0.08, playTime + 0.1);
        harmGain.gain.linearRampToValueAtTime(0.06, playTime + m.durationBeats * beatDuration - 0.1);
        harmGain.gain.exponentialRampToValueAtTime(0.001, playTime + m.durationBeats * beatDuration);

        harmOsc.connect(harmGain);
        harmGain.connect(vocalCtx.destination);

        harmLfo.start(playTime);
        harmOsc.start(playTime);
        harmLfo.stop(playTime + m.durationBeats * beatDuration);
        harmOsc.stop(playTime + m.durationBeats * beatDuration);
      }

      // Normal vocal gain
      gain.gain.setValueAtTime(0, playTime);
      gain.gain.linearRampToValueAtTime(0.18, playTime + 0.05);
      gain.gain.linearRampToValueAtTime(0.12, playTime + m.durationBeats * beatDuration - 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, playTime + m.durationBeats * beatDuration);

      osc.connect(gain);
      gain.connect(vocalCtx.destination);

      lfo.start(playTime);
      osc.start(playTime);

      lfo.stop(playTime + m.durationBeats * beatDuration);
      osc.stop(playTime + m.durationBeats * beatDuration);
    });
  }

  // Helper to trigger rendering on Offline contexts
  const renderTrack = async (ctx: OfflineAudioContext): Promise<AudioBuffer> => {
    return await ctx.startRendering();
  };

  const [drumBuffer, vocalBuffer, instBuffer, klickBuffer] = await Promise.all([
    renderTrack(tracks.Drum),
    renderTrack(tracks.Gesang),
    renderTrack(tracks.Instrumente),
    renderTrack(tracks.Klick),
  ]);

  return {
    Drum: drumBuffer,
    Gesang: vocalBuffer,
    Instrumente: instBuffer,
    Klick: klickBuffer,
  };
}
