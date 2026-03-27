import { Table, Model, Column, DataType, PrimaryKey, Default } from "sequelize-typescript";

@Table({
  tableName: "SyncControl",
  timestamps: false
})
export default class SyncControl extends Model {

  @PrimaryKey
  @Column({
    type: DataType.STRING(100),
    allowNull: false
  })
  declare process_name: string;

  @Column({
    type: DataType.DATE,
    allowNull: true
  })
  declare last_sync_date: Date;

  @Column({
    type: DataType.BIGINT,
    allowNull: true
  })
  declare last_internal_id: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: true
  })
  declare last_status: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true
  })
  declare last_message: string;

  @Column({
    type: DataType.DATE,
    allowNull: true
  })
  declare updated_at: Date;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false
  })
  declare is_running: boolean;
}