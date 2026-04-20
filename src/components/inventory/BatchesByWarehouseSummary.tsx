import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Warehouse, Search, Boxes } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";

export function BatchesByWarehouseSummary() {
  const [search, setSearch] = useState("");

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-batches-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []).sort((a, b) => {
        if (a.name === "Almacén Principal") return -1;
        if (b.name === "Almacén Principal") return 1;
        return a.name.localeCompare(b.name);
      });
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["batches-by-warehouse-summary"],
    queryFn: async () => {
      const pageSize = 1000;
      let all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await (supabase as any)
          .from("batch_warehouse_stock")
          .select(`
            warehouse_id,
            quantity,
            product_batches:batch_id (
              id, batch_number, barcode, expiration_date, current_quantity,
              products:product_id (name, sku, brand, category)
            )
          `)
          .gt("quantity", 0)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        all = all.concat(data || []);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  });

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map: Record<string, any[]> = {};
    for (const r of rows) {
      const b = r.product_batches;
      if (!b) continue;
      const p = b.products || {};
      if (term) {
        const haystack = `${p.name || ""} ${p.sku || ""} ${b.batch_number || ""} ${b.barcode || ""}`.toLowerCase();
        if (!haystack.includes(term)) continue;
      }
      if (!map[r.warehouse_id]) map[r.warehouse_id] = [];
      map[r.warehouse_id].push({
        batchId: b.id,
        productName: p.name || "—",
        sku: p.sku || "",
        brand: p.brand || "",
        category: p.category || "",
        batchNumber: b.batch_number,
        barcode: b.barcode,
        expirationDate: b.expiration_date,
        quantity: r.quantity,
      });
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const ea = a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity;
        const eb = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;
        return ea - eb;
      });
    }
    return map;
  }, [rows, search]);

  const getExpStatus = (date: string) => {
    const days = differenceInDays(parseISO(date), new Date());
    if (days < 0) return { label: "Caducado", variant: "destructive" as const };
    if (days <= 30) return { label: `${days}d`, variant: "destructive" as const };
    if (days <= 90) return { label: `${days}d`, variant: "secondary" as const };
    return { label: `${days}d`, variant: "outline" as const };
  };

  const totalUnits = (whId: string) => (grouped[whId] || []).reduce((s, r) => s + (r.quantity || 0), 0);
  const defaultTab = warehouses[0]?.id;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Warehouse className="h-5 w-5" />
          Existencias de Lotes por Almacén
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto, lote o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Cargando...</div>
        ) : warehouses.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No hay almacenes activos.</div>
        ) : (
          <Tabs defaultValue={defaultTab}>
            <TabsList className="flex flex-wrap h-auto justify-start">
              {warehouses.map((w) => (
                <TabsTrigger key={w.id} value={w.id} className="gap-1.5">
                  <Warehouse className="h-3.5 w-3.5" />
                  {w.name}
                  <Badge variant="secondary" className="ml-1">
                    {(grouped[w.id] || []).length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {warehouses.map((w) => {
              const list = grouped[w.id] || [];
              return (
                <TabsContent key={w.id} value={w.id} className="mt-3">
                  <div className="flex items-center gap-3 mb-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Boxes className="h-4 w-4" />
                      {list.length} lotes con stock
                    </span>
                    <span>•</span>
                    <span>{totalUnits(w.id)} unidades totales</span>
                  </div>
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Producto</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Nº Lote</TableHead>
                          <TableHead>Caducidad</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                              {search ? "Sin resultados" : "Sin lotes asignados a este almacén"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          list.map((r) => {
                            const exp = getExpStatus(r.expirationDate);
                            return (
                              <TableRow key={`${w.id}-${r.batchId}`}>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{r.productName}</span>
                                    {r.brand && (
                                      <span className="text-xs text-muted-foreground">{r.brand}</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                                <TableCell className="font-mono">{r.batchNumber}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">
                                      {format(parseISO(r.expirationDate), "dd MMM yyyy", { locale: es })}
                                    </span>
                                    <Badge variant={exp.variant}>{exp.label}</Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-semibold">{r.quantity}</TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
