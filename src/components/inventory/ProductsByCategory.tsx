import { useState, useMemo } from "react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { ProductRowWithBatches } from "./ProductRowWithBatches";

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
  warehouse_id?: string | null;
  rfid_required?: boolean;
}

interface RfidTag {
  id: string;
  epc: string;
  product_id: string | null;
  status: string;
}

interface ProductsByCategoryProps {
  products: Product[];
  rfidTags: RfidTag[];
  canEdit: boolean;
  isAdmin: boolean;
  isInventarioRfid: boolean;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  searchTerm: string;
  productWarehouseMap?: Record<string, { warehouse_id: string; stock: number }[]>;
  warehouses?: { id: string; code: string; name: string }[];
  zeroStockProductIds?: Set<string>;
}

export function ProductsByCategory({
  products,
  rfidTags,
  canEdit,
  isAdmin,
  isInventarioRfid,
  onEdit,
  onDelete,
  searchTerm,
  productWarehouseMap,
  warehouses,
  zeroStockProductIds,
}: ProductsByCategoryProps) {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const map: Record<string, Product[]> = {};
    for (const p of products) {
      const cat = p.category || "Sin categoría";
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [products]);

  const isOpen = (cat: string) => {
    if (searchTerm) return true;
    return openCategories[cat] ?? false;
  };

  const toggle = (cat: string) => {
    setOpenCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="space-y-1">
      {grouped.map(([category, categoryProducts]) => {
        const open = isOpen(category);
        const lowCount = categoryProducts.filter(
          (p) => p.current_stock <= p.minimum_stock
        ).length;

        return (
          <Collapsible
            key={category}
            open={open}
            onOpenChange={() => toggle(category)}
          >
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 w-full p-3 border-b bg-muted/30 hover:bg-muted/60 transition-colors text-left">
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="font-medium text-sm flex-1">{category}</span>
                <Badge variant="secondary" className="text-xs">
                  {categoryProducts.length}
                </Badge>
                {lowCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {lowCount}
                  </Badge>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Tag</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Almacén</TableHead>
                    <TableHead className="text-center">Stock</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                {categoryProducts.map((product) => {
                    const hasTag = rfidTags?.some(
                      (tag) => tag.product_id === product.id
                    );
                    const isDimmed = zeroStockProductIds?.has(product.id) ?? false;
                    return (
                      <ProductRowWithBatches
                        key={product.id}
                        product={product}
                        hasTag={hasTag}
                        canEdit={canEdit}
                        isAdmin={isAdmin}
                        isInventarioRfid={isInventarioRfid}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        warehouseLocations={productWarehouseMap?.[product.id]}
                        warehouses={warehouses}
                        isDimmed={isDimmed}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
