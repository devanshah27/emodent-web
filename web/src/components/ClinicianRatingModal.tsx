import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { Exporter } from '../services/Exporter';
import {
  ProceduralPhase,
  FranklScore,
  FRANKL_ANCHORS,
  VCAS_ANCHORS,
  VFAS_ANCHORS,
  ClinicianRating,
  ALL_PROCEDURES,
} from '../types';
import {
  X,
  ClipboardList,
  EyeOff,
  Eye,
  Download,
  CheckCircle,
  HelpCircle,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';

export const ClinicianRatingModal: React.FC = () => {
  const {
    isClinicianModalOpen,
    setIsClinicianModalOpen,
    participantId,
    raterId,
    setRaterId,
    isBlindedMode,
    setIsBlindedMode,
    clinicianRatings,
    setClinicianRating,
    getClinicianRatingsArray,
    selectedPhases,
  } = useSessionStore();

  const phases = selectedPhases;
  const [selectedPhase, setSelectedPhase] = useState<ProceduralPhase>(phases[0] || 'PRE_TREATMENT');
  const [activeTab, setActiveTab] = useState<'rating' | 'review'>('rating');

  useEffect(() => {
    if (!phases.includes(selectedPhase)) {
      setSelectedPhase(phases[0] || 'PRE_TREATMENT');
    }
  }, [phases, selectedPhase]);

  if (!isClinicianModalOpen) return null;

  const currentRating: ClinicianRating = clinicianRatings[selectedPhase] || {
    participant_id: participantId,
    phase: selectedPhase,
    rater_id: raterId,
    blinded: isBlindedMode,
    vcas: null,
    vfas: null,
    fbrs: null,
    timestamp: 0,
  };

  const handleScoreChange = (field: 'vcas' | 'vfas' | 'fbrs', value: number) => {
    setClinicianRating(selectedPhase, {
      [field]: value,
      participant_id: participantId,
      rater_id: raterId,
      blinded: isBlindedMode,
    });
  };

  const handleExportClinicianCSV = () => {
    const ratings = getClinicianRatingsArray();
    const csv = Exporter.generateClinicianCSV(ratings);
    const dateStr = new Date().toISOString().slice(0, 10);
    Exporter.triggerDownload(
      csv,
      `clinician_scores_${participantId}_${raterId}_${dateStr}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full p-6 shadow-2xl text-slate-100 my-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold tracking-tight">Clinician Rating Screen</h2>
                {isBlindedMode ? (
                  <span className="flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <EyeOff className="w-3 h-3" />
                    <span>BLINDED MODE ACTIVE</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    <Eye className="w-3 h-3 text-sky-400" />
                    <span>STANDARD (UNBLINDED)</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                FBRS (1–4), VCAS (0–4), and VFAS (0–4) Independent Clinical Scoring
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Blinding Toggle */}
            <button
              onClick={() => setIsBlindedMode(!isBlindedMode)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                isBlindedMode
                  ? 'bg-amber-600/30 border-amber-500 text-amber-200 hover:bg-amber-600/40'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isBlindedMode ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{isBlindedMode ? 'Exit Blinded Mode' : 'Enter Blinded Mode'}</span>
            </button>

            <button
              onClick={() => setIsClinicianModalOpen(false)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Blinding Banner Notice */}
        {isBlindedMode && (
          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <EyeOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>
                <strong>Blinded Rater Mode:</strong> All live AI emotion labels, gauges, and probability overlays
                are hidden from this view. Ratings recorded here will be tagged <code>blinded=true</code>.
              </span>
            </div>
          </div>
        )}

        {/* Metadata Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Participant ID
            </label>
            <div className="text-sm font-mono font-bold text-sky-400">{participantId}</div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Rater ID (Anonymous)
            </label>
            <input
              type="text"
              value={raterId}
              onChange={(e) => setRaterId(e.target.value)}
              placeholder="e.g. rater1, clinician_A"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Rating Timing
            </label>
            <div className="text-xs text-slate-300">
              Live Entry or Post-Hoc Video Review
            </div>
          </div>
        </div>

        {/* Procedural Phase Selector Tabs */}
        <div className="flex space-x-2 border-b border-slate-800 pb-2 mb-4 overflow-x-auto">
          {phases.map((p) => {
            const isSelected = selectedPhase === p;
            const r = clinicianRatings[p];
            const isCompleted = r && r.fbrs !== null && r.vcas !== null && r.vfas !== null;
            const procDef = ALL_PROCEDURES.find((def) => def.id === p);
            return (
              <button
                key={p}
                onClick={() => setSelectedPhase(p)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-750 hover:text-slate-200'
                }`}
              >
                {procDef && <span className="font-mono text-[10px] opacity-75">{procDef.letter}:</span>}
                <span>{procDef ? procDef.title : p.replace('_', ' ')}</span>
                {isCompleted && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
            );
          })}
        </div>

        {/* Scale Rating Forms */}
        <div className="space-y-5">
          {/* 1. Frankl Behavior Rating Scale (FBRS 1 to 4) */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <h3 className="text-sm font-bold text-slate-200">
                  Frankl Behavior Rating Scale (FBRS: 1 to 4)
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                {currentRating.fbrs !== null && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-purple-500/20 text-purple-200 border border-purple-500/40">
                    Selected: {currentRating.fbrs} {currentRating.fbrs <= 2 ? '(Negative Behavior)' : '(Positive Behavior)'}
                  </span>
                )}
                <span className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-purple-300 font-medium">
                  Criteria: <strong>Score ≤ 2</strong> = Negative Behavior
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Measures overt cooperative behavior. <strong>Notice:</strong> Lower scores represent worse behavior.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              {FRANKL_ANCHORS.map((anchor) => {
                const isSelected = currentRating.fbrs === anchor.score;
                return (
                  <button
                    key={anchor.score}
                    type="button"
                    onClick={() => handleScoreChange('fbrs', anchor.score)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? anchor.score <= 2
                          ? 'bg-rose-950/50 border-rose-500 text-rose-100 shadow-md shadow-rose-900/30 ring-1 ring-rose-500/50'
                          : 'bg-emerald-950/50 border-emerald-500 text-emerald-100 shadow-md shadow-emerald-900/30 ring-1 ring-emerald-500/50'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-xs">{anchor.label}</div>
                      <div className="text-[10px] text-slate-400 mt-1.5 leading-snug">
                        {anchor.description}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="text-[10px] font-bold text-right mt-2 flex items-center justify-end space-x-1 text-emerald-400">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Selected ({anchor.score})</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Venham Clinical Anxiety Scale (VCAS: 0 to 4) */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <h3 className="text-sm font-bold text-slate-200">
                  Venham Clinical Anxiety Scale (VCAS: 0 to 4)
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                {currentRating.vcas !== null && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-200 border border-amber-500/40">
                    Selected: Score {currentRating.vcas} {currentRating.vcas >= 1 ? '(Anxious / Distressed)' : '(Relaxed)'}
                  </span>
                )}
                <span className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-amber-300 font-medium">
                  Criteria: <strong>Score ≥ 1</strong> = Anxious / Distressed
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {VCAS_ANCHORS.map((anchor) => {
                const isSelected = currentRating.vcas === anchor.score;
                return (
                  <button
                    key={anchor.score}
                    type="button"
                    onClick={() => handleScoreChange('vcas', anchor.score)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-950/50 border-amber-500 text-amber-100 shadow-md shadow-amber-900/30 ring-1 ring-amber-500/50'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-xs">{anchor.label}</div>
                      <div className="text-[10px] text-slate-400 mt-1 leading-snug">
                        {anchor.description}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="text-[10px] font-bold text-right mt-2 flex items-center justify-end space-x-1 text-amber-400">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Selected ({anchor.score})</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Visual Facial Anxiety Scale (VFAS: 0 to 4) with Picture Guide */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                <h3 className="text-sm font-bold text-slate-200">
                  Visual Facial Anxiety Scale (VFAS: 0 to 4)
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                {currentRating.vfas !== null && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-sky-500/20 text-sky-200 border border-sky-500/40">
                    Selected: Face {currentRating.vfas} {currentRating.vfas >= 1 ? '(Facial Distress)' : '(Calm)'}
                  </span>
                )}
                <span className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-sky-300 font-medium">
                  Criteria: <strong>Score ≥ 1</strong> = Facial Distress
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {VFAS_ANCHORS.map((anchor) => {
                const isSelected = currentRating.vfas === anchor.score;
                // Facial iconography placeholder for each VFAS rank
                const faceIcons = ['😊', '😐', '😟', '😢', '😫'];
                return (
                  <button
                    key={anchor.score}
                    type="button"
                    onClick={() => handleScoreChange('vfas', anchor.score)}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-between ${
                      isSelected
                        ? 'bg-sky-950/50 border-sky-500 text-sky-100 shadow-md shadow-sky-900/30 ring-1 ring-sky-500/50'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="text-2xl mb-1">{faceIcons[anchor.score]}</div>
                      <div className="font-bold text-xs">{anchor.label}</div>
                      <div className="text-[9px] text-slate-400 mt-1 leading-tight">
                        {anchor.description}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="text-[10px] font-bold text-center mt-2 flex items-center justify-center space-x-1 text-sky-400">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Selected ({anchor.score})</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Export and Action Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-5 mt-5 border-t border-slate-800">
          <div className="text-xs text-slate-400">
            Exported separately as <code>clinician_scores.csv</code> to prevent contamination with AI data.
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleExportClinicianCSV}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Clinician Scores CSV</span>
            </button>
            <button
              onClick={() => setIsClinicianModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
            >
              Done & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

