// Serves dist/ the way Netlify does: applies the rules in dist/_headers and answers unknown paths with 404.html.
// Run: node tests/netlify-local.mjs   (then open http://localhost:8888/)
import http from 'http'; import fs from 'fs'; import path from 'path'; import url from 'url';
const DIST = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'dist');
const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.mp4':'video/mp4','.webm':'video/webm','.txt':'text/plain'};
// _headers: a path line, then indented "Name: value" lines; "*" matches anything
const rules = []; let cur = null;
for (const line of fs.readFileSync(path.join(DIST, '_headers'), 'utf8').split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) { cur = {re: new RegExp('^' + line.trim().replace(/[.]/g, '\\.').replace(/\*/g, '.*') + '$'), h: []}; rules.push(cur); }
  else { const i = line.indexOf(':'); cur.h.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]); }
}
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(DIST, p), status = 200;
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { file = path.join(DIST, '404.html'); status = 404; }
  for (const r of rules) if (r.re.test(p)) for (const [k, v] of r.h) res.setHeader(k, v);
  const data = fs.readFileSync(file), type = TYPES[path.extname(file)] || 'application/octet-stream';
  const range = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
  if (range && status === 200) {  // video seeking
    const s = +range[1], e = range[2] ? +range[2] : data.length - 1;
    res.writeHead(206, {'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${data.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1});
    return res.end(data.subarray(s, e + 1));
  }
  res.writeHead(status, {'Content-Type': type, 'Accept-Ranges': 'bytes'}); res.end(data);
}).listen(8888, () => console.log('dist/ on http://localhost:8888/'));
