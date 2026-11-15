import React, { useRef } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { Film, Upload, Check } from 'lucide-react';

export const DevVideoMode: React.FC = () => {
  const { devVideoMode, setDevVideoMode, devVideoUrl, setDevVideoUrl } = useSessionStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (devVideoUrl) {
        URL.revokeObjectURL(devVideoUrl);
      }
      const url = URL.createObjectURL(file);
      setDevVideoUrl(url);
      setDevVideoMode(true);
    }
  };

  const handleToggle = (enabled: boolean) => {
    setDevVideoMode(enabled);
    if (!enabled && devVideoUrl) {
      URL.revokeObjectURL(devVideoUrl);
      setDevVideoUrl(null);
    }
  };

  return (
    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg text-slate-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <Film className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Developer Video Feed Mode
          </h3>
        </div>
        <label className="flex items-center space-x-2 cursor-pointer text-xs">
          <input
            type="checkbox"
            checked={devVideoMode}
            onChange={(e) => handleToggle(e.target.checked)}
            className="w-4 h-4 rounded border-slate-700 text-purple-500 bg-slate-900 focus:ring-purple-500"
          />
          <span className="text-slate-300 font-medium">Enable Dev Mode</span>
        </label>
      </div>

      <p className="text-[11px] text-slate-400 mb-3">
        Load an MP4 / WebM video clip to test facial tracking and inference offline without a webcam or child present.
      </p>

      {devVideoMode && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/ogg"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex items-center space-x-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Select Video File</span>
            </button>
            <button
              onClick={() => {
                setDevVideoUrl('/sample_test_video.mp4');
                setDevVideoMode(true);
              }}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-purple-300 text-xs font-medium transition-all cursor-pointer border border-purple-500/30"
            >
              <Film className="w-3.5 h-3.5 text-purple-400" />
              <span>Load Built-in Demo Video</span>
            </button>
          </div>
          {devVideoUrl && (
            <span className="text-xs text-emerald-400 flex items-center space-x-1 mt-1">
              <Check className="w-3.5 h-3.5" />
              <span>Video clip loaded and looping in pipeline</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

