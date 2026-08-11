import React, { useState, useEffect } from 'react';
import { FiMail, FiUser, FiMessageSquare, FiSend, FiCheckCircle } from 'react-icons/fi';
import { BiSupport } from 'react-icons/bi';
import { useLottie } from "lottie-react";
import { withTranslation } from 'react-i18next';
import LoaderAnimation from '../../assets/animations/lottie-loader.json';
import { getPages, getWebsiteData, getSocialLinks, addContactMessage } from '../../firestore/dbOperations';
import HomepageFooter from '../../components/Dashboard2/elements/HomepageFooter';  
import HomepageNavbar from '../../components/Dashboard2/elements/HomepageNavbar';

const Contact = ({ user, t }) => {
  const [state, setState] = useState({
    pages: [],
    socialLinks: [],
    email: '',
    websiteDescription: '',
    websiteName: '',
    name: '',
    message: '',
    isSuccessShowed: false,
    loaded: false,
    isSubmitting: false,
  });

  const loaderOptions = {
    loop: true,
    autoplay: true,
    animationData: LoaderAnimation,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid slice',
    },
  };

  const { View } = useLottie(loaderOptions);

  useEffect(() => {
    // Apply custom styles for page
    const applyCustomStyles = () => {
      document.getElementById('root').style.overflow = 'unset';
      document.getElementById('root').style.height = 'unset';
      document.getElementsByTagName('body')[0].style.height = 'fit-content';
      document.getElementsByTagName('body')[0].style.overflow = 'unset';
      document.getElementsByTagName('html')[0].style.height = 'fit-content';
      document.getElementsByTagName('html')[0].style.overflow = 'scroll';
      document.getElementsByTagName('html')[0].style.overflowX = 'hidden';
    };

    if (window.location.pathname.substring(0, 8) === '/contact') {
      applyCustomStyles();
    }

    // Fetch data
    const fetchData = async () => {
      try {
        const [pages, websiteData, socialLinks] = await Promise.all([
          getPages(),
          getWebsiteData(),
          getSocialLinks()
        ]);

        setState(prev => ({
          ...prev,
          pages: pages || [],
          websiteName: websiteData?.title || '',
          websiteDescription: websiteData?.description || '',
          socialLinks: socialLinks || [],
          loaded: true,
        }));
      } catch (error) {
        console.error('Error fetching data:', error);
        setState(prev => ({ ...prev, loaded: true }));
      }
    };

    fetchData();
  }, []);

  const handleInputChange = (field, value) => {
    setState(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!state.email || !state.name || !state.message) {
      alert(t('contact.error.general'));
      return;
    }

    setState(prev => ({ ...prev, isSubmitting: true }));

    try {
      await addContactMessage(state.email, state.name, state.message);
      
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          isSuccessShowed: true,
          isSubmitting: false,
          email: '',
          name: '',
          message: '',
        }));
      }, 1000);
    } catch (error) {
      console.error('Error submitting message:', error);
      setState(prev => ({ ...prev, isSubmitting: false }));
      alert(t('contact.error.general'));
    }
  };

  const handleDismissSuccess = () => {
    setState(prev => ({ ...prev, isSuccessShowed: false }));
  };

  if (!state.loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
        {/* Clean loading screen */}
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-4">
            {View}
          </div>
          <p className="text-gray-600 text-sm">{t('contact.loading', 'Loading...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <HomepageNavbar user={user} />

      {/* Contact Section */}
      <section
        id="contact"
        className="py-20 scroll-mt-20 relative overflow-hidden bg-gray-50/30"
      >
        {/* Subtle Background elements - consistent with theme */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-20 right-20 w-72 h-72 bg-gradient-to-br from-blue-400/15 to-purple-500/15 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 left-20 w-96 h-96 bg-gradient-to-tr from-purple-400/10 to-pink-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 relative z-10">
          {/* Clean Header section - matching design theme */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-all duration-300 shadow-sm mb-6">
              <BiSupport className="w-4 h-4" />
              {t('contact.title')}
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 tracking-tight leading-tight">
              {t('contact.title')}
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto leading-relaxed">
              {t('contact.subtitle')}
            </p>
          </div>

          {/* Clean Success Message */}
          {state.isSuccessShowed && (
            <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-lg">
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FiCheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-800 mb-2">{t('contact.success.title')}</h2>
                  <p className="text-gray-600 mb-6 text-sm">{t('contact.success.text')}</p>
                  <button 
                    onClick={handleDismissSuccess}
                    className="px-6 py-3 bg-[#4a6cf7] text-white font-medium rounded-lg hover:bg-[#3b5ce6] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    {t('contact.success.button')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Clean Contact Form */}
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 hover:shadow-xl transition-shadow duration-300">
              <div className="p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Name Input */}
                  <div className="group/input">
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                      {t('contact.form.fullName')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <FiUser className="h-5 w-5 text-gray-400 group-focus-within/input:text-[#4a6cf7] transition-colors duration-300" />
                      </div>
                      <input
                        type="text"
                        value={state.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#4a6cf7]/50 focus:border-[#4a6cf7] focus:outline-none transition-all duration-200 bg-white text-gray-900"
                        placeholder={t('contact.form.fullNamePlaceholder')}
                        required
                      />
                    </div>
                  </div>

                  {/* Email Input */}
                  <div className="group/input">
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                      {t('contact.form.email')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <FiMail className="h-5 w-5 text-gray-400 group-focus-within/input:text-[#4a6cf7] transition-colors duration-300" />
                      </div>
                      <input
                        type="email"
                        value={state.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#4a6cf7]/50 focus:border-[#4a6cf7] focus:outline-none transition-all duration-200 bg-white text-gray-900"
                        placeholder={t('contact.form.emailPlaceholder')}
                        required
                      />
                    </div>
                  </div>

                  {/* Message Textarea */}
                  <div className="group/input">
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                      {t('contact.form.message')}
                    </label>
                    <div className="relative">
                      <div className="absolute top-4 left-4 pointer-events-none">
                        <FiMessageSquare className="h-5 w-5 text-gray-400 group-focus-within/input:text-[#4a6cf7] transition-colors duration-300" />
                      </div>
                      <textarea
                        rows={5}
                        value={state.message}
                        onChange={(e) => handleInputChange('message', e.target.value)}
                        className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#4a6cf7]/50 focus:border-[#4a6cf7] focus:outline-none transition-all duration-200 bg-white resize-none text-gray-900"
                        placeholder={t('contact.form.messagePlaceholder')}
                        required
                      />
                    </div>
                  </div>

                  {/* Clean Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={state.isSubmitting}
                      className="w-full py-3 px-6 bg-[#4a6cf7] hover:bg-[#3b5ce6] text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {state.isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          {t('contact.form.sendingButton')}
                        </>
                      ) : (
                        <>
                          <FiSend className="w-4 h-4" />
                          {t('contact.form.sendButton')}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          {/* Clean Additional Contact Info */}
          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-4 bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-blue-100/50 hover:shadow-md transition-all duration-300">
              <div className="w-10 h-10 bg-[#4a6cf7] rounded-full flex items-center justify-center text-white">
                <FiMail className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-800">{t('contact.quickResponse.title')}</div>
                <div className="text-gray-600 text-sm">{t('contact.quickResponse.text')}</div>
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* Footer */}
      <HomepageFooter />
    </div>
  );
};

const ContactWithTranslation = withTranslation('common')(Contact);
export default ContactWithTranslation;