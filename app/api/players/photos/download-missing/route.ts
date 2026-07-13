import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon/config';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

// User Agent for scraping
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CARD_URL_TEMPLATE = "https://pesdb.net/assets/img/card/f{player_id}max.png";

/**
 * GET handler: Returns the list of players missing photos
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Fetch all active player IDs
    const activePlayers = await sql.query(`SELECT player_id, name FROM footballplayers WHERE player_id IS NOT NULL AND player_id != ''`);
    
    // 2. Fetch existing photos from local directory or GitHub API
    const existingPhotoIds = new Set<string>();
    const isDev = process.env.NODE_ENV === 'development';
    const hasGithub = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);

    if (!isDev && hasGithub) {
      // Production - Fetch from GitHub contents API for exact real-time state
      try {
        const token = process.env.GITHUB_TOKEN;
        const repo = process.env.GITHUB_REPO;
        const githubUrl = `https://api.github.com/repos/${repo}/contents/public/images/players`;
        
        const response = await fetch(githubUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'NextJS-App'
          },
          next: { revalidate: 0 }
        });

        if (response.status === 200) {
          const files = await response.json();
          if (Array.isArray(files)) {
            files.forEach(file => {
              if (file.name.endsWith('.webp')) {
                const id = file.name.split('.')[0];
                existingPhotoIds.add(id);
              }
            });
          }
        }
      } catch (ghError) {
        console.error('Error fetching image list from GitHub API:', ghError);
        // Fallback to local filesystem check in case GitHub API fails or rate limits
      }
    }

    // Fallback/Local - check local filesystem readdir
    if (existingPhotoIds.size === 0) {
      try {
        const dirPath = path.join(process.cwd(), 'public', 'images', 'players');
        await fs.mkdir(dirPath, { recursive: true });
        const files = await fs.readdir(dirPath);
        files.forEach(file => {
          if (file.endsWith('.webp')) {
            const id = file.split('.')[0];
            existingPhotoIds.add(id);
          }
        });
      } catch (fsError) {
        console.error('Error reading local photo directory:', fsError);
      }
    }

    // 3. Filter missing players
    const missing = activePlayers.filter((p: any) => !existingPhotoIds.has(p.player_id.toString()));

    return NextResponse.json({
      success: true,
      totalActive: activePlayers.length,
      existingCount: existingPhotoIds.size,
      missingCount: missing.length,
      missingPlayers: missing.map((p: any) => ({
        player_id: p.player_id,
        name: p.name
      }))
    });

  } catch (error: any) {
    console.error('❌ Error finding missing photos:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST handler: Downloads, processes, and commits a single player's photo
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerId } = body;

    if (!playerId) {
      return NextResponse.json({ success: false, error: 'playerId is required' }, { status: 400 });
    }

    const cardUrl = CARD_URL_TEMPLATE.replace('{player_id}', playerId);

    // 1. Download card image from pesdb
    let imageBuffer: Buffer;
    try {
      const response = await fetch(cardUrl, {
        headers: { 'User-Agent': USER_AGENT },
        next: { revalidate: 0 }
      });

      if (response.status !== 200) {
        return NextResponse.json({ success: false, error: `pesdb.net returned HTTP status ${response.status}` }, { status: 500 });
      }

      imageBuffer = Buffer.from(await response.arrayBuffer());
    } catch (e: any) {
      console.error(`Failed to download card for ID ${playerId}:`, e);
      return NextResponse.json({ success: false, error: `Failed to download card: ${e.message}` }, { status: 500 });
    }

    // 2. Validate the downloaded buffer is actually an image (pesdb returns HTML 404 pages as 200)
    let faceBuffer: Buffer;
    try {
      // Quick check: real PNG/JPEG/WebP images start with specific magic bytes
      const magic = imageBuffer.slice(0, 4).toString('hex');
      const isPng  = magic.startsWith('89504e47');  // PNG
      const isJpeg = magic.startsWith('ffd8ff');    // JPEG
      const isWebp = imageBuffer.slice(0, 4).toString('ascii') === 'RIFF'; // WebP
      if (!isPng && !isJpeg && !isWebp) {
        return NextResponse.json({
          success: false,
          error: `Card image not found on pesdb.net for ID ${playerId} (not a valid image — likely a 404 HTML page)`
        }, { status: 404 });
      }

      // Get actual dimensions of the downloaded card
      const metadata = await sharp(imageBuffer).metadata();
      const width  = metadata.width  || 0;
      const height = metadata.height || 0;

      if (!width || !height) {
        return NextResponse.json({ success: false, error: `Could not read image dimensions for ID ${playerId}` }, { status: 500 });
      }

      console.log(`📐 Card dimensions for ID ${playerId}: ${width}×${height}`);

      // --- Strategy: extract face from ORIGINAL dimensions, then resize to 140×140 ---
      // This avoids any ambiguity from chaining resize→extract (Sharp pipeline ordering).
      // Face is centered at ~66.5% x, ~24% y of the card.
      const centerX = Math.floor(width  * 0.665);
      const centerY = Math.floor(height * 0.24);

      // Face crop square: aim for 35% of card width, clamped so it fits
      const desiredSize = Math.floor(Math.min(width * 0.35, height * 0.35));
      const faceSize    = Math.max(10, Math.min(desiredSize, width, height)); // at least 10px

      // Clamp top-left corner so the box stays inside the image
      const left = Math.max(0, Math.min(centerX - Math.floor(faceSize / 2), width  - faceSize));
      const top  = Math.max(0, Math.min(centerY - Math.floor(faceSize / 2), height - faceSize));

      console.log(`✂️  Extracting face: left=${left} top=${top} size=${faceSize}×${faceSize} (from ${width}×${height})`);

      // Extract face region from the original image, then upscale to 140×140
      faceBuffer = await sharp(imageBuffer)
        .extract({ left, top, width: faceSize, height: faceSize }) // crop face on original
        .resize(140, 140, { kernel: 'lanczos3', fit: 'fill' })     // upscale to target
        .sharpen({ sigma: 1.2 })                                    // sharpen after upscale
        .webp({ quality: 90 })
        .toBuffer();

    } catch (e: any) {
      console.error(`❌ Sharp error for ID ${playerId}:`, e);
      return NextResponse.json({ success: false, error: `Image processing failed: ${e.message}` }, { status: 500 });
    }


    // 3. Save WebP photo (Local filesystem or GitHub commit)
    const isDev = process.env.NODE_ENV === 'development';
    const hasGithub = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);

    if (!isDev && hasGithub) {
      // Production on Vercel: commit directly to GitHub repository
      const token = process.env.GITHUB_TOKEN;
      const repo = process.env.GITHUB_REPO;
      const filePath = `public/images/players/${playerId}.webp`;
      const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;

      console.log(`🤖 Pushing photo ${playerId}.webp to GitHub repository: ${repo}`);

      // Check if file already exists in Git to grab its SHA (required for overrides/updates if needed)
      let sha: string | null = null;
      try {
        const checkRes = await fetch(githubUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'NextJS-App'
          }
        });
        if (checkRes.status === 200) {
          const fileData = await checkRes.json();
          sha = fileData.sha;
        }
      } catch (e) {
        // Ignored, file probably does not exist
      }

      // Create or update file contents
      const bodyParams: any = {
        message: `Add/Update player photo for ID: ${playerId}`,
        content: faceBuffer.toString('base64')
      };
      if (sha) {
        bodyParams.sha = sha;
      }

      const gitResponse = await fetch(githubUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'NextJS-App'
        },
        body: JSON.stringify(bodyParams)
      });

      if (gitResponse.status !== 200 && gitResponse.status !== 201) {
        const errorText = await gitResponse.text();
        console.error('GitHub API error:', errorText);
        return NextResponse.json({ success: false, error: `Failed to commit to GitHub repository: ${gitResponse.status} ${gitResponse.statusText}` }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        method: 'github',
        message: `Player photo for ID ${playerId} successfully committed to GitHub.`
      });

    } else {
      // Local dev mode: save to public folder directly
      const dirPath = path.join(process.cwd(), 'public', 'images', 'players');
      await fs.mkdir(dirPath, { recursive: true });
      const targetPath = path.join(dirPath, `${playerId}.webp`);

      await fs.writeFile(targetPath, faceBuffer);

      return NextResponse.json({
        success: true,
        method: 'local',
        message: `Player photo for ID ${playerId} saved to local public folder.`
      });
    }

  } catch (error: any) {
    console.error('❌ Error processing photo download:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
