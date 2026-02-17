import React, { useEffect, useState } from 'react';
import { RTCHelper } from '../conversational-ai-api/helper/rtc';
import { Square, Activity } from 'lucide-react';

interface VoiceVisualizerProps {
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error' | 'connecting';
  barCount?: number;
  barColor?: string;
  volume?: number; // 0 to 1
  getFrequencyBands?: () => Float32Array[];
  onInterrupt?: () => void;
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({
  state,
  barCount = 12,
  barColor = '#60a5fa',
  volume,
  getFrequencyBands,
  onInterrupt
}) => {
  const [volumes, setVolumes] = useState<number[]>(new Array(barCount).fill(0.1));
  const normalizedState = String(state).toLowerCase();
  const isSpeaking = normalizedState === 'speaking';
  const isListening = normalizedState === 'listening';
  const isIdle = normalizedState === 'idle';

  useEffect(() => {
    let animationFrameId: number;
    const rtcHelper = RTCHelper.getInstance();

    const updateVolume = () => {
      // 1. Try Multiband Frequencies first
      if (getFrequencyBands) {
        const bands = getFrequencyBands();
        if (bands && bands.length > 0) {
          // Map bands to barCount
          // Simple downsampling/upsampling
          const newVolumes = new Array(barCount).fill(0).map((_, i) => {
            const bandIndex = Math.floor((i / barCount) * bands.length);
            const band = bands[bandIndex];
            if (!band) return 0.1;
            
            // Calculate average amplitude in this band
            let sum = 0;
            for (let j = 0; j < band.length; j++) {
              sum += Math.abs(band[j]);
            }
            const avg = band.length > 0 ? sum / band.length : 0;
            return Math.min(1, avg * 2); // Boost a bit
          });
          
          setVolumes(newVolumes);
          animationFrameId = requestAnimationFrame(updateVolume);
          return;
        }
      }

      // 2. Fallback volume visualization
      let currentVol = 0;

      if (volume !== undefined) {
        currentVol = volume;
      } else {
        // Fallback to RTCHelper for backward compatibility
        if (isListening && rtcHelper.localTracks.audioTrack) {
          currentVol = rtcHelper.localTracks.audioTrack.getVolumeLevel();
        }
      }

      if (isListening || isSpeaking || volume !== undefined) {
        // Amplify volume
        const v = Math.min(1, currentVol * 3);

        setVolumes(prev => prev.map((_, i) => {
          // Create a wave effect based on index and time
          const time = Date.now() / 100;
          const wave = Math.sin(i * 0.5 + time) * 0.2; // Moving wave
          
          // Random noise
          const noise = Math.random() * 0.1;
          
          // Center bias (higher in middle)
          const centerBias = 1 - Math.abs((i - barCount / 2) / (barCount / 2)) * 0.5;
          
          const targetHeight = (v * centerBias) + wave + noise;
          
          return Math.max(0.1, Math.min(1, targetHeight));
        }));
      } else {
        // Idle/Thinking - subtle breathing
        const time = Date.now() / 1000;
        setVolumes(prev => prev.map((_, i) => {
          return 0.1 + Math.sin(time + i * 0.5) * 0.05;
        }));
      }

      animationFrameId = requestAnimationFrame(updateVolume);
    };

    updateVolume();
    return () => cancelAnimationFrame(animationFrameId);
  }, [state, barCount, volume, getFrequencyBands, isListening, isSpeaking, isIdle]);

  // Render Bars and Conditional Interrupt Button
  return (
    <div className="relative flex items-center justify-center h-full w-full">
      {/* Bars Layer */}
      <div className="flex items-center justify-center h-full w-full gap-[3px]">
        {volumes.map((v, i) => (
          <div
            key={i}
            className="w-1 rounded-full transition-all duration-75 ease-out"
            style={{
              height: `${Math.max(4, v * 32)}px`,
              backgroundColor: isListening ? '#60a5fa' : barColor,
              opacity: isIdle ? 0.3 : 0.8 + (v * 0.2),
              boxShadow: isListening && v > 0.3 ? `0 0 ${v * 10}px ${barColor}` : 'none'
            }}
          />
        ))}
      </div>

      {/* Interrupt Button Overlay (When AI is speaking) */}
      {isSpeaking && onInterrupt && (
        <div className="absolute inset-0 z-10 flex items-center justify-center animate-in fade-in zoom-in duration-200">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInterrupt();
            }}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/50 text-white hover:bg-slate-800 hover:border-red-500/50 hover:text-red-400 transition-all cursor-pointer backdrop-blur-sm shadow-lg"
          >
            <Square className="w-2.5 h-2.5 fill-current" />
            <span className="text-xs font-bold tracking-wider">打断</span>
          </button>
        </div>
      )}
    </div>
  );
};
