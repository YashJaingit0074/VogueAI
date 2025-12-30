
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../services/audioService';
import { StylistMessage, LocationData } from '../types';
import Avatar from './Avatar';

const StylistApp: React.FC = () => {
  const [messages, setMessages] = useState<StylistMessage[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [location, setLocation] = useState<LocationData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sessionRef = useRef<any>(null);
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const playbackQueueRef = useRef<Promise<void>>(Promise.resolve());
  const scheduledEndTimeRef = useRef(0);

  // Safety helper to get API key from various possible sources
  const getApiKey = () => {
    try {
      return typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined;
    } catch (e) {
      return undefined;
    }
  };

  useEffect(() => {
    const checkKeyStatus = async () => {
      const apiKey = getApiKey();
      
      // If we have an env var, we are good to go
      if (apiKey) {
        setNeedsKey(false);
        return;
      }

      // Fallback for AI Studio preview environment
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setNeedsKey(!hasKey);
      } else {
        // Production without key
        setNeedsKey(true);
        setErrorMessage("Cloud Authorization Required: Please set your API_KEY in Vercel settings.");
      }
    };
    
    checkKeyStatus();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => console.warn("Location denied")
      );
    }
    
    setMessages([{
      role: 'assistant',
      text: "Namaste. I am VogueAI. The digital atelier is online. How shall we redefine your aesthetic today?",
      timestamp: Date.now()
    }]);
  }, []);

  useEffect(() => {
    let rafId: number;
    const checkPlayback = () => {
      if (outputAudioContextRef.current) {
        const now = outputAudioContextRef.current.currentTime;
        const shouldBeSpeaking = now < scheduledEndTimeRef.current;
        if (shouldBeSpeaking !== isSpeaking) {
          setIsSpeaking(shouldBeSpeaking);
        }
      }
      rafId = requestAnimationFrame(checkPlayback);
    };
    rafId = requestAnimationFrame(checkPlayback);
    return () => cancelAnimationFrame(rafId);
  }, [isSpeaking]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleOpenKeyDialog = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setNeedsKey(false);
      setErrorMessage(null);
    } else {
      window.open('https://aistudio.google.com/app/apikey', '_blank');
    }
  };

  const startSession = async () => {
    setErrorMessage(null);
    const apiKey = getApiKey();

    if (!apiKey && !window.aistudio) {
      setErrorMessage("Missing API Key. Check your Vercel Environment Variables.");
      return;
    }

    try {
      inputAudioContextRef.current = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' });
      
      await inputAudioContextRef.current.resume();
      await outputAudioContextRef.current.resume();

      // Initialize AI with the key found at runtime
      const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `You are VogueAI, an elite fashion director. Your style is avant-garde and sophisticated. Greet with "Namaste". Provide expert styling advice that is minimalist yet bold.`,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsLive(true);
            setIsListening(true);
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const processor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);
              setMicLevel(Math.min(rms * 5, 1));

              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(processor);
            processor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (m: LiveServerMessage) => {
            const base64 = m.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64 && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              playbackQueueRef.current = playbackQueueRef.current.then(async () => {
                const buffer = await decodeAudioData(decode(base64), ctx, 24000, 1);
                const src = ctx.createBufferSource();
                src.buffer = buffer; 
                src.connect(ctx.destination);
                const startTime = Math.max(nextStartTimeRef.current, ctx.currentTime);
                src.start(startTime);
                nextStartTimeRef.current = startTime + buffer.duration;
                scheduledEndTimeRef.current = nextStartTimeRef.current;
              });
            }

            if (m.serverContent?.interrupted) {
              playbackQueueRef.current = Promise.resolve();
              nextStartTimeRef.current = 0;
              scheduledEndTimeRef.current = 0;
              setIsSpeaking(false);
            }

            if (m.serverContent?.inputTranscription) currentInputTranscriptionRef.current += m.serverContent.inputTranscription.text;
            if (m.serverContent?.outputTranscription) currentOutputTranscriptionRef.current += m.serverContent.outputTranscription.text;
            
            if (m.serverContent?.turnComplete) {
              setMessages(prev => [
                ...prev,
                ...(currentInputTranscriptionRef.current ? [{ role: 'user' as const, text: currentInputTranscriptionRef.current, timestamp: Date.now() }] : []),
                ...(currentOutputTranscriptionRef.current ? [{ role: 'assistant' as const, text: currentOutputTranscriptionRef.current, timestamp: Date.now() }] : [])
              ]);
              currentInputTranscriptionRef.current = ''; currentOutputTranscriptionRef.current = '';
            }
          },
          onclose: (e) => stopSession(),
          onerror: (e: any) => {
            console.error("Gemini Error:", e);
            setErrorMessage(e.message || "Cloud connection interrupted.");
            if (e.message?.includes("API_KEY_INVALID") || e.message?.includes("not found")) {
              setNeedsKey(true);
            }
            stopSession();
          }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (e: any) { 
      setErrorMessage(e.message || "Failed to establish secure link.");
      setIsLive(false);
    }
  };

  const stopSession = () => {
    sessionRef.current?.close(); 
    sessionRef.current = null;
    setIsLive(false); setIsListening(false); setIsSpeaking(false);
    setMicLevel(0); nextStartTimeRef.current = 0; scheduledEndTimeRef.current = 0;
    playbackQueueRef.current = Promise.resolve();
    
    if (inputAudioContextRef.current) inputAudioContextRef.current.close().catch(() => {});
    if (outputAudioContextRef.current) outputAudioContextRef.current.close().catch(() => {});
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault(); if (!textInput.trim()) return;
    setMessages(prev => [...prev, { role: 'user', text: textInput, timestamp: Date.now() }]);
    if (isLive && sessionRef.current) {
      sessionRef.current.sendRealtimeInput({ media: { data: btoa(textInput), mimeType: 'text/plain' } });
    }
    setTextInput('');
  };

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row bg-[#020202] overflow-hidden text-zinc-100 selection:bg-amber-500/30">
      {/* Studio Stage */}
      <div className="relative w-full md:w-[60%] h-[50vh] md:h-full bg-[#050505] flex flex-col items-center justify-center p-12 overflow-hidden border-b md:border-b-0 md:border-r border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#111_0%,#000_100%)] opacity-80" />
        <div className="absolute top-10 left-10 text-white/5 text-[100px] md:text-[140px] font-serif italic select-none pointer-events-none">VOGUE</div>
        
        <Avatar isSpeaking={isSpeaking} isListening={isListening} micLevel={micLevel} />
        
        <div className="mt-12 text-center z-10 flex flex-col items-center max-w-sm">
          {errorMessage && (
            <div className="mb-6 px-5 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[10px] tracking-[0.2em] uppercase leading-relaxed animate-pulse">
              {errorMessage}
            </div>
          )}

          {needsKey && !errorMessage && (
            <button 
              onClick={handleOpenKeyDialog}
              className="mb-6 px-8 py-3 bg-white text-black text-[10px] font-bold tracking-[0.3em] rounded-full hover:bg-zinc-200 transition-all flex items-center gap-3 shadow-[0_20px_40px_rgba(255,255,255,0.1)] active:scale-95"
            >
              <i className="fa-solid fa-cloud-bolt"></i> CONFIGURE CLOUD KEY
            </button>
          )}

          <div className="flex items-center gap-4 mb-5">
            <span className={`h-1 w-1 rounded-full ${isListening ? 'bg-indigo-500 animate-pulse' : 'bg-white/10'}`} />
            <h2 className="text-[11px] tracking-[1em] text-white/50 font-medium uppercase transition-all duration-500">
              {isSpeaking ? 'Model Output' : isListening ? 'Atelier Stream' : 'Unit Standby'}
            </h2>
            <span className={`h-1 w-1 rounded-full ${isSpeaking ? 'bg-amber-500 animate-pulse' : 'bg-white/10'}`} />
          </div>
          
          <div className="h-[1px] w-64 bg-white/10 overflow-hidden relative">
            <div 
              className={`absolute inset-0 bg-gradient-to-r from-transparent via-amber-500 to-transparent transition-all duration-300 ${isSpeaking ? 'opacity-100' : 'opacity-0'}`}
              style={{ width: '100%', left: isSpeaking ? '0' : '-100%' }}
            />
            <div 
              className={`h-full bg-indigo-500/50 transition-all duration-75`}
              style={{ width: `${micLevel * 100}%` }}
            />
          </div>

          {!isLive && !needsKey && !errorMessage && (
            <button 
              onClick={startSession}
              className="mt-8 text-[10px] text-white/20 uppercase tracking-[0.6em] hover:text-white transition-all hover:tracking-[0.7em]"
            >
              Initialize Atelier Link
            </button>
          )}
        </div>
      </div>

      {/* Control Panel */}
      <div className="flex-1 h-[50vh] md:h-full flex flex-col glass relative z-20 shadow-[-40px_0_80px_rgba(0,0,0,0.8)] border-l border-white/5">
        <div className="p-10 flex justify-between items-end border-b border-white/5">
          <div>
            <h1 className="text-3xl font-serif font-bold text-gradient tracking-tighter">Curation Log</h1>
            <p className="text-[9px] tracking-[0.4em] text-zinc-600 uppercase mt-2 font-bold">Encrypted Multi-Modal Stream</p>
          </div>
          <div className="text-[9px] text-zinc-700 font-mono">0.0.3-RELEASE</div>
        </div>

        <div className="flex-1 overflow-y-auto px-10 py-8 space-y-8 scroll-smooth custom-scrollbar">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
              <div className="flex items-center gap-3 mb-3">
                {m.role === 'assistant' && <div className="w-1 h-1 rounded-full bg-amber-500" />}
                <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold">{m.role === 'assistant' ? 'Director' : 'Client'}</span>
              </div>
              <div className={`max-w-[90%] px-6 py-5 rounded-3xl text-[13px] leading-relaxed tracking-wide ${
                m.role === 'user' ? 'bg-white text-black font-semibold shadow-2xl' : 'bg-zinc-900/50 text-zinc-400 border border-white/5 italic'
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="p-10 bg-[#080808]/80 backdrop-blur-xl border-t border-white/5">
          <form onSubmit={handleSendMessage} className="flex items-center gap-6">
            <button
              type="button"
              disabled={needsKey}
              onClick={isLive ? stopSession : startSession}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-700 group ${
                needsKey ? 'bg-zinc-900 text-zinc-800 cursor-not-allowed border border-white/5' :
                isLive ? 'bg-amber-500 text-black shadow-[0_0_40px_rgba(251,191,36,0.2)] hover:scale-105' : 'bg-zinc-900 text-white hover:bg-zinc-800 border border-white/10'
              }`}
            >
              <i className={`fa-solid ${isLive ? 'fa-microphone-slash' : 'fa-microphone'} text-lg group-active:scale-90 transition-transform`}></i>
            </button>
            <div className="flex-1 relative group">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={needsKey ? "System awaiting cloud key..." : "Message the atelier..."}
                disabled={needsKey}
                className="w-full bg-transparent border-b border-white/10 px-2 py-4 text-[13px] text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-white transition-all disabled:opacity-30 tracking-wide"
              />
              <button 
                type="submit" 
                disabled={needsKey || !textInput.trim()} 
                className="absolute right-0 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white transition-all disabled:opacity-0 active:scale-90"
              >
                <i className="fa-solid fa-chevron-right text-xs"></i>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StylistApp;
