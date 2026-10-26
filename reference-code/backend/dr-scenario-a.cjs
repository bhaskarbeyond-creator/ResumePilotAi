#!/usr/bin/env node
'use strict';
const http = require('http');
const { execSync } = require('child_process');
const PM2 = '/home/u727965524/.local/bin/pm2';
const PORT = 8080; // Production runs on port 8080, not 3000

function httpGet(p) {
  return new Promise(r => {
    const req = http.get({hostname:'127.0.0.1',port:PORT,path:p,timeout:3000}, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>r({s:res.statusCode,b:d}));
    });
    req.on('error',e=>r({s:0,e:e.message}));
    req.on('timeout',()=>{req.destroy();r({s:0,e:'timeout'})});
  });
}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}

async function run(){
  // Pre-check
  const pre = await httpGet('/api/healthz');
  console.log('Pre-check: status=' + pre.s);
  if (pre.s !== 200) {
    console.log('ERROR: App not healthy before test. Aborting.');
    return;
  }

  // T0: Stop PM2
  const t0 = Date.now();
  console.log('T0 (failure):', new Date().toISOString());
  try { execSync(PM2 + ' stop airesume-backend 2>/dev/null', {timeout:10000}); } catch(_){}
  console.log('PM2 stopped');

  // Verify outage
  await wait(300);
  const outage = await httpGet('/api/healthz');
  console.log('Outage verified: status=' + outage.s + ' error=' + (outage.e||'none'));

  // T1: Start recovery
  const t1 = Date.now();
  console.log('T1 (recovery start):', new Date().toISOString());
  try { execSync(PM2 + ' start airesume-backend 2>/dev/null', {timeout:10000}); } catch(_){}

  // Poll for recovery (up to 30 seconds)
  let ok = false, hp;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    hp = await httpGet('/api/healthz');
    if (hp.s === 200) { ok = true; break; }
  }

  const t5 = Date.now();
  console.log('T5 (health verified):', new Date().toISOString());
  console.log('Recovered:', ok);
  console.log('Total_ms:', t5 - t0);
  console.log('T0_T1_ms:', t1 - t0);
  console.log('T1_T5_ms:', t5 - t1);

  if (ok) {
    try {
      const h = JSON.parse(hp.b);
      console.log('Health:', h.status, 'SHA:', h.commitSha, 'DB:', h.authoritativeDatabase);
    } catch(_){}
    const rdy = await httpGet('/api/readyz');
    try {
      const r = JSON.parse(rdy.b);
      console.log('Ready:', r.status, 'MySQL:', r.checks?.mysql?.status, r.checks?.mysql?.latencyMs + 'ms', 'Schema:', r.checks?.schema);
    } catch(_){}
  }
}
run().catch(e => { console.error(e); process.exit(1); });
