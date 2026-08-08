'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import {
  Image as ImageIcon,
  Trash2,
  RefreshCw,
  Search,
  FolderOpen,
  Home,
  Copy,
  Check,
  Edit2,
  X,
  Tag,
  Download,
  Eye,
  AlertTriangle,
  Loader2,
  GridIcon,
  List,
  CheckSquare,
  Square,
  ExternalLink,
  FileImage,
  ChevronLeft,
  ChevronRight,
  Link2,
  Users,
  Shield,
  User,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';
import { normalizeStr } from '@/lib/utils/normalizeStr';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IKFile {
  fileId: string;
  name: string;
  filePath: string;
  url: string;
  thumbnailUrl: string;
  size: number;
  fileType: string;
  mime: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  folder: string;
}

interface IKFolder {
  folderId: string;
  name: string;
  folderPath: string;
  type: 'folder';
}

interface LinkEntity {
  id: string;
  label: string;
  current_image: string | null;
  subtitle: string;
}

interface LinkEntities {
  teams?: LinkEntity[];
  managers?: LinkEntity[];
  owners?: LinkEntity[];
  players?: LinkEntity[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LIMIT = 48;

const ENTITY_TABS = [
  { key: 'team',    label: 'Team Logo',      icon: Shield,    color: 'blue'   },
  { key: 'manager', label: 'Manager Photo',  icon: UserCheck, color: 'purple' },
  { key: 'owner',   label: 'Owner Photo',    icon: User,      color: 'green'  },
  { key: 'player',  label: 'Player Photo',   icon: Users,     color: 'orange' },
] as const;

type EntityType = 'team' | 'manager' | 'owner' | 'player';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const entityColorMap: Record<EntityType, string> = {
  team:    'blue',
  manager: 'purple',
  owner:   'green',
  player:  'orange',
};

const tabBg: Record<string, string> = {
  blue:   'bg-blue-50 text-blue-700 border-blue-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  green:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImageKitMediaPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Navigation
  const [currentPath, setCurrentPath] = useState('/');
  const [pathHistory, setPathHistory] = useState<string[]>(['/']);

  // Data
  const [files, setFiles] = useState<IKFile[]>([]);
  const [folders, setFolders] = useState<IKFolder[]>([]);
  const [fetching, setFetching] = useState(false);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalLoaded, setTotalLoaded] = useState(0);

  // Search
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // View mode
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Detail panel
  const [detailFile, setDetailFile] = useState<IKFile | null>(null);

  // Edit modal
  const [editFile, setEditFile] = useState<IKFile | null>(null);
  const [editName, setEditName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Copy
  const [copied, setCopied] = useState<string | null>(null);

  // Preview
  const [previewFile, setPreviewFile] = useState<IKFile | null>(null);

  // ── Link / Assign ──────────────────────────────────────────────────────────
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkEntityType, setLinkEntityType] = useState<EntityType>('team');
  const [linkEntities, setLinkEntities] = useState<LinkEntities>({});
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linking, setLinking] = useState<string | null>(null); // entityId being linked
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);
  const [clearing, setClearing] = useState<string | null>(null); // entityId being cleared
  const [clearSuccess, setClearSuccess] = useState<string | null>(null);
  const [hoveredImage, setHoveredImage] = useState<string | null>(null); // image url for popover preview

  // ─── Auth guard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && user.role !== 'super_admin') router.push('/dashboard');
  }, [user, loading, router]);

  // ─── Fetch files ─────────────────────────────────────────────────────────────

  const fetchFiles = useCallback(async (path: string, searchQ: string, skipN: number, replace = false) => {
    setFetching(true);
    try {
      const params = new URLSearchParams({
        path,
        limit: String(LIMIT),
        skip: String(skipN),
        type: 'all',
        ...(searchQ ? { search: searchQ } : {}),
      });
      const res = await fetch(`/api/imagekit/files?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (replace) {
        setFiles(data.files || []);
        setFolders(data.folders || []);
        setTotalLoaded(data.files?.length || 0);
      } else {
        setFiles(prev => [...prev, ...(data.files || [])]);
        setTotalLoaded(prev => prev + (data.files?.length || 0));
      }
      setHasMore((data.files?.length || 0) === LIMIT);
      setSkip(skipN + LIMIT);
    } catch (err: any) {
      console.error('Failed to fetch files:', err);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'super_admin') return;
    setSelected(new Set());
    setDetailFile(null);
    fetchFiles(currentPath, search, 0, true);
    setSkip(LIMIT);
  }, [currentPath, search, user]);

  // ─── Link entities ────────────────────────────────────────────────────────────

  const fetchLinkEntities = useCallback(async (type: EntityType) => {
    setLinkLoading(true);
    setLinkEntities(prev => ({ ...prev })); // keep old while loading
    try {
      const res = await fetch(`/api/imagekit/link?type=${type}s`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setLinkEntities(data.data);
    } catch (err) {
      console.error('Failed to fetch link entities:', err);
    } finally {
      setLinkLoading(false);
    }
  }, []);

  const openLinkPanel = (file: IKFile) => {
    setDetailFile(file);
    setShowLinkPanel(true);
    setLinkSearch('');
    setLinkSuccess(null);
    fetchLinkEntities(linkEntityType);
  };

  const handleTabChange = (type: EntityType) => {
    setLinkEntityType(type);
    setLinkSearch('');
    setLinkSuccess(null);
    fetchLinkEntities(type);
  };

  const handleAssign = async (entity: LinkEntity) => {
    if (!detailFile) return;
    setLinking(entity.id);
    try {
      const res = await fetch('/api/imagekit/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: linkEntityType,
          entityId: entity.id,
          imageUrl: detailFile.url,
          fileId: detailFile.fileId,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setLinkSuccess(entity.id);
      setLinkEntities(prev => {
        const key = `${linkEntityType}s` as keyof LinkEntities;
        return {
          ...prev,
          [key]: (prev[key] || []).map(e =>
            e.id === entity.id ? { ...e, current_image: detailFile.url } : e
          ),
        };
      });
      setTimeout(() => setLinkSuccess(null), 3000);
    } catch (err: any) {
      alert('Failed to assign: ' + err.message);
    } finally {
      setLinking(null);
    }
  };

  const handleClear = async (entity: LinkEntity) => {
    setClearing(entity.id);
    try {
      const res = await fetch('/api/imagekit/link', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: linkEntityType, entityId: entity.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setClearSuccess(entity.id);
      setLinkEntities(prev => {
        const key = `${linkEntityType}s` as keyof LinkEntities;
        return {
          ...prev,
          [key]: (prev[key] || []).map(e =>
            e.id === entity.id ? { ...e, current_image: null } : e
          ),
        };
      });
      setTimeout(() => setClearSuccess(null), 3000);
    } catch (err: any) {
      alert('Failed to remove image: ' + err.message);
    } finally {
      setClearing(null);
    }
  };

  // ─── Navigation ───────────────────────────────────────────────────────────────

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    setPathHistory(prev => {
      if (prev[prev.length - 1] !== path) return [...prev, path];
      return prev;
    });
  };

  const navigateBack = () => {
    if (pathHistory.length <= 1) return;
    const newHistory = [...pathHistory];
    newHistory.pop();
    setPathHistory(newHistory);
    setCurrentPath(newHistory[newHistory.length - 1]);
  };

  const pathBreadcrumbs = currentPath
    .split('/')
    .filter(Boolean)
    .reduce<{ label: string; path: string }[]>(
      (acc, seg) => {
        const prevPath = acc[acc.length - 1]?.path || '';
        acc.push({ label: seg, path: `${prevPath}/${seg}` });
        return acc;
      },
      [{ label: 'Home', path: '/' }]
    );

  // ─── Selection ────────────────────────────────────────────────────────────────

  const toggleSelect = (fileId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === files.length) setSelected(new Set());
    else setSelected(new Set(files.map(f => f.fileId)));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // ─── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (fileIds: string[]) => {
    setDeleting(true);
    try {
      const res = await fetch('/api/imagekit/manage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFiles(prev => prev.filter(f => !fileIds.includes(f.fileId)));
      setSelected(prev => { const n = new Set(prev); fileIds.forEach(id => n.delete(id)); return n; });
      if (detailFile && fileIds.includes(detailFile.fileId)) { setDetailFile(null); setShowLinkPanel(false); }
      setDeleteTarget(null);
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  // ─── Edit ─────────────────────────────────────────────────────────────────────

  const handleSaveEdit = async () => {
    if (!editFile) return;
    setSaving(true);
    try {
      const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await fetch('/api/imagekit/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: editFile.fileId, fileName: editName, tags }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const updated = data.file as IKFile;
      setFiles(prev => prev.map(f => f.fileId === updated.fileId ? { ...f, ...updated } : f));
      if (detailFile?.fileId === updated.fileId) setDetailFile({ ...detailFile, ...updated });
      setEditFile(null);
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return null;

  const selectedArr = Array.from(selected);
  const allSelected = files.length > 0 && selected.size === files.length;

  // ─── Filtered link entities ───────────────────────────────────────────────────

  const currentEntities: LinkEntity[] = (() => {
    const key = `${linkEntityType}s` as keyof LinkEntities;
    const list = linkEntities[key] || [];
    if (!linkSearch) return list;
    const q = linkSearch.toLowerCase();
    return list.filter(e => normalizeStr(e.label).includes(normalizeStr(q)) || normalizeStr(e.subtitle).includes(normalizeStr(q)));
  })();

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileImage className="w-6 h-6 text-amber-500" />
            ImageKit Media Manager
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Browse, manage and assign images to teams, managers, owners and players
          </p>
        </div>
        <button
          onClick={() => fetchFiles(currentPath, search, 0, true)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium text-slate-700 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
        {/* Search */}
        <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); }} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search by filename..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
            />
            {searchInput && (
              <button type="button" onClick={() => { setSearchInput(''); setSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
          <button type="submit" className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-all">
            Search
          </button>
        </form>

        {/* Breadcrumb + view toggle */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-sm flex-wrap">
            {pathHistory.length > 1 && (
              <button onClick={navigateBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {pathBreadcrumbs.map((crumb, idx) => (
              <div key={crumb.path} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                <button
                  onClick={() => navigateTo(crumb.path)}
                  className={`px-2 py-1 rounded-lg transition-all font-mono ${idx === pathBreadcrumbs.length - 1 ? 'bg-amber-100 text-amber-700 font-semibold' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  {idx === 0 ? <Home className="w-3.5 h-3.5" /> : crumb.label}
                </button>
              </div>
            ))}
            <span className="text-slate-400 text-xs ml-2 font-mono">{currentPath}</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {(['grid', 'list'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`p-1.5 rounded-lg transition-all ${viewMode === mode ? 'bg-white shadow-sm text-amber-600' : 'text-slate-400'}`}
              >
                {mode === 'grid' ? <GridIcon className="w-4 h-4" /> : <List className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>

        {/* Selection bar */}
        {files.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="flex items-center gap-3">
              <button onClick={selectAll} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                {allSelected ? <CheckSquare className="w-4 h-4 text-amber-500" /> : <Square className="w-4 h-4" />}
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </button>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
              )}
            </div>
            {selected.size > 0 && (
              <button
                onClick={() => setDeleteTarget(selectedArr)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete {selected.size} file{selected.size > 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main layout */}
      <div className="flex gap-4 items-start">

        {/* File grid / list */}
        <div className="flex-1 min-w-0">

          {/* Folders */}
          {folders.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Folders</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {folders.map(folder => (
                  <button
                    key={folder.folderId || folder.folderPath}
                    onClick={() => navigateTo(folder.folderPath)}
                    className="flex flex-col items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl hover:border-amber-400 hover:bg-amber-50/50 transition-all group"
                  >
                    <FolderOpen className="w-8 h-8 text-amber-400 group-hover:text-amber-500" />
                    <span className="text-xs font-medium text-slate-600 truncate w-full text-center">{folder.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {fetching && files.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm">Loading files...</p>
            </div>
          )}

          {!fetching && files.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <ImageIcon className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No files found</p>
              <p className="text-xs mt-1">{search ? 'Try a different search term' : 'This folder is empty'}</p>
            </div>
          )}

          {/* GRID */}
          {viewMode === 'grid' && files.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Files <span className="font-mono text-slate-300">({totalLoaded})</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {files.map(file => {
                  const isSelected = selected.has(file.fileId);
                  const isDetail = detailFile?.fileId === file.fileId;
                  return (
                    <div
                      key={file.fileId}
                      onClick={() => { setDetailFile(isDetail ? null : file); setShowLinkPanel(false); }}
                      className={`relative group cursor-pointer rounded-xl border-2 overflow-hidden bg-white transition-all ${
                        isSelected ? 'border-amber-400 shadow-md' : isDetail ? 'border-blue-400 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                      }`}
                    >
                      <button
                        onClick={e => { e.stopPropagation(); toggleSelect(file.fileId); }}
                        className={`absolute top-2 left-2 z-10 ${isSelected ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                      >
                        {isSelected ? <CheckSquare className="w-5 h-5 text-amber-500 drop-shadow" /> : <Square className="w-5 h-5 text-white drop-shadow" />}
                      </button>

                      <div className="aspect-square bg-slate-50 relative overflow-hidden">
                        {(file.thumbnailUrl || file.url) ? (
                          <img src={file.thumbnailUrl || file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex items-center justify-center w-full h-full"><ImageIcon className="w-8 h-8 text-slate-300" /></div>
                        )}

                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                          <button onClick={e => { e.stopPropagation(); setPreviewFile(file); }} className="p-1.5 bg-white/90 rounded-lg" title="Preview">
                            <Eye className="w-3.5 h-3.5 text-slate-700" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); copyToClipboard(file.url, file.fileId); }} className="p-1.5 bg-white/90 rounded-lg" title="Copy URL">
                            {copied === file.fileId ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-700" />}
                          </button>
                          <button onClick={e => { e.stopPropagation(); openLinkPanel(file); }} className="p-1.5 bg-white/90 rounded-lg" title="Assign to...">
                            <Link2 className="w-3.5 h-3.5 text-blue-600" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); setDeleteTarget([file.fileId]); }} className="p-1.5 bg-white/90 rounded-lg" title="Delete">
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </button>
                        </div>
                      </div>

                      <div className="p-2">
                        <p className="text-xs font-medium text-slate-700 truncate" title={file.name}>{file.name}</p>
                        <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* LIST */}
          {viewMode === 'list' && files.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="w-8 px-4 py-3">
                      <button onClick={selectAll}>{allSelected ? <CheckSquare className="w-4 h-4 text-amber-500" /> : <Square className="w-4 h-4 text-slate-400" />}</button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">File</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Path</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden lg:table-cell">Dimensions</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">Size</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {files.map(file => {
                    const isSelected = selected.has(file.fileId);
                    return (
                      <tr key={file.fileId} onClick={() => { setDetailFile(detailFile?.fileId === file.fileId ? null : file); setShowLinkPanel(false); }}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-3">
                          <button onClick={e => { e.stopPropagation(); toggleSelect(file.fileId); }}>
                            {isSelected ? <CheckSquare className="w-4 h-4 text-amber-500" /> : <Square className="w-4 h-4 text-slate-300" />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img src={file.thumbnailUrl || file.url} alt={file.name} className="w-10 h-10 rounded-lg object-cover bg-slate-100 flex-shrink-0" loading="lazy" />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 truncate max-w-[200px]">{file.name}</p>
                              <p className="text-xs text-slate-400 font-mono">{file.fileType}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="text-xs text-slate-500 font-mono truncate max-w-[180px]" title={file.filePath}>{file.filePath}</p>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <p className="text-xs text-slate-500 font-mono">{file.width && file.height ? `${file.width}×${file.height}` : '—'}</p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => copyToClipboard(file.url, file.fileId)} className="p-1.5 hover:bg-slate-100 rounded-lg" title="Copy URL">
                              {copied === file.fileId ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                            </button>
                            <button onClick={() => openLinkPanel(file)} className="p-1.5 hover:bg-blue-50 rounded-lg" title="Assign to...">
                              <Link2 className="w-3.5 h-3.5 text-blue-500" />
                            </button>
                            <button onClick={() => { setEditFile(file); setEditName(file.name); setEditTags((file.tags || []).join(', ')); }} className="p-1.5 hover:bg-slate-100 rounded-lg" title="Edit">
                              <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                            <button onClick={() => setDeleteTarget([file.fileId])} className="p-1.5 hover:bg-rose-50 rounded-lg" title="Delete">
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {hasMore && files.length > 0 && (
            <div className="flex justify-center mt-6">
              <button onClick={() => fetchFiles(currentPath, search, skip, false)} disabled={fetching}
                className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-medium text-slate-700 shadow-sm disabled:opacity-50">
                {fetching && <Loader2 className="w-4 h-4 animate-spin" />}
                Load more files
              </button>
            </div>
          )}
        </div>

        {/* ── Side Panel ─────────────────────────────────────────────────────── */}
        {detailFile && (
          <div className="w-80 flex-shrink-0 sticky top-24 space-y-3">

            {/* Image info card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="aspect-video bg-slate-100 relative">
                <img src={detailFile.url} alt={detailFile.name} className="w-full h-full object-contain" />
                <button onClick={() => { setDetailFile(null); setShowLinkPanel(false); }} className="absolute top-2 right-2 p-1 bg-white/80 rounded-lg hover:bg-white">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <h3 className="font-semibold text-slate-800 text-sm break-all">{detailFile.name}</h3>
                <div className="space-y-1.5 text-xs">
                  <InfoRow label="Path" value={detailFile.filePath} mono />
                  <InfoRow label="Size" value={formatBytes(detailFile.size)} />
                  {detailFile.width && <InfoRow label="Dimensions" value={`${detailFile.width}×${detailFile.height}`} />}
                  <InfoRow label="Type" value={detailFile.mime || detailFile.fileType} mono />
                  <InfoRow label="Created" value={formatDate(detailFile.createdAt)} />
                </div>

                {/* URL copy */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2">
                  <p className="text-xs font-mono text-slate-600 truncate flex-1">{detailFile.url}</p>
                  <button onClick={() => copyToClipboard(detailFile.url, `d-${detailFile.fileId}`)}>
                    {copied === `d-${detailFile.fileId}` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => { setEditFile(detailFile); setEditName(detailFile.name); setEditTags((detailFile.tags || []).join(', ')); }}
                    className="flex items-center justify-center gap-1 px-2 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold text-slate-700">
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <a href={detailFile.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 px-2 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold text-slate-700">
                    <ExternalLink className="w-3.5 h-3.5" /> Open
                  </a>
                  <button onClick={() => setDeleteTarget([detailFile.fileId])}
                    className="flex items-center justify-center gap-1 px-2 py-2 bg-rose-50 hover:bg-rose-100 rounded-xl text-xs font-semibold text-rose-600">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>

                {/* Assign CTA */}
                <button
                  onClick={() => { setShowLinkPanel(v => !v); if (!showLinkPanel) fetchLinkEntities(linkEntityType); }}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${showLinkPanel ? 'bg-blue-600 text-white' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'}`}
                >
                  <Link2 className="w-4 h-4" />
                  {showLinkPanel ? 'Hide Assign Panel' : 'Assign to Team / Manager / Player...'}
                </button>
              </div>
            </div>

            {/* ── Assign panel ─────────────────────────────────────────────── */}
            {showLinkPanel && (
              <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-blue-100 bg-blue-50">
                  <h4 className="font-bold text-blue-800 text-sm flex items-center gap-2">
                    <Link2 className="w-4 h-4" /> Assign Image To
                  </h4>
                  <p className="text-xs text-blue-600 mt-0.5">Select entity below to set this image as their photo</p>
                </div>

                {/* Entity type tabs */}
                <div className="flex border-b border-slate-100 overflow-x-auto">
                  {ENTITY_TABS.map(tab => {
                    const Icon = tab.icon;
                    const active = linkEntityType === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key as EntityType)}
                        className={`flex-1 min-w-0 flex flex-col items-center gap-1 px-2 py-2.5 text-xs font-semibold transition-all border-b-2 ${
                          active ? 'border-blue-500 text-blue-700 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="truncate">{tab.label.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Search within entities */}
                <div className="p-3 border-b border-slate-100">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      value={linkSearch}
                      onChange={e => setLinkSearch(e.target.value)}
                      placeholder={`Search ${linkEntityType}s...`}
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                    />
                  </div>
                </div>

                {/* Entity list */}
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                  {linkLoading && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                    </div>
                  )}
                  {!linkLoading && currentEntities.length === 0 && (
                    <div className="py-8 text-center text-xs text-slate-400">No {linkEntityType}s found</div>
                  )}
                  {!linkLoading && currentEntities.map(entity => {
                    const isLinking = linking === entity.id;
                    const isSuccess = linkSuccess === entity.id;
                    const isClearing = clearing === entity.id;
                    const isClearSuccess = clearSuccess === entity.id;
                    const color = entityColorMap[linkEntityType];
                    const hasImage = !!entity.current_image;
                    return (
                      <div key={entity.id} className="px-3 py-2.5 hover:bg-slate-50 transition-all">
                        {/* Top row: thumbnail + name + assign */}
                        <div className="flex items-center gap-3">
                          {/* Current image thumbnail — click to enlarge */}
                          <div
                            className={`relative w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden border-2 cursor-pointer transition-all ${
                              hasImage ? 'border-emerald-300 hover:border-emerald-500' : 'border-dashed border-slate-200'
                            }`}
                            onMouseEnter={() => hasImage && setHoveredImage(entity.current_image!)}
                            onMouseLeave={() => setHoveredImage(null)}
                            title={hasImage ? 'Currently assigned image — hover to preview' : 'No image assigned'}
                          >
                            {hasImage ? (
                              <img src={entity.current_image!} alt={entity.label} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-50">
                                <ImageIcon className="w-4 h-4 text-slate-300" />
                              </div>
                            )}
                            {hasImage && (
                              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <Eye className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>

                          {/* Name + subtitle */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{entity.label}</p>
                            <p className="text-xs text-slate-400 font-mono truncate">{entity.subtitle}</p>
                            {hasImage && (
                              <p className="text-xs text-emerald-600 font-medium">✓ Image assigned</p>
                            )}
                          </div>

                          {/* Assign button */}
                          {detailFile && (
                            <button
                              onClick={() => handleAssign(entity)}
                              disabled={isLinking || isSuccess}
                              className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-60 ${
                                isSuccess
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : `${tabBg[color]} hover:opacity-80`
                              }`}
                              title="Assign selected image to this entity"
                            >
                              {isLinking ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : isSuccess ? (
                                <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Done</span>
                              ) : (
                                'Assign'
                              )}
                            </button>
                          )}
                        </div>

                        {/* Current image expanded + remove row */}
                        {hasImage && (
                          <div className="mt-2 ml-13 pl-[52px] flex items-center gap-2">
                            <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg p-1.5 flex items-center gap-2">
                              <img
                                src={entity.current_image!}
                                alt="current"
                                className="w-8 h-8 rounded-md object-cover flex-shrink-0 border border-slate-200"
                              />
                              <p className="text-xs text-slate-500 font-mono truncate flex-1" title={entity.current_image!}>
                                {entity.current_image!.split('/').pop()}
                              </p>
                              <a
                                href={entity.current_image!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 p-1 hover:bg-slate-200 rounded"
                                title="Open in new tab"
                              >
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </a>
                            </div>
                            <button
                              onClick={() => handleClear(entity)}
                              disabled={isClearing || isClearSuccess}
                              className={`flex-shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                isClearSuccess
                                  ? 'bg-slate-100 text-slate-500'
                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
                              } disabled:opacity-60`}
                              title="Remove assigned image"
                            >
                              {isClearing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : isClearSuccess ? (
                                <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Cleared</span>
                              ) : (
                                <><X className="w-3 h-3" /> Remove</>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!linkLoading && currentEntities.length > 0 && (
                  <div className="px-3 py-2 bg-slate-50 border-t border-slate-100">
                    <p className="text-xs text-slate-400 text-center">{currentEntities.length} {linkEntityType}{currentEntities.length !== 1 ? 's' : ''} found</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Preview Modal ─────────────────────────────────────────────────────── */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewFile(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewFile(null)} className="absolute -top-10 right-0 text-white/80 hover:text-white">
              <X className="w-6 h-6" />
            </button>
            <img src={previewFile.url} alt={previewFile.name} className="w-full h-auto max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-black/60 backdrop-blur-sm rounded-xl px-4 py-2">
              <div>
                <p className="text-white text-sm font-semibold">{previewFile.name}</p>
                <p className="text-white/60 text-xs font-mono">{previewFile.filePath}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => copyToClipboard(previewFile.url, `p-${previewFile.fileId}`)} className="p-2 bg-white/20 hover:bg-white/30 rounded-lg">
                  {copied === `p-${previewFile.fileId}` ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white" />}
                </button>
                <button onClick={() => openLinkPanel(previewFile)} className="p-2 bg-white/20 hover:bg-white/30 rounded-lg" title="Assign to...">
                  <Link2 className="w-4 h-4 text-white" />
                </button>
                <a href={previewFile.url} download={previewFile.name} className="p-2 bg-white/20 hover:bg-white/30 rounded-lg">
                  <Download className="w-4 h-4 text-white" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ────────────────────────────────────────────────────────── */}
      {editFile && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><Edit2 className="w-4 h-4 text-amber-500" /> Edit File</h3>
              <button onClick={() => setEditFile(null)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
            </div>
            <img src={editFile.thumbnailUrl || editFile.url} alt={editFile.name} className="w-full h-40 object-contain rounded-xl bg-slate-50 border border-slate-100" />
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">File Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1"><Tag className="w-3 h-3" /> Tags <span className="font-normal text-slate-400">(comma-separated)</span></label>
                <input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="e.g. team-logo, ssleague, s18" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditFile(null)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving} className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-100 rounded-xl flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Delete {deleteTarget.length > 1 ? `${deleteTarget.length} files` : 'file'}?</h3>
                <p className="text-sm text-slate-500 mt-1">This permanently deletes from ImageKit and cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => handleDelete(deleteTarget)} disabled={deleting} className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Hover image popover ───────────────────────────────────────────── */}
      {hoveredImage && (
        <div className="fixed right-[340px] top-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="bg-white border-2 border-emerald-300 rounded-2xl shadow-2xl overflow-hidden w-48">
            <div className="bg-emerald-50 px-3 py-1.5 border-b border-emerald-200">
              <p className="text-xs font-semibold text-emerald-700">Currently Assigned</p>
            </div>
            <img src={hoveredImage} alt="current assigned" className="w-full h-48 object-contain bg-slate-50" />
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-slate-400 mb-0.5">{label}</p>
      <p className={`text-slate-700 break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  );
}
