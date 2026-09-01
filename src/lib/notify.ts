/**
 * Outbound alerts. Email is free on Resend's tier. SMS is the one place where
 * a genuinely free option does not exist, so Booth supports Twilio pay as you
 * go (prepay $20 once, it lasts several seasons at fantasy volumes) and
 * Telegram, which is free and behaves like a push notification on a phone.
 */
export interface Alert {
  subject: string;
  body: string;
  urgent?: boolean;
}

export async function sendEmail(to: string, alert: Alert) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.BOOTH_FROM_EMAIL ?? "booth@example.com",
      to,
      subject: alert.subject,
      text: alert.body
    })
  });
  return res.ok;
}

export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from || !to) return false;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 300) })
  });
  return res.ok;
}

export async function sendTelegram(chatId: string, body: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: body })
  });
  return res.ok;
}

export async function deliver(
  prefs: {
    notify_email: string | null;
    notify_sms: string | null;
    notify_telegram_chat_id: string | null;
    urgent_channel: string;
  },
  alert: Alert
) {
  const sent: string[] = [];
  if (alert.urgent) {
    if (prefs.urgent_channel === "sms" && prefs.notify_sms) {
      if (await sendSms(prefs.notify_sms, `${alert.subject}\n${alert.body}`)) sent.push("sms");
    }
    if (prefs.urgent_channel === "telegram" && prefs.notify_telegram_chat_id) {
      if (await sendTelegram(prefs.notify_telegram_chat_id, `${alert.subject}\n${alert.body}`)) sent.push("telegram");
    }
    if (prefs.urgent_channel === "none") return sent;
  }
  if (prefs.notify_email) {
    if (await sendEmail(prefs.notify_email, alert)) sent.push("email");
  }
  return sent;
}
