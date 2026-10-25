/* Shared page pieces for the store and the tracking page: social bar, header, footer, theme,
   water background, searchable list, copy to clipboard. */
window.FBUI = (() => {
  const $ = s => document.querySelector(s);
  const esc = FB.esc;
  const store = {
    get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k){ try { localStorage.removeItem(k); } catch {} }
  };

  const T = {
    ar:{ownerPage:"صفحة المالك", navPolicy:"الدفع والتوصيل والاستبدال", navShop:"المتجر", navTrack:"تتبع طلبي", navVisit:"زورينا", admin:"إدارة المتجر", cart:"السلة",
      toDark:"تفعيل الوضع الليلي", toLight:"تفعيل الوضع النهاري", noLink:"الرابط غير متوفر بعد", home:"الصفحة الرئيسية", where:"موقع المحل",
      demo:"نسخة تجريبية: الطلبات هنا تُحفظ في هذا المتصفح فقط ولا تصل إلى المتجر."},
    fr:{ownerPage:"Espace gérante", navPolicy:"Paiement, livraison et échange", navShop:"Boutique", navTrack:"Suivre ma commande", navVisit:"Nous rendre visite", admin:"Gestion", cart:"Panier",
      toDark:"Activer le mode sombre", toLight:"Activer le mode clair", noLink:"Lien pas encore disponible", home:"Accueil", where:"La boutique",
      demo:"Version de démonstration : les commandes restent dans ce navigateur et n'arrivent pas à la boutique."}
  };
  let lang = store.get("fb34-lang", "ar") === "fr" ? "fr" : "ar";
  const t = k => T[lang][k];

  /* ---------- icons ---------- */
  const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <symbol id="i-bag" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M5 8h14l-1 12H6L5 8Zm4 0V6a3 3 0 0 1 6 0v2"/></symbol>
    <symbol id="i-x" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M6 6l12 12M18 6 6 18"/></symbol>
    <symbol id="i-cash" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></symbol>
    <symbol id="i-truck" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M2 6h12v10H2zM14 10h4l3 3v3h-7M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></symbol>
    <symbol id="i-swap" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M4 8h14l-3-3M20 16H6l3 3"/></symbol>
    <symbol id="i-copy" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M9 9h11v11H9zM5 15H4V4h11v1"/></symbol>
    <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path stroke="currentColor" stroke-width="1.6" d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></symbol>
    <symbol id="i-moon" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></symbol>
    <symbol id="i-wa" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></symbol>
    <symbol id="i-ig" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor"/></symbol>
    <symbol id="i-fb" viewBox="0 0 24 24"><path fill="currentColor" d="M13.5 21v-7.5H16l.4-3h-2.9V8.7c0-.9.3-1.5 1.5-1.5h1.5V4.5a20 20 0 0 0-2.3-.1c-2.3 0-3.8 1.4-3.8 3.9v2.2H8v3h2.4V21h3.1Z"/></symbol>
    <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path fill="none" stroke="currentColor" stroke-width="1.6" d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor"/></symbol>
    <symbol id="i-pin" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.7" d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.3" fill="currentColor"/></symbol>
    <symbol id="i-tt" viewBox="0 0 24 24"><path fill="currentColor" d="M16.6 3h-3v12.2a2.7 2.7 0 1 1-2.7-2.7c.3 0 .5 0 .8.1V9.5h-.8a5.8 5.8 0 1 0 5.8 5.8V9a7.4 7.4 0 0 0 4.3 1.4V7.3a4.4 4.4 0 0 1-4.4-4.3Z"/></symbol>
  </svg>`;
  const icon = id => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;

  /* ---------- theme: light / dark, remembered; system setting until the visitor chooses ---------- */
  const isDark = () => document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  function toggleTheme(){
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("fb34-theme", next);
    labelTheme();
    document.dispatchEvent(new Event("fb-theme"));
  }
  function labelTheme(){ const b = $("#themeBtn"); if (b) b.setAttribute("aria-label", isDark() ? t("toLight") : t("toDark")); }

  /* ---------- page chrome ---------- */
  // page: "store" or "track". On the store page links are in-page anchors; elsewhere they lead back to it.
  function chrome(page){
    const home = page === "store" ? "" : "./";
    const links = [[`${home}#shop`,"navShop"],["track.html","navTrack",page === "track"],[`${home}#visit`,"navVisit"]]
      .map(([h,k,cur]) => `<a href="${h}" data-ui="${k}"${cur ? ' aria-current="page"' : ""}></a>`).join("");
    document.body.insertAdjacentHTML("afterbegin", SPRITE + `
      ${FB_API.mode === "demo" ? `<div class="demo-bar" role="note"><div class="wrap" data-ui="demo"></div></div>` : ""}
      <div class="social-bar"><div class="wrap" style="justify-content:flex-end"><div class="socials" id="socialBar"></div></div></div>
      <header class="site-header">
        <div class="wrap bar">
          <a class="logo" href="${page === "store" ? "#top" : "./"}" aria-label="Flame Boutique34">
            <svg class="logo-mark" viewBox="0 0 30 36" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="1.3" d="M2 35V14a13 13 0 0 1 26 0v21"/>
              <path class="logo-flame" d="M15 12c2 3.5 5.5 5.5 5 10a5 5 0 0 1-10 0c-.3-3.3 2.6-4.6 3.2-7 .6 1.5 1.2 2 1.8 2.4.4-1.6.3-3.3 0-5.4Z"/>
            </svg>
            <span class="logo-word">Flame<small>boutique34</small></span>
          </a>
          <nav class="nav" aria-label="main">${links}</nav>
          <button class="icon-btn theme-btn" id="themeBtn" type="button"><svg class="sun" aria-hidden="true"><use href="#i-sun"/></svg><svg class="moon" aria-hidden="true"><use href="#i-moon"/></svg></button>
          <button class="lang-btn" id="langBtn" type="button"></button>
          ${page === "store"
            ? `<button class="icon-btn" id="cartBtn" type="button">${icon("i-bag")}<span class="sr" data-ui="cart"></span><span class="cart-count" id="cartCount">0</span></button>`
            : `<a class="icon-btn" href="./#cart">${icon("i-bag")}<span class="sr" data-ui="cart"></span></a>`}
        </div>
        <nav class="wrap mobile-nav" aria-label="main">${links}</nav>
      </header>`);
    document.body.insertAdjacentHTML("beforeend", `
      <footer><div class="wrap foot"><span>© ${new Date().getFullYear()} Flame Boutique34</span>
        <nav aria-label="footer">${links}<a href="policy.html" data-ui="navPolicy"${page === "policy" ? ' aria-current="page"' : ""}></a></nav>
        <a class="owner-link" href="admin.html" rel="nofollow">${icon("i-lock")}<span data-ui="ownerPage"></span></a></div></footer>
      <a class="fab" id="fab" target="_blank" rel="noopener" aria-label="WhatsApp" hidden>${icon("i-wa")}</a>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>`);
    $("#themeBtn").onclick = toggleTheme;
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { labelTheme(); document.dispatchEvent(new Event("fb-theme")); });
    applyLang();
  }

  function applyLang(){
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-ui]").forEach(el => el.textContent = t(el.dataset.ui));
    const b = $("#langBtn"); if (b){ b.textContent = lang === "ar" ? "Français" : "العربية"; b.lang = lang === "ar" ? "fr" : "ar"; }
    labelTheme();
  }
  function setLang(l){ lang = l; store.set("fb34-lang", l); applyLang(); }

  // only real http(s) links are used; an empty setting shows a dimmed icon, never a made-up link
  const safeUrl = u => /^https?:\/\/\S+$/i.test(String(u||"").trim()) ? String(u).trim() : "";
  const waUrl = (num, text) => /^213\d{9}$/.test(num||"") ? `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ""}` : "";
  function setSocial(s){
    const items = [["Instagram","i-ig",safeUrl(s.socials.instagram)],["Facebook","i-fb",safeUrl(s.socials.facebook)],
                   ["TikTok","i-tt",safeUrl(s.socials.tiktok)],["WhatsApp","i-wa",waUrl(s.whatsapp)]];
    $("#socialBar").innerHTML = items.map(([n,i,u]) => u
      ? `<a class="soc" href="${esc(u)}" target="_blank" rel="noopener" aria-label="${n}" title="${n}">${icon(i)}</a>`
      : `<span class="soc is-empty" role="img" aria-label="${n}: ${t("noLink")}" title="${n}: ${t("noLink")}">${icon(i)}</span>`).join("");
    // the shop on Google Maps, next to the social icons
    const map = safeUrl(s.map_url);
    if (map) $("#socialBar").insertAdjacentHTML("beforeend",
      `<a class="soc soc-map" href="${esc(map)}" target="_blank" rel="noopener" aria-label="${t("where")}" title="${t("where")}">${icon("i-pin")}<span>${t("where")}</span></a>`);
    const fab = $("#fab"), wa = waUrl(s.whatsapp);
    fab.hidden = !wa; if (wa) fab.href = wa;
  }

  /* ---------- photos fade in once loaded (CSS keeps them hidden until they carry class "l") ---------- */
  const markLoaded = e => { if (e.target.tagName === "IMG") e.target.classList.add("l"); };
  document.addEventListener("load", markLoaded, true);
  document.addEventListener("error", markLoaded, true);  // a broken photo must not stay invisible

  /* ---------- feedback ---------- */
  let toastTimer;
  function toast(msg){ const el = $("#toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2400); }

  async function copyText(text){
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      // older browsers: copy through a hidden field placed inside the open dialog, if any
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
        (document.querySelector("dialog[open]") || document.body).append(ta);
        ta.select(); const ok = document.execCommand("copy"); ta.remove();
        return ok;
      } catch { return false; }
    }
  }
  const uuid = () => crypto.randomUUID ? crypto.randomUUID()
    : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));

  /* ---------- dialogs with enter/exit transitions ---------- */
  function openDialog(d){ if (!d.open){ d.showModal(); requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add("is-open"))); } }
  function closeDialog(d){
    if (!d.open) return Promise.resolve();
    d.classList.remove("is-open");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    return new Promise(r => setTimeout(() => { d.close(); r(); }, reduce ? 0 : 360));
  }

  /* ---------- searchable list ----------
     input: an <input> inside a .combo wrapper. options: [{value, label, hint, search}] */
  function combobox(input, {onChange, emptyText}){
    const list = document.createElement("ul");
    list.className = "combo-list"; list.id = input.id + "-list"; list.hidden = true; list.setAttribute("role", "listbox");
    input.parentElement.append(list);
    Object.assign(input, {autocomplete: "off"});
    input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id); input.setAttribute("aria-expanded", "false");
    let opts = [], value = null, shown = [], active = -1;
    const labelOf = v => opts.find(o => o.value === v)?.label ?? "";
    function render(q){
      const f = FB.fold(q);
      shown = (f ? opts.filter(o => o.search.includes(f)) : opts).slice(0, 120);
      active = Math.max(0, shown.findIndex(o => o.value === value));
      list.innerHTML = shown.length
        ? shown.map((o,i) => `<li role="option" id="${list.id}-${i}" data-i="${i}" aria-selected="${o.value === value}"${i === active ? ' class="active"' : ""}>${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ""}</li>`).join("")
        : `<li class="none">${esc(emptyText())}</li>`;
    }
    const show = () => { list.hidden = false; input.setAttribute("aria-expanded", "true"); };
    const hide = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); };
    function choose(o){ value = o.value; input.value = o.label; hide(); onChange(value); }
    function highlight(){
      [...list.children].forEach((li,i) => li.classList.toggle("active", i === active));
      const li = list.children[active]; if (li && li.id){ li.scrollIntoView({block:"nearest"}); input.setAttribute("aria-activedescendant", li.id); }
    }
    input.addEventListener("focus", () => { render(""); show(); });
    input.addEventListener("click", () => { if (list.hidden){ render(""); show(); } });
    input.addEventListener("input", () => {
      render(input.value); show();
      if (value != null && input.value !== labelOf(value)){ value = null; onChange(null); }
    });
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp"){
        e.preventDefault(); if (list.hidden){ render(""); show(); }
        active = Math.max(0, Math.min(shown.length - 1, active + (e.key === "ArrowDown" ? 1 : -1))); highlight();
      } else if (e.key === "Enter" && !list.hidden && shown[active]){ e.preventDefault(); choose(shown[active]); }
      else if (e.key === "Escape" && !list.hidden){ e.preventDefault(); e.stopPropagation(); hide(); }
    });
    list.addEventListener("pointerdown", e => { const li = e.target.closest("li[data-i]"); if (!li) return; e.preventDefault(); choose(shown[+li.dataset.i]); });
    input.addEventListener("blur", () => setTimeout(() => { hide(); if (value != null) input.value = labelOf(value); }, 150));
    return {
      setOptions(o){
        opts = o.map(x => ({...x, search: FB.fold((x.search || "") + " " + x.label)}));
        if (value != null && !opts.some(x => x.value === value)) value = null;
        input.value = value != null ? labelOf(value) : "";
      },
      set(v){ value = opts.some(o => o.value === v) ? v : null; input.value = value != null ? labelOf(value) : ""; },
      get value(){ return value; },
      get text(){ return input.value; }
    };
  }

  /* ---------- page background ----------
     The page shows a still, refined marble texture drawn entirely in CSS (site.css: --page and body::after).
     The old interactive water canvas was removed: it did little on phones (no pointer) and cost battery.
     ripple() is kept as a no-op so older inline calls stay harmless. */
  function ripple(){ /* intentionally does nothing: the background is pure CSS now */ }

  return {store, t, get lang(){ return lang; }, setLang, applyLang, chrome, setSocial, toast, copyText, uuid, icon,
    openDialog, closeDialog, combobox, ripple, safeUrl, waUrl};
})();
