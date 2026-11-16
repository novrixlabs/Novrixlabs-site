/* THE FORGE — lazy tab. Reads live cart math; never changes totals(), tiers, or data lines. */
(() => {
  if (window.__FG && window.__FG.booted) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const root = $("#forge");
  if (!root) return;

  const N = window.__NX;
  const SIZES = [5, 10, 15, 20];
  const NAMES = { 5: "Core Kit", 10: "Elite Kit", 15: "Titan Kit", 20: "Apex Kit" };
  const EXCL = /testosterone|\bnvleq\b|anavar|havoc|trenbolone|nandrolone|boldenone|oxandrolone|masteron|primobolan|semaglutide|cockbomb|somatropin|191aa|\bnvl-h\b|j2941|\bhulk\b|nightfall|\bhgh\b/i;
  const SS = (k) => /^SS-31\b/i.test(k);
  const etYmd = (d) => { try { return new Date(d == null ? Date.now() : d).toLocaleDateString("en-CA", {timeZone: "America/New_York"}); } catch (e) { const n = new Date(d == null ? Date.now() : d); return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0"); } };
  /* Display-only: the Dec 1 SS-31 kit-exclusion note. Live totals() are unchanged. */
  const ssNoteOn = (t) => etYmd(t) >= "2026-12-01";
  const reduce = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const es = () => (document.documentElement.lang || "").toLowerCase().startsWith("es");
  const money = (n) => (N && N.money) ? N.money(n) : ("$" + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ""));
  const keyOf = (it, d) => it.name + " " + d.dose;
  const buzz = (pat) => { try { if (navigator.vibrate) navigator.vibrate(pat); } catch (e) {} };
  const MENU = "https://novrixlabs.shop/";

  let booted = false, target = 5, lastUnlock = 0, lastN = 0, rafOd, embers, search = "", cat = "All";
  const od = { total: 0, save: 0, shownT: 0, shownS: 0 };

  /* Items that fill tray slots / progress. Mirrors the counter live totals() uses:
     sale tiers count every item (including Reconstitution Solution); MULTI skips reconstitution.
     From Dec 1, SS-31 is omitted from this display count only. */
  function countsForKit(k) {
    if (ssNoteOn() && SS(k)) return false;
    if (N && N.saleOn && N.SALE) return true;
    if (N && N.MULTI && N.MULTI.skip && N.MULTI.skip.test(k)) return false;
    return true;
  }
  function kitKeys() {
    if (!N) return [];
    const out = [];
    for (const k of N.picks.keys()) {
      if (!countsForKit(k)) continue;
      const q = N.qty(k);
      for (let i = 0; i < q; i++) out.push(k);
    }
    return out;
  }
  function kitN() { return kitKeys().length; }
  function ssInCart() {
    if (!N) return 0;
    let n = 0;
    for (const k of N.picks.keys()) if (SS(k)) n += N.qty(k);
    return n;
  }

  /* Live tier % for a vial count — mirrors totals() display, does not change it. */
  function pctAt(n, sub) {
    if (!N) return 0;
    const SALE = N.SALE, saleOn = N.saleOn;
    const t = saleOn && SALE && (!SALE.minSub || sub >= SALE.minSub) ? (SALE.tiers || []).find((x) => n >= x[0]) : null;
    let pct = t ? t[1] : 0;
    const mt = (N.MULTI && N.MULTI.tiers || []).find((x) => n >= x[0]);
    if (mt && mt[1] > pct) pct = mt[1];
    return pct || 0;
  }
  function subApprox(n) {
    if (!N) return 0;
    const T = N.totals();
    if (T.mn === n) return T.sub;
    /* For preview of a target size, scale isn't needed; use current sub or a placeholder. */
    return T.sub;
  }
  function slotTarget(n) {
    if (n <= 5) return 5;
    if (n <= 10) return 10;
    if (n <= 15) return 15;
    return 20;
  }

  function enc() {
    return [...N.picks.keys()].map((k) => encodeURIComponent(k) + "~" + N.qty(k)).join("|");
  }
  function refCode() {
    try { return (localStorage.getItem("novrix-ref") || "").trim(); } catch (e) { return ""; }
  }
  function shareURL() {
    const ref = refCode();
    return MENU + (ref ? "?ref=" + encodeURIComponent(ref) : "") + "#forge=" + enc();
  }

  function catalog() {
    const main = [], other = [];
    if (!N || !N.DATA) return { main, other };
    for (const g of N.DATA) {
      for (const it of (g.items || [])) {
        if (EXCL.test(it.name)) continue;
        if (/\bIU\b/i.test(it.name) && !/^HCG\b/i.test(it.name)) continue;
        const row = { it, group: g.group };
        if (/^HCG\b/i.test(it.name)) other.push(row);
        else main.push(row);
      }
    }
    return { main, other };
  }

  function miniVial(name, dose) {
    const nm = String(name || "").replace(/\s+blend$/i, "");
    const cut = nm.length > 11 ? nm.slice(0, 10) + "…" : nm;
    return `<svg class="fg-vial" viewBox="0 0 80 150" aria-hidden="true"><rect x="18" y="6" width="44" height="20" rx="4" fill="#c9c6d4"/><rect x="21" y="26" width="38" height="9" fill="#8d90a0"/><path d="M24 35h32v6c6 2 10 5 10 11v84a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8V52c0-6 4-9 10-11z" fill="#0d0d16" fill-opacity=".7" stroke="rgba(255,255,255,.35)"/><path d="M16 118h48v18a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6z" fill="#f2efe9" fill-opacity=".92"/><rect x="14" y="66" width="52" height="44" fill="#0b0b12"/><text x="40" y="88" text-anchor="middle" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" font-size="9" fill="#fff">${esc(cut.toUpperCase())}</text><text x="40" y="100" text-anchor="middle" font-family="Michroma,Arial" font-size="4.1" fill="#b9a6ff">NOVRIX</text></svg>`;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  const off = (p) => !p ? "" : (es() ? " (" + p + "% de descuento)" : " (" + p + "% off)");
  function progressCopy(n) {
    const next = SIZES.find((s) => n < s);
    const T = N.totals();
    const curPct = T.pct || pctAt(n, T.sub);
    const sp = es();
    if (!n) {
      const p = pctAt(5, T.sub || 1);
      return sp
        ? "0 de 5 · agrega 5 para Core Kit" + off(p)
        : "0 of 5 · add 5 for Core Kit" + off(p);
    }
    if (!next) {
      const p = T.pct || pctAt(20, T.sub);
      return (sp ? "20 de 20 · Apex Kit completo" : "20 of 20 · Apex Kit complete") + off(p);
    }
    const need = next - n;
    const name = NAMES[next];
    const p = pctAt(next, T.sub || 1);
    const verb = sp
      ? (need === 1 ? "agrega 1 más" : ("agrega " + need + " más"))
      : (need === 1 ? "add 1 more" : ("add " + need + " more"));
    const reached = SIZES.filter((s) => n >= s).pop();
    const head = sp ? (n + " de " + next) : (n + " of " + next);
    if (n === reached && SIZES.includes(n)) {
      return n + (sp ? " de " : " of ") + n + " · " + NAMES[n] + (sp ? " desbloqueado" : " unlocked") + off(curPct);
    }
    return head + " · " + verb + (sp ? " para " : " for ") + name + off(p);
  }

  function shell() {
    root.innerHTML = `
      <div class="fg-hero" id="fg-hero">
        <canvas class="fg-embers" id="fg-embers" aria-hidden="true"></canvas>
        <div class="fg-hero-in">
          <div class="fg-stamp"><img src="assets/emblem.webp" width="92" height="108" alt=""></div>
          <p class="fg-ey">Research · US only · 21+</p>
          <h2 class="fg-name" id="fg-h">THE FORGE</h2>
          <p class="fg-tag">Build a Kit</p>
          <p class="fg-lede">Mix and match any in-stock vials. Cart discounts apply automatically at checkout.</p>
          <p class="fg-ruo">For research use only. Not for human or animal consumption.</p>
        </div>
      </div>
      <div class="fg-tiers" id="fg-tiers" role="tablist" aria-label="Kit sizes"></div>
      <div class="fg-stat">
        <div class="fg-meter"><span>Kit total</span><b id="fg-total" aria-live="polite">$0</b></div>
        <div class="fg-meter fg-save"><span>You save</span><b id="fg-save" aria-live="polite">$0</b></div>
      </div>
      <div class="fg-prog">
        <p class="fg-prog-l" id="fg-prog" aria-live="polite"></p>
        <div class="fg-molten" id="fg-molten" role="progressbar" aria-valuemin="0" aria-valuemax="5" aria-valuenow="0"><i id="fg-molten-i"></i></div>
      </div>
      <div class="fg-case" id="fg-case" hidden>
        <h3 class="fg-case-h" id="fg-case-h"></h3>
        <p id="fg-case-p">Your kit is in the cart. Checkout when you're ready, or keep building.</p>
        <div class="fg-case-a">
          <button type="button" class="fg-go" id="fg-case-go">Checkout</button>
          <button type="button" id="fg-case-share">Share my kit</button>
          <button type="button" id="fg-case-keep">Keep building</button>
        </div>
      </div>
      <div class="fg-tray-wrap" id="fg-tray-wrap">
        <div class="fg-tray-h"><b id="fg-tray-name">Core Kit</b><span id="fg-tray-count">0 / 5</span></div>
        <div class="fg-tray" id="fg-tray" role="list" aria-label="Kit tray"></div>
        <p class="fg-ss-note" id="fg-ss-note" hidden>SS-31 50mg doesn't count toward kit discounts.</p>
      </div>
      <div class="fg-pick-h">
        <h3>Available vials</h3>
        <p class="fg-hint" id="fg-hint">Tap a vial to add it. On a computer, you can also drag it into the tray.</p>
      </div>
      <input class="fg-search" id="fg-search" type="search" placeholder="Search vials" aria-label="Search vials" autocomplete="off" spellcheck="false">
      <div class="fg-cats" id="fg-cats" role="group" aria-label="Filter vials"></div>
      <div class="fg-grid" id="fg-grid"></div>
      <div class="fg-act">
        <button type="button" class="fg-go" id="fg-checkout">Checkout</button>
        <button type="button" id="fg-share">Share my kit</button>
        <button type="button" id="fg-clear">Clear kit</button>
      </div>
      <p class="fg-foot">For research use only. Not for human or animal consumption. US only, 21+.</p>
      <div class="fg-flash" id="fg-flash" aria-hidden="true"></div>
      <div class="fg-slam" id="fg-slam" hidden role="dialog" aria-modal="true" aria-labelledby="fg-slam-n" aria-describedby="fg-slam-d">
        <div class="fg-slam-in"><small>Kit unlocked</small><b id="fg-slam-n"></b><span id="fg-slam-d"></span></div>
      </div>`;
  }

  function drawTiers() {
    const box = $("#fg-tiers"); if (!box) return;
    const n = kitN(), T = N.totals();
    box.replaceChildren();
    for (const s of SIZES) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "fg-tier";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-pressed", String(target === s));
      if (n >= s) b.classList.add("is-on");
      if (n < s) b.classList.add("is-locked");
      const p = pctAt(s, T.sub || 1);
      const vial = es() ? " viales" : " vials";
      const pct = p ? "<span class=\"fg-pct\">" + p + (es() ? "%" : "% off") + "</span>" : "";
      b.innerHTML = "<b>" + NAMES[s] + "</b><small>" + s + vial + "</small>" + pct;
      b.addEventListener("click", () => { target = s; paint(); });
      box.append(b);
    }
  }

  function drawTray() {
    const box = $("#fg-tray"); if (!box) return;
    const keys = kitKeys();
    const n = keys.length;
    if (n > 20) {/* tray shows first 20; extras still in cart */}
    const size = Math.max(target, slotTarget(Math.min(n, 20)));
    target = size;
    const show = Math.min(size, 20);
    $("#fg-tray-name").textContent = NAMES[show] || "Core Kit";
    $("#fg-tray-count").textContent = Math.min(n, 20) + " / " + show;
    box.replaceChildren();
    for (let i = 0; i < show; i++) {
      const slot = document.createElement("div");
      slot.className = "fg-slot" + (keys[i] ? " is-filled" : "");
      slot.setAttribute("role", "listitem");
      slot.dataset.i = String(i);
      const lab = keys[i] ? keys[i] : "Empty slot";
      slot.innerHTML = "<span class=\"fg-slot-n\">" + (i + 1) + "</span>" +
        (keys[i] ? miniVial(keys[i].replace(/\s+\S+$/, ""), keys[i].split(" ").pop()) + "<span class=\"fg-slot-lab\">" + esc(keys[i]) + "</span>" : "") +
        "<button type=\"button\" aria-label=\"" + esc(keys[i] ? "Remove " + keys[i] + " from kit" : "Empty slot " + (i + 1) + " of " + show) + "\"></button>";
      const btn = slot.querySelector("button");
      if (keys[i]) btn.addEventListener("click", () => remOne(keys[i]));
      slot.addEventListener("dragover", (e) => { e.preventDefault(); slot.classList.add("is-over"); });
      slot.addEventListener("dragleave", () => slot.classList.remove("is-over"));
      slot.addEventListener("drop", (e) => { e.preventDefault(); slot.classList.remove("is-over"); const k = e.dataTransfer.getData("text/plain"); if (k) addKey(k, slot); });
      box.append(slot);
    }
    const note = $("#fg-ss-note");
    if (note) {
      note.textContent = ssInCart()
        ? "SS-31 50mg is in your cart. It doesn't count toward kit discounts."
        : "SS-31 50mg doesn't count toward kit discounts.";
      note.hidden = !ssNoteOn();
    }
  }

  function priceHTML(k, d) {
    const p = (N.PRICE && N.PRICE[k]) != null ? N.PRICE[k] : d.p;
    const r = (N.NPRICE && N.NPRICE[k]) != null ? N.NPRICE[k] : p;
    if (N.VIPON && r > p) return "<s>" + money(r) + "</s> <b class=\"vipp\">" + money(p) + "</b>";
    return "<span>" + money(p) + "</span>";
  }

  function drawGrid() {
    const grid = $("#fg-grid"); if (!grid) return;
    const q = search.trim().toLowerCase();
    const { main, other } = catalog();
    const cats = ["All"];
    for (const row of main) {
      const c = (N.GUIDE && N.GUIDE[N.norm ? N.norm(row.it.name) : ""] || {}).c || row.group;
      row.cat = c;
      if (c && !cats.includes(c)) cats.push(c);
    }
    const catBox = $("#fg-cats");
    if (catBox && !catBox.dataset.ready) {
      /* rebuilt below */
    }
    if (catBox) {
      catBox.replaceChildren();
      for (const c of cats) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "fg-cat"; b.textContent = (N.SHORT && N.SHORT[c]) || c;
        b.setAttribute("aria-pressed", String(cat === c));
        b.addEventListener("click", () => { cat = c; drawGrid(); });
        catBox.append(b);
      }
    }
    const match = (row) => {
      if (cat !== "All" && row.cat !== cat) return false;
      if (!q) return true;
      const bits = (row.it.name + " " + (row.it.doses || []).map((d) => d.dose).join(" ")).toLowerCase();
      return bits.includes(q);
    };
    grid.replaceChildren();
    const paintRow = (row, host) => {
      for (const d of row.it.doses || []) {
        const k = keyOf(row.it, d);
        const ok = N.avail(d.s);
        const oos = !ok;
        const el = document.createElement("button");
        el.type = "button";
        el.className = "fg-chip" + (oos ? " is-oos" : "") + (SS(k) ? " is-ss" : "");
        el.dataset.key = k;
        el.draggable = ok && !reduce();
        const ssEx = ssNoteOn() && SS(k);
        const badge = ssEx ? "<span class=\"fg-badge\">Doesn't count toward kit discounts</span>" :
          (oos ? "<span class=\"fg-badge\">" + (d.s === "soon" ? "Restocking" : "Out of stock") + "</span>" : "");
        el.innerHTML = "<div class=\"fg-chip-t\"><b>" + esc(row.it.name) + "</b>" + priceHTML(k, d) + "</div>" +
          "<span class=\"fg-dose\">" + esc(d.dose) + "</span>" + badge;
        el.setAttribute("aria-label", (oos ? (d.s === "soon" ? "Restocking, " : "Out of stock, ") : "Add ") + k + (ssEx ? ", doesn't count toward kit discounts" : ""));
        el.disabled = oos;
        if (ok) {
          el.addEventListener("click", () => addKey(k));
          el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", k); e.dataTransfer.effectAllowed = "copy"; });
        }
        host.append(el);
      }
    };
    for (const row of main) if (match(row)) paintRow(row, grid);
    if (other.length) {
      const det = document.createElement("details");
      det.className = "fg-more";
      det.innerHTML = "<summary>Other compounds</summary><div class=\"fg-grid\" id=\"fg-other\"></div>";
      const og = det.querySelector(".fg-grid");
      let n = 0;
      for (const row of other) if (match(row) || (cat === "All" && !q)) { paintRow(row, og); n++; }
      if (n) grid.append(det);
    }
  }

  function addKey(k, slotEl) {
    if (!N || !k) return false;
    const st = N.STATUS && N.STATUS[k];
    const inCart = N.picks.has(k);
    if (!N.avail(st) && !inCart) return false;
    const have = inCart ? N.qty(k) : 0;
    const cap = N.capQ(k);
    if (have >= cap) { if (N.capMsg) N.capMsg(k); return false; }
    if (!inCart) N.picks.set(k, st); N.QTY[k] = have + 1;
    N.savePicks(); N.tray(); if (N.draw) N.draw();
    if (!reduce()) buzz(12);
    const prev = lastN;
    paint({ dropped: countsForKit(k), slotEl, fromN: prev });
    return true;
  }
  function remOne(k) {
    if (!N || !N.picks.has(k)) return;
    const q = N.qty(k);
    if (q <= 1) { N.picks.delete(k); delete N.QTY[k]; }
    else N.QTY[k] = q - 1;
    N.savePicks(); N.tray(); if (N.draw) N.draw();
    paint();
  }
  function clearKit() {
    if (!N) return;
    for (const k of [...N.picks.keys()]) {
      if (!countsForKit(k)) continue;
      N.picks.delete(k); delete N.QTY[k];
    }
    N.savePicks(); N.tray(); if (N.draw) N.draw();
    lastUnlock = 0; paint();
  }

  function tween(from, to, el, ms) {
    if (reduce() || Math.abs(to - from) < 0.005) { el.textContent = money(to); return; }
    const t0 = performance.now(), d = ms || 420;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / d);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = money(from + (to - from) * e);
      if (t < 1) rafOd = requestAnimationFrame(step);
    };
    cancelAnimationFrame(rafOd); rafOd = requestAnimationFrame(step);
  }

  function paintMeters() {
    const T = N.totals();
    const totEl = $("#fg-total"), savEl = $("#fg-save");
    const save = Math.round((T.vip + T.deal + T.disc + T.ref + T.so) * 100) / 100;
    tween(od.shownT, T.after, totEl);
    tween(od.shownS, save, savEl);
    od.shownT = T.after; od.shownS = save;
    const n = kitN();
    const next = SIZES.find((s) => n < s) || 20;
    const base = n >= 20 ? 20 : (SIZES.filter((s) => s <= n).pop() || 0);
    const span = next - base || 5;
    const into = n >= 20 ? 20 : (n - base);
    const pct = n >= 20 ? 100 : Math.max(0, Math.min(100, (into / (next - base)) * 100));
    const bar = $("#fg-molten-i"), wrap = $("#fg-molten"), lab = $("#fg-prog");
    if (bar) {
      bar.style.width = (n >= 20 ? 100 : (n === 0 ? 0 : Math.max(6, pct))) + "%";
      bar.classList.toggle("fg-flow", !reduce() && n > 0 && n < 20);
    }
    if (wrap) { wrap.setAttribute("aria-valuemax", String(next)); wrap.setAttribute("aria-valuenow", String(Math.min(n, 20))); wrap.setAttribute("aria-label", progressCopy(n)); }
    if (lab) lab.textContent = progressCopy(n);
    const share = $("#fg-share"), go = $("#fg-checkout");
    if (share) share.disabled = N.picks.size === 0;
    if (go) go.disabled = N.picks.size === 0;
    const caseEl = $("#fg-case");
    if (caseEl) {
      const hit = SIZES.includes(n);
      if (hit) {
        caseEl.hidden = false;
        $("#fg-case-h").textContent = NAMES[n] + (es() ? " sellado" : " sealed");
      } else caseEl.hidden = true;
    }
  }

  function maybeUnlock(fromN, toN) {
    const hit = SIZES.find((s) => fromN < s && toN >= s);
    if (!hit || hit === lastUnlock) return;
    lastUnlock = hit;
    const T = N.totals();
    const p = T.pct || pctAt(hit, T.sub);
    $("#fg-slam-n").textContent = NAMES[hit];
    $("#fg-slam-d").textContent = p
      ? (es() ? (p + "% de descuento · se aplica al pagar") : (p + "% off · applied at checkout"))
      : (es() ? "Se aplica al pagar" : "Applied at checkout");
    const slam = $("#fg-slam"), flash = $("#fg-flash");
    slam.hidden = false;
    requestAnimationFrame(() => { slam.classList.add("on"); if (!reduce()) flash.classList.add("on"); });
    if (!reduce()) buzz([18, 40, 28]);
    if (embers && embers.burst) embers.burst();
    const close = () => { slam.classList.remove("on"); flash.classList.remove("on"); setTimeout(() => { slam.hidden = true; }, 280); };
    slam.onclick = close;
    clearTimeout(maybeUnlock.t);
    maybeUnlock.t = setTimeout(close, reduce() ? 1600 : 2200);
  }

  function paint(opts) {
    if (!N || !booted) return;
    const prev = lastN;
    drawTiers();
    drawTray();
    if (!opts || !opts.skipGrid) drawGrid();
    paintMeters();
    const n = kitN();
    if (opts && opts.dropped) {
      const slots = $$(".fg-slot.is-filled", root);
      const slot = opts.slotEl || slots[slots.length - 1];
      if (slot && !reduce()) { slot.classList.add("is-ignite", "is-drop"); setTimeout(() => slot.classList.remove("is-ignite", "is-drop"), 600); }
    }
    maybeUnlock(typeof opts?.fromN === "number" ? opts.fromN : prev, n);
    lastN = n;
  }

  /* Lightweight ember canvas — runs only while the tab is visible. */
  function startEmbers() {
    const c = $("#fg-embers"); if (!c || reduce() || embers) return;
    const ctx = c.getContext("2d", { alpha: true });
    let w = 0, h = 0, dpr = 1, parts = [], raf, on = false;
    const resize = () => {
      const r = c.getBoundingClientRect();
      dpr = Math.min(1.25, window.devicePixelRatio || 1);
      w = Math.max(1, Math.floor(r.width * dpr));
      h = Math.max(1, Math.floor(r.height * dpr));
      c.width = w; c.height = h;
    };
    const spawn = (n, burst) => {
      for (let i = 0; i < n; i++) {
        parts.push({
          x: Math.random() * w, y: burst ? h * (0.4 + Math.random() * 0.3) : h + Math.random() * 20,
          vx: (Math.random() - 0.5) * (burst ? 1.6 : 0.25) * dpr,
          vy: -(0.25 + Math.random() * (burst ? 2.2 : 0.7)) * dpr,
          life: burst ? 40 + Math.random() * 30 : 80 + Math.random() * 80,
          age: 0, s: (0.7 + Math.random() * 1.6) * dpr,
          c: Math.random() < 0.25 ? "255,180,90" : "180,140,255"
        });
      }
      if (parts.length > 80) parts.splice(0, parts.length - 80);
    };
    const tick = () => {
      if (!on) return;
      ctx.clearRect(0, 0, w, h);
      if (parts.length < 36 && Math.random() < 0.35) spawn(1, false);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.age++; p.x += p.vx; p.y += p.vy; p.vy -= 0.004 * dpr;
        const a = Math.max(0, 1 - p.age / p.life);
        if (a <= 0 || p.y < -10) { parts.splice(i, 1); continue; }
        ctx.beginPath(); ctx.fillStyle = "rgba(" + p.c + "," + (a * 0.7) + ")";
        ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => { if (on) return; resize(); on = true; if (!parts.length) spawn(24, false); tick(); };
    const stop = () => { on = false; cancelAnimationFrame(raf); };
    const burst = () => { resize(); spawn(28, true); if (!on) start(); };
    addEventListener("resize", () => { if (on) resize(); }, { passive: true });
    embers = { start, stop, burst };
  }

  async function share() {
    if (!N.picks.size) return;
    const url = shareURL();
    const title = "THE FORGE · Novrix Labs";
    const text = "Build a Kit at Novrix Labs. Research use only.";
    try {
      if (navigator.share) { await navigator.share({ title, text, url }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try {
      await navigator.clipboard.writeText(url);
      const b = $("#fg-share"); if (b) { const t = b.textContent; b.textContent = "Link copied"; setTimeout(() => { b.textContent = t; }, 1800); }
    } catch (e) {
      prompt("Copy this kit link:", url);
    }
  }
  function checkout() {
    const btn = document.getElementById("tray-order");
    if (btn) btn.click();
  }

  function bind() {
    $("#fg-search").addEventListener("input", (e) => { search = e.target.value; drawGrid(); });
    $("#fg-share").addEventListener("click", share);
    $("#fg-case-share").addEventListener("click", share);
    $("#fg-checkout").addEventListener("click", checkout);
    $("#fg-case-go").addEventListener("click", checkout);
    $("#fg-clear").addEventListener("click", clearKit);
    $("#fg-case-keep").addEventListener("click", () => { const c = $("#fg-case"); if (c) c.hidden = true; });
    $("#fg-tray-wrap").addEventListener("dragover", (e) => e.preventDefault());
    $("#fg-tray-wrap").addEventListener("drop", (e) => { e.preventDefault(); const k = e.dataTransfer.getData("text/plain"); if (k) addKey(k); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { const s = $("#fg-slam"); if (s && !s.hidden) { s.classList.remove("on"); s.hidden = true; } }
    });
    if (N.hookTray) N.hookTray(() => { if (document.body.dataset.nxv === "forge") paint({ skipGrid: true }); });
  }

  function vis(on) {
    if (on) { if (embers) embers.start(); }
    else { if (embers) embers.stop(); }
  }

  function boot() {
    if (booted) { paint(); vis(document.body.dataset.nxv === "forge"); return; }
    if (!N) return;
    shell();
    bind();
    booted = true;
    lastN = kitN();
    target = slotTarget(Math.min(lastN, 20) || 5);
    if (lastN >= 5) lastUnlock = SIZES.filter((s) => lastN >= s).pop() || 0;
    paint();
    startEmbers();
    vis(document.body.dataset.nxv === "forge");
    window.__FG.booted = true;
  }

  window.__FG = {
    booted: false,
    ready: () => { boot(); return true; },
    kitN, progressText: () => progressCopy(kitN()),
    sizes: SIZES, names: NAMES,
    pctAt, shareURL, addKey, remOne, clearKit, paint, boot,
    isExcluded: (k) => ssNoteOn() && SS(k),
    ssNoteOn, etYmd, countsForKit,
    targetOf: () => target,
    setTarget: (s) => { if (SIZES.includes(s)) { target = s; paint(); } }
  };

  const mo = new MutationObserver(() => {
    const on = document.body.dataset.nxv === "forge";
    if (on) boot();
    vis(on);
  });
  mo.observe(document.body, { attributes: true, attributeFilter: ["data-nxv"] });
  if (document.body.dataset.nxv === "forge") boot();

  document.addEventListener("visibilitychange", () => {
    vis(document.visibilityState === "visible" && document.body.dataset.nxv === "forge");
  });
  new MutationObserver(() => { if (booted) paint(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
