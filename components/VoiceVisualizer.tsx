import React, { useEffect, useState } from 'react';
import { RTCHelper } from '../conversational-ai-api/helper/rtc';

interface VoiceVisualizerProps {
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
  barCount?: number;
  barColor?: string;
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({ 
  state, 
  barCount = 4,
  barColor = '#3b82f6'
}) => {
  const [volumes, setVolumes] = useState<number[]>(new Array(barCount).fill(0.1));

  useEffect(() => {
    let animationFrameId: number;
    const rtcHelper = RTCHelper.getInstance();

    const updateVolume = () => {
      // Check if we are in listening state AND have an active audio track
      if (state === 'listening' && rtcHelper.localTracks.audioTrack) {
        const volume = rtcHelper.localTracks.audioTrack.getVolumeLevel(); // 0 to 1
        
        // Amplify volume for better visual effect
        // Increased sensitivity: scale * 5
        const v = Math.min(1, volume * 5); 
        
        setVolumes(prev => prev.map((_, i) => {
           // Add some randomness and smoothness
           const randomFactor = 0.5 + Math.random() * 0.5;
           // Minimum height 0.15 (subtle) to avoid complete disappearance
           const height = Math.max(0.15, v * randomFactor);
           return height;
        }));
      } else if (state === 'listening' && !rtcHelper.localTracks.audioTrack) {
        // Listening but no track yet - show a "searching/waiting" low pulse
         setVolumes(prev => prev.map(() => 0.15 + Math.random() * 0.1));
      } else {
        // Idle/Thinking state - low steady bars
        setVolumes(new Array(barCount).fill(0.15));
      }
      
      animationFrameId = requestAnimationFrame(updateVolume);
    };

    updateVolume();
    return () => cancelAnimationFrame(animationFrameId);
  }, [state, barCount]);

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
