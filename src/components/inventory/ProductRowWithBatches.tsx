import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Boxes
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  minimum_stock: number;
  current_stock: number;
  unit_price: number | null;
  supplier_id: string | null;
  is_active: boolean;
  created_at: string;
  citio_id?: string | null;
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
  isInventarioRfid: boolean;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
}

export function ProductRowWithBatches({
  product,
  hasTag,
  canEdit,
  isAdmin,
  isInventarioRfid,
  onEdit,
  onDelete,
}: ProductRowWithBatchesProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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

  const colSpan = canEdit ? 7 : 6;

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
          isExpanded && "bg-muted/30"
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
        <TableCell>
          {product.category && (
            <Badge variant="secondary">{product.category}</Badge>
          )}
        </TableCell>
        <TableCell className="text-center">
          <Badge 
            variant={product.current_stock <= product.minimum_stock ? "destructive" : "default"}
          >
            {product.current_stock} / {product.minimum_stock}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          {product.unit_price ? `$${product.unit_price.toFixed(2)}` : "-"}
        </TableCell>
        {canEdit && (
          <TableCell className="text-right">
            <div className="flex justify-end gap-1">
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
                            <span className="text-muted-foreground">Cantidad: </span>
                            <span className="font-medium">{batch.current_quantity}</span>
                            <span className="text-muted-foreground">/{batch.initial_quantity}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
