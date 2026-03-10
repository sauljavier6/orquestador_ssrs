import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
} from "sequelize-typescript";

@Table({
  tableName: "VendorInvoicePaymentStaging",
  timestamps: false,
})
export default class VendorInvoicePaymentStaging extends Model {

  // 🔑 Llave primaria compuesta: payment_number + invoice_id
  @PrimaryKey
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare payment_number: string;

  @PrimaryKey
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  declare invoice_id: number;

  // Datos de pago
  @Column(DataType.DATE)
  declare payment_date: Date;

  @Column(DataType.STRING)
  declare vendor: string;

  @Column(DataType.STRING)
  declare currency: string;

  @Column(DataType.FLOAT)
  declare payment_total: number;

  @Column(DataType.FLOAT)
  declare balance: number;

  @Column(DataType.STRING)
  declare payment_status: string;

  // Grupo de pago
  @Column(DataType.BIGINT)
  declare payment_group_id: number;

  @Column(DataType.DATE)
  declare date_group: Date;

  // Aplicaciones de factura
  @Column(DataType.FLOAT)
  declare amount_applied_to_invoice: number;

  @Column(DataType.DATE)
  declare invoice_date: Date;

  @Column(DataType.DATE)
  declare invoice_due_date: Date;

  // Fechas de control
  @Column(DataType.DATE)
  declare payment_lastmodified: Date;

  @Column(DataType.DATE)
  declare created_at: Date;

  @Column(DataType.DATE)
  declare updated_at: Date;
}