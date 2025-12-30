
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

  // Safely check for the API key to prevent "Internal error" crashes
  const checkConfig = async () => {
    try {
      const apiKey = typeof process !== 'undefined' && process.env?.API_KEY;
      if (apiKey) {
        setNeedsKey(false);
        return true;
      }
      
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setNeedsKey(!hasKey);
        return hasKey;
      }
      
      setNeedsKey(true);
      return false;
    } catch (e) {
      console.warn("Config check failed, defaulting to manual key entry state.");
      setNeedsKey(true);
      return false;
    }
  };

  useEffect(() => {
    checkConfig();
    setMessages([{
      role: 'assistant',
      text: "Namaste. I am VogueAI. The digital atelier is online. How shall we refine your aesthetic today?",
      timestamp: Date.now()
    }]);
  }, []);

  useEffect(() => {
    let rafId: number;
    const checkPlayback = () => {
      if (outputAudioContextRef.current) {
        const now = outputAudioContextRef.current.currentTime;
        const shouldBeSpeaking = now < scheduledEndTimeRef.current;
        if (shouldBeSpeaking !== isSpeaking) setIsSpeaking(shouldBeSpeaking);
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
      setErrorMessage("Please set your API_KEY in Vercel environment variables.");
    }
  };

  const startSession = async () => {
    setErrorMessage(null);
    const hasKey = await checkConfig();
    
    // Attempt to grab key directly - we must not use a separate variable to avoid stale closures
    const currentApiKey = typeof process !== 'undefined' ? process.env.API_KEY : undefined;

    if (!currentApiKey && !window.aistudio) {
      setErrorMessage("Cloud authentication missing. Check environment variables.");
      return;
    }

    try {
      inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
      
      await inputAudioContextRef.current.resume();
      await outputAudioContextRef.current.resume();

      const ai = new GoogleGenAI({ apiKey: currentApiKey || process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `You are VogueAI, an elite fashion director. Tone: Sophisticated, minimalist, avant-garde. Greet with "Namaste". Focus on luxury styling advice.`,
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
              setMicLevel(Math.min(Math.sqrt(sum / inputData.length) * 5, 1));
              
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
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
              currentInputTranscriptionRef.current = ''; 
              currentOutputTranscriptionRef.current = '';
            }
          },
          onclose: () => stopSession(),
          onerror: (e: any) => {
            console.error("Cloud Error:", e);
            setErrorMessage(e.message || "Connectivity Interrupted");
            stopSession();
          }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (e: any) { 
      setErrorMessage(e.message || "Failed to initialize cloud link.");
      setIsLive(false);
    }
  };

  const stopSession = () => {
    sessionRef.current?.close(); 
    sessionRef.current = null;
    setIsLive(false); setIsListening(false); setIsSpeaking(false);
    setMicLevel(0); nextStartTimeRef.current = 0; scheduledEndTimeRef.current = 0;
    playbackQueueRef.current = Promise.resolve();
    
    inputAudioContextRef.current?.close().catch(() => {});
    outputAudioContextRef.current?.close().catch(() => {});
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
    <div className="h-screen w-screen flex flex-col md:flex-row bg-[#020202] overflow-hidden">
      {/* Studio Stage */}
      <div className="relative w-full md:w-[60%] h-[45vh] md:h-full bg-[#050505] flex flex-col items-center justify-center p-8 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#0a0a0a_0%,#000_100%)]" />
        <div className="absolute top-10 left-10 text-white/[0.02] text-[120px] md:text-[180px] font-serif italic select-none pointer-events-none uppercase">Atelier</div>
        
        <Avatar isSpeaking={isSpeaking} isListening={isListening} micLevel={micLevel} />
        
        <div className="mt-12 text-center z-10 flex flex-col items-center">
          {errorMessage && (
            <div className="mb-6 px-4 py-2 bg-red-950/20 border border-red-900/40 rounded-lg text-red-500 text-[9px] tracking-[0.2em] uppercase animate-pulse">
              {errorMessage}
            </div>
          )}

          {needsKey && (
            <button 
              onClick={handleOpenKeyDialog}
              className="mb-8 px-8 py-3 bg-white text-black text-[10px] font-bold tracking-[0.4em] rounded-full hover:bg-zinc-200 transition-all flex items-center gap-3 active:scale-95 shadow-[0_10px_30px_rgba(255,255,255,0.1)]"
            >
              AUTHENTICATE CLOUD
            </button>
          )}

          <div className="flex items-center gap-6 mb-6">
            <div className="flex flex-col items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${isListening ? 'bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.8)] scale-125' : 'bg-white/5'}`} />
              <span className="text-[8px] tracking-widest text-zinc-600 uppercase">Input</span>
            </div>
            <h2 className="text-[11px] tracking-[0.8em] text-white/40 font-semibold uppercase">
              {isSpeaking ? 'Curating' : isListening ? 'Streaming' : 'Standby'}
            </h2>
            <div className="flex flex-col items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${isSpeaking ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.8)] scale-125' : 'bg-white/5'}`} />
              <span className="text-[8px] tracking-widest text-zinc-600 uppercase">Output</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="flex-1 h-[55vh] md:h-full flex flex-col glass relative z-20">
        <div className="p-10 flex justify-between items-end border-b border-white/[0.03]">
          <div>
            <h1 className="text-3xl font-serif font-bold text-gradient">VogueAI</h1>
            <p className="text-[9px] tracking-[0.4em] text-zinc-600 uppercase mt-2 font-bold">Encrypted Session Unit</p>
          </div>
          <div className={`text-[8px] font-mono px-3 py-1 rounded-full border ${isLive ? 'border-green-500/20 text-green-500' : 'border-white/5 text-zinc-700'}`}>
            {isLive ? 'ENCRYPTED' : 'DISCONNECTED'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-10 py-12 space-y-10 custom-scrollbar">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-6 duration-700`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[8px] uppercase tracking-[0.25em] text-zinc-600 font-black">{m.role === 'assistant' ? 'Director' : 'Client'}</span>
                {m.role === 'assistant' && <div className="w-1 h-1 rounded-full bg-amber-500/40" />}
              </div>
              <div className={`max-w-[90%] px-7 py-5 rounded-2xl text-[13px] leading-[1.8] tracking-wide ${
                m.role === 'user' ? 'bg-white text-black font-semibold shadow-2xl' : 'bg-zinc-900/40 text-zinc-400 border border-white/[0.03] italic'
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="p-10 bg-black/40 border-t border-white/[0.03]">
          <form onSubmit={handleSendMessage} className="flex items-center gap-8">
            <button
              type="button"
              disabled={needsKey}
              onClick={isLive ? stopSession : startSession}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 group relative ${
                needsKey ? 'bg-zinc-900 text-zinc-800' :
                isLive ? 'bg-amber-500 text-black shadow-[0_0_40px_rgba(245,158,11,0.3)]' : 'bg-zinc-900 text-zinc-400 border border-white/10 hover:border-white/30'
              }`}
            >
              <i className={`fa-solid ${isLive ? 'fa-microphone-slash' : 'fa-microphone'} text-lg`}></i>
              {isLive && <span className="absolute inset-0 rounded-full bg-amber-500 animate-ping opacity-20" />}
            </button>
            <div className="flex-1 relative">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={needsKey ? "System locking..." : "Direct message to atelier..."}
                disabled={needsKey}
                className="w-full bg-transparent border-b border-white/5 py-4 text-sm text-white placeholder:text-zinc-800 focus:outline-none focus:border-white/20 transition-all disabled:opacity-20"
              />
              <button type="submit" disabled={needsKey || !textInput.trim()} className="absolute right-0 top-1/2 -translate-y-1/2 text-zinc-700 hover:text-white transition-colors disabled:opacity-0">
                <i className="fa-solid fa-arrow-right-long"></i>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StylistApp;
