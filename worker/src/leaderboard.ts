export class LeaderboardDO {
  state: DurableObjectState;
  storage: DurableObjectStorage;
  constructor(state: DurableObjectState, env: Env){
    this.state = state;
    this.storage = state.storage;
  }
  async fetch(req: Request){
    const url = new URL(req.url);
    if (url.pathname.endsWith("/put") && req.method === "POST"){
      const body = await req.text();
      await this.storage.put("cache", body);
      return new Response("ok");
    }
    if (url.pathname.endsWith("/get")){
      const body = await this.storage.get<string>("cache");
      return new Response(body || "{}", { headers: {"Content-Type":"application/json"} });
    }
    return new Response("not found", { status:404 });
  }
}
