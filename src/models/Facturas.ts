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
import Linea from "./Lineas";
import Pago from "./Pagos";

@Table({ tableName: "Factura" })
export default class Factura extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.INTEGER,
  })
  declare ID_Factura: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
  })
  declare NetsuiteInvoiceId: string; // internalId

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare Tranid: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare ClienteNetsuiteID: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare FechaFactura: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare FechaVencimiento: Date;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare Status: string;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
    defaultValue: 0,
  })
  declare Total: number;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
    defaultValue: 0,
  })
  declare SubTotal: number;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
    defaultValue: 0,
  })
  declare Impuestos: number;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
    defaultValue: 0,
  })
  declare SaldoPendiente: number;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare Currency: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare Location: number;

  @HasMany(() => Linea, "ID_Factura")
  lineas?: Linea[];

  @HasMany(() => Pago, "ID_Factura")
  pagos?: Pago[];
}
