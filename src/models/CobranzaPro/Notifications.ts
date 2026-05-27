// @/models.ts
import { Table, Model, Column, DataType, PrimaryKey, AutoIncrement, BelongsTo, ForeignKey } from "sequelize-typescript";
import User from "./Users";
import TransactionType from "./TransactionType";
import Customer from "./Customer";

@Table({ tableName: "Notifications" })
export default class Notifications extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    declare id: number;

    @Column(DataType.INTEGER)
    declare ID_Customer: number;

    //usuario que creo registro
    @ForeignKey(() => User)
    @Column(DataType.INTEGER)
    declare CreateId: number;

    @BelongsTo(() => User)
    user?: User;

    //Id de la transaccion
    @Column(DataType.INTEGER)
    declare ID_Transaction: number;

    //Id tipo de transaccion
    @ForeignKey(() => TransactionType)
    @Column(DataType.INTEGER)
    declare ID_TransactionType: number;

    @BelongsTo(() => TransactionType)
    TransactionType?: TransactionType;

    //Tipo notificacion
    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    declare type: "info" | "warning" | "danger" | "success";

    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    declare description: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    declare message: string;

    @Column({
        type: DataType.BOOLEAN,
        allowNull: false
    })
    declare isRead: boolean;
}