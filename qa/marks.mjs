/* Screenshot the section-mark contact sheet so the drawings can be judged at
   real size instead of guessed at from path data. Dev-only helper. */
import { createRequire } from "module";
const require = createRequire("/home/user/kochav-hashulchan-app/");
const { chromium } = require("playwright");

const OUT = process.argv[2] || "/tmp/marks.png";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const p = await b.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
await p.goto("http://127.0.0.1:5188/marks.html", { waitUntil: "networkidle" });
await p.waitForTimeout(400);
await p.screenshot({ path: OUT, fullPage: true });
console.log("wrote", OUT);
await b.close();
