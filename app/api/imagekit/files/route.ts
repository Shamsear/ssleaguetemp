import { NextRequest, NextResponse } from 'next/server';
import ImageKit from 'imagekit';

const imagekit = new ImageKit({
  publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || '',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
  urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || '',
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '/';
    const searchQuery = searchParams.get('search') || '';
    const skip = parseInt(searchParams.get('skip') || '0');
    const limit = parseInt(searchParams.get('limit') || '50');
    const type = searchParams.get('type') || 'file'; // 'file' | 'folder' | 'all'

    const listOptions: any = {
      path,
      skip,
      limit,
      includeFolder: type === 'all' || type === 'folder',
    };

    if (searchQuery) {
      listOptions.searchQuery = `name:"${searchQuery}"`;
    }

    const files = await imagekit.listFiles(listOptions);

    // Also get folder list at this path
    let folders: any[] = [];
    try {
      const folderResult = await imagekit.listFiles({
        path,
        includeFolder: true,
        skip: 0,
        limit: 100,
      } as any);
      folders = (folderResult as any[]).filter((f: any) => f.type === 'folder');
    } catch {
      // Ignore folder fetch errors
    }

    return NextResponse.json({
      success: true,
      files: (files as any[]).filter((f: any) => f.type !== 'folder'),
      folders,
      total: (files as any[]).filter((f: any) => f.type !== 'folder').length,
      skip,
      limit,
    });
  } catch (error: any) {
    console.error('ImageKit list files error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to list files' },
      { status: 500 }
    );
  }
}
