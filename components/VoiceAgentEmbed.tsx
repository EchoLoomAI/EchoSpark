import React from 'react';

interface Props {
  src?: string;
  onBack: () => void;
}

const VoiceAgentEmbed: React.FC<Props> = ({ src = 'http://localhost:3000/', onBack }) => {
  return (
    <div className="h-full flex flex-col bg-background-light">
      <header className="flex justify-between items-center p-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-600 shadow-sm border border-slate-100 active:scale-90 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
        </button>
        <div className="font-bold text-slate-700">VoiceAgent 模块</div>
        <div className="w-10" />
      </header>

      <main className="flex-1">
        <iframe
          title="VoiceAgent"
          src={src}
          className="w-full h-full border-0"
          allow="microphone; clipboard-read; clipboard-write"
        />
      </main>
    </div>
  );
};

export default VoiceAgentEmbed;
