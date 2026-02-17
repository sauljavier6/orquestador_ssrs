import nodemailer from "nodemailer";

export const sendPasswordResetEmail = async (to: string, resetLink: string) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Restablecer contraseña</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">

        <table width="600" cellpadding="0" cellspacing="0" 
          style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.05);">

          <!-- HEADER -->
          <tr>
            <td style="background:#2563eb; padding:20px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:20px;">
                🔐 Recuperación de contraseña
              </h1>
            </td>
          </tr>

          <!-- CONTENT -->
          <tr>
            <td style="padding:30px; color:#333; font-size:15px; line-height:1.6;">

              <p style="margin-top:0;">
                Hola,
              </p>

              <p>
                Recibimos una solicitud para restablecer tu contraseña.
                Si fuiste tú, haz clic en el botón de abajo para crear una nueva.
              </p>

              <div style="text-align:center; margin:35px 0;">
                <a href="${resetLink}"
                   style="
                    background-color:#2563eb;
                    color:#ffffff;
                    padding:14px 26px;
                    text-decoration:none;
                    border-radius:8px;
                    font-weight:bold;
                    display:inline-block;
                    font-size:15px;
                   ">
                  Restablecer contraseña
                </a>
              </div>

              <p style="font-size:14px; color:#666;">
                Este enlace expirará en <strong>15 minutos</strong>.
              </p>

              <p style="font-size:13px; color:#999;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>

              <p style="word-break:break-all; font-size:12px; color:#2563eb;">
                ${resetLink}
              </p>

              <hr style="border:none; border-top:1px solid #eee; margin:30px 0;" />

              <p style="font-size:12px; color:#999;">
                Si no solicitaste este cambio, puedes ignorar este mensaje.
                Tu contraseña actual seguirá siendo válida.
              </p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f9fafb; padding:15px; text-align:center; font-size:12px; color:#999;">
              © ${new Date().getFullYear()} CobranzaPro. Todos los derechos reservados.
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Soporte"`,
    to,
    subject: "Restablecer contraseña",
    html,
  });
};
