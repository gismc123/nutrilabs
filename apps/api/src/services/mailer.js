import nodemailer from 'nodemailer';

export function createTransport(smtpSettings) {
  const { smtpHost, smtpPort, smtpUser, smtpPassword } = smtpSettings || {};
  if (!smtpHost || !smtpUser || !smtpPassword) return null;
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort || 587,
    secure: (smtpPort || 587) === 465,
    auth: { user: smtpUser, pass: smtpPassword },
  });
}

export async function sendPasswordResetEmail(toEmail, resetLink, smtpSettings) {
  try {
    const transporter = createTransport(smtpSettings);
    if (!transporter) return { success: false, error: 'SMTP not configured' };

    const fromName = smtpSettings.smtpFromName || 'NutriLabs';
    const fromAddress = smtpSettings.smtpFromAddress;
    const from = fromAddress ? `"${fromName}" <${fromAddress}>` : fromName;

    const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f5f5f5;margin:0;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
    <h1 style="color:#16a34a;font-size:22px;margin:0 0 8px;">NutriLabs</h1>
    <h2 style="font-size:18px;color:#111827;margin:0 0 16px;">Reset your password</h2>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">
      Click the button below to set a new password. This link expires in 1 hour.
    </p>
    <a href="${resetLink}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
      Reset my password
    </a>
    <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;">
      Or copy this link into your browser:<br>
      <span style="color:#4b5563;">${resetLink}</span>
    </p>
    <p style="color:#9ca3af;font-size:12px;margin:16px 0 0;">
      If you did not request this, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`;

    const text = `Reset your NutriLabs password\n\nClick the link below (expires in 1 hour):\n${resetLink}\n\nIf you did not request this, ignore this email.`;

    await transporter.sendMail({ from, to: toEmail, subject: 'Reset your NutriLabs password', html, text });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function testSmtpConnection(smtpSettings) {
  try {
    const transporter = createTransport(smtpSettings);
    if (!transporter) return { connected: false, error: 'SMTP not configured — missing host, user, or password' };
    await transporter.verify();
    return { connected: true };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}
