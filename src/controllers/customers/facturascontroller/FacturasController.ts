// src/controllers/client/dashboardController.ts
import FacturaLinea from "../../../models/Lineas";
import Factura from "../../../models/Facturas";
import Pagos from "../../../models/Pagos";

export const getfacturaById = async (req: any, res: any) => {
  try {
    const customerId = String(req.user.netsuiteId);
    const idFactura = Number(req.params.id);

    const invoice = await Factura.findOne({
      where: {
        ClienteNetsuiteID: customerId,
        ID_Factura: idFactura,
      },
      include: [
        {
          model: FacturaLinea,
          as: "lineas",
        },
        {
          model: Pagos,
          as: "pagos",
        },
      ],
    });

    res.json(invoice);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
