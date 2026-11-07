const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../order-core.js");

test("FormSubmit acceptance is only explicit success true", () => {
  assert.equal(core.classifyFormsubmit(200, {success: "true", message: "The form was submitted successfully."}, false).state, "delivered");
  assert.equal(core.classifyFormsubmit(200, {success: true}, false).state, "delivered");
  assert.equal(core.classifyFormsubmit(200, {success: "false", message: "This form needs Activation."}, false).state, "rejected");
  assert.equal(core.classifyFormsubmit(200, {success: false}, false).state, "rejected");
  assert.equal(core.classifyFormsubmit(200, {}, false).state, "rejected");
  assert.equal(core.classifyFormsubmit(200, null, false).state, "rejected");
  assert.equal(core.classifyFormsubmit(404, {success: "false"}, false).state, "rejected");
  assert.equal(core.classifyFormsubmit(500, {success: "true"}, false).state, "unconfirmed");
  assert.equal(core.classifyFormsubmit(0, null, true).state, "unconfirmed");
  assert.equal(core.classifyOpaque().state, "unconfirmed");
});

test("a truthy success string is not acceptance", () => {
  assert.notEqual(core.classifyFormsubmit(200, {success: "false"}, false).state, "delivered");
  assert.notEqual(core.classifyFormsubmit(200, {success: "yes"}, false).state, "delivered");
});

test("intake acceptance must echo the same payment code", () => {
  assert.equal(core.classifyIntake(200, {accepted: true, paymentCode: "AB12"}, "AB12").state, "delivered");
  assert.equal(core.classifyIntake(200, {accepted: true, paymentCode: "ZZZZ"}, "AB12").state, "rejected");
  assert.equal(core.classifyIntake(200, {accepted: true}, "AB12").state, "rejected");
  assert.equal(core.classifyIntake(422, {accepted: false}, "AB12").state, "rejected");
  assert.equal(core.classifyIntake(503, null, "AB12").state, "unconfirmed");
});

test("checkout validation matches the existing field rules", () => {
  const ok = core.checkoutErrors({
    name: "Ada Lovelace", phone: "(305) 555-0100", email: "ada@example.com",
    fulfillment: "ship", addr: "1 Bay St, Miami, FL 33101", ruo: true
  });
  assert.deepEqual(ok, []);
  const bad = core.checkoutErrors({name: "Ada", phone: "555", email: "nope", fulfillment: "ship", addr: "short", ruo: false});
  assert.deepEqual(bad.map((item) => item.field), ["name", "phone", "email", "addr", "ruo"]);
  const pickup = core.checkoutErrors({
    name: "Ada Lovelace", phone: "3055550100", email: "ada@example.com",
    fulfillment: "pickup", pickup: "", addr: "", ruo: true
  });
  assert.deepEqual(pickup.map((item) => item.field), ["pday"]);
});

test("menu price, stock, and low-stock cap are enforced before send", () => {
  const book = {"BPC-157 10mg": {unit: 35, status: "low", cap: 28}, "Eros 12mg": {unit: 50, status: "out", cap: 0}};
  assert.deepEqual(core.lineErrors([{key: "BPC-157 10mg", qty: 2, unit: 35}], book), []);
  assert.match(core.lineErrors([{key: "BPC-157 10mg", qty: 3, unit: 35}], book)[0], /limit/);
  assert.match(core.lineErrors([{key: "BPC-157 10mg", qty: 1, unit: 1}], book)[0], /price/);
  assert.match(core.lineErrors([{key: "Eros 12mg", qty: 1, unit: 50}], book)[0], /not available/);
  assert.match(core.lineErrors([], book)[0], /empty/);
});

test("published payment fees stay 0, 1, 1, and 5 percent", () => {
  assert.equal(core.feePercent("zelle"), 0);
  assert.equal(core.feePercent("venmo"), 1);
  assert.equal(core.feePercent("cashapp"), 1);
  assert.equal(core.feePercent("crypto"), 5);
  assert.equal(core.amountDue(100, 0), 100);
  assert.equal(core.amountDue(100, 1), 101);
  assert.equal(core.amountDue(40, 5), 42);
});

test("payment codes use the existing alphabet and cart signature is stable", () => {
  assert.equal(core.paymentCodeFromBytes([0, 31, 32, 10]), "A9AL");
  assert.equal(core.cartSig([{key: "B", qty: 2}, {key: "A", qty: 1}]), core.cartSig([{key: "A", qty: 1}, {key: "B", qty: 2}]));
});

test("the page no longer treats an opaque post or the mail app as order delivery", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.equal(html.includes('mode: "no-cors"'), false);
  assert.equal(html.includes("mailtoOpen("), false);
  assert.equal(html.includes("function mailtoOpen"), false);
  assert.match(html, /classifyFormsubmit/);
  assert.match(html, /order-core\.js/);
  const checkout = html.slice(html.indexOf('id="co"'), html.indexOf('id="tray"'));
  assert.equal(checkout.includes("mailto:"), false);
  assert.equal(checkout.includes("Send by email"), false);
});
