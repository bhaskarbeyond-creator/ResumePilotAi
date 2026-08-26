import { FaSearch, FaChevronDown, FaThumbsUp, FaThumbsDown, FaBookOpen, FaLightbulb, FaSmile, FaCog, FaUserShield, FaHeart, FaRocket, FaStar, FaFilter, FaTimes } from 'react-icons/fa';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const Homepagefaqs = () => {
  const { t } = useTranslation('common');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [openFAQ, setOpenFAQ] = useState(null);
  const [isVisible, setIsVisible] = useState({});
  const [helpfulVotes, setHelpfulVotes] = useState({});
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
    { id: 'all', name: t('Homepagefaqs.categoryNames.allQuestions'), icon: FaBookOpen, count: 12 },
    { id: 'getting-started', name: t('Homepagefaqs.categoryNames.gettingStarted'), icon: FaRocket, count: 4 },
    { id: 'features', name: t('Homepagefaqs.categoryNames.features'), icon: FaSmile, count: 3 },
    { id: 'billing', name: t('Homepagefaqs.categoryNames.billing'), icon: FaCog, count: 3 },
    { id: 'technical', name: t('Homepagefaqs.categoryNames.technical'), icon: FaUserShield, count: 2 }
  ];

  const faqData = [
    {
      id: 1,
      category: 'getting-started',
      icon: "🚀",
      priority: 'high',
      question: t('Homepagefaqs.q1.question', "How do I get started with AI resume generation?"),
      answer: t('Homepagefaqs.q1.answer', "Getting started is incredibly simple! Just sign up for a free account, and you'll instantly receive 3 free credits. Then, enter your information, select your industry, and watch our AI create stunning resumes in seconds. No design experience needed!"),
      tags: ['beginner', 'signup', 'free-credits'],
      helpful: 0,
      notHelpful: 0
    },
    {
      id: 2,
      category: 'features',
      icon: "⚡",
      priority: 'high',
      question: t('Homepagefaqs.q2.question', "How fast is the resume generation process?"),
      answer: t('Homepagefaqs.q2.answer', "Our AI generates multiple resume variations in under 5 minutes! What traditionally takes days or weeks with traditional designers happens instantly. You can iterate and refine until you find the perfect resume for your brand."),
      tags: ['speed', 'generation', 'instant'],
      helpful: 0,
      notHelpful: 0
    },
    {
      id: 3,
      category: 'billing',
      icon: "💎",
      priority: 'medium',
      question: t('Homepagefaqs.q3.question', "What's included in the free plan?"),
      answer: t('Homepagefaqs.q3.answer', "New users get 3 free credits to generate and download resumes immediately. Each credit creates multiple resume variations, and you can download your favorites in PDF and Word formats."),
      tags: ['free', 'credits', 'downloads'],
      helpful: 0,
      notHelpful: 0
    },
    {
      id: 4,
      category: 'features',
      icon: "🎨",
      priority: 'medium',
      question: t('Homepagefaqs.q4.question', "Can I customize the generated resumes?"),
      answer: t('Homepagefaqs.q4.answer', "Yes! Our AI creates multiple variations automatically. You can regenerate with different styles, colors, and layouts. Plus, downloaded PDF files can be easily customized in any design software for further personalization."),
      tags: ['customization', 'variations', 'pdf'],
      helpful: 0,
      notHelpful: 0
    },
    {
      id: 5,
      category: 'technical',
      icon: "📁",
      priority: 'medium',
      question: t('Homepagefaqs.q5.question', "What file formats do you provide?"),
      answer: t('Homepagefaqs.q5.answer', "All resumes are available in high-quality PDF (for print and editing) and Word formats. Files come with standard fonts and are ready for immediate use across all platforms."),
      tags: ['formats', 'pdf', 'word', 'fonts'],
      helpful: 0,
      notHelpful: 0
    },
    {
      id: 6,
      category: 'billing',
      icon: "🔄",
      priority: 'low',
      question: t('Homepagefaqs.q6.question', "How does the credit system work?"),
      answer: t('Homepagefaqs.q6.answer', "Each resume generation uses 1 credit and creates multiple design variations. Credits never expire, and you can purchase additional credits anytime through our flexible pricing plans."),
      tags: ['credits', 'pricing', 'billing'],
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

  const handleHelpful = (id, type) => {
    setHelpfulVotes(prev => ({
      ...prev,
      [id]: { ...prev[id], [type]: (prev[id]?.[type] || 0) + 1 }
    }));
  };

  const quickStats = [
    { number: "5K+", label: t('Homepagefaqs.quickStats.resumesCreated'), icon: "📄" },
    { number: "<5min", label: t('Homepagefaqs.quickStats.avgBuildTime'), icon: "⏱️" },
    { number: "99%", label: t('Homepagefaqs.quickStats.satisfaction'), icon: "💯" },
    { number: "24/7", label: t('Homepagefaqs.quickStats.support'), icon: "🛟" }
  ];

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

            {/* Quick Stats */}
            <div
              data-animate="quick-stats"
              className={`grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mb-12 transform transition-all duration-700 delay-400 ${
                isVisible['quick-stats'] ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
              }`}
            >
              {quickStats.map((stat, index) => (
                <div key={index} className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/50 hover:bg-white/80 transition-all duration-300 group">
                  <div className="text-2xl mb-2 group-hover:scale-110 transition-transform duration-300">{stat.icon}</div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">{stat.number}</div>
                  <div className="text-sm text-gray-600">{stat.label}</div>
                </div>
              ))}
            </div>
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
                      <span className="bg-white/20 text-xs px-2 py-1 rounded-full">
                        {category.count}
                      </span>
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
                  } ${faq.priority === 'high' ? 'ring-2 ring-indigo-200/50' : ''}`}
                  style={{ transitionDelay: `${index * 100 + 600}ms` }}
                >
                  {/* Priority Badge */}
                  {faq.priority === 'high' && (
                    <div className="absolute top-4 right-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs px-3 py-1 rounded-full font-semibold">
                      {t('Homepagefaqs.popularBadge')}
                    </div>
                  )}

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
                          
                          {/* Helpful Section */}
                          <div className="mt-6 flex flex-col sm:flex-row items-center sm:justify-between gap-3">
                            <div className="text-gray-600 text-sm">{t('Homepagefaqs.helpfulQuestion')}</div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleHelpful(faq.id, 'helpful')}
                                className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors duration-200 text-sm"
                              >
                                <FaThumbsUp className="w-4 h-4" />
                                {helpfulVotes[faq.id]?.helpful || 0}
                              </button>
                              <button
                                onClick={() => handleHelpful(faq.id, 'notHelpful')}
                                className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors duration-200 text-sm"
                              >
                                <FaThumbsDown className="w-4 h-4" />
                                {helpfulVotes[faq.id]?.notHelpful || 0}
                              </button>
                            </div>
                          </div>
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
                    href="/support" 
                    className="font-medium text-sm px-5 py-2.5 rounded-lg shadow-sm text-white bg-gradient-to-r from-[#4a6cf7] to-[#4a6cf7]/90 hover:shadow-[#4a6cf7]/20 hover:shadow-lg transition-all duration-300"
                  >
                    {t('Homepagefaqs.contactSupport.contactButton')}
                  </a>
                  <a 
                    href="/docs" 
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
                    href="/sign-up"
                  >
                    {t('HomepageHero.createResume')}
                    <FaRocket className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                  </a>
                  <div className="flex items-center gap-2 text-white/80 text-sm">
                    <FaStar className="text-yellow-400 w-4 h-4" />
                    <span>{t('Homepagefaqs.cta.freeCredits')}</span>
                  </div>
                </div>

                {/* Trust indicators */}
                <div className="flex items-center justify-center gap-8 text-white/60 text-sm">
                  <div className="flex items-center gap-2">
                    <FaUserShield className="w-4 h-4" />
                    {t('Homepagefaqs.cta.secure', 'Secure & Private')}
                  </div>
                  <div className="flex items-center gap-2">
                    <FaSmile className="w-4 h-4" />
                    {t('Homepagefaqs.cta.instant', 'Instant Results')}
                  </div>
                  <div className="flex items-center gap-2">
                    <FaHeart className="w-4 h-4" />
                    {t('Homepagefaqs.cta.support', '24/7 Support')}
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