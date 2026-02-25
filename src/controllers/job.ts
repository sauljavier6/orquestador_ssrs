// controller sincronización facturas
import { NetSuiteService } from "../services/nsAuth.service";
import FacturaLinea from "../models/Lineas";
import Pago from "../models/Pagos";
import sequelize from "../config/database";
import Factura from "../models/Facturas";
import { Op } from "sequelize";

const toNumber = (value: unknown, defaultValue = 0): number => {
  if (value === null || value === undefined || value === "")
    return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

export const sincronizarFacturas = async (req: any, res: any) => {
  console.log("entro");
  try {
    let page = 0;
    let hasMore = true;
    const MAX_PAGES = 1; // protección customsearch4792
    const searchId = String(
      req.query.searchId ??
        process.env.NS_INVOICE_SEARCH_ID ??
        "customsearch4792",
    );

    while (hasMore && page < MAX_PAGES) {
      const data = await NetSuiteService.executeSavedSearch<any>(
        searchId,
        page,
      );

      if (!data || !Array.isArray(data.items)) {
        throw new Error(`Respuesta inválida en página ${page}`);
      }

      if (data.items.length === 0) {
        console.log(`Página ${page} sin registros`);
        break;
      }

      console.log(
        `Sincronizando búsqueda ${searchId} página ${page} - registros: ${data.items.length}`,
      );

      // Iniciamos transacción
      await sequelize.transaction(async (t) => {
        for (const f of data.items) {

          console.log('f ', f )
          await Factura.upsert(
            {
              NetsuiteInvoiceId: f.internalId,
              Tranid: f.tranId,
              ClienteNetsuiteID: f.customerId,
              FechaFactura: f.date,
              Status: f.status,
              SaldoPendiente: toNumber(f.saldoPendiente),
              Total: toNumber(f.total),
              SubTotal: toNumber(f.total - f.impuestos),
              Impuestos: toNumber(f.impuestos),
              Currency: f.currency,
              Location: f.location
            },
            { transaction: t, returning: true },
          );

          const facturaRegistro = await Factura.findOne({
            where: { NetsuiteInvoiceId: String(f.internalId) },
            attributes: ["ID_Factura"],
            transaction: t,
          });

          const facturaId = facturaRegistro?.ID_Factura;
          if (!facturaId) {
            throw new Error(
              `No se pudo resolver ID_Factura para NetsuiteInvoiceId=${f.internalId}`,
            );
          }

          const lines = Array.isArray(f.lines) ? f.lines : [];
          const incomingLineKeys: string[] = [];

          for (let idx = 0; idx < lines.length; idx++) {
            const l = lines[idx];
            const lineaKey = `${f.internalId}-${idx + 1}`;
            incomingLineKeys.push(lineaKey);

            await FacturaLinea.upsert(
              {
                LineaKey: lineaKey,
                ID_Factura: facturaId,
                ItemId: String(l.itemId ?? ""),
                ItemName: l.itemName ?? null,
                Quantity: toNumber(l.quantity),
                Rate: toNumber(l.rate),
                Amount: toNumber(l.amount),
                TaxCode: l.taxCode ?? null,
              },
              { transaction: t },
            );
          }

          if (incomingLineKeys.length > 0) {
            await FacturaLinea.destroy({
              where: {
                ID_Factura: facturaId,
                LineaKey: { [Op.notIn]: incomingLineKeys },
              },
              transaction: t,
            });
          }

          const pagos = Array.isArray(f.pagos) ? f.pagos : [];
          const incomingPagoKeys: string[] = [];

          for (let idx = 0; idx < pagos.length; idx++) {
            const p = pagos[idx];
            const pagoId = String(p.paymentId ?? `nopayment-${idx + 1}`);
            const pagoKey = `${f.internalId}-${pagoId}`;
            incomingPagoKeys.push(pagoKey);

            await Pago.upsert(
              {
                PagoKey: pagoKey,
                ID_Factura: facturaId,
                NetsuitePaymentId: pagoId,
                PaymentTranId: p.paymentTranId ? String(p.paymentTranId) : null,
                FechaPago: p.fechaPago,
                MontoPago: toNumber(p.montoPago),
                PaymentMethod: p.paymentmethod
              },
              { transaction: t },
            );
          }

          if (incomingPagoKeys.length > 0) {
            await Pago.destroy({
              where: {
                ID_Factura: facturaId,
                PagoKey: { [Op.notIn]: incomingPagoKeys },
              },
              transaction: t,
            });
          }

          console.log(
            `Factura ${f.tranId} guardada con ${lines.length} líneas y ${pagos.length} pagos`,
          );
        }
      });

      hasMore = Boolean(data.hasMore);
      page++;
    }

    console.log("Sincronización de facturas finalizada");
    res.status(200).json({
      message: "Sincronización completada",
      pagesProcessed: page,
    });
  } catch (error: any) {
    console.error("Error sincronizando facturas:", error.message);
    res.status(500).json({
      message: "Error sincronizando facturas",
      error: error.message,
    });
  }
};


export const sincronizarLocations = async (req: any, res: any) => {
  console.log("entro");
  try {
    
      const locations = await NetSuiteService.getAllLocations();

      console.log("locations", locations);

    console.log("Sincronización de facturas finalizada");
    res.status(200).json({
      message: "Sincronización completada",
      data: locations
    });
  } catch (error: any) {
    console.error("Error sincronizando facturas:", error.message);
    res.status(500).json({
      message: "Error sincronizando facturas",
      error: error.message,
    });
  }
};