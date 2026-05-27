import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey
} from "sequelize-typescript";

@Table({
  tableName: "CustomerInvoiceLineStaging",
  timestamps: false
})
export default class CustomerInvoiceLineStaging extends Model {

  @PrimaryKey
  @Column({
    type: DataType.BIGINT,
    autoIncrement: true
  })
  declare ID_Staging: number;


  @Column({
    type: DataType.BIGINT,
    allowNull: false
  })
  declare customer_invoice_id: number;

  @Column({
    type: DataType.BIGINT,
    allowNull: false
  })
  declare lineuniquekey: number;

  @Column(DataType.BIGINT)
  declare lineorder: number;

  @Column(DataType.STRING)
  declare item: string;

  @Column(DataType.TEXT)
  declare description: string;

  @Column(DataType.DECIMAL(18, 4))
  declare quantity: number;

  @Column(DataType.STRING)
  declare units: string;

  @Column(DataType.DECIMAL(18, 4))
  declare rate: number;

  @Column(DataType.DECIMAL(18, 4))
  declare amount: number;

  @Column(DataType.DECIMAL(18, 4))
  declare descuento: number;

  @Column(DataType.STRING)
  declare taxcode: string;

  @Column(DataType.DECIMAL(18, 4))
  declare ratepercent: number;

  @Column(DataType.STRING)
  declare taxtype: string;

  @Column(DataType.STRING)
  declare itemtype: string;

  @Column(DataType.STRING)
  declare account: string;

  @Column(DataType.STRING)
  declare department: string;

  @Column(DataType.STRING)
  declare class: string;

  @Column(DataType.STRING)
  declare location: string;

  @Column(DataType.DATE)
  declare lastmodifieddate: Date;

  @Column(DataType.DATE)
  declare createddate: Date;

}