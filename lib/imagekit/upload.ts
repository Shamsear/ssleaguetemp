import ImageKit from 'imagekit-javascript';
import { imagekitConfig, validateImageKitConfig } from './config';

// Initialize ImageKit client
let imagekit: ImageKit | null = null;

function getImageKit() {
  if (!imagekit) {
    try {
      validateImageKitConfig();
      imagekit = new ImageKit({
        publicKey: imagekitConfig.publicKey,
        urlEndpoint: imagekitConfig.urlEndpoint,
      } as any);
    } catch (error) {
      console.error('Failed to initialize ImageKit:', error);
      throw new Error('ImageKit configuration is missing. Please check environment variables.');
    }
  }
  return imagekit;
}

export interface UploadOptions {
  file: File;
  fileName: string;
  folder?: string;
  tags?: string[];
  useUniqueFileName?: boolean;
}

export interface UploadResult {
  url: string;
  fileId: string;
  name: string;
  size: number;
  filePath: string;
  thumbnailUrl?: string;
}

/**
 * Upload an image to ImageKit
 */
export async function uploadImage(options: UploadOptions): Promise<UploadResult> {
  try {
    const ik = getImageKit();
    
    // Get authentication parameters from server
    // This runs client-side (browser), so relative URL works fine.
    // Avoid constructing absolute URL with NEXT_PUBLIC_BASE_URL which may be wrong in production.
    const authEndpoint = imagekitConfig.authenticationEndpoint.startsWith('http')
      ? imagekitConfig.authenticationEndpoint
      : imagekitConfig.authenticationEndpoint; // Keep relative — browser resolves it correctly
    
    const authResponse = await fetch(authEndpoint);
    if (!authResponse.ok) {
      throw new Error('Failed to get authentication parameters');
    }
    const authParams = await authResponse.json();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const base64 = e.target?.result as string;
          
          if (!base64) {
            reject(new Error('Failed to convert file to base64'));
            return;
          }
          
          console.log('Uploading to ImageKit:', {
            fileName: options.fileName,
            folder: options.folder,
            fileSize: options.file.size,
          });
          
          (ik.upload as any)({
            file: base64,
            fileName: options.fileName,
            folder: options.folder || '/team-logos',
            tags: options.tags || [],
            useUniqueFileName: options.useUniqueFileName !== false,
            signature: authParams.signature,
            token: authParams.token,
            expire: authParams.expire,
          }, (err: any, result: any) => {
            if (err) {
              console.error('ImageKit upload error:', err);
              reject(new Error(err.message || 'Upload failed'));
            } else if (result) {
              console.log('ImageKit upload success:', result.url);
              resolve({
                url: result.url,
                fileId: result.fileId,
                name: result.name,
                size: result.size,
                filePath: result.filePath,
                thumbnailUrl: result.thumbnailUrl,
              });
            } else {
              reject(new Error('No result from ImageKit upload'));
            }
          });
        } catch (error) {
          console.error('Error in upload callback:', error);
          reject(error);
        }
      };
      
      reader.onerror = (error) => {
        console.error('FileReader error:', error);
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsDataURL(options.file);
    });
  } catch (error) {
    console.error('Error in uploadImage:', error);
    throw error;
  }
}

/**
 * Upload an image to ImageKit with upload progress callbacks
 */
export async function uploadImageWithProgress(
  options: UploadOptions,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  try {
    const authEndpoint = imagekitConfig.authenticationEndpoint;
    const authResponse = await fetch(authEndpoint);
    if (!authResponse.ok) {
      throw new Error('Failed to get authentication parameters');
    }
    const authParams = await authResponse.json();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            onProgress(percentComplete);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
             const result = JSON.parse(xhr.responseText);
             resolve({
               url: result.url,
               fileId: result.fileId,
               name: result.name,
               size: result.size,
               filePath: result.filePath,
               thumbnailUrl: result.thumbnailUrl,
             });
          } catch (e) {
            reject(new Error('Invalid response from ImageKit'));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.message || 'Upload failed'));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during upload'));
      };

      const formData = new FormData();
      formData.append('file', options.file);
      formData.append('fileName', options.fileName);
      formData.append('publicKey', imagekitConfig.publicKey);
      formData.append('signature', authParams.signature);
      formData.append('token', authParams.token);
      formData.append('expire', String(authParams.expire));
      if (options.folder) {
        formData.append('folder', options.folder);
      }
      if (options.tags && options.tags.length > 0) {
        formData.append('tags', options.tags.join(','));
      }
      formData.append('useUniqueFileName', String(options.useUniqueFileName !== false));

      xhr.open('POST', 'https://upload.imagekit.io/api/v1/files/upload', true);
      xhr.send(formData);
    });
  } catch (error) {
    console.error('Error in uploadImageWithProgress:', error);
    throw error;
  }
}

/**
 * Get optimized image URL with transformations
 */
export function getOptimizedImageUrl(
  url: string,
  options?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'auto' | 'webp' | 'jpg' | 'png';
    crop?: 'maintain_ratio' | 'force' | 'at_least' | 'at_max';
  }
): string {
  if (!url) return '';
  
  const transformations: string[] = [];
  
  if (options?.width) transformations.push(`w-${options.width}`);
  if (options?.height) transformations.push(`h-${options.height}`);
  if (options?.quality) transformations.push(`q-${options.quality}`);
  if (options?.format) transformations.push(`f-${options.format}`);
  if (options?.crop) transformations.push(`c-${options.crop}`);
  
  if (transformations.length === 0) return url;
  
  // Insert transformations into ImageKit URL
  // Format: https://ik.imagekit.io/endpoint/tr:w-100,h-100/path/to/image.jpg
  const transformStr = `tr:${transformations.join(',')}`;
  
  // Check if URL already has transformations
  if (url.includes('/tr:')) {
    // Replace existing transformations
    return url.replace(/\/tr:[^/]*\//, `/${transformStr}/`);
  }
  
  // Add transformations before the file path
  // Split URL into base and file path
  const urlParts = url.split('/');
  const filename = urlParts.pop(); // Get filename
  const baseUrl = urlParts.join('/'); // Get everything before filename
  
  return `${baseUrl}/${transformStr}/${filename}`;
}

/**
 * Delete an image from ImageKit
 */
export async function deleteImage(fileId: string): Promise<void> {
  try {
    const response = await fetch('/api/imagekit/delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete image');
    }
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
}
