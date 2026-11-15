import React from 'react';
import { useSessionStore } from '../store/sessionStore';
import { Sliders, Cpu, Activity, AlertOctagon } from 'lucide-react';

export const DebugPanel: React.FC = () => {
  const {
    fps,
    workerLatency,
    droppedFrames,
    confidenceThreshold,
    setConfidenceThreshold,
    smoothingWindow,
    setSmoothingWindow,
    showFaceMesh,
    toggleFaceMesh,
  } = useSessionStore();

  return (
    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg text-slate-200">
      <div className="flex items-center space-x-2 mb-3">
        <Cpu className="w-4 h-4 text-sky-400" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Telemetry & Pipeline Controls
        </h3>
      </div>

      {/* Real-Time Measured Performance Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-slate-900/70 p-2.5 rounded-xl border border-slate-700/60 text-center">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Target 30 FPS</span>
          <span
            className={`text-lg font-mono font-bold ${
              fps >= 20 ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {fps} <span className="text-xs font-normal text-slate-400">fps</span>
          </span>
        </div>

        <div className="bg-slate-900/70 p-2.5 rounded-xl border border-slate-700/60 text-center">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Worker Latency</span>
          <span className="text-lg font-mono font-bold text-sky-400">
            {workerLatency} <span className="text-xs font-normal text-slate-400">ms</span>
          </span>
        </div>

        <div className="bg-slate-900/70 p-2.5 rounded-xl border border-slate-700/60 text-center">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Dropped Frames</span>
          <span
            className={`text-lg font-mono font-bold ${
              droppedFrames > 0 ? 'text-amber-400' : 'text-slate-400'
            }`}
          >
            {droppedFrames}
          </span>
        </div>
      </div>

      {/* Interactive Controls */}
      <div className="space-y-3 pt-2 border-t border-slate-700/60">
        {/* Confidence Threshold Slider */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">Confidence Threshold (Filter UNCERTAIN):</span>
            <span className="font-mono font-bold text-sky-400">{Math.round(confidenceThreshold * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.50"
            max="0.99"
            step="0.01"
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
        </div>

        {/* Temporal Smoothing Window Slider */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">Temporal Smoothing Window (N frames):</span>
            <span className="font-mono font-bold text-sky-400">{smoothingWindow} frames (~{Math.round((smoothingWindow / 30) * 1000)} ms)</span>
          </div>
          <input
            type="range"
            min="1"
            max="45"
            step="1"
            value={smoothingWindow}
            onChange={(e) => setSmoothingWindow(parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
        </div>

        {/* Face Mesh Overlay Checkbox */}
        <div className="pt-1 flex items-center justify-between">
          <label className="flex items-center space-x-2.5 cursor-pointer text-xs text-slate-300">
            <input
              type="checkbox"
              checked={showFaceMesh}
              onChange={toggleFaceMesh}
              className="w-4 h-4 rounded border-slate-700 text-sky-500 bg-slate-900 focus:ring-sky-500"
            />
            <span>Render 478 MediaPipe FaceMesh Overlay</span>
          </label>
        </div>
      </div>
    </div>
  );
};
