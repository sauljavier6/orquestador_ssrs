import {
    Table,
    Model,
    Column,
    DataType,
    PrimaryKey,
} from "sequelize-typescript";

@Table({
    tableName: "CustomerContactStaging",
    timestamps: false,
})
export default class CustomerContactStaging extends Model {
    @PrimaryKey
    @Column({
        type: DataType.BIGINT,
        autoIncrement: true
    })
    declare ID_Staging: number;

    @Column(DataType.BIGINT)
    declare id: number;

    @Column(DataType.BIGINT)
    declare company: number;

    @Column(DataType.STRING)
    declare email: string;

    @Column(DataType.STRING)
    declare entityid: string;

    @Column(DataType.STRING)
    declare firstname: string;

    @Column(DataType.STRING)
    declare lastname: string;

    @Column(DataType.STRING)
    declare fullname: string;

    @Column(DataType.STRING)
    declare image: string | null;

    @Column(DataType.STRING)
    declare homephone: string | null;

    @Column(DataType.STRING)
    declare mobilephone: string | null;

    @Column(DataType.BIGINT)
    declare owner: number;

    @Column(DataType.DATE)
    declare lastmodifieddate: Date;

    @Column(DataType.STRING)
    declare isinactive: string;
}