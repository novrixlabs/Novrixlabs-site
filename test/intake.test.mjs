import test from "node:test";
import assert from "node:assert/strict";
import { assessOrder, startIntake } from "../intake/local-server.mjs";

const order = {
  name: "Ada Lovelace", phone: "3055550100", email: "ada@example.com",
  fulfillment: "ship", addr: "1 Bay St, Miami, FL 33101", ruo: true,
  paymentCode: "AB2K", method: "zelle", grand: 35, amountDue: 35,
  lines: [{key: "BPC-157 10mg", qty: 1, unit: 35}]
};

test("sandbox intake rejects a missing research confirmation and a wrong fee", () => {
  const missing = assessOrder({...order, ruo: false}, null);
  assert.equal(missing.accepted, false);
  const fee = assessOrder({...order, method: "venmo", amountDue: 35}, null);
  assert.equal(fee.accepted, false);
  const ok = assessOrder(order, {"BPC-157 10mg": {unit: 35, status: "in", cap: 28}});
  assert.equal(ok.accepted, true);
  assert.equal(ok.paymentCode, "AB2K");
});

test("sandbox intake repeats the same payment code instead of storing a second order", async () => {
  const {server, port} = await startIntake(0);
  try {
    const post = () => fetch(`http://127.0.0.1:${port}/order`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(order)});
    const first = await (await post()).json();
    const second = await (await post()).json();
    assert.equal(first.accepted, true);
    assert.deepEqual(second, first);
    const rejected = await (await fetch(`http://127.0.0.1:${port}/order`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({...order, paymentCode: "ZZ99", ruo: false})})).json();
    assert.equal(rejected.accepted, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
