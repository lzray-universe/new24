
(() => {
  const API = location.origin;
  function h(tag, attrs={}, ...kids){
    const el = document.createElement(tag);
    Object.entries(attrs||{}).forEach(([k,v])=>{
      if (k==="style" && typeof v==="object"){ Object.assign(el.style, v); }
      else if (k.startsWith("on") && typeof v==="function"){ el.addEventListener(k.slice(2), v); }
      else el.setAttribute(k, v);
    });
    kids.flat().forEach(k=> el.append(typeof k==="string"?document.createTextNode(k):k));
    return el;
  }
  async function fetchJSON(url, opt={}){
    const r = await fetch(url, { credentials:"include", ...opt });
    const t = await r.text();
    try { return JSON.parse(t); } catch { return {error:"bad json", raw:t}; }
  }
  function showToast(msg){
    const div = h("div",{style:{position:"fixed",left:"50%",top:"20px",transform:"translateX(-50%)",
      background:"var(--card-bg, rgba(0,0,0,.7))",color:"var(--fg,#fff)",padding:"10px 14px",borderRadius:"8px",zIndex:999999}},
      msg);
    document.body.appendChild(div);
    setTimeout(()=>div.remove(), 1800);
  }

  // Floating panel
  const panel = h("div", {id:"overlay24", style:{
    position:"fixed", right:"16px", bottom:"16px", width:"320px", maxHeight:"70vh",
    overflow:"auto", background:"rgba(20,22,25,.85)", backdropFilter:"blur(6px)",
    color:"#fff", border:"1px solid #8884", borderRadius:"12px", padding:"12px", zIndex:999999
  }});
  const title = h("div",{style:{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px"}},
    h("strong",{},"24点 · 登录/每日/排行/联机"),
    h("button",{id:"ov-close", style:{background:"transparent", border:"1px solid #8886", color:"inherit", borderRadius:"8px", padding:"2px 8px"}, onclick:()=>panel.remove()},"×")
  );
  const userBar = h("div",{id:"ov-user", style:{margin:"6px 0"}},"未登录");
  const loginRow = h("div",{style:{display:"flex", gap:"6px", marginBottom:"8px"}},
    h("input",{id:"ov-usern", placeholder:"用户名", style:{flex:"1 1 auto", padding:"6px 8px", borderRadius:"8px", border:"1px solid #8886"}}),
    h("input",{id:"ov-pass", type:"password", placeholder:"密码", style:{flex:"1 1 auto", padding:"6px 8px", borderRadius:"8px", border:"1px solid #8886"}})
  );
  const actRow = h("div",{style:{display:"flex", gap:"6px", marginBottom:"8px"}},
    h("button",{onclick:async()=>{
      const body = JSON.stringify({username:document.getElementById("ov-usern").value.trim(), password:document.getElementById("ov-pass").value});
      const r = await fetchJSON(API+"/api/login",{method:"POST", headers:{'Content-Type':'application/json'}, body});
      showToast(r.error||"登录成功"); if(!r.error) refreshMe();
    }},"登录"),
    h("button",{onclick:async()=>{
      const body = JSON.stringify({username:document.getElementById("ov-usern").value.trim(), password:document.getElementById("ov-pass").value});
      const r = await fetchJSON(API+"/api/register",{method:"POST", headers:{'Content-Type':'application/json'}, body});
      showToast(r.error||"注册成功"); if(!r.error) refreshMe();
    }},"注册"),
    h("button",{onclick:async()=>{await fetchJSON(API+"/api/logout",{method:"POST"}); refreshMe();}},"退出")
  );
  const tabs = h("div",{style:{display:"flex", gap:"6px", marginBottom:"8px"}},
    h("button",{id:"t-pr"}, "练习"),
    h("button",{id:"t-dl"}, "每日十题"),
    h("button",{id:"t-rk"}, "排行榜"),
    h("button",{id:"t-on"}, "联机(新)"),
  );
  const box = h("div",{id:"ov-box"});
  panel.append(title, userBar, loginRow, actRow, tabs, box);
  document.addEventListener("keydown", (e)=>{ if(e.key==="F10"){ if(document.getElementById("overlay24")) panel.remove(); else document.body.append(panel);} });
  document.body.append(panel);

  async function refreshMe(){
    const r = await fetchJSON(API+"/api/me");
    userBar.textContent = r.user ? `${r.user.username} · 总分 ${r.user.totalScore} · Elo ${Math.round(r.user.elo)}` : "未登录";
  }
  refreshMe();

  // Views
  function viewPractice(){
    const nums = ()=> Array.from({length:4}, ()=> 1 + Math.floor(Math.random()*13));
    let cur = nums();
    const par = 12;
    const sec = h("input",{type:"number", value:"30", style:{width:"70px"}});
    const ok = h("select",{}, h("option",{value:"1"},"正确"), h("option",{value:"0"},"错误"));
    const cont = h("div",{},
      h("div",{}, "数字：", h("b", {id:"pr-nums"}, cur.join(", ")), " ",
        h("button",{onclick:()=>{cur=nums(); document.getElementById('pr-nums').textContent=cur.join(', ');} },"换一题"),
        h("button",{onclick:()=>alert("这里显示解答（占位）")},"查看解答")
      ),
      h("div",{},"用时(秒)：", sec, "  正确？", ok, " ",
        h("button",{onclick:async()=>{
          const r = await fetchJSON(API+"/api/practice/submit",{method:"POST", headers:{'Content-Type':'application/json'},
            credentials:"include", body: JSON.stringify({ seed:"practice:"+Date.now(), usedSec:Number(sec.value||0), correct: ok.value==="1", par })});
          showToast(r.error||"记录成功");
        }},"提交记录")
      )
    );
    return cont;
  }

  function viewDaily(){
    const wrap = h("div",{});
    const loadBtn = h("button",{onclick: load},"载入今日题目");
    const subBtn = h("button",{disabled:true, style:{marginLeft:"6px"}}, "提交 10/10");
    const list = h("div",{});
    wrap.append(loadBtn, subBtn, list);
    let recs = [];
    let ymd = (new Date()).toISOString().slice(0,10);
    async function load(){
      const d = await fetchJSON(API+"/api/daily");
      list.innerHTML="";
      recs = d.questions.map((q,i)=>({questionIndex:i, usedSec:30, correct:false, par:q.par}));
      d.questions.forEach((q,i)=>{
        const row = h("div",{}, `题${i+1}: [${q.nums.join(", ")}]  PAR=${q.par}  用时`, h("input",{type:"number", value:"30", style:{width:"70px", margin:"0 6px"}, oninput:(e)=>{recs[i].usedSec=Number(e.target.value||0);}}),
          "正确？", h("select",{onchange:(e)=>{recs[i].correct=(e.target.value==="1");}}, h("option",{value:"1"},"是"), h("option",{value:"0"},"否")));
        list.append(row);
      });
      subBtn.disabled=false;
    }
    subBtn.onclick = async ()=>{
      const r = await fetchJSON(API+"/api/daily/submit",{method:"POST", headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ymd, records: recs })});
      showToast(r.error || ("提交成功，总分 "+r.total));
    };
    return wrap;
  }

  function viewRank(){
    const wrap = h("div",{});
    const g = h("button",{onclick: async ()=>{
      const r = await fetchJSON(API+"/api/leaderboard/global");
      render(r.list.map(x=>({u:x.username, s:x.total_score})));
    }},"总分榜");
    const d = h("button",{style:{marginLeft:"6px"}, onclick: async ()=>{
      const r = await fetchJSON(API+"/api/leaderboard/daily");
      render(r.list.map(x=>({u:x.username, s:x.score})));
    }},"今日日榜");
    const table = h("table",{style:{width:"100%", marginTop:"6px"}}, h("thead",{}, h("tr",{}, h("th",{},"#"), h("th",{},"用户名"), h("th",{},"分数"))), h("tbody",{}));
    function render(list){
      const tb = table.querySelector("tbody"); tb.innerHTML="";
      list.forEach((row,i)=>{
        tb.append(h("tr",{}, h("td",{}, String(i+1)), h("td",{}, row.u), h("td",{}, String(row.s))));
      });
    }
    wrap.append(g, d, table);
    return wrap;
  }

  function viewOnline(){
    const wrap = h("div",{});
    const rid = h("input",{placeholder:"房间号，留空为 public"});
    const join = h("button",{onclick: connect},"加入/创建");
    const start = h("button",{style:{marginLeft:"6px"}, onclick:()=> ws && ws.send(JSON.stringify({type:'start'}))},"开始一局");
    const log = h("div",{style:{minHeight:'80px', marginTop:'6px'}});
    wrap.append(rid, join, start, log);
    let ws = null;
    function connect(){
      const room = rid.value.trim() || "public";
      ws = new WebSocket(API.replace("http","ws") + "/ws?room="+encodeURIComponent(room));
      ws.onmessage = ev => { const m = JSON.parse(ev.data); log.append(h("div",{}, JSON.stringify(m))); };
    }
    return wrap;
  }

  function mount(view){ box.innerHTML=""; box.append(view); }
  document.getElementById("t-pr").onclick = ()=> mount(viewPractice());
  document.getElementById("t-dl").onclick = ()=> mount(viewDaily());
  document.getElementById("t-rk").onclick = ()=> mount(viewRank());
  document.getElementById("t-on").onclick = ()=> mount(viewOnline());
  mount(viewDaily());
})();
