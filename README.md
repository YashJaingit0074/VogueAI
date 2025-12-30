# VogueAI: Digital Couture Stylist 👗✨

**VogueAI** is an ultra-modern, voice-first AI fashion consultant. It utilizes the **Gemini 2.5 Flash Native Audio** model to deliver a high-fashion, real-time conversational experience.

## 🏗️ Cloud & Import Architecture

### 🌐 Module Management (Import Maps)
This project uses **Native ES Modules**. Instead of a traditional `npm install` and build step, we utilize an `importmap` in `index.html`:
- **CDN-First**: Dependencies like `@google/genai` and `react` are streamed via `esm.sh`.
- **Zero Build Latency**: The browser resolves imports directly, significantly reducing deployment complexity and bundle size.

### ☁️ Cloud Connectivity (Gemini Live API)
VogueAI is a **multimodal cloud-native application**:
- **WebSocket Streaming**: The app establishes a full-duplex WebSocket connection to Google's Gemini servers.
- **Native Audio Processing**: Unlike traditional AI bots that convert voice to text first, this app streams **raw PCM audio** (16-bit, 16kHz) directly to the cloud. The AI "hears" the user and "speaks" back natively.
- **Serverless Edge**: The UI is hosted on **Vercel**, while the intelligence is distributed across Google's high-performance AI infrastructure.

### 🚀 Deployment on Vercel
1. **Environment Variables**: Add `API_KEY` in your Vercel project settings.
2. **Global Reach**: Vercel serves the frontend from the edge, while the Gemini API handles global inference.

## 🛠️ Tech Stack Highlights
- **React 19**: Modern UI rendering.
- **Web Audio API**: Real-time signal processing and buffer management.
- **Tailwind CSS**: High-performance, utility-first styling.
- **Google GenAI SDK**: Direct cloud integration for the Gemini 2.5 Flash model.

---
*Built for the intersection of High Fashion and Generative AI.*