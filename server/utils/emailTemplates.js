// Email-safe HTML: tables + inline styles only (Gmail/Outlook strip <style> and modern CSS).
const colors = { ink: '#15151b', muted: '#505663', cream: '#fffbf7', lime: '#c1ff72', pink: '#f68fff', line: '#25252c' }

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function layout({ preheader, body }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Zélia</title>
</head>
<body style="margin:0;padding:0;background:${colors.cream};font-family:Arial,Helvetica,sans-serif;color:${colors.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${colors.cream};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 0 20px 4px;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:${colors.ink};">
Zélia<span style="color:${colors.pink};">.</span>
</td></tr>
<tr><td style="background:#ffffff;border:2px solid ${colors.line};border-radius:20px;box-shadow:6px 6px 0 ${colors.ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="height:10px;line-height:10px;font-size:0;background:${colors.lime};border-radius:18px 18px 0 0;">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 28px 32px;">${body}</td></tr>
</table>
</td></tr>
<tr><td style="padding:24px 8px 0 8px;font-size:12px;line-height:18px;color:${colors.muted};text-align:center;">
Zélia, l’orientation qui te ressemble.<br>
Vous recevez cet email car un accès à l’espace écoles Zélia a été créé pour cette adresse.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
<tr><td style="background:${colors.lime};border:2px solid ${colors.ink};border-radius:999px;">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:${colors.ink};text-decoration:none;">${escapeHtml(label)}</a>
</td></tr>
</table>`
}

export function schoolInvitationEmail({ actionLink, schoolName, role }) {
  const school = schoolName ? `<strong>${escapeHtml(schoolName)}</strong>` : 'votre établissement'
  const intro = role === 'member'
    ? `Vous avez été invité·e à rejoindre l’espace de ${school} sur Zélia.`
    : `L’espace de ${school} sur Zélia est prêt.`
  const body = `
<span style="display:inline-block;padding:6px 12px;background:${colors.pink};border:2px solid ${colors.ink};border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${colors.ink};">Espace écoles</span>
<h1 style="margin:20px 0 12px 0;font-size:26px;line-height:32px;font-weight:800;color:${colors.ink};">Bienvenue sur Zélia 👋</h1>
<p style="margin:0 0 12px 0;font-size:16px;line-height:24px;color:${colors.ink};">${intro}</p>
<p style="margin:0;font-size:16px;line-height:24px;color:${colors.muted};">Vous pourrez y suivre les élèves intéressés par vos formations, gérer vos demandes et inviter votre équipe.</p>
${button(actionLink, 'Activer mon accès')}
<p style="margin:0 0 8px 0;font-size:14px;line-height:21px;color:${colors.muted};">Vous choisirez votre mot de passe à l’étape suivante. Ce lien est <strong style="color:${colors.ink};">personnel et temporaire</strong> : ne le transférez pas.</p>
<p style="margin:20px 0 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:18px;color:${colors.muted};word-break:break-all;">Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br><a href="${escapeHtml(actionLink)}" style="color:${colors.ink};">${escapeHtml(actionLink)}</a></p>`
  return {
    subject: 'Votre accès à l’espace écoles Zélia',
    html: layout({ preheader: 'Activez votre accès à l’espace écoles Zélia.', body })
  }
}
