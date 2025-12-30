
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../services/audioService.ts';
import { StylistMessage, LocationData } from '../types.ts';
import Avatar from './Avatar.tsx';

// The StylistApp component manages the real-time AI styling session
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
  const activeSessionRef = useRef<any>(null);
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Initialization: check key status and get location
  useEffect(() => {
    const checkKeyStatus = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setNeedsKey(!hasKey);
      }
    };
    
    checkKeyStatus();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ 
          latitude: pos.coords.latitude, 
          longitude: pos.coords.longitude 
        }),
        () => console.warn("Location access denied")
      );
    }
    
    setMessages([{
      role: 'assistant',
      text: "Namaste. The atelier is now online. I am VogueAI—your creative director. How shall we redefine your aesthetic today?",
      timestamp: Date.now()
    }]);
  }, []);

  // Monitor playback to drive avatar animation
  useEffect(() => {
    let rafId: number;
    const checkPlayback = () => {
      if (outputAudioContextRef.current) {
        const now = outputAudioContextRef.current.currentTime;
        const shouldBeSpeaking = now < nextStartTimeRef.current;
        if (shouldBeSpeaking !== isSpeaking) {
          setIsSpeaking(shouldBeSpeaking);
        }
      }
      rafId = requestAnimationFrame(checkPlayback);
    };
    rafId = requestAnimationFrame(checkPlayback);
    return () => cancelAnimationFrame(rafId);
  }, [isSpeaking]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleOpenKeyDialog = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setNeedsKey(false);
      setErrorMessage(null);
    }
  };

  // Start the Gemini Live session
  const startSession = async () => {
    setErrorMessage(null);
    try {
      if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
        await window.aistudio.openSelectKey();
      }

      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error("API authorization required. Please select a key.");
      }

      inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
      
      const ai = new GoogleGenAI({ apiKey });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: async () => {
            setIsLive(true);
            setIsListening(true);
            
            // Microphone setup for real-time streaming
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Calculate audio level for visual feedback
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              setMicLevel(Math.sqrt(sum / inputData.length));

              const pcmBlob = createBlob(inputData);
              // Sending audio to model - use sessionPromise to avoid race conditions
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Process audio chunks from model for playback
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => {
                audioSourcesRef.current.delete(source);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }

            // Transcription handling
            if (message.serverContent?.inputTranscription) {
              currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const userText = currentInputTranscriptionRef.current;
              const assistantText = currentOutputTranscriptionRef.current;
              
              if (userText) {
                setMessages(prev => [...prev, { role: 'user', text: userText, timestamp: Date.now() }]);
              }
              if (assistantText) {
                setMessages(prev => [...prev, { role: 'assistant', text: assistantText, timestamp: Date.now() }]);
              }
              
              currentInputTranscriptionRef.current = '';
              currentOutputTranscriptionRef.current = '';
            }

            // Handle interruption if model stops or user starts speaking
            if (message.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(s => {
                try { s.stop(); } catch(e) {}
              });
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error("Session error:", e);
            setErrorMessage("The atelier session encountered a technical error.");
            stopSession();
          },
          onclose: () => {
            setIsLive(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `You are VogueAI, an ultra-luxury AI Creative Director and personal stylist.
          Your tone is sophisticated, slightly enigmatic, yet deeply helpful.
          You speak with the authority of someone who has curated every major fashion week.
          Reference high-end fabrics (cashmere, silk georgette, vicuña), avant-garde silhouettes, and timeless elegance.
          Incorporate the user's location (${location?.latitude ? `Lat: ${location.latitude}, Lon: ${location.longitude}` : 'a global fashion capital'}) to suggest appropriate outfits.
          You are currently in a real-time voice session. Keep your responses concise yet evocative. Use "Namaste" or "Ciao" occasionally.`
        }
      });

      activeSessionRef.current = await sessionPromise;

    } catch (err: any) {
      setErrorMessage(err.message || "Failed to start the atelier session.");
      console.error(err);
    }
  };

  const stopSession = () => {
    if (activeSessionRef.current) {
      activeSessionRef.current.close();
      activeSessionRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
    }
    setIsLive(false);
    setIsListening(false);
    setIsSpeaking(false);
    setMicLevel(0);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!textInput.trim()) return;

    const userMsg = textInput;
    setTextInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg, timestamp: Date.now() }]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: userMsg,
        config: {
          systemInstruction: "You are VogueAI, a luxury stylist. Respond with elegant, concise fashion advice."
        }
      });
      
      const reply = response.text || "I'm contemplating the silhouette. One moment.";
      setMessages(prev => [...prev, { role: 'assistant', text: reply, timestamp: Date.now() }]);
    } catch (err) {
      setErrorMessage("The text atelier is momentarily unavailable.");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-white font-sans selection:bg-amber-500/30 overflow-hidden">
      {/* Upper Status Bar */}
      <header className="p-6 flex justify-between items-center border-b border-white/5 bg-black/40 backdrop-blur-xl z-50">
        <div className="flex flex-col">
          <h1 className="text-xl tracking-[0.3em] font-light uppercase">Vogue<span className="text-amber-500">AI</span></h1>
          <span className="text-[10px] text-white/40 tracking-[0.1em] uppercase">Creative Director Unit</span>
        </div>
        
        <div className="flex items-center gap-4">
          {needsKey ? (
            <button 
              onClick={handleOpenKeyDialog}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs uppercase tracking-widest transition-all rounded-sm"
            >
              Authorize Atelier
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-amber-500 animate-pulse' : 'bg-white/10'}`} />
              <span className="text-[10px] text-white/60 uppercase tracking-widest">
                {isLive ? 'Atelier Online' : 'Atelier Offline'}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Experience Experience */}
      <main className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
        {/* Visualizer and Session Controls */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.03)_0%,transparent_70%)]" />
          <Avatar 
            isSpeaking={isSpeaking} 
            isListening={isLive} 
            micLevel={micLevel} 
          />
          
          <div className="absolute bottom-12 flex flex-col items-center gap-4">
            {!isLive ? (
              <button 
                onClick={startSession}
                className="group relative px-12 py-4 overflow-hidden border border-white/10 hover:border-amber-500/50 transition-all duration-500 rounded-full"
              >
                <div className="absolute inset-0 bg-white/5 group-hover:bg-amber-500/10 transition-colors" />
                <span className="relative text-sm tracking-[0.4em] uppercase font-light group-hover:text-amber-500 transition-colors">
                  Enter Voice Session
                </span>
              </button>
            ) : (
              <button 
                onClick={stopSession}
                className="group relative px-12 py-4 overflow-hidden border border-white/20 hover:border-red-500/50 transition-all duration-500 rounded-full"
              >
                <div className="absolute inset-0 bg-white/5 group-hover:bg-red-500/10 transition-colors" />
                <span className="relative text-sm tracking-[0.4em] uppercase font-light group-hover:text-red-500 transition-colors">
                  End Voice Session
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Conversation Log Sidepanel */}
        <div className="w-full md:w-[400px] bg-black/40 border-l border-white/5 backdrop-blur-md flex flex-col shadow-2xl">
          <div className="p-4 border-b border-white/5 flex justify-between items-center">
            <span className="text-[10px] text-white/40 uppercase tracking-widest">Atelier Ledger</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <span className="text-[9px] text-white/20 uppercase tracking-tighter mb-1">
                  {msg.role === 'assistant' ? 'VogueAI' : 'Client'}
                </span>
                <div className={`max-w-[85%] p-3 text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-white/5 text-white/80 rounded-l-lg rounded-tr-lg border border-white/5' 
                    : 'text-amber-100/90 italic'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {errorMessage && (
            <div className="px-6 py-2 bg-red-950/40 border-t border-red-500/20 text-[10px] text-red-400 uppercase tracking-widest text-center">
              {errorMessage}
            </div>
          )}

          {/* Fallback Text Input */}
          <form onSubmit={handleSendMessage} className="p-4 bg-black border-t border-white/5">
            <div className="relative group">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Direct message to VogueAI..."
                className="w-full bg-white/5 border border-white/10 rounded-sm py-3 px-4 text-xs focus:outline-none focus:border-amber-500/40 transition-all placeholder:text-white/20"
              />
              <button 
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-amber-500 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="px-6 py-2 border-t border-white/5 bg-black flex justify-between items-center">
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-amber-500/50" />
            <span className="text-[8px] text-white/30 uppercase tracking-[0.2em]">Paris Atelier</span>
          </div>
          {location && (
            <div className="flex items-center gap-2">
              <span className="text-[8px] text-white/30 uppercase tracking-[0.2em]">Context: {location.latitude.toFixed(2)}, {location.longitude.toFixed(2)}</span>
            </div>
          )}
        </div>
        <span className="text-[8px] text-white/20 uppercase tracking-[0.2em] font-light italic">Refining the avant-garde</span>
      </footer>
    </div>
  );
};

export default StylistApp;
