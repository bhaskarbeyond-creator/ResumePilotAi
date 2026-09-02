import React, { useState, useEffect, useRef, Component } from 'react';
import { IoClose } from 'react-icons/io5';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTwitter, FaLinkedin, FaFacebook, FaWhatsapp, FaEnvelope, FaLink, FaCheck, FaExternalLinkAlt } from 'react-icons/fa';
import './ShareModal.scss';
import { useTranslation, withTranslation } from 'react-i18next';

/**
 * ShareModal
 *
 * Authoritative, accessible share dialog for public resume links.
 * Provides social sharing, direct link copying, and live public preview.
 */
const ShareModal = ({ isOpen, onClose, documentId, documentTitle }) => {
  const [activeTab, setActiveTab] = useState('social');
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation('common');
  const modalRef = useRef(null);
  const copyBtnRef = useRef(null);
  const returnFocusRef = useRef(null);

  // Body scroll locking and focus management
  useEffect(() => {
    if (!isOpen) return undefined;

    document.body.style.overflow = 'hidden';
    returnFocusRef.current = document.activeElement;

    const timer = setTimeout(() => {
      copyBtnRef.current?.focus();
    }, 50);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = 'unset';
      returnFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  // Keyboard accessibility: Escape key and focus trap
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !documentId) return null;

  // Create authoritative canonical shareable URL
  const shareableUrl = `${window.location.origin}/shared/${documentId}`;
  const shareTitle = documentTitle || t('dashNew.myResume', 'My Resume');

  // Handle copy to clipboard with optimistic instant UI feedback
  const handleCopyClick = () => {
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareableUrl).catch((err) => {
        console.warn('Clipboard write restricted in current context: ', err);
      });
    }
  };

  // Social media sharing URLs
  const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out my resume (${shareTitle})!`)}&url=${encodeURIComponent(shareableUrl)}`;
  const linkedinShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareableUrl)}`;
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareableUrl)}`;
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(`Check out my resume (${shareTitle})! ${shareableUrl}`)}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(`Resume - ${shareTitle}`)}&body=${encodeURIComponent(`I thought you might be interested in my resume: ${shareableUrl}`)}`;

  const handleSocialClick = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500');
  };

  return (
    <AnimatePresence>
      <div 
        className="share-modal-overlay"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        <motion.div 
          ref={modalRef}
          className="share-modal"
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="share-modal-header">
            <div>
              <h3 id="share-modal-title">{t('dashNew.shareDocument', 'Share Resume')}</h3>
              {documentTitle && (
                <p className="text-xs text-slate-500 mt-0.5 font-normal truncate max-w-xs">{documentTitle}</p>
              )}
            </div>
            <button
              type="button"
              className="close-button"
              onClick={onClose}
              aria-label="Close share dialog"
            >
              <IoClose />
            </button>
          </div>

          <div className="share-modal-tabs">
            <button 
              type="button"
              className={`tab-button ${activeTab === 'social' ? 'active' : ''}`} 
              onClick={() => setActiveTab('social')}
            >
              {t('dashNew.social', 'Social Media')}
            </button>
            <button 
              type="button"
              className={`tab-button ${activeTab === 'link' ? 'active' : ''}`} 
              onClick={() => setActiveTab('link')}
            >
              {t('dashNew.link', 'Link')}
            </button>
          </div>

          <div className="share-modal-content">
            {activeTab === 'social' && (
              <div className="social-share-section">
                <p className="social-share-description">
                  {t('dashNew.socialShareDescription', 'Share your resume on social media platforms')}
                </p>
                
                <div className="social-buttons">
                  <button 
                    type="button"
                    className="social-button twitter"
                    onClick={() => handleSocialClick(twitterShareUrl)}
                  >
                    <FaTwitter />
                    <span>Twitter / X</span>
                  </button>
                  <button 
                    type="button"
                    className="social-button linkedin"
                    onClick={() => handleSocialClick(linkedinShareUrl)}
                  >
                    <FaLinkedin />
                    <span>LinkedIn</span>
                  </button>
                  <button 
                    type="button"
                    className="social-button facebook"
                    onClick={() => handleSocialClick(facebookShareUrl)}
                  >
                    <FaFacebook />
                    <span>Facebook</span>
                  </button>
                  <button 
                    type="button"
                    className="social-button whatsapp"
                    onClick={() => handleSocialClick(whatsappShareUrl)}
                  >
                    <FaWhatsapp />
                    <span>WhatsApp</span>
                  </button>
                  <button 
                    type="button"
                    className="social-button email"
                    onClick={() => handleSocialClick(mailtoUrl)}
                  >
                    <FaEnvelope />
                    <span>Email</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'link' && (
              <div className="link-share-section">
                <p className="link-share-description">
                  {t('dashNew.linkDesc', 'Anyone with this link can view your published resume in high fidelity.')}
                </p>
                
                <div className="link-input-container">
                  <div className="link-input-wrapper">
                    <span className="link-icon"><FaLink /></span>
                    <input 
                      type="text" 
                      value={shareableUrl} 
                      readOnly 
                      className="link-input"
                      onClick={(e) => e.target.select()}
                      aria-label="Shareable resume link"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      ref={copyBtnRef}
                      type="button"
                      className={`copy-button ${copied ? 'copied' : ''}`}
                      onClick={handleCopyClick}
                    >
                      {copied ? (
                        <>
                          <FaCheck />
                          <span>{t('dashNew.copied', 'Copied!')}</span>
                        </>
                      ) : (
                        <span>{t('dashNew.copy', 'Copy')}</span>
                      )}
                    </button>
                    <a
                      href={shareableUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="open-button"
                      title="Open public resume in a new tab"
                    >
                      <FaExternalLinkAlt className="w-3 h-3" />
                      <span>Open</span>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// Class component version for compatibility with class components
class ShareModalClass extends Component {
  render() {
    return <ShareModal {...this.props} />;
  }
}

const TranslatedShareModalClass = withTranslation('common')(ShareModalClass);

export default ShareModal;
export { TranslatedShareModalClass as ShareModalClass };
