/* Shared data and helpers for the store (index.html) and the dashboard (admin.html). */
window.FB = (() => {
  // [code, Arabic, French, zone, parent code] from src/locations.js, generated from data/ by tools/gen_locations.py.
  // Zones only help the owner fill delivery prices in bulk; no price is ever assumed.
  const WILAYAS = window.FB_LOCATIONS.wilayas;
  const ZONES = {1:"برج بوعريريج",2:"الولايات المجاورة",3:"باقي الشمال",4:"الهضاب والجنوب القريب",5:"أقصى الجنوب"};

  const L = (ar,fr) => ({ar,fr});
  // texts the owner can edit from the dashboard
  const TEXTS = {
    heroA:L("أناقةٌ محتشمة","L'élégance pudique,"),
    pCod:L("الدفع عند الاستلام","Paiement à la livraison"),
    pShip:L("توصيل إلى 69 ولاية","Livraison dans 69 wilayas"),
    pSwap:L("الاستبدال عند المعاينة","Échange à la livraison"),
    shopTitle:L("المجموعة","La collection"),
    shopSub:L("اختاري القطعة لرؤية الألوان والمقاسات. الأسعار بالدينار الجزائري.","Choisissez une pièce pour voir les couleurs et les tailles. Prix en dinars algériens."),
    story2:L("لا تعرفين مقاسك؟ راسلينا على واتساب بطولك ومقاسك المعتاد، ونساعدك في الاختيار قبل الطلب.","Vous hésitez sur la taille ? Envoyez-nous votre taille habituelle et votre hauteur sur WhatsApp, nous vous conseillons avant la commande.")
  };
  const TEXT_LABELS = {heroA:"عنوان الواجهة",pCod:"ميزة 1",pShip:"ميزة 2",pSwap:"ميزة 3",
    shopTitle:"عنوان قسم المتجر",shopSub:"النص تحت عنوان المتجر",story2:"نصيحة المقاسات"};

  const DEFAULT_SETTINGS = {
    // contact details and links stay empty until the owner enters the real ones in the dashboard
    whatsapp:"213549902289", phone_display:"0549 90 22 89",
    address:L("برج بوعريريج","Bordj Bou Arréridj"),
    hours:L("",""),
    map_url:"https://www.google.com/maps/place/Flame+boutique/@36.0710402,4.760066,17z/data=!3m1!4b1!4m6!3m5!1s0x128cbd0073ac2ab5:0x2582a36c320c6eed!8m2!3d36.0710359!4d4.7574911!16s%2Fg%2F11yyjfkf65",
    socials:{instagram:"https://www.instagram.com/flame_boutique_34/", facebook:"https://www.facebook.com/share/1Jvk2UUsFk/", tiktok:"https://www.tiktok.com/@flame.boutique"},
    texts:TEXTS,
    pixels:{facebook:"", tiktok:""},
    policy:{ar:"", fr:""},  // payment, delivery and exchange page, written by the owner (policy.html)
    racks:[],               // racks made by the owner: [{id, name:{ar,fr}, items:[product ids], active}]; none = one automatic rack
    racks_on:true,          // false hides every rack  // ad pixel IDs, entered by the owner; empty = nothing loads
    categories:[{id:"abaya",ar:"عبايات",fr:"Abayas"},{id:"caftan",ar:"جلابيات وقفاطين",fr:"Djellabas & caftans"},{id:"dress",ar:"فساتين سهرة",fr:"Robes de soirée"},
      {id:"set",ar:"أطقم وتنانير",fr:"Ensembles & jupes"},{id:"hijab",ar:"حجابات",fr:"Hijabs & foulards"}],
    // size guide shown in the product window; the owner edits these to match her own garments (cm)
    size_guide_on:true,
    size_guide:[
      {label:"S",   fr:"36 – 38", bust:"84 – 88",   waist:"64 – 68",  hips:"90 – 94"},
      {label:"M",   fr:"40 – 42", bust:"92 – 96",   waist:"72 – 76",  hips:"98 – 102"},
      {label:"L",   fr:"44 – 46", bust:"100 – 104", waist:"80 – 84",  hips:"106 – 110"},
      {label:"XL",  fr:"48 – 50", bust:"108 – 114", waist:"88 – 94",  hips:"114 – 120"},
      {label:"XXL", fr:"52 – 54", bust:"118 – 124", waist:"98 – 104", hips:"124 – 130"}
    ]
  };



  const TYPES = {abaya:"عباية","abaya-trim":"عباية مطرزة",caftan:"قفطان",dress:"فستان",set:"طقم",skirt:"تنورة",khimar:"خمار / حجاب"};
  // same codes and order as the order_statuses table
  const STATUSES = {
    received:L("تم استلام الطلب","Commande reçue"), contacting:L("قيد التأكيد والاتصال بالزبونة","Confirmation en cours"),
    confirmed:L("تم تأكيد الطلب","Commande confirmée"), preparing:L("قيد التحضير","En préparation"),
    handed_to_carrier:L("تم تسليم الطلب لشركة التوصيل","Remise au transporteur"), out_for_delivery:L("خرج للتوصيل","En cours de livraison"),
    delivered:L("تم التسليم","Livrée"), cancelled:L("أُلغي الطلب","Annulée"), failed:L("تعذّر التسليم","Livraison impossible")};
  const STEPS = ["received","contacting","confirmed","preparing","handed_to_carrier","out_for_delivery","delivered"];
  const RELEASES = ["cancelled","failed"];  // pieces go back to stock
  // where the parcel is at the delivery company (courier_stage() in supabase/schema.sql)
  const COURIER_STAGES = {
    created:L("سُجّل عند شركة التوصيل","Enregistrée chez le transporteur"), transit:L("في الطريق","En transit"),
    out:L("خرج للتوصيل","En cours de livraison"), desk:L("وصل إلى مكتب التوصيل، جاهز للاستلام","Arrivée au bureau, prête à retirer"),
    attempt:L("محاولة توصيل لم تنجح، سيُعاد الاتصال بك","Tentative de livraison échouée, nouvel essai prévu"), delivered:L("تم التسليم","Livrée"),
    returned:L("في طريق العودة إلى المحل","En retour vers la boutique"), cancelled:L("أُلغي عند شركة التوصيل","Annulée chez le transporteur"),
    other:L("لدى شركة التوصيل","Chez le transporteur")};

  /* Garment drawing used when a product has no photo yet. */
  function garment(p, hex){
    const fold = `stroke="#000" stroke-opacity=".14" stroke-width="1.2" fill="none"`;
    const gold = `stroke="#D9A85B" stroke-width="2" fill="none"`;
    const hook = `<path d="M100 26c0-8 9-9 9-3 0 4-4 5-9 9" stroke="#8b7a80" stroke-width="2" fill="none"/>`;
    const type = p.type || "abaya", trim = type==="abaya-trim";
    let body;
    if (type.startsWith("abaya")||type==="caftan"){
      body = `<path fill="${hex}" d="M72 40q28 14 56 0l22 8 28 104-14 4-18-62 10 188H44l10-188-18 62-14-4 28-104z"/>
        <path ${fold} d="M86 100l-8 178M114 100l8 178M100 60v218"/>
        <path ${trim||type==="caftan"?gold:fold} d="M86 44q14 22 28 0"/>`;
      if (type==="caftan") body += `<path ${gold} d="M100 52v226"/><rect x="58" y="122" width="84" height="14" rx="3" fill="#D9A85B"/>`;
      if (trim) body += `<path ${gold} stroke-dasharray="2 5" d="M46 270h108M28 148l12-3M172 148l-12-3"/>`;
    } else if (type==="dress"){
      body = `<path fill="${hex}" d="M76 40q24 12 48 0l18 8 30 104-13 5-24-66-9 33 36 154H38l36-154-9-33-24 66-13-5 30-104z"/>
        <rect x="72" y="118" width="56" height="7" rx="3" fill="#E8D8C0"/>
        <path ${fold} d="M90 128l-22 150M110 128l22 150M100 128v150"/>`;
    } else if (type==="set"){
      body = `<path fill="${hex}" d="M72 40q28 14 56 0l20 8 22 90-13 4-15-52 4 90H56l4-90-15 52-13-4 22-90z"/>
        <path fill="#000" fill-opacity=".22" d="M62 178h76l18 102H44z"/><path fill="${hex}" fill-opacity=".85" d="M62 178h76l18 102H44z"/>
        <path ${fold} d="M80 182l-10 98M100 182v98M120 182l10 98M86 44q14 20 28 0"/>`;
    } else if (type==="skirt"){
      body = `<rect x="64" y="60" width="72" height="14" rx="4" fill="${hex}"/><path fill="${hex}" d="M64 74h72l26 206H38z"/>
        <path ${fold} d="M72 76l-20 204M82 76l-12 204M92 76l-4 204M100 76v204M108 76l4 204M118 76l12 204M128 76l20 204"/>`;
    } else {
      body = `<path fill="${hex}" d="M100 34c-30 0-44 26-42 56-20 30-34 110-24 170h132c10-60-4-140-24-170 2-30-12-56-42-56z"/>
        <ellipse cx="100" cy="92" rx="22" ry="28" fill="#F3E1D6"/><path fill="${hex}" d="M74 82c4-26 48-26 52 0-14-8-38-8-52 0z"/>
        <path ${fold} d="M70 140q30 30 60 0M58 200q42 40 84 0M80 240v20M120 240v20"/>`;
    }
    return `<svg viewBox="0 0 200 300" aria-hidden="true">${type==="khimar"?"":hook}${body}</svg>`;
  }

  // all photos of a product, the chosen color's photo first, then the main photo, then the extra photos
  function gallery(p, ci=0){
    const c = p.colors?.[ci] || p.colors?.[0];
    return [...new Set([c?.image, p.image, ...(p.images || [])].filter(Boolean))];
  }
  // first photo, else the drawing
  function media(p, ci=0){
    const c = p.colors?.[ci] || p.colors?.[0] || {hex:"#8a7a80"};
    const url = gallery(p, ci)[0];
    return url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : garment(p, c.hex);
  }
  const tint = hex => `background:color-mix(in oklab, ${hex||"#8a7a80"} 16%, var(--frame, var(--surface)))`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = (n, cur="دج") => Math.round(n||0).toLocaleString("fr-FR").replace(/[  ]/g," ")+" "+cur;
  const wilaya = code => WILAYAS.find(w => w[0]===+code);
  // null = stock not tracked for this size
  const stockOf = (p, size) => (p.stock && p.stock[size] != null) ? +p.stock[size] : null;
  const soldOut = p => !!p.stock && p.sizes.every(s => stockOf(p,s) === 0);

  function mergeSettings(saved){
    const {shipping, ...rest} = saved || {};  // version 1 kept prices here; they now live in shipping_rates
    const s = {...DEFAULT_SETTINGS, ...rest};
    s.texts = {...TEXTS, ...(rest.texts||{})};
    s.socials = {...DEFAULT_SETTINGS.socials, ...(rest.socials||{})};
    s.pixels = {...DEFAULT_SETTINGS.pixels, ...(rest.pixels||{})};
    s.policy = {...DEFAULT_SETTINGS.policy, ...(rest.policy||{})};
    s.racks = Array.isArray(rest.racks) ? rest.racks : [];
    s.size_guide = Array.isArray(rest.size_guide) ? rest.size_guide : DEFAULT_SETTINGS.size_guide;
    return s;
  }

  // 0555 12 34 56, +213 555123456, 00213555123456 -> 0555123456 (same rule as norm_phone in SQL)
  const normPhone = t => String(t||"").replace(/[\s.()-]/g,"").replace(/^(\+|00)213/,"0");
  const validPhone = t => /^0[567]\d{8}$/.test(normPhone(t));

  // delivery price for a wilaya, with an optional commune override. price null = not set yet (needs confirmation)
  // rates: {"34:0": {home_price, desk_price, home_available, desk_available}, "34:1234": {...}}
  function rateFor(rates, w, cid){
    const r = (cid != null && rates[`${w}:${cid}`]) || rates[`${w}:0`] || null;
    const m = k => ({available: r ? r[k+"_available"] !== false : true, price: r ? (r[k+"_price"] ?? null) : null});
    return {home:m("home"), desk:m("desk")};
  }

  // search text: case, accents, Arabic diacritics and letter variants ignored
  const fold = s => String(s||"").normalize("NFD").replace(/[\u0300-\u036f\u064b-\u0655\u0670\u0640]/g,"")
    .replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").toLowerCase().replace(/['’.-]/g," ").replace(/\s+/g," ").trim();

  // a Google Maps place link carries the shop position (!3d<lat>!4d<lng>, or @lat,lng): used for the embedded map
  function mapPoint(url){
    const u = String(url||""), m = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    return m ? {lat:+m[1], lng:+m[2]} : null;
  }

  // reviews: average and count, for one product or (pid undefined) for the whole shop
  function ratingOf(reviews, pid){
    const list = (reviews||[]).filter(r => pid === undefined || r.product_id === pid);
    return {n: list.length, avg: list.length ? list.reduce((s,r) => s + r.rating, 0) / list.length : 0, list};
  }
  // five stars, filled to the rating (halves rounded)
  function stars(v, cls="stars"){
    const pct = Math.round(Math.max(0, Math.min(5, v)) * 2) / 2 * 20;
    return `<span class="${cls}" role="img" aria-label="${(Math.round(v*10)/10).toLocaleString("fr-FR")} / 5"><span style="width:${pct}%"></span></span>`;
  }

  // policy text: "## " starts a heading, "- " a list item, an empty line a new paragraph
  function policyHTML(text){
    let html = "", list = false;
    const close = () => { if (list){ html += "</ul>"; list = false; } };
    String(text||"").split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if (!line){ close(); return; }
      if (line.startsWith("## ")){ close(); html += `<h2>${esc(line.slice(3))}</h2>`; return; }
      if (/^[-•]\s/.test(line)){ if (!list){ html += "<ul>"; list = true; } html += `<li>${esc(line.slice(2))}</li>`; return; }
      close(); html += `<p>${esc(line)}</p>`;
    });
    close();
    return html;
  }
  // until the owner writes the page: only what the site already promises and how it works
  function policyFallback(s, lang){
    const tx = k => s.texts[k]?.[lang] || TEXTS[k][lang];
    return lang === "fr"
      ? `## Paiement\n- ${tx("pCod")}. Rien n'est payé en ligne au moment de la commande.\n## Livraison\n- ${tx("pShip")}.\n- Le prix de livraison vers votre wilaya et votre commune s'affiche avant de confirmer la commande. S'il n'est pas encore fixé, nous vous le communiquons lors de notre appel, avant l'envoi.\n- Après la commande, nous vous appelons pour la confirmer. Vous pouvez la suivre sur la page « Suivre ma commande ».\n## Échange\n- ${tx("pSwap")}.\n- Pour un échange ou toute question, écrivez-nous sur WhatsApp avec votre numéro de commande.`
      : `## الدفع\n- ${tx("pCod")}. لا يُدفع أي مبلغ عبر الموقع عند الطلب.\n## التوصيل\n- ${tx("pShip")}.\n- يظهر سعر التوصيل إلى ولايتك وبلديتك قبل تأكيد الطلب. إن لم يكن محدداً بعد، نبلغك به عند الاتصال بك قبل الإرسال.\n- بعد الطلب نتصل بك لتأكيده، ويمكنك متابعته من صفحة «تتبع طلبي».\n## الاستبدال\n- ${tx("pSwap")}.\n- للاستبدال أو لأي سؤال، راسلينا على واتساب مع رقم طلبك.`;
  }

  /* ---------- customer payment receipt (وصل الدفع) ----------
     A printable / save-as-PDF receipt, fully self-contained (carries its own <style>),
     so it looks the same on the store, the tracking page and the dashboard, in any theme,
     and prints on clean white paper. Nothing is ever invented: a price shown is a price given.
     o: {number, tracking, date, customer:{name, phone},
         delivery:{method:"home"|"desk", wilaya, commune, address},
         lines:[{name, variant, qty, unit}],   // unit may be null (price shown only when known)
         subtotal, shipping, shipping_pending, total,
         shop:{name, phone, address, instagram, site}} */
  function receiptLabels(lang){
    return lang === "fr" ? {
      title:"Reçu de commande", order:"N° de commande", tracking:"N° de suivi", date:"Date",
      customer:"Cliente", phone:"Téléphone", deliverTo:"Livraison", home:"À domicile",
      desk:"Au bureau du transporteur", address:"Adresse", product:"Article", qty:"Qté",
      unit:"Prix unité", lineTotal:"Total", subtotal:"Articles", shipping:"Livraison",
      total:"Montant à payer", totalNoShip:"Total hors livraison", pending:"À confirmer",
      cod:"Paiement à la livraison", thanks:"Merci pour votre confiance",
      kept:"Conservez ce reçu pour suivre votre commande.", cur:"DA"
    } : {
      title:"وصل استلام الطلب", order:"رقم الطلب", tracking:"رقم التتبع", date:"التاريخ",
      customer:"الزبونة", phone:"الهاتف", deliverTo:"التوصيل", home:"إلى المنزل",
      desk:"إلى مكتب شركة التوصيل", address:"العنوان", product:"القطعة", qty:"الكمية",
      unit:"سعر القطعة", lineTotal:"المجموع", subtotal:"سعر المنتجات", shipping:"التوصيل",
      total:"المبلغ المطلوب", totalNoShip:"المجموع دون التوصيل", pending:"يحتاج إلى تأكيد",
      cod:"الدفع عند الاستلام", thanks:"شكراً لثقتك بنا",
      kept:"احتفظي بهذا الوصل لمتابعة طلبك.", cur:"دج"
    };
  }
  const RECEIPT_CSS = `.fb-receipt{display:none}
@media print{html.fb-printing,body.fb-printing{background:#fff!important}
body.fb-printing>*:not(.fb-receipt){display:none!important}
body.fb-printing .fb-receipt{display:block!important}
@page{size:A4;margin:14mm}}
.fbr-doc{box-sizing:border-box;max-width:190mm;margin:0 auto;padding:8mm;color:#24190F;background:#fff;font-family:"Noto Naskh Arabic","Jost",system-ui,sans-serif;font-size:13px;line-height:1.7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.fbr-doc *{box-sizing:border-box;background-color:transparent;box-shadow:none;border:0;margin:0;position:static;float:none}
.fbr-ltr{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums}
.fbr-num{font-variant-numeric:tabular-nums}
.fbr-dim{color:#6B563F}
.fbr-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;padding-bottom:10px;border-bottom:2px solid #A27A48;margin-bottom:14px}
.fbr-brand{display:flex;align-items:center;gap:10px}
.fbr-mark{width:34px;height:40px;flex:none}
.fbr-name{font-family:"Marcellus",Georgia,serif;font-size:21px;letter-spacing:.14em;direction:ltr;line-height:1}
.fbr-sub{font-size:13px;color:#6B563F;margin-top:3px}
.fbr-contact{font-size:12px;color:#6B563F;text-align:end;display:grid;gap:2px}
.fbr-meta{width:100%;border-collapse:collapse;margin-bottom:10px}
.fbr-meta th{text-align:start;font-weight:400;color:#6B563F;padding:2px 0;width:38%;vertical-align:top}
.fbr-meta td{padding:2px 0;vertical-align:top}
.fbr-items{width:100%;border-collapse:collapse;margin:10px 0 2px}
.fbr-items thead th{background:#F4EAD9;color:#24190F;font-weight:500;padding:7px 8px;border-bottom:1px solid #D9C7A8;text-align:start}
.fbr-items tbody td{padding:7px 8px;border-bottom:1px solid #ECE0CC;vertical-align:top}
.fbr-items .fbr-c{text-align:center}
.fbr-items .fbr-e{text-align:end;white-space:nowrap}
.fbr-it{width:100%}
.fbr-sum{width:100%;max-width:300px;margin-inline-start:auto;border-collapse:collapse;margin-top:10px}
.fbr-sum td{padding:4px 0}
.fbr-sum td.fbr-e{text-align:end;white-space:nowrap}
.fbr-grand td{border-top:2px solid #A27A48;padding-top:8px;font-size:16px;font-weight:600}
.fbr-cod{margin-top:14px;padding:8px 12px;border:1px dashed #A27A48;border-radius:8px;text-align:center}
.fbr-foot{margin-top:16px;padding-top:10px;border-top:1px solid #D9C7A8;text-align:center;display:grid;gap:3px}
.fbr-thanks{font-family:"Marcellus",Georgia,serif;font-size:15px}`;

  function receiptHTML(o, lang = "ar"){
    const x = receiptLabels(lang), rtl = lang !== "fr", m = n => money(n, x.cur);
    const d = o.date instanceof Date ? o.date : new Date(o.date || Date.now());
    const p = n => String(n).padStart(2, "0");
    const date = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    const lines = o.lines || [], hasUnit = lines.some(l => l.unit != null);
    const ltr = s => `<span class="fbr-ltr">${esc(s)}</span>`;
    const flame = `<svg class="fbr-mark" viewBox="0 0 30 36" aria-hidden="true"><path fill="none" stroke="#24190F" stroke-width="1.3" d="M2 35V14a13 13 0 0 1 26 0v21"/><path fill="#A27A48" d="M15 12c2 3.5 5.5 5.5 5 10a5 5 0 0 1-10 0c-.3-3.3 2.6-4.6 3.2-7 .6 1.5 1.2 2 1.8 2.4.4-1.6.3-3.3 0-5.4Z"/></svg>`;
    const shop = o.shop || {}, deliv = o.delivery || {};
    const row = (dt, dd) => dd ? `<tr><th>${esc(dt)}</th><td>${dd}</td></tr>` : "";
    const method = deliv.method === "desk" ? x.desk : x.home;
    const place = [deliv.wilaya, deliv.commune].filter(Boolean).join("، ");
    const itemRows = lines.map(l => {
      const variant = l.variant ? ` <span class="fbr-dim">(${esc(l.variant)})</span>` : "";
      const cells = hasUnit ? `<td class="fbr-e fbr-num">${l.unit != null ? m(l.unit) : "—"}</td><td class="fbr-e fbr-num">${l.unit != null ? m(l.unit * l.qty) : "—"}</td>` : "";
      return `<tr><td class="fbr-it">${esc(l.name)}${variant}</td><td class="fbr-c fbr-num">${esc(String(l.qty))}</td>${cells}</tr>`;
    }).join("");
    return `<style>${RECEIPT_CSS}</style>
<div class="fbr-doc" dir="${rtl ? "rtl" : "ltr"}" lang="${lang}">
  <div class="fbr-head">
    <div class="fbr-brand">${flame}<div><div class="fbr-name">FLAME BOUTIQUE 34</div><div class="fbr-sub">${esc(x.title)}</div></div></div>
    <div class="fbr-contact">
      ${shop.phone ? `<div>${esc(x.phone)}: ${ltr(shop.phone)}</div>` : ""}
      ${shop.address ? `<div>${esc(shop.address)}</div>` : ""}
      ${shop.instagram ? `<div class="fbr-ltr">@${esc(String(shop.instagram).replace(/^@/, ""))}</div>` : ""}
    </div>
  </div>
  <table class="fbr-meta"><tbody>
    ${row(x.order, `<b class="fbr-ltr">${esc(o.number || "")}</b>`)}
    ${row(x.tracking, `<b class="fbr-ltr">${esc(o.tracking || "")}</b>`)}
    ${row(x.date, `<span class="fbr-ltr">${date}</span>`)}
  </tbody></table>
  <table class="fbr-meta"><tbody>
    ${row(x.customer, esc(o.customer?.name || ""))}
    ${o.customer?.phone ? row(x.phone, ltr(o.customer.phone)) : ""}
    ${row(x.deliverTo, esc(method) + (place ? ` — ${esc(place)}` : ""))}
    ${deliv.address ? row(x.address, esc(deliv.address)) : ""}
  </tbody></table>
  <table class="fbr-items"><thead><tr><th class="fbr-it">${esc(x.product)}</th><th class="fbr-c">${esc(x.qty)}</th>${hasUnit ? `<th class="fbr-e">${esc(x.unit)}</th><th class="fbr-e">${esc(x.lineTotal)}</th>` : ""}</tr></thead><tbody>${itemRows}</tbody></table>
  <table class="fbr-sum"><tbody>
    <tr><td>${esc(x.subtotal)}</td><td class="fbr-e fbr-num">${m(o.subtotal)}</td></tr>
    <tr><td>${esc(x.shipping)}</td><td class="fbr-e fbr-num">${o.shipping_pending ? esc(x.pending) : m(o.shipping)}</td></tr>
    <tr class="fbr-grand"><td>${esc(o.shipping_pending ? x.totalNoShip : x.total)}</td><td class="fbr-e fbr-num">${m(o.total)}</td></tr>
  </tbody></table>
  <div class="fbr-cod">${esc(x.cod)}</div>
  <div class="fbr-foot"><div class="fbr-thanks">${esc(x.thanks)}</div><div class="fbr-dim">${esc(x.kept)}</div>${shop.site ? `<div class="fbr-ltr fbr-dim">${esc(shop.site)}</div>` : ""}</div>
</div>`;
  }

  // Build the receipt in a hidden page element and open the print dialog (prints the receipt only;
  // the browser's "Save as PDF" turns it into a file the customer can keep or the owner can send).
  function printReceipt(o, lang = "ar"){
    let el = document.getElementById("fbReceipt");
    if (!el){ el = document.createElement("div"); el.id = "fbReceipt"; el.className = "fb-receipt"; document.body.appendChild(el); }
    el.innerHTML = receiptHTML(o, lang);
    const done = () => { document.body.classList.remove("fb-printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    document.body.classList.add("fb-printing");
    setTimeout(() => { try { window.print(); } catch(e){ done(); } }, 60);  // let fonts/layout settle
  }

  return {policyHTML, policyFallback, ratingOf, stars, WILAYAS, ZONES, DEFAULT_SETTINGS, TEXTS, TEXT_LABELS, TYPES, STATUSES, STEPS, RELEASES, COURIER_STAGES,
    garment, gallery, media, tint, esc, money, wilaya, stockOf, soldOut, mergeSettings, normPhone, validPhone, rateFor, fold, mapPoint, receiptHTML, printReceipt};
})();
