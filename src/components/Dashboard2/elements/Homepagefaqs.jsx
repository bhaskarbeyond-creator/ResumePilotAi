import { FaSearch, FaChevronDown, FaBookOpen, FaLightbulb, FaSmile, FaCog, FaUserShield, FaHeart, FaRocket, FaFilter, FaTimes } from 'react-icons/fa';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const Homepagefaqs = () => {
  const { t } = useTranslation('common');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [openFAQ, setOpenFAQ] = useState(null);
  const [isVisible, setIsVisible] = useState({});
  const [showCategories, setShowCategories] = useState(false);
  const sectionRef = useRef(null);

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.getAttribute('data-animate');
          if (entry.isIntersecting) {
            setIsVisible(prev => ({ ...prev, [id]: true }));
          }
        });
      },
      { threshold: 0.1, rootMargin: '50px' }
    );

    const elements = sectionRef.current?.querySelectorAll('[data-animate]');
    elements?.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const categories = [
    { id: 'all', name: t('Homepagefaqs.categoryNames.allQuestions'), icon: FaBookOpen },
    { id: 'getting-started', name: t('Homepagefaqs.categoryNames.gettingStarted'), icon: FaRocket },
    { id: 'features', name: t('Homepagefaqs.categoryNames.features'), icon: FaSmile },
    { id: 'billing', name: t('Homepagefaqs.categoryNames.billing'), icon: FaCog },
    { id: 'technical', name: t('Homepagefaqs.categoryNames.technical'), icon: FaUserShield }
  ];

  const faqData = [
    {
      id: 1,
      category: 'getting-started',
      icon: "🚀",
      question: t('Homepagefaqs.q1.question', "How do I get started with AI resume generation?"),
      answer: t('Homepagefaqs.q1.answer', "Create an account, open the resume builder, enter information you have verified, choose a layout, and review the preview before saving or exporting. AI assistance is optional and may be unavailable when the module is disabled."),
      tags: ['beginner', 'signup', 'editor'],
      helpful: 0,
      notHelpful: 0
    },
    {
      id: 2,
      category: 'features',
      icon: "⚡",
      question: t('Homepagefaqs.q2.question', "Does AI assistance guarantee an interview or job?"),
      answer: t('Homepagefaqs.q2.answer', "No. AI output can be incomplete or inaccurate and does not guarantee ATS acceptance, an interview, or employment. Review and edit every suggestion before using it."),
      tags: ['ai', 'limitations', 'accuracy'],
      helpful: 0,
      notHelpful: 0
    },
    {
      id: 3,
      category: 'billing',
      icon: "💎",
      question: t('Homepagefaqs.q3.question', "Where can I see current plan limits and pricing?"),
      answer: t('Homepagefaqs.q3.answer', "Open the pricing page for the current server-provided plans, entitlements, taxes, and payment options. Availability can change by account and operator configuration."),
      tags: ['pricing', 'plans', 'entitlements'],
      helpful: 0,
      notHelpful: 0
    },
    {
      id: 4,
      category: 'features',
      icon: "🎨",
      question: t('Homepagefaqs.q4.question', "Can I customize the generated resumes?"),
      answer: t('Homepagefaqs.q4.answer', "Yes. You can edit resume sections, choose an available layout, and review the rendered preview. AI suggestions remain editable and should be checked for accuracy."),
      tags: ['customization', 'layouts', 'preview'],
      helpful: 0,
      notHelpful: 0
    },
    {
      id: 5,
      category: 'technical',
      icon: "📁",
      question: t('Homepagefaqs.q5.question', "What file formats do you provide?"),
      answer: t('Homepagefaqs.q5.answer', "PDF and DOCX exports are offered where the relevant export route and account entitlement are available. Always inspect the downloaded file before submitting it."),
      tags: ['formats', 'pdf', 'word', 'fonts'],
      helpful: 0,
      notHelpful: 0
    },
    {
      id: 6,
      category: 'billing',
      icon: "🔄",
      question: t('Homepagefaqs.q6.question', "How are drafts and account data stored?"),
      answer: t('Homepagefaqs.q6.answer', "Firebase Authentication manages identity. Resume drafts and other application data are stored through the MariaDB-backed API. Review the privacy policy and account export or deletion controls for more information."),
      tags: ['privacy', 'storage', 'account'],
      helpful: 0,
      notHelpful: 0
    }
  ];

  const filteredFAQs = faqData.filter(faq => {
    const matchesSearch = faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         faq.answer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         faq.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleFAQ = (id) => {
    setOpenFAQ(openFAQ === id ? null : id);
  };

  return (
    <>
      <section
        ref={sectionRef}
        id="faqs"
        className="py-20 scroll-mt-20 relative bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 overflow-hidden"
      >
        {/* Animated Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-20 left-10 w-32 h-32 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-24 h-24 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-full blur-xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-40 left-1/4 w-40 h-40 bg-gradient-to-br from-indigo-400/15 to-purple-400/15 rounded-full blur-2xl animate-pulse delay-500"></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          {/* Header */}
          <div className="text-center mb-16">
            <div
              data-animate="header-badge"
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#4a6cf7] bg-[#4a6cf7]/10 border border-[#4a6cf7]/20 rounded-full backdrop-blur-sm hover:bg-[#4a6cf7]/15 transition-all duration-300 shadow-sm transform transition-all duration-700 ${
                isVisible['header-badge'] ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
              }`}
            >
              <FaLightbulb className="w-4 h-4 animate-pulse" />
              {t('Homepagefaqs.badge')}
            </div>
            
            <h2
              data-animate="header-title"
              className={`text-4xl md:text-6xl font-bold text-gray-900 mb-6 tracking-tight transform transition-all duration-700 delay-200 ${
                isVisible['header-title'] ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
              }`}
            >
              {t('Homepagefaqs.header').split(' ').map((word, i) => 
                i === 1 ? (
                  <span key={i} className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 animate-gradient-x">
                    {word}
                  </span>
                ) : (
                  <span key={i}>{word}{i < t('Homepagefaqs.header').split(' ').length - 1 ? ' ' : ''}</span>
                )
              )}
            </h2>
            
            <p
              data-animate="header-subtitle"
              className={`text-gray-600 text-xl max-w-3xl mx-auto leading-relaxed mb-8 transform transition-all duration-700 delay-300 ${
                isVisible['header-subtitle'] ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
              }`}
            >
              {t('Homepagefaqs.subtitle')}
            </p>

          </div>

          {/* Search and Filter Section */}
          <div
            data-animate="search-section"
            className={`max-w-4xl mx-auto mb-12 transform transition-all duration-700 delay-500 ${
              isVisible['search-section'] ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
          >
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-xl border border-white/50">
              {/* Search Bar */}
              <div className="relative mb-6">
                <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder={t('Homepagefaqs.search.placeholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50/50 rounded-2xl border border-gray-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300 text-gray-700 placeholder-gray-400"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                  >
                    <FaTimes className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setShowCategories(!showCategories)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-xl font-medium hover:bg-indigo-200 transition-all duration-300"
                >
                  <FaFilter className="w-4 h-4" />
                  {t('Homepagefaqs.search.categories')}
                  <FaChevronDown className={`w-4 h-4 transition-transform duration-300 ${showCategories ? 'rotate-180' : ''}`} />
                </button>
                
                {(showCategories ? categories : categories.slice(0, 3)).map((category) => {
                  const IconComponent = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-300 ${
                        selectedCategory === category.id
                          ? 'bg-indigo-600 text-white shadow-lg'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                      {category.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* FAQ Grid */}
          <div className="grid lg:grid-cols-2 gap-6 max-w-6xl mx-auto mb-16">
            {filteredFAQs.length > 0 ? (
              filteredFAQs.map((faq, index) => (
                <div
                  key={faq.id}
                  data-animate={`faq-${faq.id}`}
                  className={`bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-500 border border-white/50 group overflow-hidden transform hover:-translate-y-1 ${
                    isVisible[`faq-${faq.id}`] ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                  }`}
                  style={{ transitionDelay: `${index * 100 + 600}ms` }}
                >
                  <div className="p-6">
                    <button
                      onClick={() => toggleFAQ(faq.id)}
                      className="flex items-start justify-between gap-4 w-full text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded-lg"
                      aria-expanded={openFAQ === faq.id}
                    >
                      <div className="flex items-start gap-4 flex-1">
                        <div className="text-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white w-14 h-14 flex items-center justify-center rounded-2xl flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300 relative overflow-hidden">
                          <span className="relative z-10">{faq.icon}</span>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors duration-300 mb-2">
                            {faq.question}
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {faq.tags.slice(0, 2).map((tag) => (
                              <span key={tag} className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-1 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
                        openFAQ === faq.id 
                          ? 'bg-indigo-100 text-indigo-600 rotate-180' 
                          : 'bg-gray-100 group-hover:bg-indigo-100 text-gray-500 group-hover:text-indigo-600'
                      }`}>
                        <FaChevronDown className="w-5 h-5 transition-all duration-300" />
                      </div>
                    </button>
                    
                    <div className={`overflow-hidden transition-all duration-500 ease-in-out ${
                      openFAQ === faq.id ? 'max-h-96 opacity-100 mt-6' : 'max-h-0 opacity-0'
                    }`}>
                      <div className="pl-18 relative">
                        <div className="bg-gradient-to-br from-indigo-50/80 to-purple-50/50 p-6 rounded-2xl border border-indigo-100/50">
                          <p className="text-gray-700 leading-relaxed text-base mb-6">
                            {faq.answer}
                          </p>
                          
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-12">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{t('Homepagefaqs.noResults.title')}</h3>
                <p className="text-gray-500">{t('Homepagefaqs.noResults.message')}</p>
              </div>
            )}
          </div>

          {/* Contact Support Section */}
          <div
            data-animate="contact-section"
            className={`text-center transform transition-all duration-700 delay-700 ${
              isVisible['contact-section'] ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
          >
            <div className="bg-gradient-to-br from-white/60 via-white/80 to-indigo-50/60 backdrop-blur-sm rounded-3xl p-8 border border-white/50 shadow-xl max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <h4 className="text-2xl font-bold text-gray-800 mb-3">{t('Homepagefaqs.contactSupport.title')}</h4>
                <p className="text-gray-600 mb-6">{t('Homepagefaqs.contactSupport.description')}</p>
                <div className="flex items-center justify-center gap-4">
                  <a 
                    href="/contact" 
                    className="font-medium text-sm px-5 py-2.5 rounded-lg shadow-sm text-white bg-gradient-to-r from-[#4a6cf7] to-[#4a6cf7]/90 hover:shadow-[#4a6cf7]/20 hover:shadow-lg transition-all duration-300"
                  >
                    {t('Homepagefaqs.contactSupport.contactButton')}
                  </a>
                  <a 
                    href="/blog" 
                    className="font-medium text-sm px-5 py-2.5 rounded-lg shadow-sm text-[#4a6cf7] border border-[#4a6cf7]/20 hover:bg-[#4a6cf7]/10 transition-all duration-300"
                  >
                    {t('Homepagefaqs.contactSupport.docsButton')}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Enhanced CTA Section */}
      <section className="py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 rounded-3xl shadow-2xl">
            {/* Background Pattern */}
            <div className="absolute inset-0">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
              <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-0 right-0 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
            </div>
            
            <div className="px-8 py-12 md:px-16 md:py-16 relative z-10">
              <div className="text-center max-w-4xl mx-auto">
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-purple-200 px-6 py-3 rounded-full text-sm font-medium mb-8">
                  <FaRocket className="w-4 h-4 animate-bounce" />
                  {t('Homepagefaqs.cta.badge')}
                </div>
                
                <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight mb-6">
                  {t('Homepagefaqs.cta.title')}
                </h2>
                
                <p className="text-gray-300 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-8">
                  {t('Homepagefaqs.cta.description')}
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
                  <a
                    className="inline-flex items-center justify-center px-8 py-4 bg-white text-indigo-900 font-semibold rounded-2xl shadow-lg hover:bg-gray-50 transition-all duration-300 transform hover:scale-105 group"
                    href="/login"
                  >
                    {t('HomepageHero.createResume')}
                    <FaRocket className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                  </a>

                </div>

                {/* Trust indicators */}
                <div className="flex items-center justify-center gap-8 text-white/60 text-sm">
                  <div className="flex items-center gap-2">
                    <FaUserShield className="w-4 h-4" />
                    {t('Homepagefaqs.cta.secure', 'Review before export')}
                  </div>
                  <div className="flex items-center gap-2">
                    <FaSmile className="w-4 h-4" />
                    {t('Homepagefaqs.cta.instant', 'Optional AI assistance')}
                  </div>
                  <div className="flex items-center gap-2">
                    <FaHeart className="w-4 h-4" />
                    {t('Homepagefaqs.cta.support', 'Account-based drafts')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <style>{`
        @keyframes gradient-x {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 4s ease infinite;
        }
      `}</style>
    </>
  );
};

export default Homepagefaqs;