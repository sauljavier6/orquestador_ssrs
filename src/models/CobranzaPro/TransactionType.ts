// @/models.ts
import { Table, Model, Column, DataType, PrimaryKey, AutoIncrement, HasMany } from "sequelize-typescript";
import Notifications from "./Notifications";

@Table({ tableName: "TransactionType" })
export default class TransactionType extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.INTEGER,
  })
  declare ID_TransactionType: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare Description: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false
  })
  declare State: boolean;

  @HasMany(() => Notifications)
  Notifications?: Notifications[];

}