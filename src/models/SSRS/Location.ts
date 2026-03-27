// @/models/Factura.ts
import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
  AutoIncrement,
  HasMany,
} from "sequelize-typescript";

@Table({ tableName: "Factura" })
export default class Factura extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.INTEGER,
  })
  declare ID_Location: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
  })
  declare NetsuiteLocationId: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare Location: string;
}
