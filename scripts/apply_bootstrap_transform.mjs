import fs from 'fs';
import path from 'path';

// 1. Update CoverLetter.jsx
{
  const filePath = 'src/components/CoverLetter/CoverLetter.jsx';
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replaceAll('className="cl-card', 'className="card bs-card-executive cl-card');
  content = content.replaceAll('className="cl-btn cl-btn--primary', 'className="btn btn-primary cl-btn cl-btn--primary');
  content = content.replaceAll('className="cl-btn cl-btn--soft', 'className="btn btn-outline-secondary cl-btn cl-btn--soft');
  content = content.replaceAll('className="cl-btn cl-btn--neutral', 'className="btn btn-secondary cl-btn cl-btn--neutral');
  content = content.replaceAll('className="cl-btn cl-btn--danger', 'className="btn btn-danger cl-btn cl-btn--danger');
  content = content.replaceAll('className="cl-input', 'className="form-control cl-input');
  content = content.replaceAll('className="cl-select', 'className="form-select cl-select');
  content = content.replaceAll('className="cl-modal', 'className="modal-content cl-modal');
  content = content.replaceAll('className="cl-modal__head', 'className="modal-header cl-modal__head');
  content = content.replaceAll('className="cl-modal__body', 'className="modal-body cl-modal__body');
  content = content.replaceAll('className="cl-modal__foot', 'className="modal-footer cl-modal__foot');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated CoverLetter.jsx');
}

// 2. Update AppliedJobs.jsx
{
  const filePath = 'src/components/AppliedJobs/AppliedJobs.jsx';
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    'className="bg-cuba-card rounded-lg p-4 border border-cuba-line shadow-sm mb-6"',
    'className="card bs-card-executive bg-cuba-card rounded-3 p-3 border border-cuba-line shadow-sm mb-4"'
  );
  content = content.replace(
    'className="flex flex-col sm:flex-row gap-3"',
    'className="row g-3"'
  );
  content = content.replace(
    'className="flex-1"',
    'className="col-12 col-md"'
  );
  content = content.replace(
    'className="sm:w-40"',
    'className="col-12 col-sm-6 col-md-auto"'
  );
  content = content.replace(
    'className="sm:w-40"',
    'className="col-12 col-sm-6 col-md-auto"'
  );
  content = content.replace(
    'className="w-full pl-9 pr-3 py-2.5 text-sm border border-cuba-line-strong rounded-md focus:outline-none focus:ring-1 focus:ring-cuba-primary focus:border-cuba-primary placeholder-cuba-ink-subtle"',
    'className="form-control w-full pl-9 pr-3 py-2 text-sm border border-cuba-line-strong rounded-md"'
  );
  content = content.replaceAll(
    'className="w-full px-3 py-2.5 text-sm border border-cuba-line-strong rounded-md focus:outline-none focus:ring-1 focus:ring-cuba-primary focus:border-cuba-primary bg-cuba-card"',
    'className="form-select w-full px-3 py-2 text-sm border border-cuba-line-strong rounded-md bg-cuba-card"'
  );
  content = content.replace(
    'className="bg-cuba-card rounded-lg border border-cuba-line overflow-hidden hover:border-cuba-line-strong transition-all duration-200"',
    'className="card bs-card-executive bg-cuba-card rounded-3 border border-cuba-line overflow-hidden hover:border-cuba-line-strong transition-all duration-200"'
  );
  content = content.replace(
    'className={`inline-flex items-center gap-2 px-2 py-1 rounded border text-xs font-medium ${getStatusColor(job.status)}`}',
    'className={`badge rounded-pill inline-flex items-center gap-2 px-2.5 py-1.5 border text-xs font-medium ${getStatusColor(job.status)}`}'
  );
  content = content.replace(
    'className="cuba-btn-primary px-4 py-2 rounded-xl text-sm font-bold shadow-xs"',
    'className="btn btn-primary cuba-btn-primary px-4 py-2 rounded-pill text-sm font-bold shadow-xs"'
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated AppliedJobs.jsx');
}

// 3. Update LiveAnswerGuide.jsx
{
  const filePath = 'src/components/Dashboard/DashboardInterviews/LiveAnswerGuide.jsx';
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    'className="rounded-2xl border border-indigo-200/80 bg-white p-3 shadow-xs shrink-0 flex flex-col gap-2 animate-fadeIn"',
    'className="card bs-card-executive rounded-2xl border border-indigo-200/80 bg-white p-3 shadow-xs shrink-0 flex flex-col gap-2 animate-fadeIn"'
  );
  content = content.replace(
    'className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 hover:border-slate-300 px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"',
    'className="btn btn-sm btn-outline-secondary inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"'
  );
  content = content.replace(
    'className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 shadow-2xs transition-colors cursor-pointer"',
    'className="btn btn-sm btn-primary inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold shadow-2xs transition-colors cursor-pointer"'
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated LiveAnswerGuide.jsx');
}

// 4. Update LiveAudioWaveform.jsx
{
  const filePath = 'src/components/Dashboard/DashboardInterviews/LiveAudioWaveform.jsx';
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    'className={`relative overflow-hidden w-full flex items-center justify-center ${className}`}',
    'className={`bs-waveform-container card-body p-0 relative overflow-hidden w-full flex items-center justify-center ${className}`}'
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated LiveAudioWaveform.jsx');
}

// 5. Update LiveResumeDrawer.jsx
{
  const filePath = 'src/components/Dashboard/DashboardInterviews/LiveResumeDrawer.jsx';
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    'className="w-screen max-w-md pointer-events-auto bg-white border-l border-slate-200 shadow-2xl flex flex-col"',
    'className="offcanvas offcanvas-end show w-screen max-w-md pointer-events-auto bg-white border-l border-slate-200 shadow-2xl flex flex-col"'
  );
  content = content.replace(
    'className="p-5 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between"',
    'className="modal-header offcanvas-header p-5 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between"'
  );
  content = content.replace(
    'className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"',
    'className="form-control w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400"'
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated LiveResumeDrawer.jsx');
}

// 6. Update AiCareerBriefing.jsx
{
  const filePath = 'src/components/Candidate/AiCareerBriefing.jsx';
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    'className={className}',
    'className={`card bs-card-executive ${className}`}'
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated AiCareerBriefing.jsx');
}

// 7. Update CandidateCareerAssistant.jsx
{
  const filePath = 'src/components/Candidate/CandidateCareerAssistant.jsx';
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    'className={`candidate-career-assistant overflow-hidden rounded-2xl border border-[var(--cuba-primary-line)] bg-white shadow-cuba-md ${className}`}',
    'className={`candidate-career-assistant card bs-card-executive overflow-hidden rounded-2xl border border-[var(--cuba-primary-line)] bg-white shadow-cuba-md ${className}`}'
  );
  content = content.replace(
    'className="inline-flex shrink-0 items-center gap-1 rounded-full border border-cuba-success bg-cuba-success-soft px-2 py-1 text-[10px] font-bold text-cuba-success"',
    'className="badge rounded-pill inline-flex shrink-0 items-center gap-1 border border-cuba-success bg-cuba-success-soft px-2.5 py-1 text-[10px] font-bold text-cuba-success"'
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated CandidateCareerAssistant.jsx');
}
