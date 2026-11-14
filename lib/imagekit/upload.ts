import ImageKit from 'imagekit-javascript';
import { imagekitConfig, validateImageKitConfig } from './config';

// Initialize ImageKit client (kept for backwards compatibility)
let imagekit: ImageKit | null = null;

export function getImageKit() {
  if (!imagekit) {
    try {
      validateImageKitConfig();
      imagekit = new ImageKit({
        publicKey: imagekitConfig.publicKey,
        urlEndpoint: imagekitConfig.urlEndpoint,
      } as any);
    } catch (error) {
      console.error('Failed to initialize ImageKit:', error);
    }
  }
  return imagekit;
}

export interface UploadOptions {
  file: File | Blob | string;
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
 * Upload an image to ImageKit via standard FormData POST.
 * Direct multipart upload eliminates FileReader base64 issues and memory bottlenecks.
 */
export async function uploadImage(options: UploadOptions): Promise<UploadResult> {
  try {
    // Get authentication parameters from server
    const authEndpoint = imagekitConfig.authenticationEndpoint.startsWith('http')
      ? imagekitConfig.authenticationEndpoint
      : imagekitConfig.authenticationEndpoint;
    
    const authResponse = await fetch(authEndpoint);
    if (!authResponse.ok) {
      throw new Error('Failed to get authentication parameters');
    }
    const authParams = await authResponse.json();
    const publicKey = authParams.publicKey || imagekitConfig.publicKey;

    if (!publicKey) {
      throw new Error('ImageKit public key is missing');
    }

    const formData = new FormData();
    if (typeof options.file === 'string') {
      formData.append('file', options.file);
    } else {
      formData.append('file', options.file, options.fileName);
    }
    formData.append('fileName', options.fileName);
    formData.append('publicKey', publicKey);
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

    console.log('Uploading to ImageKit:', {
      fileName: options.fileName,
      folder: options.folder,
      fileType: typeof options.file === 'string' ? 'string' : (options.file as any).type,
      fileSize: typeof options.file === 'string' ? options.file.length : (options.file as any).size,
    });

    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = 'Upload failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch {
        errorMessage = `Upload failed with status ${response.status}`;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log('ImageKit upload success:', result.url);
    return {
      url: result.url,
      fileId: result.fileId,
      name: result.name,
      size: result.size,
      filePath: result.filePath,
      thumbnailUrl: result.thumbnailUrl,
    };
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
    const authEndpoint = imagekitConfig.authenticationEndpoint.startsWith('http')
      ? imagekitConfig.authenticationEndpoint
      : imagekitConfig.authenticationEndpoint;
    const authResponse = await fetch(authEndpoint);
    if (!authResponse.ok) {
      throw new Error('Failed to get authentication parameters');
    }
    const authParams = await authResponse.json();
    const publicKey = authParams.publicKey || imagekitConfig.publicKey;

    if (!publicKey) {
      throw new Error('ImageKit public key is missing');
    }

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
      if (typeof options.file === 'string') {
        formData.append('file', options.file);
      } else {
        formData.append('file', options.file, options.fileName);
      }
      formData.append('fileName', options.fileName);
      formData.append('publicKey', publicKey);
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
