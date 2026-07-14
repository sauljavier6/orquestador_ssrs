// src/models/Customer.ts
import {
    Table,
    Model,
    Column,
    DataType,
    PrimaryKey,
    AutoIncrement,
} from "sequelize-typescript";

@Table({
    tableName: "Campaign ",
    timestamps: false
})
export default class Campaign extends Model {

    @PrimaryKey
    @AutoIncrement
    @Column({
        type: DataType.BIGINT
    })
    declare ID_Campaign: number;

    @Column(DataType.STRING)
    declare nombre: string;

    @Column(DataType.INTEGER)
    declare canal: number;

    @Column(DataType.STRING)
    declare template: string;

    @Column(DataType.STRING)
    declare asunto: string;

    @Column(DataType.INTEGER)
    declare estado: number;

    @Column(DataType.INTEGER)
    declare diasatraso: number;

    @Column(DataType.INTEGER)
    declare repetirpor: number;

    @Column(DataType.INTEGER)
    declare repetircada: number;

    @Column(DataType.TEXT)
    declare mensaje: string;

    @Column(DataType.INTEGER)
    declare createBy: number;

    @Column(DataType.STRING)
    declare isinactive: string;

}