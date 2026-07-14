import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
  AutoIncrement,
  BelongsTo,
  ForeignKey,
} from "sequelize-typescript";

import Users from "./Users";
import Customer from "./Customer";
import TransactionType from "./TransactionType";

@Table({
  tableName: "Notifications",
  timestamps: true,
})
export default class Notifications extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  // ADMIN | CUSTOMER
  @Column({
    type: DataType.STRING(20),
    allowNull: false,
  })
  declare recipientType: "ADMIN" | "CUSTOMER";

  // Para notificaciones de admin
  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare recipientUserId: number;

  @BelongsTo(() => Users, "recipientUserId")
  recipientUser?: Users;

  // Para notificaciones de cliente
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare recipientCustomerId: number;

  // Usuario que creó/generó la notificación
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare createdByUserId: number;

  // CAMPAIGN | MANUAL_REMINDER | PAYMENT | INVOICE | PROMISE | CALL | SYSTEM
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  declare sourceType: string;

  // ID relacionado: CampaignLog, Payment, Call, Promise, etc.
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare sourceId: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare transactionId: number;

  @ForeignKey(() => TransactionType)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare transactionTypeId: number;

  @BelongsTo(() => TransactionType)
  transactionType?: TransactionType;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
  })
  declare type: "info" | "warning" | "danger" | "success";

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare title: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare message: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false
  })
  declare isRead: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare readAt: Date;
}