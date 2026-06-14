'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

interface PromptModalProps {
  isOpen: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

export default function PromptModal({
  isOpen,
  onConfirm,
  onCancel,
  title = 'Input Required',
  message,
  placeholder = 'Enter value...',
  defaultValue = '',
  confirmText = 'Submit',
  cancelText = 'Cancel'
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);
  const [mounted, setMounted] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const container = document.createElement('div');
    container.id = 'prompt-modal-portal';
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
    setValue(defaultValue);
  }, [defaultValue, isOpen]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value);
    onCancel();
  };

  if (!isOpen || !mounted || !portalContainer) return null;

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
          <form onSubmit={handleSubmit}>
            <div>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 border border-blue-100 text-blue-600">
                <HelpCircle className="h-6 w-6" />
              </div>
              <div className="mt-3 text-center sm:mt-5">
                <h3 className="text-base font-bold uppercase tracking-wider text-slate-900">
                  {title}
                </h3>
                <div className="mt-2">
                  <p className="text-xs text-slate-555 font-bold whitespace-pre-line leading-relaxed">
                    {message}
                  </p>
                </div>
                <div className="mt-5">
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={placeholder}
                    className="block w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                    autoFocus
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 sm:mt-8 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex w-full sm:w-auto justify-center px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-55 text-slate-705 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all duration-200 cursor-pointer"
              >
                {cancelText}
              </button>
              <button
                type="submit"
                className="inline-flex w-full sm:w-auto justify-center rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] cursor-pointer bg-slate-800 hover:bg-slate-700 text-white border border-slate-900"
              >
                {confirmText}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    portalContainer
  );
}
