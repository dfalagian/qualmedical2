import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Tag, 
  Edit, 
  Trash2, 
  ChevronDown, 
  ChevronRight,
  Package,
  Calendar,
  Boxes,
  Link2,
  Cpu,
  ScanBarcode,
  Warehouse,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { QuickTagAssignment } from "./QuickTagAssignment";

interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  brand?: string | null;
  unit: string;
  minimum_stock: number;
  current_stock: number;
  unit_price: number | null;
  supplier_id: string | null;
  is_active: boolean;
  created_at: string;
  citio_id?: string | null;
  rfid_required?: boolean;
}

interface ProductBatch {
  id: string;
  product_id: string;
  batch_number: string;
  barcode: string;
  expiration_date: string;
  initial_quantity: number;
  current_quantity: number;
  is_active: boolean;
}

interface ProductRowWithBatchesProps {
  product: Product;
  hasTag: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  showQuickStock?: boolean;
  isInventarioRfid: boolean;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  warehouseLocations?: { warehouse_id: string; stock: number }[];
  warehouses?: { id: string; code: string; name: string }[];
  isDimmed?: boolean;
}

export function ProductRowWithBatches({
  product,
  hasTag,
  canEdit,
  isAdmin,
  isInventarioRfid,
  onEdit,
  onDelete,
  showQuickStock = true,
  warehouseLocations,
  warehouses,
  isDimmed = false,
}: ProductRowWithBatchesProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [tagAssignmentOpen, setTagAssignmentOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();

  const handleSyncFromExternal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.citio_id) return;
    setIsSyncing(true);
    try {
      // Fetch all external medications
      const { data, error } = await supabase.functions.invoke('get-external-medications');
      if (error) throw error;

      const medications = data?.data?.medications || data?.data || [];
      const externalMed = Array.isArray(medications)
        ? medications.find((m: any) => m.id === product.citio_id)
        : null;

      if (!externalMed) {
        toast.error("No se encontró el producto en el sistema externo");
        return;
      }

      // Update local product with external data
      const updatePayload: Record<string, any> = {};
      if (externalMed.name && externalMed.name !== product.name) updatePayload.name = externalMed.name;
      if (externalMed.brand !== undefined && externalMed.brand !== product.brand) updatePayload.brand = externalMed.brand;
      if (externalMed.description !== undefined) updatePayload.description = externalMed.description;
      if (externalMed.price_type_1 !== undefined) updatePayload.price_type_1 = externalMed.price_type_1;
      if (externalMed.price_type_2 !== undefined) updatePayload.price_type_2 = externalMed.price_type_2;
      if (externalMed.price_type_3 !== undefined) updatePayload.price_type_3 = externalMed.price_type_3;
      if (externalMed.price_type_4 !== undefined) updatePayload.price_type_4 = externalMed.price_type_4;
      if (externalMed.price_type_5 !== undefined) updatePayload.price_type_5 = externalMed.price_type_5;
      if (externalMed.price_with_tax !== undefined) updatePayload.price_with_tax = externalMed.price_with_tax;
      if (externalMed.price_without_tax !== undefined) updatePayload.price_without_tax = externalMed.price_without_tax;
      if (externalMed.tax_rate !== undefined) updatePayload.tax_rate = externalMed.tax_rate;
      if (externalMed.codigo_sat !== undefined) updatePayload.codigo_sat = externalMed.codigo_sat;
      if (externalMed.clave_unidad !== undefined) updatePayload.clave_unidad = externalMed.clave_unidad;
      if (externalMed.grupo_sat !== undefined) updatePayload.grupo_sat = externalMed.grupo_sat;

      if (Object.keys(updatePayload).length === 0) {
        toast.info("El producto ya está actualizado, no hay cambios");
        return;
      }

      const { error: updateError } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", product.id);

      if (updateError) throw updateError;

      await queryClient.invalidateQueries({ queryKey: ["products"] });
      
      const changedFields = Object.keys(updatePayload).join(", ");
      toast.success(`Producto sincronizado. Campos actualizados: ${changedFields}`);
    } catch (err: any) {
      console.error("Sync error:", err);
      toast.error("Error al sincronizar: " + (err.message || "Error desconocido"));
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch batches for this product when expanded
  const { data: batches = [], isLoading: loadingBatches } = useQuery({
    queryKey: ["product_batches", product.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("*")
        .eq("product_id", product.id)
        .order("expiration_date", { ascending: true });

      if (error) throw error;
      return data as ProductBatch[];
    },
    enabled: isExpanded,
  });

  // Fetch tags for this product when expanded
  const { data: productTags = [] } = useQuery({
    queryKey: ["product_rfid_tags", product.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfid_tags")
        .select("id, epc, batch_id, status")
        .eq("product_id", product.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: isExpanded,
  });

  // Group tags by batch_id
  const tagsByBatch = productTags.reduce((acc, tag) => {
    const batchId = tag.batch_id || "unassigned";
    if (!acc[batchId]) acc[batchId] = [];
    acc[batchId].push(tag);
    return acc;
  }, {} as Record<string, typeof productTags>);

  const colSpan = canEdit ? 9 : 8;

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking on buttons
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    setIsExpanded(!isExpanded);
  };

  const getExpirationStatus = (expirationDate: string) => {
    const today = new Date();
    const expDate = new Date(expirationDate);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { status: "expired", label: "Vencido", variant: "destructive" as const };
    } else if (diffDays <= 90) {
      return { status: "expired", label: "Próximo a vencer", variant: "destructive" as const };
    }
    return { status: "ok", label: "Vigente", variant: "secondary" as const };
  };

  return (
    <>
      {/* Main Product Row */}
      <TableRow 
        className={cn(
          "cursor-pointer transition-colors hover:bg-muted/50",
          hasTag && "bg-green-50 dark:bg-green-950/20",
          isExpanded && "bg-muted/30",
          isDimmed && "opacity-40"
        )}
        onClick={handleRowClick}
      >
        <TableCell>
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            {hasTag ? (
              <Tag className="h-4 w-4 text-green-600" />
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            )}
          </div>
        </TableCell>
        <TableCell className="font-mono text-sm">{product.sku}</TableCell>
        <TableCell className="font-medium">{product.name}</TableCell>
        <TableCell className="text-muted-foreground text-sm">
          {product.brand || "—"}
        </TableCell>
        <TableCell>
          {warehouseLocations && warehouseLocations.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {warehouseLocations.map((loc) => {
                const wh = warehouses?.find(w => w.id === loc.warehouse_id);
                return wh ? (
                  <Badge key={loc.warehouse_id} variant="outline" className="text-xs gap-1">
                    <Warehouse className="h-3 w-3" />
                    {wh.name} ({loc.stock})
                  </Badge>
                ) : null;
              })}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">Sin ubicación</span>
          )}
        </TableCell>
        <TableCell className="text-center">
          <div className="flex flex-col items-center gap-0.5">
            <Badge
              variant={product.current_stock <= product.minimum_stock ? "destructive" : "default"}
            >
              {product.current_stock} / {product.minimum_stock}
            </Badge>
            <span className="text-[10px] text-muted-foreground">Actual / Mínimo</span>
          </div>
        </TableCell>
        <TableCell className="text-right">
          {product.unit_price ? `$${product.unit_price.toFixed(2)}` : "-"}
        </TableCell>
        {canEdit && (
          <TableCell className="text-right">
            <div className="flex justify-end gap-1">
              {product.citio_id && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  title="Sincronizar con sistema externo"
                  disabled={isSyncing}
                  onClick={handleSyncFromExternal}
                >
                  <RefreshCw className={cn("h-4 w-4 text-blue-500", isSyncing && "animate-spin")} />
                </Button>
              )}
              {product.rfid_required && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  title="Asignar Tag RFID"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTagAssignmentOpen(true);
                  }}
                >
                  <Link2 className="h-4 w-4 text-primary" />
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(product);
                }}
              >
                <Edit className="h-4 w-4" />
              </Button>
              {(isAdmin || isInventarioRfid) && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(product.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </TableCell>
        )}
      </TableRow>

      {/* Expanded Batches Section */}
      {isExpanded && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={colSpan} className="p-0">
            <div className="px-6 py-4 border-l-4 border-l-primary/30">
              <div className="flex items-center gap-2 mb-3">
                <Boxes className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Lotes asociados</span>
              </div>

              {loadingBatches ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Cargando lotes...
                </div>
              ) : batches.length === 0 ? (
                <div className="text-muted-foreground text-sm py-2 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  No hay lotes registrados para este producto
                </div>
              ) : (
                <div className="grid gap-2">
                  {batches.map((batch) => {
                    const expStatus = getExpirationStatus(batch.expiration_date);
                    return (
                      <div 
                        key={batch.id} 
                        className={cn(
                          "flex flex-wrap items-center gap-4 p-3 rounded-lg border bg-background",
                          !batch.is_active && "opacity-50"
                        )}
                      >
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">
                              Lote: {batch.batch_number}
                            </span>
                            {!batch.is_active && (
                              <Badge variant="outline" className="text-xs">Inactivo</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Código de barras: {batch.barcode}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div className="text-sm">
                            <span className="text-muted-foreground">Vence: </span>
                            <span className="font-medium">
                              {format(new Date(batch.expiration_date), "dd MMM yyyy", { locale: es })}
                            </span>
                          </div>
                          <Badge 
                            variant={expStatus.variant}
                            className="text-xs"
                          >
                            {expStatus.label}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-sm">
                            <span className="text-muted-foreground">Restante: </span>
                            <span className="font-medium">{batch.current_quantity}</span>
                            <span className="text-muted-foreground"> de {batch.initial_quantity}</span>
                          </div>
                        </div>

                        {/* RFID Tags for this batch */}
                        {tagsByBatch[batch.id] && tagsByBatch[batch.id].length > 0 && (
                          <div className="w-full mt-3 pt-3 border-t border-border/50">
                            <div className="flex items-center gap-2 mb-2">
                              <Cpu className="h-3 w-3 text-primary" />
                              <span className="text-xs font-medium text-muted-foreground">
                                Tags RFID asignados ({tagsByBatch[batch.id].length})
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {tagsByBatch[batch.id].map((tag) => (
                                <Badge 
                                  key={tag.id} 
                                  variant="outline" 
                                  className="font-mono text-xs bg-muted/50"
                                >
                                  {tag.epc}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
      {/* Quick Tag Assignment Modal */}
      <QuickTagAssignment
        open={tagAssignmentOpen}
        onOpenChange={setTagAssignmentOpen}
        productId={product.id}
        productName={product.name}
        mode="product-list"
      />
    </>
  );
}
