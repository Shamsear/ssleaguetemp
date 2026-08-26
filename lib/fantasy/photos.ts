import { adminDb } from '@/lib/neon/admin-db-wrapper';

let cachedPhotosMap: Record<string, string> | null = null;
let cacheExpiry: number = 0;

/**
 * Fetch all player photo URLs from Firestore and cache them for 5 minutes to prevent rate limits
 */
export async function getPlayerPhotosMap(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedPhotosMap && now < cacheExpiry) {
    return cachedPhotosMap;
  }

  try {
    const photoMap: Record<string, string> = {};
    const snapshot = await adminDb.collection('realplayers').get();
    
    snapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      if (data.photo_url && data.player_id) {
        photoMap[data.player_id] = data.photo_url;
      }
    });

    cachedPhotosMap = photoMap;
    cacheExpiry = now + 5 * 60 * 1000; // 5 minutes cache
    return photoMap;
  } catch (error) {
    console.error('Error fetching player photos from Firestore:', error);
    return cachedPhotosMap || {}; // Fallback to stale cache or empty object
  }
}
