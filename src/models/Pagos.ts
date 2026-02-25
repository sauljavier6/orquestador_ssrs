// @/models/FacturaPago.ts
import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import Factura from "./Facturas";

@Table({ tableName: "Pagos" })
export default class Pagos extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.INTEGER,
  })
  declare ID_Pago: number;

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
    allowNull: false,
    unique: true,
  })
  declare PagoKey: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare NetsuitePaymentId: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare PaymentTranId: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare FechaPago: string;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
    defaultValue: 0,
  })
  declare MontoPago: number;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare PaymentMethod: string;

}
