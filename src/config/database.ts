// src/config/database.ts
import { Sequelize } from 'sequelize-typescript';
import dotenv from 'dotenv';
import Users from '../models/Users';
import Rol from '../models/Rol';
import Phone from '../models/Phone';
import Email from '../models/Email';


dotenv.config();

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  models: [ Users, Rol, Phone, Email ],
  logging: false,
});

export default sequelize; 