import React, { useMemo } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { sessionLogger } from '../services/SessionLogger';
import { Exporter } from '../services/Exporter';
import { ProceduralPhase, EMOTION_CLASSES, EMOTION_EMOJIS, ALL_PROCEDURES } from '../types';
import { X, Download, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';

export const PerPhaseSummaryModal: React.FC = () => {
  const { isSummaryOpen, setIsSummaryOpen, getMetadata, participantId, selectedPhases } = useSessionStore();

  const phaseStats = useMemo(() => {
    if (!isSummaryOpen) return null;
    return sessionLogger.computeAllPhases(selectedPhases);
  }, [isSummaryOpen, selectedPhases]);

  if (!isSummaryOpen || !phaseStats) return null;

  const phases = selectedPhases;

  const handleExportCSV = () => {
    const records = sessionLogger.getRecords();
    const csv = Exporter.generateFrameCSV(records, participantId);
    const dateStr = new Date().toISOString().slice(0, 10);
    Exporter.triggerDownload(
      csv,
      `dentbot_${participantId}_frames_${dateStr}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  const handleExportJSON = () => {
    const meta = getMetadata();
    const json = Exporter.generateSessionJSON(meta, phaseStats, sessionLogger.getRecordCount());
    const dateStr = new Date().toISOString().slice(0, 10);
    Exporter.triggerDownload(
      json,
      `dentbot_${participantId}_summary_${dateStr}.json`,
      'application/json;charset=utf-8;'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-4xl w-full p-6 shadow-2xl text-slate-100 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Clinical Procedural Phase Summaries</h2>
            <p className="text-xs text-slate-400">
              Participant: <strong className="text-sky-400 font-mono">{participantId}</strong> | Total Frames Logged: {sessionLogger.getRecordCount()}
            </p>
          </div>
          <button
            onClick={() => setIsSummaryOpen(false)}
            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Phase Summary Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-5">
          {phases.map((phase) => {
            const stat = phaseStats[phase];
            if (!stat) return null;
            const procDef = ALL_PROCEDURES.find((p) => p.id === phase);
            return (
              <div
                key={phase}
                className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-1.5">
                      {procDef && (
                        <span className="font-mono text-xs font-bold text-sky-400">
                          {procDef.letter}:
                        </span>
                      )}
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        {procDef ? procDef.title : phase.replace('_', ' ')}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        stat.totalFrames === 0
                          ? 'bg-slate-800 text-slate-400 border border-slate-700'
                          : stat.finalNegativeAffectFlag
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {stat.totalFrames === 0
                        ? 'AWAITING PROCEDURE'
                        : stat.finalNegativeAffectFlag
                        ? 'NEGATIVE AFFECT (1)'
                        : 'COOPERATIVE / CALM (0)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center my-3 py-2 bg-slate-950/60 rounded-lg border border-slate-800">
                    <div>
                      <div className="text-[10px] text-slate-400">Total Frames</div>
                      <div className="text-sm font-mono font-bold text-slate-200">{stat.totalFrames}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">NO_RESULT</div>
                      <div className="text-sm font-mono font-bold text-amber-400">{stat.noResultFrames}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Dominant</div>
                      <div className="text-sm font-bold text-sky-400 capitalize">
                        {stat.dominantEmotion !== 'NONE' ? `${EMOTION_EMOJIS[stat.dominantEmotion]} ${stat.dominantEmotion}` : 'None'}
                      </div>
                    </div>
                  </div>

                  {/* Emotion Breakdown */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Negative Affect %:</span>
                      <strong
                        className={stat.negativeAffectPercentage >= 50 ? 'text-rose-400' : 'text-slate-200'}
                      >
                        {stat.negativeAffectPercentage}%
                      </strong>
                    </div>
                    <div className="grid grid-cols-5 gap-1 pt-1 text-[10px] text-center">
                      {EMOTION_CLASSES.map((cls) => (
                        <div key={cls} className="bg-slate-800/80 p-1 rounded">
                          <div className="text-slate-400 capitalize">{cls}</div>
                          <div className="font-mono font-bold text-slate-200">
                            {Math.round(stat.emotionPercentages[cls])}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons: Export Frame CSV & Phase JSON */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-700">
          <div className="text-xs text-slate-400">
            Exports contain anonymous ID only. No images, video, or biometric identifiers are stored.
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleExportCSV}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold transition-all shadow"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Export Frame CSV</span>
            </button>
            <button
              onClick={handleExportJSON}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-all shadow shadow-sky-600/30"
            >
              <Download className="w-4 h-4" />
              <span>Export Summary JSON</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

