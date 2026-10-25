/* Data layer. Live mode talks to Supabase; demo mode keeps everything in this browser's localStorage
   and applies the same rules as supabase/schema.sql, so both behave alike. */
window.FB_API = (() => {
  const cfg = window.FB_CONFIG || {};
  const live = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  // supabase-js 2.117.2 (MIT), served with the site from assets/vendor/; it accepts the sb_publishable_ key format
  const SUPABASE_JS = "assets/vendor/supabase.js";
  const clone = o => JSON.parse(JSON.stringify(o));
  const rateKey = r => `${r.wilaya_code}:${r.scope}`;
  const ratesMap = rows => Object.fromEntries(rows.map(r => [rateKey(r), r]));

  /* ---------------- live (Supabase) ---------------- */
  let sbPromise;
  function sb(){
    return sbPromise ||= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SUPABASE_JS;
      s.onload = () => resolve(window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY));
      s.onerror = () => { sbPromise = null; reject(new Error("network")); };
      document.head.append(s);
    });
  }
  const must = ({data, error}) => { if (error) throw new Error(error.message || "network"); return data; };
  const communeCache = {};
  // public columns of a review (visitors cannot read which order it came from)
  const REVIEW_COLS = "id,created_at,product_id,name,wilaya_name,rating,body,photo,verified";
  const ownerReview = r => ({product_id: r.product_id || null, name: String(r.name||"").trim().slice(0,40), wilaya_name: String(r.wilaya_name||"").trim().slice(0,40),
    rating: Math.min(5, Math.max(1, Math.round(+r.rating||5))), body: String(r.body||"").trim().slice(0,600), photo: r.photo || "", verified: false, status: "approved"});

  const liveApi = {
    async loadCatalog(){
      const c = await sb();
      const [srow, products, rates, reviews] = await Promise.all([
        c.from("settings").select("data").eq("id",1).maybeSingle().then(must),
        c.from("products").select("*").eq("active",true).order("sort").then(must),
        c.from("shipping_rates").select("*").then(must),
        c.from("reviews").select(REVIEW_COLS).eq("status","approved").order("created_at",{ascending:false}).limit(300).then(must).catch(() => [])
      ]);
      return {settings: FB.mergeSettings(srow?.data), products, rates: ratesMap(rates), reviews};
    },
    async communes(w){
      if (communeCache[w]) return communeCache[w];
      const rows = must(await (await sb()).from("communes").select("id,name_ar,name_fr").eq("wilaya_code", w).order("name_fr"));
      return communeCache[w] = rows.map(r => ({id:r.id, ar:r.name_ar, fr:r.name_fr}));
    },
    async placeOrder(payload){ return must(await (await sb()).rpc("place_order", {p: payload})); },
    async trackOrder(code, phone){ return must(await (await sb()).rpc("track_order", {p_code: code, p_phone: phone})); },
    async submitReview(code, phone, r){
      must(await (await sb()).rpc("submit_review", {p_code: code, p_phone: phone, p_product: r.product_id || "", p_rating: r.rating, p_body: r.body || "", p_name: r.name || ""}));
    },
    async signIn(password, email){
      const c = await sb();
      must(await c.auth.signInWithPassword({email: email || cfg.ADMIN_EMAIL, password}));
      if (!must(await c.rpc("is_admin"))) { await c.auth.signOut(); throw new Error("not_admin"); }
    },
    async hasSession(){
      const c = await sb();
      const {data} = await c.auth.getSession();
      return !!data.session && !!must(await c.rpc("is_admin"));
    },
    async signOut(){ await (await sb()).auth.signOut(); },
    async changePassword(password){ must(await (await sb()).auth.updateUser({password})); },
    async adminLoad(){
      const c = await sb();
      const [srow, products, costs, orders, rates, reviews, blocked] = await Promise.all([
        c.from("settings").select("data").eq("id",1).maybeSingle().then(must),
        c.from("products").select("*").order("sort").then(must),
        c.from("product_costs").select("*").then(must),
        c.from("orders").select("*, order_items(*), order_status_history(*)").order("created_at",{ascending:false}).limit(3000).then(must),
        c.from("shipping_rates").select("*").then(must),
        // null = the reviews table is missing: schema.sql has not been run again since reviews were added
        c.from("reviews").select("*").order("created_at",{ascending:false}).limit(2000).then(must).catch(() => null),
        c.from("blocked_phones").select("*").order("created_at",{ascending:false}).then(must).catch(() => null)
      ]);
      const cost = Object.fromEntries(costs.map(r => [r.product_id, r.cost]));
      return {settings: FB.mergeSettings(srow?.data), products: products.map(p => ({...p, cost: cost[p.id] ?? 0})),
        orders, rates: ratesMap(rates), reviews, blocked};
    },
    // fake orders: block a number (orders from it are refused by place_order), or lift the block
    async blockPhone(phone, note){ must(await (await sb()).rpc("block_phone", {p_phone: phone, p_note: note || ""})); },
    async unblockPhone(phone){ must(await (await sb()).from("blocked_phones").delete().eq("phone", phone)); },
    // Telegram messages for new orders: the token is written, never read back
    async notifyGet(){ return must(await (await sb()).rpc("notify_get")); },
    async notifySave(token, chat, enabled){ must(await (await sb()).rpc("notify_save", {p_token: token || "", p_chat: chat || "", p_enabled: !!enabled})); },
    async notifyTest(){ return must(await (await sb()).rpc("notify_test")); },
    async notifyResult(id){ return must(await (await sb()).rpc("notify_result", {p_id: id})); },
    // ZR Express: the keys are written, never read back; every request goes through the database (see schema.sql)
    async courierGet(){ return must(await (await sb()).rpc("courier_get")); },
    async courierSave(provider, key, tenant, enabled){ must(await (await sb()).rpc("courier_save", {p_provider: provider, p_key: key || "", p_tenant: tenant || "", p_enabled: !!enabled})); },
    async courierSync(){ return must(await (await sb()).rpc("courier_sync")); },
    async courierUnlink(id){ must(await (await sb()).rpc("courier_unlink", {p_order: id})); },
    async courierTest(){ const c = await sb(), s = must(await c.rpc("courier_get")); return s.provider === "zr_old" ? zrCall(c, "GET", "/token") : zrCall(c, "GET", "/users/profile"); },
    async courierSend(o, choice = {}, onStep){ return courierSend(await sb(), o, choice, onStep); },
    // the owner's own delivery prices at ZR (from the shop's wilaya), to fill the delivery table
    async courierRates(){
      const c = await sb(), s = must(await c.rpc("courier_get"));
      if (!s.has_key || !s.has_tenant) fail("courier:keys");
      return zrRates(s.provider === "zr_old" ? await zrCall(c, "POST", "/tarification") : await zrCall(c, "GET", "/delivery-pricing/rates"), s.provider);
    },
    // the dashboard hears about each new order at once (Supabase Realtime; the row rules let only the owner see them)
    async onNewOrder(cb){
      const c = await sb();
      c.channel("new-orders").on("postgres_changes", {event: "INSERT", schema: "public", table: "orders"}, p => cb(p.new)).subscribe();
    },
    async saveSettings(s){ must(await (await sb()).from("settings").upsert({id:1, data:s, updated_at:new Date().toISOString()})); },
    async saveProduct(p){
      const c = await sb(), {cost, ...row} = p;
      // rack photos are only sent when there are some, so a database not yet updated still saves ordinary products
      if (!row.cutout || !Object.values(row.cutout).some(Boolean)) delete row.cutout;
      const r = await c.from("products").upsert(row);
      if (r.error && /cutout/.test(r.error.message || "")) throw new Error("schema:cutout");
      must(r);
      must(await c.from("product_costs").upsert({product_id:p.id, cost: cost||0}));
    },
    async deleteProduct(id){ must(await (await sb()).from("products").delete().eq("id",id)); },
    async setOrderStatus(id, status, note){ must(await (await sb()).rpc("set_order_status", {p_order:id, p_status:status, p_note:note||""})); },
    async updateOrder(id, patch){ must(await (await sb()).from("orders").update(patch).eq("id",id)); },
    // rows: [{wilaya_code, scope, home_price, desk_price, home_available, desk_available}]; remove: [[wilaya, scope]]
    async saveRates(rows, remove=[]){
      const c = await sb(), now = new Date().toISOString();
      if (rows.length) must(await c.from("shipping_rates").upsert(rows.map(r => ({...r, updated_at:now}))));
      for (const [w, scope] of remove) must(await c.from("shipping_rates").delete().eq("wilaya_code", w).eq("scope", scope));
    },
    async moveCommunes(ids, w){
      must(await (await sb()).from("communes").update({wilaya_code: w}).in("id", ids));
      Object.keys(communeCache).forEach(k => delete communeCache[k]);
    },
    // a review the owner received elsewhere (WhatsApp, Instagram): published at once, never marked as verified
    async addReview(r){ must(await (await sb()).from("reviews").insert({...ownerReview(r)})); },
    async setReviewStatus(id, status){ must(await (await sb()).from("reviews").update({status}).eq("id", id)); },
    async deleteReview(id){ must(await (await sb()).from("reviews").delete().eq("id", id)); },
    // connection check for the owner: read-only, changes nothing. Each step: {key, ok, info, error}
    async diagnose(){
      const out = [], step = (key, ok, info = "", error = "") => out.push({key, ok, info, error: String(error||"")});
      const ref = (cfg.SUPABASE_URL.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/) || [])[1];
      step("url", !!ref, ref || cfg.SUPABASE_URL);
      const k = cfg.SUPABASE_ANON_KEY;
      step("key", /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(k) || /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(k), k.startsWith("sb_secret_") ? "secret" : k.slice(0, 18) + "…");
      let c;
      try { c = await sb(); step("library", true); } catch (e) { step("library", false, "", e.message); return out; }
      const q = async (key, fn, info) => { try { const r = await fn(); if (r.error) throw r.error; step(key, true, info ? info(r) : ""); return r; }
        catch (e) { step(key, false, "", [e.code, e.message || e].filter(Boolean).join(" ")); return null; } };
      const reach = await q("reach", () => c.from("settings").select("id").limit(1));
      if (!reach) return out;  // nothing else can work: stop at the first real cause
      await q("wilayas", () => c.from("wilayas").select("code", {count: "exact", head: true}), r => String(r.count));
      await q("communes", () => c.from("communes").select("id", {count: "exact", head: true}), r => String(r.count));
      await q("products", () => c.from("products").select("id", {count: "exact", head: true}).eq("active", true), r => String(r.count));
      await q("rates", () => c.from("shipping_rates").select("wilaya_code", {count: "exact", head: true}), r => String(r.count));
      await q("reviews", () => c.from("reviews").select(REVIEW_COLS).limit(1));
      await q("track", () => c.rpc("track_order", {p_code: "FLM-AAAAAAAA", p_phone: "0500000000"}));
      // place_order with an empty request is refused before anything is saved: it only shows the function exists
      try { const r = await c.rpc("place_order", {p: {}}); step("order", !!r.error && /invalid:request/.test(r.error.message), "", r.error ? r.error.message : "accepted"); }
      catch (e) { step("order", false, "", e.message); }
      await q("bucket", () => c.storage.from("products").list("", {limit: 1}));
      return out;
    },
    async uploadImage(blob){
      const c = await sb(), path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.webp`;
      must(await c.storage.from("products").upload(path, blob, {contentType: blob.type, cacheControl: "31536000"}));
      return c.storage.from("products").getPublicUrl(path).data.publicUrl;
    }
  };

  /* ---------------- demo (this browser only) ---------------- */
  const KEY = "fb34-demo-db";
  let memory = null; // used when localStorage is unavailable
  function readDb(){
    let db = memory && clone(memory);
    try { db = JSON.parse(localStorage.getItem(KEY)) || db; } catch {}
    if (db && db.version === 3){  // version 3 had no shop phone: fill it where it is still empty
      ["whatsapp","phone_display"].forEach(k => { if (!db.settings[k]) db.settings[k] = FB.DEFAULT_SETTINGS[k]; });
      db.version = 4; writeDb(db);
    }
    if (!db || db.version !== 4) { db = upgrade(db); writeDb(db); }
    db.reviews ||= [];
    db.blocked ||= [];
    db.notify ||= {enabled: false, chat: "", has_token: false};
    db.courier ||= {provider: "zr", enabled: false, has_key: false, has_tenant: false};
    return db;
  }
  function writeDb(db){
    memory = db;
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { if (e && e.name === "QuotaExceededError") throw new Error("storage_full"); }
  }
  // the sample pieces shipped with earlier versions; they are removed from an older demo database
  const SAMPLE_IDS = ["atlas","nassim","nedjma","mordjane","hodna","yaqout","loulou","chafaq","medina","plisse","khimar","soie"];
  // a fresh demo database: no products, no orders, no delivery prices (the owner adds them all)
  function upgrade(old){
    const db = {version:4, settings: clone(FB.DEFAULT_SETTINGS), products: [], costs: {}, orders: [], rates: {}, moves: {}, seq: 0, reviews: [], rseq: 0};
    if (old){  // keep what the owner entered; drop sample pieces, sample orders and invented prices
      if (old.settings){
        const {shipping, ...s} = old.settings;
        const socials = Object.fromEntries(Object.entries(s.socials || {}).filter(([, v]) => v));  // empty links fall back to the shop's links
        db.settings = {...db.settings, ...s, socials:{...db.settings.socials, ...socials}, whatsapp: s.whatsapp && !/^2130+$/.test(s.whatsapp) ? s.whatsapp : db.settings.whatsapp,
          phone_display: s.phone_display && !/X/.test(s.phone_display) ? s.phone_display : db.settings.phone_display};
      }
      db.products = (old.products || []).filter(p => !SAMPLE_IDS.includes(p.id));
      db.costs = Object.fromEntries(Object.entries(old.costs || {}).filter(([id]) => db.products.some(p => p.id === id)));
      if (old.version === 2){ db.orders = old.orders || []; db.rates = old.rates || {}; db.moves = old.moves || {}; db.seq = old.seq || 0; }
      if (old.passwordSha256) db.passwordSha256 = old.passwordSha256;
      db.reviews = old.reviews || [];
    }
    return db;
  }
  const communesOf = (db, w) => FB_LOCATIONS.communes
    .filter(c => (db.moves[c[0]] ?? c[1]) === +w)
    .map(c => ({id:c[0], ar:c[2], fr:c[3]}));
  const sha256 = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))]
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const fail = code => { throw new Error(code); };

  /* ---------- ZR Express (live): one request = ask the database to send it, then read ZR's answer ---------- */
  async function zrCall(c, method, path, body = null, orderId = null){
    const id = must(await c.rpc("courier_call", {p_method: method, p_path: path, p_body: body, p_order: orderId}));
    for (let i = 0; i < 60; i++){
      await new Promise(r => setTimeout(r, i < 5 ? 400 : 800));
      const r = must(await c.rpc("courier_result", {p_id: id}));
      if (r.pending) continue;
      if (r.timed_out || r.error) fail("courier:net");
      if (r.status === 401) fail("courier:auth");
      if (r.status === 403) fail("courier:tenant");
      if (r.status < 200 || r.status > 299){
        const b = r.body || {}, why = typeof b === "string" ? b : (b.detail || b.title || (b.errors && JSON.stringify(b.errors)) || "");
        const e = new Error("courier:http"); e.detail = `${r.status} ${String(why).slice(0, 300)}`.trim(); throw e;
      }
      return r.body;
    }
    fail("courier:slow");
  }
  const zrNames = n => [...new Set([FB.fold(n), FB.fold(n).replace(/[^a-z0-9؀-ۿ]/g, "")])];
  const zrSame = (a, b) => { const x = zrNames(a), y = zrNames(b); return x.some(v => v && y.includes(v)); };
  const zrCache = {};
  async function zrTerritories(c, level, parentId){
    const k = level + ":" + (parentId || "");
    if (zrCache[k]) return zrCache[k];
    const all = [];
    for (let page = 1; page <= 20; page++){
      const filters = [{field: "level", operator: "eq", value: level}];
      if (parentId) filters.push({field: "parentId", operator: "eq", value: parentId});
      const b = await zrCall(c, "POST", "/territories/search", {pageNumber: page, pageSize: 1000, orderBy: ["code asc"], advancedFilter: {logic: "and", filters}});
      all.push(...(b?.items || []));
      if (!b?.hasNext || !(b?.items || []).length) break;
    }
    // the filter may be ignored by ZR: keep only what was asked for
    return zrCache[k] = all.filter(t => (!t.level || String(t.level).toLowerCase() === level) && (!parentId || t.parentId === parentId));
  }
  // ZR wants +213 numbers
  const zrPhone = p => p ? "+213" + String(p).replace(/^0/, "") : null;
  const zrProducts = o => (o.order_items || []).map(l => `${l.name?.fr || l.name?.ar || l.product_id} (${l.color?.fr || l.color?.ar || ""}, ${l.size}) x${l.qty}`).join(" + ").slice(0, 250);

  // ZR's price list -> [{code, home, desk}] for our wilayas. A price ZR does not give (or gives as 0) stays null:
  // nothing is filled in for it. Prices for single communes are counted, not used.
  function zrRates(body, provider){
    const num = v => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return n > 0 ? Math.round(n) : null; };
    const byName = n => FB.WILAYAS.find(w => zrSame(n, w[2]) || zrSame(n, w[1]));
    const rows = [], unknown = []; let communes = 0;
    if (provider === "zr_old"){
      for (const r of Array.isArray(body) ? body : body?.data || []){
        const key = re => Object.keys(r).find(k => re.test(k));
        const code = +r.IDWilaya || +r.idWilaya || +r.Code;
        const w = FB.wilaya(code) || byName(r.Wilaya || r.wilaya);
        if (!w){ unknown.push(String(r.Wilaya || r.IDWilaya || "?")); continue; }
        rows.push({code: w[0], home: num(r[key(/domicile|home/i)]), desk: num(r[key(/stop|desk|bureau/i)])});
      }
    } else {
      for (const r of body?.rates || []){
        const level = String(r.toTerritoryLevel || "wilaya").toLowerCase();
        if (level !== "wilaya"){ communes++; continue; }
        const w = (r.toTerritoryCode != null && FB.wilaya(r.toTerritoryCode)) || byName(r.toTerritoryName);
        if (!w){ unknown.push(r.toTerritoryName || String(r.toTerritoryCode)); continue; }
        const price = re => num((r.deliveryPrices || []).find(p => re.test(String(p.deliveryType || "")))?.price);
        rows.push({code: w[0], home: price(/^home$/i), desk: price(/pickup|desk|stop/i)});
      }
    }
    return {rows, unknown, communes};
  }

  // Sends one order to ZR. Returns {tracking} once the parcel exists at ZR, or {need, options} when the owner has to
  // choose (the wilaya, the commune or the ZR desk could not be matched for certain). Nothing is guessed.
  async function courierSend(c, o, choice, onStep = () => {}){
    if (o.courier_tracking) return {tracking: o.courier_tracking, already: true};
    if (o.shipping_pending) fail("courier:shipping");
    if (["cancelled", "failed", "delivered"].includes(o.status)) fail("courier:status");
    const s = must(await c.rpc("courier_get"));
    if (!s.enabled) fail("courier:off");
    if (!s.has_key || !s.has_tenant) fail("courier:keys");
    const w = FB.wilaya(o.wilaya_code), parent = w && w[4];
    const communes = await liveApi.communes(o.wilaya_code).catch(() => []);
    const ours = communes.find(x => x.id === o.commune_id) || {ar: o.commune_name, fr: o.commune_name};
    const desk = o.delivery === "desk";
    const link = async (ref, tracking, state, label) => {
      must(await c.rpc("courier_link", {p_order: o.id, p_ref: ref || "", p_tracking: tracking, p_state: state || "", p_label: label || ""}));
      return {tracking};
    };

    if (s.provider === "zr_old"){
      onStep("send");
      const code = o.wilaya_code > 58 && parent ? parent : o.wilaya_code;
      const b = await zrCall(c, "POST", "/add_colis", {Colis: [{
        Tracking: o.order_number, TypeLivraison: desk ? "1" : "0", TypeColis: "0", Confrimee: "1",
        Client: `${o.first_name || ""} ${o.last_name || ""}`.trim(), MobileA: o.phone, MobileB: o.phone2 || "",
        Adresse: o.address || ours.fr || o.commune_name || "", IDWilaya: String(code), Commune: ours.fr || o.commune_name || "",
        Total: String(o.total), Note: o.note || "", TProduit: zrProducts(o), id_Externe: o.order_number, Source: "Flame Boutique34"}]}, o.id);
      const r = b?.Colis?.[0], msg = r?.MessageRetour;
      if (msg === "Good" || msg === "Double Tracking") return link("", r.Tracking || o.order_number, "", "");
      const e = new Error("courier:refused"); e.detail = String(msg || JSON.stringify(b || "")).slice(0, 300); throw e;
    }

    // already sent (a page closed halfway through, a second click): find it by our order number instead of sending twice
    onStep("check");
    const found = await zrCall(c, "POST", "/parcels/search", {pageNumber: 1, pageSize: 10,
      advancedFilter: {logic: "and", filters: [{field: "externalId", operator: "eq", value: o.order_number}]}});
    const prev = (found?.items || []).find(p => p.externalId === o.order_number);
    if (prev) return link(prev.id, prev.trackingNumber || prev.id, prev.state?.name, prev.state?.description);

    onStep("places");
    const wilayas = await zrTerritories(c, "wilaya");
    const zw = choice.wilaya ? wilayas.find(t => t.id === choice.wilaya)
      : wilayas.find(t => +t.code === +o.wilaya_code) || (w && wilayas.find(t => zrSame(t.name, w[2]) || zrSame(t.name, w[1])))
        || (parent && wilayas.find(t => +t.code === +parent));
    if (!zw) return {need: "wilaya", options: wilayas.map(t => ({id: t.id, name: `${t.code ?? ""} ${t.name || ""}`.trim()}))};
    const zcs = await zrTerritories(c, "commune", zw.id);
    const zc = choice.commune ? zcs.find(t => t.id === choice.commune) : zcs.find(t => zrSame(t.name, ours.fr) || zrSame(t.name, ours.ar));
    if (!zc) return {need: "commune", wilaya: zw.id, options: zcs.map(t => ({id: t.id, name: t.name || ""}))};
    let hubId = null;
    if (desk){
      const b = await zrCall(c, "POST", "/hubs/search", {pageNumber: 1, pageSize: 200, orderBy: ["name asc"],
        advancedFilter: {logic: "and", filters: [{field: "isPickupPoint", operator: "eq", value: true}, {field: "address.cityTerritoryId", operator: "eq", value: zw.id}]}});
      const hubs = (b?.items || []).filter(h => h.isPickupPoint !== false && (!h.address?.cityTerritoryId || h.address.cityTerritoryId === zw.id));
      const pick = choice.hub ? hubs.find(h => h.id === choice.hub) : hubs.length === 1 ? hubs[0] : null;
      if (!hubs.length) fail("courier:nodesk");
      if (!pick) return {need: "desk", wilaya: zw.id, commune: zc.id,
        options: hubs.map(h => ({id: h.id, name: [h.name, h.address?.street].filter(Boolean).join(" - ")}))};
      hubId = pick.id;
    }

    onStep("send");
    const body = {
      customer: {customerId: crypto.randomUUID(), name: `${o.first_name || ""} ${o.last_name || ""}`.trim(),
        phone: {number1: zrPhone(o.phone), ...(o.phone2 ? {number2: zrPhone(o.phone2)} : {})}},
      deliveryAddress: {cityTerritoryId: zw.id, districtTerritoryId: zc.id, street: (o.address || zc.name || ours.fr || "").slice(0, 250)},
      orderedProducts: (o.order_items || []).map(l => ({productName: `${l.name?.fr || l.name?.ar || l.product_id} (${l.color?.fr || l.color?.ar || ""}, ${l.size})`.slice(0, 200),
        quantity: l.qty, unitPrice: l.unit_price, stockType: "none"})),
      deliveryType: desk ? "pickup-point" : "home",
      amount: o.total, description: zrProducts(o), externalId: o.order_number,
      ...(hubId ? {hubId} : {})};
    const made = await zrCall(c, "POST", "/parcels", body, o.id);
    if (!made?.id) fail("courier:noid");
    onStep("read");
    const p = await zrCall(c, "GET", "/parcels/" + made.id, null, o.id);
    return link(made.id, p?.trackingNumber || made.id, p?.state?.name, p?.state?.description);
  }

  // mirrors place_order() in supabase/schema.sql
  function placeOrderDemo(db, p){
    const k = String(p.idempotency_key||"");
    if (!/^[0-9a-f-]{36}$/i.test(k)) fail("invalid:request");
    const prev = db.orders.find(o => o.idempotency_key === k);
    if (prev) return {order_number:prev.order_number, tracking_code:prev.tracking_code, subtotal:prev.subtotal, shipping:prev.shipping,
      shipping_pending:prev.shipping_pending, total:prev.total, repeat:true};
    const fname = String(p.first_name||"").trim(), lname = String(p.last_name||"").trim();
    const ph = FB.normPhone(p.phone), ph2 = FB.normPhone(p.phone2) || null, wa = FB.normPhone(p.whatsapp) || null;
    const ig = String(p.instagram||"").trim().replace(/^@/,"") || null;
    if (fname.length < 2 || fname.length > 40) fail("invalid:first_name");
    if (lname.length < 2 || lname.length > 40) fail("invalid:last_name");
    if (!FB.validPhone(ph)) fail("invalid:phone");
    if (ph2 && !FB.validPhone(ph2)) fail("invalid:phone2");
    if (wa && !FB.validPhone(wa)) fail("invalid:whatsapp");
    if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) fail("invalid:instagram");
    if (String(p.hp||"")) fail("invalid:request");
    const w = FB.wilaya(p.wilaya); if (!w) fail("invalid:wilaya");
    const list = communesOf(db, w[0]);
    let cid = null, cname;
    if (list.length){ const c = list.find(c => c.id === +p.commune_id); if (!c) fail("invalid:commune"); cid = c.id; cname = c.ar; }
    else { cname = String(p.commune_name||"").trim(); if (cname.length < 2 || cname.length > 60) fail("invalid:commune"); }
    if (!["home","desk"].includes(p.delivery)) fail("invalid:delivery");
    const rate = FB.rateFor(db.rates, w[0], cid)[p.delivery];
    if (!rate.available) fail("invalid:delivery");
    const addr = String(p.address||"").trim();
    if (p.delivery === "home" && (addr.length < 5 || addr.length > 200)) fail("invalid:address");
    // fake orders (same rules as place_order; the network check needs a server and is left out here)
    if ((db.blocked || []).some(b => b.phone === ph)) fail("blocked");
    if (db.orders.filter(o => o.phone === ph && ["received","contacting"].includes(o.status)).length >= 3) fail("limit:open");
    if (db.orders.some(o => o.phone === ph && Date.now() - new Date(o.created_at) < 60000)) fail("limit:wait");
    if (!Array.isArray(p.items) || !p.items.length || p.items.length > 20) fail("invalid:items");
    // stock is taken on this copy of the database, which is saved only when the whole order is valid
    const lines = []; let sub = 0, cost = 0;
    for (const it of p.items){
      const prod = db.products.find(x => x.id === it.id && x.active);
      if (!prod) fail("unavailable:" + it.id);
      const qty = +it.qty, ci = +(it.color ?? 0);
      if (!Number.isInteger(qty) || qty < 1 || qty > 10 || !prod.sizes.includes(it.size) || !prod.colors[ci]) fail("invalid:items");
      const left = FB.stockOf(prod, it.size);
      if (left != null){ if (left < qty) fail("out_of_stock:" + prod.id); prod.stock[it.size] = left - qty; }
      const c = db.costs[prod.id] || 0;
      lines.push({product_id:prod.id, name:prod.name, size:it.size, color:prod.colors[ci], qty, unit_price:prod.price, unit_cost:c});
      sub += prod.price * qty; cost += c * qty;
    }
    let code;
    do {
      const b = crypto.getRandomValues(new Uint8Array(8));
      code = "FLM-" + [...b].map(x => ALPHABET[x % 32]).join("");
    } while (db.orders.some(o => o.tracking_code === code));
    const id = ++db.seq, now = new Date().toISOString(), fee = rate.price;
    db.orders.unshift({id, order_number:"FB-" + String(id).padStart(5,"0"), tracking_code:code, idempotency_key:k,
      created_at:now, updated_at:now, status:"received", first_name:fname, last_name:lname, phone:ph, phone2:ph2, whatsapp:wa, instagram:ig,
      wilaya_code:w[0], wilaya_name:w[1], commune_id:cid, commune_name:cname, delivery:p.delivery, address:p.delivery === "home" ? addr : "",
      note:String(p.note||"").slice(0,500), lang:p.lang === "fr" ? "fr" : "ar", subtotal:sub, shipping:fee, shipping_pending:fee == null,
      total:sub + (fee || 0), cost_total:cost, admin_note:"", order_items:lines,
      order_status_history:[{status:"received", note:"", by_admin:false, created_at:now}]});
    const o = db.orders[0];
    return {order_number:o.order_number, tracking_code:o.tracking_code, subtotal:o.subtotal, shipping:o.shipping,
      shipping_pending:o.shipping_pending, total:o.total, repeat:false};
  }
  // mirrors the orders_before_update trigger
  function setStatusDemo(db, o, status, note){
    if (!FB.STATUSES[status]) fail("invalid:status");
    if (o.status === status) return;
    const was = FB.RELEASES.includes(o.status), now = FB.RELEASES.includes(status);
    if (was !== now) for (const l of o.order_items){
      const p = db.products.find(x => x.id === l.product_id), left = p && FB.stockOf(p, l.size);
      if (left != null) p.stock[l.size] = Math.max(0, left + (now ? l.qty : -l.qty));
    }
    o.status = status; o.updated_at = new Date().toISOString();
    o.order_status_history.push({status, note:String(note||"").slice(0,300), by_admin:true, created_at:o.updated_at});
  }
  // mirrors submit_review() in supabase/schema.sql
  function submitReviewDemo(db, code, phone, r){
    const o = db.orders.find(o => o.tracking_code === String(code||"").trim().toUpperCase() && o.phone === FB.normPhone(phone));
    if (!o) fail("not_found");
    if (o.status !== "delivered") fail("not_delivered");
    if (db.reviews.some(x => x.order_id === o.id)) fail("already_reviewed");
    const rating = +r.rating; if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail("invalid:rating");
    const body = String(r.body||"").trim(); if (body.length > 600) fail("invalid:body");
    let pid = String(r.product_id||"").trim() || null;
    if (pid && !o.order_items.some(i => i.product_id === pid)) fail("invalid:product");
    if (pid && !db.products.some(p => p.id === pid)) pid = null;
    let name = String(r.name||"").trim().slice(0,40);
    if (name.length < 2) name = (o.first_name + (o.last_name ? " " + o.last_name[0] + "." : "")).slice(0,40);
    db.reviews.unshift({id: ++db.rseq, created_at: new Date().toISOString(), order_id: o.id, product_id: pid, name, wilaya_name: o.wilaya_name || "",
      rating, body, photo: "", verified: true, status: "pending"});
  }
  const publicReview = ({order_id, status, ...r}) => r;
  // a short pause so a demo order feels like a real request, and the button states can be seen
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const SESSION = "fb34-demo-session";

  const demoApi = {
    async loadCatalog(){
      const db = readDb();
      return {settings: FB.mergeSettings(db.settings), products: db.products.filter(p => p.active).sort((a,b) => a.sort-b.sort), rates: clone(db.rates),
        reviews: db.reviews.filter(r => r.status === "approved").map(publicReview)};
    },
    async communes(w){ return communesOf(readDb(), w); },
    async placeOrder(payload){ await wait(500); const db = readDb(), res = placeOrderDemo(db, payload); writeDb(db); return res; },
    async trackOrder(code, phone){
      await wait(400);
      const o = readDb().orders.find(o => o.tracking_code === String(code||"").trim().toUpperCase() && o.phone === FB.normPhone(phone));
      if (!o) return null;
      return {order_number:o.order_number, tracking_code:o.tracking_code, status:o.status, created_at:o.created_at, updated_at:o.updated_at,
        first_name:o.first_name, last_name:o.last_name,
        delivery:o.delivery, wilaya_name:o.wilaya_name, commune_name:o.commune_name, address:o.address, subtotal:o.subtotal, shipping:o.shipping,
        shipping_pending:o.shipping_pending, total:o.total,
        history:o.order_status_history.map(h => ({status:h.status, at:h.created_at})),
        items:o.order_items.map(i => ({product_id:i.product_id, name:i.name, size:i.size, color:i.color, qty:i.qty, unit_price:i.unit_price})),
        reviewed:readDb().reviews.some(r => r.order_id === o.id),
        courier: o.courier_tracking ? {name: "ZR Express", tracking: o.courier_tracking, stage: o.courier_stage, label: o.courier_label, at: o.courier_at} : null};
    },
    async submitReview(code, phone, r){ await wait(400); const db = readDb(); submitReviewDemo(db, code, phone, r); writeDb(db); },
    async signIn(password){
      const db = readDb(), want = db.passwordSha256 || cfg.DEMO_PASSWORD_SHA256;
      if (!want || await sha256(password) !== want) throw new Error("bad_password");
      try { sessionStorage.setItem(SESSION, "1"); } catch {}
    },
    async hasSession(){ try { return sessionStorage.getItem(SESSION) === "1"; } catch { return false; } },
    async signOut(){ try { sessionStorage.removeItem(SESSION); } catch {} },
    async changePassword(password){ const db = readDb(); db.passwordSha256 = await sha256(password); writeDb(db); },
    async adminLoad(){
      const db = readDb();
      return {settings: FB.mergeSettings(db.settings), products: db.products.sort((a,b) => a.sort-b.sort).map(p => ({...clone(p), cost: db.costs[p.id] || 0})),
        orders: clone(db.orders), rates: clone(db.rates), reviews: clone(db.reviews), blocked: clone(db.blocked)};
    },
    async saveSettings(s){ const db = readDb(); db.settings = clone(s); writeDb(db); },
    async saveProduct(p){
      const db = readDb(), {cost, ...row} = clone(p), i = db.products.findIndex(x => x.id === p.id);
      // date first added, kept on later saves; strictly after the newest one, so "newest first" never ties
      const newest = Math.max(0, ...db.products.map(x => Date.parse(x.created_at) || 0));
      row.created_at = (i >= 0 && db.products[i].created_at) || row.created_at || new Date(Math.max(Date.now(), newest + 1)).toISOString();
      i < 0 ? db.products.push(row) : db.products[i] = row;
      db.costs[p.id] = cost || 0; writeDb(db);
    },
    async deleteProduct(id){ const db = readDb(); db.products = db.products.filter(p => p.id !== id); delete db.costs[id]; writeDb(db); },
    async setOrderStatus(id, status, note){ const db = readDb(), o = db.orders.find(x => x.id === id); if (!o) fail("not_found"); setStatusDemo(db, o, status, note); writeDb(db); },
    async updateOrder(id, patch){
      const db = readDb(), o = db.orders.find(x => x.id === id); if (!o) fail("not_found");
      Object.assign(o, patch, {updated_at:new Date().toISOString()});
      if ("shipping" in patch && patch.shipping != null) o.shipping_pending = false;
      o.total = o.subtotal + (o.shipping || 0);
      writeDb(db);
    },
    async saveRates(rows, remove=[]){
      const db = readDb();
      rows.forEach(r => db.rates[rateKey(r)] = clone(r));
      remove.forEach(([w, scope]) => delete db.rates[`${w}:${scope}`]);
      writeDb(db);
    },
    async moveCommunes(ids, w){
      const db = readDb();
      ids.forEach(id => { const c = FB_LOCATIONS.communes.find(c => c[0] === id); if (c) c[1] === +w ? delete db.moves[id] : db.moves[id] = +w; });
      writeDb(db);
    },
    async blockPhone(phone, note){ const db = readDb(), ph = FB.normPhone(phone); db.blocked = db.blocked.filter(b => b.phone !== ph); db.blocked.unshift({phone: ph, note: note || "", created_at: new Date().toISOString()}); writeDb(db); },
    async unblockPhone(phone){ const db = readDb(); db.blocked = db.blocked.filter(b => b.phone !== phone); writeDb(db); },
    // demo: settings are kept, but nothing can be sent from a browser-only shop
    async notifyGet(){ const n = readDb().notify; return {...n, pg_net: false, demo: true}; },
    async notifySave(token, chat, enabled){ const db = readDb(); db.notify = {enabled: !!enabled, chat: chat || "", has_token: db.notify.has_token || !!token}; writeDb(db); },
    async notifyTest(){ fail("demo"); },
    async notifyResult(){ return {pending: true}; },
    // demo: ZR settings are kept, but nothing is sent: a parcel gets a "ZR-DEMO" number and each status check moves it one step
    async courierGet(){ return {...readDb().courier, pg_net: false, auto: false, demo: true}; },
    async courierSave(provider, key, tenant, enabled){
      if (!["zr", "zr_old"].includes(provider)) fail("invalid:provider");
      if (provider === "zr" && tenant && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant)) fail("invalid:tenant");
      const db = readDb(); db.courier = {provider, enabled: !!enabled, has_key: db.courier.has_key || !!key, has_tenant: db.courier.has_tenant || !!tenant}; writeDb(db);
    },
    async courierTest(){ fail("demo"); },
    async courierRates(){ fail("demo"); },
    async courierSend(o){
      await wait(500);
      const db = readDb(), d = db.orders.find(x => x.id === o.id); if (!d) fail("not_found");
      if (d.courier_tracking) return {tracking: d.courier_tracking, already: true};
      if (d.shipping_pending) fail("courier:shipping");
      if (["cancelled", "failed", "delivered"].includes(d.status)) fail("courier:status");
      if (!db.courier.enabled) fail("courier:off");
      if (!db.courier.has_key || !db.courier.has_tenant) fail("courier:keys");
      const now = new Date().toISOString();
      Object.assign(d, {courier_tracking: "ZR-DEMO-" + Array.from({length: 6}, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join(""),
        courier_state: "commande_recue", courier_label: "Commande reçue (تجربة)", courier_stage: "created", courier_at: now, courier_sent_at: now});
      if (["received", "contacting", "confirmed"].includes(d.status)) setStatusDemo(db, d, "preparing", "أُرسل إلى ZR Express: " + d.courier_tracking);
      writeDb(db); return {tracking: d.courier_tracking, demo: true};
    },
    async courierSync(){
      const db = readDb(); let read = 0;
      if (!db.courier.enabled) return {read: 0, asked: 0, off: true};
      for (const o of db.orders){
        if (!o.courier_tracking || ["delivered", "cancelled", "failed"].includes(o.status) || ["delivered", "returned", "cancelled"].includes(o.courier_stage)) continue;
        const path = o.delivery === "desk" ? ["created", "transit", "desk", "delivered"] : ["created", "transit", "out", "delivered"];
        const next = path[Math.min(path.indexOf(o.courier_stage) + 1, path.length - 1)] || "transit";
        const label = {transit: "En transit", out: "En cours de livraison", desk: "Arrivé au bureau", delivered: "Livré"}[next] + " (تجربة)";
        Object.assign(o, {courier_stage: next, courier_state: next, courier_label: label, courier_at: new Date().toISOString()});
        const target = {transit: "handed_to_carrier", out: "out_for_delivery", desk: "out_for_delivery", delivered: "delivered"}[next];
        if (FB.STEPS.includes(o.status) && FB.STEPS.indexOf(target) > FB.STEPS.indexOf(o.status)) setStatusDemo(db, o, target, "ZR Express: " + label);
        read++;
      }
      writeDb(db); return {read, asked: 0};
    },
    async courierUnlink(id){
      const db = readDb(), o = db.orders.find(x => x.id === id); if (!o) fail("not_found");
      ["courier_ref", "courier_tracking", "courier_state", "courier_label", "courier_stage", "courier_at", "courier_sent_at"].forEach(k => o[k] = null); writeDb(db);
    },
    // demo: an order placed in another tab of this browser
    async onNewOrder(cb){
      let known = readDb().orders.length;
      addEventListener("storage", e => { if (e.key !== KEY) return; const db = readDb(); if (db.orders.length > known) cb(db.orders[0]); known = db.orders.length; });
    },
    async addReview(r){ const db = readDb(); db.reviews.unshift({id: ++db.rseq, created_at: new Date().toISOString(), order_id: null, ...ownerReview(r)}); writeDb(db); },
    async setReviewStatus(id, status){ const db = readDb(), r = db.reviews.find(x => x.id === id); if (!r) fail("not_found"); r.status = status; writeDb(db); },
    async deleteReview(id){ const db = readDb(); db.reviews = db.reviews.filter(x => x.id !== id); writeDb(db); },
    async diagnose(){ return [{key: "demo", ok: false}]; },
    async uploadImage(blob){
      return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    },
    async resetDemo(){ writeDb(upgrade(null)); }
  };

  return {mode: live ? "live" : "demo", ...(live ? liveApi : demoApi)};
})();
