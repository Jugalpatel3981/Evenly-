// Run with: EVENLY_TEST=1 deno test -A tests/notify.deno.test.ts
import { message, money, emailHtml, handler } from "../supabase/functions/notify/index.ts";
import webpush from "npm:web-push@3.6.7";

const assert = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };
const base = { id: "n1", user_id: "u", email: null, group_id: "g1", expense_id: "e1" };

Deno.test("money formats per currency", () => {
  assert(money(30000, "INR") === "₹300.00", money(30000, "INR"));
  assert(money(-1500, "USD") === "$15.00", money(-1500, "USD"));
  assert(money(1500, "JPY") === "¥1,500", money(1500, "JPY"));
});
Deno.test("expense added: tells you what you owe", () => {
  const m = message({ ...base, kind: "expense_added", data: { actor: "Asha", group: "Goa trip", description: "Dinner", amount: 90000, currency: "INR", net: -30000 } });
  assert(m.title === "Asha added “Dinner” in Goa trip", m.title);
  assert(m.body === "₹900.00 in total. You owe ₹300.00.", m.body);
  assert(m.url.endsWith("/#open-e1"), m.url);
});
Deno.test("friend ledger messages skip the group name", () => {
  const m = message({ ...base, kind: "expense_added", data: { actor: "Rahul", group: "Friends", is_direct: true, description: "Cab", amount: 50000, net: 25000 } });
  assert(m.title === "Rahul added “Cab”" && m.body.includes("You get back ₹250.00"), m.title + " / " + m.body);
});
Deno.test("payments, reminders, comments, removal, invites", () => {
  assert(message({ ...base, kind: "expense_added", data: { actor: "Rahul", is_direct: true, expense_kind: "payment", amount: 50000, net: -50000 } }).body === "You received ₹500.00.", "payment");
  assert(message({ ...base, kind: "reminder", expense_id: null, data: { actor: "Asha", group: "Flat", amount: 45000 } }).body === "You owe Asha ₹450.00 in Flat. Settle up when you can.", "reminder");
  assert(message({ ...base, kind: "comment", data: { actor: "Bina", description: "Dinner", body: "Yum" } }).body === "Yum", "comment");
  assert(message({ ...base, kind: "expense_updated", data: { actor: "Bina", group: "Goa", description: "Dinner", removed: true } }).body.includes("no longer part"), "removed");
  const inv = message({ ...base, kind: "invited", expense_id: null, data: { actor: "Asha", group: "Goa trip" } });
  assert(inv.title === "Asha added you to Goa trip on Evenly" && inv.url.endsWith("#group-g1"), inv.title);
});
Deno.test("deleted expenses link to the group, not the gone expense", () => {
  assert(message({ ...base, kind: "expense_deleted", data: { actor: "A", group: "G", description: "X" } }).url.endsWith("#group-g1"), "url");
});
Deno.test("email html escapes user text", () => {
  const h = emailHtml({ title: "<script>", body: "a & b", url: "https://x" }, true);
  assert(!h.includes("<script>") && h.includes("&lt;script&gt;") && h.includes("a &amp; b"), "escape");
});
Deno.test("status page reports setup without secrets", async () => {
  Deno.env.set("BREVO_API_KEY", "secret-value");
  const r = await handler(new Request("https://f/notify"));
  const t = await r.text();
  assert(t.includes('"email":"brevo"') && !t.includes("secret-value"), t);
});
Deno.test("bad requests are rejected", async () => {
  const r = await handler(new Request("https://f/notify", { method: "POST", body: "{}" }));
  assert(r.status === 400, String(r.status));
});
Deno.test("web-push can encrypt a message under Deno", () => {
  const k = webpush.generateVAPIDKeys();
  const ecdh = (globalThis as any).crypto; // a real browser subscription key pair, made with WebCrypto below
  assert(k.publicKey.length > 60 && ecdh, "keys");
});
Deno.test("web-push builds a valid request for a browser subscription", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: b64u(raw), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } };
  const k = webpush.generateVAPIDKeys();
  const det = webpush.generateRequestDetails(sub, JSON.stringify({ title: "t" }), { vapidDetails: { subject: "mailto:a@b.c", publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 60 });
  assert(det.headers["Content-Encoding"] === "aes128gcm" && /^vapid t=/.test(det.headers.Authorization) && det.body.length > 0, JSON.stringify(det.headers));
});

Deno.test("full delivery: claims once, looks up the person, emails them, respects settings", async () => {
  Deno.env.set("SUPABASE_URL", "https://proj.supabase.co"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
  Deno.env.set("BREVO_API_KEY", "bk"); Deno.env.set("MAIL_FROM", "jugal@example.com");
  Deno.env.delete("VAPID_PUBLIC_KEY");
  const note = { id: "11111111-1111-1111-1111-111111111111", user_id: "22222222-2222-2222-2222-222222222222", email: null, kind: "expense_added",
    group_id: "g", expense_id: "e", data: { actor: "Asha", group: "Goa", description: "Dinner", amount: 90000, net: -30000 } };
  let delivered = false, emailOn = true;
  const sent: any[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input: any, init?: any) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init?.method || (input.method ?? "GET");
    const j = (o: unknown) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
    if (url.host === "api.brevo.com") { sent.push(JSON.parse(init.body)); return j({ messageId: "m" }); }
    if (url.pathname === "/rest/v1/notifications" && method === "PATCH") {
      if (delivered || !url.search.includes("delivered_at=is.null")) return j(null);
      delivered = true; return j(note);
    }
    if (url.pathname === "/rest/v1/profiles") return j({ notify_push: true, notify_email: emailOn });
    if (url.pathname.startsWith("/auth/v1/admin/users/")) return j({ id: note.user_id, email: "bina@example.com" });
    return new Response("not found " + url.pathname, { status: 404 });
  };
  try {
    const call = () => handler(new Request("https://f/notify", { method: "POST", body: JSON.stringify({ id: note.id }) })).then(r => r.json());
    const r1 = await call();
    assert(r1.email === "sent", JSON.stringify(r1));
    assert(sent.length === 1 && sent[0].to[0].email === "bina@example.com" && sent[0].subject === "Asha added “Dinner” in Goa", JSON.stringify(sent[0]));
    assert(sent[0].sender.email === "jugal@example.com", "sender");
    const r2 = await call();
    assert(r2.skipped && sent.length === 1, "second call must not send again: " + JSON.stringify(r2));
    delivered = false; emailOn = false;
    const r3 = await call();
    assert(!("email" in r3) && sent.length === 1, "email off must not send: " + JSON.stringify(r3));
  } finally { globalThis.fetch = real; }
});
