'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Info,
  HelpCircle
} from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'info'
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const container = document.createElement('div');
    container.id = 'confirm-modal-portal';
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
      if (e.key === 'Escape') onCancel();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onCancel]);

  if (!isOpen || !mounted || !portalContainer) return null;

  const getIcon = () => {
    if (type === 'danger') {
      return (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 border border-rose-100 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
      );
    } else if (type === 'warning') {
      return (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 border border-amber-100 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
      );
    }
    return (
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 border border-blue-100 text-blue-600">
        <HelpCircle className="h-6 w-6" />
      </div>
    );
  };

  const getConfirmButtonColorClass = () => {
    switch (type) {
      case 'danger':
        return 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-700';
      case 'warning':
        return 'bg-amber-500 hover:bg-amber-600 text-white border border-amber-600';
      default:
        return 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-900';
    }
  };

  return createPortal(
    <div style={{ pointerEvents: 'auto', position: 'relative', width: '100%', height: '100%' }} className="font-mono">
      {/* Backdrop */}
      <div
        className="bg-black/25 backdrop-blur-sm"
        onClick={onCancel}
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

      {/* Modal - centered */}
      <div 
        className="w-[calc(100%-2rem)] sm:w-auto sm:min-w-[400px] sm:max-w-lg md:max-w-xl max-h-[90vh] overflow-y-auto console-card bg-white border border-slate-200/80 rounded-3xl shadow-2xl relative"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          margin: '0',
          maxWidth: 'min(90vw, 640px)'
        }}
        aria-labelledby="modal-title" 
        role="dialog" 
        aria-modal="true"
      >
        <div className="px-5 py-5 sm:px-8 sm:py-8">
          <div className="sm:flex sm:items-start">
            <div className="flex-shrink-0">
              {getIcon()}
            </div>
            <div className="mt-4 text-center sm:ml-4 sm:mt-0 sm:text-left flex-1">
              <h3 className="text-base font-bold uppercase tracking-wider text-slate-900">
                {title || 'Confirmation Required'}
              </h3>
              <div className="mt-2">
                <p className="text-xs text-slate-550 font-bold whitespace-pre-line leading-relaxed">
                  {message}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 sm:mt-8 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex w-full sm:w-auto justify-center px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-705 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all duration-200 cursor-pointer"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onCancel();
              }}
              className={`inline-flex w-full sm:w-auto justify-center rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] cursor-pointer ${getConfirmButtonColorClass()}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalContainer
  );
}
