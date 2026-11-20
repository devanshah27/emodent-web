import React from 'react';
import { Header } from './components/Header';
import { PhaseControlBar } from './components/PhaseControlBar';
import { VideoFeed } from './components/VideoFeed';
import { Dashboard } from './components/Dashboard';
import { DebugPanel } from './components/DebugPanel';
import { DevVideoMode } from './components/DevVideoMode';
import { VideoRecorder } from './components/VideoRecorder';
import { ConsentModal } from './components/ConsentModal';
import { PerPhaseSummaryModal } from './components/PerPhaseSummaryModal';
import { ClinicianRatingModal } from './components/ClinicianRatingModal';
import { useSessionStore } from './store/sessionStore';
import { EyeOff } from 'lucide-react';

export const App: React.FC = () => {
  const { isBlindedMode } = useSessionStore();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Required Consent & Assent Modal */}
      <ConsentModal />

      {/* Phase Summary & Export Modal */}
      <PerPhaseSummaryModal />

      {/* Clinician Rating Modal (FBRS, VCAS, VFAS) */}
      <ClinicianRatingModal />

      {/* Navigation Header */}
      <Header />

      {/* Blinded Mode Global Notification Banner */}
      {isBlindedMode && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-center text-xs font-semibold text-amber-300 flex items-center justify-center space-x-2">
          <EyeOff className="w-4 h-4 shrink-0" />
          <span>
            BLINDED CLINICIAN RATING MODE ACTIVE: AI emotion classifications, distress scores, and overlays are suppressed. Ratings entered will be exported with <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">blinded=true</code>.
          </span>
        </div>
      )}

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-4">
        {/* Procedural Phase Control Bar (Top Priority) */}
        <PhaseControlBar />

        {/* Core Video & Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Live Video Canvas & Feed */}
          <div className="lg:col-span-7 space-y-4">
            <VideoFeed />
            <DevVideoMode />
          </div>

          {/* Right Column: Analytics, Distress Gauge, Debug Telemetry */}
          <div className="lg:col-span-5 space-y-4">
            <Dashboard />
            <DebugPanel />
            <VideoRecorder stream={null} />
          </div>
        </div>
      </main>

      {/* Static Footer with Regulatory & Clinical Disclaimer */}
      <footer className="bg-slate-900/60 border-t border-slate-800/80 py-3 px-4 text-center text-[11px] text-slate-500">
        DentBot is an unvalidated research prototype designed as a passive monitoring adjunct.
        Not certified for diagnostic or clinical use. All inference executed on-device.
      </footer>
    </div>
  );
};

export default App;

