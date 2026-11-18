/* THE FORGE — lazy tab. Builds a kit as a local draft; the kit only enters the cart once it is sealed (a multiple of 5 vials).
   Reads live cart math (N.totals) for every price shown; never changes totals(), tiers, caps, fees, shipping, order text or data lines. */
(() => {
  if (window.__FG && window.__FG.booted) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const root = $("#forge");
  if (!root) return;

  const N = window.__NX;
  const SIZES = [5, 10, 15, 20];
  const STEP = 5;
  const NAMES = { 5: "Core Kit", 10: "Elite Kit", 15: "Titan Kit", 20: "Apex Kit" };
  const EXCL = /testosterone|\bnvleq\b|anavar|havoc|trenbolone|nandrolone|boldenone|oxandrolone|masteron|primobolan|semaglutide|cockbomb|somatropin|191aa|\bnvl-h\b|j2941|\bhulk\b|nightfall|\bhgh\b/i;
  /* Names shown from POPULAR or typed for a kit card: neutral only, no outcome, health or use words. */
  const BADNAME = /\b(heal\w*|recover\w*|repair\w*|regen\w*|burn\w*|fat\w*|weight\w*|loss|lose|lean\w*|shred\w*|cut|cutting|bulk\w*|muscle\w*|gain\w*|strength|strong\w*|energy|sleep\w*|libido|sex\w*|anti.?ag\w*|aging|ageless|youth\w*|longevity|skin|glow\w*|tan|tanning|hair|immun\w*|focus\w*|cogni\w*|brain\w*|mood|stress|anxi\w*|pain\w*|injur\w*|inflam\w*|joint\w*|gut|health\w*|cure\w*|treat\w*|therap\w*|dose|doses|dosing|dosage|cycle\w*|stack\w*|perform\w*|boost\w*|enhanc\w*|slim\w*|diet\w*|metabol\w*|hormon\w*|testo\w*|fertil\w*|tissue|recomp|fitness|gym|wellness|vital\w*|results?|shred|ripped|jacked|potent\w*|benefit\w*|wound\w*|fix\w*)\b/i;
  const SS = (k) => /^SS-31\b/i.test(k);
  const etYmd = (d) => { try { return new Date(d == null ? Date.now() : d).toLocaleDateString("en-CA", {timeZone: "America/New_York"}); } catch (e) { const n = new Date(d == null ? Date.now() : d); return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0"); } };
  /* Display-only: the Dec 1 SS-31 kit-exclusion note. Live totals() are unchanged. */
  const ssNoteOn = (t) => etYmd(t) >= "2026-12-01";
  const reduce = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const es = () => (document.documentElement.lang || "").toLowerCase().startsWith("es");
  const T2 = (en, sp) => es() ? sp : en;
  /* Display-only. Same cents rule as the cart (drop .00), plus a thousands separator so $1,044 sits next to $436.50. */
  const money = (n) => {
    const v = Math.round(Number(n) * 100) / 100;
    const whole = Math.abs(v % 1) < 1e-9;
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  };
  const keyOf = (it, d) => it.name + " " + d.dose;
  const buzz = (pat) => { try { if (!navigator.vibrate) return; const ua = navigator.userActivation; if (ua && !ua.isActive && !ua.hasBeenActive) return; navigator.vibrate(pat); } catch (e) {} };
  const MENU = "https://novrixlabs.shop/";
  const DKEY = "novrix-forge-draft", AKEY = "novrix-forge-added", LKEY = "novrix-forge-last", NKEY = "novrix-forge-name";
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };

  let booted = false, target = 5, lastN = 0, lastSealed = 0, rafOd, embers, search = "", cat = "All", flash = "";
  const od = { total: 0, save: 0, shownT: 0, shownS: 0 };

  /* ---------- catalog + draft ---------- */
  let CAT = null;
  function catalog() {
    if (CAT) return CAT;
    const main = [], other = [], byKey = new Map(), byId = new Map();
    if (!N || !N.DATA) return { main, other, byKey, byId };
    for (const g of N.DATA) {
      for (const it of (g.items || [])) {
        if (EXCL.test(it.name)) continue;
        if (/\bIU\b/i.test(it.name) && !/^HCG\b/i.test(it.name)) continue;
        const row = { it, group: g.group };
        if (/^HCG\b/i.test(it.name)) other.push(row); else main.push(row);
        for (const d of it.doses || []) {
          const k = keyOf(it, d);
          if (EXCL.test(k) || (/\bIU\b/i.test(k) && !/^HCG\b/i.test(k))) continue;
          byKey.set(k, { it, d });
          for (const id of (d.ids || [])) byId.set(String(id), k);
        }
      }
    }
    CAT = { main, other, byKey, byId };
    return CAT;
  }
  const allowed = (k) => catalog().byKey.has(k);
  const stOf = (k) => (N.STATUS && N.STATUS[k]);
  const okStock = (k) => allowed(k) && N.avail(stOf(k));
  const cap = (k) => N.capQ(k);

  let draft = new Map();
  /* Re-validates any list of [key, qty]: unknown, excluded or unavailable vials drop out; quantities clamp to capQ. */
  function clean(list) {
    const m = new Map(); const dropped = [];
    if (!Array.isArray(list)) return { m, dropped };
    for (const row of list) {
      if (!Array.isArray(row)) continue;
      const k = String(row[0] || ""); const q = Math.floor(Number(row[1]));
      if (!k || !(q > 0)) continue;
      if (!okStock(k)) { if (allowed(k)) dropped.push(k); continue; }
      const before = (m.get(k) || 0) + Math.min(q, 999);
      const c = Math.min(before, cap(k));
      if (c < before && !dropped.includes(k)) dropped.push(k);
      m.set(k, c);
    }
    return { m, dropped };
  }
  function loadDraft() { let a = []; try { a = JSON.parse(lsGet(DKEY) || "[]"); } catch (e) { a = []; } draft = clean(a).m; saveDraft(); }
  function saveDraft() { lsSet(DKEY, draft.size ? JSON.stringify([...draft]) : null); }
  const dq = (k) => draft.get(k) || 0;

  /* Items that count toward the kit size. Mirrors the counter live totals() uses:
     sale tiers count every item (including Reconstitution Solution); MULTI skips reconstitution.
     From Dec 1, SS-31 is omitted from this display count only. */
  function countsForKit(k) {
    if (ssNoteOn() && SS(k)) return false;
    if (N && N.saleOn && N.SALE) return true;
    if (N && N.MULTI && N.MULTI.skip && N.MULTI.skip.test(k)) return false;
    return true;
  }
  function countOf(m) { let n = 0; for (const [k, q] of m) if (countsForKit(k)) n += q; return n; }
  function kitKeys() { const out = []; for (const [k, q] of draft) { if (!countsForKit(k)) continue; for (let i = 0; i < q; i++) out.push(k); } return out; }
  function kitN() { return countOf(draft); }
  const needOf = (n) => n < STEP ? STEP - n : (STEP - (n % STEP)) % STEP;
  const isSealed = (n) => n >= STEP && n % STEP === 0;
  const stepOf = (n) => n + needOf(n);
  const nameOf = (n) => NAMES[n] || (n > 20 ? "Apex Kit" : "Core Kit");
  function ssInDraft() { let n = 0; for (const [k, q] of draft) if (SS(k)) n += q; return n; }

  /* Exact live math for a set of vials: swap them into the live cart for one synchronous totals() call, then restore. Nothing is saved or drawn. */
  function totalsFor(m) {
    const P = N.picks, Q = N.QTY;
    const sp = [...P.entries()], sq = Object.assign({}, Q);
    let T;
    try {
      P.clear(); for (const k of Object.keys(Q)) delete Q[k];
      for (const [k, q] of m) { P.set(k, stOf(k)); Q[k] = q; }
      T = N.totals();
    } finally {
      P.clear(); for (const [k, v] of sp) P.set(k, v);
      for (const k of Object.keys(Q)) delete Q[k]; Object.assign(Q, sq);
    }
    return T;
  }
  const kitTotals = () => totalsFor(draft);

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
  const off = (p) => !p ? "" : (es() ? " (" + p + "% de descuento)" : " (" + p + "% off)");

  /* Marketing copy (EN/ES). Brand names Core, Elite, Titan, Apex and Forge stay in English. */
  function sealLine(n) {
    if (n >= 20) return T2("Apex kit sealed. Gold finish.", "Kit Apex sellado. Acabado dorado.");
    const b = { 5: "Core", 10: "Elite", 15: "Titan" }[n] || "Core";
    return T2(b + " kit sealed. " + n + " vials forged.", "Kit " + b + " sellado. " + n + " viales forjados.");
  }
  function progressCopy(n) {
    const sp = es();
    if (!n) return sp ? "Agrega 5 viales para sellar tu kit" : "Add 5 vials to seal your kit";
    const need = needOf(n);
    if (need) {
      return sp ? ("Agrega " + (need === 1 ? "1 vial más" : need + " viales más") + " para sellar tu kit")
                : ("Add " + need + " more vial" + (need === 1 ? "" : "s") + " to seal your kit");
    }
    return sealLine(n);
  }
  /* "N more vials unlocks Y%": the next multiple of 5 whose live tier % beats the current one. */
  function unlockCopy(n) {
    const T = kitTotals(), sub = T.sub || 1, cur = Math.max(T.pct || 0, pctAt(n, sub));
    for (let m = stepOf(n) === n ? n + STEP : stepOf(n); m <= Math.max(20, n + STEP); m += STEP) {
      const p = pctAt(m, sub);
      if (p > cur) { const more = m - n; return es() ? ("Con " + (more === 1 ? "1 vial más" : more + " viales más") + ": " + p + "% de descuento") : (more === 1 ? "1 more vial unlocks " + p + "% off" : more + " more vials unlock " + p + "% off"); }
    }
    return n >= 20 ? T2("Top kit tier reached", "Nivel máximo de kit alcanzado") : "";
  }

  /* ---------- suggestions: only available vials, within capQ, nothing excluded ---------- */
  const suggestable = (k) => okStock(k) && countsForKit(k) && !/reconstitution/i.test(k) && !/^HCG\b/i.test(k);
  function purityOf(d) { const v = (N.coaList ? N.coaList(d) : []).map((c) => parseFloat(c.purity)).filter((x) => x > 0); return v.length ? Math.max(...v) : 0; }
  function suggestOrder() {
    const out = [];
    for (const [k, { d }] of catalog().byKey) if (suggestable(k)) out.push({ k, d, best: d.badge ? 1 : 0, low: stOf(k) === "low" ? 1 : 0, pur: purityOf(d) });
    out.sort((a, b) => (a.low - b.low) || (b.best - a.best) || (b.pur - a.pur) || a.k.localeCompare(b.k));
    return out;
  }
  /* Round-robin fill: one vial per key per pass, never past capQ. Returns adds or null when stock can't reach the target. */
  function rr(keys, base, need, adds) {
    let left = need, moved = true;
    while (left > 0 && moved) {
      moved = false;
      for (const k of keys) {
        if (!left) break;
        const room = cap(k) - (base.get(k) || 0) - (adds.get(k) || 0);
        if (room > 0) { adds.set(k, (adds.get(k) || 0) + 1); left--; moved = true; }
      }
    }
    return left;
  }
  function completePlan() {
    const n = kitN(), need = n ? needOf(n) : STEP;
    if (!need) return { need: 0, adds: new Map(), ok: true };
    const adds = new Map();
    const mine = [...draft.keys()].filter(suggestable);
    let left = rr(mine, draft, need, adds);
    if (left > 0) left = rr(suggestOrder().map((x) => x.k).filter((k) => !draft.has(k)), draft, left, adds);
    if (left > 0) return { need, adds: null, ok: false, short: left, back: n >= STEP ? n % STEP : 0, down: n - (n % STEP) };
    return { need, adds, ok: true };
  }
  /* Starter kits: names, taglines and vials from the team's starter_kits.md review draft. Neutral names only.
     A starter shows only when every vial is in stock within capQ (otherwise it's skipped). */
  const STARTERS = [
    { id: "bestsellers", name: "Bestsellers", tag: ["A one-tap Core kit of shop favorites.", "Un kit Core de un toque con los favoritos de la tienda."], v: ["BPC-157 10mg", "MOTS-c 40mg", "Semax 10mg", "KLOW 80mg", "Tri-Heal 30mg"] },
    { id: "lab-staples", name: "Lab staples", tag: ["Everyday catalog stock, sealed as a Core kit.", "Stock habitual del catálogo, sellado como kit Core."], v: ["Wolverine 20mg", "Tri-Heal 30mg", "KLOW 80mg", "BPC-157 10mg", "MOTS-c 40mg"] },
    { id: "catalog-five", name: "Catalog five", tag: ["A one-tap Core kit drawn from live stock.", "Un kit Core de un toque con stock en vivo."], v: ["Wolverine 20mg", "BPC-157 10mg", "MOTS-c 40mg", "Semax 10mg", "Tri-Heal 30mg"] },
    { id: "bench-set", name: "Bench set", tag: ["Five frequently paired vials, ready to forge.", "Cinco viales que se piden juntos, listos para forjar."], v: ["Wolverine 20mg", "KLOW 80mg", "MOTS-c 40mg", "Semax 10mg", "Tri-Heal 30mg"] },
    { id: "house-blends", name: "House blends", tag: ["Three house blends and two singles, all in stock.", "Tres mezclas de la casa y dos individuales, todo en stock."], v: ["Wolverine 20mg", "Tri-Heal 30mg", "KLOW 80mg", "BPC-157 10mg", "GHK-Cu 100mg"] },
    { id: "shop-favorites", name: "Shop favorites", tag: ["A straightforward five-vial starter from the current shelf.", "Un kit sencillo de cinco viales con lo que hay ahora."], v: ["BPC-157 10mg", "Wolverine 20mg", "Semax 10mg", "KLOW 80mg", "MOTS-c 40mg"] }
  ];
  const short = (k) => { const e = catalog().byKey.get(k); return e ? (e.it.name.replace(/\s+blend$/i, "") + " " + String(e.d.dose).replace(/\s*vial$/i, "")).toLowerCase() : ""; };
  function presets() {
    const out = [];
    const idx = new Map(); for (const k of catalog().byKey.keys()) idx.set(short(k), k);
    for (const st of STARTERS) {
      if (!nameOk(st.name) || BADNAME.test(st.tag[0])) continue;
      const m = new Map(); let ok = true;
      for (const v of st.v) { const k = idx.get(v.toLowerCase()); if (!k || !suggestable(k)) { ok = false; break; } m.set(k, (m.get(k) || 0) + 1); if (m.get(k) > cap(k)) { ok = false; break; } }
      if (ok && isSealed(countOf(m))) out.push({ id: st.id, name: st.name, sub: es() ? st.tag[1] : st.tag[0], m });
    }
    return out;
  }
  const cleanName = (v) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f-\u009f<>{}\[\]\\`"]/g, "").replace(/\s+/g, " ").trim().slice(0, 24).trim();
  const nameOk = (v) => !!v && !BADNAME.test(v) && !EXCL.test(v);
  function popular() {
    const P = N.POPULAR, out = [];
    if (!P || typeof P !== "object" || !Array.isArray(P.kits)) return out;
    for (const kit of P.kits.slice(0, 12)) {
      if (!kit || typeof kit !== "object" || !Array.isArray(kit.ids) || !kit.ids.length || kit.ids.length > 60) continue;
      if (typeof kit.name !== "string" || /[<>{}\[\]\\`"]/.test(kit.name) || !nameOk(kit.name.replace(/\s+/g, " "))) continue;
      const name = cleanName(kit.name);
      if (!nameOk(name)) continue;
      const m = new Map(); let bad = false;
      for (const id of kit.ids) {
        const k = catalog().byId.get(String(id));
        if (!k || !okStock(k)) { bad = true; break; }
        m.set(k, (m.get(k) || 0) + 1);
        if (m.get(k) > cap(k)) { bad = true; break; }
      }
      if (bad || !isSealed(countOf(m))) continue;
      out.push({ id: "pop-" + out.length, name, m });
      if (out.length >= 4) break;
    }
    return out;
  }
  function lastKit() {
    let r = null; try { r = JSON.parse(lsGet(LKEY) || "null"); } catch (e) {}
    if (!r || !Array.isArray(r.items)) return null;
    const c = clean(r.items);
    if (!c.m.size) return null;
    return { m: c.m, dropped: c.dropped };
  }

  function enc() { return [...draft].map(([k, q]) => encodeURIComponent(k) + "~" + q).join("|"); }
  /* The customer's own referral code (novrix-mycode), if they have one. Never someone else's code. */
  function myCode() { const v = (lsGet("novrix-mycode") || "").trim(); return /^[A-Za-z0-9-]{3,24}$/.test(v) ? v : ""; }
  function shareURL() { const ref = myCode(); return MENU + (ref ? "?ref=" + encodeURIComponent(ref) : "") + "#forge=" + enc(); }
  function miniVial(name, dose) {
    const nm = String(name || "").replace(/\s+blend$/i, "");
    const cut = nm.length > 11 ? nm.slice(0, 10) + "…" : nm;
    return `<svg class="fg-vial" viewBox="0 0 80 150" aria-hidden="true"><rect x="18" y="6" width="44" height="20" rx="4" fill="#c9c6d4"/><rect x="21" y="26" width="38" height="9" fill="#8d90a0"/><path d="M24 35h32v6c6 2 10 5 10 11v84a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8V52c0-6 4-9 10-11z" fill="#0d0d16" fill-opacity=".7" stroke="rgba(255,255,255,.35)"/><path d="M16 118h48v18a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6z" fill="#f2efe9" fill-opacity=".92"/><rect x="14" y="66" width="52" height="44" fill="#0b0b12"/><text x="40" y="88" text-anchor="middle" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" font-size="9" fill="#fff">${esc(cut.toUpperCase())}</text><text x="40" y="100" text-anchor="middle" font-family="Michroma,Arial" font-size="4.1" fill="#b9a6ff">NOVRIX</text></svg>`;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  /* ---------- markup ---------- */
  const NIMG = (w, h, cls) => `<img class="${cls || ""}" src="assets/forge-n.webp" width="${w}" height="${h}" alt="" decoding="async">`;
  function shell() {
    root.innerHTML = `
      <div class="fg-hero" id="fg-hero">
        <canvas class="fg-embers" id="fg-embers" aria-hidden="true"></canvas>
        <div class="fg-hero-in">
          <div class="fg-stamp">${NIMG(92, 108)}</div>
          <p class="fg-ey">Research · US only · 21+</p>
          <h2 class="fg-name" id="fg-h">THE FORGE</h2>
          <p class="fg-tag">Build a Kit</p>
          <p class="fg-lede" id="fg-lede"></p>
          <p class="fg-ruo">For research use only. Not for human or animal consumption.</p>
        </div>
      </div>
      <div class="fg-tiers" id="fg-tiers" role="group" aria-label="Kit sizes"></div>
      <div class="fg-stat">
        <div class="fg-meter"><span id="fg-total-l">Kit total</span><b id="fg-total">$0</b></div>
        <div class="fg-meter fg-save"><span id="fg-save-l">You save</span><b id="fg-save">$0</b><small id="fg-save-s"></small></div>
      </div>
      <div class="fg-prog">
        <p class="fg-prog-l" id="fg-prog" aria-live="polite"></p>
        <div class="fg-molten" id="fg-molten" role="progressbar" aria-valuemin="0" aria-valuemax="20" aria-valuenow="0"><i id="fg-molten-i"></i><span class="fg-ticks" aria-hidden="true"><em></em><em></em><em></em></span></div>
        <p class="fg-unl" id="fg-unl"></p>
      </div>
      <div class="fg-case" id="fg-case" hidden></div>
      <div class="fg-start" id="fg-start" hidden></div>
      <div class="fg-tray-wrap" id="fg-tray-wrap">
        <div class="fg-tray-h"><b id="fg-tray-name">Core Kit</b><span id="fg-tray-count">0 / 5</span></div>
        <div class="fg-tray" id="fg-tray" role="list" aria-label="Kit tray"></div>
        <p class="fg-more-n" id="fg-more-n" hidden></p>
        <p class="fg-ss-note" id="fg-ss-note" hidden>SS-31 50mg doesn't count toward kit discounts.</p>
      </div>
      <div class="fg-pick-h">
        <h3 id="fg-pick-t">Available vials</h3>
        <p class="fg-hint" id="fg-hint"></p>
      </div>
      <input class="fg-search" id="fg-search" type="search" placeholder="Search vials" aria-label="Search vials" autocomplete="off" spellcheck="false">
      <div class="fg-cats" id="fg-cats" role="group" aria-label="Filter vials"></div>
      <div class="fg-grid" id="fg-grid"></div>
      <div class="fg-act">
        <button type="button" class="fg-go" id="fg-add"></button>
        <button type="button" id="fg-share">Share my kit</button>
        <button type="button" id="fg-clear">Clear kit</button>
      </div>
      <p class="fg-foot">For research use only. Not for human or animal consumption. US only, 21+.</p>
      <div class="fg-dock" id="fg-dock" hidden><div class="fg-dock-in"><div class="fg-dock-t"><b id="fg-dock-n"></b><span id="fg-dock-p"></span></div><i class="fg-dock-bar"><i id="fg-dock-i"></i></i><button type="button" class="fg-go" id="fg-dock-go"></button></div></div>`;
  }

  function drawStatic() {
    $("#fg-lede").textContent = T2("Mix and match in-stock vials in steps of 5: Core 5, Elite 10, Titan 15 or Apex 20. A kit goes to the cart once it is sealed.", "Combina viales en stock en grupos de 5: Core 5, Elite 10, Titan 15 o Apex 20. El kit pasa al carrito cuando está sellado.");
    $("#fg-hint").textContent = T2("Tap a vial to add it. On a computer, you can also drag it into the case.", "Toca un vial para agregarlo. En computadora también puedes arrastrarlo al estuche.");
    $("#fg-save-l").textContent = T2("You save", "Ahorras");
    $("#fg-total-l").textContent = T2("Kit total", "Total del kit");
    $("#fg-pick-t").textContent = T2("Available vials", "Viales disponibles");
    $("#fg-share").textContent = T2("Share my kit", "Compartir mi kit");
    $("#fg-clear").textContent = T2("Clear kit", "Vaciar kit");
    $("#fg-search").placeholder = T2("Search vials", "Buscar viales");
  }

  function drawTiers() {
    const box = $("#fg-tiers"); if (!box) return;
    const n = kitN(), T = kitTotals();
    box.replaceChildren();
    for (const s of SIZES) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "fg-tier" + (s === 20 ? " fg-tier-apex" : "");
      b.setAttribute("aria-pressed", String(target === s));
      if (n >= s) b.classList.add("is-on");
      if (n === s) b.classList.add("is-here");
      if (n < s) b.classList.add("is-locked");
      const p = pctAt(s, T.sub || 1);
      const vial = es() ? " viales" : " vials";
      const pct = p ? "<span class=\"fg-pct\">" + p + (es() ? "% desc." : "% off") + "</span>" : "";
      b.innerHTML = "<b>" + NAMES[s] + "</b><small>" + s + vial + "</small>" + pct;
      b.setAttribute("aria-label", NAMES[s] + ", " + s + vial + (p ? ", " + p + (es() ? "% de descuento" : "% off") : "") + (n >= s ? (es() ? ", alcanzado" : ", reached") : ""));
      b.addEventListener("click", () => { target = s; paint({ skipGrid: true }); });
      box.append(b);
    }
  }

  function drawTray() {
    const box = $("#fg-tray"); if (!box) return;
    const keys = kitKeys(), n = keys.length;
    const sealed = isSealed(n);
    const size = Math.min(20, Math.max(target, stepOf(n) || STEP));
    target = size;
    $("#fg-tray-name").textContent = nameOf(size);
    $("#fg-tray-count").textContent = Math.min(n, size) + " / " + size;
    const wrap = $("#fg-tray-wrap");
    wrap.classList.toggle("is-sealed", sealed);
    wrap.classList.toggle("fg-apex", sealed && n >= 20);
    box.dataset.size = String(size);
    box.replaceChildren();
    for (let i = 0; i < size; i++) {
      const slot = document.createElement("div");
      slot.className = "fg-slot" + (keys[i] ? " is-filled" : "") + (i % STEP === STEP - 1 ? " is-edge" : "");
      slot.setAttribute("role", "listitem");
      slot.dataset.i = String(i);
      slot.innerHTML = "<span class=\"fg-slot-n\">" + (i + 1) + "</span>" +
        (keys[i] ? miniVial(keys[i].replace(/\s+\S+$/, ""), keys[i].split(" ").pop()) + "<span class=\"fg-slot-lab\">" + esc(keys[i]) + "</span>" : "") +
        "<button type=\"button\" aria-label=\"" + esc(keys[i] ? (es() ? "Quitar " + keys[i] + " del kit" : "Remove " + keys[i] + " from kit") : (es() ? "Espacio vacío " + (i + 1) + " de " + size : "Empty slot " + (i + 1) + " of " + size)) + "\"></button>";
      const btn = slot.querySelector("button");
      if (keys[i]) btn.addEventListener("click", () => remOne(keys[i]));
      else btn.addEventListener("click", () => { const g = $("#fg-search"); if (g) g.scrollIntoView({ block: "start", behavior: reduce() ? "auto" : "smooth" }); });
      slot.addEventListener("dragover", (e) => { e.preventDefault(); slot.classList.add("is-over"); });
      slot.addEventListener("dragleave", () => slot.classList.remove("is-over"));
      slot.addEventListener("drop", (e) => { e.preventDefault(); slot.classList.remove("is-over"); const k = e.dataTransfer.getData("text/plain"); if (k) addKey(k, slot); });
      box.append(slot);
    }
    const more = $("#fg-more-n");
    if (more) { more.hidden = n <= size; more.textContent = n > size ? (es() ? "+" + (n - size) + " viales más en este kit · " + n + " en total" : "+" + (n - size) + " more vials in this kit · " + n + " total") : ""; }
    const note = $("#fg-ss-note");
    if (note) {
      note.textContent = ssInDraft()
        ? T2("SS-31 50mg is in your kit. It doesn't count toward kit discounts.", "SS-31 50mg está en tu kit. No cuenta para los descuentos del kit.")
        : T2("SS-31 50mg doesn't count toward kit discounts.", "SS-31 50mg no cuenta para los descuentos del kit.");
      note.hidden = !ssNoteOn();
    }
  }

  function priceHTML(k, d) {
    const p = (N.PRICE && N.PRICE[k]) != null ? N.PRICE[k] : d.p;
    const r = (N.NPRICE && N.NPRICE[k]) != null ? N.NPRICE[k] : p;
    if (N.VIPON && r > p) return "<s>" + money(r) + "</s> <b class=\"vipp\">" + money(p) + "</b>";
    return "<span>" + money(p) + "</span>";
  }
  const SHIELD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.6 4-1.3 7-5.2 7-9.6V6z"/><path d="m9 12 2 2 4-4"/></svg>';

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
    if (catBox) {
      catBox.replaceChildren();
      for (const c of cats) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "fg-cat"; b.textContent = c === "All" ? T2("All", "Todo") : ((N.SHORT && N.SHORT[c]) || c);
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
        if (!allowed(k)) continue;
        const st = stOf(k) || d.s;
        const ok = N.avail(st), soon = st === "soon", low = st === "low";
        const have = dq(k), full = ok && have >= cap(k);
        const cell = document.createElement("div");
        cell.className = "fg-cell";
        const el = document.createElement("button");
        el.type = "button";
        el.className = "fg-chip" + (!ok ? " is-oos" : "") + (soon ? " is-soon" : "") + (SS(k) ? " is-ss" : "") + (have ? " is-in" : "") + (full ? " is-full" : "");
        el.dataset.key = k;
        el.draggable = ok && !full && !reduce();
        const ssEx = ssNoteOn() && SS(k);
        let badge = "";
        if (ssEx) badge = "<span class=\"fg-badge\">" + T2("Doesn't count toward kit discounts", "No cuenta para los descuentos del kit") + "</span>";
        else if (soon) badge = "<span class=\"fg-badge fg-soon\">" + T2("Back soon", "Vuelve pronto") + "</span>";
        else if (!ok) badge = "<span class=\"fg-badge\">" + T2("Out of stock", "Agotado") + "</span>";
        else if (low) badge = "<span class=\"fg-badge fg-low\">" + T2("Low stock", "Pocas unidades") + "</span>";
        const inKit = have ? "<span class=\"fg-inkit\">×" + have + (full ? " · " + T2("max", "máx.") : "") + "</span>" : "";
        el.innerHTML = "<div class=\"fg-chip-t\"><b>" + esc(row.it.name) + "</b>" + priceHTML(k, d) + "</div>" +
          "<span class=\"fg-dose\">" + esc(d.dose) + inKit + "</span>" + badge;
        if (soon) {
          el.setAttribute("aria-label", T2("Back soon, get a restock alert for ", "Vuelve pronto, recibe un aviso para ") + k);
          el.setAttribute("aria-disabled", "true");
          if (N.openNotify) el.addEventListener("click", () => N.openNotify(k, row.it.name + " " + d.dose));
          else el.disabled = true;
        } else if (!ok) {
          el.setAttribute("aria-label", T2("Out of stock, ", "Agotado, ") + k);
          el.disabled = true;
        } else {
          el.setAttribute("aria-label", (full ? T2("Limit reached, ", "Límite alcanzado, ") : T2("Add ", "Agregar ")) + k + (have ? (es() ? ", " + have + " en el kit" : ", " + have + " in kit") : "") + (low ? T2(", low stock", ", pocas unidades") : "") + (ssEx ? T2(", doesn't count toward kit discounts", ", no cuenta para los descuentos del kit") : ""));
          if (full) el.setAttribute("aria-disabled", "true");
          el.addEventListener("click", () => addKey(k));
          el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", k); e.dataTransfer.effectAllowed = "copy"; });
        }
        cell.append(el);
        const cl = N.coaList ? N.coaList(d) : [];
        if (cl.length && N.openCoa) {
          const best = cl.find((c) => c.purity);
          const lb = document.createElement("button");
          lb.type = "button"; lb.className = "fg-lab";
          lb.innerHTML = SHIELD + "<span>" + T2("Lab-tested", "Probado en laboratorio") + "</span>";
          lb.setAttribute("aria-label", T2("View lab report for ", "Ver informe de laboratorio de ") + k + (best ? ", " + best.purity : ""));
          lb.addEventListener("click", (e) => { e.stopPropagation(); N.openCoa(row.it.name.replace(/\s+blend$/i, ""), cl.map((c) => ({ ...c, dz: String(d.dose).replace(/\s*vial$/i, "") })), 0); });
          cell.append(lb);
          cell.classList.add("has-lab");
        }
        host.append(cell);
      }
    };
    for (const row of main) if (match(row)) paintRow(row, grid);
    if (other.length) {
      const det = document.createElement("details");
      det.className = "fg-more";
      det.innerHTML = "<summary>" + T2("Other compounds", "Otros compuestos") + "</summary><div class=\"fg-grid\" id=\"fg-other\"></div>";
      const og = det.querySelector(".fg-grid");
      let n = 0;
      for (const row of other) if (match(row) || (cat === "All" && !q)) { paintRow(row, og); n++; }
      if (n) grid.append(det);
    }
  }

  /* Quick start, reforge and popular builds: shown only while the kit is empty. */
  function drawStart() {
    const box = $("#fg-start"); if (!box) return;
    const show = !draft.size;
    box.hidden = !show;
    if (!show) { box.replaceChildren(); return; }
    box.replaceChildren();
    const sec = (title, list, cls) => {
      if (!list.length) return;
      const w = document.createElement("div"); w.className = "fg-qs " + (cls || "");
      const h = document.createElement("h3"); h.textContent = title; w.append(h);
      const row = document.createElement("div"); row.className = "fg-qs-row";
      for (const p of list) {
        const b = document.createElement("button"); b.type = "button"; b.className = "fg-qs-b"; b.dataset.id = p.id;
        const n = countOf(p.m), kinds = p.m.size;
        const t = document.createElement("b"); t.textContent = p.name;
        const s = document.createElement("small"); s.textContent = (p.sub || "") || (n + T2(" vials · ", " viales · ") + kinds + (es() ? (kinds === 1 ? " compuesto" : " compuestos") : (kinds === 1 ? " compound" : " compounds")));
        const v = document.createElement("span"); v.className = "fg-qs-v"; v.textContent = [...p.m.keys()].map((k) => k.replace(/\s+blend\b/i, "")).join(" · ");
        b.append(t, s, v);
        b.setAttribute("aria-label", p.name + ", " + s.textContent + ": " + [...p.m].map(([k, q]) => q + "× " + k).join(", "));
        b.addEventListener("click", () => loadSet(p.m, p.note));
        row.append(b);
      }
      w.append(row); box.append(w);
    };
    const quick = presets();
    const lk = lastKit();
    if (lk) { const n = countOf(lk.m); quick.unshift({ id: "reforge", name: T2("Forge it again", "Forjar de nuevo"), sub: n + T2(" vials, rechecked against stock", " viales, revisados con el stock"), m: lk.m, note: lk.dropped }); }
    sec(T2("Quick start", "Inicio rápido"), quick, "fg-qs-quick");
    sec(T2("Popular builds", "Kits populares"), popular(), "fg-qs-pop");
    box.hidden = !box.childNodes.length;
  }
  function loadSet(m, dropped) {
    const c = clean([...m]);
    draft = c.m; saveDraft(); lsSet(AKEY, null);
    const gone = [...new Set([...(dropped || []), ...c.dropped])];
    flash = gone.length ? T2("Changed with stock: ", "Cambió por el stock: ") + gone.join(", ") : "";
    paint({ fromN: 0 });
  }

  /* ---------- case card: locked / sealed / added ---------- */
  function caseBtn(row, id, label, cls, fn) { const b = document.createElement("button"); b.type = "button"; b.id = id; if (cls) b.className = cls; b.textContent = label; b.addEventListener("click", fn); row.append(b); return b; }
  function drawCase(opts) {
    const box = $("#fg-case"); if (!box) return;
    const n = kitN(), need = needOf(n), added = lsGet(AKEY);
    box.className = "fg-case";
    box.replaceChildren();
    if (!draft.size && !added) { box.hidden = true; return; }
    box.hidden = false;
    if (!draft.size && added) {
      let a = null; try { a = JSON.parse(added); } catch (e) {}
      box.classList.add("is-added");
      const h = document.createElement("h3"); h.className = "fg-case-h"; h.textContent = T2(((a && a.tier) || "Your kit") + " is in your cart", ((a && a.tier) || "Tu kit") + " está en tu carrito");
      const p = document.createElement("p"); p.textContent = T2("Check out when you're ready, or forge another kit.", "Paga cuando quieras o forja otro kit.");
      const row = document.createElement("div"); row.className = "fg-case-a";
      caseBtn(row, "fg-case-go", T2("Checkout", "Pagar"), "fg-go", checkout);
      caseBtn(row, "fg-case-new", T2("Build another", "Armar otro"), "", () => { lsSet(AKEY, null); paint(); });
      box.append(h, p, row);
      return;
    }
    if (need || !n) {
      box.classList.add("is-locked");
      const top = document.createElement("div"); top.className = "fg-lock-t";
      top.innerHTML = '<svg class="fg-lock-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
      const h = document.createElement("h3"); h.className = "fg-case-h"; h.id = "fg-lock-h"; h.textContent = progressCopy(n); top.append(h);
      const pips = document.createElement("div"); pips.className = "fg-pips"; pips.setAttribute("aria-hidden", "true");
      const inStep = n % STEP;
      for (let i = 0; i < STEP; i++) { const e = document.createElement("i"); if (i < inStep) e.className = "on"; pips.append(e); }
      const p = document.createElement("p");
      p.id = "fg-lock-p";
      p.textContent = n < STEP
        ? T2("Kits seal at 5, 10, 15 or 20 vials. Until then the kit stays here and can't go to the cart.", "Los kits se sellan con 5, 10, 15 o 20 viales. Mientras tanto el kit se queda aquí y no pasa al carrito.")
        : T2("This kit has " + n + " vials. Seal it at " + stepOf(n) + ", or remove " + inStep + " to seal it at " + (n - inStep) + ".", "Este kit tiene " + n + " viales. Séllalo con " + stepOf(n) + " o quita " + inStep + " para sellarlo con " + (n - inStep) + ".");
      const row = document.createElement("div"); row.className = "fg-case-a";
      if (n) {
        const plan = completePlan();
        if (plan.ok) {
          const adds = [...plan.adds].map(([k, q]) => q + "× " + k).join(", ");
          const b = caseBtn(row, "fg-complete", T2("Complete my kit", "Completar mi kit"), "fg-go", () => applyComplete());
          b.title = adds;
          const s = document.createElement("small"); s.className = "fg-plan"; s.id = "fg-plan"; s.textContent = T2("Adds ", "Agrega ") + adds; box.append(top, pips, p, row, s);
        } else {
          const s = document.createElement("p"); s.className = "fg-plan is-short"; s.id = "fg-plan";
          s.textContent = T2("Not enough stock to reach " + stepOf(n) + " vials right now.", "Ahora mismo no hay stock suficiente para llegar a " + stepOf(n) + " viales.") + (plan.back ? T2(" Remove " + plan.back + " to seal at " + plan.down + ".", " Quita " + plan.back + " para sellar con " + plan.down + ".") : "");
          box.append(top, pips, p, s, row);
        }
      } else box.append(top, pips, p, row);
      if (flash) { const f = document.createElement("small"); f.className = "fg-flashmsg"; f.textContent = flash; box.append(f); }
      return;
    }
    /* sealed */
    const T = kitTotals();
    const pct = T.pct || pctAt(n, T.sub);
    box.classList.add("is-sealed");
    if (n >= 20) box.classList.add("fg-apex");
    const seal = document.createElement("div"); seal.className = "fg-seal" + (opts && opts.stamp && !reduce() ? " is-stamp" : ""); seal.innerHTML = NIMG(64, 75) + "<i class=\"fg-seal-ring\"></i>";
    const tx = document.createElement("div"); tx.className = "fg-seal-t";
    const sm = document.createElement("small"); sm.textContent = T2("Kit sealed", "Kit sellado");
    const h = document.createElement("h3"); h.className = "fg-case-h"; h.id = "fg-case-h"; h.textContent = nameOf(n) + (n > 20 ? " · " + n : "");
    const p = document.createElement("p"); p.id = "fg-seal-line"; p.textContent = sealLine(n) + (pct ? (es() ? " " + pct + "% de descuento." : " " + pct + "% off.") : "");
    tx.append(sm, h, p);
    const top = document.createElement("div"); top.className = "fg-seal-row"; top.append(seal, tx);
    const row = document.createElement("div"); row.className = "fg-case-a";
    caseBtn(row, "fg-case-add", T2("Add kit to cart", "Agregar kit al carrito"), "fg-go", () => addKitToCart());
    caseBtn(row, "fg-case-share", T2("Share my kit", "Compartir mi kit"), "", share);
    caseBtn(row, "fg-case-card", T2("Name your kit", "Nombra tu kit"), "", () => openCard());
    const msg = document.createElement("p"); msg.className = "fg-case-msg"; msg.id = "fg-case-msg"; msg.setAttribute("role", "status");
    if (flash) msg.textContent = flash;
    box.append(top, row, msg);
  }

  function tween(from, to, el, ms) {
    cancelAnimationFrame(el.__raf || 0);
    if (reduce() || Math.abs(to - from) < 0.005) { el.textContent = money(to); return; }
    const t0 = performance.now(), d = ms || 420;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / d);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = money(from + (to - from) * e);
      if (t < 1) el.__raf = requestAnimationFrame(step);
    };
    el.__raf = requestAnimationFrame(step);
  }

  function paintMeters() {
    const T = kitTotals();
    const totEl = $("#fg-total"), savEl = $("#fg-save");
    const save = Math.round((T.vip + T.deal + T.disc + T.ref + T.so) * 100) / 100;
    tween(od.shownT, T.after, totEl);
    tween(od.shownS, save, savEl);
    od.shownT = T.after; od.shownS = save;
    const ss = $("#fg-save-s"); if (ss) ss.textContent = T2("vs regular prices", "vs. precio regular");
    totEl.setAttribute("aria-label", T2("Kit total ", "Total del kit ") + money(T.after));
    savEl.setAttribute("aria-label", T2("You save ", "Ahorras ") + money(save) + T2(" vs regular prices", " vs. precio regular"));
    const n = kitN();
    const pct = Math.max(0, Math.min(100, (Math.min(n, 20) / 20) * 100));
    const bar = $("#fg-molten-i"), wrap = $("#fg-molten"), lab = $("#fg-prog"), unl = $("#fg-unl");
    if (bar) bar.style.width = pct + "%";
    if (wrap) { wrap.classList.toggle("is-sealed", isSealed(n)); wrap.classList.toggle("fg-apex", isSealed(n) && n >= 20); wrap.setAttribute("aria-valuenow", String(Math.min(n, 20))); wrap.setAttribute("aria-valuetext", n + T2(" vials. ", " viales. ") + progressCopy(n)); wrap.setAttribute("aria-label", T2("Kit progress", "Progreso del kit")); }
    if (lab) lab.textContent = isSealed(n) || !n ? progressCopy(n) : (es() ? n + " de " + stepOf(n) + " viales · " + nameOf(Math.min(stepOf(n), 20)) : n + " of " + stepOf(n) + " vials · " + nameOf(Math.min(stepOf(n), 20)));
    if (unl) unl.textContent = n ? unlockCopy(n) : (pctAt(5, T.sub || 1) ? T2("5 vials unlock " + pctAt(5, T.sub || 1) + "% off", "Con 5 viales: " + pctAt(5, T.sub || 1) + "% de descuento") : "");
    const need = needOf(n), sealed = isSealed(n), added = !draft.size && !!lsGet(AKEY);
    const share = $("#fg-share"), add = $("#fg-add"), clr = $("#fg-clear");
    if (share) share.disabled = !draft.size;
    if (clr) clr.disabled = !draft.size;
    if (add) {
      add.textContent = sealed ? T2("Add kit to cart", "Agregar kit al carrito") : (n ? T2("Add " + need + " more to seal", "Agrega " + need + " más para sellar") : T2("Add 5 vials to seal", "Agrega 5 viales para sellar"));
      add.classList.toggle("is-locked", !sealed);
      add.setAttribute("aria-disabled", String(!sealed));
    }
    /* sticky summary (phones) */
    const dock = $("#fg-dock");
    if (dock) {
      const on = !!draft.size || added;
      dock.hidden = !on;
      document.body.classList.toggle("fg-dock-on", on && document.body.dataset.nxv === "forge");
      if (on) {
        const size = added ? 0 : stepOf(n) || STEP;
        $("#fg-dock-n").textContent = added ? T2("Kit in cart", "Kit en el carrito") : (n + " / " + size + " · " + nameOf(Math.min(size, 20)));
        $("#fg-dock-p").textContent = added ? "" : money(T.after) + (save ? T2(" · save ", " · ahorras ") + money(save) : "");
        $("#fg-dock-i").style.transform = "scaleX(" + (added ? 1 : (sealed ? 1 : (n % STEP) / STEP)) + ")";
        dock.classList.toggle("is-sealed", sealed || added);
        dock.classList.toggle("fg-apex", sealed && n >= 20);
        const go = $("#fg-dock-go");
        go.textContent = added ? T2("Checkout", "Pagar") : sealed ? T2("Add kit to cart", "Agregar kit al carrito") : T2("Add " + need + " more", "Agrega " + need + " más");
        go.classList.toggle("is-locked", !sealed && !added);
      }
    }
  }

  function sealMoment(n) {
    if (!reduce()) {
      const w = $("#fg-tray-wrap"); if (w) { w.classList.remove("is-glow"); void w.offsetWidth; w.classList.add("is-glow"); setTimeout(() => w.classList.remove("is-glow"), 1100); }
      if (embers && embers.burst) embers.burst();
    }
    buzz(n >= 20 ? [18, 40, 28] : [16]);
  }

  function paint(opts) {
    if (!N || !booted) return;
    const n = kitN();
    const sealedNow = isSealed(n) && n !== lastSealed && typeof opts?.fromN === "number" && opts.fromN !== n;
    drawStatic();
    drawTiers();
    drawTray();
    drawStart();
    drawCase({ stamp: sealedNow });
    if (!opts || !opts.skipGrid) drawGrid();
    paintMeters();
    if (opts && opts.dropped) {
      const slots = $$(".fg-slot.is-filled", root);
      const slot = opts.slotEl && opts.slotEl.isConnected ? opts.slotEl : slots[slots.length - 1];
      if (slot && !reduce()) { slot.classList.add("is-ignite", "is-drop"); setTimeout(() => slot.classList.remove("is-ignite", "is-drop"), 600); }
    }
    if (sealedNow) sealMoment(n);
    lastSealed = isSealed(n) ? n : 0;
    lastN = n;
    flash = opts && opts.keepFlash ? flash : "";
  }

  /* ---------- actions ---------- */
  function addKey(k, slotEl) {
    if (!N || !k || !okStock(k)) return false;
    const have = dq(k);
    if (have >= cap(k)) { if (N.capMsg) N.capMsg(k); return false; }
    draft.set(k, have + 1); saveDraft(); lsSet(AKEY, null);
    if (!reduce()) buzz(10);
    paint({ dropped: countsForKit(k), slotEl, fromN: lastN });
    return true;
  }
  function remOne(k) {
    if (!draft.has(k)) return;
    const q = dq(k);
    if (q <= 1) draft.delete(k); else draft.set(k, q - 1);
    saveDraft(); paint({ fromN: lastN });
  }
  function clearKit() { draft.clear(); saveDraft(); lastSealed = 0; paint(); }
  function applyComplete() {
    const plan = completePlan();
    if (!plan.ok || !plan.need) return false;
    for (const [k, q] of plan.adds) draft.set(k, dq(k) + q);
    saveDraft(); lsSet(AKEY, null);
    paint({ fromN: lastN, dropped: true });
    return true;
  }
  function pulseLock() {
    const c = $("#fg-case"); if (!c) return;
    if (!reduce()) { c.classList.remove("is-nudge"); void c.offsetWidth; c.classList.add("is-nudge"); }
    try { c.scrollIntoView({ block: "center", behavior: reduce() ? "auto" : "smooth" }); } catch (e) {}
  }
  /* The only way a Forge kit reaches the cart. Sealed kits only; re-checks stock and caps against what is already in the cart. */
  function addKitToCart() {
    loadDraft();
    const n = kitN();
    if (!isSealed(n)) { paint({ skipGrid: true }); pulseLock(); return false; }
    for (const [k, q] of draft) {
      if (!okStock(k)) { flash = T2(k + " is no longer in stock.", k + " ya no está en stock."); paint({ keepFlash: true }); return false; }
      const cur = N.picks.has(k) ? N.qty(k) : 0;
      if (cur + q > cap(k)) { flash = T2("Your cart already has " + cur + "× " + k + ". With this kit it would pass the limit of " + cap(k) + ". Adjust the cart or the kit first.", "Tu carrito ya tiene " + cur + "× " + k + ". Con este kit superaría el límite de " + cap(k) + ". Ajusta el carrito o el kit primero."); paint({ skipGrid: true, keepFlash: true }); return false; }
    }
    let rec = null; try { rec = JSON.parse(lsGet(N.fgk ? N.fgk.KEY : "novrix-forge-cart") || "null"); } catch (e) {}
    const items = rec && rec.items && typeof rec.items === "object" && !Array.isArray(rec.items) ? rec.items : {};
    for (const [k, q] of draft) {
      const cur = N.picks.has(k) ? N.qty(k) : 0;
      N.picks.set(k, stOf(k)); N.QTY[k] = cur + q;
      items[k] = (Math.floor(Number(items[k])) || 0) + q;
    }
    lsSet("novrix-forge-cart", JSON.stringify({ items, at: new Date().toISOString().slice(0, 10) }));
    lsSet(LKEY, JSON.stringify({ items: [...draft], n }));
    lsSet(AKEY, JSON.stringify({ tier: nameOf(n), n }));
    draft.clear(); saveDraft();
    N.savePicks(); if (N.draw) N.draw(); N.tray();
    lastSealed = 0; paint();
    const c = $("#fg-case"); if (c) { try { c.scrollIntoView({ block: "nearest" }); } catch (e) {} }
    return true;
  }

  async function share(e) {
    if (!draft.size) return;
    const url = shareURL();
    const title = "THE FORGE · Novrix Labs";
    const text = T2("Build a Kit at Novrix Labs. Research use only.", "Arma tu kit en Novrix Labs. Solo para investigación.");
    try {
      if (navigator.share) { await navigator.share({ title, text, url }); return; }
    } catch (x) { if (x && x.name === "AbortError") return; }
    const b = e && e.currentTarget ? e.currentTarget : $("#fg-share");
    try {
      await navigator.clipboard.writeText(url);
      if (b) { const t = b.textContent; b.textContent = T2("Link copied", "Enlace copiado"); setTimeout(() => { if (b.isConnected) b.textContent = t; }, 1800); }
    } catch (x) {
      prompt(T2("Copy this kit link:", "Copia este enlace del kit:"), url);
    }
  }
  function checkout() {
    const btn = document.getElementById("tray-order");
    if (btn) btn.click();
  }

  /* ---------- kit card (PNG, built on demand; no prices) ---------- */
  let card = null;
  function openCard() {
    const n = kitN();
    if (!isSealed(n)) { pulseLock(); return; }
    if (card) card.remove();
    card = document.createElement("div");
    card.className = "fg-card-ov"; card.id = "fg-card";
    card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "true"); card.setAttribute("aria-labelledby", "fg-card-h");
    card.innerHTML = '<div class="fg-card"><div class="fg-card-top"><h3 id="fg-card-h"></h3><button type="button" class="fg-card-x" id="fg-card-x"></button></div>' +
      '<label class="fg-card-l" for="fg-card-name"></label><input id="fg-card-name" class="fg-card-in" type="text" maxlength="24" autocomplete="off" spellcheck="false">' +
      '<p class="fg-card-e" id="fg-card-e" role="status"></p><div class="fg-card-pv"><img id="fg-card-img" alt="" width="1080" height="1350"></div>' +
      '<p class="fg-card-n" id="fg-card-n"></p><div class="fg-card-a"><button type="button" class="fg-go" id="fg-card-share"></button><button type="button" id="fg-card-dl"></button></div></div>';
    document.body.append(card);
    $("#fg-card-h", card).textContent = T2("Name your kit", "Nombra tu kit");
    $("#fg-card-x", card).textContent = "×"; $("#fg-card-x", card).setAttribute("aria-label", T2("Close", "Cerrar"));
    $(".fg-card-l", card).textContent = T2("Kit name (optional, up to 24 characters)", "Nombre del kit (opcional, hasta 24 caracteres)");
    $("#fg-card-n", card).textContent = T2("No prices on the card. The name stays on this device and is never added to your order.", "La tarjeta no muestra precios. El nombre se queda en este dispositivo y nunca se agrega a tu pedido.");
    $("#fg-card-share", card).textContent = T2("Share card", "Compartir tarjeta");
    $("#fg-card-dl", card).textContent = T2("Download PNG", "Descargar PNG");
    const inp = $("#fg-card-name", card);
    inp.placeholder = nameOf(n);
    inp.value = cleanName(lsGet(NKEY) || "");
    let t = 0;
    const redraw = () => { clearTimeout(t); t = setTimeout(() => renderCard(), 160); };
    inp.addEventListener("input", redraw);
    const close = () => { if (card) { card.remove(); card = null; } document.removeEventListener("keydown", onKey); const b = $("#fg-case-card"); if (b) b.focus(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    $("#fg-card-x", card).addEventListener("click", close);
    card.addEventListener("click", (e) => { if (e.target === card) close(); });
    $("#fg-card-share", card).addEventListener("click", () => shareCard(false));
    $("#fg-card-dl", card).addEventListener("click", () => shareCard(true));
    renderCard();
    setTimeout(() => inp.focus({ preventScroll: true }), 30);
  }
  function cardName() {
    const inp = card && $("#fg-card-name", card);
    const v = cleanName(inp ? inp.value : "");
    const err = card && $("#fg-card-e", card);
    if (v && !nameOk(v)) { if (err) err.textContent = T2("Please use a neutral name, like a nickname or a date.", "Usa un nombre neutral, como un apodo o una fecha."); return { name: "", bad: true }; }
    if (err) err.textContent = "";
    lsSet(NKEY, v || null);
    return { name: v, bad: false };
  }
  function cardLink() { const c = myCode(); return c ? "novrixlabs.shop/?ref=" + c : "novrixlabs.shop/#forge"; }
  let cardImg = null;
  const loadN = () => cardImg || (cardImg = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = "assets/forge-n.webp"; }));
  /* Card fonts (subset woff2, ~48 KB total) load only when the card is opened. */
  let cardFonts = null;
  function loadCardFonts() {
    if (cardFonts) return cardFonts;
    const F = [["NxCardNeon", "card-monoton.woff2"], ["NxCardScript", "card-kaushan.woff2"], ["NxCardMono", "card-spacemono-b.woff2"]];
    cardFonts = Promise.all(F.map(([fam, file]) => { try { const f = new FontFace(fam, "url(assets/fonts/" + file + ")"); return f.load().then((x) => { document.fonts.add(x); }).catch(() => {}); } catch (e) { return Promise.resolve(); } }));
    return cardFonts;
  }
  const vialParts = (k) => { const e = catalog().byKey.get(k); const nm = e ? e.it.name.replace(/\s+blend$/i, "") : k.replace(/\s+\S+$/, ""); const dose = e ? String(e.d.dose).replace(/\s*vial$/i, "") : k.split(" ").pop(); return { nm, dose, lab: !!(e && N.coaList && N.coaList(e.d).length) }; };
  function rr2(x, X, Y, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); }
  function chamfer(x, X, Y, w, h, c) { x.beginPath(); x.moveTo(X + c, Y); x.lineTo(X + w - c, Y); x.lineTo(X + w, Y + c); x.lineTo(X + w, Y + h - c); x.lineTo(X + w - c, Y + h); x.lineTo(X + c, Y + h); x.lineTo(X, Y + h - c); x.lineTo(X, Y + c); x.closePath(); }
  function fitFont(x, text, fam, max, min, w) { let s = max; x.font = fam.replace("%", s); while (x.measureText(text).width > w && s > min) { s -= 2; x.font = fam.replace("%", s); } return s; }
  function clip(x, t, w) { if (x.measureText(t).width <= w) return t; while (t.length > 2 && x.measureText(t + "…").width > w) t = t.slice(0, -1); return t + "…"; }
  /* Kit spec card, after marketing's mockups: chrome NOVRIX wordmark, neon-framed panel, FORGE in neon, script kit name, chrome N, tier badge,
     sealed vials (rows) or the slot case (grid), share link, footer. Purple neon fill instead of a helix. No prices. Apex = gold. */
  async function drawCard() {
    const n = kitN(), gold = n >= 20, { name } = cardName();
    const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    try { await Promise.race([Promise.all([loadCardFonts(), document.fonts && document.fonts.ready]), new Promise((r) => setTimeout(r, 1500))]); } catch (e) {}
    const A = gold ? "#e6bc60" : "#c482ff", PK = gold ? "#ffecb4" : "#ee7dff", WH = "#f4f2fa", GR = gold ? "#c8b882" : "#beb8d2", DIM = "#968caf";
    const GLOW = gold ? "rgba(214,160,40,.9)" : "rgba(170,80,255,.9)";
    const MONO = '700 %px NxCardMono, ui-monospace, Menlo, Consolas, monospace', BODY = '650 %px Inter, Arial, sans-serif';
    const glowText = (t, X, Y, font, color, blur) => { x.save(); x.font = font; x.shadowColor = GLOW; x.shadowBlur = blur; x.fillStyle = color; x.fillText(t, X, Y); x.shadowBlur = blur / 2; x.fillText(t, X, Y); x.restore(); x.font = font; x.fillStyle = color; x.fillText(t, X, Y); };
    // background: deep black + purple (or gold) neon fill
    x.fillStyle = "#050308"; x.fillRect(0, 0, W, H);
    const blob = (X, Y, R, col) => { const g = x.createRadialGradient(X, Y, 0, X, Y, R); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H); };
    const tint = gold ? [214, 160, 40] : [155, 70, 255];
    const rgba = (a) => "rgba(" + tint.join(",") + "," + a + ")";
    blob(W * 0.5, 110, 560, rgba(0.30)); blob(W + 40, H * 0.42, 520, rgba(0.42)); blob(-60, H * 0.62, 420, rgba(0.30)); blob(W * 0.5, H + 80, 640, rgba(0.32));
    x.save(); x.globalCompositeOperation = "lighter"; x.lineCap = "round";
    for (let i = 0; i < 9; i++) { const y0 = 230 + i * 120; x.strokeStyle = rgba(0.05 + (i % 3) * 0.02); x.lineWidth = 2 + (i % 2) * 2; x.beginPath(); x.moveTo(W - 230 + (i % 4) * 30, y0); x.quadraticCurveTo(W - 40, y0 + 60, W + 20, y0 + 150); x.stroke(); x.beginPath(); x.moveTo(20, y0 + 40); x.quadraticCurveTo(-30, y0 + 90, 70 - (i % 3) * 20, y0 + 180); x.stroke(); }
    x.restore();
    // chrome NOVRIX wordmark
    x.textAlign = "center"; x.textBaseline = "alphabetic";
    const ws = fitFont(x, "NOVRIX", "400 %px Michroma, Arial, sans-serif", 150, 80, 900);
    let g = x.createLinearGradient(0, 70, 0, 70 + ws); g.addColorStop(0, "#ffffff"); g.addColorStop(0.45, "#c9cad6"); g.addColorStop(0.55, "#7d7f90"); g.addColorStop(1, "#e6e7ee");
    x.save(); x.shadowColor = GLOW; x.shadowBlur = 34; x.fillStyle = g; x.fillText("NOVRIX", W / 2, 80 + ws * 0.86); x.restore();
    x.fillStyle = g; x.fillText("NOVRIX", W / 2, 80 + ws * 0.86);
    // neon-framed panel
    const PX = 62, PY = 262, PW = W - 124, PH = 913;
    x.save(); chamfer(x, PX, PY, PW, PH, 26); x.fillStyle = gold ? "rgba(12,8,2,.80)" : "rgba(6,3,12,.80)"; x.fill();
    x.shadowColor = GLOW; x.shadowBlur = 26; x.strokeStyle = A; x.lineWidth = 3; x.stroke(); x.shadowBlur = 0; x.strokeStyle = gold ? "rgba(255,236,180,.55)" : "rgba(238,200,255,.5)"; x.lineWidth = 1; x.stroke(); x.restore();
    const x0 = 106, xr = W - 106;
    x.textAlign = "left";
    x.font = MONO.replace("%", 22); x.fillStyle = A; x.fillText(es() ? "THE FORGE  ·  FICHA DEL KIT" : "THE FORGE  ·  KIT SPEC", x0, 312);
    glowText("FORGE", x0, 408, '400 84px NxCardNeon, Michroma, Arial, sans-serif', gold ? "#fff6dc" : "#fceeff", 22);
    // chrome N
    const img = await loadN();
    if (img) { x.save(); x.shadowColor = GLOW; x.shadowBlur = 38; x.drawImage(img, xr - 150, 300, 146, 170); x.restore(); }
    // kit name in script
    const title = name || (es() ? nameOf(n).replace(/^(\w+) Kit$/, "Kit $1") : nameOf(n));
    const ts = fitFont(x, title, '400 %px NxCardScript, "Exo 2", Georgia, serif', 78, 40, xr - 190 - x0);
    glowText(title, x0, 500 + ts * 0.25, '400 ' + ts + 'px NxCardScript, "Exo 2", Georgia, serif', WH, 14);
    // tier badge + sealed count
    const tier = (n >= 20 ? "APEX" : ({ 5: "CORE", 10: "ELITE", 15: "TITAN" }[n] || "CORE"));
    x.font = MONO.replace("%", 22); const bw = x.measureText(tier).width + 36;
    rr2(x, x0, 556, bw, 44, 12); x.fillStyle = gold ? "#322208" : "#280a37"; x.fill(); x.strokeStyle = PK; x.lineWidth = 2; x.stroke();
    x.fillStyle = gold ? PK : WH; x.textBaseline = "middle"; x.fillText(tier, x0 + 18, 579);
    x.font = BODY.replace("%", 28); x.fillStyle = WH; x.fillText(es() ? n + " VIALES SELLADOS" : n + " VIALS SEALED", x0 + bw + 20, 579);
    x.textBaseline = "alphabetic";
    // vials
    const rows = [...draft].filter(([k]) => countsForKit(k) || true);
    let y = 650;
    if (rows.length <= 5) {
      x.font = MONO.replace("%", 18); x.fillStyle = A; x.fillText(es() ? "VIALES SELLADOS" : "SEALED VIALS", x0, y); y += 18;
      for (const [k, q] of rows) {
        const v = vialParts(k);
        rr2(x, x0, y, xr - x0, 58, 12); x.fillStyle = gold ? "rgba(40,28,6,.75)" : "rgba(36,12,52,.72)"; x.fill(); x.strokeStyle = gold ? "rgba(230,188,96,.45)" : "rgba(196,130,255,.42)"; x.lineWidth = 1.5; x.stroke();
        x.textBaseline = "middle";
        let labW = 0;
        if (v.lab) { x.font = MONO.replace("%", 15); const lt = es() ? "PROBADO EN LABORATORIO" : "LAB-TESTED"; labW = x.measureText(lt).width + 24; rr2(x, xr - 16 - labW, y + 15, labW, 28, 7); x.strokeStyle = PK; x.lineWidth = 1.5; x.stroke(); x.fillStyle = PK; x.fillText(lt, xr - 16 - labW + 12, y + 30); }
        const room = xr - x0 - 36 - (labW ? labW + 20 : 0);
        x.font = BODY.replace("%", 28); const qt = q > 1 ? q + "×  " : ""; const nm = clip(x, qt + v.nm, room * 0.7); x.fillStyle = WH; x.fillText(nm, x0 + 18, y + 30);
        const nw = x.measureText(nm).width; x.font = MONO.replace("%", 20); x.fillStyle = GR; x.fillText(clip(x, v.dose, room - nw - 16), x0 + 18 + nw + 16, y + 31);
        x.textBaseline = "alphabetic";
        y += 68;
      }
    } else {
      const keys = kitKeys(), show = keys.slice(0, 20), size = Math.min(20, Math.max(5, Math.ceil(keys.length / 5) * 5));
      x.font = MONO.replace("%", 18); x.fillStyle = A; x.fillText(es() ? size + " ESPACIOS" : size + " SLOTS", x0, y); y += 18;
      const cols = 5, gap = 10, sw = (xr - x0 - gap * (cols - 1)) / cols, sh = 72;
      for (let i = 0; i < size; i++) {
        const cx = x0 + (i % cols) * (sw + gap), cy = y + Math.floor(i / cols) * (sh + gap);
        rr2(x, cx, cy, sw, sh, 10); x.fillStyle = gold ? "rgba(40,28,6,.8)" : "rgba(36,12,52,.75)"; x.fill(); x.strokeStyle = gold ? "rgba(230,188,96,.55)" : "rgba(196,130,255,.5)"; x.lineWidth = 1.5; x.stroke();
        x.textAlign = "center";
        if (i === 19 && keys.length > 20) { x.font = BODY.replace("%", 24); x.fillStyle = gold ? PK : WH; x.fillText("+" + (keys.length - 19), cx + sw / 2, cy + 44); }
        else if (show[i]) { const v = vialParts(show[i]); x.font = BODY.replace("%", 20); x.fillStyle = gold ? PK : WH; x.fillText(clip(x, v.nm, sw - 14), cx + sw / 2, cy + 32); x.font = MONO.replace("%", 15); x.fillStyle = gold ? A : GR; x.fillText(clip(x, v.dose, sw - 14), cx + sw / 2, cy + 56); }
        x.textAlign = "left";
      }
      y += Math.ceil(size / cols) * (sh + gap) + 6;
    }
    // share link
    y = Math.max(y + 28, 1000);
    x.font = MONO.replace("%", 18); x.fillStyle = A; x.fillText(es() ? "COMPARTE ESTE KIT" : "SHARE THIS KIT", x0, y); y += 16;
    rr2(x, x0, y, xr - x0, 74, 14); x.fillStyle = gold ? "rgba(50,34,8,.85)" : "rgba(40,10,55,.85)"; x.fill(); x.strokeStyle = PK; x.lineWidth = 2; x.stroke();
    x.textAlign = "center"; x.textBaseline = "middle"; x.font = MONO.replace("%", 30); x.fillStyle = gold ? PK : WH; x.fillText(clip(x, cardLink(), xr - x0 - 40), W / 2, y + 38);
    x.textAlign = "left"; x.textBaseline = "alphabetic";
    x.font = MONO.replace("%", 15); x.fillStyle = DIM; x.fillText(es() ? "Esta tarjeta no muestra precios" : "No prices on this card", x0, y + 100);
    // footer bar
    rr2(x, 42, 1198, W - 84, 124, 14); x.fillStyle = "rgba(5,3,10,.92)"; x.fill(); x.strokeStyle = gold ? "rgba(230,188,96,.25)" : "rgba(196,130,255,.22)"; x.lineWidth = 1; x.stroke();
    x.font = "400 30px Michroma, Arial, sans-serif"; x.fillStyle = WH; x.fillText("NOVRIX LABS", 80, 1250);
    x.font = MONO.replace("%", 20); x.fillStyle = A; x.fillText("novrixlabs.shop", 82, 1290);
    x.textAlign = "right"; x.font = "500 22px Inter, Arial, sans-serif"; x.fillStyle = GR;
    x.fillText(es() ? "Novrix Labs · Solo investigación · 21+, EE. UU." : "Novrix Labs · Research use only · 21+, US", 1000, 1268);
    x.textAlign = "left";
    return c;
  }
  let lastBlob = null;
  async function renderCard() {
    if (!card) return;
    const c = await drawCard();
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    if (!card || !blob) return;
    lastBlob = blob;
    const im = $("#fg-card-img", card);
    if (im) { if (im.dataset.url) URL.revokeObjectURL(im.dataset.url); const u = URL.createObjectURL(blob); im.dataset.url = u; im.src = u; im.alt = T2("Kit card preview", "Vista previa de la tarjeta del kit"); }
  }
  async function shareCard(download) {
    if (!card) return;
    if (cardName().bad) return;
    await renderCard();
    const blob = lastBlob; if (!blob) return;
    const fname = "novrix-forge-kit.png";
    if (!download) {
      try {
        const file = new File([blob], fname, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) { await navigator.share({ files: [file], title: "THE FORGE · Novrix Labs", text: "https://" + cardLink() }); return; }
      } catch (e) { if (e && e.name === "AbortError") return; }
    }
    const a = document.createElement("a"); const u = URL.createObjectURL(blob);
    a.href = u; a.download = fname; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
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

  function bind() {
    $("#fg-search").addEventListener("input", (e) => { search = e.target.value; drawGrid(); });
    $("#fg-share").addEventListener("click", share);
    $("#fg-add").addEventListener("click", () => addKitToCart());
    $("#fg-clear").addEventListener("click", clearKit);
    $("#fg-dock-go").addEventListener("click", () => {
      const n = kitN();
      if (!draft.size && lsGet(AKEY)) return checkout();
      if (isSealed(n)) return addKitToCart();
      const g = $("#fg-search"); if (g) g.scrollIntoView({ block: "start", behavior: reduce() ? "auto" : "smooth" });
    });
    $("#fg-tray-wrap").addEventListener("dragover", (e) => e.preventDefault());
    $("#fg-tray-wrap").addEventListener("drop", (e) => { e.preventDefault(); const k = e.dataTransfer.getData("text/plain"); if (k) addKey(k); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && intro.state.playing) skipIntro();
    });
    if (N.hookTray) N.hookTray(() => { if (document.body.dataset.nxv === "forge") paint({ skipGrid: true }); });
    /* Back/forward cache, other tabs, or edits to storage: always re-read and re-validate the draft. */
    addEventListener("pageshow", (e) => { if (e.persisted) { loadDraft(); paint(); } });
    addEventListener("storage", (e) => { if (!e.key || e.key === DKEY || e.key === AKEY || e.key === "novrix-qty" || e.key === "novrix-picks") { loadDraft(); paint(); } });
  }

  function vis(on) {
    if (on) { if (embers) embers.start(); }
    else { if (embers) embers.stop(); }
    document.body.classList.toggle("fg-dock-on", !!(on && booted && (draft.size || lsGet(AKEY))));
  }

  const INTRO_KEY = "novrix-forge-intro";
  const intro = { state: { playing: false, done: true, timers: [], raf: 0, el: null } };
  const introSeen = () => { try { return sessionStorage.getItem(INTRO_KEY) === "1"; } catch (e) { return false; } };
  const markIntroSeen = () => { try { sessionStorage.setItem(INTRO_KEY, "1"); } catch (e) {} };
  function clearIntroTimers() {
    intro.state.timers.forEach((id) => clearTimeout(id));
    intro.state.timers = [];
    if (intro.state.raf) { cancelAnimationFrame(intro.state.raf); intro.state.raf = 0; }
  }
  function endIntro(instant) {
    clearIntroTimers();
    intro.state.playing = false;
    intro.state.done = true;
    markIntroSeen();
    const el = intro.state.el;
    const finish = () => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      intro.state.el = null;
      root.classList.remove("fg-await-intro");
      root.classList.add("fg-rise");
      document.body.classList.remove("fg-intro-on");
    };
    if (!el) { finish(); return; }
    if (instant || reduce()) { finish(); return; }
    el.classList.add("is-out");
    intro.state.timers.push(setTimeout(finish, 360));
  }
  function skipIntro() { if (intro.state.playing || (intro.state.el && !intro.state.done)) endIntro(true); }
  function runSparks(canvas, ms) {
    if (!canvas || reduce()) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    const fit = () => {
      const dpr = Math.min(1.25, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      return dpr;
    };
    const dpr = fit();
    const w = canvas.width, h = canvas.height, cy = h / 2;
    const parts = [];
    for (let i = 0; i < 64; i++) {
      const up = Math.random() < 0.5 ? -1 : 1;
      parts.push({
        x: w * (0.08 + Math.random() * 0.84),
        y: cy + (Math.random() - 0.5) * 6 * dpr,
        vx: (Math.random() - 0.5) * 1.8 * dpr,
        vy: up * (0.8 + Math.random() * 3.4) * dpr,
        life: 18 + Math.random() * 22,
        age: 0,
        s: (0.6 + Math.random() * 1.8) * dpr,
        c: Math.random() < 0.4 ? "255,180,90" : "200,160,255"
      });
    }
    const t0 = performance.now();
    const tick = (now) => {
      if (!intro.state.playing) return;
      ctx.clearRect(0, 0, w, h);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.age++; p.x += p.vx; p.y += p.vy; p.vy += 0.03 * dpr;
        const a = Math.max(0, 1 - p.age / p.life);
        if (a <= 0) { parts.splice(i, 1); continue; }
        ctx.beginPath(); ctx.fillStyle = "rgba(" + p.c + "," + (a * 0.85) + ")";
        ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
      }
      if (now - t0 < ms && parts.length) intro.state.raf = requestAnimationFrame(tick);
    };
    intro.state.raf = requestAnimationFrame(tick);
  }
  function playIntro() {
    if (window.__FG_SKIP_INTRO) { root.classList.add("fg-rise"); intro.state.done = true; return; }
    let hash = "";
    try { hash = decodeURIComponent((location.hash || "").slice(1)); } catch (e) { hash = (location.hash || "").slice(1); }
    const restore = hash.startsWith("forge=");
    const short = introSeen() || restore;
    const reduced = reduce();
    const title = es() ? "LA FORJA" : "THE FORGE";
    const tag = es() ? "ARMA TU KIT" : "BUILD A KIT";
    const letters = [...title].map((ch) => "<span>" + (ch === " " ? "&nbsp;" : esc(ch)) + "</span>").join("");
    const el = document.createElement("div");
    el.id = "fg-intro";
    el.className = "fg-intro";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", title);
    el.innerHTML = '<div class="fg-in-glow"></div><div class="fg-in-doors"><div class="fg-in-door fg-in-door-t"></div><div class="fg-in-door fg-in-door-b"></div></div>' +
      '<div class="fg-in-seam"></div><canvas class="fg-in-sparks" id="fg-in-sparks" aria-hidden="true"></canvas>' +
      '<div class="fg-in-stage"><div class="fg-in-mark"><i class="fg-in-shock"></i><img src="assets/forge-n.webp" width="137" height="160" alt="">' +
      '<i class="fg-in-sweep"></i></div><div class="fg-in-title">' + letters + '</div><p class="fg-in-tag">' + esc(tag) + '</p></div>' +
      '<button type="button" class="fg-in-skip" id="fg-in-skip">' + (es() ? "Saltar" : "Skip") + '</button>';
    document.body.append(el);
    document.body.classList.add("fg-intro-on");
    intro.state.el = el;
    intro.state.playing = true;
    intro.state.done = false;
    const goEnd = (instant) => endIntro(instant);
    const onSkip = (e) => { e.preventDefault(); goEnd(true); };
    el.addEventListener("click", onSkip);
    el.addEventListener("touchstart", onSkip, { passive: false });
    $("#fg-in-skip", el).addEventListener("click", (e) => { e.stopPropagation(); goEnd(true); });
    if (reduced) {
      root.classList.remove("fg-await-intro");
      root.classList.add("fg-rise");
      el.classList.add("is-out");
      intro.state.timers.push(setTimeout(() => goEnd(true), 380));
      return;
    }
    root.classList.add("fg-await-intro");
    requestAnimationFrame(() => {
      el.classList.add("is-play");
      if (short) el.classList.add("is-short");
      const sparks = $("#fg-in-sparks", el);
      runSparks(sparks, short ? 280 : 900);
      if (!short) buzz([16, 40, 28, 60, 18]);
      else buzz([12]);
      intro.state.timers.push(setTimeout(() => goEnd(false), short ? 500 : 2120));
    });
  }

  function boot() {
    if (booted) { loadDraft(); paint(); vis(document.body.dataset.nxv === "forge"); return; }
    if (!N) return;
    loadDraft();
    shell();
    bind();
    booted = true;
    lastN = kitN();
    lastSealed = isSealed(lastN) ? lastN : 0;
    target = Math.min(20, stepOf(lastN) || STEP);
    paint();
    startEmbers();
    vis(document.body.dataset.nxv === "forge");
    window.__FG.booted = true;
    playIntro();
  }

  window.__FG = {
    booted: false,
    ready: () => { boot(); return true; },
    kitN, progressText: () => progressCopy(kitN()), unlockText: () => unlockCopy(kitN()),
    sizes: SIZES, names: NAMES, money,
    pctAt, shareURL, addKey, remOne, clearKit, paint, boot,
    draft: () => [...draft], kitTotals, needOf, isSealed, addKitToCart, completePlan, applyComplete,
    presets: () => presets().map((p) => ({ id: p.id, name: p.name, items: [...p.m] })),
    popular: () => popular().map((p) => ({ id: p.id, name: p.name, items: [...p.m] })),
    lastKit: () => { const l = lastKit(); return l ? { items: [...l.m], dropped: l.dropped } : null; },
    openCard, nameOk, cleanName, drawCard,
    isExcluded: (k) => ssNoteOn() && SS(k),
    ssNoteOn, etYmd, countsForKit,
    targetOf: () => target,
    setTarget: (s) => { if (SIZES.includes(s)) { target = s; paint(); } },
    introPlaying: () => intro.state.playing,
    introDone: () => intro.state.done && !intro.state.el,
    skipIntro
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
