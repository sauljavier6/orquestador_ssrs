// @/models.ts
import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Rol from "./Rol";
import Email from "./Email";
import Phone from "./Phone";

@Table({ tableName: "Users" })
export default class Users extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.INTEGER,
  })
  declare ID_User: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare Name: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare ID_Netsuite: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare NumeroCliente: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare Companyname: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare RFC: string;

  //rol
  @ForeignKey(() => Rol)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare ID_Rol: number;

  @BelongsTo(() => Rol)
  rol?: Rol;

  //email
  @ForeignKey(() => Email)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare ID_Email: number;

  @BelongsTo(() => Email)
  Email?: Email;

  //phone
  @ForeignKey(() => Phone)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare ID_Phone: number;

  @BelongsTo(() => Phone)
  Phone?: Phone;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare Imagen: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare Password: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare ResetToken: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare ResetTokenExpires: Date | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
    defaultValue: true,
  })
  declare State: boolean;
}
