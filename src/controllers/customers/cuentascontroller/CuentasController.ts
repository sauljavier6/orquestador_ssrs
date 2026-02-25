import { Request, Response } from "express";
import { fn, col, Op } from "sequelize";
import Factura from "../../../models/Facturas";
import FacturaLinea from "../../../models/Lineas";

type SumResult = { totalPendiente: number | string | null };
type DateResult = { FechaVencimiento?: Date | string | null; FechaFactura?: Date | string | null };

export const getCuentas = async (req: Request, res: Response) => {
  try {
    const customerId = Number((req as any).user?.netsuiteId);
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 10), 1000);
    const offset = (page - 1) * pageSize;

    //Facturas del cliente con líneas
    const invoices = await Factura.findAll({
      where: { ClienteNetsuiteID: String(customerId) },
      order: [["FechaFactura", "DESC"]],
      offset,
      limit: pageSize,
      raw: true,
      nest: true,
    });

    //Sumatoria de SaldoPendiente
    const totalSaldoPendienteRes = (await Factura.findOne({
      where: { ClienteNetsuiteID: String(customerId) },
      attributes: [[fn("SUM", col("SaldoPendiente")), "totalPendiente"]],
      raw: true,
    })) as SumResult | null;
    const TotalSaldoPendiente = Number(totalSaldoPendienteRes?.totalPendiente ?? 0);

    //Fecha de factura con vencimiento más próxima
    const proxVencimientoRes = (await Factura.findOne({
      where: {
        ClienteNetsuiteID: String(customerId),
        SaldoPendiente: { [Op.gt]: 0 },
      },
      order: [["FechaVencimiento", "ASC"]],
      attributes: ["FechaVencimiento"],
      raw: true,
    })) as DateResult | null;
    const ProximoVencimiento = proxVencimientoRes?.FechaVencimiento ?? null;

    //Último pago (suponiendo que lo tienes como campo FechaPago o similar)
    const ultimoPagoRes = (await Factura.findOne({
      where: { ClienteNetsuiteID: String(customerId), SaldoPendiente: 0 },
      order: [["FechaFactura", "DESC"]],
      attributes: ["FechaFactura"],
      raw: true,
    })) as DateResult | null;
    const UltimoPago = ultimoPagoRes?.FechaFactura ?? null;

    //Variación contra mes anterior
    const startMesAnterior = new Date();
    startMesAnterior.setMonth(startMesAnterior.getMonth() - 1);
    startMesAnterior.setDate(1);
    startMesAnterior.setHours(0, 0, 0, 0);

    const endMesAnterior = new Date();
    endMesAnterior.setMonth(endMesAnterior.getMonth() - 1);
    endMesAnterior.setDate(
      new Date(endMesAnterior.getFullYear(), endMesAnterior.getMonth() + 1, 0).getDate()
    );
    endMesAnterior.setHours(23, 59, 59, 999);

    const saldoMesAnteriorRes = (await Factura.findOne({
      where: {
        ClienteNetsuiteID: String(customerId),
        FechaFactura: { [Op.between]: [startMesAnterior, endMesAnterior] },
      },
      attributes: [[fn("SUM", col("SaldoPendiente")), "totalPendiente"]],
      raw: true,
    })) as SumResult | null;
    const SaldoMesAnterior = Number(saldoMesAnteriorRes?.totalPendiente ?? 0);

    const variacion =
      SaldoMesAnterior === 0
        ? TotalSaldoPendiente > 0
          ? { percent: 0, trend: "up", label: "Nuevo saldo este mes" }
          : { percent: 0, trend: "flat", label: "Sin cambios" }
        : (() => {
            const diff = TotalSaldoPendiente - SaldoMesAnterior;
            const percent = (diff / SaldoMesAnterior) * 100;
            return {
              percent: Number(percent.toFixed(2)),
              trend: percent > 0 ? "up" : percent < 0 ? "down" : "flat",
              label: "vs mes anterior",
            };
          })();

    //Agregar estado a cada factura
    const invoicesConEstado = invoices.map((f: any) => {
      const amountRemaining = Number(f.SaldoPendiente ?? 0);
      const dueDate = f.FechaVencimiento;
      let estado = { label: "", color: "" };

      if (amountRemaining <= 0) {
        estado = { label: "Pagada", color: "bg-green-100 text-green-700" };
      } else {
        const hoy = new Date();
        const vence = new Date(dueDate);
        const diffDays = (vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < 0) estado = { label: "Atrasado", color: "bg-red-100 text-red-700" };
        else if (diffDays <= 5) estado = { label: "Por vencer", color: "bg-blue-100 text-blue-700" };
        else estado = { label: "Pendiente", color: "bg-amber-100 text-amber-700" };
      }

      return { ...f, estado };
    });

    const total = await Factura.count({ where: { ClienteNetsuiteID: String(customerId) } });
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      page,
      pageSize,
      total,
      totalPages,
      invoices: invoicesConEstado,
      resumen: {
        TotalSaldoPendiente,
        SaldoMesAnterior,
        ProximoVencimiento,
        UltimoPago,
        variacion,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error obteniendo facturas" });
  }
};
