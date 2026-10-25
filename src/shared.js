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
      {id:"set",ar:"أطقم وتنانير",fr:"Ensembles & jupes"},{id:"hijab",ar:"حجابات",fr:"Hijabs & foulards"}]
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

  return {policyHTML, policyFallback, ratingOf, stars, WILAYAS, ZONES, DEFAULT_SETTINGS, TEXTS, TEXT_LABELS, TYPES, STATUSES, STEPS, RELEASES, COURIER_STAGES,
    garment, gallery, media, tint, esc, money, wilaya, stockOf, soldOut, mergeSettings, normPhone, validPhone, rateFor, fold, mapPoint};
})();
