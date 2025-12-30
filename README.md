# VogueAI: Digital Couture Stylist 👗✨

**VogueAI** is an ultra-modern, voice-first AI fashion consultant powered by the **Gemini 2.5 Flash Native Audio** model.

## 🏗️ Cloud Architecture & Vercel Deployment

### 🔑 Mandatory API Key Setup
To resolve the **"Internal error"** typically seen in production environments, you must ensure the application has access to your Gemini API Key.

1. **In Vercel**: Go to **Settings > Environment Variables**.
2. **Add Key**: Name: `API_KEY`, Value: `[Your Key from Google AI Studio]`.
3. **Trigger Redeploy**: Environment variables are injected at deployment time.

### 🌐 Performance-Focused Import Maps
This project leverages **Native ES Modules (ESM)**. Dependencies are resolved directly in the browser via `esm.sh`, eliminating the need for a heavy local build step or `node_modules`.

### ☁️ Multimodal WebSocket Stream
VogueAI creates a persistent, full-duplex WebSocket connection to the Gemini API. 
- **Latency**: Sub-300ms response times for a natural conversation feel.
- **Audio Integrity**: Uses 16-bit Raw PCM data at 16kHz (input) and 24kHz (output).
- **Graceful Failover**: Enhanced with safety checks to prevent crashes when cloud resources are unavailable.

## 🛠️ Technical Stack
- **React 19**: Modern component architecture.
- **Web Audio API**: High-fidelity signal processing.
- **Gemini Live API**: Native multimodal intelligence.
- **Tailwind CSS**: Luxury glassmorphic UI design.

---
*Built to demonstrate the synergy between Generative AI and Luxury Retail.*