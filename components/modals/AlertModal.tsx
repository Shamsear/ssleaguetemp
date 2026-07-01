'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info
} from 'lucide-react';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
}

export default function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  type = 'info'
}: AlertModalProps) {
  const [mounted, setMounted] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // Create dedicated portal container
  useEffect(() => {
    const container = document.createElement('div');
    container.id = 'alert-modal-portal';
    container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 9999;';
    document.body.appendChild(container);
    setPortalContainer(container);
    setMounted(true);
    
    return () => {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
      setMounted(false);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted || !portalContainer) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600">
            <CheckCircle className="h-6 w-6" />
          </div>
        );
      case 'error':
        return (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 border border-rose-100 text-rose-600">
            <XCircle className="h-6 w-6" />
          </div>
        );
      case 'warning':
        return (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 border border-amber-100 text-amber-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
        );
      default:
        return (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 border border-blue-100 text-blue-600">
            <Info className="h-6 w-6" />
          </div>
        );
    }
  };

  const getColorClass = () => {
    switch (type) {
      case 'success': return 'text-emerald-600';
      case 'error': return 'text-rose-600';
      case 'warning': return 'text-amber-600';
      default: return 'text-slate-800';
    }
  };

  // Portal renders to dedicated container
  return createPortal(
    <div style={{ pointerEvents: 'auto', position: 'relative', width: '100%', height: '100%' }} className="font-mono">
      {/* Backdrop - full viewport overlay */}
      <div
        className="bg-slate-950/40 backdrop-blur-xs transition-all duration-300"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%'
        }}
      />

      {/* Modal - absolutely centered */}
      <div 
        className="w-[calc(100%-2rem)] sm:w-auto sm:min-w-[400px] sm:max-w-md md:max-w-lg max-h-[90vh] overflow-y-auto console-card bg-white border border-slate-200/80 rounded-3xl shadow-2xl relative animate-in fade-in-0 zoom-in-95 duration-200"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          margin: '0',
          maxWidth: 'min(90vw, 512px)'
        }}
        aria-labelledby="modal-title" 
        role="dialog" 
        aria-modal="true"
      >
        <div className="px-5 py-5 sm:px-8 sm:py-8">
          <div>
            {getIcon()}
            <div className="mt-3 text-center sm:mt-5">
              <h3 className={`text-base font-bold uppercase tracking-wider ${getColorClass()}`}>
                {title || (type === 'success' ? 'Success' : type === 'error' ? 'Error' : type === 'warning' ? 'Warning' : 'Information')}
              </h3>
              <div className="mt-2">
                <p className="text-xs text-slate-550 font-bold whitespace-pre-line leading-relaxed">
                  {message}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 sm:mt-8">
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex w-full justify-center px-5 py-2.5 font-bold uppercase tracking-wider text-xs rounded-xl shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.02] cursor-pointer ${
                type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700' :
                type === 'error' ? 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-700' :
                type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 text-white border border-amber-600' :
                'bg-slate-800 hover:bg-slate-700 text-white border border-slate-900'
              }`}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalContainer
  );
}
