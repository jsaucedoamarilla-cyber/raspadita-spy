import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PIN_HASH = "ebf6ad02be72aeea2dc4b9efc9f6e07a1e8aeefc5c1a4630c73ac1a33996eb27";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-admin-session", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (data: unknown, status=200) => new Response(JSON.stringify(data), {status, headers:cors});
async function hash(s:string) { const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
async function db(path:string, init:RequestInit={}) {
 const method=String(init.method||"GET").toUpperCase();
 const query=path.split("?")[1]||"";
 const hasLimit=/(^|&)limit=/.test(query);
 if(method==="GET"&&!hasLimit&&!(init.headers as Record<string,string>|undefined)?.Range) {
  const all:any[]=[]; const pageSize=1000;
  for(let offset=0;offset<10000;offset+=pageSize) {
   const pageHeaders={...headers,...(init.headers||{}),Range:offset+"-"+(offset+pageSize-1)};
   const r=await fetch(URL+"/rest/v1/"+path,{...init,headers:pageHeaders});
   const t=await r.text(); if(!r.ok) throw new Error("DB "+r.status+": "+t);
   const page=t?JSON.parse(t):[]; if(!Array.isArray(page)) return page;
   all.push(...page); if(page.length<pageSize) return all;
  }
  throw new Error("La consulta superó el máximo seguro de 10000 registros.");
 }
 const r=await fetch(URL+"/rest/v1/"+path,{...init,headers:{...headers,...(init.headers||{})}});
 const t=await r.text(); if(!r.ok) throw new Error("DB "+r.status+": "+t); return t?JSON.parse(t):null;
}
async function rows(path:string, init:RequestInit={}) { return await db(path,{...init,headers:{Prefer:"return=representation",...((init.headers||{}) as Record<string,string>)}}); }
Deno.serve(async req => {
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return json({ok:false,error:"Método no permitido"},405);
 try {
  const body=await req.json(); const action=String(body.action||"");
  const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
  const ipHash=await hash(ip);
  if(action==="login") {
   const attempts=await db(`raspadita_admin_login_attempts?ip_hash=eq.${ipHash}&attempted_at=gte.${encodeURIComponent(new Date(Date.now()-15*60*1000).toISOString())}&succeeded=eq.false&select=id`);
   if(attempts.length>=8) return json({ok:false,error:"Demasiados intentos. Esperá 15 minutos."},429);
   const good=await hash(String(body.pin||""))===PIN_HASH;
   await db("raspadita_admin_login_attempts",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({ip_hash:ipHash,succeeded:good})});
   if(!good) return json({ok:false,error:"PIN incorrecto"},401);
   const token=crypto.randomUUID()+crypto.randomUUID();
   await db("raspadita_admin_sessions",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({token_hash:await hash(token),expires_at:new Date(Date.now()+8*60*60*1000).toISOString(),role:"admin"})});
   return json({ok:true,token,expires_in:28800});
  }
  if(action==="seller_login") {
   const sid=Number(body.seller_id), pin=String(body.pin||""), cleanPin=pin.trim();
   if(!Number.isInteger(sid)||sid<1||cleanPin.length<4||cleanPin.length>12) return json({ok:false,error:"Ingresá el número de vendedora y un PIN de 4 a 12 caracteres, sin espacios al principio o al final."},400);
   const attempts=await db(`raspadita_admin_login_attempts?ip_hash=eq.${ipHash}&attempted_at=gte.${encodeURIComponent(new Date(Date.now()-15*60*1000).toISOString())}&succeeded=eq.false&select=id`);
   if(attempts.length>=8) return json({ok:false,error:"Demasiados intentos. Esperá 15 minutos."},429);
   const seller=await db(`raspadita_sellers?id=eq.${sid}&active=eq.true&select=id,name,pin_hash`);
   const good=!!seller.length&&!!seller[0].pin_hash&&(await hash(pin)===seller[0].pin_hash||await hash(cleanPin)===seller[0].pin_hash);
   await db("raspadita_admin_login_attempts",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({ip_hash:ipHash,succeeded:good})});
   if(!good) return json({ok:false,error:"Número de vendedora o PIN incorrecto, o cuenta inactiva."},401);
   const token=crypto.randomUUID()+crypto.randomUUID();
   await db("raspadita_admin_sessions",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({token_hash:await hash(token),expires_at:new Date(Date.now()+8*60*60*1000).toISOString(),role:"seller",seller_id:sid})});
   return json({ok:true,token,expires_in:28800,seller:{id:sid,name:seller[0].name}});
  }
  const token=String(req.headers.get("x-admin-session")||body.session||"");
  if(!token) return json({ok:false,error:"Sesión requerida"},401);
  const sessions=await db(`raspadita_admin_sessions?token_hash=eq.${await hash(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,role,seller_id`);
  if(!sessions.length) return json({ok:false,error:"Sesión vencida. Ingresá de nuevo."},401);
  const session=sessions[0], role=session.role||"admin", sellerId=Number(session.seller_id||0);
  if(action==="logout") { await db(`raspadita_admin_sessions?token_hash=eq.${await hash(token)}`,{method:"DELETE"}); return json({ok:true}); }
  if(action==="seller_summary") {
   if(role!=="seller"||!sellerId) return json({ok:false,error:"Esta opción es solo para una sesión de vendedora."},403);
   const [seller,assignments,remittances,links,tickets]=await Promise.all([
    db(`raspadita_sellers?id=eq.${sellerId}&select=id,name,active`),
    db(`raspadita_seller_assignments?seller_id=eq.${sellerId}&select=ticket_number,status,assigned_at,sold_at,sold_amount,note&order=ticket_number.asc`),
    db(`raspadita_seller_remittances?seller_id=eq.${sellerId}&select=amount,note,received_at&order=received_at.desc`),
    db("raspadita_ticket_links?select=ticket_number,issued_at&order=ticket_number.asc"),
    db("raspadita_tickets?select=ticket_number,scratched,prize_label,prize_amount,prize_kind,claimed")
   ]);
   if(!seller.length||!seller[0].active) return json({ok:false,error:"La cuenta de vendedora está inactiva."},403);
   const assignedNums=new Set(assignments.map((a:any)=>a.ticket_number));
   const ownLinks=links.filter((x:any)=>assignedNums.has(x.ticket_number));
   const byNum=new Map(tickets.map((t:any)=>[t.ticket_number,t]));
   const sold=assignments.filter((a:any)=>a.status==="sold");
   const revenue=sold.reduce((s:number,a:any)=>s+Number(a.sold_amount||5000),0);
   const remitted=remittances.reduce((s:number,a:any)=>s+Number(a.amount),0);
   return json({ok:true,seller:seller[0],assignments:assignments.map((a:any)=>{const t=byNum.get(a.ticket_number); return {...a,ticket:t?{ticket_number:t.ticket_number,scratched:t.scratched,claimed:t.claimed,prize_label:t.prize_label,prize_amount:t.prize_amount,prize_kind:t.prize_kind}:null};}),remittances,revenue,remitted,balance:revenue-remitted,sold_count:sold.length,assigned_count:assignments.length,ticket_links:ownLinks});
  }
  if(role!=="admin" && !["seller_mark_sold","seller_issue_link"].includes(action)) return json({ok:false,error:"No tenés permiso para esa operación."},403);
  if(action==="seller_issue_link") {
   if(role!=="seller"||!sellerId) return json({ok:false,error:"Esta opción es solo para una vendedora."},403);
   const n=Number(body.ticket_number);
   if(!Number.isInteger(n)||n<1||n>5000) return json({ok:false,error:"Número de boleta inválido."},400);
   const assigned=await db(`raspadita_seller_assignments?ticket_number=eq.${n}&seller_id=eq.${sellerId}&select=ticket_number&limit=1`);
   if(!assigned.length) return json({ok:false,error:"Esa boleta no está asignada a tu cuenta."},403);
   const links=await db(`raspadita_ticket_links?ticket_number=eq.${n}&select=ticket_number,token,issued_at&limit=1`);
   if(!links.length||!links[0].token) return json({ok:false,error:"No se encontró el enlace de esta boleta."},404);
   if(!links[0].issued_at) {
    await rows(`raspadita_ticket_links?ticket_number=eq.${n}&issued_at=is.null`,{method:"PATCH",body:JSON.stringify({issued_at:new Date().toISOString()})});
   }
   return json({ok:true,ticket_number:n,token:links[0].token});
  }
  if(action==="seller_mark_sold") {
   if(role!=="seller"||!sellerId) return json({ok:false,error:"Esta opción es solo para una vendedora."},403);
   const n=Number(body.ticket_number);
   if(!Number.isInteger(n)||n<1||n>5000) return json({ok:false,error:"Número de boleta inválido."},400);
   const found=await db(`raspadita_seller_assignments?ticket_number=eq.${n}&seller_id=eq.${sellerId}&select=id,status,seller_id`);
   if(!found.length) return json({ok:false,error:"Esa boleta no está asignada a tu cuenta."},403);
   if(found[0].status==="sold") return json({ok:false,error:"Esa boleta ya figura como vendida."},409);
   await db(`raspadita_seller_assignments?ticket_number=eq.${n}&seller_id=eq.${sellerId}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"sold",sold_at:new Date().toISOString(),sold_amount:5000,note:"Registrada por la vendedora"})});
   await db("raspadita_admin_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({event_type:"ticket_sold",ticket_number:n,event_detail:{seller_id:sellerId,amount:5000,source:"seller"}})});
   return json({ok:true});
  }
  if(action==="summary") {
   const [tickets, sellers, assignments, remits, events, ticketLinks] = await Promise.all([
    db("raspadita_tickets?select=ticket_number,scratched,prize_label,prize_kind,prize_amount,claimed"),
    db("raspadita_sellers?select=id,name,phone,active,created_at&order=id.asc"),
    db("raspadita_seller_assignments?select=id,ticket_number,seller_id,status,assigned_at,sold_at,sold_amount,note&order=ticket_number.asc"),
    db("raspadita_seller_remittances?select=id,seller_id,amount,note,received_at&order=received_at.desc"),
    db("raspadita_admin_events?select=id,event_type,ticket_number,event_detail,created_at&order=created_at.desc&limit=100"),
    db("raspadita_ticket_links?select=ticket_number,token&order=ticket_number.asc")
   ]);
   return json({ok:true,tickets,sellers,assignments,remittances:remits,events,ticket_links:ticketLinks});
  }
  if(action==="create_seller") {
   const name=String(body.name||"").trim(), pin=String(body.pin||"").trim();
   if(!name) return json({ok:false,error:"Escribí el nombre de la vendedora"},400);
   if(!/^.{4,12}$/.test(pin)) return json({ok:false,error:"Creá un PIN de vendedora de 4 a 12 caracteres."},400);
   const pinHash=await hash(pin);
   const duplicatePin=await db(`raspadita_sellers?pin_hash=eq.${pinHash}&select=id&limit=1`);
   if(duplicatePin.length) return json({ok:false,error:"Ese PIN ya está usado por otra vendedora. Elegí un PIN diferente para que los enlaces de WhatsApp identifiquen la cuenta correcta."},409);
   const seller=(await rows("raspadita_sellers",{method:"POST",body:JSON.stringify({name,phone:String(body.phone||"").trim()||null,pin_hash:pinHash}),headers:{Prefer:"return=representation"}}))[0];
   return json({ok:true,seller:{id:seller.id,name:seller.name,phone:seller.phone,active:seller.active}});
  }
  if(action==="delete_seller") {
   if(role!=="admin") return json({ok:false,error:"Solo el administrador puede eliminar vendedoras."},403);
   const sid=Number(body.seller_id);
   if(!Number.isInteger(sid)||sid<1) return json({ok:false,error:"Vendedora inválida."},400);
   const seller=await db(`raspadita_sellers?id=eq.${sid}&select=id,name`);
   if(!seller.length) return json({ok:false,error:"La vendedora ya no existe."},404);
   const [assignments,remittances]=await Promise.all([
    db(`raspadita_seller_assignments?seller_id=eq.${sid}&select=id,status,ticket_number`),
    db(`raspadita_seller_remittances?seller_id=eq.${sid}&select=id`)
   ]);
   if(assignments.some((x:any)=>x.status==="sold")) return json({ok:false,error:"No se puede eliminar: esta vendedora tiene boletas vendidas. Desactivala para conservar el historial."},409);
   if(remittances.length) return json({ok:false,error:"No se puede eliminar: hay rendiciones registradas. Desactivala para conservar el historial."},409);
   if(assignments.length) await db(`raspadita_seller_assignments?seller_id=eq.${sid}`,{method:"DELETE",headers:{"Prefer":"return=minimal"}});
   await db(`raspadita_sellers?id=eq.${sid}`,{method:"DELETE",headers:{"Prefer":"return=minimal"}});
   await db("raspadita_admin_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({event_type:"seller_deleted",event_detail:{seller_id:sid,seller_name:seller[0].name,recovered_un_sold_assignments:assignments.length}})});
   return json({ok:true,recovered:assignments.length});
  }
  if(action==="set_seller_active") {
   await db(`raspadita_sellers?id=eq.${Number(body.seller_id)}`,{method:"PATCH",body:JSON.stringify({active:!!body.active}),headers:{Prefer:"return=minimal"}});
   return json({ok:true});
  }
  if(action==="assign_specific_tickets") {
   const sid=Number(body.seller_id), raw=Array.isArray(body.ticket_numbers)?body.ticket_numbers:[], nums=raw.map((n:any)=>Number(n));
   if(!Number.isInteger(sid)||sid<1||!nums.length||nums.length>5000||nums.some((n:number)=>!Number.isInteger(n)||n<1||n>5000)||new Set(nums).size!==nums.length) return json({ok:false,error:"Elegí una vendedora y números de boleta válidos, sin repetir."},400);
   const seller=await db(`raspadita_sellers?id=eq.${sid}&active=eq.true&select=id`);
   if(!seller.length) return json({ok:false,error:"La vendedora no está activa."},400);
   const [tickets,used]=await Promise.all([db("raspadita_tickets?select=ticket_number"),db("raspadita_seller_assignments?select=ticket_number")]);
   const valid=new Set(tickets.map((x:any)=>Number(x.ticket_number))), usedSet=new Set(used.map((x:any)=>Number(x.ticket_number)));
   const missing=nums.filter((n:number)=>!valid.has(n)), already=nums.filter((n:number)=>usedSet.has(n));
   if(missing.length) return json({ok:false,error:"No existen estas boletas: "+missing.join(", ")},400);
   if(already.length) return json({ok:false,error:"Estas boletas ya están asignadas y no se duplicaron: "+already.join(", ")},409);
   await db("raspadita_seller_assignments",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(nums.map((n:number)=>({ticket_number:n,seller_id:sid})))});
   await db("raspadita_admin_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({event_type:"assign_specific_tickets",event_detail:{seller_id:sid,count:nums.length,ticket_numbers:nums}})});
   return json({ok:true,count:nums.length});
  }
  if(action==="assign_tickets") {
   const sid=Number(body.seller_id), count=Math.floor(Number(body.count));
   if(!sid||!Number.isInteger(count)||count<1||count>5000) return json({ok:false,error:"Elegí vendedora y cantidad de 1 a 5000"},400);
   const seller=await db(`raspadita_sellers?id=eq.${sid}&active=eq.true&select=id`); if(!seller.length) return json({ok:false,error:"La vendedora no está activa"},400);
   const [all,used]=await Promise.all([db("raspadita_tickets?select=ticket_number&order=ticket_number.asc"),db("raspadita_seller_assignments?select=ticket_number")]);
   const usedSet=new Set(used.map((x:any)=>x.ticket_number));
   const nums=all.map((x:any)=>x.ticket_number).filter((n:number)=>!usedSet.has(n)).slice(0,count);
   if(nums.length<count) return json({ok:false,error:`Solo quedan ${nums.length} boletas sin asignar`},409);
   await db("raspadita_seller_assignments",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(nums.map((n:number)=>({ticket_number:n,seller_id:sid})))});
   await db("raspadita_admin_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({event_type:"assign_tickets",event_detail:{seller_id:sid,count:nums.length,first:nums[0],last:nums[nums.length-1]}})});
   return json({ok:true,count:nums.length,first:nums[0],last:nums[nums.length-1]});
  }
  if(action==="mark_sold") {
   const n=Number(body.ticket_number); const amount=Number(body.amount||5000);
   if(!Number.isInteger(n)||n<1||n>5000||!Number.isInteger(amount)||amount<1) return json({ok:false,error:"Número de boleta o importe inválido"},400);
   const found=await db(`raspadita_seller_assignments?ticket_number=eq.${n}&select=id,status,seller_id`);
   if(!found.length) return json({ok:false,error:"Esa boleta no está asignada a una vendedora"},404);
   if(found[0].status==="sold") return json({ok:false,error:"Esa boleta ya figura como vendida"},409);
   await db(`raspadita_seller_assignments?ticket_number=eq.${n}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"sold",sold_at:new Date().toISOString(),sold_amount:amount,note:String(body.note||"").trim()||null})});
   await db("raspadita_admin_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({event_type:"ticket_sold",ticket_number:n,event_detail:{seller_id:found[0].seller_id,amount}})});
   return json({ok:true});
  }
  if(action==="remittance") {
   const sid=Number(body.seller_id), amount=Number(body.amount);
   if(!sid||!Number.isInteger(amount)||amount<1) return json({ok:false,error:"Elegí vendedora e importe válido"},400);
   const item=(await rows("raspadita_seller_remittances",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({seller_id:sid,amount,note:String(body.note||"").trim()||null})}))[0];
   await db("raspadita_admin_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({event_type:"remittance",event_detail:{seller_id:sid,amount}})});
   return json({ok:true,remittance:item});
  }
  if(action==="report") {
   const sid=Number(body.seller_id); if(!sid) return json({ok:false,error:"Elegí una vendedora"},400);
   const [seller,assignments,remittances,tickets]=await Promise.all([
    db(`raspadita_sellers?id=eq.${sid}&select=id,name,phone,active`),
    db(`raspadita_seller_assignments?seller_id=eq.${sid}&select=ticket_number,status,assigned_at,sold_at,sold_amount,note&order=ticket_number.asc`),
    db(`raspadita_seller_remittances?seller_id=eq.${sid}&select=amount,note,received_at&order=received_at.desc`),
    db("raspadita_tickets?select=ticket_number,scratched,prize_label,prize_amount,prize_kind,claimed")
   ]);
   const byNum=new Map(tickets.map((t:any)=>[t.ticket_number,t]));
   const sold=assignments.filter((a:any)=>a.status==="sold");
   const revenue=sold.reduce((s:number,a:any)=>s+Number(a.sold_amount||5000),0);
   const remitted=remittances.reduce((s:number,a:any)=>s+Number(a.amount),0);
   const detail=assignments.map((a:any)=>{const t=byNum.get(a.ticket_number); return {...a,ticket:t?{ticket_number:t.ticket_number,scratched:t.scratched,claimed:t.claimed}:null};});
   return json({ok:true,seller:seller[0]||null,assignments:detail,remittances,revenue,remitted,balance:revenue-remitted,sold_count:sold.length,assigned_count:assignments.length});
  }
  return json({ok:false,error:"Acción no reconocida"},400);
 } catch(e) { console.error(e); return json({ok:false,error:"Error del servidor. Revisá conexión e intentá otra vez."},500); }
});