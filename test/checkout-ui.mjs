/* Local visual check of the real shop page. FormSubmit is mocked inside Chrome
   and any attempt to continue that request fails the run. Nothing is sent. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || "puppeteer-core");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
const shots = [];
const posts = [];

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end("missing"); return;
      }
      const types = {".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".css": "text/css"};
      res.writeHead(200, {"content-type": types[path.extname(file)] || "application/octet-stream"});
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function shot(page, name) {
  const file = path.join(outDir, name + ".png");
  await page.screenshot({path: file});
  shots.push(file);
}

async function prepare(page, mode) {
  page.removeAllListeners("request");
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("formsubmit.co")) {
      const headers = {"access-control-allow-origin": "*", "access-control-allow-headers": "content-type,accept", "access-control-allow-methods": "POST,OPTIONS"};
      if (req.method() === "OPTIONS") { req.respond({status: 204, headers}); return; }
      posts.push({mode, url, method: req.method(), body: req.postData() || ""});
      const accept = JSON.stringify({success: "true", message: "The form was submitted successfully."});
      if (mode === "reject") req.respond({status: 200, contentType: "application/json", headers, body: JSON.stringify({success: "false", message: "This form needs Activation."})});
      else if (mode === "delay") setTimeout(() => req.respond({status: 200, contentType: "application/json", headers, body: accept}), 700);
      else if (mode === "success") req.respond({status: 200, contentType: "application/json", headers, body: accept});
      else req.abort("failed");
      return;
    }
    if (req.method() !== "GET" && req.method() !== "HEAD") {
      req.abort("failed");
      return;
    }
    req.continue().catch(() => {});
  });
}

async function addAndOpen(page) {
  await page.waitForSelector(".pk:not([disabled])");
  await page.evaluate(() => document.querySelector(".pk:not([disabled])").scrollIntoView({block: "center", inline: "center"}));
  const added = await page.evaluate(() => { const b = document.querySelector(".pk:not([disabled])"); if (!b) return false; b.click(); return true; });
  if (!added) throw new Error("no add button");
  await page.waitForSelector("#tray-order", {visible: true});
  await page.evaluate(() => document.querySelector("#tray-order").click());
  await page.waitForSelector("#co:not([hidden])");
}

async function fill(page) {
  for (const id of ["cf-name", "cf-phone", "cf-email", "cf-addr"]) await page.$eval("#" + id, (el) => { el.value = ""; });
  await page.type("#cf-name", "Ada Lovelace");
  await page.type("#cf-phone", "3055550100");
  await page.type("#cf-email", "ada@example.com");
  await page.type("#cf-addr", "1 Bay Street, Miami, FL 33101");
  const checked = await page.$eval("#cf-ruo", (el) => el.checked);
  if (!checked) await page.click("#cf-ruo");
}

function overflow(page) {
  return page.evaluate(() => {
    const co = document.querySelector("#co");
    const box = document.querySelector(".co-in");
    const over = (el) => el ? el.scrollWidth - el.clientWidth : null;
    return {co: over(co), box: over(box), doc: document.documentElement.scrollWidth - document.documentElement.clientWidth};
  });
}

const server = await serve();
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const report = {browser: await browser.version(), url: `http://127.0.0.1:${port}/`, viewports: {}, posts: 0};
try {
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("PAGEERROR", err.message));
  page.on("console", (msg) => { if (msg.type() === "error") console.error("CONSOLE", msg.text()); });
  await page.evaluateOnNewDocument(() => localStorage.setItem("novrix-gate2", String(Date.now())));
  await prepare(page, "reject");
  await page.setViewport({width: 1280, height: 800});
  await page.goto(`http://127.0.0.1:${port}/`, {waitUntil: "domcontentloaded"});
  await addAndOpen(page);
  await page.click("#co-submit");
  await page.waitForFunction(() => document.querySelector("#co-err").textContent.includes("Please add"));
  const activeBefore = await page.evaluate(() => document.activeElement.id);
  await page.keyboard.press("Tab");
  const activeAfter = await page.evaluate(() => document.activeElement.id);
  await fill(page);
  const shipVisible = await page.$eval("#cf-addr-w", (el) => !el.hidden);
  await shot(page, "checkout-desktop-shipping");
  await page.click('[data-ful="pickup"]');
  await page.waitForFunction(() => document.querySelector("#co-pu") && !document.querySelector("#co-pu").hidden);
  const pickupVisible = await page.$eval("#co-pu", (el) => !el.hidden);
  const addrHidden = await page.$eval("#cf-addr-w", (el) => el.hidden);
  await shot(page, "checkout-desktop-pickup");
  await page.click('[data-ful="ship"]');
  const zelle = await page.$eval("#co-pay", (el) => el.innerText);
  const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll("#co-tabs button")].find((x) => /Venmo/.test(x.textContent)); if (!b) return "missing"; b.click(); return document.querySelector("#co-pay").innerText.slice(0, 400); });
  console.log("VENMO PANEL", JSON.stringify(clicked));
  await page.waitForFunction(() => /Venmo/.test(document.querySelector("#co-pay").innerText));
  const venmo = await page.$eval("#co-pay", (el) => el.innerText);
  await page.evaluate(() => document.querySelector("#co-submit").scrollIntoView({block: "center"}));
  const codeBefore = await page.$eval("#co-no", (el) => el.textContent);
  const nameBefore = await page.$eval("#cf-name", (el) => el.value);
  await page.click("#co-submit");
  await page.waitForFunction(() => /Not confirmed/.test(document.querySelector("#co-err").textContent));
  const codeAfter = await page.$eval("#co-no", (el) => el.textContent);
  const nameAfter = await page.$eval("#cf-name", (el) => el.value);
  const cartStill = await page.$eval("#tray-n", (el) => el.textContent);
  const mailInCheckout = await page.$$eval("#co a[href^='mailto:']", (els) => els.length);
  const mailDialog = await page.$("#mf");
  await shot(page, "checkout-desktop-not-confirmed");
  await prepare(page, "delay");
  const beforePosts = posts.length;
  await page.evaluate(() => { const b = document.querySelector("#co-submit"); b.click(); b.click(); });
  await page.waitForFunction(() => document.querySelector("#co-submit").textContent.includes("Submitting"));
  await shot(page, "checkout-desktop-submitting");
  await page.waitForFunction(() => document.querySelector("#co-done") && !document.querySelector("#co-done").hidden, {timeout: 4000});
  const accepted = await page.$eval("#co-done b", (el) => el.textContent);
  await shot(page, "checkout-desktop-accepted");
  report.viewports.desktop = {
    size: "1280x800", validationFocus: activeBefore, tabNext: activeAfter,
    shipVisible, pickupVisible, addrHidden, zelleHasFee: /fee/i.test(zelle), venmoShowsFee: /1%/.test(venmo),
    codeBefore, codeAfter, nameBefore, nameAfter, cartStill, mailInCheckout, mailDialog: !!mailDialog,
    accepted, postsDuringRetry: posts.length - beforePosts, overflow: await overflow(page)
  };

  await page.setViewport({width: 390, height: 844});
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({waitUntil: "domcontentloaded"});
  await prepare(page, "success");
  await addAndOpen(page);
  await fill(page);
  await shot(page, "checkout-mobile-shipping");
  await page.click('[data-ful="pickup"]');
  await page.waitForFunction(() => document.querySelector("#co-pu") && !document.querySelector("#co-pu").hidden);
  await shot(page, "checkout-mobile-pickup");
  await page.click('[data-ful="ship"]');
  await page.evaluate(() => document.querySelector("#co-submit").scrollIntoView({block: "center"}));
  const mobileState = await page.evaluate(() => {
    document.querySelector("#co-submit").click();
    return {ruo: document.querySelector("#cf-ruo").checked, name: document.querySelector("#cf-name").value, addr: document.querySelector("#cf-addr").value};
  });
  console.log("MOBILE BEFORE WAIT", JSON.stringify(mobileState));
  await page.waitForFunction(() => {
    const done = document.querySelector("#co-done");
    const err = document.querySelector("#co-err");
    return (done && !done.hidden) || (err && err.textContent.length > 0);
  }, {timeout: 8000});
  console.log("MOBILE RESULT", JSON.stringify(await page.evaluate(() => ({err: document.querySelector("#co-err").textContent, hidden: document.querySelector("#co-done").hidden, btn: document.querySelector("#co-submit").textContent}))));
  await shot(page, "checkout-mobile-accepted");
  report.viewports.mobile = {size: "390x844", overflow: await overflow(page), ...(await page.evaluate(() => ({accepted: document.querySelector("#co-done b").textContent, doneHidden: document.querySelector("#co-done").hidden, err: document.querySelector("#co-err").textContent})))};
  report.posts = posts.length;
  report.hosts = [...new Set(posts.map((item) => item.url))];
  const leaked = posts.filter((item) => !item.url.includes("formsubmit.co"));
  if (leaked.length) throw new Error("unexpected post " + JSON.stringify(leaked));
  if (report.viewports.desktop.mailInCheckout !== 0 || report.viewports.desktop.mailDialog) throw new Error("mail step still present");
  if (report.viewports.desktop.codeBefore !== report.viewports.desktop.codeAfter) throw new Error("payment code changed after failure");
  if (report.viewports.desktop.nameBefore !== "Ada Lovelace" || report.viewports.desktop.nameAfter !== "Ada Lovelace") throw new Error("draft name was cleared");
  if (!report.viewports.desktop.cartStill) throw new Error("cart missing");
  if (report.viewports.desktop.postsDuringRetry !== 1) throw new Error("retry did not send exactly one request: " + report.viewports.desktop.postsDuringRetry);
  if (report.viewports.mobile.doneHidden || report.viewports.mobile.err) throw new Error("mobile submit was not accepted: " + JSON.stringify(report.viewports.mobile));
  for (const side of ["desktop", "mobile"]) {
    const flow = report.viewports[side].overflow;
    if (flow.box > 1 || flow.co > 1) throw new Error(side + " checkout overflow " + JSON.stringify(flow));
  }
  fs.writeFileSync(path.join(outDir, "checkout-ui-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
