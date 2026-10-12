export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface EmailBody {
  heading: string;
  greeting?: string;
  paragraphs: string[];
  details?: readonly (readonly [label: string, value: string])[];
  action?: { label: string; url: string };
  notes?: string[];
}

export interface LayoutContext {
  appName: string;
  supportEmail: string;
  sentAt: string;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Subjects become a mail header, so user-supplied text is flattened and capped. */
export function oneLine(value: string, max = 200): string {
  const flat = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function renderEmail(
  subject: string,
  body: EmailBody,
  context: LayoutContext,
): EmailContent {
  return {
    subject: oneLine(subject),
    text: renderText(body, context),
    html: renderHtml(subject, body, context),
  };
}

function renderText(body: EmailBody, context: LayoutContext): string {
  const lines: string[] = [];
  if (body.greeting) lines.push(body.greeting, '');
  for (const paragraph of body.paragraphs) lines.push(paragraph, '');
  if (body.details?.length) {
    for (const [label, value] of body.details) lines.push(`${label}: ${value}`);
    lines.push('');
  }
  if (body.action) lines.push(`${body.action.label}:`, body.action.url, '');
  for (const note of body.notes ?? []) lines.push(note, '');
  lines.push('—', `${context.appName} · sent ${context.sentAt}`);
  if (context.supportEmail) lines.push(`Questions? ${context.supportEmail}`);
  return lines.join('\n');
}

function renderHtml(subject: string, body: EmailBody, context: LayoutContext): string {
  const e = escapeHtml;
  const paragraphs = body.paragraphs
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${e(p)}</p>`)
    .join('');
  const details = body.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 18px;border-collapse:collapse;font-size:14px">${body.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${e(label)}</td><td style="padding:6px 0;color:#111827">${e(value)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const action = body.action
    ? `<p style="margin:8px 0 18px"><a href="${e(body.action.url)}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:8px">${e(body.action.label)}</a></p><p style="margin:0 0 18px;font-size:12px;color:#6b7280;word-break:break-all">If the button does not work, copy this link into your browser:<br>${e(body.action.url)}</p>`
    : '';
  const notes = (body.notes ?? [])
    .map(
      (n) => `<p style="margin:0 0 10px;font-size:13px;color:#6b7280;line-height:1.5">${e(n)}</p>`,
    )
    .join('');
  const greeting = body.greeting ? `<p style="margin:0 0 14px">${e(body.greeting)}</p>` : '';
  const support = context.supportEmail
    ? ` · Questions? <a href="mailto:${e(context.supportEmail)}" style="color:#6b7280">${e(context.supportEmail)}</a>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(oneLine(subject))}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 18px;font-size:13px;font-weight:600;color:#6d28d9;letter-spacing:.04em">${e(context.appName)}</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${e(body.heading)}</h1>
${greeting}${paragraphs}${details}${action}${notes}
</td></tr></table>
<p style="max-width:560px;margin:14px auto 0;font-size:12px;color:#6b7280">Sent ${e(context.sentAt)}${support}</p>
</td></tr></table>
</body></html>`;
}
