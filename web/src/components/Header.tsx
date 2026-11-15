import React, { useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { Activity, Trash2, BarChart2, ClipboardList } from 'lucide-react';

export const Header: React.FC = () => {
  const { participantId, activePhase, deleteSessionData, setIsSummaryOpen, setIsClinicianModalOpen } = useSessionStore();
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const handleDelete = () => {
    deleteSessionData();
    setShowConfirmDelete(false);
  };

  return (
    <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-0 z-30 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Prototype Badge */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-teal-400 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-extrabold tracking-tight text-white">EmoDent Web</h1>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                Research Prototype
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Pediatric Dental Distress Monitoring Adjunct</p>
          </div>
        </div>

        {/* Participant & Phase Pill */}
        <div className="flex items-center space-x-2">
          <div className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-slate-400">ID: </span>
            <span className="font-mono font-bold text-sky-400">{participantId}</span>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-slate-400">Phase: </span>
            <span className="font-bold text-slate-200">{activePhase}</span>
          </div>
        </div>

        {/* Actions: View Summary, Clinician Rating & Delete Session Data */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsClinicianModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-all cursor-pointer"
          >
            <ClipboardList className="w-4 h-4" />
            <span>Clinician Ratings</span>
          </button>

          <button
            onClick={() => setIsSummaryOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow transition-all cursor-pointer"
          >
            <BarChart2 className="w-4 h-4" />
            <span>Phase Summary & Export</span>
          </button>

          <button
            onClick={() => setShowConfirmDelete(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-800 text-xs font-semibold transition-all cursor-pointer"
            title="Wipe in-memory frame buffer and telemetry"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Delete Session Data</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Session Data Deletion */}
      {showConfirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100">Delete Session Data?</h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              This will permanently purge all logged frames, phase metrics, and telemetry from memory.
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-2 mt-5">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

