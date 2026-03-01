import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Warehouse, Package, AlertTriangle, Search, ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface WarehouseProduct {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  category: string | null;
  current_stock: number;
  minimum_stock: number;
}

interface WarehouseStock {
  id: string;
  name: string;
  code: string;
  products: WarehouseProduct[];
  totalProducts: number;
  lowStockCount: number;
}

export function StockByWarehouseModal() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: warehouseStock, isLoading } = useQuery({
    queryKey: ["stock-by-warehouse"],
    queryFn: async () => {
      const { data: warehouses, error: whError } = await supabase
        .from("warehouses")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name");

      if (whError) throw whError;

      const { data: wsData, error: wsError } = await supabase
        .from("warehouse_stock")
        .select("product_id, warehouse_id, current_stock, products:product_id(id, name, sku, minimum_stock, brand, category)")
        .gt("current_stock", 0);

      if (wsError) throw wsError;

      const result: WarehouseStock[] = warehouses.map((wh) => {
        const whStocks = (wsData || []).filter((ws: any) => ws.warehouse_id === wh.id);
        return {
          id: wh.id,
          name: wh.name,
          code: wh.code,
          products: whStocks.map((ws: any) => ({
            id: ws.products?.id || ws.product_id,
            name: ws.products?.name || "Sin nombre",
            sku: ws.products?.sku || "",
            brand: ws.products?.brand || null,
            category: ws.products?.category || "Sin categoría",
            current_stock: ws.current_stock ?? 0,
            minimum_stock: ws.products?.minimum_stock ?? 0,
          })).sort((a: any, b: any) => a.name.localeCompare(b.name)),
          totalProducts: whStocks.length,
          lowStockCount: whStocks.filter(
            (ws: any) => (ws.current_stock ?? 0) <= (ws.products?.minimum_stock ?? 0)
          ).length,
        };
      });

      return result;
    },
    enabled: open,
  });

  const getStockBadge = (current: number, minimum: number) => {
    if (current <= 0) {
      return <Badge variant="destructive">Agotado</Badge>;
    }
    if (current <= minimum) {
      return <Badge variant="outline" className="border-warning text-warning">Bajo</Badge>;
    }
    return <Badge variant="outline" className="border-success text-success">OK</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Warehouse className="h-4 w-4" />
          Stock por Almacén
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5" />
            Stock por Almacén
          </DialogTitle>
        </DialogHeader>

        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, SKU o marca..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : warehouseStock && warehouseStock.length > 0 ? (
          <Tabs defaultValue={warehouseStock[0]?.id} className="w-full">
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
              {warehouseStock.map((wh) => (
                <TabsTrigger key={wh.id} value={wh.id} className="gap-2">
                  <Warehouse className="h-4 w-4" />
                  {wh.name}
                  <Badge variant="secondary" className="ml-1">
                    {wh.totalProducts}
                  </Badge>
                  {wh.lowStockCount > 0 && (
                    <Badge variant="destructive" className="ml-1">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {wh.lowStockCount}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {warehouseStock.map((wh) => (
              <TabsContent key={wh.id} value={wh.id} className="mt-4">
                <WarehouseTabContent
                  products={wh.products}
                  searchTerm={searchTerm}
                  getStockBadge={getStockBadge}
                  allWarehouseStock={searchTerm ? warehouseStock : undefined}
                />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Warehouse className="h-12 w-12 mb-4" />
            <p>No hay almacenes configurados</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Content for each warehouse tab: groups products by category with collapsibles */
function WarehouseTabContent({
  products,
  searchTerm,
  getStockBadge,
  allWarehouseStock,
}: {
  products: WarehouseProduct[];
  searchTerm: string;
  getStockBadge: (current: number, minimum: number) => React.ReactNode;
  allWarehouseStock?: WarehouseStock[];
}) {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  // Filter products by search
  const filtered = useMemo(() => {
    if (!searchTerm) return products;
    const s = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        p.sku.toLowerCase().includes(s) ||
        (p.brand && p.brand.toLowerCase().includes(s))
    );
  }, [products, searchTerm]);

  // Group by category
  const grouped = useMemo(() => {
    const map: Record<string, WarehouseProduct[]> = {};
    for (const p of filtered) {
      const cat = p.category || "Sin categoría";
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    }
    // Sort categories alphabetically
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Auto-open all categories when searching
  const effectiveOpen = (cat: string) => {
    if (searchTerm) return true;
    return openCategories[cat] ?? false;
  };

  const toggleCategory = (cat: string) => {
    setOpenCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Package className="h-12 w-12 mb-4" />
        <p>{searchTerm ? "No se encontraron productos" : "No hay productos en este almacén"}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[50vh]">
      <div className="space-y-2 pr-3">
        {grouped.map(([category, categoryProducts]) => {
          const isOpen = effectiveOpen(category);
          const lowCount = categoryProducts.filter(
            (p) => p.current_stock <= p.minimum_stock
          ).length;

          return (
            <Collapsible
              key={category}
              open={isOpen}
              onOpenChange={() => toggleCategory(category)}
            >
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full p-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors text-left">
                  {isOpen ? (
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
                <div className="mt-1 border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Marca</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Mínimo</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryProducts.map((product) => {
                        // Build per-warehouse breakdown when searching
                        const warehouseBreakdown = searchTerm && allWarehouseStock
                          ? allWarehouseStock
                              .map((wh) => {
                                const found = wh.products.find((p) => p.id === product.id);
                                return found ? { name: wh.name, code: wh.code, stock: found.current_stock } : null;
                              })
                              .filter(Boolean) as { name: string; code: string; stock: number }[]
                          : null;

                        return (
                          <Fragment key={product.id}>
                            <TableRow>
                              <TableCell className="font-medium">
                                {product.name}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {product.brand || "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {product.sku}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {product.current_stock}
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">
                                {product.minimum_stock}
                              </TableCell>
                              <TableCell className="text-center">
                                {getStockBadge(product.current_stock, product.minimum_stock)}
                              </TableCell>
                            </TableRow>
                            {warehouseBreakdown && warehouseBreakdown.length > 1 && (
                              <TableRow className="bg-muted/20">
                                <TableCell colSpan={6} className="py-1 px-6">
                                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                    {warehouseBreakdown.map((wb) => (
                                      <span key={wb.code} className="inline-flex items-center gap-1">
                                        <Warehouse className="h-3 w-3" />
                                        {wb.name}: <span className="font-mono font-medium text-foreground">{wb.stock}</span>
                                      </span>
                                    ))}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </ScrollArea>
  );
}
