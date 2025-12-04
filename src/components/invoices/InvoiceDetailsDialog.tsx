import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Building2, FileText, DollarSign, Calendar, MapPin } from "lucide-react";

interface InvoiceItem {
  id: string;
  clave_prod_serv: string;
  clave_unidad: string;
  unidad: string;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  importe: number;
  descuento: number;
}

interface ImpuestosDetalle {
  traslados?: Array<{
    impuesto: string;
    tipo_factor: string;
    tasa_o_cuota: string;
    base: number;
    importe: number;
  }>;
  retenciones?: Array<{
    impuesto: string;
    importe: number;
  }>;
}

interface InvoiceDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    invoice_number: string;
    uuid?: string;
    fecha_emision?: string;
    lugar_expedicion?: string;
    forma_pago?: string;
    metodo_pago?: string;
    emisor_nombre?: string;
    emisor_rfc?: string;
    emisor_regimen_fiscal?: string;
    receptor_nombre?: string;
    receptor_rfc?: string;
    receptor_uso_cfdi?: string;
    subtotal?: number;
    descuento?: number;
    total_impuestos?: number;
    impuestos_detalle?: ImpuestosDetalle;
    amount: number;
    currency: string;
    status: string;
  } | null;
  items?: InvoiceItem[];
}

export function InvoiceDetailsDialog({ open, onOpenChange, invoice, items = [] }: InvoiceDetailsDialogProps) {
  if (!invoice) return null;

  const formatCurrency = (value?: number) => {
    if (!value) return '$0.00';
    return `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pagado':
        return 'bg-success';
      case 'procesando':
        return 'bg-warning';
      case 'rechazado':
        return 'bg-destructive';
      default:
        return 'bg-secondary';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <FileText className="h-6 w-6" />
            Factura {invoice.invoice_number}
          </DialogTitle>
          <DialogDescription>
            Detalles completos de la factura fiscal
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Encabezado con información general */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-accent/5 border">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Fecha:</span>
                <span>{formatDate(invoice.fecha_emision)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Lugar:</span>
                <span>{invoice.lugar_expedicion || 'N/A'}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">UUID:</span>
                <span className="text-xs font-mono">{invoice.uuid || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Estado:</span>
                <Badge className={getStatusColor(invoice.status)}>
                  {invoice.status}
                </Badge>
              </div>
            </div>
          </div>

          {/* Emisor */}
          {invoice.emisor_nombre && (
            <>
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Emisor
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium">Nombre:</span> {invoice.emisor_nombre}
                  </div>
                  <div>
                    <span className="font-medium">RFC:</span> {invoice.emisor_rfc}
                  </div>
                  {invoice.emisor_regimen_fiscal && (
                    <div className="col-span-2">
                      <span className="font-medium">Régimen Fiscal:</span> {invoice.emisor_regimen_fiscal}
                    </div>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Receptor */}
          {invoice.receptor_nombre && (
            <>
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Receptor
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium">Nombre:</span> {invoice.receptor_nombre}
                  </div>
                  <div>
                    <span className="font-medium">RFC:</span> {invoice.receptor_rfc}
                  </div>
                  {invoice.receptor_uso_cfdi && (
                    <div className="col-span-2">
                      <span className="font-medium">Uso CFDI:</span> {invoice.receptor_uso_cfdi}
                    </div>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Información de pago */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Información de Pago
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {invoice.forma_pago && (
                <div>
                  <span className="font-medium">Forma de Pago:</span> {invoice.forma_pago}
                </div>
              )}
              {invoice.metodo_pago && (
                <div>
                  <span className="font-medium">Método de Pago:</span> {invoice.metodo_pago}
                </div>
              )}
            </div>
          </div>
          <Separator />

          {/* Conceptos/Artículos */}
          {items && items.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Conceptos</h3>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Precio Unit.</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.descripcion}</div>
                            {item.unidad && (
                              <div className="text-xs text-muted-foreground">
                                Unidad: {item.unidad}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{item.cantidad}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.valor_unitario)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.importe)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Totales */}
          <div className="border-t pt-4">
            <div className="space-y-2 max-w-md ml-auto">
              {invoice.subtotal !== undefined && (
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
                </div>
              )}
              {invoice.descuento !== undefined && invoice.descuento > 0 && (
                <div className="flex justify-between text-sm text-success">
                  <span>Descuento:</span>
                  <span className="font-medium">-{formatCurrency(invoice.descuento)}</span>
                </div>
              )}
              
              {/* Impuestos Trasladados (IVA) - usar total_impuestos que viene del XML */}
              {invoice.total_impuestos !== undefined && invoice.total_impuestos > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Impuestos (IVA 16%):</span>
                  <span className="font-medium">{formatCurrency(invoice.total_impuestos)}</span>
                </div>
              )}
              
              {/* Impuestos Retenidos (ISR) */}
              {(() => {
                const impuestosDetalle = invoice.impuestos_detalle as ImpuestosDetalle | undefined;
                const isrRetencion = impuestosDetalle?.retenciones?.find(r => r.impuesto === '001');
                const importeISR = isrRetencion?.importe || 0;
                
                if (importeISR > 0) {
                  return (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>Impuestos retenidos (ISR 1.25%):</span>
                      <span className="font-medium">-{formatCurrency(importeISR)}</span>
                    </div>
                  );
                }
                return null;
              })()}
              
              {/* IVA Retenido si existe */}
              {(() => {
                const impuestosDetalle = invoice.impuestos_detalle as ImpuestosDetalle | undefined;
                const ivaRetencion = impuestosDetalle?.retenciones?.find(r => r.impuesto === '002');
                const importeIVARetenido = ivaRetencion?.importe || 0;
                
                if (importeIVARetenido > 0) {
                  return (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>IVA Retenido:</span>
                      <span className="font-medium">-{formatCurrency(importeIVARetenido)}</span>
                    </div>
                  );
                }
                return null;
              })()}
              
              <Separator />
              
              {/* Total: usar invoice.amount que viene directamente del XML */}
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span className="text-primary">{formatCurrency(invoice.amount)} {invoice.currency}</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
