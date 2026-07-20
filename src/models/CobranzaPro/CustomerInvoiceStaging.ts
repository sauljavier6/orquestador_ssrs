import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey
} from "sequelize-typescript";

@Table({
  tableName: "CustomerInvoiceStaging",
  timestamps: false
})
export default class CustomerInvoiceStaging extends Model {

  @PrimaryKey
  @Column({
    type: DataType.BIGINT,
    autoIncrement: true
  })
  declare ID_Staging: number;

  @Column(DataType.BIGINT)
  declare id: number;

  @Column(DataType.STRING)
  declare tranid: string;

  @Column(DataType.BIGINT)
  declare entity: number;

  @Column(DataType.DATE)
  declare trandate: Date;

  @Column(DataType.DATE)
  declare duedate: Date;

  @Column(DataType.DECIMAL(18, 2))
  declare amount: number;

  @Column(DataType.STRING)
  declare status: string;

  @Column(DataType.STRING)
  declare currency: string;

  @Column(DataType.DECIMAL(18, 2))
  declare subtotal: number;

  @Column(DataType.DECIMAL(18, 2))
  declare tax: number;

  @Column(DataType.DECIMAL(18, 2))
  declare amountpaid: number;

  @Column(DataType.DECIMAL(18, 2))
  declare balance: number;

  @Column(DataType.STRING)
  declare location: string;

  @Column(DataType.STRING)
  declare metododepago: string;

  @Column(DataType.STRING)
  declare estatuspresupuesto: string;

  @Column(DataType.STRING)
  declare uuid: string;

  @Column(DataType.STRING)
  declare idpdf: string;

  @Column(DataType.STRING)
  declare idxml: string;

  @Column(DataType.DATE)
  declare lastmodifieddate: Date;

  @Column(DataType.STRING)
  declare isinactive: string;
}