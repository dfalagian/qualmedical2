// Parser de facturas CFDI (XML) para facturas de venta.
// Extraído de SalesInvoiceUpload para reutilizarlo en otros flujos
// (ej. subir factura desde el modal Vincular factura).

export interface ParsedCfdiInvoice {
  folio: string;
  uuid: string;
  fecha_emision: string | null;
  subtotal: number;
  total: number;
  currency: string;
  emisor_nombre: string;
  emisor_rfc: string;
  receptor_nombre: string;
  receptor_rfc: string;
  items: Array<{
    clave_prod_serv: string;
    clave_unidad: string;
    descripcion: string;
    cantidad: number;
    unidad: string;
    valor_unitario: number;
    importe: number;
    descuento: number;
  }>;
}

export const parseXmlContent = (xmlContent: string): ParsedCfdiInvoice => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

  // Check for XML parsing errors
  const parseError = xmlDoc.getElementsByTagName("parsererror");
  if (parseError.length > 0) {
    throw new Error(`XML mal formado - no se puede parsear`);
  }

  // Helper function to find elements by local name (ignoring namespace prefix)
  const findElement = (doc: Document, localName: string): Element | null => {
    const prefixes = ["cfdi:", "tfd:", "pago20:", "pago10:", ""];
    for (const prefix of prefixes) {
      const elements = doc.getElementsByTagName(prefix + localName);
      if (elements.length > 0) return elements[0];
    }
    const allElements = doc.getElementsByTagName("*");
    for (let i = 0; i < allElements.length; i++) {
      if (allElements[i].localName === localName) {
        return allElements[i];
      }
    }
    return null;
  };

  // Helper function to find all elements by local name
  const findAllElements = (doc: Document, localName: string): Element[] => {
    const results: Element[] = [];
    const prefixes = ["cfdi:", "tfd:", ""];
    for (const prefix of prefixes) {
      const elements = doc.getElementsByTagName(prefix + localName);
      for (let i = 0; i < elements.length; i++) {
        results.push(elements[i]);
      }
      if (results.length > 0) return results;
    }
    const allElements = doc.getElementsByTagName("*");
    for (let i = 0; i < allElements.length; i++) {
      if (allElements[i].localName === localName) {
        results.push(allElements[i]);
      }
    }
    return results;
  };

  const comprobante = findElement(xmlDoc, "Comprobante");

  if (!comprobante) {
    throw new Error(`No contiene elemento 'Comprobante' - no es un CFDI válido`);
  }

  // Check if it's a payment complement (tipo P)
  const tipoComprobante = comprobante.getAttribute("TipoDeComprobante");
  if (tipoComprobante === "P") {
    throw new Error(`Es un Complemento de Pago (tipo P), no una factura de ingreso`);
  }

  const folio = comprobante.getAttribute("Folio") || "";
  const serie = comprobante.getAttribute("Serie") || "";
  const fecha = comprobante.getAttribute("Fecha") || "";
  const subtotal = parseFloat(comprobante.getAttribute("SubTotal") || "0");
  const total = parseFloat(comprobante.getAttribute("Total") || "0");
  const moneda = comprobante.getAttribute("Moneda") || "MXN";

  if (total === 0 && subtotal === 0) {
    throw new Error(`No tiene montos válidos (Total y SubTotal son 0)`);
  }

  const timbre = findElement(xmlDoc, "TimbreFiscalDigital");
  const uuid = timbre?.getAttribute("UUID") || null;

  if (!uuid) {
    throw new Error(`No tiene UUID (TimbreFiscalDigital) - factura no timbrada`);
  }

  const emisor = findElement(xmlDoc, "Emisor");
  const emisorNombre = emisor?.getAttribute("Nombre") || "";
  const emisorRfc = emisor?.getAttribute("Rfc") || "";

  if (!emisorRfc) {
    throw new Error(`No tiene RFC del emisor`);
  }

  const receptor = findElement(xmlDoc, "Receptor");
  const receptorNombre = receptor?.getAttribute("Nombre") || "";
  const receptorRfc = receptor?.getAttribute("Rfc") || "";

  const conceptosElements = findAllElements(xmlDoc, "Concepto");
  const items = conceptosElements.map((concepto) => ({
    clave_prod_serv: concepto.getAttribute("ClaveProdServ") || "",
    clave_unidad: concepto.getAttribute("ClaveUnidad") || "",
    descripcion: concepto.getAttribute("Descripcion") || "",
    cantidad: parseFloat(concepto.getAttribute("Cantidad") || "0"),
    unidad: concepto.getAttribute("Unidad") || "",
    valor_unitario: parseFloat(concepto.getAttribute("ValorUnitario") || "0"),
    importe: parseFloat(concepto.getAttribute("Importe") || "0"),
    descuento: parseFloat(concepto.getAttribute("Descuento") || "0"),
  }));

  const generatedFolio = serie && folio
    ? `${serie}-${folio}`
    : folio || uuid?.substring(0, 8) || `SIN-FOLIO-${Date.now()}`;

  return {
    folio: generatedFolio,
    uuid,
    fecha_emision: fecha ? new Date(fecha).toISOString() : null,
    subtotal,
    total: total || subtotal,
    currency: moneda,
    emisor_nombre: emisorNombre,
    emisor_rfc: emisorRfc,
    receptor_nombre: receptorNombre,
    receptor_rfc: receptorRfc,
    items,
  };
};
