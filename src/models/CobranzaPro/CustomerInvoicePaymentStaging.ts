import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
} from "sequelize-typescript";

@Table({
  tableName: "CustomerInvoicePaymentStaging",
  timestamps: false,
})
export default class CustomerInvoicePaymentStaging extends Model {
  // 🔑 Clave primaria compuesta de la relación pago–factura
  @PrimaryKey
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  declare link_id: number; // cb.id

  @PrimaryKey
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  declare payment_id: number; // p.id

  @PrimaryKey
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  declare invoice_id: number; // b.id

  // Información del pago
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare payment_tranid: string; // p.tranid

  @Column(DataType.DATE)
  declare payment_trandate: Date; // p.trandate

  @Column(DataType.FLOAT)
  declare foreigntotal: number; // p.foreignpaymentamountused

  @Column(DataType.STRING)
  declare currency: string; // BUILTIN.DF(p.currency)

  @Column(DataType.FLOAT)
  declare balance: number; // p.foreignpaymentamountunused

  @Column(DataType.DATE)
  declare payment_lastmodified: Date; // p.lastmodifieddate (fecha real del pago)

  @Column(DataType.STRING)
  declare payment_status: string; // p.status

  // Información del proveedor
  @Column(DataType.BIGINT)
  declare customer: number; // b.entity

  // Información de la factura
  @Column(DataType.STRING)
  declare invoice_tranid: string; // b.tranid

  @Column(DataType.DATE)
  declare invoice_trandate: Date; // b.trandate

  @Column(DataType.DATE)
  declare invoice_duedate: Date; // b.duedate

  // Amount remaining en el custom record (relación pago–factura)
  @Column(DataType.FLOAT)
  declare custrecord_amountremaining: number; // cb.custrecord_amountremaining

  @Column(DataType.DATE)
  declare link_lastmodified: Date; // cb.link_lastmodified

}