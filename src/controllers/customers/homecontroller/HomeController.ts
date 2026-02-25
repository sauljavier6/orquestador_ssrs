// src/controllers/client/dashboardController.ts
import FacturaLinea from "../../../models/Lineas";
import Factura from "../../../models/Facturas";
import { fn, col } from "sequelize";

interface AuthenticatedRequest extends Request {
  user: {
    netsuiteId: number;
  };
}

export const getClientDashboard = async (
  req: AuthenticatedRequest,
  res: any,
) => {
  try {
    const customerId = Number(req.user.netsuiteId);

    const invoices = await Factura.findAll({
      where: { ClienteNetsuiteID: String(customerId) },
      include: [
        {
          model: FacturaLinea,
          as: "lineas",
        },
      ],
      order: [["FechaFactura", "DESC"]],
      limit: 5,
    });

    //const totalSaldo = invoices.reduce((acc, f) => acc + (f.SaldoPendiente ?? 0), 0);

    const facturaProxima = await Factura.findOne({
      where: {
        ClienteNetsuiteID: String(customerId),
      },
      order: [["FechaVencimiento", "ASC"]],
      limit: 1,
    });

    const totalSaldoPendiente = await Factura.findOne({
      where: {
        ClienteNetsuiteID: String(customerId),
      },
      attributes: [[fn("SUM", col("SaldoPendiente")), "totalPendiente"]],
      raw: true,
    });


    res.json({
      resumen: {
        totalSaldoPendiente,
        facturaProxima,
        //pagadoEsteMes,
      },
      invoices,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
