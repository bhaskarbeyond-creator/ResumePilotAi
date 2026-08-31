const http = require("http");
const fs = require("fs");
const ROLES = [
  {e:"user@test.test",r:"USER"},{e:"employer@resumepilot.test",r:"EMPLOYER"},
  {e:"ent-member@resumepilot.test",r:"ENTERPRISE_MEMBER"},{e:"ent-admin@resumepilot.test",r:"ENTERPRISE_ADMIN"},
  {e:"support@resumepilot.test",r:"SUPPORT"},{e:"auditor@resumepilot.test",r:"AUDITOR"},
  {e:"admin@resumepilot.test",r:"ADMIN"},{e:"superadmin@resumepilot.test",r:"SUPER_ADMIN"}];
function request(method, path, token, body){
  return new Promise(resolve => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({host:"127.0.0.1",port:8080,method,path,headers:{...(token?{Authorization:"Bearer "+token}:{}),"Content-Type":"application/json",...(data?{"Content-Length":data.length}:{})}},resp => {
      let b=""; resp.on("data",c=>b+=c); resp.on("end",()=>{let p;try{p=JSON.parse(b)}catch{p=b}resolve({status:resp.statusCode,data:p})});
    });
    req.on("error",()=>resolve({status:0,data:null}));
    if(data)req.write(data);
    req.end();
  });
}
async function login(email){
  const r = await request("POST","/api/auth/preview-login",null,{email,password:"password123"});
  if(r.status!==200||!r.data.token) throw new Error("login failed for "+email+": "+r.status);
  return r.data.token;
}
(async()=>{
  const md = fs.readFileSync("/home/user/ResumePilotAi/docs/forensic/final/FINAL_ROUTE_MATRIX.md","utf8");
  const paths = [...md.matchAll(/`(\/api\/[^`]+)`/g)].map(m=>m[1]);
  const unique = [...new Set(paths)];
  console.log("Probing", unique.length, "unique API paths as 8 roles...");
  const tokens = {};
  for(const r of ROLES) tokens[r.r] = await login(r.e);
  const issues = [];
  for(const p of unique){
    if(p.startsWith("/api/auth/preview-login")) continue;
    for(const r of ["USER","EMPLOYER","ENTERPRISE_MEMBER"]){
      const res = await request("GET",p,tokens[r]);
      if(p.startsWith("/api/admin") && res.status<400 && res.status!==404 && ![401,403].includes(res.status)){
        issues.push(`LEAK ${r} GET ${p} -> ${res.status}`);
      }
    }
  }
  if(issues.length){
    console.log("\nISSUES FOUND:", issues.length);
    for(const i of issues) console.log(" ",i);
  } else {
    console.log("\nNo unauthorized-role leaks on admin paths.");
  }
})();
