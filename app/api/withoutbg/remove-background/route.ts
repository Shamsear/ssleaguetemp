import { NextRequest, NextResponse } from 'next/server';

/**
 * WithoutBG API endpoint for server-side background removal
 * API Docs: https://withoutbg.com/documentation/api/background-removal-binary
 * Uses the binary endpoint with multipart/form-data for efficiency
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

    const apiKey = process.env.WITHOUTBG_API_KEY;
    if (!apiKey) {
      console.error('❌ WITHOUTBG_API_KEY not found in environment');
      return NextResponse.json(
        { success: false, error: 'API key not configured' },
        { status: 500 }
      );
    }

    console.log('🎨 Removing background with WithoutBG API:', imageUrl);

    // Download the image first
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }
    const imageBlob = await imageResponse.blob();

    // Call WithoutBG API using binary endpoint with multipart/form-data
    // This is more efficient than base64 for server-to-server
    const formData = new FormData();
    formData.append('file', imageBlob, 'image.jpg');

    console.log('📤 Calling WithoutBG API (binary endpoint)...');
    const apiResponse = await fetch('https://api.withoutbg.com/v1.0/image-without-background', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
      },
      body: formData,
    });

    console.log('📥 API Response Status:', apiResponse.status);
    console.log('📥 Content-Type:', apiResponse.headers.get('content-type'));

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('❌ WithoutBG API error:', apiResponse.status);
      console.error('❌ Error response body:', errorText);
      
      // Parse error details
      let errorDetail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.detail || errorJson.message || JSON.stringify(errorJson);
        console.error('❌ Parsed error:', errorDetail);
      } catch (e) {
        console.error('❌ Could not parse error as JSON');
      }
      
      // Check for common error codes
      if (apiResponse.status === 401) {
        throw new Error('Invalid API key');
      } else if (apiResponse.status === 402 || apiResponse.status === 403) {
        throw new Error('Insufficient credits. Please top up at https://withoutbg.com/account');
      } else if (apiResponse.status === 429) {
        throw new Error('Rate limit exceeded (7 requests/minute). Please wait and try again');
      } else if (apiResponse.status === 413) {
        throw new Error('Image file size too large (max 10MB)');
      } else if (apiResponse.status === 415) {
        throw new Error('Unsupported image format. Use JPEG, PNG, WebP, TIFF, BMP, or GIF');
      } else {
        throw new Error(`API error (${apiResponse.status}): ${errorDetail}`);
      }
    }

    // Get the processed image as binary (PNG)
    const processedImageBuffer = await apiResponse.arrayBuffer();
    
    // Convert to base64 for easy transmission to client
    const base64Image = Buffer.from(processedImageBuffer).toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    console.log('✅ Background removed successfully');
    console.log('📊 Processed image size:', processedImageBuffer.byteLength, 'bytes');

    return NextResponse.json({
      success: true,
      imageUrl: dataUrl,
      message: 'Background removed successfully',
    });

  } catch (error: any) {
    console.error('❌ Background removal error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to remove background' 
      },
      { status: 500 }
    );
  }
}
