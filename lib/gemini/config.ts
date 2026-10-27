import { GoogleGenerativeAI } from '@google/generative-ai';

// Track which API key is currently in use
let currentKeyIndex = 0;
let lastKeyRotation = Date.now();

// Get all available API keys from environment
const getApiKeys = (): string[] => {
  const keys: string[] = [];
  
  // Primary key
  if (process.env.GEMINI_API_KEY) {
    keys.push(process.env.GEMINI_API_KEY);
  }
  
  // Spare keys (add GEMINI_API_KEY_2, GEMINI_API_KEY_3, etc. to .env.local)
  if (process.env.GEMINI_API_KEY_2) {
    keys.push(process.env.GEMINI_API_KEY_2);
  }
  
  if (process.env.GEMINI_API_KEY_3) {
    keys.push(process.env.GEMINI_API_KEY_3);
  }
  
  if (keys.length === 0) {
    throw new Error('No GEMINI_API_KEY configured in environment variables');
  }
  
  return keys;
};

// Get current API key
const getCurrentApiKey = (): string => {
  const keys = getApiKeys();
  return keys[currentKeyIndex % keys.length];
};

// Rotate to next API key
const rotateApiKey = (): void => {
  const keys = getApiKeys();
  if (keys.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    lastKeyRotation = Date.now();
    console.log(`🔄 Rotated to API key #${currentKeyIndex + 1} of ${keys.length}`);
  }
};

// Initialize Gemini API client with current key
const getGeminiClient = () => {
  const apiKey = getCurrentApiKey();
  return new GoogleGenerativeAI(apiKey);
};

// Get the Gemini model for news generation with automatic fallback
export const getGeminiModel = (modelName: string = 'gemini-2.5-flash') => {
  const genAI = getGeminiClient();
  return genAI.getGenerativeModel({ model: modelName });
};

// Wrapper function that handles rate limit errors and retries with different keys
export const generateWithFallback = async (prompt: string, retries = 3): Promise<string> => {
  const keys = getApiKeys();
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < Math.min(retries, keys.length); attempt++) {
    try {
      const model = getGeminiModel();
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a rate limit error
      const isRateLimit = 
        error.message?.includes('429') ||
        error.message?.includes('rate limit') ||
        error.message?.includes('quota') ||
        error.message?.includes('RESOURCE_EXHAUSTED');
      
      if (isRateLimit && keys.length > 1 && attempt < keys.length - 1) {
        console.warn(`⚠️ Rate limit hit on API key #${currentKeyIndex + 1}, trying next key...`);
        rotateApiKey();
        
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // If not rate limit or no more keys, throw error
      throw error;
    }
  }
  
  throw lastError || new Error('Failed to generate content with all available API keys');
};

/**
 * Generate an image using Gemini native image generation (gemini-2.5-flash-image / gemini-3-pro-image)
 * Rotates across configured GEMINI keys on rate limits.
 */
export const generateGeminiImage = async (
  prompt: string,
  modelName: 'gemini-2.5-flash-image' | 'gemini-3-pro-image' = 'gemini-2.5-flash-image',
  retries = 3
): Promise<{ buffer: Buffer; mimeType: string }> => {
  const keys = getApiKeys();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < Math.min(retries, keys.length); attempt++) {
    const apiKey = getCurrentApiKey();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseModalities: ['IMAGE']
          }
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);

      if (!imagePart || !imagePart.inlineData?.data) {
        throw new Error('No image inlineData returned by Gemini Image API');
      }

      return {
        buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
        mimeType: imagePart.inlineData.mimeType || 'image/png'
      };
    } catch (error: any) {
      lastError = error;
      const isRateLimit =
        error.message?.includes('429') ||
        error.message?.includes('rate limit') ||
        error.message?.includes('quota') ||
        error.message?.includes('RESOURCE_EXHAUSTED');

      if (isRateLimit && keys.length > 1 && attempt < keys.length - 1) {
        console.warn(`⚠️ Rate limit hit on API key #${currentKeyIndex + 1}, rotating key...`);
        rotateApiKey();
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('Failed to generate image with available API keys');
};

// Test connection to Gemini API
export const testGeminiConnection = async (): Promise<boolean> => {
  try {
    const model = getGeminiModel();
    const result = await model.generateContent('Hello');
    const response = await result.response;
    return !!response.text();
  } catch (error) {
    console.error('Gemini API connection test failed:', error);
    return false;
  }
};
