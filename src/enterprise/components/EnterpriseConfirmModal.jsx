import React from 'react';
import { FiAlertTriangle, FiCheck, FiX, FiInfo } from 'react-icons/fi';

/**
 * Enterprise Branded Confirmation Modal
 * Replaces native browser window.confirm with a sleek, accessible, responsive modal dialog.
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is visible
 * @param {string} props.title - Modal title
 * @param {string|React.ReactNode} props.message - Descriptive warning / prompt text
 * @param {string} [props.confirmLabel='Confirm'] - Confirm button text
 * @param {string} [props.cancelLabel='Cancel'] - Cancel button text
 * @param {'danger'|'primary'|'warning'} [props.variant='danger'] - Visual style of confirm action
 * @param {boolean} [props.busy=false] - Whether action is processing
 * @param {Function} props.onConfirm - Callback when user confirms
 * @param {Function} props.onClose - Callback when modal is dismissed
 */
export default function EnterpriseConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  busy = false,
  onConfirm,
  onClose,
}) {
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !busy) {
      onClose();
    }
  };

  React.useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;

  const getIcon = () => {
    if (variant === 'danger') return <FiAlertTriangle className="text-red-600 text-lg" />;
    if (variant === 'warning') return <FiAlertTriangle className="text-amber-600 text-lg" />;
    return <FiInfo className="text-indigo-600 text-lg" />;
  };

  const getConfirmButtonClasses = () => {
    if (variant === 'danger') return 'bg-red-600 hover:bg-red-700 text-white shadow-xs focus:ring-red-500';
    if (variant === 'warning') return 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs focus:ring-amber-500';
    return 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs focus:ring-indigo-500';
  };

  return (
    <div
      className="enterprise-modal-backdrop enterprise-modal-overlay fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => !busy && onClose()}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="enterprise-modal bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all text-left"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '480px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div
          className="enterprise-modal-header p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
        >
          <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                variant === 'danger' ? 'bg-red-100' : (variant === 'warning' ? 'bg-amber-100' : 'bg-indigo-100')
              }`}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: variant === 'danger' ? '#fee2e2' : (variant === 'warning' ? '#fef3c7' : '#e0e7ff'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {getIcon()}
            </div>
            <h3 id="confirm-dialog-title" className="enterprise-modal-title text-base font-bold text-slate-900" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="enterprise-modal-close p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#94a3b8' }}
          >
            <FiX />
          </button>
        </div>

        <div
          className="enterprise-modal-body p-6 text-sm text-slate-600 leading-relaxed text-left"
          style={{ padding: '20px 24px', fontSize: '0.92rem', color: '#475569', lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'break-word', textAlign: 'left' }}
        >
          {typeof message === 'string' ? <p className="m-0" style={{ margin: 0 }}>{message}</p> : message}
        </div>

        <div
          className="enterprise-modal-footer p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3"
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}
        >
          <button
            type="button"
            className="enterprise-button enterprise-button-secondary px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition shadow-2xs disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              color: '#334155',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`enterprise-button px-4 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50 ${getConfirmButtonClasses()}`}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            style={{
              padding: '8px 18px',
              borderRadius: '10px',
              backgroundColor: variant === 'danger' ? '#dc2626' : (variant === 'warning' ? '#d97706' : '#4f46e5'),
              color: '#ffffff',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {busy ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

