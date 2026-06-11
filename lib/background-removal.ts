/**
 * Server-side background removal using WithoutBG API
 * Fast, reliable, and doesn't freeze the browser
 */

/**
 * Remove background from an image URL using WithoutBG API
 * @param imageUrl - URL of the image to process
 * @returns Promise with the processed image as a data URL
 */
export async function removeBackgroundClient(imageUrl: string): Promise<string> {
  try {
    console.log('🎨 Starting server-side background removal with WithoutBG API...');
    
    // Call our Next.js API route which handles the WithoutBG API call
    const response = await fetch('/api/withoutbg/remove-background', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrl }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to remove background');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Background removal failed');
    }

    console.log('✅ Background removed successfully');
    console.log(`📊 Credits remaining: ${data.credits_remaining}`);
    
    return data.imageUrl;
    
  } catch (error) {
    console.error('❌ Background removal failed:', error);
    throw error;
  }
}

/**
 * Download image from URL with CORS handling
 * (kept for compatibility, but not used with server-side API)
 */
export async function downloadImageWithCORS(imageUrl: string): Promise<Blob> {
  try {
    const response = await fetch(imageUrl, {
      mode: 'cors',
      credentials: 'omit'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    return await response.blob();
  } catch (error) {
    console.error('Failed to download image:', error);
    throw error;
  }
}
