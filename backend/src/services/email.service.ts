import nodemailer from "nodemailer";



interface VerificationEmailData {
  email: string;
  fullName: string;
  verificationUrl: string;
}

interface PasswordResetEmailData {
  email: string;
  fullName: string;
  resetUrl: string;
}



const escapeHtml = (value: string): string => {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
};



const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !port || !user || !password) {
    throw new Error("Email SMTP configuration is incomplete");
  }

  return nodemailer.createTransport({
    host,
    port,

    secure: port === 465,
    requireTLS: port === 587,

    auth: {
      user,
      pass: password,
    },

    tls: {
      minVersion: "TLSv1.2",
    },
  });
};



export const sendVerificationEmail = async (
  data: VerificationEmailData
): Promise<void> => {

  const transporter = createTransporter();

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  if (!from) {
    throw new Error("MAIL_FROM is not configured");
  }

  const safeName = escapeHtml(data.fullName);
  const safeUrl = escapeHtml(data.verificationUrl);

  try {
    await transporter.sendMail({
    from,
    to: data.email,

    subject:
      "Verify Your Tanzania Business & Investment Awards Account",



    text: `
Hello ${data.fullName},

Thank you for registering with Tanzania Business & Investment Awards (TBIA).

Please verify your email address by opening the link below:

${data.verificationUrl}

This verification link expires after 24 hours.

If you did not create this account, please ignore this email.

Tanzania Business & Investment Awards (TBIA).
    `,



    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TBIA Email Verification</title>
</head>

<body style="
  margin: 0;
  padding: 0;
  background-color: #f5f5f5;
  font-family: Arial, Helvetica, sans-serif;
">

  <div style="
    max-width: 600px;
    margin: 30px auto;
    background-color: #ffffff;
    border-radius: 10px;
    overflow: hidden;
  ">

    

    <div style="
      background-color: #4B168C;
      padding: 30px 20px;
      text-align: center;
    ">

      <h1 style="
        color: #D4AF37;
        margin: 0;
        font-size: 25px;
      ">
        TBIA
      </h1>

      <p style="
        color: #ffffff;
        margin: 10px 0 0;
        font-size: 14px;
      ">
        Tanzania Business & Investment Awards
      </p>

    </div>

    

    <div style="padding: 35px 25px;">

      <h2 style="
        color: #4B168C;
        margin-top: 0;
      ">
        Welcome to TBIA!
      </h2>

      <p style="color: #333333; font-size: 15px;">
        Hello ${safeName},
      </p>

      <p style="
        color: #555555;
        font-size: 15px;
        line-height: 1.7;
      ">
        Thank you for registering with Tanzania Business &
        Investment Awards.
      </p>

      <p style="
        color: #555555;
        font-size: 15px;
        line-height: 1.7;
      ">
        Please verify your email address by clicking the
        button below.
      </p>

      

      <div style="
        text-align: center;
        margin: 30px 0;
      ">

        <a
          href="${safeUrl}"
          style="
            display: inline-block;
            background-color: #4B168C;
            color: #ffffff;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            font-size: 14px;
          "
        >
          VERIFY MY EMAIL
        </a>

      </div>

      <p style="
        color: #777777;
        font-size: 13px;
        line-height: 1.6;
      ">
        This verification link expires after
        <strong>24 hours</strong>.
      </p>

      <p style="
        color: #777777;
        font-size: 13px;
        line-height: 1.6;
      ">
        If you did not create this account, please ignore
        this email.
      </p>

      <hr style="
        border: none;
        border-top: 1px solid #eeeeee;
        margin: 30px 0;
      ">

      <p style="
        color: #999999;
        font-size: 12px;
        text-align: center;
      ">
        Tanzania Business & Investment Awards
        <br>
        Celebrating Business Excellence.
        Inspiring Investment. Building Tanzania.
      </p>

    </div>

    

    <div style="
      background-color: #080808;
      padding: 18px;
      text-align: center;
    ">

      <p style="
        color: #D4AF37;
        font-size: 12px;
        margin: 0;
      ">
        &copy; TBIA. All Rights Reserved.
      </p>

    </div>

  </div>

</body>
</html>
    `,
    });

    console.log(`Verification email sent to: ${data.email}`);
  } finally {
    await transporter.close();
  }
};

export const sendPasswordResetEmail = async (
  data: PasswordResetEmailData
): Promise<void> => {
  const transporter = createTransporter();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  if (!from) {
    throw new Error("MAIL_FROM is not configured");
  }

  const safeName = escapeHtml(data.fullName);
  const safeUrl = escapeHtml(data.resetUrl);

  try {
    await transporter.sendMail({
      from,
      to: data.email,
      subject: "Reset Your TBIA Account Password",
      text: `Hello ${data.fullName},\n\nUse this link to reset your password. It expires in 30 minutes:\n\n${data.resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `<p>Hello ${safeName},</p><p>Use the link below to reset your password. It expires in 30 minutes.</p><p><a href="${safeUrl}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`,
    });
  } finally {
    await transporter.close();
  }
};