/**
 * NOT DEPLOYED. Reference only, for the existing novrixlabs Google account.
 * Do not paste this into production until you choose to. It is not wired to the site.
 *
 * What it would do after you deploy it as a private web app and set Script Properties:
 * - read a JSON order POST
 * - reject it unless research-use is confirmed and the fields are present
 * - MailApp.sendEmail to the deploying Google user (your existing inbox)
 * - return {accepted:true, paymentCode} only after MailApp returns
 * - return the same result for a repeated payment code in Script Properties cache
 *
 * A static site cannot hide the web-app URL. Treat the endpoint as public,
 * keep a size limit, and do not store orders in a public sheet.
 * This file has not been executed and has not sent mail.
 */
function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || "";
  if (raw.length > 20000) return json_({accepted: false, error: "Too large."});
  var order;
  try { order = JSON.parse(raw); } catch (err) { return json_({accepted: false, error: "Invalid JSON."}); }
  if (!order || order.ruo !== true) return json_({accepted: false, error: "Research-use confirmation is required."});
  if (!order.paymentCode || !/^[A-HJ-NP-Z2-9]{4}$/.test(order.paymentCode)) return json_({accepted: false, error: "Payment code is required."});
  var cache = CacheService.getScriptCache();
  var prior = cache.get("order:" + order.paymentCode);
  if (prior) return ContentService.createTextOutput(prior).setMimeType(ContentService.MimeType.JSON);
  if (!order.subject || !order.message || !order.email) return json_({accepted: false, error: "Name, email, and order text are required."});
  MailApp.sendEmail({to: Session.getActiveUser().getEmail(), subject: String(order.subject).slice(0, 180), body: String(order.message).slice(0, 18000), replyTo: order.email});
  var body = JSON.stringify({accepted: true, paymentCode: order.paymentCode});
  cache.put("order:" + order.paymentCode, body, 21600);
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
