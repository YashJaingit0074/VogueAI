# VogueAI: Digital Couture Stylist 👗✨

**VogueAI** is an ultra-modern, voice-first AI fashion consultant. It utilizes the **Gemini 2.5 Flash Native Audio** model to deliver a high-fashion, real-time conversational experience that bridges the gap between digital and physical styling.

## 🚀 Tech Stack Overview

### 🧠 Advanced AI Engineering
- **Gemini 2.5 Flash Native Audio**: Implements the native multimodal Live API. VogueAI processes and generates raw audio natively, preserving emotional nuance and tone without intermediate text steps.
- **System Persona Engineering**: A sophisticated prompt architecture that defines the "VogueAI" brand voice—elite, sophisticated, and avant-garde.
- **Multimodal Interactions**: High-performance handling of synchronized audio and text data streams.

### ⚛️ Frontend Excellence
- **React 19**: Leveraging the newest concurrent rendering features for high-performance UI updates.
- **TypeScript**: Strict type definitions for audio buffers, API payloads, and component states.
- **Web Audio API**: 
    - **PCM Streaming**: Custom logic to handle 16-bit raw PCM data at 16kHz (Input) and 24kHz (Output).
    - **Signal Processing**: Real-time RMS analysis to drive dynamic SVG animations based on microphone input.
- **Glassmorphic UI**: High-fidelity design using Tailwind CSS with backdrop blurs, radial gradients, and fluid animations.

### 🛠️ Architecture & DX
- **Single-Turn Low Latency**: Optimized for <300ms response times by utilizing direct audio-to-audio processing.
- **Sequential Playback Queue**: A custom-built Promise-based queue that ensures zero-gap audio playback by managing the browser's hardware clock.
- **Responsive Design**: Fluid layout optimized for both desktop "Atelier View" and mobile luxury consultations.

## 📖 Functional Highlights
- **Real-time VAD**: The SVG Avatar reacts dynamically to voice intensity and model state.
- **Gapless Conversation**: Intelligent interruption handling allows for natural, fluid dialogue.
- **Context Awareness**: Integrates browser Geolocation to tailor fashion advice to local climates and events.

---
*Built as a demonstration of the intersection between High Fashion and Generative AI.*