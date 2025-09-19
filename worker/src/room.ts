type Player = { id: string, userId: number|null, name: string, ws: WebSocket };
type RoundResult = { id: string, correct: boolean, usedSec: number };

export class RoomDO {
  state: DurableObjectState;
  env: Env;
  players = new Map<string, Player>();
  roundId = 0;
  constructor(state: DurableObjectState, env: Env){
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async ()=>{});
  }
  broadcast(msg: any){
    const data = JSON.stringify(msg);
    for (const p of this.players.values()){
      try { p.ws.send(data); } catch {}
    }
  }
  async fetch(req: Request){
    const url = new URL(req.url);
    if (url.pathname.endsWith("/ws")){
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // accept
      server.accept();
      // basic join
      const pid = crypto.randomUUID();
      const name = url.searchParams.get("name") || ("guest-" + pid.slice(0,4));
      const userId = Number(url.searchParams.get("uid") || "") || null;
      const player = { id: pid, name, userId, ws: server };
      this.players.set(pid, player);
      server.addEventListener("message", (ev)=>this.onMessage(player, ev));
      server.addEventListener("close", ()=>{ this.players.delete(pid); this.broadcast({type:"leave", id: pid}); });
      // notify
      this.broadcast({type:"join", id: pid, name});
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("not found", { status:404 });
  }
  async onMessage(p: Player, ev: MessageEvent){
    let msg: any;
    try { msg = JSON.parse(ev.data as string); } catch { return; }
    if (msg.type === "start"){
      this.roundId++;
      const puzzle = makePuzzle(); // {nums:[...] , par}
      this.broadcast({ type:"round", roundId: this.roundId, puzzle });
    } else if (msg.type === "submit"){
      // { roundId, correct, usedSec }
      const r: RoundResult = { id: p.id, correct: !!msg.correct, usedSec: Number(msg.usedSec)||9999 };
      this.broadcast({ type:"submitted", player: p.id });
      // naive: when all submitted, score Elo
      if ([...this.players.values()].every(pl=>true)){ // simplified: no wait
        await this.settleElo([r]);
      }
    }
  }
  async settleElo(results: RoundResult[]){
    // Simplified: correct beats incorrect. If tie, by usedSec ascending.
    const winner = results.sort((a,b)=> (Number(b.correct)-Number(a.correct)) || (a.usedSec - b.usedSec))[0];
    const ids = [...this.players.values()].map(p=>p.userId).filter(Boolean) as number[];
    if (ids.length >= 2){
      // Update Elo for all logged-in players: winner +K, others -K/ (n-1)
      const K = 32;
      const now = Date.now();
      const rows = await this.env.DB.prepare(
        `SELECT user_id, elo FROM versus_rating WHERE user_id IN (${ids.map(()=>"?").join(",")})`
      ).bind(...ids).all<{user_id:number, elo:number}>();
      const cur = new Map<number, number>(rows.results.map(r=>[r.user_id, r.elo]));
      for (const uid of ids){
        if (!cur.has(uid)) cur.set(uid, 1500);
      }
      const wUid = [...this.players.values()].find(p=>p.id===winner.id)?.userId ?? null;
      for (const uid of ids){
        const e = cur.get(uid)!;
        const score = (uid===wUid) ? 1 : 0;
        const expected = 1/ids.length; // very naive
        const next = e + K * (score - expected);
        await this.env.DB.prepare(`INSERT INTO versus_rating (user_id, elo, rd, updated_at)
          VALUES (?1, ?2, 350, ?3)
          ON CONFLICT(user_id) DO UPDATE SET elo=excluded.elo, updated_at=excluded.updated_at`)
          .bind(uid, next, now).run();
      }
      await this.env.DB.prepare(`INSERT INTO matches (room_id, ts, data_json) VALUES (?1, ?2, ?3)`)
        .bind(this.state.id.toString(), now, JSON.stringify({ players: ids, winner: wUid })).run();
    }
    this.broadcast({ type:"round-over" });
  }
}

function makePuzzle(){
  const nums = Array.from({length:4}, ()=> 1 + Math.floor(Math.random()*13));
  const par = 8 + Math.random()*20;
  return { nums, par };
}
