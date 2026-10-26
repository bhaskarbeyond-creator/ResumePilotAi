import React, { useState, useEffect, useRef } from 'react';
import { FiMail, FiUser, FiMessageSquare, FiSend, FiCheckCircle } from 'react-icons/fi';
import { BiSupport } from 'react-icons/bi';
import { useLottie } from "lottie-react";
import { withTranslation } from 'react-i18next';
import LoaderAnimation from '../../assets/animations/lottie-loader.json';
import { getPages, getWebsiteData, getSocialLinks, addContactMessage } from '../../services/api/platform';
import HomepageFooter from '../Marketing/elements/HomepageFooter';
import HomepageNavbar from '../Marketing/elements/HomepageNavbar';
// DIR-031: the public lead form validates against the SAME bounds the server enforces
// (see src/utils/contactFormValidation.js and backend `app.post('/api/contact')`).
import { CONTACT_FIELD_LIMITS, validateContactForm } from '../../utils/contactFormValidation';

const Contact = ({ t }) => {
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

  // DIR-031: per-field validation messages plus a form-level submit failure.
  // These replace the previous `alert()` calls, which are a WCAG 2.1 failure: an
  // alert steals focus, cannot be announced reliably by a screen reader, and is
  // silently discarded by assistive tech that suppresses modal dialogs.
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  // DOM handles for the three fields so a failed submit can move focus to the first
  // invalid control (WCAG 2.1 AA — identification of errors).
  const formRefs = useRef({});

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
    // Apply custom styles for page.
    // DIR-031: the previous version mutated #root/body/html inline styles and never
    // restored them, so every one of those properties leaked into whatever component
    // rendered next. That is a real cross-route defect: a visitor who opened /contact
    // and then navigated to the resume builder inherited `overflow: scroll` on <html>
    // and `height: fit-content` on <body>. We now capture the previous inline value of
    // every property we touch and restore it in the effect cleanup.
    const root = document.getElementById('root');
    const body = document.getElementsByTagName('body')[0];
    const html = document.getElementsByTagName('html')[0];
    const targets = [
      [root, ['overflow', 'height']],
      [body, ['height', 'overflow']],
      [html, ['height', 'overflow', 'overflowX']],
    ];
    const previous = targets
      .filter(([element]) => element)
      .map(([element, properties]) => [element, properties.map((property) => [property, element.style[property]])]);

    const applyCustomStyles = () => {
      if (root) {
        root.style.overflow = 'unset';
        root.style.height = 'unset';
      }
      if (body) {
        body.style.height = 'fit-content';
        body.style.overflow = 'unset';
      }
      if (html) {
        html.style.height = 'fit-content';
        html.style.overflow = 'scroll';
        html.style.overflowX = 'hidden';
      }
    };

    if (window.location.pathname.substring(0, 8) === '/contact') {
      applyCustomStyles();
    }

    // Fetch data
    const fetchData = async () => {
      try {
        const [pages, websiteData, socialLinks] = await Promise.all([
          getPages().catch(() => []),
          getWebsiteData().catch(() => null),
          getSocialLinks().catch(() => null)
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
        console.warn('Contact metadata fetch handled non-fatal error:', error?.message);
        setState(prev => ({ ...prev, loaded: true }));
      }
    };

    fetchData();

    // Restore every inline property this effect mutated so the page-level styles do
    // not leak into the next route.
    return () => {
      for (const [element, properties] of previous) {
        for (const [property, value] of properties) element.style[property] = value;
      }
    };
  }, []);

  const handleInputChange = (field, value) => {
    setState(prev => ({
      ...prev,
      [field]: value,
    }));
    // Clear this field's error as soon as the visitor edits it, so a stale message
    // never contradicts what is currently on screen.
    setFieldErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // DIR-031: client-side validation mirrors the server contract exactly, so an
    // over-long or malformed payload is rejected before it is transmitted instead of
    // after a wasted round trip. The server remains authoritative; this is defence in
    // depth and a fast, accessible feedback loop.
    const { valid, values, errors } = validateContactForm({
      email: state.email,
      name: state.name,
      message: state.message,
    });
    setFieldErrors(errors);
    setSubmitError('');
    if (!valid) {
      // Move focus to the first invalid control so keyboard and screen-reader users
      // are taken straight to the problem rather than left wondering why nothing
      // happened.
      const firstInvalid = ['name', 'email', 'message'].find((field) => errors[field]);
      if (firstInvalid) formRefs.current[firstInvalid]?.focus();
      return;
    }

    setState(prev => ({ ...prev, isSubmitting: true }));

    try {
      // `values` are already trimmed/lower-cased and script-URI-stripped by
      // validateContactForm, so exactly what was validated is what is transmitted.
      // DIR-031 removed the hardcoded `setTimeout(..., 1000)` that used to sit here:
      // simulated latency violates the zero-simulated-latency invariant and made the
      // form feel broken on a slow connection. The awaited promise IS the real signal.
      const result = await addContactMessage(values.email, values.name, values.message);
      // `addContactMessage` resolves with `{ success: false, error }` on failure
      // instead of rejecting, so the resolved value must be inspected as well.
      if (result && result.success === false) {
        throw new Error(result.error || 'Submission failed');
      }

      setState(prev => ({
        ...prev,
        isSuccessShowed: true,
        isSubmitting: false,
        email: '',
        name: '',
        message: '',
      }));
      setFieldErrors({});
    } catch (error) {
      console.error('Error submitting message:', error);
      setState(prev => ({ ...prev, isSubmitting: false }));
      // Non-blocking inline error, announced politely to assistive technology.
      setSubmitError(t('contact.error.general'));
    }
  };

  const handleDismissSuccess = () => {
    setState(prev => ({ ...prev, isSuccessShowed: false }));
  };

  if (!state.loaded) {
    return (
    <div className="container py-5 card bs-card-executive min-h-screen flex items-center justify-center bg-gray-50/50">
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
    <div className="min-h-screen rp-public-site">
      {/* Navbar */}
      <HomepageNavbar />

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
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 tracking-tight leading-tight">
              {t('contact.title')}
            </h1>
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
                    <label htmlFor="contact-name" className="block text-sm font-semibold text-gray-700 mb-3">
                      {t('contact.form.fullName')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <FiUser className="h-5 w-5 text-gray-400 group-focus-within/input:text-[#4a6cf7] transition-colors duration-300" />
                      </div>
                      <input
                        id="contact-name"
                        name="name"
                        type="text"
                        value={state.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        ref={(node) => { formRefs.current.name = node; }}
                        minLength={CONTACT_FIELD_LIMITS.NAME_MIN}
                        maxLength={CONTACT_FIELD_LIMITS.NAME_MAX}
                        autoComplete="name"
                        aria-invalid={fieldErrors.name ? 'true' : undefined}
                        aria-describedby={fieldErrors.name ? 'contact-name-error' : undefined}
                        className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#4a6cf7]/50 focus:border-[#4a6cf7] focus:outline-none transition-all duration-200 bg-white text-gray-900"
                        placeholder={t('contact.form.fullNamePlaceholder')}
                        required
                      />
                    </div>
                    {fieldErrors.name && (
                      <p id="contact-name-error" role="alert" className="mt-2 text-sm text-red-600">
                        {t(fieldErrors.name)}
                      </p>
                    )}
                  </div>

                  {/* Email Input */}
                  <div className="group/input">
                    <label htmlFor="contact-email" className="block text-sm font-semibold text-gray-700 mb-3">
                      {t('contact.form.email')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <FiMail className="h-5 w-5 text-gray-400 group-focus-within/input:text-[#4a6cf7] transition-colors duration-300" />
                      </div>
                      <input
                        id="contact-email"
                        name="email"
                        type="email"
                        value={state.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        ref={(node) => { formRefs.current.email = node; }}
                        maxLength={CONTACT_FIELD_LIMITS.EMAIL_MAX}
                        autoComplete="email"
                        aria-invalid={fieldErrors.email ? 'true' : undefined}
                        aria-describedby={fieldErrors.email ? 'contact-email-error' : undefined}
                        className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#4a6cf7]/50 focus:border-[#4a6cf7] focus:outline-none transition-all duration-200 bg-white text-gray-900"
                        placeholder={t('contact.form.emailPlaceholder')}
                        required
                      />
                    </div>
                    {fieldErrors.email && (
                      <p id="contact-email-error" role="alert" className="mt-2 text-sm text-red-600">
                        {t(fieldErrors.email)}
                      </p>
                    )}
                  </div>

                  {/* Message Textarea */}
                  <div className="group/input">
                    <label htmlFor="contact-message" className="block text-sm font-semibold text-gray-700 mb-3">
                      {t('contact.form.message')}
                    </label>
                    <div className="relative">
                      <div className="absolute top-4 left-4 pointer-events-none">
                        <FiMessageSquare className="h-5 w-5 text-gray-400 group-focus-within/input:text-[#4a6cf7] transition-colors duration-300" />
                      </div>
                      <textarea
                        id="contact-message"
                        name="message"
                        rows={5}
                        value={state.message}
                        onChange={(e) => handleInputChange('message', e.target.value)}
                        ref={(node) => { formRefs.current.message = node; }}
                        minLength={CONTACT_FIELD_LIMITS.MESSAGE_MIN}
                        maxLength={CONTACT_FIELD_LIMITS.MESSAGE_MAX}
                        aria-invalid={fieldErrors.message ? 'true' : undefined}
                        aria-describedby={fieldErrors.message ? 'contact-message-error' : 'contact-message-hint'}
                        className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#4a6cf7]/50 focus:border-[#4a6cf7] focus:outline-none transition-all duration-200 bg-white resize-none text-gray-900"
                        placeholder={t('contact.form.messagePlaceholder')}
                        required
                      />
                    </div>
                    {fieldErrors.message ? (
                      <p id="contact-message-error" role="alert" className="mt-2 text-sm text-red-600">
                        {t(fieldErrors.message)}
                      </p>
                    ) : (
                      <p id="contact-message-hint" className="mt-2 text-xs text-gray-500">
                        {`${CONTACT_FIELD_LIMITS.MESSAGE_MIN}–${CONTACT_FIELD_LIMITS.MESSAGE_MAX} characters`}
                      </p>
                    )}
                  </div>

                  {/* Non-blocking submit failure — replaces the previous alert() */}
                  {submitError && (
                    <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                      {submitError}
                    </p>
                  )}

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