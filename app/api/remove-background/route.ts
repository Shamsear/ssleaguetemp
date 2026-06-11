import { NextRequest, NextResponse } from 'next/server';

/**
 * API endpoint to remove background from images using remove.bg
 * Fallback when ImageKit transformations fail
 * Supports multiple API keys for automatic rotation when quota is exceeded
 */
export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { success: false, error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Get API keys (supports comma-separated list)
    const apiKeysString = process.env.REMOVE_BG_API_KEY;
    
    if (!apiKeysString) {
      console.warn('⚠️ REMOVE_BG_API_KEY not configured, returning original image');
      return NextResponse.json({
        success: false,
        error: 'Background removal service not configured',
        fallbackUrl: imageUrl
      });
    }

    // Parse multiple API keys
    const apiKeys = apiKeysString.split(',').map(key => key.trim()).filter(Boolean);
    console.log(`🔑 Found ${apiKeys.length} remove.bg API key(s)`);
    console.log('🔄 Removing background for:', imageUrl);

    let lastError: any = null;

    // Try each API key until one succeeds
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      const keyLabel = apiKeys.length > 1 ? `Key ${i + 1}/${apiKeys.length}` : 'API Key';
      
      try {
        console.log(`🔑 Trying ${keyLabel}...`);

        // Call remove.bg API
        const formData = new FormData();
        formData.append('image_url', imageUrl);
        formData.append('size', 'auto');

        const response = await fetch('https://api.remove.bg/v1.0/removebg', {
          method: 'POST',
          headers: {
            'X-Api-Key': apiKey,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ ${keyLabel} failed:`, response.status, errorText);
          
          // Check if it's a quota error
          if (response.status === 402 || errorText.includes('quota') || errorText.includes('limit')) {
            console.warn(`⚠️ ${keyLabel} quota exceeded, trying next key...`);
            lastError = new Error(`${keyLabel} quota exceeded`);
            continue; // Try next key
          }
          
          lastError = new Error(`${keyLabel} error: ${response.statusText}`);
          continue; // Try next key
        }

        // Success! Get the image blob
        const blob = await response.blob();
        
        // Convert blob to base64
        const buffer = await blob.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const dataUrl = `data:${blob.type};base64,${base64}`;

        console.log(`✅ Background removed successfully using ${keyLabel}`);

        return NextResponse.json({
          success: true,
          imageUrl: dataUrl,
          type: 'base64',
          usedKey: i + 1,
          totalKeys: apiKeys.length
        });

      } catch (error: any) {
        console.error(`❌ ${keyLabel} error:`, error.message);
        lastError = error;
        continue; // Try next key
      }
    }

    // All keys failed
    console.error('❌ All remove.bg API keys failed');
    return NextResponse.json({
      success: false,
      error: lastError?.message || 'All API keys failed',
      fallbackUrl: imageUrl,
      triedKeys: apiKeys.length
    }, { status: 500 });

  } catch (error: any) {
    console.error('❌ Background removal error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
