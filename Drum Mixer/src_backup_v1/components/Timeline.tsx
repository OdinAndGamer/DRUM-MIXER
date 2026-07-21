import React, { useRef, useEffect, useState } from 'react';

interface TimelineProps {
  currentPosition: number;
  duration: number;
  loopEnabled: boolean;
  loopA: number | null;
  loopB: number | null;
  onSeek: (time: number) => void;
  onSetLoopA: (time: number) => void;
  onSetLoopB: (time: number) => void;
  onClearLoop: () => void;
  onToggleLoop: () => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  currentPosition,
  duration,
  loopEnabled,
  loopA,
  loopB,
  onSeek,
  onSetLoopA,
  onSetLoopB,
  onClearLoop,
  onToggleLoop,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 90 });
  const [activeDrag, setActiveDrag] = useState<'playhead' | 'A' | 'B' | null>(null);

  // Resize handler to make timeline fluid
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({ width: Math.max(300, width), height: 90 });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Canvas drawing logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const padding = 20;
    const trackWidth = width - padding * 2;
    const centerY = height / 2;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background tracks grid
    ctx.strokeStyle = '#2C313C'; // dark border
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const x = padding + (i / 8) * trackWidth;
      ctx.beginPath();
      ctx.moveTo(x, centerY - 15);
      ctx.lineTo(x, centerY + 15);
      ctx.stroke();

      if (duration > 0) {
        const timeVal = (i / 8) * duration;
        const minutes = Math.floor(timeVal / 60);
        const seconds = Math.floor(timeVal % 60);
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
          x,
          height - 10
        );
      }
    }

    // Draw baseline
    ctx.strokeStyle = '#4B5563';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(padding, centerY);
    ctx.lineTo(width - padding, centerY);
    ctx.stroke();

    // Draw Loop Range A-B
    if (duration > 0 && loopA !== null) {
      const xA = padding + (loopA / duration) * trackWidth;

      if (loopB !== null) {
        const xB = padding + (loopB / duration) * trackWidth;

        // Draw loop background highlight
        ctx.fillStyle = loopEnabled ? 'rgba(245, 158, 11, 0.25)' : 'rgba(156, 163, 175, 0.15)';
        ctx.fillRect(xA, centerY - 20, xB - xA, 40);

        // Draw Loop borders
        ctx.strokeStyle = loopEnabled ? '#F59E0B' : '#4B5563';
        ctx.lineWidth = 2;
        ctx.strokeRect(xA, centerY - 20, xB - xA, 40);

        // Draw 'A' and 'B' indicators
        ctx.fillStyle = loopEnabled ? '#F59E0B' : '#9CA3AF';
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.fillText('A', xA, centerY - 25);
        ctx.fillText('B', xB, centerY - 25);
      } else {
        // Draw single A marker
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xA, centerY - 25);
        ctx.lineTo(xA, centerY + 25);
        ctx.stroke();

        ctx.fillStyle = '#F59E0B';
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.fillText('A', xA, centerY - 30);
      }
    }

    // Draw Current Position Playhead (Red Line with handle)
    if (duration > 0) {
      const currentX = padding + (currentPosition / duration) * trackWidth;

      ctx.strokeStyle = '#e53e3e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(currentX, centerY - 30);
      ctx.lineTo(currentX, centerY + 30);
      ctx.stroke();

      // Playhead circle top
      ctx.fillStyle = '#e53e3e';
      ctx.beginPath();
      ctx.arc(currentX, centerY - 30, 5, 0, Math.PI * 2);
      ctx.fill();

      // Playhead triangle bottom
      ctx.beginPath();
      ctx.moveTo(currentX - 5, centerY + 30);
      ctx.lineTo(currentX + 5, centerY + 30);
      ctx.lineTo(currentX, centerY + 35);
      ctx.closePath();
      ctx.fill();
    }
  }, [dimensions, currentPosition, duration, loopEnabled, loopA, loopB]);

  // Convert click/drag x position to song time
  const handleInteraction = (clientX: number, dragType: 'playhead' | 'A' | 'B') => {
    if (!canvasRef.current || duration <= 0) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const padding = 20;
    const trackWidth = dimensions.width - padding * 2;

    let relativeX = x - padding;
    if (relativeX < 0) relativeX = 0;
    if (relativeX > trackWidth) relativeX = trackWidth;

    const targetTime = (relativeX / trackWidth) * duration;

    if (dragType === 'playhead') {
      onSeek(targetTime);
    } else if (dragType === 'A') {
      if (loopB !== null && targetTime >= loopB) {
        onSetLoopA(Math.max(0, loopB - 0.5));
      } else {
        onSetLoopA(targetTime);
      }
    } else if (dragType === 'B') {
      if (loopA !== null && targetTime <= loopA) {
        onSetLoopB(Math.min(duration, loopA + 0.5));
      } else {
        onSetLoopB(targetTime);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (duration <= 0 || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = 20;
    const trackWidth = dimensions.width - padding * 2;

    const getXOfTime = (time: number | null) => {
      if (time === null) return -999;
      return padding + (time / duration) * trackWidth;
    };

    const xA = getXOfTime(loopA);
    const xB = getXOfTime(loopB);
    const xPlayhead = getXOfTime(currentPosition);

    const playheadTolerance = 25; // Generous grab area for the red playhead
    const markerTolerance = 12;   // Sleeker grab area for loop markers to prevent accidental movement

    if (Math.abs(x - xPlayhead) <= playheadTolerance) {
      setActiveDrag('playhead');
      handleInteraction(e.clientX, 'playhead');
    } else if (loopA !== null && Math.abs(x - xA) <= markerTolerance) {
      setActiveDrag('A');
      handleInteraction(e.clientX, 'A');
    } else if (loopB !== null && Math.abs(x - xB) <= markerTolerance) {
      setActiveDrag('B');
      handleInteraction(e.clientX, 'B');
    } else {
      setActiveDrag('playhead');
      handleInteraction(e.clientX, 'playhead');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeDrag) {
      handleInteraction(e.clientX, activeDrag);
    }
  };

  const handleMouseUp = () => {
    setActiveDrag(null);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setActiveDrag(null);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={containerRef} className="w-full bg-brand-card border border-brand-border rounded-xl p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3 text-sm font-mono text-slate-400">
        <div>
          Position: <span className="text-amber-500 font-semibold">{formatSeconds(currentPosition)}</span> / {formatSeconds(duration)}
        </div>
        <div className="flex items-center gap-4 text-xs">
          {loopA !== null && (
            <div>
              Loop A: <span className="text-amber-500">{formatSeconds(loopA)}</span>
            </div>
          )}
          {loopB !== null && (
            <div>
              Loop B: <span className="text-amber-500">{formatSeconds(loopB)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg bg-black/40 border border-brand-border/50 shadow-inner">
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className="w-full cursor-pointer touch-none block"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between mt-4 gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSetLoopA(currentPosition)}
            className="px-3 py-1.5 bg-brand-bg hover:bg-brand-border/40 text-slate-200 hover:text-white rounded-lg text-xs font-medium border border-brand-border transition"
            id="set-loop-a-btn"
          >
            [ A setzen
          </button>
          <button
            onClick={() => onSetLoopB(currentPosition)}
            disabled={loopA === null || currentPosition <= (loopA || 0)}
            className="px-3 py-1.5 bg-brand-bg hover:bg-brand-border/40 text-slate-200 hover:text-white disabled:opacity-40 disabled:hover:bg-brand-bg disabled:text-slate-600 rounded-lg text-xs font-medium border border-brand-border transition"
            id="set-loop-b-btn"
          >
            B setzen ]
          </button>
          <button
            onClick={onClearLoop}
            disabled={loopA === null && loopB === null}
            className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-400 disabled:opacity-40 rounded-lg text-xs font-medium border border-red-900/30 transition"
            id="clear-loop-btn"
          >
            Loop löschen
          </button>
        </div>

        <button
          onClick={onToggleLoop}
          disabled={loopA === null || loopB === null}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition ${
            loopEnabled && loopA !== null && loopB !== null
              ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20'
              : 'bg-brand-bg text-slate-400 border-brand-border hover:bg-brand-border/40 disabled:opacity-40'
          }`}
          id="toggle-loop-btn"
        >
          {loopEnabled && loopA !== null && loopB !== null ? 'Loop: AN' : 'Loop: AUS'}
        </button>
      </div>
    </div>
  );
};
