import { json, withCORS, getCookie, bytesToHex, hexToBytes, mulberry32, ymdUTC } from "./helpers";
export { RoomDO } from "./room";
export { SessionDO } from "./session";
export { LeaderboardDO } from "./leaderboard";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return withCORS(new Response(null, {status:204}));
    try {
      if (url.pathname === "/api/register" && request.method === "POST") return withCORS(await register(request, env));
      if (url.pathname === "/api/login" && request.method === "POST") return withCORS(await login(request, env));
      if (url.pathname === "/api/logout" && request.method === "POST") return withCORS(await logout(env));
      if (url.pathname === "/api/me") return withCORS(await me(request, env));

      if (url.pathname === "/api/daily" && request.method === "GET") return withCORS(await getDaily(env));
      if (url.pathname === "/api/daily/submit" && request.method === "POST") return withCORS(await dailySubmit(request, env));

      if (url.pathname === "/api/practice/submit" && request.method === "POST") return withCORS(await practiceSubmit(request, env));

      if (url.pathname === "/api/leaderboard/global") return withCORS(await globalLeaderboard(env, url));
      if (url.pathname === "/api/leaderboard/daily")  return withCORS(await dailyLeaderboard(env, url));

      if (url.pathname === "/ws"){
        const uid = await authUserId(request, env);
        const name = (await usernameOf(uid, env)) || "guest";
        const id = env.ROOM_DO.idFromName((url.searchParams.get("room")||"public"));
        const stub = env.ROOM_DO.get(id);
        const target = new URL("https://do/room/ws");
        target.searchParams.set("name", name);
        if (uid) target.searchParams.set("uid", String(uid));
        return stub.fetch(target.toString(), { headers: request.headers });
      }

      return withCORS(json({error:"not found"}, 404));
    } catch (e:any) {
      return withCORS(json({error: e?.message || "server error"}, 500));
    }
  },
  async scheduled(_: ScheduledController, env: Env, __: ExecutionContext){
    await ensureDaily(env);
  }
};

// ---------- Auth & Session ----------
async function setSessionCookie(userId: number, env: Env) {
  const sid = crypto.randomUUID();
  const id = env.SESSION_DO.idFromName(sid);
  const stub = env.SESSION_DO.get(id);
  await stub.fetch("https://do/session/set", { method:"POST", body: JSON.stringify({ userId, ts: Date.now() }) });
  return new Response(JSON.stringify({ ok:true }), {
    headers: {
      "Content-Type":"application/json",
      "Set-Cookie": `sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600`
    }
  });
}

async function authUserId(req: Request, env: Env): Promise<number|null> {
  const cookiesid = getCookie(req, "sid");
  if (!cookiesid) return null;
  const id = env.SESSION_DO.idFromName(cookiesid);
  const stub = env.SESSION_DO.get(id);
  const r = await stub.fetch("https://do/session/get");
  if (!r.ok) return null;
  const { userId } = await r.json();
  return userId ?? null;
}

async function usernameOf(uid: number|null, env: Env): Promise<string|null>{
  if (!uid) return null;
  const row = await env.DB.prepare("SELECT username FROM users WHERE id=?1").bind(uid).first<{username:string}>();
  return row?.username || null;
}

async function hashPassword(pw: string, saltHex?: string) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), {name:"PBKDF2"}, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2", hash:"SHA-256", salt, iterations:150_000}, key, 256);
  const hash = new Uint8Array(bits);
  return { salt: bytesToHex(salt), hash: bytesToHex(hash) };
}

async function register(req: Request, env: Env){
  const { username, password } = await req.json();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return json({error:"bad username"}, 400);
  if ((password??"").length < 6) return json({error:"weak password"}, 400);
  const { salt, hash } = await hashPassword(password);
  const now = Date.now();
  try {
    await env.DB.prepare("INSERT INTO users (username, pass_hash, created_at) VALUES (?1, ?2, ?3)")
      .bind(username, `${salt}:${hash}`, now).run();
  } catch (e:any) {
    if ((e.message||"").includes("UNIQUE")) return json({error:"username exists"}, 409);
    throw e;
  }
  const user = await env.DB.prepare("SELECT id FROM users WHERE username=?1").bind(username).first<{id:number}>();
  return setSessionCookie(user!.id, env);
}

async function login(req: Request, env: Env){
  const { username, password } = await req.json();
  const u = await env.DB.prepare("SELECT id, pass_hash FROM users WHERE username=?1").bind(username).first<{id:number, pass_hash:string}>();
  if (!u) return json({error:"not found"}, 404);
  const [salt, saved] = u.pass_hash.split(":");
  const { hash } = await hashPassword(password, salt);
  if (hash !== saved) return json({error:"wrong password"}, 401);
  return setSessionCookie(u.id, env);
}

async function logout(env: Env){
  return new Response(JSON.stringify({ok:true}), {
    headers: { "Content-Type":"application/json", "Set-Cookie": `sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` }
  });
}

async function me(req: Request, env: Env){
  const uid = await authUserId(req, env);
  if (!uid) return json({user:null});
  const u = await env.DB.prepare("SELECT id, username FROM users WHERE id=?1").bind(uid).first<{id:number, username:string}>();
  const rating = await env.DB.prepare("SELECT total_score FROM rating WHERE user_id=?1").bind(uid).first<{total_score:number}>();
  const vr = await env.DB.prepare("SELECT elo FROM versus_rating WHERE user_id=?1").bind(uid).first<{elo:number}>();
  return json({ user: { id: u!.id, username: u!.username, totalScore: rating?.total_score||0, elo: vr?.elo||1500 } });
}

// ---------- Daily Ten ----------
async function ensureDaily(env: Env){
  const ymd = ymdUTC();
  const exists = await env.DB.prepare("SELECT 1 FROM daily_sets WHERE ymd=?1").bind(ymd).first();
  if (exists) return;
  const seed = crypto.randomUUID().slice(0,8);
  const data = generateDailySet(seed);
  await env.DB.prepare("INSERT INTO daily_sets (ymd, seed, data_json, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(ymd, seed, JSON.stringify(data), Date.now()).run();
  await env.DAILY_KV.put(`daily:${ymd}`, JSON.stringify({seed, questions: data}), { expirationTtl: 86400*3 });
}

function generateDailySet(seed: string){
  // deterministic 10 puzzles by seed
  const s = parseInt(seed.slice(0,8), 16) >>> 0;
  const rnd = mulberry32(s);
  const qs = [];
  for (let i=0;i<10;i++){
    const nums = Array.from({length:4}, ()=> 1 + Math.floor(rnd()*13));
    const par = 8 + Math.floor(rnd()*20); // 8..27
    qs.push({ id: i, nums, par });
  }
  return qs;
}

function calcScore(par: number, usedSec: number){
  const timeFactor = Math.max(0.6, Math.min(1.4, par / Math.max(usedSec, 1)));
  const parBoost = Math.pow(Math.max(par, 1), 0.8);
  const base = 10;
  return Math.round(base * timeFactor * parBoost);
}

async function getDaily(env: Env){
  const ymd = ymdUTC();
  const kv = await env.DAILY_KV.get(`daily:${ymd}`);
  if (kv) return json(JSON.parse(kv));
  const row = await env.DB.prepare("SELECT seed, data_json FROM daily_sets WHERE ymd=?1").bind(ymd).first<{seed:string, data_json:string}>();
  if (!row) { await ensureDaily(env); return getDaily(env); }
  return json({ seed: row.seed, questions: JSON.parse(row.data_json) });
}

async function dailySubmit(req: Request, env: Env){
  const uid = await authUserId(req, env);
  if (!uid) return json({error:"unauthorized"}, 401);
  const { ymd, records } = await req.json();
  if (!Array.isArray(records) || records.length !== 10) return json({error:"need 10"}, 400);
  const done = await env.DB.prepare("SELECT 1 FROM attempts WHERE user_id=?1 AND mode='ranked' AND seed=?2").bind(uid, `daily:${ymd}`).first();
  if (done) return json({error:"already-submitted"}, 409);
  let total = 0;
  const now = Date.now();
  const stmts = [];
  for (const r of records){
    const score = r.correct ? calcScore(r.par, r.usedSec) : 0;
    total += score;
    stmts.push(env.DB.prepare(`INSERT INTO attempts (user_id, mode, seed, question_index, used_time_ms, correct, par, score, created_at)
      VALUES (?1,'ranked',?2,?3,?4,?5,?6,?7,?8)`)
      .bind(uid, `daily:${ymd}`, r.questionIndex, Math.round(r.usedSec*1000), r.correct?1:0, r.par, score, now));
  }
  await env.DB.batch(stmts);
  await env.DB.prepare(`
    INSERT INTO rating (user_id, total_score, daily_best_json, updated_at)
    VALUES (?1, ?2, json_object(?3, ?4), ?5)
    ON CONFLICT(user_id) DO UPDATE SET
      total_score = rating.total_score + excluded.total_score,
      daily_best_json = json_patch(rating.daily_best_json, json_object(?3, ?4)),
      updated_at = ?5
  `).bind(uid, total, ymd, total, now).run();
  return json({ ok:true, total });
}

// ---------- Practice ----------
async function practiceSubmit(req: Request, env: Env){
  const uid = await authUserId(req, env);
  if (!uid) return json({error:"unauthorized"}, 401);
  const { seed, usedSec, correct, par } = await req.json();
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO attempts (user_id, mode, seed, question_index, used_time_ms, correct, par, score, created_at)
      VALUES (?1,'practice',?2,NULL,?3,?4,?5,0,?6)`)
    .bind(uid, seed, Math.round((usedSec||0)*1000), correct?1:0, par||10, now).run();
  return json({ok:true});
}

// ---------- Leaderboards ----------
async function globalLeaderboard(env: Env, url: URL){
  const limit = Math.min(200, Number(url.searchParams.get("limit")||"100"));
  const list = await env.DB.prepare(`
    SELECT u.username, r.total_score FROM rating r
    JOIN users u ON u.id=r.user_id
    ORDER BY r.total_score DESC
    LIMIT ?1
  `).bind(limit).all<{username:string,total_score:number}>();
  return json({ list: list.results });
}

async function dailyLeaderboard(env: Env, url: URL){
  const ymd = url.searchParams.get("ymd") || ymdUTC();
  const limit = Math.min(200, Number(url.searchParams.get("limit")||"100"));
  const list = await env.DB.prepare(`
    SELECT u.username, SUM(a.score) as score FROM attempts a
    JOIN users u ON u.id=a.user_id
    WHERE a.mode='ranked' AND a.seed=?1
    GROUP BY a.user_id
    ORDER BY score DESC
    LIMIT ?2
  `).bind(`daily:${ymd}`, limit).all<{username:string,score:number}>();
  return json({ ymd, list: list.results });
}
