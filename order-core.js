/* Checkout decisions shared by the page and the local tests.
   Acceptance is explicit. An opaque or no-cors response is never treated as delivered. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NovrixOrder = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LOWCAP = 2;
  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function capFor(status, max) {
    const m = Number.isFinite(Number(max)) ? Number(max) : 10;
    return Math.max(1, Math.min(99, m, status === "low" ? LOWCAP : 99));
  }

  function classifyFormsubmit(status, body, transportError) {
    if (transportError || typeof status !== "number" || status <= 0 || status >= 500) {
      return {state: "unconfirmed", via: "formsubmit"};
    }
    const success = body && body.success;
    if (success === true || success === "true") return {state: "delivered", via: "formsubmit"};
    return {state: "rejected", via: "formsubmit"};
  }

  function classifyIntake(status, body, paymentCode) {
    if (typeof status !== "number" || status <= 0 || status >= 500) return {state: "unconfirmed", via: "intake"};
    if (status >= 200 && status < 300 && body && body.accepted === true && paymentCode && body.paymentCode === paymentCode) {
      return {state: "delivered", via: "intake"};
    }
    return {state: "rejected", via: "intake"};
  }

  function classifyOpaque() {
    return {state: "unconfirmed", via: "opaque"};
  }

  function checkoutErrors(f) {
    const errors = [];
    const name = String((f && f.name) || "").trim();
    if (name.split(/\s+/).filter(Boolean).length < 2) errors.push({field: "name", need: "your first and last name"});
    if (String((f && f.phone) || "").replace(/\D/g, "").length < 10) errors.push({field: "phone", need: "a phone number with area code"});
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String((f && f.email) || "").trim())) errors.push({field: "email", need: "a valid email"});
    const shipping = !f || f.fulfillment !== "pickup";
    if (!shipping && !String((f && f.pickup) || "").trim()) errors.push({field: "pday", need: "a pickup day and time"});
    if (shipping) {
      const addr = String((f && f.addr) || "").trim();
      if (!(addr.length >= 10 && /\b\d{5}(-\d{4})?\b/.test(addr))) errors.push({field: "addr", need: "your full shipping address with ZIP code"});
    }
    if (!f || !f.ruo) errors.push({field: "ruo", need: "a check in the research-use box"});
    return errors;
  }

  function lineErrors(lines, book) {
    const errors = [];
    if (!lines || !lines.length) errors.push("Your cart is empty.");
    for (const line of lines || []) {
      const key = line && line.key;
      const item = book && book[key];
      if (!item) { errors.push(String(key) + " is not on the menu."); continue; }
      if (item.status !== "in" && item.status !== "low") errors.push(key + " is not available.");
      const qty = Number(line.qty);
      if (!(qty >= 1 && qty <= capFor(item.status, item.cap))) errors.push(key + " is over the available limit.");
      if (Number(line.unit) !== Number(item.unit)) errors.push(key + " does not match the menu price.");
    }
    return errors;
  }

  function feePercent(method, fees) {
    const table = fees || {zelle: 0, venmo: 1, cashapp: 1, crypto: 5};
    if (method === "crypto") return Number(table.crypto) || 0;
    return Number(table[method]) || 0;
  }

  function amountDue(grand, feePct) {
    return Math.round(Number(grand) * (100 + Number(feePct))) / 100;
  }

  function cartSig(lines) {
    return (lines || []).map((line) => line.key + ":" + line.qty).sort().join("|");
  }

  function paymentCodeFromBytes(bytes) {
    let code = "";
    for (const value of bytes) code += CODE_ALPHABET[value % CODE_ALPHABET.length];
    return code;
  }

  return {
    LOWCAP, CODE_ALPHABET, capFor, classifyFormsubmit, classifyIntake, classifyOpaque,
    checkoutErrors, lineErrors, feePercent, amountDue, cartSig, paymentCodeFromBytes
  };
});
