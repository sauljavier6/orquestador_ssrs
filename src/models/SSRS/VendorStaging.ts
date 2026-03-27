// src/models/VendorStaging.ts
import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey
} from "sequelize-typescript";

@Table({
  tableName: "VendorStaging",
  timestamps: false
})
export default class VendorStaging extends Model {

  @PrimaryKey
  @Column({
    type: DataType.INTEGER
  })
  declare id: number;

  @Column(DataType.STRING)
  declare entityid: string;

  @Column(DataType.STRING)
  declare companyname: string;

  @Column(DataType.STRING)
  declare legalname: string;

  @Column(DataType.STRING)
  declare fullname: string;

  @Column(DataType.STRING)
  declare email: string;

  @Column(DataType.STRING)
  declare phone: string;

  @Column(DataType.STRING)
  declare rfc: string;

  @Column(DataType.DECIMAL(18,2))
  declare balance: number;

  @Column(DataType.INTEGER)
  declare payablesaccount: number;

  @Column(DataType.STRING)
  declare terms: string;

  @Column(DataType.STRING)
  declare currency: string;

  @Column(DataType.DATE)
  declare datecreated: Date;

  @Column(DataType.DATE)
  declare lastmodifieddate: Date;

  @Column(DataType.BOOLEAN)
  declare isinactive: boolean;

  @Column(DataType.STRING)
  declare clasificacionProveedor: string;

  @Column(DataType.STRING)
  declare tipoProveedor: string;  
}