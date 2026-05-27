import {
    Table,
    Model,
    Column,
    DataType,
    PrimaryKey,
} from "sequelize-typescript";

@Table({
    tableName: "CustomerPaymentAplication",
    timestamps: false,
})
export default class CustomerPaymentAplication extends Model {
    @PrimaryKey
    @Column({
        type: DataType.BIGINT,
        allowNull: false,
    })
    declare payment_id: number; //nextdoc

    @PrimaryKey
    @Column({
        type: DataType.BIGINT,
        allowNull: false,
    })
    declare invoice_id: number; // previousdoc

    @Column(DataType.FLOAT)
    declare amount: number; //foreignamount

    @Column(DataType.STRING)
    declare nexttype: string; //nexttype

    @Column(DataType.STRING)
    declare previoustype: string; //previoustype

    @Column(DataType.DATE)
    declare payment_trandate: Date; //nextdate

    @Column(DataType.DATE)
    declare invoice_trandate: Date; //previousdate

    @Column(DataType.STRING)
    declare status: string; //discount

    @Column(DataType.DATE)
    declare lastmodifieddate: Date; //lastmodifieddate

}