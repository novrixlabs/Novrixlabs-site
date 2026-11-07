/* Local mock of a future private order intake. It stores nothing on disk and
   listens on 127.0.0.1 only. It is not deployed and does not send email.
   Run it yourself for a sandbox check. The live site does not point here. */
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../order-core.js");

export function assessOrder(payload, catalog) {
  const errors = [];
  if (!payload || typeof payload !== "object") return {accepted: false, errors: ["Missing order."]};
  errors.push(...core.checkoutErrors({
    name: payload.name, phone: payload.phone, email: payload.email,
    fulfillment: payload.fulfillment, pickup: payload.pickup, addr: payload.addr, ruo: payload.ruo === true
  }).map((item) => item.need));
  if (!/^[A-HJ-NP-Z2-9]{4}$/.test(String(payload.paymentCode || ""))) errors.push("Missing payment code.");
  if (catalog) errors.push(...core.lineErrors(payload.lines || [], catalog));
  const fee = core.feePercent(payload.method);
  const due = core.amountDue(payload.grand, fee);
  if (payload.method && Number(payload.amountDue) !== due) errors.push("Payment amount does not match the fee.");
  return errors.length ? {accepted: false, errors} : {accepted: true, paymentCode: payload.paymentCode, amountDue: due};
}

export function startIntake(port = 0) {
  const seen = new Map();
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/order") {
      res.writeHead(404, {"content-type": "application/json"}); res.end('{"accepted":false}'); return;
    }
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      let payload = null;
      try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch (e) { payload = null; }
      const code = payload && payload.paymentCode;
      if (code && seen.has(code)) {
        const prior = seen.get(code);
        res.writeHead(200, {"content-type": "application/json"});
        res.end(JSON.stringify(prior));
        return;
      }
      const result = assessOrder(payload, null);
      if (code && result.accepted) seen.set(code, result);
      res.writeHead(result.accepted ? 200 : 422, {"content-type": "application/json"});
      res.end(JSON.stringify(result));
    });
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({server, port: server.address().port, seen}));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8787);
  startIntake(port).then(({port: bound}) => {
    console.log(`sandbox intake on http://127.0.0.1:${bound}/order`);
  });
}
