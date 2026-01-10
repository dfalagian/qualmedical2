import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, Package, DollarSign, Calendar, User, FileText } from "lucide-react";
import { formatSupplierName } from "@/lib/formatters";

interface PurchaseOrderItem {
  id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_received: number | null;
  unit_price: number | null;
  products?: {
    id: string;
    name: string;
    sku: string;
  } | null;
}

interface PurchaseOrder {
  id: string;
  order_number: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
    company_name: string | null;
  } | null;
  purchase_order_items?: PurchaseOrderItem[];
}

interface PurchaseOrderDetailDialogProps {
  order: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PurchaseOrderDetailDialog({
  order,
  open,
  onOpenChange,
}: PurchaseOrderDetailDialogProps) {
  if (!order) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completada":
        return <Badge className="bg-success">Completada</Badge>;
      case "cancelada":
        return <Badge variant="destructive">Cancelada</Badge>;
      case "en_proceso":
        return <Badge className="bg-warning">En Proceso</Badge>;
      default:
        return <Badge variant="secondary">Pendiente</Badge>;
    }
  };

  const totalOrdered = order.purchase_order_items?.reduce(
    (sum, item) => sum + item.quantity_ordered,
    0
  ) || 0;

  const totalReceived = order.purchase_order_items?.reduce(
    (sum, item) => sum + (item.quantity_received || 0),
    0
  ) || 0;

  const progressPercentage = totalOrdered > 0 
    ? Math.round((totalReceived / totalOrdered) * 100) 
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Orden de Compra: {order.order_number}
          </DialogTitle>
          <DialogDescription>
            Detalle completo de la orden de compra
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Header Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  Proveedor
                </div>
                <p className="font-medium">{formatSupplierName(order.profiles)}</p>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Fecha de Creación
                </div>
                <p className="font-medium">
                  {new Date(order.created_at).toLocaleDateString('es-MX', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  Monto Total
                </div>
                <p className="text-xl font-bold text-primary">
                  ${order.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {order.currency}
                </p>
              </div>
              
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Estado</div>
                <div>{getStatusBadge(order.status)}</div>
              </div>
            </div>

            {order.description && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    Descripción
                  </div>
                  <p className="text-sm">{order.description}</p>
                </div>
              </>
            )}

            <Separator />

            {/* Progress */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Progreso de Recepción</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {totalReceived} / {totalOrdered} unidades ({progressPercentage}%)
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>

            <Separator />

            {/* Items List */}
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Package className="h-4 w-4" />
                Productos ({order.purchase_order_items?.length || 0})
              </h4>
              
              {order.purchase_order_items && order.purchase_order_items.length > 0 ? (
                <div className="space-y-2">
                  {order.purchase_order_items.map((item) => {
                    const itemProgress = item.quantity_ordered > 0
                      ? Math.round(((item.quantity_received || 0) / item.quantity_ordered) * 100)
                      : 0;
                    
                    return (
                      <div 
                        key={item.id} 
                        className="p-3 border rounded-lg bg-muted/20"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {item.products?.name || 'Producto no encontrado'}
                            </p>
                            {item.products?.sku && (
                              <p className="text-xs text-muted-foreground">
                                SKU: {item.products.sku}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            {item.unit_price && (
                              <p className="text-sm font-medium">
                                ${item.unit_price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        <div className="mt-2 flex items-center gap-3">
                          <div className="flex-1">
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 ${
                                  itemProgress === 100 ? 'bg-success' : 
                                  itemProgress > 0 ? 'bg-warning' : 'bg-muted-foreground/30'
                                }`}
                                style={{ width: `${itemProgress}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {item.quantity_received || 0} / {item.quantity_ordered}
                          </span>
                          <Badge 
                            variant={itemProgress === 100 ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {itemProgress}%
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay productos en esta orden
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
