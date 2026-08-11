import React, { useState, Component } from 'react';
import { IoClose } from 'react-icons/io5';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaTwitter, 
  FaLinkedin, 
  FaFacebook, 
  FaWhatsapp, 
  FaEnvelope,
  FaLink,
  FaCheck 
} from 'react-icons/fa';
import './ShareModal.scss';
import { useTranslation, withTranslation } from 'react-i18next';

// Class component version of ShareModal for compatibility with class components
class ShareModalClass extends Component {
  constructor(props) {
    super(props);
    this.state = {
      activeTab: 'social',
      copied: false
    };
  }

  // Create the shareable URL
  getShareableUrl() {
    return `${window.location.origin}/shared/${this.props.documentId}`;
  }

  // Handle copy to clipboard
  handleCopyClick = () => {
    navigator.clipboard.writeText(this.getShareableUrl())
      .then(() => {
        this.setState({ copied: true });
        setTimeout(() => {
          this.setState({ copied: false });
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy URL: ', err);
      });
  };

  // Set active tab
  setActiveTab = (tab) => {
    this.setState({ activeTab: tab });
  };

  // Handle social media click
  handleSocialClick = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500');
  };

  render() {
    const { isOpen, onClose, documentId, documentTitle } = this.props;
    const { t } = this.props;
    const { activeTab, copied } = this.state;
    
    if (!isOpen) return null;
    
    // Generate shareable URL
    const shareableUrl = this.getShareableUrl();
    
    // Social media sharing URLs
    const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out my resume!')}&url=${encodeURIComponent(shareableUrl)}`;
    const linkedinShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareableUrl)}`;
    const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareableUrl)}`;
    const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(`Check out my resume! ${shareableUrl}`)}`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent('Check out my resume')}&body=${encodeURIComponent(`I thought you might be interested in my resume: ${shareableUrl}`)}`;    
    
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className="share-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className="share-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="share-modal-header">
                <h3>{t('dashNew.shareDocument')}</h3>
                <button className="close-button" onClick={onClose}>
                  <IoClose />
                </button>
              </div>

              <div className="share-modal-tabs">
                <button 
                  className={`tab-button ${activeTab === 'social' ? 'active' : ''}`} 
                  onClick={() => this.setActiveTab('social')}
                >
                  {t('dashNew.social', 'Social Media')}
                </button>
                <button 
                  className={`tab-button ${activeTab === 'link' ? 'active' : ''}`} 
                  onClick={() => this.setActiveTab('link')}
                >
                  {t('dashNew.link', 'Link')}
                </button>
              </div>

              <div className="share-modal-content">
                {activeTab === 'social' && (
                  <div className="social-share-section">
                    <p className="social-share-description">{t('dashNew.socialShareDescription', 'Share your resume on social media platforms')}</p>
                    
                    <div className="social-buttons">
                      <button 
                        className="social-button twitter"
                        onClick={() => this.handleSocialClick(twitterShareUrl)}
                      >
                        <FaTwitter />
                        <span>Twitter</span>
                      </button>
                      <button 
                        className="social-button linkedin"
                        onClick={() => this.handleSocialClick(linkedinShareUrl)}
                      >
                        <FaLinkedin />
                        <span>LinkedIn</span>
                      </button>
                      <button 
                        className="social-button facebook"
                        onClick={() => this.handleSocialClick(facebookShareUrl)}
                      >
                        <FaFacebook />
                        <span>Facebook</span>
                      </button>
                      <button 
                        className="social-button whatsapp"
                        onClick={() => this.handleSocialClick(whatsappShareUrl)}
                      >
                        <FaWhatsapp />
                        <span>WhatsApp</span>
                      </button>
                      <button 
                        className="social-button email"
                        onClick={() => this.handleSocialClick(mailtoUrl)}
                      >
                        <FaEnvelope />
                        <span>Email</span>
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'link' && (
                  <div className="link-share-section">
                    <p className="link-share-description">{t('dashNew.linkDesc')}</p>
                    
                    <div className="link-input-container">
                      <div className="link-input-wrapper">
                        <span className="link-icon"><FaLink /></span>
                        <input 
                          type="text" 
                          value={shareableUrl} 
                          readOnly 
                          className="link-input"
                          onClick={(e) => e.target.select()}
                        />
                      </div>
                      <button 
                        className={`copy-button ${copied ? 'copied' : ''}`}
                        onClick={this.handleCopyClick}
                      >
                        {copied ? (
                          <>
                            <FaCheck />
                            <span>{t('dashNew.copied')}</span>
                          </>
                        ) : (
                          <span>{t('dashNew.copy')}</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
}

// Functional component version with hooks
const ShareModal = ({ isOpen, onClose, documentId, documentTitle }) => {
  const [activeTab, setActiveTab] = useState('social');
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation('common');
  
  // Create the shareable URL
  const shareableUrl = `${window.location.origin}/shared/${documentId}`;
  
  // Handle copy to clipboard
  const handleCopyClick = () => {
    navigator.clipboard.writeText(shareableUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy URL: ', err);
      });
  };

  // Social media sharing URLs
  const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out my resume!')}&url=${encodeURIComponent(shareableUrl)}`;
  const linkedinShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareableUrl)}`;
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareableUrl)}`;
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(`Check out my resume! ${shareableUrl}`)}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent('Check out my resume')}&body=${encodeURIComponent(`I thought you might be interested in my resume: ${shareableUrl}`)}`;

  // Handle social media click
  const handleSocialClick = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="share-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div 
            className="share-modal"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="share-modal-header">
              <h3>{t('dashNew.shareDocument')}</h3>
              <button className="close-button" onClick={onClose}>
                <IoClose />
              </button>
            </div>

            <div className="share-modal-tabs">
              <button 
                className={`tab-button ${activeTab === 'social' ? 'active' : ''}`} 
                onClick={() => setActiveTab('social')}
              >
                {t('dashNew.social', 'Social Media')}
              </button>
              <button 
                className={`tab-button ${activeTab === 'link' ? 'active' : ''}`} 
                onClick={() => setActiveTab('link')}
              >
                {t('dashNew.link', 'Link')}
              </button>
            </div>

            <div className="share-modal-content">
              {activeTab === 'social' && (
                <div className="social-share-section">
                  <p className="social-share-description">{t('dashNew.socialShareDescription', 'Share your resume on social media platforms')}</p>
                  
                  <div className="social-buttons">
                    <button 
                      className="social-button twitter"
                      onClick={() => handleSocialClick(twitterShareUrl)}
                    >
                      <FaTwitter />
                      <span>Twitter</span>
                    </button>
                    <button 
                      className="social-button linkedin"
                      onClick={() => handleSocialClick(linkedinShareUrl)}
                    >
                      <FaLinkedin />
                      <span>LinkedIn</span>
                    </button>
                    <button 
                      className="social-button facebook"
                      onClick={() => handleSocialClick(facebookShareUrl)}
                    >
                      <FaFacebook />
                      <span>Facebook</span>
                    </button>
                    <button 
                      className="social-button whatsapp"
                      onClick={() => handleSocialClick(whatsappShareUrl)}
                    >
                      <FaWhatsapp />
                      <span>WhatsApp</span>
                    </button>
                    <button 
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
                  <p className="link-share-description">{t('dashNew.linkDesc')}</p>
                  
                  <div className="link-input-container">
                    <div className="link-input-wrapper">
                      <span className="link-icon"><FaLink /></span>
                      <input 
                        type="text" 
                        value={shareableUrl} 
                        readOnly 
                        className="link-input"
                        onClick={(e) => e.target.select()}
                      />
                    </div>
                    <button 
                      className={`copy-button ${copied ? 'copied' : ''}`}
                      onClick={handleCopyClick}
                    >
                      {copied ? (
                        <>
                          <FaCheck />
                          <span>{t('dashNew.copied')}</span>
                        </>
                      ) : (
                        <span>{t('dashNew.copy')}</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Export the class component with translation HOC for use in class components
const TranslatedShareModalClass = withTranslation('common')(ShareModalClass);

// Export the functional component as default
export default ShareModal;
export { TranslatedShareModalClass as ShareModalClass };
