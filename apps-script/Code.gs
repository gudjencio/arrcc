/**
 * ARRCC — Google Apps Script email relay.
 * IMPORTANT: deploy this web app while signed in as arrccrescue@gmail.com.
 * MailApp sends as the Google account that owns/runs this deployment; this code
 * cannot impersonate another Gmail address.
 *
 * Script Properties (Project Settings > Script properties):
 *   ARRCC_COUNTRY_RECIPIENTS_JSON = JSON object mapping ISO country codes to
 *     verified, officially published emergency-service email addresses.
 *     Example: {"FR":["official-address-confirmed-by-authority@example.fr"]}
 *     Do not add guessed addresses. Empty/unconfigured countries only go to ARRCC.
 *   ARRCC_DEFAULT_RECIPIENTS = comma-separated allow-list for trusted contacts (optional)
 *   ARRCC_SENDER_NAME = optional display name (default ARRCC Rescue)
 *   ARRCC_SHARED_SECRET = optional shared secret (not secure if embedded in public JS)
 *
 * This is an email-report relay, NOT an emergency dispatch service. Emails may be
 * delayed or ignored. Keep direct emergency calling visible in the web app.
 */
var ARRCC_INBOX_EMAIL = "arrccrescue@gmail.com";
var ARRCC_RATE_LIMIT_SECONDS = 30;
var ARRCC_MAX_REPORT_LENGTH = 18000;

function doGet() {
  return json_({ok:true, project:"arrcc", service:"email-relay", inbox:ARRCC_INBOX_EMAIL});
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    var data = JSON.parse(raw);
    var secret = props.getProperty("ARRCC_SHARED_SECRET") || "";
    if (secret && data.secret !== secret) return json_({ok:false,error:"unauthorized"});
    if (!lock.tryLock(5000)) return json_({ok:false,error:"busy"});

    var cache = CacheService.getScriptCache();
    if (cache.get("arrcc_last_send")) {
      lock.releaseLock();
      return json_({ok:false,error:"rate_limited",retryAfterSeconds:ARRCC_RATE_LIMIT_SECONDS});
    }

    var report = String(data.report || "").slice(0, ARRCC_MAX_REPORT_LENGTH);
    if (!report.trim()) {
      lock.releaseLock();
      return json_({ok:false,error:"empty_report"});
    }

    var country = String(data.country || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
    var countryMap = readCountryRecipients_(props.getProperty("ARRCC_COUNTRY_RECIPIENTS_JSON") || "{}");
    var officialRecipients = country && countryMap[country] ? countryMap[country] : [];
    var allow = (props.getProperty("ARRCC_DEFAULT_RECIPIENTS") || "")
      .split(",").map(function(x){return x.trim().toLowerCase();}).filter(validEmail_);
    var requested = Array.isArray(data.recipients) ? data.recipients : [];
    var trusted = requested.map(function(x){return String(x).trim().toLowerCase();})
      .filter(function(x){return validEmail_(x) && allow.indexOf(x) !== -1;});
    var recipients = unique_([ARRCC_INBOX_EMAIL].concat(officialRecipients, trusted));

    var senderName = props.getProperty("ARRCC_SENDER_NAME") || "ARRCC Rescue";
    var subject = "[ARRCC] Safety report" + (country ? " — " + country : " — location unknown");
    var options = {
      name: senderName,
      htmlBody: "<p><strong>ARRCC safety report</strong></p><pre style=\"white-space:pre-wrap;font-family:Arial,sans-serif\">" + escapeHtml_(report) + "</pre>"
    };
    // Optional JPEG evidence only; limit attachment size and never accept video files.
    if (typeof data.photo === "string" && data.photo.indexOf("data:image/jpeg;base64,") === 0) {
      var b64 = data.photo.substring("data:image/jpeg;base64,".length);
      if (b64.length <= 3 * 1024 * 1024) {
        try { options.attachments = [Utilities.newBlob(Utilities.base64Decode(b64), "image/jpeg", "arrcc-evidence.jpg")]; }
        catch (ignore) {}
      }
    }

    // Keep the ARRCC inbox in To and hide external recipients from one another with BCC.
    var bcc = recipients.filter(function(address){ return address !== ARRCC_INBOX_EMAIL; });
    MailApp.sendEmail({to:ARRCC_INBOX_EMAIL, bcc:bcc.join(","), subject:subject, body:report, name:senderName, htmlBody:options.htmlBody, attachments:options.attachments || []});
    cache.put("arrcc_last_send", "1", ARRCC_RATE_LIMIT_SECONDS);
    lock.releaseLock();
    return json_({ok:true, recipientCount:recipients.length, country:country || null, officialCountryRecipientCount:officialRecipients.length});
  } catch (err) {
    try { if (lock.hasLock()) lock.releaseLock(); } catch (ignore) {}
    return json_({ok:false,error:String(err && err.message ? err.message : err)});
  }
}

function readCountryRecipients_(raw) {
  var source;
  try { source = JSON.parse(raw); } catch (e) { source = {}; }
  var clean = {};
  Object.keys(source || {}).forEach(function(code) {
    var cc = String(code).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
    if (!cc || !Array.isArray(source[code])) return;
    clean[cc] = source[code].map(function(email){return String(email).trim().toLowerCase();})
      .filter(validEmail_).slice(0, 10);
  });
  return clean;
}
function validEmail_(value) { return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(value || "")); }
function unique_(items) { return items.filter(function(value, index, all){return all.indexOf(value) === index;}); }
function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
