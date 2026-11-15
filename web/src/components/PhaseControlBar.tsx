import React, { useEffect, useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { ProceduralPhase, ALL_PROCEDURES, ProcedureDefinition } from '../types';
import {
  Activity,
  Syringe,
  Scissors,
  CheckCircle,
  Sparkles,
  Crown,
  RotateCw,
  Settings2,
  X,
} from 'lucide-react';

const PHASE_ICONS: Record<ProceduralPhase, React.ReactNode> = {
  PRE_TREATMENT: <Activity className="w-5 h-5" />,
  PULPECTOMY: <Sparkles className="w-5 h-5" />,
  CROWN_PREP: <Crown className="w-5 h-5" />,
  CARIES_EXCAVATION: <RotateCw className="w-5 h-5" />,
  EXTRACTION: <Scissors className="w-5 h-5" />,
  LOCAL_ANESTHESIA: <Syringe className="w-5 h-5" />,
  POST_TREATMENT: <CheckCircle className="w-5 h-5" />,
};

export const PhaseControlBar: React.FC = () => {
  const { activePhase, setPhase, selectedPhases, setSelectedPhases } = useSessionStore();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [tempSelected, setTempSelected] = useState<ProceduralPhase[]>(selectedPhases);

  // Sync temp state when modal opens
  useEffect(() => {
    if (isConfigOpen) {
      setTempSelected(selectedPhases);
    }
  }, [isConfigOpen, selectedPhases]);

  // Glove-accessible keyboard shortcut listener for Keys 1 to N
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing into an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= selectedPhases.length) {
        setPhase(selectedPhases[num - 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhases, setPhase]);

  const handleToggleTemp = (id: ProceduralPhase) => {
    if (tempSelected.includes(id)) {
      if (tempSelected.length <= 1) return; // Keep at least 1 phase
      setTempSelected(tempSelected.filter((p) => p !== id));
    } else {
      if (tempSelected.length >= 4) return; // Maximum 4 options!
      setTempSelected([...tempSelected, id]);
    }
  };

  const handleSaveConfig = () => {
    setSelectedPhases(tempSelected);
    setIsConfigOpen(false);
  };

  // Find procedure definitions for selected phases
  const activeProcedures = selectedPhases.map((phaseId, idx) => {
    const def = ALL_PROCEDURES.find((p) => p.id === phaseId) || {
      id: phaseId,
      letter: 'A' as const,
      title: phaseId.replace('_', ' '),
      description: 'Procedural phase',
      activeColor: 'bg-indigo-600 border-indigo-400 text-white shadow-indigo-500/25',
    };
    return {
      ...def,
      keyNumber: `${idx + 1}`,
      icon: PHASE_ICONS[phaseId] || <Activity className="w-5 h-5" />,
    };
  });

  return (
    <>
      <div className="w-full bg-slate-800/90 border border-slate-700/80 rounded-2xl p-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Procedural Phase Control (Press Keys 1–{selectedPhases.length})
            </span>
            <button
              onClick={() => setIsConfigOpen(true)}
              className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-sky-400 hover:text-sky-300 text-[11px] font-medium transition-all cursor-pointer"
              title="Select which procedures are planned for this visit (Max 4)"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Change Procedures</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-400">
              {selectedPhases.length}/4 Active
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-700/60 text-slate-300">
              Active: <strong className="text-white">{activePhase}</strong>
            </span>
          </div>
        </div>

        <div
          className={`grid gap-2.5 ${
            activeProcedures.length === 1
              ? 'grid-cols-1'
              : activeProcedures.length === 2
              ? 'grid-cols-1 sm:grid-cols-2'
              : activeProcedures.length === 3
              ? 'grid-cols-1 sm:grid-cols-3'
              : 'grid-cols-2 md:grid-cols-4'
          }`}
        >
          {activeProcedures.map((p) => {
            const isActive = activePhase === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setPhase(p.id)}
                className={`flex items-center space-x-3 p-3.5 rounded-xl border transition-all text-left min-h-[72px] focus:outline-none cursor-pointer ${
                  isActive
                    ? `${p.activeColor} border-2 shadow-lg scale-[1.01]`
                    : 'bg-slate-900/70 border-slate-700 hover:border-slate-600 text-slate-300 hover:bg-slate-900'
                }`}
              >
                <div
                  className={`p-2 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {p.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        isActive ? 'bg-white/25 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Key {p.keyNumber}
                    </span>
                    <span className="text-sm font-semibold truncate">{p.title}</span>
                  </div>
                  <p
                    className={`text-[11px] truncate mt-0.5 ${
                      isActive ? 'text-white/80' : 'text-slate-400'
                    }`}
                  >
                    {p.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Procedure Configuration Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center space-x-2">
                <Settings2 className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">Configure Planned Procedures</h3>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-400">
                Choose up to <strong>4 procedures</strong> for this patient's treatment session:
              </p>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  tempSelected.length === 4
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-800 text-sky-400 border border-slate-700'
                }`}
              >
                {tempSelected.length} / 4 Selected
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-5">
              {ALL_PROCEDURES.map((proc) => {
                const isChecked = tempSelected.includes(proc.id);
                return (
                  <button
                    key={proc.id}
                    type="button"
                    onClick={() => handleToggleTemp(proc.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isChecked
                        ? 'bg-sky-950/60 border-sky-500 text-white shadow-md ring-1 ring-sky-500/40'
                        : tempSelected.length >= 4
                        ? 'bg-slate-900/40 border-slate-800 text-slate-500 opacity-60 cursor-not-allowed'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-sky-400">
                          {proc.letter}
                        </span>
                        <div className="p-1 rounded bg-slate-800 text-slate-300">
                          {PHASE_ICONS[proc.id]}
                        </div>
                      </div>
                      {isChecked && <CheckCircle className="w-4 h-4 text-sky-400" />}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-100">{proc.title}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        {proc.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-[11px] text-slate-400">
                Glove shortcuts: Keys 1 to {tempSelected.length}
              </span>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white shadow-md shadow-sky-600/30 transition-all cursor-pointer"
                >
                  Save Procedures
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
