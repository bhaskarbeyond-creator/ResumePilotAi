import base from "./vite.config.js";
const ids = new Map();
const t0 = performance.now();
const p = { name: "g", buildStart(){}, async transform(code, id){ const m = id.replace(/\\/g,"/"); const mm = m.match(/node_modules\/((@[^/]+\/[^/]+)|([^/]+))/); const k = mm ? mm[1] : (m.includes("/src/") ? "APP_SRC" : "OTHER"); ids.set(k, (ids.get(k)||0)+1); return null; }, buildEnd(){ console.log("GRAPH "+JSON.stringify({totalMs:Math.round(performance.now()-t0), mods:[...ids].sort((a,b)=>b[1]-a[1]) })); } };
export default { ...base, plugins: [...base.plugins, p] };
