import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WarehouseFilter } from "@/components/inventory/WarehouseFilter";
import { Search, ClipboardCheck, Package, Save, Trash2, AlertTriangle, CheckCircle2, MinusCircle, Warehouse } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface CountEntry {
  product_id: string;
  product_name: string;
  batch_id: string | null;
  batch_number: string | null;
  warehouse_id: string;
  warehouse_name: string;
  counted_quantity: number;
  system_quantity: number;
  notes: string;
}

export function PhysicalInventoryCount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("all");
  const [entries, setEntries] = useState<CountEntry[]>([]);
  const [inventoryStarted, setInventoryStarted] = useState(false);
  const [activeWarehouseId, setActiveWarehouseId] = useState<string | null>(null);

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ["physical-inv-products", search],
    queryFn: async () => {
      if (!search || search.length < 2) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category, current_stock")
        .eq("is_active", true)
        .or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
        .order("name")
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  // Fetch warehouses
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-physical"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, code, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Collect all product IDs from both search results and entries
  const allProductIds = Array.from(new Set([
    ...products.map((p) => p.id),
    ...entries.map((e) => e.product_id),
  ]));

  // Fetch batches for selected products and entries
  const { data: batchesMap = {} } = useQuery({
    queryKey: ["physical-inv-batches", allProductIds],
    enabled: allProductIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, product_id, batch_number, current_quantity, expiration_date")
        .in("product_id", allProductIds)
        .eq("is_active", true)
        .order("expiration_date");
      if (error) throw error;
      const map: Record<string, typeof data> = {};
      data.forEach((b) => {
        if (!map[b.product_id]) map[b.product_id] = [];
        map[b.product_id].push(b);
      });
      return map;
    },
  });

  // Fetch warehouse stock for products
  const { data: warehouseStockMap = {} } = useQuery({
    queryKey: ["physical-inv-wh-stock", allProductIds],
    enabled: allProductIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("product_id, warehouse_id, current_stock")
        .in("product_id", allProductIds);
      if (error) throw error;
      const map: Record<string, Record<string, number>> = {};
      data.forEach((ws) => {
        if (!map[ws.product_id]) map[ws.product_id] = {};
        map[ws.product_id][ws.warehouse_id] = ws.current_stock;
      });
      return map;
    },
  });

  // Fetch saved counts
  const { data: savedCounts = [] } = useQuery({
    queryKey: ["physical-inv-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physical_inventory_counts")
        .select("*, products(name, sku), product_batches(batch_number), warehouses(name)")
        .order("counted_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (entriesToSave: CountEntry[]) => {
      const rows = entriesToSave.map((e) => ({
        product_id: e.product_id,
        batch_id: e.batch_id,
        warehouse_id: e.warehouse_id,
        counted_quantity: e.counted_quantity,
        system_quantity: e.system_quantity,
        notes: e.notes || null,
        counted_by: user?.id,
      }));
      const { error } = await supabase.from("physical_inventory_counts").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conteo físico guardado correctamente");
      setEntries([]);
      setInventoryStarted(false);
      setActiveWarehouseId(null);
      setSelectedWarehouse("all");
      queryClient.invalidateQueries({ queryKey: ["physical-inv-counts"] });
    },
    onError: (err: any) => toast.error(err.message || "Error al guardar"),
  });

  const handleStartInventory = () => {
    if (selectedWarehouse === "all") {
      toast.error("Selecciona un almacén para iniciar el inventario");
      return;
    }
    setActiveWarehouseId(selectedWarehouse);
    setInventoryStarted(true);
    setEntries([]);
    toast.success("Inventario físico iniciado");
  };

  const handleCancelInventory = () => {
    setInventoryStarted(false);
    setActiveWarehouseId(null);
    setEntries([]);
    setSearch("");
  };

  const addProduct = (product: typeof products[0]) => {
    const whId = activeWarehouseId;
    if (!whId) {
      toast.error("Selecciona un almacén");
      return;
    }
    const wh = warehouses.find((w) => w.id === whId);
    const systemQty = warehouseStockMap[product.id]?.[whId] ?? 0;

    // Check if already added
    const exists = entries.find((e) => e.product_id === product.id && e.warehouse_id === whId && !e.batch_id);
    if (exists) {
      toast.info("Este producto ya está en la lista");
      return;
    }

    setEntries((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        batch_id: null,
        batch_number: null,
        warehouse_id: whId,
        warehouse_name: wh?.name || "",
        counted_quantity: 0,
        system_quantity: systemQty,
        notes: "",
      },
    ]);
    setSearch("");
  };

  const updateEntry = (index: number, field: keyof CountEntry, value: any) => {
    setEntries((prev) => {
      const updated = [...prev];
      (updated[index] as any)[field] = value;

      // If warehouse changes, update system quantity
      if (field === "warehouse_id") {
        const wh = warehouses.find((w) => w.id === value);
        updated[index].warehouse_name = wh?.name || "";
        updated[index].system_quantity = warehouseStockMap[updated[index].product_id]?.[value] ?? 0;
      }

      // If batch changes, update batch info
      if (field === "batch_id") {
        const batches = batchesMap[updated[index].product_id] || [];
        const batch = batches.find((b) => b.id === value);
        updated[index].batch_number = batch?.batch_number || null;
        if (batch) {
          updated[index].system_quantity = batch.current_quantity;
        }
      }

      return updated;
    });
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Registro de Conteo Físico
          </CardTitle>
          <CardDescription>
            Busca productos, selecciona almacén y lote, e ingresa la cantidad contada
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Phase 1: Start inventory */}
          {!inventoryStarted && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div className="space-y-1 flex-1">
                  <label className="text-sm font-medium">Selecciona el almacén a inventariar</label>
                  <WarehouseFilter
                    value={selectedWarehouse}
                    onChange={setSelectedWarehouse}
                    showAllOption={false}
                    className="w-full sm:w-[280px]"
                  />
                </div>
                <Button onClick={handleStartInventory} size="lg" className="gap-2">
                  <ClipboardCheck className="h-5 w-5" />
                  Iniciar Inventario Físico
                </Button>
              </div>
            </div>
          )}

          {/* Phase 2: Active inventory */}
          {inventoryStarted && activeWarehouseId && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-sm px-3 py-1 gap-1.5">
                  <Warehouse className="h-4 w-4" />
                  Inventariando: {warehouses.find(w => w.id === activeWarehouseId)?.name}
                </Badge>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                    </span>
                    Inventario en curso
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleCancelInventory} className="text-destructive">
                    Cancelar Inventario
                  </Button>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto por nombre o SKU para agregar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Search results with Add button */}
              {search.length >= 2 && products.length > 0 && (
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {products.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-4 py-2 hover:bg-muted/50 text-sm border-b last:border-b-0"
                    >
                      <div>
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-2 text-muted-foreground text-xs">{p.sku}</span>
                        {p.category && (
                          <Badge variant="outline" className="ml-2 text-xs">{p.category}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">Stock: {p.current_stock ?? 0}</span>
                        <Button size="sm" variant="secondary" onClick={() => addProduct(p)} className="gap-1">
                          <Package className="h-3.5 w-3.5" />
                          Agregar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

          {/* Entries table */}
          {entries.length > 0 && (
            <div className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-center">Qty Sistema</TableHead>
                    <TableHead className="text-center">Qty Contada</TableHead>
                    <TableHead className="text-center">Diferencia</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, idx) => {
                    const diff = entry.counted_quantity - entry.system_quantity;
                    const batches = batchesMap[entry.product_id] || [];
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-sm">{entry.product_name}</TableCell>
                        <TableCell>
                          <Select
                            value={entry.batch_id || ""}
                            onValueChange={(v) => updateEntry(idx, "batch_id", v)}
                          >
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                              <SelectValue placeholder="Seleccionar lote" />
                            </SelectTrigger>
                            <SelectContent>
                              {batches.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.batch_number} ({b.current_quantity})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono text-sm font-semibold">{entry.system_quantity}</span>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={entry.counted_quantity}
                            onChange={(e) => updateEntry(idx, "counted_quantity", parseInt(e.target.value) || 0)}
                            className="w-20 h-8 text-center text-sm mx-auto"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={diff === 0 ? "secondary" : "destructive"}
                            className={diff === 0 ? "bg-green-100 text-green-800" : ""}
                          >
                            {diff === 0 ? (
                              <><CheckCircle2 className="h-3 w-3 mr-1" />OK</>
                            ) : (
                              <>{diff > 0 ? "+" : ""}{diff}</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="Nota..."
                            value={entry.notes}
                            onChange={(e) => updateEntry(idx, "notes", e.target.value)}
                            className="h-8 text-xs w-[120px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => removeEntry(idx)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {entries.length} producto(s) • {entries.filter((e) => e.counted_quantity - e.system_quantity !== 0).length} con diferencia
                </p>
                <Button
                  onClick={() => saveMutation.mutate(entries)}
                  disabled={saveMutation.isPending || entries.length === 0}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveMutation.isPending ? "Guardando..." : "Guardar Conteo"}
                </Button>
              </div>
            </div>
          )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Historial de Conteos</CardTitle>
        </CardHeader>
        <CardContent>
          {savedCounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay conteos registrados aún</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-center">Sistema</TableHead>
                  <TableHead className="text-center">Conteo</TableHead>
                  <TableHead className="text-center">Diferencia</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savedCounts.map((c: any) => {
                  const diff = c.difference ?? (c.counted_quantity - c.system_quantity);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">
                        {new Date(c.counted_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {c.products?.name || "—"}
                        <span className="text-xs text-muted-foreground ml-1">{c.products?.sku}</span>
                      </TableCell>
                      <TableCell className="text-sm">{c.warehouses?.name || "—"}</TableCell>
                      <TableCell className="text-sm">{c.product_batches?.batch_number || "—"}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{c.system_quantity}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{c.counted_quantity}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={diff === 0 ? "secondary" : "destructive"}
                          className={diff === 0 ? "bg-green-100 text-green-800" : ""}
                        >
                          {diff === 0 ? "OK" : `${diff > 0 ? "+" : ""}${diff}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                        {c.notes || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
