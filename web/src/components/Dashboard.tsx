import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { sessionLogger } from '../services/SessionLogger';
import { calculateDistressHeuristic } from '../services/DistressHeuristic';
import { EMOTION_CLASSES, EmotionClass, EMOTION_EMOJIS, ALL_PROCEDURES, ProceduralPhase, PhaseStats } from '../types';
import { AlertCircle, Gauge, Activity, ShieldAlert, EyeOff, Layers, ChevronRight } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { currentFrame, isBlindedMode, activePhase, selectedPhases, setPhase } = useSessionStore();

  const [recentDistribution, setRecentDistribution] = useState<Record<EmotionClass, number>>({
    angry: 0,
    fear: 0,
    happy: 0,
    neutral: 0,
    sad: 0,
  });
  const [noResultRate, setNoResultRate] = useState(0);
  const [uncertainRate, setUncertainRate] = useState(0);
  const [allPhaseStats, setAllPhaseStats] = useState<Record<ProceduralPhase, PhaseStats>>({} as any);

  // Periodic refresh of rolling window statistics and all treatment modalities (every 300 ms)
  useEffect(() => {
    const interval = setInterval(() => {
      // 1. Compute rolling 10s distribution
      const recent = sessionLogger.getRecentRecords(10000);
      const total = recent.length;

      if (total === 0) {
        setRecentDistribution({ angry: 0, fear: 0, happy: 0, neutral: 0, sad: 0 });
        setNoResultRate(0);
        setUncertainRate(0);
      } else {
        let noRes = 0;
        let uncert = 0;
        const counts: Record<EmotionClass, number> = { angry: 0, fear: 0, happy: 0, neutral: 0, sad: 0 };
        let classified = 0;

        for (const r of recent) {
          if (r.qualityFlag !== 'VALID' || r.smoothedEmotion === 'NO_RESULT') {
            noRes++;
          } else if (r.smoothedEmotion === 'UNCERTAIN') {
            uncert++;
          } else {
            const em = r.smoothedEmotion as EmotionClass;
            if (counts[em] !== undefined) {
              counts[em]++;
              classified++;
            }
          }
        }

        setNoResultRate(Math.round((noRes / total) * 100));
        setUncertainRate(Math.round((uncert / total) * 100));

        const dist: Record<EmotionClass, number> = { angry: 0, fear: 0, happy: 0, neutral: 0, sad: 0 };
        for (const c of EMOTION_CLASSES) {
          dist[c] = classified > 0 ? Math.round((counts[c] / classified) * 100) : 0;
        }
        setRecentDistribution(dist);
      }

      // 2. Compute live stats across ALL selected treatment modalities
      const stats = sessionLogger.computeAllPhases(selectedPhases);
      setAllPhaseStats(stats);
    }, 300);

    return () => clearInterval(interval);
  }, [selectedPhases]);

  const distress = calculateDistressHeuristic(currentFrame?.blendshapes);
  const isNegativeAffect = currentFrame?.isNegativeAffect ?? false;
  const currentEmotion = currentFrame?.smoothedEmotion || 'NO_RESULT';

  if (isBlindedMode) {
    return (
      <div className="bg-slate-800/90 border border-amber-500/30 rounded-2xl p-6 shadow-xl text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center">
          <EyeOff className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
          Blinded Clinician Mode Active
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
          AI distress telemetry, emotion labels, and rolling statistics are hidden to guarantee independent, unbiased clinician rating.
        </p>
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-700 text-[11px] text-amber-300">
          <span>Ratings exported will be marked:</span>
          <span className="font-mono font-bold">blinded = true</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 1. Negative Affect & Real-time State Card */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Affect State (Current Frame)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Conf: {Math.round((currentFrame?.confidence || 0) * 100)}%
          </span>
        </div>

        {/* Big Negative Affect Status Indicator */}
        <div
          className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
            isNegativeAffect
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-rose-900/20'
              : currentEmotion === 'NO_RESULT' || currentEmotion === 'UNCERTAIN'
              ? 'bg-slate-900/60 border-slate-700 text-slate-400'
              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-emerald-900/20'
          }`}
        >
          <div>
            <div className="text-[11px] font-semibold tracking-wider uppercase opacity-80">
              Binary Negative Affect
            </div>
            <div className="text-xl font-extrabold tracking-tight mt-0.5">
              {isNegativeAffect
                ? 'DISTRESS / NEGATIVE (1)'
                : currentEmotion === 'NO_RESULT'
                ? 'NO_RESULT (0)'
                : currentEmotion === 'UNCERTAIN'
                ? 'UNCERTAIN (0)'
                : 'POSITIVE / NEUTRAL (0)'}
            </div>
            <div className="text-xs mt-1 opacity-90">
              {isNegativeAffect
                ? 'Expression: angry | fear | sad'
                : 'Expression: happy | neutral'}
            </div>
          </div>

          <div className="text-4xl">
            {EMOTION_EMOJIS[currentEmotion] || '⚪'}
          </div>
        </div>

        {/* Rolling Quality Indicators */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-700/60">
          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-medium">10s NO_RESULT Rate</div>
            <div className="text-base font-bold text-amber-400">{noResultRate}%</div>
            <div className="text-[10px] text-slate-500">Occlusions / Movement</div>
          </div>
          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-medium">10s UNCERTAIN Rate</div>
            <div className="text-base font-bold text-sky-400">{uncertainRate}%</div>
            <div className="text-[10px] text-slate-500">Below conf threshold</div>
          </div>
        </div>

        {/* Exploratory Estimated Cooperation (Section 11.5) */}
        <div className="mt-2.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
              AI Estimated Cooperation
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                isNegativeAffect
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {isNegativeAffect ? 'Likely Negative' : 'Likely Positive'}
            </span>
          </div>
          <p className="text-[9px] text-amber-300/80 mt-1">
            ⚠️ Experimental heuristic — not a validated FBRS. For research observation only.
          </p>
        </div>
      </div>

      {/* 2. Experimental Blendshape Distress Gauge Card */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Gauge className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Blendshape Distress Gauge
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-amber-400">
              {distress.percentage}%
            </span>
          </div>

          {/* Prominent Mandatory Safety Disclaimer */}
          <div className="px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center space-x-2 text-amber-300 text-[10px] font-semibold mb-3">
            <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
            <span>EXPERIMENTAL / UNVALIDATED HEURISTIC — NOT A PAIN SCORE</span>
          </div>

          {/* Gauge Meter Bar */}
          <div className="w-full bg-slate-900 rounded-full h-3.5 p-0.5 border border-slate-700/80 mb-3">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                distress.percentage > 60
                  ? 'bg-rose-500 shadow-rose-500/50 shadow-md'
                  : distress.percentage > 30
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
              style={{ width: `${distress.percentage}%` }}
            />
          </div>

          {/* Action Unit Components Breakdown */}
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
              <div className="text-[9px] text-slate-400">BrowDown</div>
              <div className="text-xs font-mono font-bold text-slate-200">
                {Math.round(distress.components.browDown * 100)}%
              </div>
            </div>
            <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
              <div className="text-[9px] text-slate-400">EyeSquint</div>
              <div className="text-xs font-mono font-bold text-slate-200">
                {Math.round(distress.components.eyeSquint * 100)}%
              </div>
            </div>
            <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
              <div className="text-[9px] text-slate-400">MouthFrown</div>
              <div className="text-xs font-mono font-bold text-slate-200">
                {Math.round(distress.components.mouthFrown * 100)}%
              </div>
            </div>
            <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
              <div className="text-[9px] text-slate-400">JawOpen</div>
              <div className="text-xs font-mono font-bold text-slate-200">
                {Math.round(distress.components.jawOpen * 100)}%
              </div>
            </div>
          </div>
        </div>

        {/* Rolling 10s Emotion Distribution Bars */}
        <div className="mt-3 pt-3 border-t border-slate-700/60">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            10-Second Emotion Distribution
          </div>
          <div className="grid grid-cols-5 gap-1.5 text-center">
            {EMOTION_CLASSES.map((cls) => {
              const pct = recentDistribution[cls];
              const isNeg = ['angry', 'fear', 'sad'].includes(cls);
              return (
                <div key={cls} className="flex flex-col items-center">
                  <div className="w-full bg-slate-900 rounded h-12 flex flex-col justify-end p-0.5 border border-slate-800">
                    <div
                      className={`w-full rounded transition-all duration-300 ${
                        isNeg ? 'bg-rose-500' : cls === 'happy' ? 'bg-emerald-400' : 'bg-slate-400'
                      }`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 capitalize mt-1">{cls}</span>
                  <span className="text-[10px] font-mono font-bold text-slate-200">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Treatment Modality Behavior & Cooperation Scales (Visible across ALL selected modalities) */}
      <div className="col-span-1 md:col-span-2 bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-2.5">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Treatment Modalities Behavior Scale ({selectedPhases.length} Planned Stages)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Click any modality card to switch active treatment stage
          </span>
        </div>

        <div
          className={`grid gap-3 ${
            selectedPhases.length === 1
              ? 'grid-cols-1'
              : selectedPhases.length === 2
              ? 'grid-cols-1 sm:grid-cols-2'
              : selectedPhases.length === 3
              ? 'grid-cols-1 sm:grid-cols-3'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          }`}
        >
          {selectedPhases.map((phaseId) => {
            const stat = allPhaseStats[phaseId];
            const procDef = ALL_PROCEDURES.find((p) => p.id === phaseId);
            const isActive = activePhase === phaseId;
            const hasData = stat && stat.totalFrames > 0;
            const coopPct = hasData ? Math.max(0, Math.round(100 - stat.negativeAffectPercentage)) : 100;
            const isNegative = hasData && stat.finalNegativeAffectFlag;

            return (
              <div
                key={phaseId}
                onClick={() => setPhase(phaseId)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isActive
                    ? 'bg-slate-900/95 border-sky-500 ring-2 ring-sky-500/30 shadow-lg shadow-sky-950/40'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div>
                  {/* Header: Letter, Title, Active Badge */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-1.5 truncate">
                      {procDef && (
                        <span className="font-mono text-xs font-bold text-sky-400">
                          {procDef.letter}:
                        </span>
                      )}
                      <span className="font-bold text-xs text-slate-200 truncate">
                        {procDef ? procDef.title : phaseId.replace('_', ' ')}
                      </span>
                    </div>

                    {isActive ? (
                      <span className="flex items-center space-x-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>ACTIVE</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 hover:text-sky-400 flex items-center">
                        Select <ChevronRight className="w-3 h-3 ml-0.5" />
                      </span>
                    )}
                  </div>

                  {/* Behavior Scale Result Badge */}
                  <div className="mt-2 mb-2.5">
                    {!hasData ? (
                      <div className="px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 text-center font-medium">
                        ⏳ Awaiting Stage (0 frames logged)
                      </div>
                    ) : (
                      <div
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold text-center flex items-center justify-center space-x-1.5 ${
                          isNegative
                            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                            : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        }`}
                      >
                        <span>{isNegative ? '🔴' : '🟢'}</span>
                        <span>
                          {isNegative
                            ? 'Distressed / Negative (FBRS ≤ 2)'
                            : 'Cooperative / Positive (FBRS ≥ 3)'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Cooperation & Distress Dual Bar */}
                  {hasData && (
                    <div className="space-y-1 my-2">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Cooperation Rate:</span>
                        <strong className={isNegative ? 'text-rose-400' : 'text-emerald-400'}>
                          {coopPct}%
                        </strong>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-2 p-0.5 border border-slate-800 overflow-hidden flex">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                          style={{ width: `${coopPct}%` }}
                        />
                        <div
                          className="h-full rounded-full bg-rose-500 transition-all duration-300"
                          style={{ width: `${100 - coopPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Metrics: Dominant Emotion & Frames Logged */}
                <div className="pt-2 mt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">
                    Dominant: <strong className="text-slate-200 capitalize">
                      {hasData && stat.dominantEmotion !== 'NONE'
                        ? `${EMOTION_EMOJIS[stat.dominantEmotion]} ${stat.dominantEmotion}`
                        : 'None'}
                    </strong>
                  </span>
                  <span className="font-mono text-slate-400">
                    {hasData ? `${stat.totalFrames} frames` : 'Pending'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

