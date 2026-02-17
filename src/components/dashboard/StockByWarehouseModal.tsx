import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Warehouse, Package, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface WarehouseStock {
  id: string;
  name: string;
  code: string;
  products: {
    id: string;
    name: string;
    sku: string;
    current_stock: number;
    minimum_stock: number;
  }[];
  totalProducts: number;
  lowStockCount: number;
}

export function StockByWarehouseModal() {
  const [open, setOpen] = useState(false);

  const { data: warehouseStock, isLoading } = useQuery({
    queryKey: ["stock-by-warehouse"],
    queryFn: async () => {
      // Fetch warehouses
      const { data: warehouses, error: whError } = await supabase
        .from("warehouses")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name");

      if (whError) throw whError;

      // Fetch stock desde warehouse_stock (stock real por almacén)
      const { data: wsData, error: wsError } = await supabase
        .from("warehouse_stock")
        .select("product_id, warehouse_id, current_stock, products:product_id(id, name, sku, minimum_stock)")
        .gt("current_stock", 0);

      if (wsError) throw wsError;

      // Agrupar por almacén usando warehouse_stock
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
                <ScrollArea className="h-[50vh]">
                  {wh.products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Package className="h-12 w-12 mb-4" />
                      <p>No hay productos en este almacén</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">Mínimo</TableHead>
                          <TableHead className="text-center">Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {wh.products.map((product) => (
                          <TableRow key={product.id}>
                            <TableCell className="font-medium">
                              {product.name}
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
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
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
