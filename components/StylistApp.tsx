
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../services/audioService.ts';
import { StylistMessage, LocationData } from '../types.ts';
import Avatar from './Avatar.tsx';

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

  // Safe check for the API key to avoid ReferenceErrors
  const getAvailableKey = () => {
    return (window.process?.env?.API_KEY) || undefined;
  };

  useEffect(() => {
    const checkKeyStatus = async () => {
      const apiKey = getAvailableKey();
      
      if (apiKey) {
        setNeedsKey(false);
        return;
      }

      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setNeedsKey(!hasKey);
      } else {
        // If we are on Vercel and API_KEY isn't set, we need to show the error
        setNeedsKey(true);
      }
    };
    
    checkKeyStatus();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => console.warn("Location access denied")
      );
    }
    
    setMessages([{
      role: 'assistant',
      text: "Namaste. The atelier is open. I am VogueAI—your personal creative director. How shall we redefine your aesthetic today?",
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
    } else {
      setErrorMessage("Please set the API_KEY environment variable in your Vercel project settings.");
    }
  };

  const startSession = async () => {
    setErrorMessage(null);
    try {
      const apiKey = getAvailableKey();
      
      // If no key in process.env, check if user needs to select one via UI
      if (!apiKey && window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
        }
      }

      // Final validation before connecting
      const finalKey = getAvailableKey();
      if (!finalKey) {
        throw new Error("No API Key found. Ensure API_KEY is set in Vercel or selected via the key picker.");
      }

      inputAudioContextRef.current = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' });
      await inputAudioContextRef.current.resume();
      await outputAudioContextRef.current.resume();

      const ai = new GoogleGenAI({ apiKey: finalKey });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `You are VogueAI, an elite fashion director. Greet with "Namaste". Your tone is refined, sophisticated, and avant-garde. You provide styling advice based on the user's current environment and high-fashion trends.`,
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
          onclose: () => stopSession(),
          onerror: (e: any) => {
            const msg = e.message || "Cloud Connection Error";
            setErrorMessage(msg);
            if (msg.includes("Requested entity was not found")) setNeedsKey(true);
            stopSession();
          }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (e: any) { 
      setErrorMessage(e.message || "Failed to establish cloud session.");
      setIsLive(false);
    }
  };

  const stopSession = () => {
    sessionRef.current?.close(); 
    sessionRef.current = null;
    setIsLive(false); setIsListening(false); setIsSpeaking(false);
    setMicLevel(0); nextStartTimeRef.current = 0; scheduledEndTimeRef.current = 0;
    playbackQueueRef.current = Promise.resolve();
    
    if (inputAudioContextRef.current?.state !== 'closed') inputAudioContextRef.current?.close();
    if (outputAudioContextRef.current?.state !== 'closed') outputAudioContextRef.current?.close();
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
      {/* Visualizer Stage */}
      <div className="relative w-full md:w-[60%] h-[50vh] md:h-full bg-[#050505] flex flex-col items-center justify-center p-12 overflow-hidden border-b md:border-b-0 md:border-r border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#111_0%,#000_100%)] opacity-80" />
        <div className="absolute top-10 left-10 text-white/5 text-[120px] font-serif italic select-none pointer-events-none">VOGUE</div>
        
        <Avatar isSpeaking={isSpeaking} isListening={isListening} micLevel={micLevel} />
        
        <div className="mt-8 text-center z-10 flex flex-col items-center">
          {errorMessage && (
            <div className="mb-4 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-[10px] tracking-widest uppercase animate-pulse max-w-xs">
              {errorMessage}
            </div>
          )}

          {needsKey && (
            <button 
              onClick={handleOpenKeyDialog}
              className="mb-4 px-6 py-2 bg-amber-500 text-black text-[10px] font-bold tracking-widest rounded-full hover:bg-amber-400 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(251,191,36,0.2)]"
            >
              <i className="fa-solid fa-key"></i> LINK CLOUD ACCESS
            </button>
          )}

          <div className="flex items-center gap-3 mb-4">
            <span className={`h-1 w-1 rounded-full ${isListening ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-white/10'}`} />
            <h2 className="text-[10px] tracking-[0.8em] text-white/40 font-bold uppercase transition-all duration-300">
              {isSpeaking ? 'Curating Style' : isListening ? 'Atelier Active' : 'System Standby'}
            </h2>
            <span className={`h-1 w-1 rounded-full ${isSpeaking ? 'bg-amber-500 shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'bg-white/10'}`} />
          </div>
          
          {!isLive && !needsKey && (
            <button 
              onClick={startSession}
              className="mt-6 text-[9px] text-white/30 uppercase tracking-[0.5em] hover:text-white transition-colors border-b border-white/5 pb-1"
            >
              Establish Cloud Link
            </button>
          )}
        </div>
      </div>

      {/* Chat & Logs */}
      <div className="flex-1 h-[50vh] md:h-full flex flex-col glass relative z-20 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]">
        <div className="p-8 flex justify-between items-center border-b border-white/5">
          <div>
            <h1 className="text-2xl font-serif font-bold text-gradient tracking-tight">Curation Log</h1>
            <p className="text-[9px] tracking-[0.3em] text-zinc-500 uppercase mt-1">Direct Feed Unit 01</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6 scroll-smooth custom-scrollbar">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}>
              <div className="flex items-center gap-2 mb-2">
                {m.role === 'assistant' && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                <span className="text-[8px] uppercase tracking-widest text-zinc-600 font-bold">{m.role === 'assistant' ? 'Director' : 'Client'}</span>
              </div>
              <div className={`max-w-[85%] px-5 py-4 rounded-2xl text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-zinc-100 text-black font-medium shadow-xl' : 'bg-zinc-900/80 text-zinc-300 border border-white/5 italic'
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="p-8 bg-zinc-950/50 border-t border-white/5">
          <form onSubmit={handleSendMessage} className="flex items-center gap-5">
            <button
              type="button"
              disabled={needsKey}
              onClick={isLive ? stopSession : startSession}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 ${
                needsKey ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' :
                isLive ? 'bg-zinc-900 text-amber-500 border border-amber-500/50 shadow-[0_0_30px_rgba(251,191,36,0.3)]' : 'bg-white text-black hover:scale-105 active:scale-95 shadow-xl'
              }`}
            >
              <i className={`fa-solid ${isLive ? 'fa-microphone-slash' : 'fa-microphone'} text-xl`}></i>
            </button>
            <div className="flex-1 relative group">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={needsKey ? "System awaiting cloud authorization..." : "Direct Message..."}
                disabled={needsKey}
                className="w-full bg-zinc-900/80 border border-white/10 rounded-3xl px-8 py-5 text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-amber-500/40 transition-all disabled:opacity-50"
              />
              <button type="submit" disabled={needsKey || !textInput.trim()} className="absolute right-6 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-amber-500 transition-colors disabled:opacity-0">
                <i className="fa-solid fa-arrow-right-long text-lg"></i>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StylistApp;