import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
  AutoIncrement,
} from "sequelize-typescript";


@Table({ tableName: "NotificationReads" })
export default class NotificationReads extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column(DataType.INTEGER)
  declare NotificationId: number;

  @Column(DataType.INTEGER)
  declare ID_Customer: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
  })
  declare isRead: boolean;

  @Column(DataType.DATE)
  declare readAt: Date;
}