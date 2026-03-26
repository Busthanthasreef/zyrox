import userSchema from "../../models/user.js";
import bcrypt from "bcryptjs";


export const findAdminByEmail = async (Email) => {

  const user = await userSchema.findOne({
    Email: Email,
    isAdmin: true
  });

  return user;

};


export const verifyPassword = async (Password, hashedPassword) => {

  const passwordMatch = await bcrypt.compare(Password, hashedPassword);

  return passwordMatch;

};


export const getAdminUser = async () => {

  const user = await userSchema.findOne({
    isAdmin: true
  });

  return user;

};