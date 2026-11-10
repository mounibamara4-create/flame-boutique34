"""Builds the site to publish into dist/.

The pages in src/ load site.css and the shared scripts (locations.js, shared.js, api.js, ui.js);
the built pages carry them inline, so each page works on its own. assets/config.js and the boutique
film pictures (assets/film/, intro-poster.jpg) are copied as files; a page that cannot load config.js runs in demo mode.
Netlify settings (_headers, robots.txt, 404 page) are written next to the pages.

Run from the project folder:  python3 tools/build.py
(after changing data/, run tools/gen_locations.py first)
Netlify runs the same command (netlify.toml) and publishes dist/.
"""
import pathlib, re, shutil, json, html as _html, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
src = root / "src"
dist = root / "dist"
# the live site address (used in page meta/Open Graph, robots.txt and the sitemap); change it if you move to your own domain
SITE = "https://flameboutique34.netlify.app"
BRAND = "Flame Boutique 34"

# ---- build-time data (so the HTML carries real content for search engines, not an empty shell) ----
# The products, their prices, sizes and photos are rendered into the pages at build time, then the page's
# JavaScript refreshes them live from Supabase. If Supabase cannot be reached while building, the pages still
# build (with the JavaScript-only fallback) so a deploy never fails for a network hiccup.
_cfg = (root / "assets" / "config.js").read_text(encoding="utf-8")
SB_URL = (re.search(r'SUPABASE_URL:\s*"([^"]+)"', _cfg) or [None, ""])[1]
SB_KEY = (re.search(r'SUPABASE_ANON_KEY:\s*"([^"]+)"', _cfg) or [None, ""])[1]

def _sb(path):
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)

PRODUCTS, SETTINGS = [], {}
try:
    PRODUCTS = _sb("products?select=*&active=eq.true&order=sort.asc,created_at.asc")
    _srows = _sb("settings?select=data&limit=1")
    SETTINGS = (_srows[0].get("data") if _srows else {}) or {}
    print(f"fetched {len(PRODUCTS)} active product(s) and settings from Supabase")
except Exception as e:
    print("WARN: Supabase fetch failed — building with the JavaScript-only fallback:", e)

def esc(s):
    return _html.escape(str(s if s is not None else ""), quote=True)

def money(n):  # same shape as FB.money in shared.js: currency first, no thousands separator -> "دج 8900"
    try: return "دج " + str(round(float(n or 0)))
    except Exception: return "دج 0"

def _loc(v, lang="ar"):
    if isinstance(v, dict): return v.get(lang) or v.get("ar") or v.get("fr") or ""
    return v or ""

def _in_stock(p):
    st = p.get("stock")
    if not isinstance(st, dict): return True          # stock not tracked -> available
    return any((st.get(s) or 0) > 0 for s in (p.get("sizes") or []))

def product_cards_html(products, lang="ar"):
    """Static product cards for #grid; the page's JavaScript replaces them with the live, interactive cards."""
    out = []
    for p in products:
        name = _loc(p.get("name"), lang)
        img = p.get("image") or (p.get("colors") or [{}])[0].get("image") or ""
        price = money(p.get("price"))
        old = p.get("compare_price")
        old_html = f' <s class="price-old">{money(old)}</s>' if old and old > (p.get("price") or 0) else ""
        sizes = "، ".join(p.get("sizes") or [])
        media = (f'<img src="{esc(img)}" alt="{esc(name)}" width="480" height="640" loading="lazy" decoding="async">'
                 if img else "")
        href = f'/#p-{esc(p.get("id"))}'
        out.append(
            f'<article class="card">'
            f'<a class="card-media" href="{href}" aria-label="{esc(name)}"><div class="frame">{media}</div></a>'
            f'<h3 class="card-name"><a href="{href}">{esc(name)}</a></h3>'
            f'<p class="card-price"><b>{price}</b>{old_html}</p>'
            + (f'<p class="card-opts">المقاسات: {esc(sizes)}</p>' if sizes else "")
            + '</article>')
    return "\n".join(out)

def jsonld(products, settings):
    soc = (settings.get("socials") or {})
    same = [soc.get(k) for k in ("instagram", "facebook", "tiktok") if soc.get(k)]
    store = {
        "@context": "https://schema.org", "@type": "ClothingStore", "name": BRAND,
        "url": SITE + "/", "image": SITE + "/assets/intro-poster.jpg",
        "telephone": "+213549902289",
        "address": {"@type": "PostalAddress", "addressLocality": "برج بوعريريج", "addressRegion": "برج بوعريريج", "addressCountry": "DZ"},
        "geo": {"@type": "GeoCoordinates", "latitude": 36.0710359, "longitude": 4.7574911},
        "areaServed": "DZ",
    }
    hours = _loc(settings.get("hours"))
    if hours: store["openingHours"] = hours
    if same: store["sameAs"] = same
    graph = [store]
    for p in products:
        imgs = [i for i in ([p.get("image")] + (p.get("images") or [])) if i]
        offer = {"@type": "Offer", "price": p.get("price") or 0, "priceCurrency": "DZD",
                 "availability": "https://schema.org/InStock" if _in_stock(p) else "https://schema.org/OutOfStock",
                 "url": SITE + "/#p-" + str(p.get("id"))}
        prod = {"@context": "https://schema.org", "@type": "Product", "name": _loc(p.get("name")),
                "sku": p.get("id"), "brand": {"@type": "Brand", "name": BRAND}, "offers": offer}
        if imgs: prod["image"] = imgs
        desc = _loc(p.get("description"))
        if desc: prod["description"] = desc
        graph.append(prod)
    return ('<script type="application/ld+json">\n'
            + json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "\n</script>")

def script(match):
    js = (src / f"{match.group(1)}.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    return f"<script>/* src/{match.group(1)}.js, inlined by tools/build.py */\n{js}</script>"

def style(match):
    css = (src / f"{match.group(1)}.css").read_text(encoding="utf-8")
    return f"<style>/* src/{match.group(1)}.css, inlined by tools/build.py */\n{css}</style>"

if dist.exists():
    shutil.rmtree(dist)
(dist / "assets").mkdir(parents=True)

for page in ("index.html", "track.html", "policy.html", "admin.html", "404.html"):
    html = (src / page).read_text(encoding="utf-8")
    html = re.sub(r'<script src="(locations|shared|api|ui|pixels)\.js"></script>', script, html)
    html = re.sub(r'<link rel="stylesheet" href="(site)\.css">', style, html)
    note = "<!-- Generated from src/" + page + " by tools/build.py. Edit src/, then rebuild. -->"
    html = html.replace("<!doctype html>", "<!doctype html>\n" + note, 1)
    html = html.replace("__SITE__", SITE)
    if page == "index.html" and PRODUCTS:
        # real product cards in the HTML (the page's JavaScript replaces them with the live versions on load)
        html = html.replace('<div class="grid" id="grid"></div>',
                             '<div class="grid" id="grid">\n' + product_cards_html(PRODUCTS) + '\n</div>', 1)
        # Schema.org data for the store and each product (CSP already allows inline scripts)
        html = html.replace("</head>", jsonld(PRODUCTS, SETTINGS) + "\n</head>", 1)
    (dist / page).write_text(html, encoding="utf-8")
    print("built", page, len(html) // 1024, "KB")

# intro-poster images are the welcome splash shown once on the home page (src/index.html, #splash)
for f in ("config.js", "intro-poster.jpg", "intro-poster-p.jpg"):
    shutil.copy2(root / "assets" / f, dist / "assets" / f)
shutil.copytree(root / "assets" / "vendor", dist / "assets" / "vendor")

# Inline scripts and styles are part of every page, hence 'unsafe-inline'. Outside sources: Supabase (data,
# sign-in, photos) and Google Fonts. The Supabase script itself is served from assets/vendor/.
CSP = "; ".join([
    "default-src 'self'",
    # ad pixels (only loaded when the owner enters a pixel ID): Meta and TikTok
    "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://analytics.tiktok.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.supabase.co https://www.facebook.com https://*.tiktok.com",
    "media-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.facebook.com https://connect.facebook.net https://*.tiktok.com https://*.tiktokw.us",
    "frame-src https://www.google.com https://www.facebook.com",  # the shop map; Meta pixel's helper frame
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
])
(dist / "_headers").write_text(f"""/*
  Content-Security-Policy: {CSP}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  X-Frame-Options: DENY

/admin.html
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store

/track.html
  X-Robots-Tag: noindex

# the settings file must never be served stale
/assets/config.js
  Cache-Control: no-cache

/assets/intro*
  Cache-Control: public, max-age=2592000

/assets/vendor/*
  Cache-Control: public, max-age=2592000
""", encoding="utf-8")
(dist / "robots.txt").write_text(
    "User-agent: *\nDisallow: /admin.html\nDisallow: /track.html\n"
    f"Sitemap: {SITE}/sitemap.xml\n", encoding="utf-8")
# a simple sitemap of the public pages (admin and track stay out: they are noindex)
_today = __import__("datetime").date.today().isoformat()
(dist / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    f'  <url><loc>{SITE}/</loc><lastmod>{_today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n'
    f'  <url><loc>{SITE}/policy.html</loc><lastmod>{_today}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>\n'
    '</urlset>\n', encoding="utf-8")
# site-ownership / verification files (e.g. Google Search Console) dropped at the site root, verbatim
for extra in sorted((root / "verify").glob("*")) if (root / "verify").exists() else []:
    shutil.copy2(extra, dist / extra.name)
print("wrote _headers, robots.txt, sitemap.xml; dist/ is ready")

# Supabase: everything in one file for the SQL Editor (schema, then wilayas and communes, then the checks)
sb = root / "supabase"
parts = [("schema.sql", "tables, rules and functions"), ("locations.sql", "69 wilayas and 1541 communes"), ("check.sql", "checks: every line should say OK")]
all_sql = """-- Flame Boutique34: complete database setup for Supabase. Generated by tools/build.py; edit the parts, not this file.
-- Supabase > SQL Editor > New query > paste this whole file > Run. Safe to run again: it deletes nothing.
-- The result table at the end lists the checks. "owner account linked" says MISSING until you run owner.sql.
"""
for name, what in parts:
    all_sql += f"\n-- ===================== {name}: {what} =====================\n" + (sb / name).read_text(encoding="utf-8")
(sb / "setup.sql").write_text(all_sql, encoding="utf-8")
print("wrote supabase/setup.sql", len(all_sql) // 1024, "KB")
