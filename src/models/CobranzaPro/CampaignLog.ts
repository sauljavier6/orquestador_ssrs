// src/models/CampaignLog.ts

import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
  AutoIncrement,
} from "sequelize-typescript";

@Table({
  tableName: "CampaignLog",
  timestamps: false,
})
export default class CampaignLog extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.BIGINT,
  })
  declare ID_Log: number;

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
    type: DataType.BIGINT,
    allowNull: true,
  })
  declare ID_Invoice: number | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare canal: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare asunto: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare mensaje: string;

  @Column({
    type: DataType.STRING(30),
    allowNull: false,
  })
  declare status: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare error: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare sentAt: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare createdAt: Date;
}