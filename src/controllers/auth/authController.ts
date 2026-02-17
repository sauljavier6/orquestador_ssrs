import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import sequelize from "../../config/database";
import Email from "../../models/Email";
import Rol from "../../models/Rol";
import User from "../../models/Users";
import Phone from "../../models/Phone";
import { Request, Response } from "express";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../../services/email.service";

export const register = async (req: Request, res: Response) => {
  const { fullName, customerNumber, rfc, phone, email, password } = req.body;

  const profileImage = req.file?.filename || "default.png";

  console.log('profileImage', profileImage)

  const t = await sequelize.transaction();

  try {
    const emailExists = await Email.findOne({
      where: { Description: email },
      transaction: t,
    });

    if (emailExists) {
      throw new Error("Correo ya existe");
    }

    const phoneExists = await Phone.findOne({
      where: { Description: phone },
      transaction: t,
    });

    if (phoneExists) {
      throw new Error("Teléfono ya existe");
    }

    const emailRecord = await Email.create(
      { Description: email, State: true },
      { transaction: t },
    );

    const phoneRecord = await Phone.create(
      { Description: phone, State: true },
      { transaction: t },
    );

    const hashedPassword = await bcrypt.hash(password, 10);

    const userRecord = await User.create(
      {
        Name: fullName,
        ID_Rol: 5,
        ID_Email: emailRecord.ID_Email,
        ID_Phone: phoneRecord.ID_Phone,
        RFC: rfc,
        Imagen: profileImage,
        ID_Netsuite: customerNumber, 
        Password: hashedPassword,
        State: true,
      },
      { transaction: t },
    );

    await t.commit();

    return res.status(201).json({
      message: "Usuario registrado con éxito",
      user: {
        id: userRecord.ID_User,
        name: userRecord.Name,
      },
    });
  } catch (error) {
    await t.rollback();

    return res.status(400).json({
      message: error instanceof Error ? error.message : "Error en el servidor",
    });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password, rememberMe } = req.body;

  try {
    const emailData = await Email.findOne({
      where: { Description: email },
    });

    if (!emailData) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = await User.findOne({
      where: { ID_Email: emailData.ID_Email },
    });

    if (!user || !user.State) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const rol = await Rol.findByPk(user.ID_Rol);
    if (!rol) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const isValid = await bcrypt.compare(password, user.Password);
    if (!isValid) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const accessToken = jwt.sign(
      {
        id: user.ID_User,
        name: user.Name,
        imagen: user.Imagen,
        role: user.ID_Rol,
        roleName: rol.Description,
        netsuiteId: user.ID_Netsuite,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "1m" },
    );

    const refreshToken = jwt.sign(
      { id: user.ID_User },
      process.env.JWT_REFRESH_SECRET as string,
      {
        expiresIn: rememberMe ? "30d" : "1d",
      },
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
    });

    return res.json({
      accessToken,
      message: "Inicio de sesión exitoso",
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al iniciar sesión" });
  }
};

export const refreshAccessToken = async (req: Request, res: Response) => {
  const token = req.cookies.refreshToken;

  if (!token) {
    return res.status(401).json({ message: "No autorizado" });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET as string,
    ) as any;

    const user = await User.findByPk(payload.id);

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const rol = await Rol.findByPk(user.ID_Rol);

    const newAccessToken = jwt.sign(
      {
        id: user.ID_User,
        name: user.Name,
        imagen: user.Imagen,
        role: user.ID_Rol,
        roleName: rol?.Description,
        netsuiteId: user.ID_Netsuite,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "15m" },
    );

    return res.json({ accessToken: newAccessToken });
  } catch {
    return res.status(403).json({ message: "Refresh token inválido" });
  }
};

export const logout = (req: Request, res: Response) => {
  res.clearCookie("refreshToken");
  return res.json({ message: "Sesión cerrada correctamente" });
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  const email = req.body.data;

  try {
    const emailData = await Email.findOne({
      where: { Description: email },
    });

    if (!emailData) {
      return res.json({
        message: "Si el correo existe, se enviará un enlace.",
      });
    }

    const user = await User.findOne({
      where: { ID_Email: emailData.ID_Email },
    });

    if (!user) {
      return res.json({
        message: "Si el correo existe, se enviará un enlace.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.ResetToken = hashedToken;
    user.ResetTokenExpires = new Date(Date.now() + 10 * 60 * 1000);

    await user.save();

    const frontendUrl = process.env.FRONTEND_ORIGINS;

    if (!frontendUrl) {
      throw new Error("FRONTEND_ORIGINS no está definido en .env");
    }

    const resetLink = `${frontendUrl}/reset-password/${resetToken}`;

    await sendPasswordResetEmail(email, resetLink);

    return res.json({
      message: "Si el correo existe, se enviará un enlace.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Error interno" });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  try {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      where: {
        ResetToken: hashedToken,
      },
    });

    if (
      !user ||
      !user.ResetTokenExpires ||
      user.ResetTokenExpires < new Date()
    ) {
      return res.status(400).json({ message: "Token inválido o expirado" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.Password = hashedPassword;
    user.ResetToken = null;
    user.ResetTokenExpires = null;

    await user.save();

    return res.json({ message: "Contraseña actualizada correctamente" });
  } catch (error) {
    return res.status(500).json({ message: "Error interno" });
  }
};