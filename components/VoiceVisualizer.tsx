import React, { useEffect, useState } from 'react';
import { RTCHelper } from '../conversational-ai-api/helper/rtc';
import { Square } from 'lucide-react';

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
  barCount = 4,
  barColor = '#3b82f6',
  volume,
  getFrequencyBands,
  onInterrupt
}) => {
  const [volumes, setVolumes] = useState<number[]>(new Array(barCount).fill(0.1));

  useEffect(() => {
    let animationFrameId: number;
    const rtcHelper = RTCHelper.getInstance();

    const updateVolume = () => {
      // 1. Try Multiband Frequencies first
      if (getFrequencyBands) {
        const bands = getFrequencyBands();
        if (bands && bands.length > 0) {
          const newVolumes = bands.map(band => {
            let sum = 0;
            for (let i = 0; i < band.length; i++) {
              sum += band[i];
            }
            return band.length > 0 ? sum / band.length : 0;
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
        if (state === 'listening' && rtcHelper.localTracks.audioTrack) {
          currentVol = rtcHelper.localTracks.audioTrack.getVolumeLevel();
        }
      }

      // Check if we are in listening state OR if volume is explicitly provided
      // If volume is provided, we visualize it regardless of state (unless state implies silence?)
      // Actually, let's keep the state logic but use the provided volume source.

      if (state === 'listening' && volume === undefined && !rtcHelper.localTracks.audioTrack) {
        // Listening but no track yet - show a "searching/waiting" low pulse
        setVolumes(prev => prev.map(() => 0.15 + Math.random() * 0.1));
      } else if (state === 'listening' || state === 'speaking' || volume !== undefined) {
        // Amplify volume for better visual effect
        // Increased sensitivity: scale * 5
        const v = Math.min(1, currentVol * 5);

        setVolumes(prev => prev.map((_, i) => {
          // Add some randomness and smoothness
          const randomFactor = 0.5 + Math.random() * 0.5;
          // Minimum height 0.15 (subtle) to avoid complete disappearance
          const height = Math.max(0.15, v * randomFactor);
          return height;
        }));
      } else {
        // Idle/Thinking state - low steady bars
        setVolumes(new Array(barCount).fill(0.15));
      }

      animationFrameId = requestAnimationFrame(updateVolume);
    };

    updateVolume();
    return () => cancelAnimationFrame(animationFrameId);
  }, [state, barCount, volume, getFrequencyBands]);

  if (state === 'speaking' && onInterrupt) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onInterrupt();
        }}
        className="flex items-center justify-center w-12 h-12 rounded-full text-white hover:bg-white/10 transition-colors group"
        title="打断对话"
      >
        <Square className="w-5 h-5 fill-current text-white group-hover:scale-110 transition-transform" />
      </button>
    );
  }

  return (
    <div className="flex items-center justify-center gap-[6px] h-8 px-2">
      {volumes.map((v, i) => (
        <span
          key={i}
          className="w-1.5 rounded-lg transition-all duration-75"
          style={{
            height: `${Math.max(4, v * 24)}px`, // Min 4px, Max ~24px (container is h-8 = 32px)
            backgroundColor: barColor,
            opacity: state === 'listening' ? 1 : 0.5
          }}
        />
      ))}
    </div>
  );
};
