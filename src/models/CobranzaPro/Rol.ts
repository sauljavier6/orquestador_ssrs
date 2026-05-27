// @/models.ts
import { Table, Model, Column, DataType, PrimaryKey, AutoIncrement, HasMany } from "sequelize-typescript";
import User from "./Users";

@Table({ tableName: "Rol" })
export default class Rol extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.INTEGER,
  })
  declare ID_Rol: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare Description: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
  })
  declare State: boolean;

  @HasMany(() => User)
  user?: User[];
}