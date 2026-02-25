// @/models/FacturaLinea.ts
import { Table, Model, Column, DataType, PrimaryKey, AutoIncrement, ForeignKey, BelongsTo, } from "sequelize-typescript";
import Factura from "./Facturas";

@Table({ tableName: "Lineas" })
export default class Lineas extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.INTEGER,
  })
  declare ID_Linea: number;

  @ForeignKey(() => Factura)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare ID_Factura: number;

  @BelongsTo(() => Factura)
  factura?: Factura;

  @Column({
    type: DataType.STRING,
    allowNull: true,
    unique: true,
  })
  declare LineaKey: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare ItemId: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare ItemName: string;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
    defaultValue: 0,
  })
  declare Quantity: number;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
    defaultValue: 0,
  })
  declare Rate: number;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
    defaultValue: 0,
  })
  declare Amount: number;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare TaxCode: string;
}
