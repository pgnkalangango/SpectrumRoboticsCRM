import nodemailer from "nodemailer";
import { DEFAULT_SETTINGS } from "@/lib/settings";

// Transactional system mail: invitations, password resets, notifications.
// Person to person mail goes through each user's own connected mailbox instead.
function transport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export function appUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

export async function sendSystemMail(params: { to: string; subject: string; html: string; text?: string }) {
  const t = transport();
  const from = process.env.SMTP_FROM ?? `${DEFAULT_SETTINGS.company.name} <${DEFAULT_SETTINGS.company.email}>`;
  const footer = `<p style="font-size:12px;color:#666;margin-top:24px">${DEFAULT_SETTINGS.company.name} | ${DEFAULT_SETTINGS.company.address}</p>`;
  const html = `<div style="font-family:Manrope,Segoe UI,system-ui,sans-serif;font-size:15px;color:#141517;line-height:1.55;max-width:560px">${params.html}${footer}</div>`;
  if (!t) {
    console.info(`[mail:dev] To: ${params.to}\nSubject: ${params.subject}\n${params.text ?? params.html.replace(/<[^>]+>/g, " ")}`);
    return { delivered: false, reason: "SMTP not configured" };
  }
  await t.sendMail({ from, to: params.to, subject: params.subject, html, text: params.text });
  return { delivered: true };
}

export function button(href: string, text: string) {
  return `<p style="margin:20px 0"><a href="${href}" style="background:#149CA0;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;display:inline-block">${text}</a></p><p style="font-size:12px;color:#666">Or copy this link: ${href}</p>`;
}
