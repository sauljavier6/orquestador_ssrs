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

  @PrimaryKey
  @Column({
    type: DataType.BIGINT,
    autoIncrement: true
  })
  declare ID_Staging: number;

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  declare link_id: number;

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  declare payment_id: number;

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  declare invoice_id: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare payment_tranid: string;

  @Column(DataType.DATE)
  declare payment_trandate: Date;

  @Column(DataType.FLOAT)
  declare foreigntotal: number;

  @Column(DataType.STRING)
  declare currency: string;

  @Column(DataType.FLOAT)
  declare balance: number;

  @Column(DataType.DATE)
  declare payment_lastmodified: Date;

  @Column(DataType.STRING)
  declare payment_status: string;

  @Column(DataType.BIGINT)
  declare vendor: number;

  @Column(DataType.STRING)
  declare invoice_tranid: string;

  @Column(DataType.DATE)
  declare invoice_trandate: Date;

  @Column(DataType.DATE)
  declare invoice_duedate: Date;

  @Column(DataType.FLOAT)
  declare custrecord_amountremaining: number;

  @Column(DataType.DATE)
  declare link_lastmodified: Date;

}