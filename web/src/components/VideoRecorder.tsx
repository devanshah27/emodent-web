import React, { useState, useRef } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { Video, Square, Download, ShieldCheck } from 'lucide-react';

export const VideoRecorder: React.FC<{ stream?: MediaStream | null }> = ({ stream: propStream }) => {
  const { isRecording, setIsRecording, participantId, activeStream } = useSessionStore();
  const stream = activeStream || propStream;
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const startRecording = () => {
    if (!stream) {
      alert('Camera stream is not active. Please start camera first.');
      return;
    }

    recordedChunksRef.current = [];
    setRecordedBlobUrl(null);

    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(recordedChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(fullBlob);
        setRecordedBlobUrl(url);
      };

      recorder.start(1000); // 1-second timeslices
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err: any) {
      alert(`Could not start video recording: ${err.message}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg text-slate-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Video className="w-4 h-4 text-rose-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Local Procedure Video Recorder (Optional)
          </h3>
        </div>
        {isRecording && (
          <span className="flex items-center space-x-1.5 text-xs text-rose-400 font-bold animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>RECORDING</span>
          </span>
        )}
      </div>

      <div className="text-[11px] text-slate-400 mb-3 bg-slate-900/60 p-2 rounded-lg border border-slate-800 flex items-start space-x-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Privacy Notice:</strong> Video recording is kept in volatile browser RAM and saved{' '}
          <strong>only via explicit user download</strong>. Nothing is uploaded or stored automatically.
        </span>
      </div>

      <div className="flex items-center space-x-3">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow transition-all cursor-pointer"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Start Local Recording</span>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold shadow transition-all cursor-pointer"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop Recording</span>
          </button>
        )}

        {recordedBlobUrl && (
          <a
            href={recordedBlobUrl}
            download={`emodent_recording_${participantId}_${Date.now()}.webm`}
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Video File</span>
          </a>
        )}
      </div>
    </div>
  );
};

