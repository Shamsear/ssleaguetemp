'use client';

import { useState } from 'react';
import { getStorage, ref, uploadBytes, deleteObject, listAll } from 'firebase/storage';
import { app } from '@/lib/firebase/config';
import { Camera, UploadCloud, Trash2, Info, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

export default function BulkPhotoUpload() {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [deleteResult, setDeleteResult] = useState<any>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(e.target.files);
    setUploadResult(null);
  };

  const handleBulkUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      alert('Please select photo files to upload');
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      
      // Add all files to FormData
      Array.from(selectedFiles).forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch('/api/players/photos/upload-public', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setUploadResult(data);

      if (data.success) {
        // Clear file input
        const fileInput = document.getElementById('photo-files') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        setSelectedFiles(null);
      }
    } catch (error: any) {
      setUploadResult({
        success: false,
        error: error.message || 'Upload failed',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('⚠️ Are you sure you want to delete ALL player photos? This action cannot be undone!')) {
      return;
    }

    if (!confirm('⚠️ FINAL WARNING: This will permanently delete all player photos from storage. Continue?')) {
      return;
    }

    setDeleting(true);
    setDeleteResult(null);

    try {
      const response = await fetch('/api/players/photos/delete-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteAll: true }),
      });

      const data = await response.json();
      setDeleteResult(data);
    } catch (error: any) {
      setDeleteResult({
        success: false,
        error: error.message || 'Delete failed',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      <div>
        <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <Camera className="w-4 h-4 text-amber-500" />
          Bulk Player Photo Management
        </h3>
        <p className="text-[11px] text-slate-400 font-mono">Upload or delete multiple player photos at once</p>
      </div>

      {/* Upload Section */}
      <div className="border-t border-slate-100 pt-4 space-y-4 font-mono text-xs">
        <h4 className="font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <UploadCloud className="w-4 h-4 text-amber-500" />
          Upload Player Photos
        </h4>
        
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Select Photos (Multiple files)
            </label>
            <input
              type="file"
              id="photo-files"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleFileSelect}
              className="block w-full text-xs text-slate-500 font-mono
                file:mr-4 file:py-2.5 file:px-4
                file:rounded-xl file:border file:border-slate-200
                file:text-xs file:font-bold file:uppercase file:tracking-wide
                file:bg-slate-50 file:text-slate-700
                hover:file:bg-slate-100
                cursor-pointer"
            />
            <p className="mt-1.5 text-[10px] text-slate-400 font-bold uppercase">
              {selectedFiles ? `${selectedFiles.length} file(s) selected` : 'No files selected'}
            </p>
          </div>

          <div className="bg-amber-50/50 border border-amber-200/50 rounded-2xl p-4 text-[11px] text-slate-700">
            <p className="font-extrabold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-amber-600" />
              File Naming Instructions
            </p>
            <ul className="list-disc list-inside text-slate-500 space-y-1 pl-1">
              <li>Name files as: <code className="bg-amber-100/50 px-1.5 py-0.5 rounded font-bold">player_id.jpg</code></li>
              <li>Example: <code className="bg-amber-100/50 px-1.5 py-0.5 rounded font-bold">12345.jpg</code>, <code className="bg-amber-100/50 px-1.5 py-0.5 rounded font-bold">67890.png</code></li>
              <li>Prefix "player_" is optional: <code className="bg-amber-100/50 px-1.5 py-0.5 rounded font-bold">player_12345.jpg</code></li>
              <li>Supported formats: JPG, PNG, WebP</li>
              <li>Max size limits: 4MB per file</li>
            </ul>
          </div>

          <button
            onClick={handleBulkUpload}
            disabled={uploading || !selectedFiles || selectedFiles.length === 0}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl 
              disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono font-bold text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            {uploading ? (
              <>
                <RefreshCw className="animate-spin h-3.5 w-3.5 text-amber-400" />
                Uploading...
              </>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
                Upload Photos
              </>
            )}
          </button>
        </div>

        {/* Upload Results */}
        {uploadResult && (
          <div className={`p-4 rounded-2xl border font-mono text-[11px] ${uploadResult.success ? 'bg-emerald-50/20 border-emerald-200/50 text-emerald-800' : 'bg-rose-50/20 border-rose-200/50 text-rose-800'}`}>
            <p className="font-extrabold uppercase tracking-wider flex items-center gap-1.5">
              {uploadResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-500 animate-bounce" />
              )}
              {uploadResult.message}
            </p>
            {uploadResult.summary && (
              <div className="mt-2 text-slate-500 space-y-0.5">
                <p>✅ Success: {uploadResult.summary.success}</p>
                <p>❌ Failed: {uploadResult.summary.failed}</p>
                <p>📊 Total: {uploadResult.summary.total}</p>
              </div>
            )}
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer font-bold uppercase text-[10px] text-rose-600">View Errors ({uploadResult.errors.length})</summary>
                <ul className="mt-1.5 space-y-1 text-rose-600 pl-1">
                  {uploadResult.errors.map((err: any, i: number) => (
                    <li key={i}>• {err.fileName}: {err.error}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Delete Section */}
      <div className="border-t border-slate-100 pt-4 space-y-4 font-mono text-xs">
        <h4 className="font-extrabold text-rose-500 uppercase tracking-wider flex items-center gap-1.5">
          <Trash2 className="w-4 h-4 text-rose-500" />
          Delete All Player Photos
        </h4>
        
        <div className="bg-rose-50/30 border border-rose-200/50 rounded-2xl p-4 text-rose-800">
          <p className="flex items-start gap-2 text-[11px] leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span>
              <strong className="uppercase font-extrabold tracking-wide">Warning:</strong> This will permanently delete ALL player photos from Cloud Storage. This action cannot be undone!
            </span>
          </p>
        </div>

        <button
          onClick={handleDeleteAll}
          disabled={deleting}
          className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl 
            disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono font-bold text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {deleting ? (
            <>
              <RefreshCw className="animate-spin h-3.5 w-3.5 text-white" />
              Deleting...
            </>
          ) : (
            <>
              <Trash2 className="w-3.5 h-3.5 text-white" />
              Delete All Photos
            </>
          )}
        </button>

        {/* Delete Results */}
        {deleteResult && (
          <div className={`p-4 rounded-2xl border font-mono text-[11px] ${deleteResult.success ? 'bg-emerald-50/20 border-emerald-200/50 text-emerald-800' : 'bg-rose-50/20 border-rose-200/50 text-rose-800'}`}>
            <p className="font-extrabold uppercase tracking-wider flex items-center gap-1.5">
              {deleteResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-500 animate-bounce" />
              )}
              {deleteResult.message}
            </p>
            {deleteResult.summary && (
              <div className="mt-2 text-slate-500 space-y-0.5">
                <p>✅ Deleted: {deleteResult.summary.success}</p>
                <p>❌ Failed: {deleteResult.summary.failed}</p>
                <p>📊 Total: {deleteResult.summary.total}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
