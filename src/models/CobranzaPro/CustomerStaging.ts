// src/models/VendorStaging.ts
import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey
} from "sequelize-typescript";

@Table({
  tableName: "CustomerStaging",
  timestamps: false
})
export default class CustomerStaging extends Model {
  @PrimaryKey
  @Column({
    type: DataType.BIGINT,
    autoIncrement: true
  })
  declare ID_Staging: number;

  @Column({
    type: DataType.BIGINT
  })
  declare id: number;

  @Column(DataType.STRING)
  declare entityid: string;

  @Column(DataType.STRING)
  declare companyname: string;

  @Column(DataType.STRING)
  declare fullname: string;

  @Column(DataType.STRING)
  declare email: string;

  @Column(DataType.STRING)
  declare phone: string;

  @Column(DataType.STRING)
  declare rfc: string;

  @Column(DataType.DECIMAL(18, 2))
  declare balance: number;

  @Column(DataType.DECIMAL(18, 2))
  declare creditlimit: number;

  @Column(DataType.DECIMAL(18, 2))
  declare duebalance: number;

  @Column(DataType.INTEGER)
  declare receivablesaccount: number;

  @Column(DataType.STRING)
  declare terms: string;

  @Column(DataType.STRING)
  declare currency: string;

  @Column(DataType.STRING)
  declare salesrep: string;

  @Column(DataType.DATE)
  declare datecreated: Date;

  @Column(DataType.DATE)
  declare lastmodifieddate: Date;

  @Column(DataType.STRING)
  declare isinactive: string;

  @Column(DataType.STRING)
  declare clasificacionCliente: string;
}