/* Facebook (Meta) and TikTok pixels for ad tracking. Nothing loads until the owner enters a pixel ID
   in the dashboard (site settings > marketing). Events: page view, product view, add to cart,
   checkout started, and purchase once the server has saved the order (tracking code as event id). */
window.FB_PIXELS = (() => {
  let fb = false, tt = false;
  const FB_ID = /^\d{10,20}$/, TT_ID = /^[A-Z0-9]{15,30}$/;

  function init(settings){
    const p = settings?.pixels || {}, fid = String(p.facebook||"").trim(), tid = String(p.tiktok||"").trim().toUpperCase();
    if (!fb && FB_ID.test(fid)){
      fb = true;
      // Meta's standard loader
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
        s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");
      fbq("init", fid); fbq("track", "PageView");
    }
    if (!tt && TT_ID.test(tid)){
      tt = true;
      // TikTok's standard loader
      !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
        ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
        for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
        ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
        ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
          ttq._o=ttq._o||{};ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript";n.async=!0;n.src=r+"?sdkid="+e+"&lib="+t;
          e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
        ttq.load(tid);ttq.page()}(window,document,"ttq");
    }
  }

  // lines: [{id, name, price, qty}]
  function send(fbEvent, ttEvent, lines, extra = {}, eventId){
    const value = lines.reduce((s, l) => s + l.price * l.qty, 0) + (extra.shipping || 0);
    try {
      if (fb) fbq("track", fbEvent, {content_ids: lines.map(l => l.id), content_type: "product", contents: lines.map(l => ({id: l.id, quantity: l.qty})),
        content_name: lines.length === 1 ? lines[0].name : undefined, num_items: lines.reduce((s, l) => s + l.qty, 0), value, currency: "DZD"},
        eventId ? {eventID: eventId} : undefined);
      if (tt) ttq.track(ttEvent, {contents: lines.map(l => ({content_id: l.id, content_type: "product", content_name: l.name, quantity: l.qty, price: l.price})),
        value, currency: "DZD"}, eventId ? {event_id: eventId} : undefined);
    } catch {}
  }
  return {
    init,
    get active(){ return fb || tt; },
    view: line => send("ViewContent", "ViewContent", [line]),
    search: q => { try { if (fb) fbq("track", "Search", {search_string: q}); if (tt) ttq.track("Search", {query: q}); } catch {} },
    add: line => send("AddToCart", "AddToCart", [line]),
    checkout: lines => send("InitiateCheckout", "InitiateCheckout", lines),
    // only after the server confirmed the order; a repeated answer for the same order is not counted again
    purchase: (lines, order) => send("Purchase", "CompletePayment", lines, {shipping: order.shipping || 0}, order.tracking_code)
  };
})();
