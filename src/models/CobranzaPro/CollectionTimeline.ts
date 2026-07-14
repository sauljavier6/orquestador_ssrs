import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
  AutoIncrement,
} from "sequelize-typescript";


@Table({
  tableName: "CollectionTimeline",
  timestamps: true,
})
export default class CollectionTimeline extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare customerId: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare invoiceId: number | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare paymentId: number | null;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  declare campaignLogId: number | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare callId: number | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare promiseId: number | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare createdByUserId: number | null;

  // EMAIL_SENT | WHATSAPP_SENT | CALL | NOTE | PROMISE | PAYMENT | PAYMENT_APPLIED | INVOICE_CREATED | SYSTEM
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  declare timelineType: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare title: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare description: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare metadataJson: string | null;
}