import React, { useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { ShieldCheck, AlertTriangle, CheckCircle } from 'lucide-react';
import { ALL_PROCEDURES, DEFAULT_SELECTED_PHASES, ProceduralPhase } from '../types';

export const ConsentModal: React.FC = () => {
  const { consentGiven, participantId: defaultId, setConsent } = useSessionStore();

  const [id, setId] = useState(defaultId);
  const [parentConsent, setParentConsent] = useState(false);
  const [childAssent, setChildAssent] = useState(false);
  const [onDeviceConfirmed, setOnDeviceConfirmed] = useState(false);
  const [plannedPhases, setPlannedPhases] = useState<ProceduralPhase[]>(DEFAULT_SELECTED_PHASES);

  if (consentGiven) return null;

  const togglePhase = (phaseId: ProceduralPhase) => {
    if (plannedPhases.includes(phaseId)) {
      if (plannedPhases.length <= 1) return; // Keep at least 1 phase
      setPlannedPhases(plannedPhases.filter((p) => p !== phaseId));
    } else {
      if (plannedPhases.length >= 4) return; // Maximum 4 options!
      setPlannedPhases([...plannedPhases, phaseId]);
    }
  };

  const canProceed =
    parentConsent &&
    childAssent &&
    onDeviceConfirmed &&
    id.trim().length > 0 &&
    plannedPhases.length >= 1 &&
    plannedPhases.length <= 4;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canProceed) return;
    setConsent(id.trim(), parentConsent, childAssent, onDeviceConfirmed, plannedPhases);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md p-3 sm:p-4 flex flex-col justify-start sm:justify-center items-center">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-xl w-full p-4 sm:p-5 shadow-2xl text-slate-100 flex flex-col max-h-[92vh] my-auto overflow-hidden">
        {/* Header (fixed at top of modal) */}
        <div className="flex items-center space-x-3 pb-3 border-b border-slate-700/80 shrink-0">
          <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight">Clinical Research Consent & Protocol</h2>
            <p className="text-xs text-slate-400">DentBot — Pediatric Dental Distress Monitoring Prototype</p>
          </div>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 mt-3">
          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto pr-1 sm:pr-2 space-y-3 min-h-0">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start space-x-2 text-amber-300 text-xs leading-relaxed">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>PASSIVE MONITORING RESEARCH ADJUNCT ONLY:</strong> This software is an experimental prototype.
                It is <strong>NOT</strong> a medical or diagnostic device. Do not use this tool for clinical decisions,
                anesthesia adjustments, or pain assessment.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Anonymous Participant ID
              </label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="e.g. P-4921"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                required
              />
              <p className="text-[11px] text-slate-400 mt-0.5">
                Do not use child's real name or identifiable health data.
              </p>
            </div>

            {/* Planned Procedural Phases Selector (Choose up to 4) */}
            <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-700">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Planned Procedures (Choose Up to 4)
                </label>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    plannedPhases.length === 4
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-800 text-sky-400 border border-slate-700'
                  }`}
                >
                  {plannedPhases.length} / 4 Selected
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">
                Select treatment stages for this visit. Keyboard shortcuts <strong>Keys 1–{plannedPhases.length}</strong> will be mapped to these.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_PROCEDURES.map((proc) => {
                  const isSelected = plannedPhases.includes(proc.id);
                  return (
                    <button
                      key={proc.id}
                      type="button"
                      onClick={() => togglePhase(proc.id)}
                      className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-sky-950/60 border-sky-500 text-white shadow-md ring-1 ring-sky-500/40'
                          : plannedPhases.length >= 4
                          ? 'bg-slate-900/40 border-slate-800 text-slate-500 opacity-60 cursor-not-allowed'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-mono text-xs font-bold text-sky-400">{proc.letter}</span>
                        {isSelected && <CheckCircle className="w-3.5 h-3.5 text-sky-400" />}
                      </div>
                      <div className="font-semibold text-xs text-slate-100">{proc.title}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{proc.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={parentConsent}
                  onChange={(e) => setParentConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-600 text-sky-600 focus:ring-sky-500 bg-slate-900"
                />
                <span className="text-xs text-slate-300 leading-normal">
                  <strong>Parent / Legal Guardian Consent:</strong> I confirm informed consent was obtained from
                  the parent or legal guardian for facial expression monitoring during this dental visit.
                </span>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={childAssent}
                  onChange={(e) => setChildAssent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-600 text-sky-600 focus:ring-sky-500 bg-slate-900"
                />
                <span className="text-xs text-slate-300 leading-normal">
                  <strong>Child Assent:</strong> The procedure and camera presence was explained in age-appropriate
                  language, and the child assented to participation.
                </span>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onDeviceConfirmed}
                  onChange={(e) => setOnDeviceConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-600 text-sky-600 focus:ring-sky-500 bg-slate-900"
                />
                <span className="text-xs text-slate-300 leading-normal">
                  <strong>100% On-Device Processing Notice:</strong> All computer vision and emotion inference runs
                  locally in this browser via WebAssembly. No video frames, face landmarks, or images leave this device.
                </span>
              </label>
            </div>
          </div>

          {/* Action Footer (always pinned at bottom of modal) */}
          <div className="pt-3 mt-2 border-t border-slate-700/80 flex flex-wrap items-center justify-between gap-2 shrink-0 bg-slate-800 z-10">
            <div className="text-[11px] text-slate-400">
              {!canProceed && (
                <span className="text-amber-400">Please complete all 3 consent checkmarks to proceed.</span>
              )}
            </div>
            <button
              type="submit"
              disabled={!canProceed}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-all shadow-lg ${
                canProceed
                  ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/20 cursor-pointer'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              Confirm Consent & Start Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

