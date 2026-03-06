import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WarehouseFilter } from "@/components/inventory/WarehouseFilter";
import { Search, ClipboardCheck, Package, Save, Trash2, CheckCircle2, Warehouse, Eye, Pencil, List, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PhysicalCountSessionView } from "./PhysicalCountSessionView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

  // History view/edit state
  const [viewSessionId, setViewSessionId] = useState<string | null>(null);
  const [editSessionId, setEditSessionId] = useState<string | null>(null);
  const [editEntries, setEditEntries] = useState<any[]>([]);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showUncounted, setShowUncounted] = useState(false);

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

  const allProductIds = Array.from(new Set([
    ...products.map((p) => p.id),
    ...entries.map((e) => e.product_id),
  ]));

  // Fetch batches
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

  // Fetch saved counts grouped by session
  const { data: savedSessions = [] } = useQuery({
    queryKey: ["physical-inv-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physical_inventory_counts")
        .select("*, products(name, sku), product_batches(batch_number), warehouses(name)")
        .order("counted_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      // Group by session_id
      const sessionMap: Record<string, any[]> = {};
      (data || []).forEach((row: any) => {
        const sid = row.session_id || row.id;
        if (!sessionMap[sid]) sessionMap[sid] = [];
        sessionMap[sid].push(row);
      });

      return Object.entries(sessionMap).map(([sessionId, counts]) => ({
        sessionId,
        counts,
        warehouseName: counts[0]?.session_warehouse_name || counts[0]?.warehouses?.name || "—",
        countedAt: counts[0]?.counted_at,
        totalProducts: new Set(counts.map((c: any) => c.product_id)).size,
        totalEntries: counts.length,
        withDifference: counts.filter((c: any) => (c.counted_quantity - c.system_quantity) !== 0).length,
      }));
    },
  });

  // Fetch all products with stock in the active warehouse
  const { data: warehouseProducts = [] } = useQuery({
    queryKey: ["physical-inv-warehouse-products", activeWarehouseId],
    enabled: !!activeWarehouseId && inventoryStarted,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("product_id, current_stock, products:product_id(id, name, sku, category)")
        .eq("warehouse_id", activeWarehouseId!)
        .gt("current_stock", 0);
      if (error) throw error;
      return (data || []).map((ws: any) => ({
        product_id: ws.product_id,
        current_stock: ws.current_stock,
        name: ws.products?.name || "—",
        sku: ws.products?.sku || "",
        category: ws.products?.category || "Sin categoría",
      }));
    },
  });

  // Compute uncounted products
  const countedProductIds = useMemo(() => new Set(entries.map((e) => e.product_id)), [entries]);
  const uncountedProducts = useMemo(
    () => warehouseProducts.filter((wp) => !countedProductIds.has(wp.product_id)),
    [warehouseProducts, countedProductIds]
  );

  const saveMutation = useMutation({
    mutationFn: async (entriesToSave: CountEntry[]) => {
      const sessionId = crypto.randomUUID();
      const whName = warehouses.find((w) => w.id === activeWarehouseId)?.name || "";
      const rows = entriesToSave.map((e) => ({
        product_id: e.product_id,
        batch_id: e.batch_id,
        warehouse_id: e.warehouse_id,
        counted_quantity: e.counted_quantity,
        system_quantity: e.system_quantity,
        notes: e.notes || null,
        counted_by: user?.id,
        session_id: sessionId,
        session_warehouse_name: whName,
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
      queryClient.invalidateQueries({ queryKey: ["physical-inv-sessions"] });
    },
    onError: (err: any) => toast.error(err.message || "Error al guardar"),
  });

  const updateMutation = useMutation({
    mutationFn: async (rows: any[]) => {
      for (const row of rows) {
        const { error } = await supabase
          .from("physical_inventory_counts")
          .update({
            counted_quantity: row.counted_quantity,
            notes: row.notes,
          })
          .eq("id", row.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Conteo actualizado correctamente");
      setEditSessionId(null);
      setEditEntries([]);
      queryClient.invalidateQueries({ queryKey: ["physical-inv-sessions"] });
    },
    onError: (err: any) => toast.error(err.message || "Error al actualizar"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("physical_inventory_counts")
        .delete()
        .eq("session_id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conteo eliminado");
      setDeleteSessionId(null);
      queryClient.invalidateQueries({ queryKey: ["physical-inv-sessions"] });
    },
    onError: (err: any) => toast.error(err.message || "Error al eliminar"),
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
    if (!whId) return;
    const wh = warehouses.find((w) => w.id === whId);
    const exists = entries.find((e) => e.product_id === product.id && e.warehouse_id === whId);
    if (exists) { toast.info("Este producto ya está en la lista"); return; }

    const batches = batchesMap[product.id] || [];
    if (batches.length === 0) { toast.warning("Este producto no tiene lotes activos"); return; }

    const newEntries: CountEntry[] = batches.map((b) => ({
      product_id: product.id,
      product_name: product.name,
      batch_id: b.id,
      batch_number: b.batch_number,
      warehouse_id: whId,
      warehouse_name: wh?.name || "",
      counted_quantity: 0,
      system_quantity: b.current_quantity,
      notes: "",
    }));

    setEntries((prev) => [...prev, ...newEntries]);
    setSearch("");
  };

  const updateEntry = (index: number, field: keyof CountEntry, value: any) => {
    setEntries((prev) => {
      const updated = [...prev];
      (updated[index] as any)[field] = value;
      return updated;
    });
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditSession = (session: typeof savedSessions[0]) => {
    setEditSessionId(session.sessionId);
    setEditEntries(session.counts.map((c: any) => ({ ...c })));
  };

  const updateEditEntry = (index: number, field: string, value: any) => {
    setEditEntries((prev) => {
      const updated = [...prev];
      (updated[index] as any)[field] = value;
      return updated;
    });
  };

  // View dialog data
  const viewSession = savedSessions.find((s) => s.sessionId === viewSessionId);

  return (
    <div className="space-y-6">
      {/* Phase 1: Start */}
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
          {!inventoryStarted && (
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
          )}

          {inventoryStarted && activeWarehouseId && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-sm px-3 py-1 gap-1.5">
                  <Warehouse className="h-4 w-4" />
                  Inventariando: {warehouses.find((w) => w.id === activeWarehouseId)?.name}
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

              {/* Search results */}
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
                        {p.category && <Badge variant="outline" className="ml-2 text-xs">{p.category}</Badge>}
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uncounted Products Warning */}
      {inventoryStarted && warehouseProducts.length > 0 && (
        <Alert variant={uncountedProducts.length > 0 ? "destructive" : "default"} className={uncountedProducts.length === 0 ? "border-green-500 bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100" : ""}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {uncountedProducts.length > 0
              ? `${uncountedProducts.length} de ${warehouseProducts.length} productos sin inventariar`
              : `Todos los productos han sido inventariados (${warehouseProducts.length})`}
          </AlertTitle>
          <AlertDescription>
            {uncountedProducts.length > 0 ? (
              <Collapsible open={showUncounted} onOpenChange={setShowUncounted}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1 mt-1 h-7 px-2 text-xs">
                    {showUncounted ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {showUncounted ? "Ocultar lista" : "Ver productos faltantes"}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="max-h-48 overflow-y-auto border rounded-md bg-background">
                    {uncountedProducts.map((wp) => (
                      <div key={wp.product_id} className="flex items-center justify-between px-3 py-1.5 border-b last:border-b-0 text-xs">
                        <div>
                          <span className="font-medium">{wp.name}</span>
                          <span className="ml-2 text-muted-foreground">{wp.sku}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">Stock: {wp.current_stock}</Badge>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <span className="text-xs">Puedes guardar el conteo con confianza.</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Intermediate List */}
      {entries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <List className="h-5 w-5" />
              Listado de Conteo en Curso
            </CardTitle>
            <CardDescription>
              Revisa las cantidades contadas antes de guardar. Puedes seguir agregando productos arriba.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                {(() => {
                  const productIds = [...new Set(entries.map((e) => e.product_id))];
                  const rows: React.ReactNode[] = [];
                  const groupColors = [
                    "border-l-primary",
                    "border-l-chart-2",
                    "border-l-chart-3",
                    "border-l-chart-4",
                    "border-l-chart-5",
                  ];
                  productIds.forEach((pid, productIndex) => {
                    const productEntries = entries.filter((e) => e.product_id === pid);
                    const productName = productEntries[0]?.product_name || "";
                    const colorClass = groupColors[productIndex % groupColors.length];
                    const isEven = productIndex % 2 === 0;

                    productEntries.forEach((entry, batchIndex) => {
                      const idx = entries.indexOf(entry);
                      const diff = entry.counted_quantity - entry.system_quantity;
                      const isFirst = batchIndex === 0;
                      rows.push(
                        <TableRow
                          key={`entry-${idx}`}
                          className={`border-l-4 ${colorClass} ${isEven ? "bg-accent/40" : ""} ${isFirst && productIndex > 0 ? "border-t-2 border-t-border" : ""} ${!isFirst && productEntries.length > 1 ? "bg-primary/10" : ""}`}
                        >
                          <TableCell className={`font-medium text-sm ${isFirst ? "pt-3" : ""}`}>
                            {isFirst ? (
                              <span className="font-semibold">{productName}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs pl-4">↳</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">{entry.batch_number}</Badge>
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm font-semibold">{entry.system_quantity}</TableCell>
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
                              {diff === 0 ? <><CheckCircle2 className="h-3 w-3 mr-1" />OK</> : `${diff > 0 ? "+" : ""}${diff}`}
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
                    });

                    if (productEntries.length > 1) {
                      const totalSystem = productEntries.reduce((s, e) => s + e.system_quantity, 0);
                      const totalCounted = productEntries.reduce((s, e) => s + e.counted_quantity, 0);
                      const totalDiff = totalCounted - totalSystem;
                      rows.push(
                        <TableRow key={`total-${pid}`} className={`border-l-4 ${colorClass} bg-muted/60 border-b-2 border-b-border`}>
                          <TableCell className="text-sm font-semibold text-right" colSpan={2}>Total {productName}:</TableCell>
                          <TableCell className="text-center font-mono text-sm font-bold">{totalSystem}</TableCell>
                          <TableCell className="text-center font-mono text-sm font-bold">{totalCounted}</TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={totalDiff === 0 ? "secondary" : "destructive"}
                              className={totalDiff === 0 ? "bg-green-100 text-green-800 font-bold" : "font-bold"}
                            >
                              {totalDiff === 0 ? "OK" : `${totalDiff > 0 ? "+" : ""}${totalDiff}`}
                            </Badge>
                          </TableCell>
                          <TableCell colSpan={2}></TableCell>
                        </TableRow>
                      );
                    }
                  });
                  return rows;
                })()}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                {entries.length} registro(s) • {entries.filter((e) => e.counted_quantity - e.system_quantity !== 0).length} con diferencia
              </p>
              <Button
                onClick={() => {
                  if (uncountedProducts.length > 0) {
                    setShowSaveConfirm(true);
                  } else {
                    saveMutation.mutate(entries);
                  }
                }}
                disabled={saveMutation.isPending || entries.length === 0}
                size="lg"
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Guardando..." : "Guardar Conteo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Historial de Conteos</CardTitle>
        </CardHeader>
        <CardContent>
          {savedSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay conteos registrados aún</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead className="text-center">Productos</TableHead>
                  <TableHead className="text-center">Registros</TableHead>
                  <TableHead className="text-center">Con Diferencia</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savedSessions.map((session) => (
                  <TableRow key={session.sessionId}>
                    <TableCell className="text-sm">
                      {new Date(session.countedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{session.warehouseName}</TableCell>
                    <TableCell className="text-center">{session.totalProducts}</TableCell>
                    <TableCell className="text-center">{session.totalEntries}</TableCell>
                    <TableCell className="text-center">
                      {session.withDifference > 0 ? (
                        <Badge variant="destructive">{session.withDifference}</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">0</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewSessionId(session.sessionId)} className="gap-1">
                          <Eye className="h-3.5 w-3.5" /> Ver
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleEditSession(session)} className="gap-1">
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteSessionId(session.sessionId)} className="gap-1 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" /> Eliminar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      {viewSession && (
        <PhysicalCountSessionView
          open={!!viewSessionId}
          onOpenChange={(open) => !open && setViewSessionId(null)}
          counts={viewSession.counts}
          warehouseName={viewSession.warehouseName}
          sessionDate={viewSession.countedAt}
        />
      )}

      {/* Edit Dialog */}
      {editSessionId && editEntries.length > 0 && (
        <PhysicalCountEditDialog
          open={!!editSessionId}
          onOpenChange={(open) => { if (!open) { setEditSessionId(null); setEditEntries([]); } }}
          entries={editEntries}
          onUpdateEntry={updateEditEntry}
          onSave={() => updateMutation.mutate(editEntries)}
          saving={updateMutation.isPending}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteSessionId} onOpenChange={(open) => !open && setDeleteSessionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este conteo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará todos los registros de esta sesión de conteo. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSessionId && deleteMutation.mutate(deleteSessionId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save Confirmation when uncounted products exist */}
      <AlertDialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Inventario incompleto
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Hay <strong>{uncountedProducts.length}</strong> producto(s) con stock en este almacén que no han sido inventariados físicamente.
              </p>
              <div className="max-h-32 overflow-y-auto border rounded-md mt-2 bg-muted/30">
                {uncountedProducts.slice(0, 10).map((wp) => (
                  <div key={wp.product_id} className="px-3 py-1 border-b last:border-b-0 text-xs flex justify-between">
                    <span>{wp.name}</span>
                    <span className="text-muted-foreground">Stock: {wp.current_stock}</span>
                  </div>
                ))}
                {uncountedProducts.length > 10 && (
                  <div className="px-3 py-1 text-xs text-muted-foreground text-center">
                    ...y {uncountedProducts.length - 10} más
                  </div>
                )}
              </div>
              <p className="text-xs mt-2">¿Deseas guardar el conteo de todas formas?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowSaveConfirm(false);
                saveMutation.mutate(entries);
              }}
            >
              Guardar de todas formas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Edit dialog inline component
function PhysicalCountEditDialog({
  open, onOpenChange, entries, onUpdateEntry, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: any[];
  onUpdateEntry: (index: number, field: string, value: any) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Conteo Físico</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead className="text-center">Qty Sistema</TableHead>
              <TableHead className="text-center">Qty Contada</TableHead>
              <TableHead className="text-center">Diferencia</TableHead>
              <TableHead>Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((c: any, idx: number) => {
              const diff = c.counted_quantity - c.system_quantity;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-sm">{c.products?.name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {c.product_batches?.batch_number || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-mono">{c.system_quantity}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      value={c.counted_quantity}
                      onChange={(e) => onUpdateEntry(idx, "counted_quantity", parseInt(e.target.value) || 0)}
                      className="w-20 h-8 text-center text-sm mx-auto"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={diff === 0 ? "secondary" : "destructive"}
                      className={diff === 0 ? "bg-green-100 text-green-800" : ""}
                    >
                      {diff === 0 ? <><CheckCircle2 className="h-3 w-3 mr-1" />OK</> : `${diff > 0 ? "+" : ""}${diff}`}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Nota..."
                      value={c.notes || ""}
                      onChange={(e) => onUpdateEntry(idx, "notes", e.target.value)}
                      className="h-8 text-xs w-[120px]"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex justify-end pt-2">
          <Button onClick={onSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
