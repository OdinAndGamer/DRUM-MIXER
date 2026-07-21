import { Song, TrackType } from '../types';

export interface DetectedSection {
  name: string;
  startBar: number;
  endBar: number;
  startTime: number;
  endTime: number;
  confidence: number;
  reason: string;
  energyLevel: 'low' | 'medium' | 'high';
  hasVocals: boolean;
}

export interface AnalysisResult {
  bpm: number;
  totalBars: number;
  barDuration: number;
  sections: DetectedSection[];
  rawFeatures: {
    barEnergy: {
      drums: number[];
      vocals: number[];
      instruments: number[];
    };
    vocalsActive: boolean[];
    grooveChanges: number[];
  };
}

/**
 * Computes the root-mean-square (RMS) energy of a buffer channel in chunks.
 * Fast downsampling is used to avoid freezing the browser on large audio buffers.
 */
function computeRmsEnvelope(buffer: AudioBuffer, windowSizeMs: number = 100): number[] {
  const sampleRate = buffer.sampleRate;
  const channelData = buffer.getChannelData(0);
  const totalSamples = channelData.length;
  
  const windowSamples = Math.floor((windowSizeMs / 1000) * sampleRate);
  const hopSize = windowSamples; // 0% overlap for simplicity and speed
  const envelope: number[] = [];

  for (let offset = 0; offset < totalSamples; offset += hopSize) {
    const end = Math.min(offset + windowSamples, totalSamples);
    let sumSquares = 0;
    
    // Sub-sample inside the window to speed up computation by 4x for large files
    const step = 4;
    let count = 0;
    for (let i = offset; i < end; i += step) {
      const val = channelData[i];
      sumSquares += val * val;
      count++;
    }
    
    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
    envelope.push(rms);
  }

  return envelope;
}

/**
 * Precise transient / peak detection on click track to identify individual beat times.
 */
function detectClickBeats(clickBuffer: AudioBuffer): number[] {
  const sampleRate = clickBuffer.sampleRate;
  const data = clickBuffer.getChannelData(0);
  const length = data.length;
  
  // Downsample to 1ms chunks to find peaks quickly
  const chunkSize = Math.floor(sampleRate / 1000); // ~44 samples per millisecond
  const peaks: number[] = [];
  
  let maxVal = 0;
  for (let i = 0; i < length; i += 100) {
    const absVal = Math.abs(data[i]);
    if (absVal > maxVal) maxVal = absVal;
  }
  
  const threshold = Math.max(0.15, maxVal * 0.4); // Adaptive threshold
  const minSpacingSamples = sampleRate * 0.2; // Min 200ms spacing between clicks (up to 300 BPM)
  
  let lastPeakSample = -minSpacingSamples;
  
  for (let i = 0; i < length; i += chunkSize) {
    const val = Math.abs(data[i]);
    if (val > threshold && (i - lastPeakSample) > minSpacingSamples) {
      // Find exact peak sample in a small local window
      let localMax = val;
      let localMaxIdx = i;
      const windowEnd = Math.min(i + chunkSize, length);
      for (let j = i; j < windowEnd; j++) {
        const localVal = Math.abs(data[j]);
        if (localVal > localMax) {
          localMax = localVal;
          localMaxIdx = j;
        }
      }
      
      peaks.push(localMaxIdx / sampleRate);
      lastPeakSample = localMaxIdx;
      // Skip forward
      i = localMaxIdx + Math.floor(minSpacingSamples / 2);
    }
  }
  
  return peaks;
}

/**
 * Performs client-side digital signal processing (DSP) analysis of loaded stems
 * to segment and classify the structural sections of a song.
 */
export async function analyzeSongStructure(
  song: Song,
  customBpm?: number
): Promise<AnalysisResult> {
  let duration = song.duration || 120;
  const activeBpm = customBpm || song.bpm || 120;
  
  // Extract audio buffers if loaded, or decode them on the fly if files exist
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const tempCtx = new AudioContextClass();

  const ensureBuffer = async (trackKey: TrackType): Promise<AudioBuffer | undefined> => {
    const track = song.tracks[trackKey];
    if (!track) return undefined;
    if (track.audioBuffer) return track.audioBuffer;

    try {
      let file: File | undefined = track.file;
      if (!file && track.fileHandle) {
        file = await track.fileHandle.getFile();
      }
      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
          tempCtx.decodeAudioData(
            arrayBuffer,
            (buf) => resolve(buf),
            (err) => reject(err)
          );
        });
        track.audioBuffer = decoded;
        return decoded;
      }
    } catch (e) {
      console.warn(`Failed to decode track ${trackKey} for analysis:`, e);
    }
    return undefined;
  };

  // Decode all active tracks in parallel
  const [clickBuffer, drumBuffer, vocalBuffer, instBuffer] = await Promise.all([
    ensureBuffer('Klick'),
    ensureBuffer('Drum'),
    ensureBuffer('Gesang'),
    ensureBuffer('Instrumente')
  ]);

  // Dynamically compute precise duration from actual audio buffers
  const decodedBuffers = [clickBuffer, drumBuffer, vocalBuffer, instBuffer].filter(Boolean) as AudioBuffer[];
  if (decodedBuffers.length > 0) {
    const maxBufferDur = Math.max(...decodedBuffers.map(b => b.duration));
    if (maxBufferDur > 0) {
      duration = maxBufferDur;
    }
  }

  // Close context to free up resources
  try {
    await tempCtx.close();
  } catch (e) {
    console.warn('Failed to close temporary AudioContext:', e);
  }
  
  let beatTimes: number[] = [];
  let detectedBpm = activeBpm;
  
  // 1. CLICK ANALYSIS: Extract tempo and bar layout
  if (clickBuffer) {
    try {
      const clicks = detectClickBeats(clickBuffer);
      if (clicks.length > 5) {
        beatTimes = clicks;
        // Compute median interval to filter out outliners
        const intervals: number[] = [];
        for (let i = 1; i < beatTimes.length; i++) {
          intervals.push(beatTimes[i] - beatTimes[i - 1]);
        }
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)];
        if (medianInterval > 0.15 && medianInterval < 2.0) {
          detectedBpm = Math.round(60 / medianInterval);
        }
      }
    } catch (e) {
      console.warn('Error analyzing click track, falling back to nominal BPM:', e);
    }
  }
  
  // If click buffer analysis failed or wasn't present, synthesize grid based on BPM
  const barDuration = (4 * 60) / detectedBpm; // Assuming 4/4 meter
  const totalBars = Math.ceil(duration / barDuration);
  
  if (beatTimes.length === 0) {
    const beatDuration = 60 / detectedBpm;
    const totalBeats = Math.floor(duration / beatDuration);
    for (let i = 0; i < totalBeats; i++) {
      beatTimes.push(i * beatDuration);
    }
  }

  // Helper: Get bar start and end times
  const getBarTimes = (barIndex: number) => {
    const startTime = barIndex * barDuration;
    const endTime = Math.min((barIndex + 1) * barDuration, duration);
    return { startTime, endTime };
  };

  // Helper: Calculate average RMS over a specific time range in an AudioBuffer
  const getAverageRmsInRange = (buffer: AudioBuffer | undefined, start: number, end: number): number => {
    if (!buffer) return 0;
    const sampleRate = buffer.sampleRate;
    const data = buffer.getChannelData(0);
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.min(Math.floor(end * sampleRate), data.length);
    
    if (startSample >= data.length || startSample >= endSample) return 0;
    
    let sumSquares = 0;
    const step = Math.max(1, Math.floor((endSample - startSample) / 500)); // Sample 500 points for speed
    let count = 0;
    
    for (let i = startSample; i < endSample; i += step) {
      const val = data[i];
      sumSquares += val * val;
      count++;
    }
    
    return count > 0 ? Math.sqrt(sumSquares / count) : 0;
  };

  // 2. FEATURE EXTRACTION FOR EVERY BAR
  const barDrumsRms: number[] = [];
  const barVocalsRms: number[] = [];
  const barInstRms: number[] = [];
  const barVocalsActive: boolean[] = [];
  const barTotalEnergy: number[] = [];

  for (let b = 0; b < totalBars; b++) {
    const { startTime, endTime } = getBarTimes(b);
    
    const drumRms = getAverageRmsInRange(drumBuffer, startTime, endTime);
    const vocalRms = getAverageRmsInRange(vocalBuffer, startTime, endTime);
    const instRms = getAverageRmsInRange(instBuffer, startTime, endTime);
    
    barDrumsRms.push(drumRms);
    barVocalsRms.push(vocalRms);
    barInstRms.push(instRms);
    
    // Combined metric
    barTotalEnergy.push(drumRms + instRms * 0.8 + vocalRms * 0.4);
  }

  // Normalize metrics relative to maximum across the song
  const maxDrums = Math.max(...barDrumsRms, 0.001);
  const maxVocals = Math.max(...barVocalsRms, 0.001);
  const maxInst = Math.max(...barInstRms, 0.001);
  const maxTotal = Math.max(...barTotalEnergy, 0.001);

  const normDrums = barDrumsRms.map(v => v / maxDrums);
  const normVocals = barVocalsRms.map(v => v / maxVocals);
  const normInst = barInstRms.map(v => v / maxInst);
  const normTotal = barTotalEnergy.map(v => v / maxTotal);

  // Active stem arrays based on RMS energy threshold (mute/unmute detection)
  const drumsActive: boolean[] = [];
  const vocalsActive: boolean[] = [];
  const instActive: boolean[] = [];
  for (let b = 0; b < totalBars; b++) {
    drumsActive.push(normDrums[b] > 0.15);
    vocalsActive.push(normVocals[b] > 0.12);
    instActive.push(normInst[b] > 0.15);
    barVocalsActive.push(normVocals[b] > 0.12);
  }

  // 3. SEGMENTATION: Find boundaries where energy or instrumentation changes significantly
  // We combine a long-term sliding novelty window with direct bar-to-bar level transitions
  // and binary stem mute/unmute state changes.
  const scores: number[] = [0]; // boundary scores (b is the boundary BEFORE bar b, i.e. between b-1 and b)
  const stateDiffs: number[] = [0];
  const W = 4; // structural analysis window size (bars)

  const getAvg = (arr: number[], start: number, end: number): number => {
    if (start >= end) return 0;
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += arr[i];
    }
    return sum / (end - start);
  };

  for (let b = 1; b < totalBars; b++) {
    const preStart = Math.max(0, b - W);
    const preEnd = b;
    const postStart = b;
    const postEnd = Math.min(totalBars, b + W);

    // Structural window averages
    const preD = getAvg(normDrums, preStart, preEnd);
    const postD = getAvg(normDrums, postStart, postEnd);

    const preV = getAvg(normVocals, preStart, preEnd);
    const postV = getAvg(normVocals, postStart, postEnd);

    const preI = getAvg(normInst, preStart, preEnd);
    const postI = getAvg(normInst, postStart, postEnd);

    // Direct step-wise differences
    const diffD = Math.abs(normDrums[b] - (normDrums[b - 1] || 0));
    const diffV = Math.abs(normVocals[b] - (normVocals[b - 1] || 0));
    const diffI = Math.abs(normInst[b] - (normInst[b - 1] || 0));

    // Calculate binary track state transition (precise mute / unmute detection across all 4 stems)
    let stateDiff = 0;
    if (drumsActive[b] !== drumsActive[b - 1]) stateDiff += 0.35;
    if (vocalsActive[b] !== vocalsActive[b - 1]) stateDiff += 0.45;
    if (instActive[b] !== instActive[b - 1]) stateDiff += 0.3;

    stateDiffs.push(stateDiff);

    // Calculate long-term structural change
    const structChange = Math.abs(preD - postD) * 0.45 + Math.abs(preV - postV) * 0.45 + Math.abs(preI - postI) * 0.4;
    // Calculate immediate transition
    const immediateChange = diffD * 0.4 + diffV * 0.4 + diffI * 0.35;

    // Total novelty score for this boundary (balancing structural change, immediate change, and exact state mutes)
    const totalScore = structChange * 0.45 + immediateChange * 0.25 + stateDiff * 0.3;
    scores.push(totalScore);
  }
  scores.push(0); // padding for totalBars boundary
  stateDiffs.push(0);

  // Adaptive thresholding: calculate mean of positive scores to fit the dynamic range of this particular song
  const validScores = scores.filter(s => s > 0);
  const avgScore = validScores.length > 0 ? (validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0.15;
  const threshold = Math.max(0.12, avgScore * 0.75); // adaptive threshold, minimum 0.12 to skip micro-noise

  // Pick local peaks that exceed our adaptive threshold
  const candidateScores: { bar: number; score: number; stateDiff: number }[] = [];
  for (let b = 1; b < totalBars; b++) {
    const score = scores[b];
    if (score > threshold) {
      const isLocalMax = score >= (scores[b - 1] || 0) && score >= (scores[b + 1] || 0);
      if (isLocalMax) {
        candidateScores.push({ bar: b, score, stateDiff: stateDiffs[b] });
      }
    }
  }

  // Sort candidates by score descending to prioritize strongest musical transitions
  candidateScores.sort((a, b) => b.score - a.score);

  const selectedBoundariesSet = new Set<number>([0, totalBars]);

  // Greedily select boundaries ensuring minimum distance rules
  for (const cand of candidateScores) {
    const b = cand.bar;
    let tooClose = false;
    for (const sel of selectedBoundariesSet) {
      const distance = Math.abs(b - sel);
      if (distance < 4) {
        // Absolutely too close (no musical section can be less than 4 bars)
        tooClose = true;
        break;
      }
      if (distance < 8) {
        // Between 4 and 7 bars: only allow if it's a highly prominent peak or a binary state switch
        if (cand.score < 0.26 && cand.stateDiff < 0.35) {
          tooClose = true;
          break;
        }
      }
    }
    if (!tooClose) {
      selectedBoundariesSet.add(b);
    }
  }

  let boundaries = Array.from(selectedBoundariesSet).sort((a, b) => a - b);
  
  // Post-processing pass: split exceptionally long sections (>= 20 bars) if a reasonable candidate exists
  // to avoid under-segmentation (e.g. when a song is only divided into 1-3 massive parts)
  let improvedBoundaries = [...boundaries];
  let changed = true;
  while (changed) {
    changed = false;
    improvedBoundaries.sort((a, b) => a - b);
    for (let i = 0; i < improvedBoundaries.length - 1; i++) {
      const start = improvedBoundaries[i];
      const end = improvedBoundaries[i + 1];
      const sectionBars = end - start;
      if (sectionBars >= 20) {
        // Find best sub-peak in candidateScores that lies within [start + 8, end - 8]
        let bestSubCand: typeof candidateScores[0] | null = null;
        for (const cand of candidateScores) {
          const b = cand.bar;
          if (b >= start + 8 && b <= end - 8) {
            if (!bestSubCand || cand.score > bestSubCand.score) {
              bestSubCand = cand;
            }
          }
        }
        
        // If we found a candidate with a decent score, insert it
        if (bestSubCand && bestSubCand.score > threshold * 0.7) {
          improvedBoundaries.push(bestSubCand.bar);
          changed = true;
          break;
        }
      }
    }
  }
  boundaries = Array.from(new Set(improvedBoundaries)).sort((a, b) => a - b);
  const noveltyScores = scores;

  // 4. CLASSIFICATION & LABELING OF SECTIONS
  const detectedSections: DetectedSection[] = [];

  for (let s = 0; s < boundaries.length - 1; s++) {
    const startBar = boundaries[s];
    const endBar = boundaries[s + 1];
    const barsCount = endBar - startBar;
    
    const startTimes = getBarTimes(startBar);
    const endTimes = getBarTimes(endBar - 1);
    
    const startTime = Number(startTimes.startTime.toFixed(2));
    const endTime = Number(endTimes.endTime.toFixed(2));

    // Calculate average metrics inside this specific section
    let sumDrums = 0;
    let sumVocals = 0;
    let sumInst = 0;
    let sumTotal = 0;
    let vocalBarsCount = 0;

    for (let b = startBar; b < endBar; b++) {
      sumDrums += normDrums[b];
      sumVocals += normVocals[b];
      sumInst += normInst[b];
      sumTotal += normTotal[b];
      if (barVocalsActive[b]) vocalBarsCount++;
    }

    const avgDrums = sumDrums / barsCount;
    const avgVocals = sumVocals / barsCount;
    const avgInst = sumInst / barsCount;
    const avgTotal = sumTotal / barsCount;
    const vocalRatio = vocalBarsCount / barsCount;
    const hasVocals = vocalRatio > 0.20 || avgVocals > 0.15;

    // Determine energy category
    let energyLevel: 'low' | 'medium' | 'high' = 'medium';
    if (avgTotal < 0.22) energyLevel = 'low';
    else if (avgTotal > 0.58) energyLevel = 'high';

    // Labeling rules:
    let name = 'Abschnitt';
    let confidence = 0.70;
    let reason = '';

    const relativePos = startBar / totalBars;
    const isFirstSection = s === 0;
    const isLastSection = s === boundaries.length - 2;

    if (isFirstSection) {
      // ALWAYS label the first section as Intro!
      name = 'Intro';
      confidence = 0.95;
      if (avgTotal < 0.25) {
        name = 'Intro (Ruhig)';
        reason = 'Ruhiger Anfangsabschnitt des Songs';
      } else if (!hasVocals && avgDrums > 0.3) {
        name = 'Intro (Groove)';
        reason = 'Rhythmischer Anfangsabschnitt mit Schlagzeug';
      } else {
        reason = 'Anfangsabschnitt des Songs';
      }
    } else if (relativePos < 0.18) {
      // In the first 18% of the song, it is STILL part of the Intro/Entry phase
      confidence = 0.90;
      if (!hasVocals) {
        if (avgDrums > 0.3) {
          name = 'Intro (Groove)';
          reason = 'Aufbauender rhythmischer Intro-Groove vor dem Gesangseinsatz';
        } else {
          name = 'Intro (Aufbau)';
          reason = 'Instrumentaler Aufbau im Intro vor dem ersten Gesangsteil';
        }
      } else {
        name = 'Verse';
        reason = 'Früher Gesangsabschnitt (Strophe)';
      }
    } else if (isLastSection) {
      // ALWAYS label the last section as Outro!
      name = 'Outro';
      confidence = 0.95;
      if (avgTotal < 0.25) {
        name = 'Outro (Ruhig)';
        reason = 'Ruhiger Ausklang am Ende des Songs';
      } else {
        reason = 'Schlussabschnitt des Songs';
      }
    } else if (relativePos > 0.85) {
      // Near the end of the song, it's already part of the Outro transition
      confidence = 0.90;
      if (!hasVocals && avgDrums < 0.25) {
        name = 'Outro (Ruhig)';
        reason = 'Ruhiges Ausfaden am Songende';
      } else {
        name = 'Outro (Groove)';
        reason = 'Ausleitender Groove am Songende';
      }
    } else if (!hasVocals && avgInst > 0.45 && avgDrums > 0.35 && relativePos >= 0.18 && relativePos <= 0.85) {
      // Solo: high instruments and drums, no vocals, in the middle of the song
      name = 'Solo';
      confidence = 0.88;
      reason = 'Hohe instrumentelle Energie ohne Gesang (z.B. Gitarren- oder Keyboard-Solo)';
    } else if (energyLevel === 'high' && hasVocals) {
      // Chorus / Refrain
      name = 'Chorus';
      confidence = 0.90;
      reason = 'Hohe Energie kombiniert mit starker Gesangs-Präsenz (Refrain)';
    } else if (energyLevel === 'medium' && hasVocals) {
      // Verse / Strophe
      name = 'Verse';
      confidence = 0.85;
      reason = 'Klassischer Strophenabschnitt mit Gesang und mittlerem Groove';
    } else if (energyLevel === 'low' && hasVocals) {
      // Pre-Chorus or quiet Verse
      // If right before a Chorus, it is likely a Pre-Chorus!
      let nextSectionIsChorus = false;
      if (s < boundaries.length - 2) {
        const nextStart = boundaries[s + 1];
        const nextEnd = boundaries[s + 2];
        let nextSumTotal = 0;
        for (let b = nextStart; b < nextEnd; b++) {
          nextSumTotal += normTotal[b];
        }
        const nextAvgTotal = nextSumTotal / (nextEnd - nextStart);
        if (nextAvgTotal > 0.55) {
          nextSectionIsChorus = true;
        }
      }

      if (nextSectionIsChorus) {
        name = 'Pre-Chorus';
        confidence = 0.85;
        reason = 'Spannungsaufbau mit Gesang direkt vor dem Refrain';
      } else {
        name = 'Verse (Ruhig)';
        confidence = 0.80;
        reason = 'Ruhiger Strophenabschnitt mit Gesang';
      }
    } else if (energyLevel === 'low' && !hasVocals) {
      // Quiet section without vocals -> Bridge or Break
      if (relativePos > 0.5) {
        name = 'Bridge';
        confidence = 0.82;
        reason = 'Ruhigerer Überleitungsabschnitt vor dem Finale (Bridge)';
      } else {
        name = 'Interlude';
        confidence = 0.80;
        reason = 'Kurzes instrumentales Zwischenspiel (Interlude)';
      }
    } else {
      // Default fallback
      if (avgDrums > 0.4 && !hasVocals) {
        name = 'Groove / Break';
        confidence = 0.70;
        reason = 'Rhythmischer instrumentaler Abschnitt';
      } else if (hasVocals) {
        name = 'Verse';
        confidence = 0.75;
        reason = 'Abschnitt mit Gesangs-Aktivität';
      } else {
        name = 'Bridge';
        confidence = 0.65;
        reason = 'Instrumentaler Übergang';
      }
    }

    detectedSections.push({
      name,
      startBar: startBar + 1, // 1-indexed for musicians
      endBar,
      startTime,
      endTime,
      confidence: Number(confidence.toFixed(2)),
      reason,
      energyLevel,
      hasVocals
    });
  }

  // 5. POST-PROCESSING: Deduplicate identical adjacent section labels if any,
  // and append sequence numbers (e.g. Verse 1, Verse 2, Chorus 1)
  const nameCounts: Record<string, number> = {};
  const processedSections: DetectedSection[] = [];

  for (let i = 0; i < detectedSections.length; i++) {
    const sec = detectedSections[i];
    
    // Merge tiny adjacent sections of the same type if needed, or keep separate
    nameCounts[sec.name] = (nameCounts[sec.name] || 0) + 1;
    processedSections.push(sec);
  }

  // Apply numbered suffixes to repeated parts (e.g. "Verse 1", "Verse 2")
  const currentCounter: Record<string, number> = {};
  const sectionsWithSuffix = processedSections.map(sec => {
    const totalOfThisType = nameCounts[sec.name] || 0;
    if (totalOfThisType > 1 && ['Verse', 'Chorus', 'Intro', 'Outro', 'Bridge', 'Solo', 'Pre-Chorus'].includes(sec.name)) {
      currentCounter[sec.name] = (currentCounter[sec.name] || 0) + 1;
      return {
        ...sec,
        name: `${sec.name} ${currentCounter[sec.name]}`
      };
    }
    return sec;
  });

  return {
    bpm: detectedBpm,
    totalBars,
    barDuration,
    sections: sectionsWithSuffix,
    rawFeatures: {
      barEnergy: {
        drums: normDrums,
        vocals: normVocals,
        instruments: normInst
      },
      vocalsActive: barVocalsActive,
      grooveChanges: noveltyScores
    }
  };
}
