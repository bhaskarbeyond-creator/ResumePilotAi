import React, { useState, useEffect, useContext } from 'react';
import { 
  FiStar, 
  FiFileText, 
  FiZap, 
  FiTarget, 
  FiTrendingUp, 
  FiAward, 
  FiUsers, 
  FiDownload, 
  FiEdit3, 
  FiLayout, 
  FiShare2, 
  FiSmartphone, 
  FiGlobe, 
  FiCheckCircle,
  FiArrowRight,
  FiShield,
  FiPlay,
  FiCpu,
  FiMonitor,
  FiCloud,
  FiLock,
  FiRefreshCw,
  FiTool
} from 'react-icons/fi';
import { BiFile, BiPalette, BiShield } from 'react-icons/bi';
import { useLottie } from "lottie-react";
import { withTranslation } from 'react-i18next';
import LoaderAnimation from '../../assets/animations/lottie-loader.json';
import { getPages, getWebsiteData, getSocialLinks } from '../../firestore/dbOperations';
import HomepageFooter from '../../components/Dashboard2/elements/HomepageFooter';  
import HomepageNavbar from '../../components/Dashboard2/elements/HomepageNavbar';
import { AuthContext } from '../../main';
import fire from '../../conf/fire';
import AuthWrapper from '../auth/authWrapper/AuthWrapper';

const Features = ({ t, goToResumeSelectionStep, goToCoverSelection }) => {
  // Get user from AuthContext
  const user = useContext(AuthContext);
  const [state, setState] = useState({
    pages: [],
    socialLinks: [],
    websiteDescription: '',
    websiteName: '',
    loaded: false,
    isAuthModalOpen: false,
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

    if (window.location.pathname.substring(0, 9) === '/features') {
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

  // Authentication handlers
  const authBtnHandler = () => {
    setState(prev => ({ ...prev, isAuthModalOpen: !prev.isAuthModalOpen }));
  };

  const logout = () => {
    fire.auth().signOut();
    localStorage.removeItem('user');
    localStorage.removeItem('currentResumeId');
    localStorage.removeItem('currentResumeItem');
  };

  const closeAuthModal = () => {
    setState(prev => ({ ...prev, isAuthModalOpen: false }));
  };

  // Enhanced feature data with unified design system
  const mainFeatures = [
    {
      icon: FiFileText,
      title: "50+ Professional Templates",
      description: "Choose from our extensive collection of industry-specific, ATS-friendly resume templates designed by career experts and recruiters.",
      category: "Templates",
      highlight: "Most Popular",
      stats: "50+ designs"
    },
    {
      icon: FiCpu,
      title: "AI-Powered Writing Assistant",
      description: "Advanced artificial intelligence analyzes job descriptions and suggests optimized content, keywords, and phrasing to maximize your impact.",
      category: "AI Technology",
      highlight: "Smart Suggestions",
      stats: "95% accuracy"
    },
    {
      icon: FiTarget,
      title: "ATS-Optimization System",
      description: "Built-in Applicant Tracking System compatibility ensures your resume passes automated screening and reaches human recruiters.",
      category: "Optimization",
      highlight: "ATS-Friendly",
      stats: "98% pass rate"
    },
    {
      icon: FiEdit3,
      title: "Real-time Visual Editor",
      description: "Intuitive drag-and-drop interface with live preview lets you see changes instantly as you build your perfect resume.",
      category: "Editor",
      highlight: "Live Preview",
      stats: "Instant updates"
    },
    {
      icon: FiDownload,
      title: "Multi-Format Export",
      description: "Export your resume in PDF, Word, PNG, or HTML formats with high-quality rendering optimized for both digital and print viewing.",
      category: "Export",
      highlight: "High Quality",
      stats: "4 formats"
    },
    {
      icon: FiShare2,
      title: "Digital Portfolio & Sharing",
      description: "Create shareable links, build online portfolios, and track engagement analytics to see who views your resume.",
      category: "Sharing",
      highlight: "Analytics",
      stats: "Track views"
    }
  ];

  const additionalFeatures = [
    {
      icon: BiPalette,
      title: "Advanced Customization",
      description: "Fine-tune colors, fonts, spacing, and layouts with pixel-perfect precision",
      category: "Design"
    },
    {
      icon: FiSmartphone,
      title: "Cross-Device Compatibility",
      description: "Seamlessly edit and preview on desktop, tablet, and mobile devices",
      category: "Accessibility"
    },
    {
      icon: FiGlobe,
      title: "Multi-Language Support",
      description: "Create resumes in 15+ languages with proper formatting and localization",
      category: "Localization"
    },
    {
      icon: FiLock,
      title: "Enterprise-Grade Security",
      description: "Bank-level encryption and privacy protection for your sensitive information",
      category: "Security"
    },
    {
      icon: FiRefreshCw,
      title: "Version Control & History",
      description: "Track changes, revert to previous versions, and maintain multiple resume variants",
      category: "Management"
    },
    {
      icon: FiUsers,
      title: "Team Collaboration",
      description: "Share drafts with mentors, get feedback, and co-edit with team members",
      category: "Collaboration"
    },
    {
      icon: FiTool,
      title: "Professional Tools Suite",
      description: "Integrated spell-check, grammar analysis, and content optimization tools",
      category: "Tools"
    },
    {
      icon: FiCloud,
      title: "Cloud Synchronization",
      description: "Auto-save and sync across all devices with real-time backup protection",
      category: "Storage"
    }
  ];

  const stats = [
    { 
      number: "50+", 
      label: "Professional Templates", 
      icon: FiFileText,
      description: "Industry-specific designs",
      color: "from-blue-500 to-indigo-600"
    },
    { 
      number: "250K+", 
      label: "Successful Resumes", 
      icon: FiUsers,
      description: "Professionals hired",
      color: "from-emerald-500 to-teal-600"
    },
    { 
      number: "98%", 
      label: "ATS Pass Rate", 
      icon: FiTarget,
      description: "Resume screening success",
      color: "from-purple-500 to-violet-600"
    },
    { 
      number: "24/7", 
      label: "Expert Support", 
      icon: FiAward,
      description: "Always here to help",
      color: "from-orange-500 to-red-500"
    }
  ];

  if (!state.loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        {/* Premium loading with sophisticated background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br from-blue-400/15 to-indigo-500/15 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-br from-purple-400/15 to-violet-500/15 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br from-emerald-400/10 to-teal-500/10 rounded-full blur-2xl animate-pulse delay-500"></div>
        </div>
        <div className="text-center relative z-10">
          <div className="relative">
            <div className="w-52 h-52 mx-auto mb-6 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-indigo-600/20 rounded-full blur-xl animate-pulse"></div>
              <div className="relative z-10 w-full h-full">
                {View}
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                Loading Premium Features
              </h2>
              <p className="text-gray-600 text-lg max-w-md mx-auto">
                Preparing your professional resume building experience...
              </p>
              <div className="flex items-center justify-center space-x-2 mt-4">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-75"></div>
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce delay-150"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/20">
      {/* Navbar */}
      <HomepageNavbar 
        user={user} 
        authBtnHandler={authBtnHandler}
        logout={logout}
      />

      {/* Clean Hero Section */}
      <section className="relative py-20 overflow-hidden">
        {/* Simple background elements matching the Dashboard2 theme */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-1/4 left-10 w-80 h-80 bg-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-10 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 relative z-10">
          {/* Clean header matching Dashboard2 style */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#4a6cf7] bg-[#4a6cf7]/10 border border-[#4a6cf7]/20 rounded-full backdrop-blur-sm hover:bg-[#4a6cf7]/15 transition-all duration-300 shadow-sm mb-6">
              <FiStar className="w-4 h-4" />
              Professional Features
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 tracking-tight leading-tight">
              Powerful Tools for
              <span className="bg-gradient-to-r from-[#4a6cf7] to-[#6366f1] bg-clip-text text-transparent"> Professional Resumes</span>
            </h1>
            
            <p className="text-gray-600 text-xl max-w-3xl mx-auto leading-relaxed mb-8">
              Everything you need to create, customize, and share professional resumes that get you hired.
            </p>
            
            {/* Clean CTA buttons matching Dashboard2 style */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <button className="group relative flex items-center justify-center gap-2 px-6 py-3 bg-[#4a6cf7] text-white rounded-lg hover:bg-[#3b5ce6] transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg">
                <FiZap className="w-4 h-4" />
                Start Building Now
                <FiArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
              </button>
              
              <button className="group relative flex items-center justify-center gap-2 px-6 py-3 bg-white border border-[#4a6cf7] text-[#4a6cf7] rounded-lg hover:bg-blue-50 transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg">
                <FiFileText className="w-4 h-4" />
                View Templates
              </button>
            </div>
          </div>

          {/* Clean Stats matching Dashboard2 style */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 group text-center"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-purple-200 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                  <stat.icon className="w-6 h-6 text-purple-600" />
                </div>
                <p className="text-2xl font-bold text-purple-600 mb-2">{stat.number}</p>
                <h3 className="text-gray-900 font-semibold text-sm mb-1">{stat.label}</h3>
                <p className="text-gray-600 text-xs">{stat.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Features Section - Dashboard2 Style */}
      <section className="py-20 scroll-mt-20 relative">
        {/* Simple background matching Dashboard2 theme */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-1/4 left-10 w-80 h-80 bg-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-10 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 relative z-10">
          {/* Clean section header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#4a6cf7] bg-[#4a6cf7]/10 border border-[#4a6cf7]/20 rounded-full backdrop-blur-sm hover:bg-[#4a6cf7]/15 transition-all duration-300 shadow-sm mb-6">
              <FiZap className="w-4 h-4" />
              Core Features
            </div>
            
            <h2 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 tracking-tight leading-tight">
              Everything You Need to
              <span className="bg-gradient-to-r from-[#4a6cf7] to-[#6366f1] bg-clip-text text-transparent"> Stand Out</span>
            </h2>
            
            <p className="text-gray-600 text-xl max-w-3xl mx-auto leading-relaxed">
              Professional-grade tools designed by career experts to help you create resumes that get noticed by employers.
            </p>
          </div>

          {/* Clean feature cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {mainFeatures.map((feature, index) => (
              <div
                key={index}
                className="group relative bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 overflow-hidden"
              >
                {/* Simple category badge */}
                <div className="absolute top-4 right-4 z-10">
                  <span className="inline-flex items-center px-3 py-1 text-xs font-semibold text-[#4a6cf7] bg-[#4a6cf7]/10 rounded-full">
                    {feature.category}
                  </span>
                </div>
                
                {/* Clean highlight badge */}
                {feature.highlight && (
                  <div className="absolute top-4 left-4 z-10">
                    <span className="inline-flex items-center px-3 py-1 text-xs font-semibold text-purple-600 bg-purple-100 rounded-full">
                      ✨ {feature.highlight}
                    </span>
                  </div>
                )}
                
                {/* Main content */}
                <div className="relative p-6">
                  {/* Simple icon design */}
                  <div className="mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-300">
                      <feature.icon className="w-7 h-7 text-purple-600" />
                    </div>
                  </div>
                  
                  {/* Clean typography */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#4a6cf7] transition-colors duration-300">
                      {feature.title}
                    </h3>
                    
                    <p className="text-gray-600 text-sm leading-relaxed">
                      {feature.description}
                    </p>
                    
                    {/* Simple stats display */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <span className="text-xs font-semibold text-purple-600">
                        {feature.stats}
                      </span>
                      
                      <div className="flex items-center text-[#4a6cf7] font-medium text-xs group-hover:gap-1 transition-all duration-300">
                        <span>Learn more</span>
                        <FiArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform duration-300" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Additional Features Section - Dashboard2 Style */}
      <section className="py-20 bg-gradient-to-b from-transparent via-white/5 to-transparent relative">
        {/* Simple background matching Dashboard2 theme */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-1/4 left-10 w-80 h-80 bg-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-10 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 relative z-10">
          {/* Clean section header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#4a6cf7] bg-[#4a6cf7]/10 border border-[#4a6cf7]/20 rounded-full backdrop-blur-sm hover:bg-[#4a6cf7]/15 transition-all duration-300 shadow-sm mb-6">
              <FiTool className="w-4 h-4" />
              Additional Capabilities
            </div>
            
            <h2 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 tracking-tight leading-tight">
              <span className="bg-gradient-to-r from-[#4a6cf7] to-[#6366f1] bg-clip-text text-transparent">
                Professional Tools
              </span>
              <span className="block text-gray-900">for Every Need</span>
            </h2>
            
            <p className="text-gray-600 text-xl max-w-3xl mx-auto leading-relaxed">
              Advanced features and tools that set our platform apart, designed to give you every advantage in your job search.
            </p>
          </div>

          {/* Clean grid layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {additionalFeatures.map((feature, index) => (
              <div
                key={index}
                className="group bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 overflow-hidden"
              >
                {/* Simple category badge */}
                <div className="absolute top-3 right-3 z-10">
                  <span className="inline-flex items-center px-2 py-1 text-xs font-semibold text-purple-600 bg-purple-100 rounded-full">
                    {feature.category}
                  </span>
                </div>
                
                {/* Main content */}
                <div className="relative p-6">
                  {/* Simple icon design */}
                  <div className="mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-300">
                      <feature.icon className="w-6 h-6 text-purple-600" />
                    </div>
                  </div>
                  
                  {/* Clean typography */}
                  <div className="space-y-3">
                    <h3 className="text-base font-bold text-gray-900 group-hover:text-[#4a6cf7] transition-colors duration-300">
                      {feature.title}
                    </h3>
                    
                    <p className="text-gray-600 text-sm leading-relaxed">
                      {feature.description}
                    </p>
                    
                    {/* Simple action indicator */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <div className="flex items-center text-[#4a6cf7] font-medium text-xs group-hover:gap-1 transition-all duration-300">
                        <span>Learn More</span>
                        <FiArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform duration-300" />
                      </div>
                      
                      {/* Simple indicator dot */}
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Clean bottom section */}
          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-gray-700 bg-white/80 backdrop-blur-sm rounded-full shadow-sm border border-gray-200">
              <FiCheckCircle className="w-4 h-4 text-emerald-500" />
              All features included in every plan
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section - Dashboard2 Style */}
      <section className="py-20 bg-gradient-to-br from-slate-50 via-blue-50/50 to-purple-50/50 relative">
        {/* Simple background matching Dashboard2 theme */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#4a6cf7]/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-400/15 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        <div className="max-w-4xl mx-auto px-4 relative z-10">
          {/* Clean main CTA card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20 overflow-hidden">
            <div className="p-12 lg:p-16 text-center">
              {/* Simple trust badge */}

              
              {/* Clean CTA heading */}
              <h2 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 tracking-tight leading-tight">
                <span className="bg-gradient-to-r from-[#4a6cf7] to-[#6366f1] bg-clip-text text-transparent">
                  Start Building Your
                </span>
                <span className="block text-gray-900">
                  Dream Resume Today
                </span>
              </h2>
              
              {/* Simple supporting text */}
              <p className="text-gray-600 text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
                Join thousands of professionals who've transformed their careers with our AI-powered resume builder. Create, customize, and land your dream job.
              </p>
              
              {/* CTA buttons - matching HomepageHero pattern */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-10">
                <button
                  onClick={() => goToResumeSelectionStep && goToResumeSelectionStep()}
                  className="group px-8 py-4 bg-[#4a6cf7] hover:bg-[#3b5af0] text-white font-semibold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer">
                  <span className="flex items-center gap-2">
                    Start Building Now
                    <FiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                  </span>
                </button>
                
                <button
                  onClick={() => goToCoverSelection && goToCoverSelection()}
                  className="group px-8 py-4 bg-white text-gray-900 font-semibold text-lg rounded-xl border-2 border-gray-200 hover:border-[#4a6cf7] hover:bg-[#4a6cf7]/5 shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <FiFileText className="w-5 h-5" />
                    Create Cover Letter
                  </span>
                </button>
              </div>
              
              {/* Simple trust indicators */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  { icon: FiUsers, label: "100,000+ Users", color: "text-emerald-600 bg-emerald-50" },
                  { icon: FiShield, label: "Enterprise Security", color: "text-[#4a6cf7] bg-[#4a6cf7]/10" },
                  { icon: FiAward, label: "Industry Leading", color: "text-purple-600 bg-purple-50" }
                ].map((item, index) => (
                  <div key={index} className={`group flex flex-col items-center p-4 rounded-xl backdrop-blur-sm transition-all duration-300 hover:scale-105 ${item.color}`}>
                    <item.icon className="w-6 h-6 mb-2 group-hover:scale-110 transition-transform duration-300" />
                    <span className="text-sm font-semibold">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          

        </div>
      </section>

      {/* Footer */}
      <HomepageFooter />

      {/* Auth Modal */}
      {state.isAuthModalOpen && (
        <AuthWrapper 
          closeModal={closeAuthModal}
        />
      )}
    </div>
  );
};

const FeaturesWithTranslation = withTranslation('common')(Features);
export default FeaturesWithTranslation;