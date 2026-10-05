import { spawnSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const ROOT=process.cwd();
const V={BASELINE:'vite.config.js',SCOPED:'vite.dir047probe7.config.js'};
function purge(){for(const d of ['node_modules/.vite','dist'])fs.rmSync(path.join(ROOT,d),{recursive:true,force:true});}
function cssOf(){const a=path.join(ROOT,'dist/assets');
  return fs.readdirSync(a).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join(a,f),'utf8')).join('\n');}
const rounds=[];const R=3;
for(let r=0;r<R;r++){const row={};
 for(const [n,cfg] of Object.entries(V)){purge();
  const t=process.hrtime.bigint();
  const res=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config',cfg],{cwd:ROOT,encoding:'utf8'});
  const wall=Math.round(Number(process.hrtime.bigint()-t)/1e6);
  const m=`${res.stdout||''}${res.stderr||''}`.match(/built in ([\d.]+)s/);
  const css=cssOf();
  row[n]={wallMs:wall,viteMs:m?Math.round(Number(m[1])*1000):null,exit:res.status,cssBytes:Buffer.byteLength(css),
    classes:[...new Set([...css.matchAll(/\.((?:[a-z0-9\\\\-]+:)*[a-zA-Z0-9_-]{1,80})(?=[{,:\s>~+.\[])/g)].map(m=>m[1].replace(/\\\\/g,'')))].sort()};
 }
 rounds.push(row);
 console.log(`round ${r+1}: `+Object.entries(row).map(([k,v])=>`${k} wall=${v.wallMs} vite=${v.viteMs} exit=${v.exit} cssB=${v.cssBytes} cls=${v.classes.length}`).join(' | '));
}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)];};
const b=rounds[0].BASELINE.classes,s=rounds[0].SCOPED.classes;
const bs=new Set(b),ss=new Set(s);
const missing=b.filter(c=>!ss.has(c));
const added=s.filter(c=>!bs.has(c));
const sum={};
for(const n of Object.keys(V)){const w=rounds.map(r=>r[n].wallMs),v=rounds.map(r=>r[n].viteMs);
 sum[n]={medianWallMs:med(w),medianViteMs:med(v),walls:w,cssBytes:rounds[0][n].cssBytes,classes:rounds[0][n].classes.length,allExitZero:rounds.every(r=>r[n].exit===0)};}
sum.deltaWallMs=sum.SCOPED.medianWallMs-sum.BASELINE.medianWallMs;
const out={generatedAt:new Date().toISOString(),rounds:rounds.map(r=>({BASELINE:{wallMs:r.BASELINE.wallMs,viteMs:r.BASELINE.viteMs,exit:r.BASELINE.exit,cssBytes:r.BASELINE.cssBytes,classes:r.BASELINE.classes.length},SCOPED:{wallMs:r.SCOPED.wallMs,viteMs:r.SCOPED.viteMs,exit:r.SCOPED.exit,cssBytes:r.SCOPED.cssBytes,classes:r.SCOPED.classes.length}})),summary:sum,cssClassDiff:{baselineCount:b.length,scopedCount:s.length,missingFromScoped:missing.length,addedInScoped:added.length,missingSample:missing.slice(0,40),addedSample:added.slice(0,40)}};
fs.writeFileSync(path.join(ROOT,'.bridge/evidence/dir047-tailwind-scope-ab.json'),JSON.stringify(out,null,2));
console.log('\nMEDIAN wall baseline',sum.BASELINE.medianWallMs,'scoped',sum.SCOPED.medianWallMs,'delta',sum.deltaWallMs);
console.log('CSS classes baseline',b.length,'scoped',s.length,'| MISSING',missing.length,'| ADDED',added.length);
if(missing.length)console.log('MISSING SAMPLE:',missing.slice(0,30).join(', '));
