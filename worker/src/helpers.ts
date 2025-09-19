export function json(data: any, status = 200, headers: Record<string,string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

export function getCookie(req: Request, key: string): string | null {
  const c = req.headers.get("Cookie") || "";
  const m = c.match(new RegExp(`(?:^|; )${key}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function withCORS(r: Response) {
  r.headers.set("Access-Control-Allow-Origin", "*");
  r.headers.set("Access-Control-Allow-Credentials", "true");
  r.headers.set("Access-Control-Allow-Headers", "Content-Type");
  r.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return r;
}

export function ok() { return json({ok:true}); }

export function bytesToHex(arr: ArrayBuffer | Uint8Array) {
  const a = arr instanceof Uint8Array ? arr : new Uint8Array(arr);
  return Array.from(a).map(b=>b.toString(16).padStart(2,"0")).join("");
}

export function hexToBytes(hex: string) {
  const u = new Uint8Array(hex.length/2);
  for (let i=0;i<u.length;i++) u[i] = parseInt(hex.slice(i*2,i*2+2),16);
  return u;
}

// Simple seeded RNG
export function mulberry32(seed: number){
  let t = seed >>> 0;
  return function(){
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }
}

export function ymdUTC(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = (date.getUTCMonth()+1).toString().padStart(2,"0");
  const d = date.getUTCDate().toString().padStart(2,"0");
  return `${y}-${m}-${d}`;
}
