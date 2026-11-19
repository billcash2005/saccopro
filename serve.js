/* Zero-dependency static server for the SaccoPro web app.
   Run:  node serve.js 5173 --open   (or double-click start-web.bat) */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const root = __dirname;
const port = Number(process.argv[2]) || 5173;
const open = process.argv.includes("--open");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch (e) { rel = "/"; }
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.join(root, path.normalize(rel));
  if (!file.startsWith(root)) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.readFile(file, (err, buf) => {
    if (err) {
      fs.readFile(path.join(root, "index.html"), (e2, shell) => {
        if (e2) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found"); return; }
        res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-cache" });
        res.end(shell);
      });
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(buf);
  });
}).listen(port, () => {
  const url = "http://localhost:" + port;
  console.log("SaccoPro web app running at " + url);
  console.log("Press Ctrl+C to stop.");
  if (open) exec('start "" "' + url + '"');
});
