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
  if (!isOpen) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !busy) onClose();
  };

  const getIcon = () => {
    if (variant === 'danger') return <FiAlertTriangle style={{ color: 'var(--ep-rose-600)', fontSize: '1.4rem' }} />;
    if (variant === 'warning') return <FiAlertTriangle style={{ color: 'var(--ep-amber-600)', fontSize: '1.4rem' }} />;
    return <FiInfo style={{ color: 'var(--ep-brand-600)', fontSize: '1.4rem' }} />;
  };

  const getButtonClass = () => {
    if (variant === 'danger') return 'enterprise-button enterprise-button-danger';
    if (variant === 'warning') return 'enterprise-button enterprise-button-secondary';
    return 'enterprise-button enterprise-button-primary';
  };

  return (
    <div
      className="enterprise-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => !busy && onClose()}
      onKeyDown={handleKeyDown}
      style={{ zIndex: 100000 }}
    >
      <div
        className="enterprise-modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '480px', width: '100%', borderRadius: '16px', overflow: 'hidden' }}
      >
        <div className="enterprise-modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--ep-slate-200)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: variant === 'danger' ? 'var(--ep-rose-50)' : (variant === 'warning' ? 'var(--ep-amber-50)' : 'var(--ep-brand-50)'),
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {getIcon()}
            </div>
            <h3 id="confirm-dialog-title" className="enterprise-modal-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="enterprise-modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--ep-slate-400)' }}
          >
            <FiX />
          </button>
        </div>

        <div className="enterprise-modal-body" style={{ padding: '20px 24px', fontSize: '0.92rem', color: 'var(--ep-slate-600)', lineHeight: 1.55 }}>
          {typeof message === 'string' ? <p style={{ margin: 0 }}>{message}</p> : message}
        </div>

        <div className="enterprise-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 24px', background: 'var(--ep-slate-50)', borderTop: '1px solid var(--ep-slate-200)' }}>
          <button
            type="button"
            className="enterprise-button enterprise-button-secondary"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={getButtonClass()}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
