import {
    Table,
    Model,
    Column,
    DataType,
    PrimaryKey,
} from "sequelize-typescript";

@Table({
    tableName: "CustomerPaymentAplicationStaging",
    timestamps: false,
})
export default class CustomerPaymentAplicationStaging extends Model {
    @PrimaryKey
    @Column({
        type: DataType.BIGINT,
        autoIncrement: true
    })
    declare ID_Staging: number;

    @Column({
        type: DataType.BIGINT,
        allowNull: false,
    })
    declare payment_id: number;

    @Column({
        type: DataType.BIGINT,
        allowNull: false,
    })
    declare invoice_id: number;

    @Column(DataType.FLOAT)
    declare amount: number;

    @Column(DataType.STRING)
    declare nexttype: string;

    @Column(DataType.STRING)
    declare previoustype: string;

    @Column(DataType.DATE)
    declare payment_trandate: Date;

    @Column(DataType.DATE)
    declare invoice_trandate: Date;

    @Column(DataType.STRING)
    declare status: string;

    @Column(DataType.DATE)
    declare lastmodifieddate: Date;

}