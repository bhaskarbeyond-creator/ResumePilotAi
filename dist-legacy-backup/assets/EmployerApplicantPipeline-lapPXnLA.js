import{o as e}from"./rolldown-runtime-C0FnF6B9.js";import{n as t,t as n}from"./jsx-runtime-CKeovgl0.js";import{St as r,jt as i,sr as ee}from"./platform-BPmFlzhk.js";import{i as te}from"./sanitizeHtml-Ccfv846U.js";import{$t as ne,At as re,B as ie,Et as ae,K as a,Sn as oe,Tt as se,en as ce,hn as le,in as ue,pt as de,rn as fe,xn as pe,yn as me}from"./index-DGcQ48QM.js";import{s as he}from"./resumeData-DMBNIgLc.js";import{t as ge}from"./SendMessageDialog-DrJyUx05.js";import{n as _e,t as o}from"./useEmployerWorkspace-IoNZodC7.js";import{i as s,n as c,r as ve,t as l}from"./EmployerStates-BoZF455f.js";var u=e(t(),1),ye=`/**\r
 * Cuba print contract — DIR-056 SUB-056-5\r
 *\r
 * WHY THIS FILE EXISTS\r
 *   Every print/export surface in this app renders a SUBTREE into a fresh\r
 *   document (an iframe for printing, a Blob for the HTML download). A fresh\r
 *   document inherits NONE of the application's CSS, and the resume markup is\r
 *   written with utility classes — so without carrying the styles across, the\r
 *   output is genuinely unstyled. That is the "unstyled iframe / unconstrained\r
 *   avatars / multi-page whitespace sprawl" defect named in the mandate.\r
 *\r
 *   This file is the ONE print contract. It is consumed two ways:\r
 *     • as a normal stylesheet for in-app \`@media print\` behaviour, and\r
 *     • via \`?raw\` by src/utils/printSurface.js, which inlines it into the\r
 *       generated document so it survives the iframe/Blob boundary.\r
 *\r
 * SCOPE / EXCLUSIONS\r
 *   This file never touches \`src/cv-templates/**\` — those 51 templates are\r
 *   FROZEN and must stay \`git diff = 0\`.\r
 */\r
\r
@page {\r
    size: auto;\r
    margin: 12mm;\r
}\r
\r
@media print {\r
    /* ---- 1. A printable document is white paper with black ink ---------- */\r
    html,\r
    body {\r
        background: #fff !important;\r
        color: #000 !important;\r
        margin: 0 !important;\r
        padding: 0 !important;\r
        -webkit-print-color-adjust: exact;\r
        print-color-adjust: exact;\r
    }\r
\r
    /* ---- 2. Interactive chrome must never reach paper ------------------- */\r
    .no-print,\r
    [data-print="exclude"],\r
    /* DIR-064: the document-level accessibility skip-link is chrome, not content.\r
       Rule 3 below forces \`position: static\`, which would otherwise print the\r
       off-screen link as a banner on page 1. It must never reach paper. */\r
    .skip-link,\r
    nav,\r
    button,\r
    [role="button"],\r
    input[type="checkbox"],\r
    select {\r
        display: none !important;\r
    }\r
\r
    /* ---- 3. No multi-page whitespace sprawl ----------------------------- */\r
    /* \`position: sticky/fixed\` repeats or leaves gaps across page breaks, and\r
       \`box-shadow\` prints as grey smear. Both are neutralised outright. */\r
    * {\r
        position: static !important;\r
        box-shadow: none !important;\r
        text-shadow: none !important;\r
    }\r
\r
    /* Keep a logical block together instead of orphaning one line on a page. */\r
    section,\r
    article,\r
    li,\r
    tr,\r
    td,\r
    th,\r
    .print-avoid-break {\r
        break-inside: avoid;\r
        page-break-inside: avoid;\r
    }\r
\r
    /* A heading must never be the last thing on a page. */\r
    h1, h2, h3, h4, h5, h6 {\r
        break-after: avoid;\r
        page-break-after: avoid;\r
    }\r
\r
    /* Explicit opt-in page break. */\r
    .print-break-before {\r
        break-before: page;\r
        page-break-before: always;\r
    }\r
\r
    /* ---- 4. Images and avatars stay bounded ----------------------------- */\r
    /* An unconstrained photo is what blows a single-page resume onto three. */\r
    img,\r
    svg,\r
    canvas,\r
    video {\r
        max-width: 100% !important;\r
        max-height: 42mm !important;\r
        object-fit: contain !important;\r
        break-inside: avoid;\r
        page-break-inside: avoid;\r
    }\r
\r
    /* Portrait avatars get a fixed physical box so the header cannot stretch. */\r
    [class*="avatar"],\r
    [class*="photo"],\r
    [class*="profile-image"],\r
    [data-print="avatar"] {\r
        width: 28mm !important;\r
        height: 28mm !important;\r
        max-width: 28mm !important;\r
        max-height: 28mm !important;\r
        object-fit: cover !important;\r
        border-radius: 50% !important;\r
        flex: 0 0 auto !important;\r
    }\r
\r
    /* ---- 5. Links and tables read correctly on paper -------------------- */\r
    a,\r
    a:visited {\r
        color: #000 !important;\r
        text-decoration: none !important;\r
    }\r
\r
    table {\r
        width: 100% !important;\r
        border-collapse: collapse !important;\r
    }\r
\r
    /* ---- 6. Backgrounds that would otherwise print as solid blocks ------ */\r
    [class*="bg-gradient"],\r
    [class*="backdrop-blur"] {\r
        background: transparent !important;\r
        backdrop-filter: none !important;\r
    }\r
}\r
`;function d(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function f(e=typeof document<`u`?document:null){if(!e||typeof e.querySelectorAll!=`function`)return``;let t=[];try{e.querySelectorAll(`style`).forEach(e=>t.push(e.outerHTML)),e.querySelectorAll(`link[rel="stylesheet"]`).forEach(e=>t.push(e.outerHTML))}catch{}return t.join(``)}function be({title:e,innerHTML:t,extraStyles:n=``,doc:r}={}){return[`<!DOCTYPE html><html><head><meta charset="utf-8">`,`<title>${d(e||`Document`)}</title>`,f(r),`<style>${ye}${n}</style>`,`</head><body class="print-surface">`,String(t||``),`</body></html>`].join(``)}var p=n(),m={pending:`cuba-pill-warning`,shortlisted:`cuba-pill-primary`,interview:`cuba-pill-info`,offer:`cuba-pill-success`,hired:`cuba-pill-success-hi`,accepted:`cuba-pill-success`,rejected:`cuba-pill-danger`,withdrawn:`cuba-pill-neutral`},h=e=>`${m[String(e||``).toLowerCase()]||`cuba-pill-neutral`} px-2.5 py-1 text-xs`,xe=[{stage:`interview`,apiStatus:`interview`,label:`Interview`},{stage:`offer`,apiStatus:`accepted`,label:`Offer`},{stage:`hired`,apiStatus:`accepted`,label:`Hired`},{stage:`rejected`,apiStatus:`rejected`,label:`Rejected`}],Se={pending:[`interview`,`accepted`,`rejected`],interview:[`accepted`,`rejected`,`pending`],accepted:[`interview`,`rejected`],rejected:[`pending`,`interview`]},g=60,_=150,v=10,Ce=794,we=e=>{let t=e?.template||e?.data?.template||`Cv1`,n=String(t).match(/^cv\s*(\d+)$/i);if(n)return`Cv${n[1]}`;let r=String(t).match(/^cover\s*(\d+)$/i);return r?`Cover${r[1]}`:t||`Cv1`},y=({showToast:e})=>{let t=(0,u.useContext)(le),{status:n,error:ye,jobs:d,reload:f,metrics:m}=_e(t?.uid),[y,b]=(0,u.useState)([]),[x,S]=(0,u.useState)(!1),[C,w]=(0,u.useState)(null),[T,Te]=(0,u.useState)(``),[E,D]=(0,u.useState)(null),[O,k]=(0,u.useState)(null),[Ee,A]=(0,u.useState)(null),[j,M]=(0,u.useState)(!1),[N,P]=(0,u.useState)(null),[F,I]=(0,u.useState)(100),[De,L]=(0,u.useState)(null),[R,z]=(0,u.useState)(null),[B,V]=(0,u.useState)(``),[H,U]=(0,u.useState)(`resume`),W=(0,u.useRef)(null),G=(0,u.useCallback)(async e=>{if(!Array.isArray(e)||e.length===0){b([]),w(null);return}S(!0),w(null);try{let t=[];for(let n of e){let e=await i(n.id);(Array.isArray(e)?e:[]).forEach(e=>{t.push({id:e.id,jobId:n.id,jobTitle:n.title,applicantName:e.applicantName||e.applicant_name||e.fullName||e.userName||`Applicant`,applicantEmail:e.applicantEmail||e.applicant_email||e.email||``,applicantPhone:e.applicantPhone||e.applicant_phone||``,status:String(e.status||`pending`).toLowerCase(),appliedAt:e.appliedAt||e.createdAt||e.created_at||null,revision:Number(e.revision||0),resumeId:e.resumeId||e.resume_id||null,resumeUrl:e.resumeUrl||e.resume_url||null,coverLetter:e.coverLetter||e.cover_letter||``})})}b(t)}catch(e){w(e),b([])}finally{S(!1)}},[]);(0,u.useEffect)(()=>{n===o.READY&&G(d)},[n,d,G]);let K=(0,u.useMemo)(()=>{let e=T.trim().toLowerCase();return e?y.filter(t=>`${t.applicantName} ${t.applicantEmail} ${t.jobTitle}`.toLowerCase().includes(e)):y},[y,T]),q=(0,u.useMemo)(()=>{let e=y.reduce((e,t)=>(e[t.status]=(e[t.status]||0)+1,e),{});return Object.entries(e).sort((e,t)=>t[1]-e[1])},[y]),Oe=(0,u.useCallback)(async e=>{k(e),A(null),P(null),M(!0),I(100);try{let t=await r(e.jobId,e.id);A(t)}catch(e){P(e)}finally{M(!1)}},[]),ke=(0,u.useCallback)(()=>{k(null),A(null),P(null),M(!1)},[]),Ae=(0,u.useCallback)(async(t,n)=>{if(!(!n||n===t.status)){L(t.id);try{let r=await ee(t.id,n,``,{expectedStatus:t.status,expectedRevision:t.revision}),i=Number(r?.revision??t.revision+1);b(e=>e.map(e=>e.id===t.id&&e.jobId===t.jobId?{...e,status:n,revision:i}:e)),e?.(`Stage updated`,`success`,`Applicant moved to ${n}.`)}catch(t){e?.(`Stage update failed`,`error`,t?.message||`Please try again.`)}finally{L(null)}}},[e]),je=(0,u.useCallback)(e=>{let t=Se[e]||[];return xe.filter(e=>t.includes(e.apiStatus))},[]),Me=(0,u.useCallback)(()=>{let e=W.current;if(!e||typeof window>`u`)return;let t=document.createElement(`iframe`);t.setAttribute(`aria-hidden`,`true`),t.style.position=`fixed`,t.style.right=`0`,t.style.bottom=`0`,t.style.width=`0`,t.style.height=`0`,t.style.border=`0`,document.body.appendChild(t);let n=t.contentDocument;n.open(),n.write(be({title:O?.applicantName||`Resume`,innerHTML:e.innerHTML})),n.close(),t.contentWindow.focus(),t.contentWindow.print(),setTimeout(()=>{document.body.removeChild(t)},1e3)},[O]),J=(0,u.useMemo)(()=>te(O?.coverLetter||``),[O?.coverLetter]),Y=Ee?.resume||null,X=(0,u.useMemo)(()=>we(Y),[Y]),Z=(0,u.useMemo)(()=>Y?he(Y,{template:X}):null,[Y,X]),Q=Y?{name:[Y.firstname,Y.lastname].filter(Boolean).join(` `)||O?.applicantName||`Applicant`,email:Y.email||O?.applicantEmail||``,phone:Y.phone||O?.applicantPhone||``,role:Y.targetRole||Y.occupation||O?.jobTitle||``}:null,$=(0,u.useCallback)(async e=>{let t=Y;if(t?.id){V(``),z(e);try{let n={resumeId:String(t.id),resumeName:X,language:`en`,firstname:t.firstname||``,lastname:t.lastname||``,withAuth:!0,analytics:!1,jobId:O?.jobId??O?.job_id??null,applicationId:O?.applicationId??O?.application_id??O?.id??null};e===`docx`?await pe({...n,endpoint:`/api/public-export-docx`}):await oe({...n,endpoint:`/api/public-export`})}catch(e){let t=e?.code===`EXPORT_NOT_PDF`||e?.code===`EXPORT_NOT_DOCX`;V(t?e.message:`This resume could not be exported. The candidate may not have published it yet.`)}finally{z(null)}}},[Y,X,O]),Ne=(0,u.useCallback)(()=>{$(`pdf`)},[$]),Pe=(0,u.useCallback)(()=>{$(`docx`)},[$]);return n===o.LOADING||n===o.IDLE?(0,p.jsx)(ve,{label:`Loading your applicant pipeline…`}):n===o.ERROR?(0,p.jsx)(c,{error:ye,onRetry:()=>f().catch(()=>{}),title:`We could not load your applicant pipeline`}):m.totalJobs===0?(0,p.jsxs)(`div`,{children:[(0,p.jsx)(s,{eyebrow:`Requisitions & Applicants`,title:`Applicant ATS Pipeline`,description:`Every applicant across your requisitions, with their current hiring stage.`}),(0,p.jsx)(l,{icon:(0,p.jsx)(ne,{className:`h-5 w-5`,"aria-hidden":`true`}),title:`No requisitions to build a pipeline from`,description:`Post your first role and applicants will flow into this pipeline automatically as they apply.`})]}):C?(0,p.jsx)(c,{error:C,onRetry:()=>G(d),title:`We could not load applications for your requisitions`}):(0,p.jsxs)(`div`,{children:[(0,p.jsx)(s,{eyebrow:`Requisitions & Applicants`,title:`Applicant ATS Pipeline`,description:`Every applicant across your requisitions, with their current hiring stage.`,actions:(0,p.jsxs)(`button`,{type:`button`,onClick:()=>{f().then(()=>G(d)).catch(()=>{})},disabled:x,className:`inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 cuba-focusable`,children:[(0,p.jsx)(ae,{className:`h-4 w-4`,"aria-hidden":`true`}),x?`Refreshing…`:`Refresh`]})}),q.length>0&&(0,p.jsx)(`ul`,{className:`mb-4 flex flex-wrap gap-2`,"aria-label":`Pipeline stage summary`,children:q.map(([e,t])=>(0,p.jsxs)(`li`,{className:`capitalize ${h(e)}`,children:[e,`: `,t]},e))}),(0,p.jsxs)(`div`,{className:`rounded-2xl border border-slate-200 bg-white p-4 sm:p-5`,children:[(0,p.jsx)(`label`,{htmlFor:`employer-applicant-search`,className:`sr-only`,children:`Search applicants`}),(0,p.jsxs)(`div`,{className:`relative`,children:[(0,p.jsx)(re,{className:`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400`,"aria-hidden":`true`}),(0,p.jsx)(`input`,{id:`employer-applicant-search`,type:`search`,value:T,onChange:e=>Te(e.target.value),placeholder:`Search by candidate, email, or role`,className:`cuba-field w-full rounded-xl py-2.5 pl-9 pr-3 text-sm placeholder:text-slate-400`})]}),x&&(0,p.jsxs)(`p`,{className:`mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600`,role:`status`,"aria-live":`polite`,children:[`Loading applications for `,m.totalJobs,` requisition`,m.totalJobs===1?``:`s`,`…`]}),!x&&K.length===0&&(0,p.jsx)(`div`,{className:`mt-4`,children:(0,p.jsx)(l,{icon:(0,p.jsx)(ne,{className:`h-5 w-5`,"aria-hidden":`true`}),title:T?`No applicants match your search`:`No applicants yet`,description:T?`Try a different candidate name, email, or role.`:`Once candidates apply to your postings they will appear here with their current pipeline stage.`})}),!x&&K.length>0&&(0,p.jsx)(`div`,{className:`mt-4 overflow-x-auto`,children:(0,p.jsxs)(`table`,{className:`table table-hover align-middle w-full min-w-[40rem] border-collapse text-left text-sm`,children:[(0,p.jsx)(`caption`,{className:`sr-only`,children:`Applicants across your job postings`}),(0,p.jsx)(`thead`,{children:(0,p.jsxs)(`tr`,{className:`border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500`,children:[(0,p.jsx)(`th`,{scope:`col`,className:`py-2.5 pr-4 font-bold`,children:`Candidate`}),(0,p.jsx)(`th`,{scope:`col`,className:`py-2.5 pr-4 font-bold`,children:`Role`}),(0,p.jsx)(`th`,{scope:`col`,className:`py-2.5 pr-4 font-bold`,children:`Resume`}),(0,p.jsx)(`th`,{scope:`col`,className:`py-2.5 pr-4 font-bold`,children:`Stage`}),(0,p.jsx)(`th`,{scope:`col`,className:`py-2.5 pr-4 font-bold`,children:`Applied`}),(0,p.jsx)(`th`,{scope:`col`,className:`py-2.5 font-bold text-right`,children:`Contact`})]})}),(0,p.jsx)(`tbody`,{className:`divide-y divide-slate-100`,children:K.map(e=>(0,p.jsxs)(`tr`,{children:[(0,p.jsxs)(`td`,{className:`py-3 pr-4`,children:[(0,p.jsx)(`span`,{className:`block font-bold text-slate-800`,children:e.applicantName}),e.applicantEmail&&(0,p.jsx)(`span`,{className:`block text-xs text-slate-500`,children:e.applicantEmail})]}),(0,p.jsx)(`td`,{className:`py-3 pr-4 text-slate-700`,children:e.jobTitle}),(0,p.jsx)(`td`,{className:`py-3 pr-4`,children:e.resumeId?(0,p.jsxs)(`button`,{type:`button`,onClick:()=>Oe(e),className:`cuba-btn-primary inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold`,children:[(0,p.jsx)(a,{className:`h-3.5 w-3.5`,"aria-hidden":`true`}),`View Resume`]}):(0,p.jsx)(`span`,{className:`text-xs text-slate-400`,children:`Not attached`})}),(0,p.jsxs)(`td`,{className:`py-3 pr-4`,children:[(0,p.jsx)(`span`,{className:`capitalize ${h(e.status)}`,children:e.status}),(0,p.jsxs)(`label`,{className:`sr-only`,htmlFor:`stage-${e.jobId}-${e.id}`,children:[`Move `,e.applicantName,` to another hiring stage`]}),(0,p.jsxs)(`select`,{id:`stage-${e.jobId}-${e.id}`,value:``,disabled:De===e.id||je(e.status).length===0,onChange:t=>Ae(e,t.target.value),className:`cuba-field mt-1.5 block w-full max-w-[9.5rem] rounded-lg px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60`,children:[(0,p.jsx)(`option`,{value:``,children:`Move stage…`}),je(e.status).map(e=>(0,p.jsx)(`option`,{value:e.apiStatus,children:e.label},`${e.stage}-${e.apiStatus}`))]})]}),(0,p.jsx)(`td`,{className:`py-3 pr-4 text-xs text-slate-600`,children:e.appliedAt?new Date(e.appliedAt).toLocaleDateString():`—`}),(0,p.jsx)(`td`,{className:`py-3 text-right`,children:(0,p.jsxs)(`button`,{type:`button`,onClick:()=>D(e),className:`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 cuba-focusable`,children:[(0,p.jsx)(de,{className:`h-3.5 w-3.5`,"aria-hidden":`true`}),`Message`]})})]},`${e.jobId}-${e.id}`))})]})})]}),E&&(0,p.jsx)(ge,{isOpen:!0,onClose:()=>D(null),applicationId:E.id,applicantName:E.applicantName,showToast:e}),O&&(0,p.jsxs)(`div`,{className:`fixed inset-0 z-[80] flex items-center justify-center p-4`,children:[(0,p.jsx)(`div`,{className:`absolute inset-0 bg-slate-950/60 backdrop-blur-sm`,onClick:ke,"aria-hidden":`true`}),(0,p.jsxs)(`div`,{role:`dialog`,"aria-modal":`true`,"aria-labelledby":`employer-resume-dialog-title`,className:`relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`,children:[(0,p.jsxs)(`header`,{className:`flex flex-wrap items-start gap-3 border-b border-slate-200 px-5 py-4`,children:[(0,p.jsxs)(`div`,{className:`min-w-0 flex-1`,children:[(0,p.jsxs)(`h2`,{id:`employer-resume-dialog-title`,className:`truncate text-base font-bold text-slate-900`,children:[Q?.name||O.applicantName,(0,p.jsx)(`span`,{className:`sr-only`,children:` resume preview`})]}),(0,p.jsxs)(`p`,{className:`mt-0.5 truncate text-xs text-slate-500`,children:[O.jobTitle,Q?.role?` · ${Q.role}`:``]}),(Q?.email||Q?.phone)&&(0,p.jsx)(`p`,{className:`mt-1 truncate text-xs text-slate-600`,children:[Q.email,Q.phone].filter(Boolean).join(` · `)})]}),(0,p.jsxs)(`div`,{className:`flex flex-none items-center gap-1.5`,children:[(0,p.jsx)(`button`,{type:`button`,onClick:()=>I(e=>Math.max(g,e-v)),disabled:!Z||F<=g,"aria-label":`Zoom out resume preview`,className:`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cuba-focusable`,children:(0,p.jsx)(ue,{className:`h-4 w-4`,"aria-hidden":`true`})}),(0,p.jsxs)(`span`,{className:`w-12 text-center text-xs font-bold text-slate-600`,"aria-live":`polite`,children:[F,`%`]}),(0,p.jsx)(`button`,{type:`button`,onClick:()=>I(e=>Math.min(_,e+v)),disabled:!Z||F>=_,"aria-label":`Zoom in resume preview`,className:`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cuba-focusable`,children:(0,p.jsx)(fe,{className:`h-4 w-4`,"aria-hidden":`true`})}),(0,p.jsxs)(`button`,{type:`button`,onClick:Me,disabled:!Z,className:`inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cuba-focusable`,children:[(0,p.jsx)(se,{className:`h-4 w-4`,"aria-hidden":`true`}),`Print`]}),(0,p.jsxs)(`button`,{type:`button`,onClick:Ne,disabled:!Z||R!==null,"aria-label":`Download candidate resume as PDF`,className:`inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cuba-focusable`,children:[(0,p.jsx)(ie,{className:`h-4 w-4`,"aria-hidden":`true`}),R===`pdf`?`Preparing…`:`PDF`]}),(0,p.jsxs)(`button`,{type:`button`,onClick:Pe,disabled:!Z||R!==null,"aria-label":`Download candidate resume as Word DOCX`,className:`inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cuba-focusable`,children:[(0,p.jsx)(a,{className:`h-4 w-4`,"aria-hidden":`true`}),R===`docx`?`Preparing…`:`Word`]}),(0,p.jsx)(`button`,{type:`button`,onClick:ke,"aria-label":`Close resume preview`,className:`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition-colors hover:bg-slate-50 cuba-focusable`,children:(0,p.jsx)(ce,{className:`h-4 w-4`,"aria-hidden":`true`})})]})]}),!j&&!N&&Z&&J&&(0,p.jsx)(`div`,{role:`tablist`,"aria-label":`Candidate documents`,className:`flex flex-none gap-1 border-b border-slate-200 bg-white px-4 pt-3`,children:[{id:`resume`,label:`Resume`},{id:`cover`,label:`Cover letter`}].map(e=>(0,p.jsx)(`button`,{type:`button`,role:`tab`,id:`recruiter-tab-${e.id}`,"aria-selected":H===e.id,"aria-controls":`recruiter-panel-${e.id}`,tabIndex:H===e.id?0:-1,onClick:()=>U(e.id),onKeyDown:e=>{let t=[`resume`,`cover`];if(![`ArrowLeft`,`ArrowRight`,`Home`,`End`].includes(e.key))return;e.preventDefault();let n=t.indexOf(H),r=e.key===`Home`?0:e.key===`End`?t.length-1:(n+(e.key===`ArrowRight`?1:-1)+t.length)%t.length;U(t[r])},className:`-mb-px rounded-t-lg border border-b-0 px-3 py-2 text-xs font-bold transition-colors cuba-focusable ${H===e.id?`border-slate-200 bg-slate-50 text-slate-900`:`border-transparent text-slate-500 hover:text-slate-800`}`,children:e.label},e.id))}),B&&(0,p.jsx)(`p`,{role:`alert`,className:`flex-none border-b border-rose-200 bg-rose-50 px-5 py-2 text-xs font-bold text-rose-700`,children:B}),(0,p.jsxs)(`div`,{role:`tabpanel`,id:`recruiter-panel-resume`,"aria-labelledby":`recruiter-tab-resume`,hidden:!!J&&H!==`resume`,className:`min-h-0 flex-1 overflow-auto bg-slate-100 p-4`,children:[j&&(0,p.jsx)(`p`,{role:`status`,"aria-live":`polite`,className:`py-16 text-center text-sm text-slate-500`,children:`Loading candidate resume…`}),!j&&N&&(0,p.jsx)(`p`,{role:`alert`,className:`py-16 text-center text-sm font-bold text-rose-600`,children:N.message||`This resume could not be loaded.`}),!j&&!N&&!Y&&(0,p.jsx)(`p`,{role:`status`,className:`py-16 text-center text-sm text-slate-500`,children:`No resume was attached to this application.`}),!j&&!N&&Z&&(0,p.jsx)(`div`,{"data-testid":`employer-resume-canvas`,className:`min-h-0 flex-1 overflow-auto bg-slate-100 p-4`,children:(0,p.jsx)(`div`,{ref:W,"data-testid":`employer-resume-page`,className:`mx-auto bg-white shadow-sm`,style:{width:`${Ce}px`,zoom:F/100},children:(0,p.jsx)(me,{templateId:X,values:Z,language:`en`,loadingFallback:(0,p.jsx)(`div`,{className:`flex min-h-48 items-center justify-center bg-slate-50 p-6 text-sm text-slate-500`,children:`Loading template…`}),errorFallback:(0,p.jsx)(`div`,{role:`alert`,className:`flex min-h-48 items-center justify-center bg-slate-50 p-6 text-sm text-slate-600`,children:`This resume template could not be rendered.`})})})})]}),J&&(0,p.jsx)(`div`,{role:`tabpanel`,id:`recruiter-panel-cover`,"aria-labelledby":`recruiter-tab-cover`,hidden:H!==`cover`,className:`min-h-0 flex-1 overflow-auto bg-slate-100 p-4`,children:(0,p.jsxs)(`section`,{className:`mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm`,children:[(0,p.jsx)(`h3`,{className:`text-xs font-bold uppercase tracking-wide text-slate-500`,children:`Cover letter`}),(0,p.jsx)(`div`,{className:`mt-3 max-w-none text-sm leading-relaxed text-slate-700 [&_p]:mb-3`,dangerouslySetInnerHTML:{__html:J}})]})})]})]})]})};export{y as default};