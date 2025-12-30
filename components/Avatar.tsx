
import React, { useMemo } from 'react';

interface AvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  micLevel?: number; // 0 to 1 scale
}

const Avatar: React.FC<AvatarProps> = ({ isSpeaking, isListening, micLevel = 0 }) => {
  // Use a random jitter for the mouth when speaking to simulate speech variability
  const mouthPath = useMemo(() => {
    if (!isSpeaking) return "M95,112 L105,112";
    return "M92,110 Q100,118 108,110";
  }, [isSpeaking]);

  // Calculate aura scale based on activity
  const auraScale = isSpeaking ? 1.4 : isListening ? 1 + (micLevel * 0.5) : 1;
  const auraOpacity = isSpeaking ? 0.4 : isListening ? 0.2 + (micLevel * 0.3) : 0.1;

  return (
    <div className="relative w-80 h-80 md:w-[450px] md:h-[450px] flex items-center justify-center">
      {/* Dynamic Soundwave Aura - Reacts to MIC level */}
      <div 
        className="absolute inset-0 rounded-full border-[1px] border-amber-500/20 transition-transform duration-75 ease-out"
        style={{ transform: `scale(${auraScale})`, opacity: auraOpacity }}
      />
      <div 
        className={`absolute inset-0 rounded-full border-[1px] border-white/10 transition-all duration-700 ${isSpeaking ? 'animate-ping opacity-10' : 'opacity-0'}`} 
      />
      
      {/* Studio Backlighting */}
      <div 
        className={`absolute w-[60%] h-[60%] rounded-full blur-[120px] transition-all duration-500 ${
          isSpeaking ? 'bg-amber-400/30' : isListening ? 'bg-indigo-400/20' : 'bg-white/5'
        }`}
        style={{ transform: `scale(${isListening ? 1 + (micLevel * 0.2) : 1})` }}
      />

      {/* The Designer Avatar */}
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full relative z-10 drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
      >
        <defs>
          <linearGradient id="skinGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#ffffff', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#f3f4f6', stopOpacity: 1 }} />
          </linearGradient>
          <linearGradient id="suitTexture" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#1a1a1a', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#0a0a0a', stopOpacity: 1 }} />
          </linearGradient>
        </defs>

        {/* Torso */}
        <g className="animate-float">
          <path d="M30,200 Q30,140 100,140 Q170,140 170,200" fill="url(#suitTexture)" stroke="#333" strokeWidth="0.5" />
          <circle cx="110" cy="155" r="1.5" fill="#fbbf24">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* Head & Neck */}
        <g transform-origin="100 130">
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="-1 100 130; 1 100 130; -1 100 130"
            dur="6s"
            repeatCount="indefinite"
          />
          
          <path d="M90,130 L110,130 L105,145 L95,145 Z" fill="#e5e7eb" />
          <path d="M65,85 Q65,40 100,40 Q135,40 135,85 Q135,130 100,130 Q65,130 65,85" fill="url(#skinGlow)" />

          {/* Expressive Eyes - Reactive Pupils */}
          <g>
            <circle cx="82" cy="85" r="4" fill="#111" opacity="0.1" />
            <circle cx="82" cy="85" r={isSpeaking ? "3" : isListening ? 1.8 + (micLevel * 1) : "1.8"} fill={isSpeaking ? "#fbbf24" : "#111"} className="transition-all duration-150" />
            
            <circle cx="118" cy="85" r="4" fill="#111" opacity="0.1" />
            <circle cx="118" cy="85" r={isSpeaking ? "3" : isListening ? 1.8 + (micLevel * 1) : "1.8"} fill={isSpeaking ? "#fbbf24" : "#111"} className="transition-all duration-150" />
          </g>

          {/* Glasses */}
          <g fill="none" stroke="#111" strokeWidth="1.2">
            <rect x="70" y="78" width="26" height="16" rx="3" strokeOpacity="0.8" />
            <rect x="104" y="78" width="26" height="16" rx="3" strokeOpacity="0.8" />
            <line x1="96" y1="86" x2="104" y2="86" />
          </g>

          {/* Hair */}
          <path d="M65,70 Q65,25 100,25 Q135,25 135,70 L135,80 Q100,50 65,80 Z" fill="#1a1a1a" />

          {/* Animated Mouth - Reactive to state */}
          <path 
            d={mouthPath} 
            fill="none" 
            stroke={isSpeaking ? "#fbbf24" : "#444"} 
            strokeWidth={isSpeaking ? "2.5" : "1"} 
            strokeLinecap="round"
            className="transition-all duration-75"
          >
            {isSpeaking && (
              <animate 
                attributeName="d" 
                values="M92,110 Q100,118 108,110; M94,110 Q100,112 106,110; M91,110 Q100,120 109,110" 
                dur="0.12s" 
                repeatCount="indefinite" 
              />
            )}
          </path>
        </g>
      </svg>
      
      {/* Branding */}
      <div className="absolute bottom-4 flex flex-col items-center gap-1 opacity-40 pointer-events-none">
        <div className="w-12 h-[1px] bg-amber-500/50" />
        <span className="text-[9px] tracking-[0.5em] text-white uppercase font-light">Atelier Unit 01</span>
      </div>
    </div>
  );
};

export default Avatar;
