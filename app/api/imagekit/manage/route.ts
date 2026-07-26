import { NextRequest, NextResponse } from 'next/server';
import ImageKit from 'imagekit';

const imagekit = new ImageKit({
  publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || '',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
  urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || '',
});

// Bulk delete multiple files
export async function DELETE(request: NextRequest) {
  try {
    const { fileIds } = await request.json();

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'fileIds array is required' },
        { status: 400 }
      );
    }

    if (fileIds.length === 1) {
      await imagekit.deleteFile(fileIds[0]);
    } else {
      await imagekit.bulkDeleteFiles(fileIds);
    }

    return NextResponse.json({ success: true, deleted: fileIds.length });
  } catch (error: any) {
    console.error('ImageKit bulk delete error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete files' },
      { status: 500 }
    );
  }
}

// Rename / update tags on a file
export async function PATCH(request: NextRequest) {
  try {
    const { fileId, fileName, tags } = await request.json();

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: 'fileId is required' },
        { status: 400 }
      );
    }

    const updates: any = {};
    if (fileName) updates.fileName = fileName;
    if (tags !== undefined) updates.tags = tags;

    const result = await imagekit.updateFileDetails(fileId, updates);

    return NextResponse.json({ success: true, file: result });
  } catch (error: any) {
    console.error('ImageKit update file error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update file' },
      { status: 500 }
    );
  }
}
