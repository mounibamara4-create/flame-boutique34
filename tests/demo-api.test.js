// Unit test of the demo data layer against the same cases as the SQL tests.
const fs=require('fs'), R=require('path').join(__dirname,'..')+'/';
const store={}; global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=v};
global.sessionStorage={...global.localStorage}; global.window=global; global.crypto=require('crypto').webcrypto;
global.setTimeout=(f)=>f();
// this test covers demo mode, whatever assets/config.js holds
global.FB_CONFIG={DEMO_PASSWORD_SHA256:'cd782a4fb4e7c57fcab4debf1a47b4e4052d9dd02cdd1fade914b9d7fbeb8221'};
for (const f of ['src/locations.js','src/shared.js','src/api.js']) eval(fs.readFileSync(R+f,'utf8'));
const PRODUCTS = require(R+'tests/fixtures/products.js');
const A=window.FB_API, ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const medjana=FB_LOCATIONS.communes.find(c=>c[1]===34&&c[3]==='Medjana')[0];
(async()=>{
  ok(A.mode==='demo','demo mode without Supabase keys');
  ok((await A.loadCatalog()).products.length===0,'a new shop starts with no products');
  for (const p of PRODUCTS) await A.saveProduct(JSON.parse(JSON.stringify(p)));
  await A.saveRates([{wilaya_code:34,scope:0,home_price:400,desk_price:250,home_available:true,desk_available:true},{wilaya_code:34,scope:medjana,home_price:500,desk_price:300,home_available:true,desk_available:true}]);
  await A.saveProduct({...PRODUCTS[0], stock:{S:1,M:5,L:0,XL:0,XXL:0}});
  const base={first_name:'أمينة',last_name:'بن علي',phone:'0555 12 34 56',wilaya:34,commune_id:medjana,delivery:'home',address:'حي 500 مسكن'};
  const r1=await A.placeOrder({...base,idempotency_key:'aaaaaaaa-0000-4000-8000-000000000001',items:[{id:'atlas',size:'M',color:0,qty:2},{id:'khimar',size:'TU',color:1,qty:1}]});
  ok(r1.total===20800&&r1.shipping===500,'server-side totals with commune override '+r1.total);
  ok(/^FLM-[A-HJ-NP-Z2-9]{8}$/.test(r1.tracking_code),'tracking format '+r1.tracking_code);
  const r2=await A.placeOrder({...base,idempotency_key:'aaaaaaaa-0000-4000-8000-000000000001',items:[]});
  ok(r2.repeat&&r2.tracking_code===r1.tracking_code,'same key -> same order');
  const err=async(p)=>{try{await A.placeOrder(p);return 'no error'}catch(e){return e.message}};
  // each new order below uses its own number: one number may not order twice within a minute (fake-order rule)
  ok(await err({...base,phone:'0555000010',idempotency_key:crypto.randomUUID(),items:[{id:'atlas',size:'S',qty:2}]})==='out_of_stock:atlas','stock enforced');
  ok((await A.adminLoad()).products.find(p=>p.id==='atlas').stock.M===3,'failed order did not touch stock; first order took 2');
  ok(await err({...base,idempotency_key:crypto.randomUUID(),phone:'0255',items:[{id:'khimar',size:'TU',qty:1}]})==='invalid:phone','bad phone');
  const r3=await A.placeOrder({...base,phone:'0555000011',wilaya:16,commune_id:FB_LOCATIONS.communes.find(c=>c[1]===16)[0],delivery:'desk',idempotency_key:crypto.randomUUID(),items:[{id:'khimar',size:'TU',qty:1}]});
  ok(r3.shipping_pending&&r3.shipping==null&&r3.total===2500,'no price -> needs confirmation');
  ok((await A.trackOrder(r1.tracking_code.toLowerCase(),'+213555123456')).status==='received','track with code + phone');
  ok(await A.trackOrder(r1.tracking_code,'0666666666')===null,'wrong phone -> null');
  // fake orders: the same number again at once, the hidden field, a blocked number
  ok(await err({...base,idempotency_key:crypto.randomUUID(),items:[{id:'khimar',size:'TU',qty:1}]})==='limit:wait','same number again within a minute refused');
  ok(await err({...base,phone:'0555000012',hp:'x',idempotency_key:crypto.randomUUID(),items:[{id:'khimar',size:'TU',qty:1}]})==='invalid:request','hidden field filled (robot) refused');
  await A.blockPhone('0555 00 00 13','test');
  ok(await err({...base,phone:'0555000013',idempotency_key:crypto.randomUUID(),items:[{id:'khimar',size:'TU',qty:1}]})==='blocked','blocked number refused');
  await A.unblockPhone('0555000013');
  ok((await A.adminLoad()).blocked.length===0,'block lifted');
  const o=(await A.adminLoad()).orders.find(o=>o.tracking_code===r1.tracking_code);
  await A.setOrderStatus(o.id,'cancelled','');
  ok((await A.adminLoad()).products.find(p=>p.id==='atlas').stock.M===5,'cancel restocks');
  ok((await A.trackOrder(r1.tracking_code,'0555123456')).history.map(h=>h.status).join()==='received,cancelled','history visible in tracking');
  await A.moveCommunes([FB_LOCATIONS.communes.find(c=>c[1]===5&&c[3]==='Barika')[0]],60);
  ok((await A.communes(60)).length===1&&!(await A.communes(5)).some(c=>c.fr==='Barika'),'owner moves a commune to a new wilaya');
  try{await A.signIn('wrong');ok(false,'bad password')}catch{ok(true,'wrong password refused')}
  await A.signIn('Fam20@'); ok(await A.hasSession(),'Fam20@ accepted via hash');
  ok(!JSON.stringify(store).includes('Fam20@'),'password not stored in clear');
})().catch(e=>console.log('FAIL crash',e));
