
export interface StylistMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface LocationData {
  city?: string;
  latitude?: number;
  longitude?: number;
}

export interface StylingContext {
  occasion: string;
  style: string;
  location: string;
  wardrobe: string[];
}
