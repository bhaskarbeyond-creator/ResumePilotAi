const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
const L=h=>{const n=parseInt(h.slice(1),16);return 0.2126*lin(n>>16&255)+0.7152*lin(n>>8&255)+0.0722*lin(n&255)};
const C=(a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05))};
const pairs=[
 ["#ffffff on #7366ff (RAW brand - current tab pills / nav active)", "#ffffff","#7366ff"],
 ["#ffffff on #5949d6 (primary-fill)", "#ffffff","#5949d6"],
 ["#ffffff on #6455f5 (token gradient start)", "#ffffff","#6455f5"],
 ["#ffffff on #5243cc (token gradient end)", "#ffffff","#5243cc"],
 ["#ffffff on #4b3ec4 (ink-strong)", "#ffffff","#4b3ec4"],
 ["#14121f on #a49cff (DARK on-primary)", "#14121f","#a49cff"],
 ["#14121f on #8278f2 (DARK gradient end)", "#14121f","#8278f2"],
 ["#5949d6 on #ffffff (hero white btn label)", "#5949d6","#ffffff"],
];
for(const [label,f,b] of pairs){const r=C(f,b);console.log((r>=4.5?"PASS":"FAIL")+"  "+r.toFixed(2)+":1  "+label);}
