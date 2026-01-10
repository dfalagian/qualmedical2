import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Download, Check, ShoppingCart, Package, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExternalPurchaseOrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products?: {
    id: string;
    name: string;
    brand?: string;
    presentacion?: string;
  };
}

interface ExternalPurchaseOrder {
  id: string;
  order_number: string;
  supplier_id?: string;
  supplier_name?: string;
  total_amount: number;
  status?: string;
  created_at: string;
  items?: ExternalPurchaseOrderItem[];
  profiles?: {
    full_name?: string;
    company_name?: string;
  };
}

interface PurchaseOrderImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (orders: ExternalPurchaseOrder[]) => void;
  existingOrderNumbers: string[];
}

export function PurchaseOrderImportDialog({
  open,
  onOpenChange,
  onImport,
  existingOrderNumbers,
}: PurchaseOrderImportDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrders, setSelectedOrders] = useState<ExternalPurchaseOrder[]>([]);

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ['external-purchase-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-external-purchase-orders');
      
      if (error) throw error;
      
      // The external API returns { data: { success, count, orders: [...] } }
      const result = data?.data;
      
      if (result?.orders && Array.isArray(result.orders)) {
        return result.orders as ExternalPurchaseOrder[];
      } else if (result?.purchase_orders && Array.isArray(result.purchase_orders)) {
        return result.purchase_orders as ExternalPurchaseOrder[];
      } else if (Array.isArray(result)) {
        return result as ExternalPurchaseOrder[];
      }
      
      console.log('External orders response:', data);
      return [] as ExternalPurchaseOrder[];
    },
    enabled: open,
  });

  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    
    const term = searchTerm.toLowerCase();
    return orders.filter(
      (order) =>
        order.order_number?.toLowerCase().includes(term) ||
        order.supplier_name?.toLowerCase().includes(term) ||
        order.profiles?.company_name?.toLowerCase().includes(term) ||
        order.profiles?.full_name?.toLowerCase().includes(term)
    );
  }, [orders, searchTerm]);

  const handleToggleSelect = (order: ExternalPurchaseOrder) => {
    setSelectedOrders((prev) => {
      const isSelected = prev.some((o) => o.id === order.id);
      if (isSelected) {
        return prev.filter((o) => o.id !== order.id);
      } else {
        return [...prev, order];
      }
    });
  };

  const handleImport = () => {
    if (selectedOrders.length > 0) {
      onImport(selectedOrders);
      setSelectedOrders([]);
      setSearchTerm("");
    }
  };

  const isAlreadyImported = (orderNumber: string) => 
    existingOrderNumbers.includes(orderNumber);

  const isSelected = (orderId: string) => 
    selectedOrders.some((o) => o.id === orderId);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "completada":
        return <Badge className="bg-success text-xs">Completada</Badge>;
      case "cancelada":
        return <Badge variant="destructive" className="text-xs">Cancelada</Badge>;
      case "en_proceso":
        return <Badge className="bg-warning text-xs">En Proceso</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Pendiente</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Importar Órdenes de Compra desde CITIO
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número de orden o proveedor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[400px] border rounded-md">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
              <p className="text-destructive font-medium">Error al cargar órdenes de compra</p>
              <p className="text-sm text-muted-foreground mt-1">
                Verifica la conexión con el sistema CITIO
              </p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No se encontraron órdenes de compra</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {filteredOrders.map((order) => {
                const imported = isAlreadyImported(order.order_number);
                const selected = isSelected(order.id);
                const supplierName = order.supplier_name || 
                  order.profiles?.company_name || 
                  order.profiles?.full_name || 
                  "Sin proveedor";
                
                return (
                  <button
                    key={order.id}
                    onClick={() => !imported && handleToggleSelect(order)}
                    disabled={imported}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all",
                      imported
                        ? "bg-muted/30 opacity-60 cursor-not-allowed"
                        : selected
                        ? "bg-primary/10 border-primary ring-1 ring-primary"
                        : "hover:bg-accent hover:border-accent-foreground/20"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{order.order_number}</span>
                          {getStatusBadge(order.status)}
                          {imported && (
                            <Badge variant="outline" className="text-green-600 text-xs">
                              <Check className="h-3 w-3 mr-0.5" />
                              Importada
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          Proveedor: {supplierName}
                        </p>
                        {order.items && order.items.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <Package className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {order.items.length} producto(s)
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="text-right shrink-0">
                        <p className="font-bold text-primary">
                          ${order.total_amount?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) || '0.00'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(order.created_at)}
                        </p>
                        {selected && !imported && (
                          <Check className="h-5 w-5 text-primary ml-auto mt-1" />
                        )}
                      </div>
                    </div>
                    
                    {/* Show items preview */}
                    {order.items && order.items.length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <div className="flex flex-wrap gap-1">
                          {order.items.slice(0, 3).map((item, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {item.products?.name || `Producto ${idx + 1}`} x{item.quantity}
                            </Badge>
                          ))}
                          {order.items.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{order.items.length - 3} más
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {selectedOrders.length > 0 && (
          <div className="p-3 bg-primary/5 border rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  {selectedOrders.length} orden(es) seleccionada(s)
                </div>
                <div className="text-xs text-muted-foreground">
                  Total: ${selectedOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedOrders([])}
              >
                Limpiar selección
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button 
            onClick={handleImport} 
            disabled={selectedOrders.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Importar {selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
