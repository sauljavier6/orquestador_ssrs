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

  @Column(DataType.STRING)
  declare transactionnumber: string;

  @Column(DataType.DATE)
  declare trandate: Date;

  @Column(DataType.DATE)
  declare createddate: Date;

  @Column(DataType.DATE)
  declare lastmodifieddate: Date;

  @Column(DataType.BIGINT)
  declare createdby: number;

  @Column(DataType.BIGINT)
  declare lastmodifiedby: number;

  @Column(DataType.FLOAT)
  declare total: number;

  @Column(DataType.FLOAT)
  declare foreigntotal: number;

  @Column(DataType.FLOAT)
  declare foreignpaymentamountused: number;

  @Column(DataType.FLOAT)
  declare foreignpaymentamountunused: number;

  @Column(DataType.STRING)
  declare status: string;

  @Column(DataType.STRING)
  declare posting: string;

  @Column(DataType.STRING)
  declare voided: string;

  @Column(DataType.STRING)
  declare memo: string;

  @Column(DataType.BIGINT)
  declare entity: number;

  @Column(DataType.STRING)
  declare currency: string;

  @Column(DataType.STRING)
  declare paymentmethod: string;

  @Column(DataType.BIGINT)
  declare postingperiod: number;

  //NUEVOS CAMPOS
  @Column(DataType.BIGINT)
  declare custbody_refjournalentry_iva: number;

  @Column(DataType.BIGINT)
  declare customform: number;

  @Column(DataType.STRING)
  declare isreversal: string; // 'T' | 'F'

  @Column(DataType.STRING)
  declare memorized: string; // 'T' | 'F'
}