// Evenly "notify" Edge Function.
// The database calls this with {"id": "<notification id>"} each time a notification is created.
// It sends a phone notification to each of the person's devices and an email, then marks it delivered.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   phone notifications on the website (the Android/iPhone app needs no key)
//   BREVO_API_KEY + MAIL_FROM             email through Brevo (or RESEND_API_KEY + MAIL_FROM through Resend)
//   APP_URL                               your site, e.g. https://evenly-tracker.netlify.app
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// Open the function's URL in a browser to check which of these are set.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const env = (k: string) => Deno.env.get(k) ?? "";
const APP_URL = (env("APP_URL") || "https://evenly-tracker.netlify.app").replace(/\/+$/, "");

type Data = Record<string, any>;
type Note = { id: string; user_id: string | null; email: string | null; kind: string; group_id: string | null; expense_id: string | null; data: Data };

export function money(minor: number, cur = "INR") {
  try {
    const f = new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", { style: "currency", currency: cur });
    const digits = f.resolvedOptions().maximumFractionDigits ?? 2;
    return f.format(Math.abs(minor) / 10 ** digits);
  } catch {
    return `${cur} ${(Math.abs(minor) / 100).toFixed(2)}`;
  }
}

// Title, body and link for one notification, written for the person receiving it.
export function message(n: Note) {
  const d = n.data || {};
  const who = d.actor || "Someone";
  const where = d.is_direct ? "" : ` in ${d.group}`;
  const what = `“${d.description}”`;
  const cur = d.currency || "INR";
  const net = Number(d.net || 0);
  const share = net < 0 ? `You owe ${money(net, cur)}.` : net > 0 ? `You get back ${money(net, cur)}.` : "";
  const total = d.amount != null ? money(Number(d.amount), cur) : "";
  let title = "Evenly", body = "";
  switch (n.kind) {
    case "expense_added":
      if (d.expense_kind === "payment") {
        title = `${who} recorded a payment`;
        body = net < 0 ? `You received ${money(net, cur)}${where}.` : `You paid ${money(net, cur)}${where}.`;
      } else {
        title = `${who} added ${what}${where}`;
        body = `${total} in total. ${share}`.trim();
      }
      break;
    case "expense_updated":
      title = `${who} changed ${d.expense_kind === "payment" ? "a payment" : what}${where}`;
      body = d.removed ? "You’re no longer part of this expense." : (net < 0 ? `You now owe ${money(net, cur)}.` : net > 0 ? `You now get back ${money(net, cur)}.` : `${total} in total.`);
      break;
    case "expense_deleted":
      title = `${who} deleted ${d.expense_kind === "payment" ? "a payment" : what}${where}`;
      body = "Your balance has been updated.";
      break;
    case "expense_restored":
      title = `${who} restored ${what}${where}`;
      body = share || "Your balance has been updated.";
      break;
    case "comment":
      title = `${who} commented on ${what}`;
      body = String(d.body || "");
      break;
    case "reminder":
      title = `Reminder from ${who}`;
      body = `You owe ${who} ${money(Number(d.amount || 0), cur)}${where}. Settle up when you can.`;
      break;
    case "added_to_group":
      title = d.is_direct ? `${who} added you as a friend` : `${who} added you to ${d.group}`;
      body = "Open Evenly to see your shared expenses.";
      break;
    case "invited":
      title = d.is_direct ? `${who} is splitting expenses with you on Evenly` : `${who} added you to ${d.group} on Evenly`;
      body = "Create a free account with this email address to see what you owe and settle up.";
      break;
  }
  const url = APP_URL + "/" + (n.expense_id && n.kind !== "expense_deleted" ? `#open-${n.expense_id}` : n.group_id ? `#group-${n.group_id}` : "");
  return { title, body, url, tag: n.expense_id || n.group_id || n.id };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export function emailHtml(m: { title: string; body: string; url: string }, account: boolean) {
  return `<!doctype html><html><body style="margin:0;background:#eef3f0;font-family:Arial,Helvetica,sans-serif;color:#13211c">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px">
    <div style="font-size:20px;font-weight:800;margin-bottom:16px"><span style="display:inline-block;background:#0e6650;color:#fff;border-radius:6px;padding:2px 8px;margin-right:6px">E</span>Evenly</div>
    <div style="background:#fff;border:1px solid #d8e2dd;border-radius:14px;padding:20px">
      <h1 style="font-size:18px;margin:0 0 8px">${escapeHtml(m.title)}</h1>
      <p style="margin:0 0 18px;color:#3d4d47;line-height:1.5">${escapeHtml(m.body)}</p>
      <a href="${escapeHtml(m.url)}" style="display:inline-block;background:#0e6650;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:10px">${account ? "Open Evenly" : "Join Evenly"}</a>
    </div>
    <p style="font-size:12px;color:#5a6b64;margin-top:14px">${account ? "You can turn off these emails in Evenly under Account &gt; Notifications." : "You got this because a friend added your email to an expense on Evenly."}</p>
  </div></body></html>`;
}

async function sendEmail(to: string, m: { title: string; body: string; url: string }, account: boolean) {
  const from = env("MAIL_FROM"), name = env("MAIL_FROM_NAME") || "Evenly";
  const text = `${m.title}\n\n${m.body}\n\n${m.url}`;
  if (!from) return "no MAIL_FROM";
  if (env("BREVO_API_KEY")) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env("BREVO_API_KEY"), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name, email: from }, to: [{ email: to }], subject: m.title, htmlContent: emailHtml(m, account), textContent: text }),
    });
    return r.ok ? "sent" : `brevo ${r.status}: ${await r.text()}`;
  }
  if (env("RESEND_API_KEY")) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env("RESEND_API_KEY")}`, "content-type": "application/json" },
      body: JSON.stringify({ from: `${name} <${from}>`, to: [to], subject: m.title, html: emailHtml(m, account), text }),
    });
    return r.ok ? "sent" : `resend ${r.status}: ${await r.text()}`;
  }
  return "no email provider";
}

// The Android and iPhone app: send through Expo's push service. Returns how many went out, and the tokens
// Expo says are no longer registered (the app was removed), so they can be forgotten.
export async function sendExpo(tokens: string[], m: { title: string; body: string; url: string; tag: string }, doFetch: typeof fetch = fetch) {
  if (!tokens.length) return { sent: 0, gone: [] as string[] };
  const r = await doFetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(tokens.map((to) => ({ to, title: m.title, body: m.body, data: { url: m.url }, sound: "default", channelId: "default" }))),
  });
  if (!r.ok) return { sent: 0, gone: [] as string[], error: `expo ${r.status}` };
  const out = (await r.json())?.data || [];
  const gone = tokens.filter((_, i) => out[i]?.details?.error === "DeviceNotRegistered");
  return { sent: out.filter((x: any) => x?.status === "ok").length, gone };
}

export async function handler(req: Request): Promise<Response> {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  // A quick status page: which settings are in place (never their values).
  if (req.method === "GET") {
    return json({
      ok: true,
      phone_notifications: !!(env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY")),
      email: env("BREVO_API_KEY") ? "brevo" : env("RESEND_API_KEY") ? "resend" : "not set up",
      mail_from: env("MAIL_FROM") || "not set",
      app_url: APP_URL,
    });
  }
  let id = "";
  try { id = (await req.json()).id; } catch { /* handled below */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "expected {id}" }, 400);

  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  // Claim it: only the first call for a notification sends anything.
  const { data: n, error } = await sb.from("notifications").update({ delivered_at: new Date().toISOString() })
    .eq("id", id).is("delivered_at", null).select().maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!n) return json({ skipped: "already delivered or not found" });

  const m = message(n as Note);
  const result: Record<string, unknown> = { title: m.title };

  let wantPush = false, wantEmail = true, email = n.email as string | null;
  if (n.user_id) {
    const { data: p } = await sb.from("profiles").select("notify_push, notify_email").eq("id", n.user_id).maybeSingle();
    wantPush = p?.notify_push ?? true;
    wantEmail = p?.notify_email ?? true;
    const { data: u } = await sb.auth.admin.getUserById(n.user_id);
    email = u?.user?.email ?? null;
  }

  if (wantPush && env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY")) {
    webpush.setVapidDetails(`mailto:${env("MAIL_FROM") || "evenly@example.com"}`, env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
    const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", n.user_id);
    let sent = 0;
    for (const s of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m), { TTL: 86400 });
        sent++;
      } catch (e: any) {
        // The device unsubscribed or the browser forgot it: stop trying.
        if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
    result.push = sent;
  }
  if (wantPush && n.user_id) {
    const { data: rows } = await sb.from("push_tokens").select("token").eq("user_id", n.user_id);
    const r = await sendExpo((rows || []).map((x: { token: string }) => x.token), m);
    if (r.gone.length) await sb.from("push_tokens").delete().in("token", r.gone);
    result.app = r.sent;
  }
  if (wantEmail && email) result.email = await sendEmail(email, m, !!n.user_id);
  return json(result);
}

if (!Deno.env.get("EVENLY_TEST")) Deno.serve(handler);
