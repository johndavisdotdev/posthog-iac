// Internal rendering helpers for the workflows L2s. Not exported from the package.
import type { EmailContent } from '../workflows/message-template';

/**
 * Renders email content to PostHog's message template shape:
 * `{subject, preheader, text, html, from, replyTo, design}`. Unset fields are
 * left out.
 */
export function renderEmailContent(email: EmailContent): Record<string, unknown> {
  const out: Record<string, unknown> = { subject: email.subject };
  if (email.preheader !== undefined) out.preheader = email.preheader;
  if (email.text !== undefined) out.text = email.text;
  if (email.html !== undefined) out.html = email.html;
  if (email.from !== undefined) out.from = email.from;
  if (email.replyTo !== undefined) out.replyTo = email.replyTo;
  if (email.design !== undefined) out.design = email.design;
  return out;
}
