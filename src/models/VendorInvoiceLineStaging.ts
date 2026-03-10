import {
    Table,
    Model,
    Column,
    DataType,
    PrimaryKey
} from "sequelize-typescript";

@Table({
    tableName: "VendorInvoiceLineStaging",
    timestamps: false
})
export default class VendorInvoiceLineStaging extends Model {

    @PrimaryKey
    @Column({
        type: DataType.BIGINT,
        allowNull: false
    })
    declare vendor_invoice_id: number;

    @PrimaryKey
    @Column({
        type: DataType.BIGINT,
        allowNull: false
    })
    declare lineuniquekey: number;

    @Column(DataType.STRING)
    declare item: string;

    @Column(DataType.STRING)
    declare description: string;

    @Column(DataType.DECIMAL(18, 4))
    declare quantity: number;

    @Column(DataType.STRING)
    declare units: string;

    @Column(DataType.DECIMAL(18, 4))
    declare rate: number;

    @Column(DataType.DECIMAL(18, 4))
    declare amount: number;

    @Column(DataType.STRING)
    declare taxcode: string;

    @Column(DataType.DECIMAL(18, 4))
    declare ratepercent: number;

    @Column(DataType.STRING)
    declare taxtype: string;

    @Column(DataType.STRING)
    declare itemtype: string;

    @Column(DataType.STRING)
    declare account: string;

    @Column(DataType.STRING)
    declare department: string;

    @Column(DataType.STRING)
    declare class: string;

    @Column(DataType.STRING)
    declare location: string;

    @Column(DataType.DATE)
    declare created_at: Date;

    @Column(DataType.DATE)
    declare updated_at: Date;
}