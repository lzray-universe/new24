export class SessionDO {
  state: DurableObjectState;
  storage: DurableObjectStorage;
  constructor(state: DurableObjectState, env: Env){
    this.state = state;
    this.storage = state.storage;
  }
  async fetch(req: Request){
    const url = new URL(req.url);
    if (url.pathname.endsWith("/set") && req.method === "POST"){
      const { userId, ts } = await req.json();
      await this.storage.put("session", { userId, ts });
      return new Response("ok");
    }
    if (url.pathname.endsWith("/get")){
      const data = await this.storage.get<any>("session");
      return new Response(JSON.stringify(data||{}), { headers: {"Content-Type":"application/json"} });
    }
    return new Response("not found", { status:404 });
  }
}
