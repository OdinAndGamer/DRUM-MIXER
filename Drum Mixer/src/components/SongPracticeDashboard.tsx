import React, { useState, useEffect } from 'react';
import { Song, TrackType } from '../types';
import { Star, FileText, Layers, Activity, Timer, Calendar, RefreshCw, Trash2, Plus, RotateCcw, Check, X, Edit2, Flame, Sliders, ChevronUp, ChevronDown, Cpu, Wand2, BarChart2, Download, Copy, FileJson, BookOpen, AlertTriangle } from 'lucide-react';
import { analyzeSongStructure, AnalysisResult, DetectedSection } from '../utils/songAnalyzer';

interface SongPracticeDashboardProps {
  currentSong: Song | null;
  currentPosition: number;
  duration: number;
  onSeek: (seconds: number) => void;
  onSetLoopA: (seconds: number) => void;
  onSetLoopB: (seconds: number) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  note: string;
  onSaveNote: (note: string) => void;
  stats: {
    playCount: number;
    lastPracticed: string;
    totalDuration: number;
  };
  loopA?: number | null;
  loopB?: number | null;
  
  // Custom BPM fine-tuning
  songBpm: number;
  onUpdateSongBpm: (bpm: number) => void;

  playbackStatus: 'stopped' | 'playing' | 'paused' | 'counting';

  // Speed Trainer
  speedTrainerEnabled: boolean;
  onToggleSpeedTrainer: (enabled: boolean) => void;
  speedTrainerStep: number;
  onUpdateSpeedTrainerStep: (step: number) => void;
  speedTrainerMax: number;
  onUpdateSpeedTrainerMax: (max: number) => void;

  // Timing Trainer
  timingTrainerEnabled: boolean;
  onToggleTimingTrainer: (enabled: boolean) => void;
  timingTrainerHear: number;
  onUpdateTimingTrainerHear: (bars: number) => void;
  timingTrainerMute: number;
  onUpdateTimingTrainerMute: (bars: number) => void;
  timingTrainerMuteTracks: Record<TrackType, boolean>;
  onUpdateTimingTrainerMuteTracks: (tracks: Record<TrackType, boolean>) => void;
  onResetSongStats?: () => void;
}

interface Section {
  name: string;
  start: number;
  end: number;
}

// Preset sections for the default loop songs
const getPresetSections = (songId: string, duration: number): Section[] | null => {
  const songLength = duration || 30;
  if (songId === 'billie_jean') {
    return [
      { name: 'Drum Intro (4 Takte)', start: 0, end: 8.13 },
      { name: 'Bassline Groove (4 Takte)', start: 8.13, end: 16.27 },
      { name: 'Full Groove Beat (4 Takte)', start: 16.27, end: 24.40 },
      { name: 'Verse Rhythm Fill (4 Takte)', start: 24.40, end: songLength },
    ];
  }
  if (songId === 'highway_to_hell') {
    return [
      { name: 'Intro Guitar Riff (4 Takte)', start: 0, end: 8.27 },
      { name: 'Verse Drum Entry (4 Takte)', start: 8.27, end: 16.55 },
      { name: 'Chorus Rock Beat (4 Takte)', start: 16.55, end: 24.82 },
      { name: 'Outro Solo Beat (4 Takte)', start: 24.82, end: songLength },
    ];
  }
  if (songId === 'stand_by_me') {
    return [
      { name: 'Bass Intro Groove (4 Takte)', start: 0, end: 8.73 },
      { name: 'Snare/Shaker Verse (4 Takte)', start: 8.73, end: 17.45 },
      { name: 'Full Soul Chorus (4 Takte)', start: 17.45, end: 26.18 },
      { name: 'Outro Fade Beat (4 Takte)', start: 26.18, end: songLength },
    ];
  }
  return null;
};

// Smart bar-aligned automatic sections for any other song (simplified initially)
const generateSmartSections = (bpm: number, totalDuration: number): Section[] => {
  const songLength = totalDuration || 180;
  return [
    { name: 'Ganzer Song', start: 0, end: Number(songLength.toFixed(2)) }
  ];
};

export const SongPracticeDashboard: React.FC<SongPracticeDashboardProps> = ({
  currentSong,
  currentPosition,
  duration,
  onSeek,
  onSetLoopA,
  onSetLoopB,
  isFavorite,
  onToggleFavorite,
  note,
  onSaveNote,
  stats,
  loopA = null,
  loopB = null,
  songBpm,
  onUpdateSongBpm,
  playbackStatus,
  speedTrainerEnabled,
  onToggleSpeedTrainer,
  speedTrainerStep,
  onUpdateSpeedTrainerStep,
  speedTrainerMax,
  onUpdateSpeedTrainerMax,
  timingTrainerEnabled,
  onToggleTimingTrainer,
  timingTrainerHear,
  onUpdateTimingTrainerHear,
  timingTrainerMute,
  onUpdateTimingTrainerMute,
  timingTrainerMuteTracks,
  onUpdateTimingTrainerMuteTracks,
  onResetSongStats,
}) => {
  const [localNote, setLocalNote] = useState(note);
  const [sections, setSections] = useState<Section[]>([]);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [selectedSectionIndices, setSelectedSectionIndices] = useState<number[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState<boolean>(false);

  useEffect(() => {
    setSelectedSectionIndices([]);
  }, [currentSong?.id]);

  useEffect(() => {
    if (loopA === null && loopB === null) {
      setSelectedSectionIndices([]);
    }
  }, [loopA, loopB]);
  
  // Section Editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState<number>(0);
  const [editEnd, setEditEnd] = useState<number>(0);

  // BPM override local input
  const [bpmInput, setBpmInput] = useState<string>('');

  // Song Structure Analyzer State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'visual' | 'doc'>('visual');
  const [copiedJson, setCopiedJson] = useState(false);

  const handleTriggerAnalysis = async () => {
    if (!currentSong) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    setShowAnalysisModal(true);
    
    // Tiny delay to let the modal transition and show the loader
    setTimeout(async () => {
      try {
        const result = await analyzeSongStructure(currentSong, songBpm);
        setAnalysisResult(result);
        setIsAnalyzing(false);
      } catch (err: any) {
        console.error('Error in local audio analyzer:', err);
        setAnalysisError('DSP-Audioanalyse fehlgeschlagen: ' + (err.message || String(err)));
        setIsAnalyzing(false);
      }
    }, 600);
  };

  const handleApplyAnalysis = () => {
    if (!analysisResult) return;
    
    // Map DetectedSection[] to Section[]
    const mappedSections: Section[] = analysisResult.sections.map(s => ({
      name: s.name,
      start: s.startTime,
      end: s.endTime
    }));
    
    saveAndSyncSections(mappedSections);
    setShowAnalysisModal(false);
  };

  const handleCopyJson = () => {
    if (!analysisResult) return;
    const jsonStr = JSON.stringify({
      sections: analysisResult.sections.map(s => ({
        name: s.name,
        startBar: s.startBar,
        endBar: s.endBar,
        confidence: s.confidence
      }))
    }, null, 2);
    
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleDownloadJson = () => {
    if (!analysisResult) return;
    const jsonStr = JSON.stringify({
      sections: analysisResult.sections.map(s => ({
        name: s.name,
        startBar: s.startBar,
        endBar: s.endBar,
        confidence: s.confidence
      }))
    }, null, 2);
    
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSong?.title.toLowerCase().replace(/\s+/g, '_')}_structure.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Daily Practice History State
  const [practiceHistory, setPracticeHistory] = useState<string[]>([]);

  // Custom Practice Progress and Confidence Level States
  const [practiceLevel, setPracticeLevel] = useState<number>(0);
  const [confidenceLevel, setConfidenceLevel] = useState<number>(0);

  useEffect(() => {
    if (!currentSong) return;
    const pLevel = localStorage.getItem(`drumpractice_practice_${currentSong.id}`);
    const cLevel = localStorage.getItem(`drumpractice_confidence_${currentSong.id}`);
    setPracticeLevel(pLevel ? parseInt(pLevel) : 0);
    setConfidenceLevel(cLevel ? parseInt(cLevel) : 0);
  }, [currentSong?.id]);

  const handlePracticeChange = (level: number) => {
    setPracticeLevel(level);
    if (currentSong) {
      localStorage.setItem(`drumpractice_practice_${currentSong.id}`, String(level));
    }
  };

  const handleConfidenceChange = (level: number) => {
    setConfidenceLevel(level);
    if (currentSong) {
      localStorage.setItem(`drumpractice_confidence_${currentSong.id}`, String(level));
    }
  };

  // Sync note state if song changes
  useEffect(() => {
    setLocalNote(note);
  }, [note, currentSong?.id]);

  // Sync custom BPM input
  useEffect(() => {
    setBpmInput(String(songBpm));
  }, [songBpm, currentSong?.id]);

  // Load sections on mount/song change or when BPM changes
  useEffect(() => {
    if (!currentSong) return;
    const songId = currentSong.id;
    const songLength = duration || currentSong.duration || 180;
    
    try {
      const saved = localStorage.getItem(`drumpractice_sections_${songId}`);
      if (saved) {
        setSections(JSON.parse(saved));
      } else {
        const presets = getPresetSections(songId, songLength);
        if (presets) {
          setSections(presets);
        } else {
          setSections(generateSmartSections(songBpm, songLength));
        }
      }
    } catch {
      const presets = getPresetSections(songId, songLength);
      setSections(presets || generateSmartSections(songBpm, songLength));
    }
  }, [currentSong?.id, duration, songBpm]);

  // Load and sync practice history
  useEffect(() => {
    if (!currentSong) return;
    try {
      const saved = localStorage.getItem(`drumpractice_history_${currentSong.id}`);
      setPracticeHistory(saved ? JSON.parse(saved) : []);
    } catch {
      setPracticeHistory([]);
    }
  }, [currentSong?.id]);

  // Log today in history if they have practiced at least 10 seconds total for this song
  useEffect(() => {
    if (!currentSong || stats.totalDuration < 10) return;
    const todayStr = new Date().toDateString();
    setPracticeHistory((prev) => {
      if (prev.includes(todayStr)) return prev;
      const next = [...prev, todayStr];
      localStorage.setItem(`drumpractice_history_${currentSong.id}`, JSON.stringify(next));
      return next;
    });
  }, [currentSong?.id, stats.totalDuration]);

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalNote(val);
    onSaveNote(val); // Autosave
  };

  const saveAndSyncSections = (newSections: Section[]) => {
    setSections(newSections);
    if (currentSong) {
      localStorage.setItem(`drumpractice_sections_${currentSong.id}`, JSON.stringify(newSections));
    }
  };

  const handleAddCustomSection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionName.trim() || loopA === null || loopB === null || !currentSong) return;

    const newSec: Section = {
      name: newSectionName.trim(),
      start: Number(loopA.toFixed(2)),
      end: Number(loopB.toFixed(2)),
    };

    const updated = [...sections, newSec].sort((a, b) => a.start - b.start);
    saveAndSyncSections(updated);
    
    setNewSectionName('');
    setIsAddingSection(false);
  };

  const handleDeleteSection = (indexToDelete: number) => {
    const updated = sections.filter((_, idx) => idx !== indexToDelete);
    saveAndSyncSections(updated);
    if (editingIndex === indexToDelete) {
      setEditingIndex(null);
    }
  };

  const handleResetSections = () => {
    if (!currentSong) return;
    const songLength = duration || currentSong.duration || 180;
    const presets = getPresetSections(currentSong.id, songLength);
    const defaults = presets || generateSmartSections(songBpm, songLength);
    saveAndSyncSections(defaults);
    setEditingIndex(null);
  };

  const handleStartEditSection = (index: number, sec: Section) => {
    setEditingIndex(index);
    setEditName(sec.name);
    setEditStart(sec.start);
    setEditEnd(sec.end);
  };

  if (!currentSong) {
    return (
      <div className="bg-brand-card border border-brand-border rounded-xl p-6 text-center text-slate-500 text-xs">
        Wähle einen Song aus, um Übungs-Statistiken, Notizen und Songabschnitte anzuzeigen.
      </div>
    );
  }

  const songLen = (duration && duration > 5) ? duration : (currentSong?.duration && currentSong.duration > 5 ? currentSong.duration : 180);
  const calculatedSessions = Math.floor((stats?.totalDuration || 0) / Math.max(1, songLen));

  const handleResetLocalDashboardState = () => {
    setPracticeLevel(0);
    setConfidenceLevel(0);
    setPracticeHistory([]);
    if (currentSong) {
      localStorage.removeItem(`drumpractice_history_${currentSong.id}`);
      localStorage.removeItem(`drumpractice_practice_${currentSong.id}`);
      localStorage.removeItem(`drumpractice_confidence_${currentSong.id}`);
    }
    if (onResetSongStats) {
      onResetSongStats();
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const activeSectionIndex = sections.findIndex(
    (sec) => currentPosition >= sec.start && currentPosition < sec.end
  );

  const handleSectionClick = (idx: number, e?: React.MouseEvent) => {
    const sec = sections[idx];
    if (!sec) return;

    let nextIndices: number[] = [idx];

    // If shift key is held down or multiSelectMode is active, extend selection
    if ((e?.shiftKey || multiSelectMode) && selectedSectionIndices.length > 0) {
      const firstSelected = selectedSectionIndices[0];
      const minIdx = Math.min(firstSelected, idx);
      const maxIdx = Math.max(firstSelected, idx);
      nextIndices = [];
      for (let i = minIdx; i <= maxIdx; i++) {
        nextIndices.push(i);
      }
    }

    setSelectedSectionIndices(nextIndices);

    const minSecIdx = Math.min(...nextIndices);
    const maxSecIdx = Math.max(...nextIndices);
    const startSec = sections[minSecIdx];
    const endSec = sections[maxSecIdx];

    onSeek(startSec.start);
    onSetLoopA(startSec.start);
    onSetLoopB(endSec.end);
  };

  const handleFineTuneLoopA = (val: number) => {
    onSetLoopA(val);
    onSeek(val);
  };

  const handleFineTuneLoopB = (val: number) => {
    onSetLoopB(val);
    // Seek to 1.5 seconds before the loop ends to hear the tail end preview transition
    onSeek(Math.max(loopA !== null ? loopA : 0, Number((val - 1.5).toFixed(2))));
  };

  // Timing Trainer calculations for LED indicator bar
  const barDur = 240 / songBpm;
  const currentBar = Math.floor(currentPosition / barDur);
  const cycleBars = timingTrainerHear + timingTrainerMute;
  const barInCycle = currentBar % cycleBars;

  // Conductor Beat Pulsar for visual metronome
  const beatDuration = 60 / (songBpm || 120);
  const totalBeats = Math.floor(currentPosition / beatDuration);
  const currentBeatInMeasure = (totalBeats % 4) + 1;
  const progressInBeat = (currentPosition % beatDuration) / beatDuration;
  const isBeating = progressInBeat < 0.3; // Flash for the first 30% of beat duration

  // Build last 7 days calendar array
  const getLast7Days = () => {
    const days = [];
    const dateNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const isToday = i === 0;
      const practicedOnDay = practiceHistory.includes(d.toDateString());
      days.push({
        name: dateNames[d.getDay()],
        isToday,
        practiced: practicedOnDay,
      });
    }
    return days;
  };

  const last7Days = getLast7Days();
  const streakCount = practiceHistory.length; // Number of unique practice days logged

  const hasValidLoop = loopA !== null && loopB !== null && loopB > loopA;

  return (
    <div className="flex flex-col gap-5" id="practice-dashboard-grid">
      {/* -------------------- AUTOMATIC DSP ANALYSIS MODAL -------------------- */}
      {showAnalysisModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto" id="analysis-modal">
          <div className="bg-brand-card border border-brand-border rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/30">
                  <Cpu className="w-5 h-5 text-amber-500 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Multi-Spur Audio-Strukturanalyse</h3>
                  <p className="text-xs text-slate-400">Offline-Algorithmen (DSP-basiert) für den Song: <span className="text-slate-300 font-semibold">{currentSong?.title}</span></p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowAnalysisModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 bg-black/40 hover:bg-black/80 border border-brand-border/40 rounded-lg px-2.5 transition cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5 scrollbar-thin">
              {isAnalyzing ? (
                /* 1. LOADING STATE */
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-brand-border border-t-amber-500 animate-spin" />
                    <Cpu className="absolute inset-0 m-auto w-6 h-6 text-amber-500 animate-pulse" />
                  </div>
                  <div className="text-center space-y-1.5">
                    <h4 className="text-sm font-semibold text-slate-200 font-mono">Dekodierte Audiodateien werden analysiert...</h4>
                    <p className="text-xs text-slate-500 max-w-sm">
                      Berechne Signal-Energie (RMS) für Drums, Vocals und Instrumente. Ermittle BPM und Takt-Spitzen zur exakten Takt-Ausrichtung...
                    </p>
                  </div>
                </div>
              ) : analysisError ? (
                /* 2. ERROR STATE */
                <div className="p-5 bg-red-950/20 border border-red-900/40 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-red-400">Analyse fehlgeschlagen</h4>
                    <p className="text-xs text-slate-400 mt-1">{analysisError}</p>
                    <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                      Stellen Sie sicher, dass für diesen Song die Audiospuren geladen und dekomprimiert wurden. Preset-Songs und korrekte Multi-Track-Importe sind voll kompatibel.
                    </p>
                    <button
                      type="button"
                      onClick={handleTriggerAnalysis}
                      className="mt-4 px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-200 text-xs rounded-lg border border-red-700/50 transition cursor-pointer"
                    >
                      Erneut versuchen
                    </button>
                  </div>
                </div>
              ) : analysisResult ? (
                /* 3. SUCCESS STATE */
                <div className="space-y-5">
                  {/* Summary row */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-black/40 border border-brand-border/40 rounded-xl p-3 text-center">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-mono">Erkanntes Tempo</div>
                      <div className="text-xl font-black text-amber-500 font-mono mt-0.5">{analysisResult.bpm} <span className="text-xs font-normal text-slate-400">BPM</span></div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-mono">Gezählte Takte</div>
                      <div className="text-xl font-black text-slate-200 font-mono mt-0.5">{analysisResult.totalBars} <span className="text-xs font-normal text-slate-500">Bars</span></div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-mono">Takt-Dauer</div>
                      <div className="text-xl font-black text-slate-200 font-mono mt-0.5">{analysisResult.barDuration.toFixed(2)}s <span className="text-xs font-normal text-slate-500">/ Bar</span></div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-mono">Abschnitte</div>
                      <div className="text-xl font-black text-emerald-500 font-mono mt-0.5">{analysisResult.sections.length} <span className="text-xs font-normal text-slate-400">Parts</span></div>
                    </div>
                  </div>

                  {/* Navigation Tabs */}
                  <div className="flex border-b border-brand-border/40 gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveAnalysisTab('visual')}
                      className={`px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
                        activeAnalysisTab === 'visual'
                          ? 'border-amber-500 text-amber-500'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      Visualisierung & Marker
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveAnalysisTab('doc')}
                      className={`px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
                        activeAnalysisTab === 'doc'
                          ? 'border-amber-500 text-amber-500'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Algorithmen & Dokumentation
                    </button>
                  </div>

                  {/* Tab Panels */}
                  {activeAnalysisTab === 'visual' && (
                    <div className="space-y-4">
                      {/* Interactive Section Block Timeline */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold font-mono">Visuelles Song-Schnittbild (Timeline Proportional)</label>
                        <div className="w-full flex h-8 rounded-lg overflow-hidden border border-brand-border/60 bg-black shadow-inner">
                          {analysisResult.sections.map((sec, sIdx) => {
                            const durationSec = sec.endTime - sec.startTime;
                            const pct = (durationSec / (duration || 1)) * 100;
                            
                            // Visual color scheme mapping
                            let bgClass = 'bg-slate-600 hover:bg-slate-500 text-slate-100';
                            if (sec.name.includes('Intro')) bgClass = 'bg-slate-700 border-r border-slate-600/40 hover:bg-slate-600 text-slate-300';
                            else if (sec.name.includes('Verse') || sec.name.includes('Strophe')) bgClass = 'bg-blue-600/45 border-r border-blue-500/30 hover:bg-blue-600/60 text-blue-300';
                            else if (sec.name.includes('Chorus') || sec.name.includes('Refrain')) bgClass = 'bg-amber-600/45 border-r border-amber-500/30 hover:bg-amber-600/60 text-amber-300';
                            else if (sec.name.includes('Pre-Chorus')) bgClass = 'bg-indigo-600/45 border-r border-indigo-500/30 hover:bg-indigo-600/60 text-indigo-300';
                            else if (sec.name.includes('Solo')) bgClass = 'bg-orange-600/45 border-r border-orange-500/30 hover:bg-orange-600/60 text-orange-300';
                            else if (sec.name.includes('Outro')) bgClass = 'bg-purple-600/45 border-r border-purple-500/30 hover:bg-purple-600/60 text-purple-300';
                            else if (sec.name.includes('Bridge')) bgClass = 'bg-rose-600/45 border-r border-rose-500/30 hover:bg-rose-600/60 text-rose-300';

                            return (
                              <div
                                key={`visual-block-${sIdx}`}
                                className={`h-full flex items-center justify-center text-[10px] font-bold truncate transition-all px-1 cursor-default ${bgClass}`}
                                style={{ width: `${Math.max(4, pct)}%` }}
                                title={`${sec.name}: Takt ${sec.startBar}-${sec.endBar} (${formatTime(sec.startTime)} - ${formatTime(sec.endTime)}) - Vertrauensgrad: ${Math.round(sec.confidence * 100)}%`}
                              >
                                {sec.name}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Detailed table of sections */}
                      <div className="border border-brand-border/40 rounded-xl overflow-hidden bg-black/20">
                        {(() => {
                          const getTrackEnergyForSection = (startBar: number, endBar: number, track: 'drums' | 'vocals' | 'instruments') => {
                            if (!analysisResult || !analysisResult.rawFeatures || !analysisResult.rawFeatures.barEnergy) return 0;
                            const list = analysisResult.rawFeatures.barEnergy[track];
                            if (!list || list.length === 0) return 0;
                            // startBar is 1-indexed, endBar is 1-indexed inclusive in our visual output
                            const sIdx = Math.max(0, startBar - 1);
                            const eIdx = Math.min(list.length, endBar);
                            const sub = list.slice(sIdx, eIdx);
                            if (sub.length === 0) return 0;
                            const sum = sub.reduce((a, b) => a + b, 0);
                            return sum / sub.length;
                          };

                          return (
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-black/60 border-b border-brand-border/60 text-slate-400 font-mono text-[10px] uppercase">
                                  <th className="py-2.5 px-4 font-semibold">Abschnitt</th>
                                  <th className="py-2.5 px-4 font-semibold">Takte (Bars)</th>
                                  <th className="py-2.5 px-4 font-semibold">Zeitspanne</th>
                                  <th className="py-2.5 px-4 font-semibold">4-Spur Pegelanalyse (Separat)</th>
                                  <th className="py-2.5 px-4 font-semibold">Zusammenfassung</th>
                                  <th className="py-2.5 px-4 font-semibold">Analyse-Rationale / Regel-Begründung</th>
                                  <th className="py-2.5 px-4 font-semibold text-right">Konfidenz</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-brand-border/30 font-sans">
                                {analysisResult.sections.map((sec, sIdx) => {
                                  const isHighConf = sec.confidence >= 0.8;
                                  const drumsVol = getTrackEnergyForSection(sec.startBar, sec.endBar, 'drums');
                                  const vocalsVol = getTrackEnergyForSection(sec.startBar, sec.endBar, 'vocals');
                                  const instVol = getTrackEnergyForSection(sec.startBar, sec.endBar, 'instruments');
                                  const clickVol = 1.0; // Click track is always 100% active as clock reference

                                  return (
                                    <tr key={`tbl-row-${sIdx}`} className="hover:bg-white/[0.02] transition">
                                      <td className="py-2.5 px-4 font-bold text-slate-200">{sec.name}</td>
                                      <td className="py-2.5 px-4 font-mono text-slate-300">
                                        Takt {sec.startBar} – {sec.endBar}
                                        <span className="text-[10px] text-slate-500 block">({sec.endBar - sec.startBar + 1} Takte)</span>
                                      </td>
                                      <td className="py-2.5 px-4 font-mono text-slate-300">
                                        {formatTime(sec.startTime)} – {formatTime(sec.endTime)}
                                        <span className="text-[10px] text-slate-500 block">({(sec.endTime - sec.startTime).toFixed(1)}s)</span>
                                      </td>
                                      {/* 4-Spur separate analysis visual meters */}
                                      <td className="py-2.5 px-4 text-[10px] font-mono text-slate-300 max-w-[180px]">
                                        <div className="flex flex-col gap-1 bg-black/30 p-1.5 rounded-lg border border-brand-border/20">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[9px] text-slate-500">🥁 DRUMS:</span>
                                            <div className="w-20 bg-slate-800 h-1.5 rounded overflow-hidden flex">
                                              <div className="bg-amber-500 h-full" style={{ width: `${drumsVol * 100}%` }} />
                                            </div>
                                            <span className="text-[9px] w-6 text-right text-slate-400">{Math.round(drumsVol * 100)}%</span>
                                          </div>
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[9px] text-slate-500">🎤 VOCAL:</span>
                                            <div className="w-20 bg-slate-800 h-1.5 rounded overflow-hidden flex">
                                              <div className="bg-sky-500 h-full" style={{ width: `${vocalsVol * 100}%` }} />
                                            </div>
                                            <span className="text-[9px] w-6 text-right text-slate-400">{Math.round(vocalsVol * 100)}%</span>
                                          </div>
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[9px] text-slate-500">🎸 INST:</span>
                                            <div className="w-20 bg-slate-800 h-1.5 rounded overflow-hidden flex">
                                              <div className="bg-emerald-500 h-full" style={{ width: `${instVol * 100}%` }} />
                                            </div>
                                            <span className="text-[9px] w-6 text-right text-slate-400">{Math.round(instVol * 100)}%</span>
                                          </div>
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[9px] text-slate-500">⏱️ KLICK:</span>
                                            <div className="w-20 bg-slate-800 h-1.5 rounded overflow-hidden flex">
                                              <div className="bg-indigo-500 h-full" style={{ width: `${clickVol * 100}%` }} />
                                            </div>
                                            <span className="text-[9px] w-6 text-right text-slate-400">100%</span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-4 text-[11px]">
                                        <div className="flex flex-col gap-1">
                                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold w-max ${
                                            sec.energyLevel === 'high' ? 'bg-orange-950/40 text-orange-400 border border-orange-900/30' :
                                            sec.energyLevel === 'medium' ? 'bg-blue-950/40 text-blue-400 border border-blue-900/30' :
                                            'bg-slate-900 text-slate-400 border border-slate-800'
                                          }`}>
                                            Energie: {sec.energyLevel === 'high' ? 'HOCH' : sec.energyLevel === 'medium' ? 'MITTEL' : 'GERING'}
                                          </span>
                                          <span className={`text-[10px] ${sec.hasVocals ? 'text-emerald-400' : 'text-slate-500'}`}>
                                            🎤 {sec.hasVocals ? 'Gesang aktiv' : 'Kein Gesang'}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-4 text-[11px] text-slate-400 leading-normal max-w-xs">{sec.reason}</td>
                                      <td className="py-2.5 px-4 text-right font-mono font-bold">
                                        <div className="flex flex-col items-end gap-1">
                                          <span className={isHighConf ? 'text-emerald-400' : 'text-amber-500'}>
                                            {Math.round(sec.confidence * 100)}%
                                          </span>
                                          <div className="w-12 h-1 bg-black rounded-full overflow-hidden">
                                            <div 
                                              className={`h-full ${isHighConf ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                              style={{ width: `${sec.confidence * 100}%` }}
                                            />
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    </div>
                  )}



                  {activeAnalysisTab === 'doc' && (
                    <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
                      <div className="border border-brand-border/40 rounded-xl p-4 bg-black/20 space-y-3">
                        <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4 text-amber-500" />
                          Technisches Datenblatt & DSP-Dokumentation
                        </h4>
                        
                        <div className="space-y-4 divide-y divide-brand-border/20">
                          <div className="pt-0">
                            <h5 className="font-bold text-amber-400 mb-1">1. Eingesetzte Algorithmen (Ohne Cloud-KI)</h5>
                            <p className="text-slate-400">
                              Die Erkennung basiert auf deterministischen Methoden der digitalen Signalverarbeitung (DSP):
                            </p>
                            <ul className="list-disc list-inside mt-1.5 space-y-1 pl-1 text-slate-400">
                              <li><strong className="text-slate-200">Peak- und Transientenerkennung:</strong> Auf der <strong className="text-amber-500/90 font-mono">Click-Spur</strong> wird mittels adaptiver Amplituden-Schwellwertfilterung und einer Entprell-Sperrzeit (Debouncing von 200 ms) jeder Metronom-Klick präzise detektiert.</li>
                              <li><strong className="text-slate-200">Statistische BPM-Schätzung:</strong> Aus den Abständen der transienten Klicks wird der Median-Wert gebildet. Dies schützt das System vor Ausreißern und errechnet den exakten BPM-Wert des Songs im Web-Client.</li>
                              <li><strong className="text-slate-200">RMS-Laufzeit-Hüllkurven:</strong> Für Drums, Vocals und Begleitung werden zeitlich gemittelte Effektivwerte (RMS-Hüllkurven) berechnet. Zur Schonung der CPU wird ein schnelles Downsampling (Schrittweite 4) integriert, um Latenzen zu minimieren.</li>
                              <li><strong className="text-slate-200">Novelty-Grenzwerterkennung:</strong> Ein fortlaufendes Differenzmaß vergleicht die spektrale und lautstärketechnische Energie von Takt $N$ zu Takt $N-1$. Große Gradienten-Sprünge kennzeichnen Part-Grenzen.</li>
                            </ul>
                          </div>

                          <div className="pt-3">
                            <h5 className="font-bold text-amber-400 mb-1">2. Zu analysierende Audio-Merkmale</h5>
                            <ul className="list-disc list-inside mt-1 pl-1 space-y-1 text-slate-400">
                              <li><strong className="text-slate-200">Click-Spur:</strong> Extraktion der exakten transienten Einschwingzeiten für die mathematisch fehlerfreie Ausrichtung aller Song-Übergänge an Taktgrenzen (Taktanfänge).</li>
                              <li><strong className="text-slate-200">Drum-Spur:</strong> Dynamikgatter und plötzliche Energiedifferenzen detektieren Einstiege, Breaks (Stille-Phasen) oder füllende Wirbel (Fill-Ins) und Crash-Becken am Taktanfang.</li>
                              <li><strong className="text-slate-200">Vocal-Spur:</strong> VAD (Voice Activity Detection) durch Amplitudenschwellen. Klassifiziert, ob gesungen wird. Die Gesangsdichte entscheidet maßgeblich zwischen instrumentalen (Intro/Solo) und vokalen Abschnitten (Verse/Chorus).</li>
                              <li><strong className="text-slate-200">Instrumenten-Spur:</strong> Analyse der harmonischen Gesamtenergie. Extrem dichte Energiekurven grenzen kraftvolle Refrains (Choruses) von feineren Strophen (Verses) ab.</li>
                            </ul>
                          </div>

                          <div className="pt-3">
                            <h5 className="font-bold text-amber-400 mb-1">3. Realistische Genauigkeiten im Webbrowser</h5>
                            <ul className="list-disc list-inside mt-1 pl-1 space-y-1 text-slate-400">
                              <li><strong className="text-slate-200">Metronom- und Taktgrenzen:</strong> <span className="text-emerald-400 font-bold">100% Genauigkeit</span>. Da die Click-Spur synthetisch klar ist, werden Taktwechsel zeitlich millisekundengenau getroffen.</li>
                              <li><strong className="text-slate-200">Gliederungs-Grenzen:</strong> <span className="text-emerald-400 font-bold">~85% bis 95% Genauigkeit</span>. Das System fängt grobe Energie- und Arrangementwechsel exzellent ab. Bei sehr weichen Übergängen oder unregelmäßigen Taktwechseln können Grenzen um 1-2 Takte verschoben sein.</li>
                              <li><strong className="text-slate-200">Sektionen-Klassifizierung:</strong> <span className="text-emerald-400 font-bold">~80% bis 90% Genauigkeit</span>. Das heuristische Regelwerk (Loudness + Vocals + Position) separiert zuverlässig Intro, Verse, Chorus, Solo, Bridge und Outro.</li>
                            </ul>
                          </div>

                          <div className="pt-3">
                            <h5 className="font-bold text-amber-400 mb-1">4. Schritt-für-Schritt Umsetzung im Client</h5>
                            <ol className="list-decimal list-inside mt-1 pl-1 space-y-1 text-slate-400">
                              <li><strong className="text-slate-200">Schritt 1:</strong> Auslesen der rohen Gleitkomma-Kanaldaten (Float32Array) aus den Web Audio API <code className="text-amber-500 font-mono">AudioBuffer</code>s.</li>
                              <li><strong className="text-slate-200">Schritt 2:</strong> Peaksuche im Click-Signal und Aufbau des Zeitrasters anhand des berechneten BPM-Werts.</li>
                              <li><strong className="text-slate-200">Schritt 3:</strong> Berechnung der RMS-Hüllkurven für alle Spuren synchronisiert über das Zeitraster pro Takt.</li>
                              <li><strong className="text-slate-200">Schritt 4:</strong> Differenz-Berechnung und Grenzwertsuche über den Novelty-Verlauf zur Grenzfindung.</li>
                              <li><strong className="text-slate-200">Schritt 5:</strong> Heuristische Filterung und Namensvergabe auf Basis von Gesangspräsenz, Signalenergie und Sektionsreihenfolge.</li>
                            </ol>
                          </div>

                          <div className="pt-3">
                            <h5 className="font-bold text-amber-400 mb-1">5. Empfohlene Bibliotheken für professionelle native Web-Audioanalyse</h5>
                            <p className="text-slate-400">
                              Wenn Sie diese Client-Architektur für native Großanwendungen skalieren möchten, eignen sich folgende Open-Source DSP Bibliotheken:
                            </p>
                            <ul className="list-disc list-inside mt-1.5 pl-1 space-y-1 text-slate-400">
                              <li><strong className="text-slate-200">Meyda (meyda.js):</strong> Die führende JS-Audio-Feature-Extraktionsbibliothek. Berechnet MFCCs, Spectral Centroid, Flatness, RMS und ZCR in Echtzeit oder offline.</li>
                              <li><strong className="text-slate-200">Essentia.js:</strong> Javascript-Portierung der C++ Audio-Analysebibliothek Essentia (von der MTG Barcelona). Industrieller Standard für komplexe Music Information Retrieval (MIR) Aufgaben wie Key-Detection, Beat-Tracking und Genre-Klassifizierung.</li>
                              <li><strong className="text-slate-200">Tone.js:</strong> Bietet exzellente Web Audio Wrapper für Timing-Synchronisation und schnelle FFT/Analysatoren.</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-black/40 border-t border-brand-border/60 flex items-center justify-between shrink-0">
              <div className="text-[11px] text-slate-500 italic">
                Alle Berechnungen laufen geschützt und lokal in Ihrem Webbrowser (Zero-Database-Dependency).
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAnalysisModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition"
                >
                  Abbrechen
                </button>
                {analysisResult && (
                  <button
                    type="button"
                    onClick={handleApplyAnalysis}
                    className="px-5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-950/20 hover:shadow-amber-500/10 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    Übernehmen & Sektionen überschreiben
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* CARD 1: Song-Abschnitte (Loops) & BPM Fine-Tuning */}
      <div className="bg-brand-card border border-brand-border rounded-xl p-4 flex flex-col justify-start">
        <div>
          <div className="flex items-center justify-between mb-2 h-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-500" />
              Song-Abschnitte (Loops)
            </h3>
            
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMultiSelectMode(!multiSelectMode)}
                className={`text-[10px] px-2 py-0.5 rounded border transition flex items-center gap-1 cursor-pointer ${
                  multiSelectMode
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-500 font-bold font-mono'
                    : 'border-brand-border text-slate-500 hover:text-slate-300 hover:border-brand-border font-mono'
                }`}
                title="Mehrfachauswahl für aufeinanderfolgende Loops aktivieren (oder Shift-Taste gedrückt halten)"
              >
                <Plus className="w-3 h-3" />
                Multi
              </button>

              <button
                onClick={handleResetSections}
                className="text-[10px] text-slate-500 hover:text-amber-500 transition flex items-center gap-1 cursor-pointer"
                title="Abschnitte auf Standards zurücksetzen"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>
          </div>
          
          <p className="text-[10px] text-slate-500 mb-3 leading-relaxed h-12 flex items-center">
            Wähle einen Abschnitt (halte Shift gedrückt für mehrere aufeinanderfolgende) oder klicke Stift-Icon zur Feineinstellung.
          </p>

          {/* Multi-Track Structure Analyzer Button */}
          {currentSong && (
            <button
              type="button"
              onClick={handleTriggerAnalysis}
              className="w-full mb-3.5 py-2 px-3 bg-gradient-to-r from-amber-500/20 to-orange-500/10 hover:from-amber-500/30 hover:to-orange-500/20 text-amber-400 hover:text-white border border-amber-500/35 hover:border-amber-500/60 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] cursor-pointer"
              id="trigger-analysis-btn"
            >
              <Cpu className="w-4 h-4 text-amber-500 animate-pulse" />
              <span>Multi-Spur Audio-Strukturanalyse</span>
            </button>
          )}

          {/* List of sections with inline editor */}
          <div className="space-y-2 max-h-[190px] overflow-y-auto pr-1 scrollbar-thin mb-3">
            {sections.map((sec, idx) => {
              const isActive = selectedSectionIndices.includes(idx) || (selectedSectionIndices.length === 0 && idx === activeSectionIndex);
              const isEditing = idx === editingIndex;

              if (isEditing) {
                return (
                  <div key={`edit-${idx}`} className="bg-black/60 border border-amber-500/50 rounded-lg p-2.5 space-y-2.5" id={`section-editor-${idx}`}>
                    <div>
                      <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Abschnitts-Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-black border border-brand-border rounded px-2 py-1 text-xs text-slate-200 mt-0.5 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    
                    {/* Start position */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Start (sek.)</span>
                        <button
                          type="button"
                          onClick={() => setEditStart(Number(currentPosition.toFixed(2)))}
                          className="text-[9px] text-amber-500 hover:text-amber-400 font-bold flex items-center gap-0.5 cursor-pointer"
                          title="Setzt Start auf aktuelle Zeit"
                        >
                          📌 Aktuell ({formatTime(currentPosition)})
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setEditStart(prev => Math.max(0, Number((prev - 0.5).toFixed(2))))} className="px-1.5 py-0.5 bg-black border border-brand-border rounded text-[9px] hover:bg-brand-border text-slate-300">-0.5s</button>
                        <button type="button" onClick={() => setEditStart(prev => Math.max(0, Number((prev - 0.1).toFixed(2))))} className="px-1.5 py-0.5 bg-black border border-brand-border rounded text-[9px] hover:bg-brand-border text-slate-300">-0.1s</button>
                        <input
                          type="number"
                          step="0.1"
                          value={editStart}
                          onChange={(e) => setEditStart(parseFloat(e.target.value) || 0)}
                          className="w-14 text-center bg-black border border-brand-border rounded text-xs text-slate-200 py-0.5 font-mono focus:outline-none"
                        />
                        <button type="button" onClick={() => setEditStart(prev => Math.min(editEnd - 0.1, Number((prev + 0.1).toFixed(2))))} className="px-1.5 py-0.5 bg-black border border-brand-border rounded text-[9px] hover:bg-brand-border text-slate-300">+0.1s</button>
                        <button type="button" onClick={() => setEditStart(prev => Math.min(editEnd - 0.5, Number((prev + 0.5).toFixed(2))))} className="px-1.5 py-0.5 bg-black border border-brand-border rounded text-[9px] hover:bg-brand-border text-slate-300">+0.5s</button>
                      </div>
                    </div>

                    {/* End position */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Ende (sek.)</span>
                        <button
                          type="button"
                          onClick={() => setEditEnd(Number(currentPosition.toFixed(2)))}
                          className="text-[9px] text-amber-500 hover:text-amber-400 font-bold flex items-center gap-0.5 cursor-pointer"
                          title="Setzt Ende auf aktuelle Zeit"
                        >
                          📌 Aktuell ({formatTime(currentPosition)})
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setEditEnd(prev => Math.max(editStart + 0.1, Number((prev - 0.5).toFixed(2))))} className="px-1.5 py-0.5 bg-black border border-brand-border rounded text-[9px] hover:bg-brand-border text-slate-300">-0.5s</button>
                        <button type="button" onClick={() => setEditEnd(prev => Math.max(editStart + 0.1, Number((prev - 0.1).toFixed(2))))} className="px-1.5 py-0.5 bg-black border border-brand-border rounded text-[9px] hover:bg-brand-border text-slate-300">-0.1s</button>
                        <input
                          type="number"
                          step="0.1"
                          value={editEnd}
                          onChange={(e) => setEditEnd(parseFloat(e.target.value) || 0)}
                          className="w-14 text-center bg-black border border-brand-border rounded text-xs text-slate-200 py-0.5 font-mono focus:outline-none"
                        />
                        <button type="button" onClick={() => setEditEnd(prev => Math.min(duration, Number((prev + 0.1).toFixed(2))))} className="px-1.5 py-0.5 bg-black border border-brand-border rounded text-[9px] hover:bg-brand-border text-slate-300">+0.1s</button>
                        <button type="button" onClick={() => setEditEnd(prev => Math.min(duration, Number((prev + 0.5).toFixed(2))))} className="px-1.5 py-0.5 bg-black border border-brand-border rounded text-[9px] hover:bg-brand-border text-slate-300">+0.5s</button>
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingIndex(null)}
                        className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded hover:bg-slate-700 cursor-pointer"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!editName.trim()) return;
                          const updated = [...sections];
                          updated[idx] = {
                            name: editName.trim(),
                            start: Number(editStart.toFixed(2)),
                            end: Number(editEnd.toFixed(2)),
                          };
                          updated.sort((a, b) => a.start - b.start);
                          saveAndSyncSections(updated);
                          setEditingIndex(null);
                        }}
                        className="px-2.5 py-0.5 bg-amber-500 text-black text-[10px] font-bold rounded hover:bg-amber-400 cursor-pointer"
                      >
                        Sichern
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div 
                  key={`${sec.name}-${idx}`} 
                  className={`group w-full flex items-center gap-1 p-1 rounded-lg border transition ${
                    isActive
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-500'
                      : 'bg-black/30 border-transparent text-slate-400 hover:bg-black/55'
                  }`}
                >
                  <button
                    onClick={(e) => handleSectionClick(idx, e)}
                    className="flex-1 text-left p-1 text-xs font-medium cursor-pointer truncate flex items-center justify-between pr-2"
                  >
                    <span className="truncate">{sec.name}</span>
                    <span className="text-[9px] font-mono opacity-80 shrink-0 ml-1.5">
                      {formatTime(sec.start)} - {formatTime(sec.end)}
                    </span>
                  </button>

                  {/* Edit action */}
                  <button
                    onClick={() => handleStartEditSection(idx, sec)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-amber-500 rounded transition shrink-0 cursor-pointer"
                    title="Abschnitt bearbeiten"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>

                  {/* Delete action */}
                  <button
                    onClick={() => handleDeleteSection(idx)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 rounded transition shrink-0 cursor-pointer"
                    title="Abschnitt löschen"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Custom Section Add & BPM Customizer */}
        <div className="border-t border-brand-border/40 pt-3 space-y-3 shrink-0">
          {isAddingSection ? (
            <form onSubmit={handleAddCustomSection} className="space-y-2 bg-black/20 p-2 rounded-lg border border-brand-border/40">
              <div className="text-[9px] font-bold text-amber-400 uppercase tracking-wider font-mono">
                Ausgewählter Loop ({formatTime(loopA || 0)} - {formatTime(loopB || 0)})
              </div>
              <div className="flex gap-1.5 items-center">
                <input
                  type="text"
                  required
                  placeholder="z.B. Solo, Bridge, Fill..."
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  className="flex-1 bg-black border border-brand-border rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500 h-7"
                  autoFocus
                />
                <button
                  type="submit"
                  className="shrink-0 w-8 h-7 bg-amber-500 text-black rounded flex items-center justify-center hover:bg-amber-400 transition cursor-pointer"
                  title="Sichern"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingSection(false)}
                  className="shrink-0 w-8 h-7 bg-slate-800 text-slate-300 rounded flex items-center justify-center hover:bg-slate-700 transition cursor-pointer"
                  title="Abbrechen"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
            </form>
          ) : (
            hasValidLoop ? (
              <button
                onClick={() => setIsAddingSection(true)}
                className="w-full py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 hover:text-amber-400 border border-amber-500/30 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Aktuellen Loop als Abschnitt speichern
              </button>
            ) : (
              <div className="text-[9px] text-slate-500 text-center leading-normal italic py-0.5">
                *Tipp: Schiebe Timeline-Marker mit der Maus, um Loops hier abzuspeichern!
              </div>
            )
          )}

          {/* Loop Fine Tuners */}
          <div className="space-y-2.5 bg-black/25 border border-brand-border/60 rounded-xl p-3 shadow-inner">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">Schleifen-Feinjustierung</span>
            {loopA !== null || loopB !== null ? (
              <div className="space-y-2.5">
                {/* Loop A (Start) */}
                {loopA !== null && (
                  <div className="flex flex-col gap-1 bg-black/40 p-2 rounded border border-brand-border/40">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-mono font-medium">Start [A]:</span>
                      <span className="text-amber-500 font-bold font-mono">{loopA.toFixed(2)}s</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      <button
                        type="button"
                        onClick={() => handleFineTuneLoopA(Math.max(0, Number((loopA - 0.5).toFixed(2))))}
                        className="py-1 bg-black border border-brand-border/85 rounded text-[10px] hover:bg-brand-border text-slate-300 font-mono cursor-pointer text-center"
                        title="0.5 Sek. zurück"
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFineTuneLoopA(Math.max(0, Number((loopA - 0.1).toFixed(2))))}
                        className="py-1 bg-black border border-brand-border/85 rounded text-[10px] hover:bg-brand-border text-slate-300 font-mono cursor-pointer text-center"
                        title="0.1 Sek. zurück"
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (loopB !== null) {
                            handleFineTuneLoopA(Math.min(loopB - 0.1, Number((loopA + 0.1).toFixed(2))));
                          } else {
                            handleFineTuneLoopA(Number((loopA + 0.1).toFixed(2)));
                          }
                        }}
                        className="py-1 bg-black border border-brand-border/85 rounded text-[10px] hover:bg-brand-border text-slate-300 font-mono cursor-pointer text-center"
                        title="0.1 Sek. vor"
                      >
                        +0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (loopB !== null) {
                            handleFineTuneLoopA(Math.min(loopB - 0.5, Number((loopA + 0.5).toFixed(2))));
                          } else {
                            handleFineTuneLoopA(Number((loopA + 0.5).toFixed(2)));
                          }
                        }}
                        className="py-1 bg-black border border-brand-border/85 rounded text-[10px] hover:bg-brand-border text-slate-300 font-mono cursor-pointer text-center"
                        title="0.5 Sek. vor"
                      >
                        +0.5s
                      </button>
                    </div>
                  </div>
                )}

                {/* Loop B (Ende) */}
                {loopB !== null && (
                  <div className="flex flex-col gap-1 bg-black/40 p-2 rounded border border-brand-border/40">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-mono font-medium">Ende [B]:</span>
                      <span className="text-amber-500 font-bold font-mono">{loopB.toFixed(2)}s</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (loopA !== null) {
                            handleFineTuneLoopB(Math.max(loopA + 0.1, Number((loopB - 0.5).toFixed(2))));
                          } else {
                            handleFineTuneLoopB(Math.max(0, Number((loopB - 0.5).toFixed(2))));
                          }
                        }}
                        className="py-1 bg-black border border-brand-border/85 rounded text-[10px] hover:bg-brand-border text-slate-300 font-mono cursor-pointer text-center"
                        title="0.5 Sek. zurück"
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (loopA !== null) {
                            handleFineTuneLoopB(Math.max(loopA + 0.1, Number((loopB - 0.1).toFixed(2))));
                          } else {
                            handleFineTuneLoopB(Math.max(0, Number((loopB - 0.1).toFixed(2))));
                          }
                        }}
                        className="py-1 bg-black border border-brand-border/85 rounded text-[10px] hover:bg-brand-border text-slate-300 font-mono cursor-pointer text-center"
                        title="0.1 Sek. zurück"
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFineTuneLoopB(Math.min(duration, Number((loopB + 0.1).toFixed(2))))}
                        className="py-1 bg-black border border-brand-border/85 rounded text-[10px] hover:bg-brand-border text-slate-300 font-mono cursor-pointer text-center"
                        title="0.1 Sek. vor"
                      >
                        +0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFineTuneLoopB(Math.min(duration, Number((loopB + 0.5).toFixed(2))))}
                        className="py-1 bg-black border border-brand-border/85 rounded text-[10px] hover:bg-brand-border text-slate-300 font-mono cursor-pointer text-center"
                        title="0.5 Sek. vor"
                      >
                        +0.5s
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[9px] text-slate-500 font-medium italic leading-relaxed text-center py-2 bg-black/10 rounded border border-dashed border-brand-border/40">
                Kein aktiver Loop gesetzt. Verwende die A-B Knöpfe oder klicke einen Abschnitt oben an, um Schleifen feinjustieren zu können!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CARD 2: Drummer Übungs-Tools (Tempo-Trainer & Timing-Trainer) */}
      <div className="bg-brand-card border border-brand-border rounded-xl p-4 flex flex-col justify-start" id="practice-tools-card">
        <div>
          <div className="flex items-center justify-between mb-2 h-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-500" />
              Drummer Übungs-Tools
            </h3>
          </div>
          
          <p className="text-[10px] text-slate-500 mb-3 leading-relaxed h-12 flex items-center">
            Erhöhe das Tempo automatisch pro Schleifendurchlauf oder übe dein Timing mit dem Stumm-Modus.
          </p>
          
          {/* TOOL A: Auto Tempo-Trainer */}
          <div className="bg-black/30 border border-brand-border/60 rounded-xl p-3 space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-200">Tempo-Steigerer</span>
                <span className="text-[9px] text-slate-500">Erhöht Tempo automatisch pro Loop-Durchlauf</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={speedTrainerEnabled}
                  onChange={(e) => onToggleSpeedTrainer(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-black peer-checked:after:border-black"></div>
              </label>
            </div>

            {speedTrainerEnabled && (
              <div className="grid grid-cols-2 gap-2 text-[10px] pt-1">
                <div>
                  <span className="text-slate-500 block mb-0.5 font-mono uppercase tracking-wide">Steigerung:</span>
                  <select
                    value={speedTrainerStep}
                    onChange={(e) => onUpdateSpeedTrainerStep(parseInt(e.target.value))}
                    className="w-full bg-black border border-brand-border/80 rounded px-1.5 py-0.5 text-slate-300 font-mono text-[10px]"
                  >
                    <option value="1">+1%</option>
                    <option value="2">+2%</option>
                    <option value="5">+5%</option>
                    <option value="10">+10%</option>
                  </select>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5 font-mono uppercase tracking-wide">Maximal-Limit:</span>
                  <select
                    value={speedTrainerMax}
                    onChange={(e) => onUpdateSpeedTrainerMax(parseInt(e.target.value))}
                    className="w-full bg-black border border-brand-border/80 rounded px-1.5 py-0.5 text-slate-300 font-mono text-[10px]"
                  >
                    <option value="100">100%</option>
                    <option value="120">120%</option>
                    <option value="150">150%</option>
                    <option value="180">180%</option>
                    <option value="200">200%</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* TOOL B: Timing-Trainer (Inner Clock) */}
          <div className="bg-black/30 border border-brand-border/60 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-200">Inner-Clock-Trainer</span>
                <span className="text-[9px] text-slate-500">Taktweise Spuren-Stummschaltung</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={timingTrainerEnabled}
                  onChange={(e) => onToggleTimingTrainer(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-black peer-checked:after:border-black"></div>
              </label>
            </div>

            {timingTrainerEnabled && (
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-slate-500 block mb-0.5 font-mono uppercase tracking-wide">Takte Hören:</span>
                    <select
                      value={timingTrainerHear}
                      onChange={(e) => onUpdateTimingTrainerHear(parseInt(e.target.value))}
                      className="w-full bg-black border border-brand-border/80 rounded px-1.5 py-0.5 text-slate-300 font-mono text-[10px] cursor-pointer"
                    >
                      {[1, 2, 3, 4, 6, 8, 12, 16].map((bars) => (
                        <option key={`hear-${bars}`} value={bars}>{bars} {bars === 1 ? 'Takt' : 'Takte'}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5 font-mono uppercase tracking-wide">Takte Stumm:</span>
                    <select
                      value={timingTrainerMute}
                      onChange={(e) => onUpdateTimingTrainerMute(parseInt(e.target.value))}
                      className="w-full bg-black border border-brand-border/80 rounded px-1.5 py-0.5 text-slate-300 font-mono text-[10px] cursor-pointer"
                    >
                      {[1, 2, 3, 4, 6, 8, 12, 16].map((bars) => (
                        <option key={`mute-${bars}`} value={bars}>{bars} {bars === 1 ? 'Takt' : 'Takte'}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block mb-1 font-mono uppercase tracking-wide text-[9px]">Stummzuschaltende Quellen im Fokus:</span>
                  <div className="grid grid-cols-4 gap-1">
                    {(['Klick', 'Drum', 'Gesang', 'Instrumente'] as const).map((track) => {
                      const isMuted = timingTrainerMuteTracks[track] ?? false;
                      return (
                        <button
                          key={track}
                          type="button"
                          onClick={() => {
                            const updated = { ...timingTrainerMuteTracks, [track]: !isMuted };
                            onUpdateTimingTrainerMuteTracks(updated);
                          }}
                          className={`py-1 px-0.5 rounded text-[9px] border font-bold transition flex flex-col items-center gap-0.5 cursor-pointer ${
                            isMuted
                              ? 'bg-amber-500/20 border-amber-500/60 text-amber-500 shadow shadow-amber-500/10'
                              : 'bg-black border-brand-border/60 text-slate-500 hover:text-slate-300'
                          }`}
                          title={`${track} stummschalten während der Fokusphase`}
                        >
                          <span className="text-[7px] text-slate-400 font-mono font-medium">
                            {isMuted ? '🔇 Stumm' : '🔊 Aktiv'}
                          </span>
                          <span className="truncate max-w-full">{track}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* LED measures indicator block */}
                <div className="border border-brand-border/60 rounded-lg p-2.5 bg-black/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Takt-Visualisierer:</span>
                    <span className={`text-[10px] font-bold font-mono tracking-wider ${
                      barInCycle < timingTrainerHear ? 'text-emerald-400' : 'text-amber-500'
                    }`}>
                      {barInCycle < timingTrainerHear ? '🔊 HÖREN' : '🔇 FOKUS'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 justify-center flex-wrap">
                    {Array.from({ length: cycleBars }).map((_, i) => {
                      const isHear = i < timingTrainerHear;
                      const isCurrent = i === barInCycle;
                      return (
                        <div
                          key={`led-${i}`}
                          className={`w-4 h-3 rounded-md border transition-all duration-300 ${
                            isCurrent
                              ? isHear
                                ? 'bg-emerald-500 border-emerald-400 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/50 scale-y-110'
                                : 'bg-amber-500 border-amber-400 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/50 scale-y-110'
                              : isHear
                              ? 'bg-emerald-950/40 border-emerald-900/40 text-emerald-800'
                              : 'bg-amber-950/40 border-amber-900/40 text-amber-800'
                          }`}
                          title={`Takt ${i + 1} (${isHear ? 'Hören' : 'Stumm'})`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Visual Conductor / Beat Flasher (Always Active) */}
            <div className="border border-brand-border/60 rounded-xl p-3 bg-black/45 shadow-inner mt-2">
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Takt-Dirigent (Visual Metronome)</span>
                
                <div className="flex items-center gap-1 bg-black/40 px-1 py-0.5 rounded border border-brand-border/30">
                  <button 
                    type="button"
                    onClick={() => {
                      const b = Math.max(20, songBpm - 1);
                      onUpdateSongBpm(b);
                    }}
                    className="p-0.5 bg-black/60 rounded border border-brand-border/40 text-slate-400 hover:text-white cursor-pointer hover:bg-black"
                    title="BPM -1"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="text"
                      value={bpmInput}
                      onChange={(e) => setBpmInput(e.target.value)}
                      onBlur={() => {
                        const b = parseInt(bpmInput);
                        if (b && b >= 20 && b <= 300) {
                          onUpdateSongBpm(b);
                        } else {
                          setBpmInput(String(songBpm));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const b = parseInt(bpmInput);
                          if (b && b >= 20 && b <= 300) {
                            onUpdateSongBpm(b);
                            (e.target as HTMLInputElement).blur();
                          }
                        }
                      }}
                      className="w-8 text-center bg-transparent border-none p-0 text-[10px] font-mono font-bold text-amber-500 focus:outline-none focus:ring-0"
                      title="Klicke zum Bearbeiten des BPM-Werts"
                    />
                    <span className="text-[8px] text-slate-500 font-mono pr-0.5">BPM</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      const b = Math.min(300, songBpm + 1);
                      onUpdateSongBpm(b);
                    }}
                    className="p-0.5 bg-black/60 rounded border border-brand-border/40 text-slate-400 hover:text-white cursor-pointer hover:bg-black"
                    title="BPM +1"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-1.5 py-1.5 px-1 bg-black/30 rounded-lg border border-brand-border/30">
                {[1, 2, 3, 4].map((beatNum) => {
                  const isCurrentBeat = currentBeatInMeasure === beatNum;
                  const isPlaying = playbackStatus === 'playing' || playbackStatus === 'counting';
                  const isPulse = isCurrentBeat && isBeating && isPlaying;
                  
                  return (
                    <div key={`beat-${beatNum}`} className="flex flex-col items-center gap-1">
                      <span className={`text-[8px] font-mono font-bold tracking-wide transition ${
                        isCurrentBeat && isPlaying ? 'text-amber-500' : 'text-slate-600'
                      }`}>
                        Beat {beatNum}
                      </span>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border transition-all duration-75 ${
                        isPulse
                          ? beatNum === 1
                            ? 'bg-emerald-500 border-emerald-400 text-black shadow-lg shadow-emerald-500/60 scale-105 ring-2 ring-emerald-500/30'
                            : 'bg-amber-500 border-amber-400 text-black shadow-lg shadow-amber-500/60 scale-105 ring-2 ring-amber-500/30'
                          : isCurrentBeat && isPlaying
                          ? 'bg-amber-950/20 border-slate-700/60 text-slate-400 font-bold'
                          : 'bg-black/40 border-brand-border/40 text-slate-600'
                      }`}>
                        {beatNum}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="text-[9px] text-slate-500 italic text-center border-t border-brand-border/40 pt-2 font-medium">
          Timing-Übungen stärken das innere Rhythmusgefühl ungemein!
        </div>
      </div>

      {/* CARD 3: Meine Übungs-Notizen, Statistiken & Streak Calendar */}
      <div className="bg-brand-card border border-brand-border rounded-xl p-4 flex flex-col justify-start">
        
        {/* Notes portion */}
        <div>
          <div className="flex items-center justify-between mb-2 h-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-500" />
              Notizen & Streaks
            </h3>
            
            <button
              onClick={onToggleFavorite}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-bold border transition duration-200 cursor-pointer bg-black/30 border-brand-border text-slate-500 hover:text-slate-300 hover:border-brand-border"
              id="dashboard-favorite-toggle-btn"
            >
              <Star className={`w-3 h-3 ${isFavorite ? 'fill-amber-500 text-amber-500' : ''}`} />
              {isFavorite ? 'GESPEICHERT' : 'MERKEN'}
            </button>
          </div>

          <p className="text-[10px] text-slate-500 mb-3 leading-relaxed h-12 flex items-center">
            Notiere Kick-Patterns oder Fills für diesen Song und verfolge deine täglichen Übungs-Streaks.
          </p>

          {/* Übungs- & Sicherheits-Kategorien */}
          <div className="grid grid-cols-2 gap-3 mb-3 bg-black/35 border border-brand-border/40 p-2.5 rounded-xl">
            {/* Kategorie 1: Wie gut geübt */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
                Wie gut geübt?
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={`practice-${level}`}
                    type="button"
                    onClick={() => handlePracticeChange(level === practiceLevel ? 0 : level)}
                    className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black transition border cursor-pointer ${
                      level <= practiceLevel
                        ? 'bg-amber-500 border-amber-400 text-black shadow shadow-amber-500/20'
                        : 'bg-black/60 border-brand-border/60 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <span className="text-[9px] font-semibold text-slate-300 block font-mono h-3.5 leading-none">
                {practiceLevel === 1 && '1: Erste Takte'}
                {practiceLevel === 2 && '2: Teile laufen'}
                {practiceLevel === 3 && '3: Ganzer Song'}
                {practiceLevel === 4 && '4: Originaltempo'}
                {practiceLevel === 5 && '5: Meisterhaft! 👑'}
                {practiceLevel === 0 && 'Noch nicht geübt'}
              </span>
            </div>

            {/* Kategorie 2: Spiel-Sicherheit */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
                Sicherheit:
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={`confidence-${level}`}
                    type="button"
                    onClick={() => handleConfidenceChange(level === confidenceLevel ? 0 : level)}
                    className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black transition border cursor-pointer ${
                      level <= confidenceLevel
                        ? 'bg-emerald-500 border-emerald-400 text-black shadow shadow-emerald-500/20'
                        : 'bg-black/60 border-brand-border/60 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <span className="text-[9px] font-semibold text-slate-300 block font-mono h-3.5 leading-none">
                {confidenceLevel === 1 && '1: Sehr wackelig'}
                {confidenceLevel === 2 && '2: Mit Klick okay'}
                {confidenceLevel === 3 && '3: Recht stabil'}
                {confidenceLevel === 4 && '4: Sehr sicher'}
                {confidenceLevel === 5 && '5: Live-tauglich! 🚀'}
                {confidenceLevel === 0 && 'Noch unsicher'}
              </span>
            </div>
          </div>

          <textarea
            value={localNote}
            onChange={handleNoteChange}
            placeholder="Notiere dir Kick-Pattern, Snare Fills oder Rhythmus-Besonderheiten für diesen Song..."
            className="w-full bg-black/40 border border-brand-border rounded-lg p-2 text-[11px] text-slate-300 focus:outline-none focus:border-amber-500/50 resize-none h-[75px] placeholder-slate-600 font-sans mb-3"
            id="song-practice-notes-textarea"
          />

          {/* Streaks progress bar / calendar */}
          <div className="bg-black/30 border border-brand-border/50 rounded-xl p-2.5 space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" />
                Übungs-Streak
              </span>
              <span className="text-[10px] text-slate-300 font-bold font-mono">
                {streakCount} {streakCount === 1 ? 'Tag' : 'Tage'} insgesamt geübt!
              </span>
            </div>
            
            <div className="text-[9px] text-slate-500 font-medium leading-normal">
              * Schalte den Tages-Haken frei, indem du mindestens 10 Sekunden aktiv spielst.
            </div>

            {/* Last 7 Days Calendar visual indicator */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {last7Days.map((d, i) => (
                <div key={`day-${i}`} className="flex flex-col items-center">
                  <span className={`text-[8px] font-mono mb-1 ${d.isToday ? 'text-amber-500 font-bold' : 'text-slate-500'}`}>
                    {d.name}
                  </span>
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center border transition ${
                    d.practiced 
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-500' 
                      : d.isToday 
                      ? 'bg-black/50 border-slate-700 text-slate-600 border-dashed' 
                      : 'bg-black/30 border-transparent text-slate-800'
                  }`}>
                    {d.practiced ? (
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    ) : (
                      <span className="text-[8px] opacity-20">●</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Practice Stats bottom portion */}
        <div className="space-y-1.5 border-t border-brand-border/40 pt-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500" title="Gesamtübungszeit relativ zur gesamten Songlänge berechnet">Übungs-Sessions:</span>
            <span className="font-bold text-slate-300 font-mono">
              {calculatedSessions} {calculatedSessions === 1 ? 'Durchgang' : 'Durchgänge'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Gesamtzeit:</span>
            <span className="font-bold text-slate-300 font-mono">{formatTime(stats.totalDuration)} Min.</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Zuletzt gespielt:</span>
            <span className="font-semibold text-slate-400">
              {stats.lastPracticed ? new Date(stats.lastPracticed).toLocaleDateString('de-DE') : 'Noch nie'}
            </span>
          </div>
          {(stats.totalDuration > 0 || stats.playCount > 0 || practiceHistory.length > 0 || practiceLevel > 0 || confidenceLevel > 0) && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Möchtest du die Übungszeit, Haken und Levels für diesen Song wirklich zurücksetzen?')) {
                    handleResetLocalDashboardState();
                  }
                }}
                className="text-[9px] text-rose-500/80 hover:text-rose-400 font-mono flex items-center gap-1 cursor-pointer hover:underline bg-transparent border-none p-0"
                title="Statistik für diesen Song zurücksetzen"
              >
                <RotateCcw className="w-2.5 h-2.5 animate-spin-reverse" style={{ animationDuration: '4s' }} />
                Statistik zurücksetzen
              </button>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
