// src/models/CampaignCustomer.ts

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

@Table({
  tableName: "CampaignCustomer",
  timestamps: false,
})
export default class CampaignCustomer extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.BIGINT,
  })
  declare ID_CampaignCustomer: number;

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  declare ID_Campaign: number;

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  declare ID_Customer: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
  })
  declare isinactive: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare createdAt: Date;
}