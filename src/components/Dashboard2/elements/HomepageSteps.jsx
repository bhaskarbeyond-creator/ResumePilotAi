import React from 'react';
import { 
  FaUserEdit, FaMagic, FaLayerGroup, FaFileDownload, FaArrowRight, FaCheckCircle, 
  FaRobot, FaGlobe, FaShieldAlt, FaBolt, FaLightbulb, FaBriefcase, FaCode, FaCheckDouble
} from 'react-icons/fa';

export default function HomepageSteps({ onOpenAuthModal }) {
  const steps = [
    {
      step: '01',
      title: 'Input Your Career History',
      description: 'Import your existing LinkedIn, resume or start fresh. Our smart forms organize work experience, education, projects and certifications effortlessly.',
      icon: <FaUserEdit className="w-6 h-6 text-blue-600" />,
      tag: 'Fast 2-Min Setup'
    },
    {
      step: '02',
      title: 'AI Metric-Driven Enhancement',
      description: 'Our context-aware AI engine rewrites bullet points into measurable achievements (XYZ format), matches job keywords, and crafts executive summaries.',
      icon: <FaMagic className="w-6 h-6 text-indigo-600" />,
      tag: 'Real-Time AI'
    },
    {
      step: '03',
      title: 'Select From 51 ATS Templates',
      description: 'Switch between 51 modern, executive, tech, minimalist and creative themes. Every layout is mathematically tested for 100% ATS parser extraction.',
      icon: <FaLayerGroup className="w-6 h-6 text-purple-600" />,
      tag: '51 Formats'
    },
    {
      step: '04',
      title: 'Download & Practice Interviews',
      description: 'Export instantly to pixel-perfect vector PDF and native Microsoft Word (.docx). Then launch the AI Interview Coach to simulate behavioral questions.',
      icon: <FaFileDownload className="w-6 h-6 text-emerald-600" />,
      tag: 'DOCX + PDF'
    }
  ];

  const handleCta = () => {
    if (onOpenAuthModal) {
      onOpenAuthModal('signup', 'Create your free account to build your resume');
    } else {
      window.location.href = '/login?next=%2Fbuild-resume%2Fheading';
    }
  };

  return (
    <section id="how-it-works" className="py-20 bg-slate-50 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold uppercase tracking-wider mb-3">
            <FaBolt className="w-3.5 h-3.5 text-blue-600" />
            <span>Guided 4-Step Career Workflow</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
            From Blank Canvas to Top-Tier Interview in Four Steps
          </h2>
          <p className="text-base sm:text-lg text-slate-600">
            A frictionless, intelligent workflow designed to highlight your biggest professional strengths and land more recruiter callbacks.
          </p>
        </div>

        {/* 4 Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {steps.map((s, idx) => (
            <div key={idx} className="rp-card flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center group-hover:scale-110 transition-transform">
                    {s.icon}
                  </div>
                  <span className="font-extrabold text-2xl text-slate-300 group-hover:text-blue-600 transition-colors">
                    {s.step}
                  </span>
                </div>
                
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider mb-2.5">
                  {s.tag}
                </span>

                <h3 className="font-extrabold text-lg text-slate-900 mb-2">
                  {s.title}
                </h3>

                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {s.description}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center text-xs font-bold text-blue-600">
                <span>Phase {s.step} Included Free</span>
              </div>
            </div>
          ))}
        </div>

        {/* Feature Spotlight 1: Contextual AI Writing Studio */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center mb-20 bg-white p-6 sm:p-10 rounded-3xl border border-slate-200 shadow-xl">
          <div className="lg:col-span-6 space-y-5 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
              <FaMagic className="w-3 h-3 text-blue-600" />
              <span>Real-Time AI Bullet Suggestions</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">
              Turn Modest Tasks Into Executive Accomplishments
            </h3>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Never stare at an empty bullet point again. IME365 analyzes your target job title and generates metric-driven bullet suggestions that prove your tangible business impact.
            </p>
            <div className="space-y-3 text-xs sm:text-sm text-slate-700 font-medium">
              <div className="flex items-center gap-2.5">
                <FaCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Google XYZ Formula (Accomplished [X], measured by [Y], doing [Z])</span>
              </div>
              <div className="flex items-center gap-2.5">
                <FaCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Context-aware experience engine with zero duplicate recommendations</span>
              </div>
              <div className="flex items-center gap-2.5">
                <FaCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Instant spellcheck and high-precision vocabulary enhancements</span>
              </div>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleCta}
                className="rp-btn-primary !py-3 !px-6 text-sm"
              >
                <span>Try the AI Editor Free</span>
                <FaArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-2xl text-left space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  <span className="text-xs font-bold text-white">AI Suggestion Engine (Live)</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">High Impact Score</span>
              </div>

              <div className="space-y-2.5">
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 text-xs text-slate-200">
                  <span className="text-slate-400 font-bold">Draft input:</span> &ldquo;Managed cloud servers and helped with deployments.&rdquo;
                </div>

                <div className="p-3 bg-blue-950/60 rounded-xl border border-blue-500/40 text-xs text-blue-100 flex items-start gap-2.5">
                  <FaMagic className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-blue-300">AI Enhanced:</span> &ldquo;Architected automated AWS ECS deployment pipeline using Terraform and Docker, reducing deployment cycle times by 68% while maintaining 99.98% service uptime across 14 microservices.&rdquo;
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] text-center pt-1">
                  <div className="p-2 bg-slate-800 rounded-lg text-slate-300">
                    <div className="font-bold text-white">Action Verb</div>
                    <div className="text-emerald-400">Architected</div>
                  </div>
                  <div className="p-2 bg-slate-800 rounded-lg text-slate-300">
                    <div className="font-bold text-white">Measurable Metric</div>
                    <div className="text-emerald-400">68% Reduction</div>
                  </div>
                  <div className="p-2 bg-slate-800 rounded-lg text-slate-300">
                    <div className="font-bold text-white">Scale Factor</div>
                    <div className="text-emerald-400">14 Services</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Spotlight 2: AI Interview Coach */}
        <div id="interview-coach" className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center bg-slate-900 text-white p-6 sm:p-10 rounded-3xl border border-slate-800 shadow-2xl">
          <div className="lg:col-span-6 lg:order-2 space-y-5 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold border border-purple-400/30">
              <FaRobot className="w-3.5 h-3.5 text-purple-400" />
              <span>AI Interview Coach & CBT Simulator</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
              Master Tough Questions Before You Walk Into the Room
            </h3>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              IME365 doesn&apos;t stop at resumes. Our interactive CBT simulator acts as a seasoned hiring manager, grilling you with tailored behavioral, situational, and technical questions — with instant rubric feedback.
            </p>
            <div className="space-y-3 text-xs sm:text-sm text-slate-300 font-medium">
              <div className="flex items-center gap-2.5">
                <FaCheckCircle className="w-4 h-4 text-purple-400 shrink-0" />
                <span>STAR Method Scoring (Situation, Task, Action, Result)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <FaCheckCircle className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Confidence & delivery analysis with specific improvement suggestions</span>
              </div>
              <div className="flex items-center gap-2.5">
                <FaCheckCircle className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Unlimited practice sessions tailored to your actual resume details</span>
              </div>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleCta}
                className="rp-btn-primary !bg-purple-600 hover:!bg-purple-700 !py-3 !px-6 text-sm"
              >
                <span>Launch Interview Simulation</span>
                <FaArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 lg:order-1">
            <div className="bg-slate-800/90 rounded-2xl border border-slate-700 p-5 space-y-4 text-left">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></div>
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Live CBT Session</span>
                </div>
                <span className="text-xs font-extrabold bg-purple-500/20 text-purple-300 px-2.5 py-0.5 rounded border border-purple-500/40">Scenario 3 of 5</span>
              </div>

              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-700 text-xs text-slate-200 leading-relaxed">
                <span className="font-bold text-purple-400">AI Recruiter:</span> &ldquo;Describe a situation where you had a strong technical disagreement with a product manager. How did you resolve the trade-off without missing deadlines?&rdquo;
              </div>

              <div className="p-3.5 bg-blue-950/40 rounded-xl border border-blue-800/50 text-xs text-blue-200 leading-relaxed">
                <span className="font-bold text-blue-400">Candidate:</span> &ldquo;I organized a data-driven prototype benchmark showing the proposed feature added 400ms latency. We compromised on a phased rollout that shipped on time.&rdquo;
              </div>

              <div className="p-3 bg-emerald-950/50 rounded-xl border border-emerald-800/60 text-xs text-emerald-200">
                <span className="font-bold text-emerald-400">Feedback Score: 96/100</span> — Exemplary conflict resolution. Highlighted data rather than emotion and preserved delivery milestones.
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
