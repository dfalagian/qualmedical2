import { useState, useMemo, useEffect, useCallback } from "react";
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
import { Search, ClipboardCheck, Package, Save, Trash2, CheckCircle2, Warehouse, Eye, Pencil, List, AlertTriangle, ChevronDown, ChevronRight, PlusCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PhysicalCountSessionView } from "./PhysicalCountSessionView";
import { NewBatchModal } from "@/components/inventory/NewBatchModal";
import { QuickProductCreateModal } from "@/components/inventory/QuickProductCreateModal";
import { AddBatchToCountModal } from "@/components/inventory/AddBatchToCountModal";
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
  product_brand: string | null;
  batch_id: string | null;
  batch_number: string | null;
  warehouse_id: string;
  warehouse_name: string;
  counted_quantity: number;
  system_quantity: number;
  notes: string;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  current_stock: number | null;
  brand: string | null;
}

interface ProductBatchRow {
  id: string;
  product_id: string;
  batch_number: string;
  current_quantity: number;
  expiration_date: string;
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
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [newBatchModalOpen, setNewBatchModalOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<ProductSearchResult | null>(null);
  const [addBatchModalOpen, setAddBatchModalOpen] = useState(false);
  const [addBatchProduct, setAddBatchProduct] = useState<{ id: string; name: string } | null>(null);
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);

  const LOCAL_STORAGE_KEY = "physical-inventory-autosave";

  // Auto-save: persist entries to localStorage whenever they change
  useEffect(() => {
    if (!inventoryStarted || entries.length === 0) return;
    const payload = {
      entries,
      activeWarehouseId,
      selectedWarehouse,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }, [entries, inventoryStarted, activeWarehouseId, selectedWarehouse]);

  // On mount: check for saved data and show recovery banner
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.entries && parsed.entries.length > 0) {
          setShowRecoveryBanner(true);
        }
      }
    } catch {
      // corrupt data — remove it
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, []);

  const handleRecoverSession = useCallback(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed.entries && parsed.entries.length > 0) {
        setEntries(parsed.entries);
        setActiveWarehouseId(parsed.activeWarehouseId || null);
        setSelectedWarehouse(parsed.selectedWarehouse || "all");
        setInventoryStarted(true);
        setShowRecoveryBanner(false);
        toast.success(`Se recuperaron ${parsed.entries.length} registros del conteo anterior`);
      }
    } catch {
      toast.error("No se pudo recuperar la sesión");
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      setShowRecoveryBanner(false);
    }
  }, []);

  const handleDismissRecovery = useCallback(() => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setShowRecoveryBanner(false);
  }, []);

  const clearAutoSave = useCallback(() => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }, []);

  // Fetch products - only used when NOT in active inventory session
  const { data: searchedProducts = [] } = useQuery({
    queryKey: ["physical-inv-products-fallback", search],
    enabled: !inventoryStarted && !!search && search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category, current_stock, brand")
        .eq("is_active", true)
        .eq("catalog_only", false)
        .or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
        .order("name")
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  // Fetch warehouse stock for the active warehouse (paginated to avoid 1000-row limit)
  const { data: warehouseStockMap = new Map() } = useQuery({
    queryKey: ["physical-inv-warehouse-stock", activeWarehouseId],
    enabled: !!activeWarehouseId && inventoryStarted,
    queryFn: async () => {
      const map = new Map<string, number>();
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("warehouse_stock")
          .select("product_id, current_stock")
          .eq("warehouse_id", activeWarehouseId!)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach((ws: any) => map.set(ws.product_id, ws.current_stock));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return map;
    },
  });

  // Fetch ALL active products for physical inventory search (paginated to avoid 1000-row limit)
  const { data: allActiveProducts = [] } = useQuery({
    queryKey: ["physical-inv-all-products"],
    enabled: inventoryStarted,
    queryFn: async () => {
      const allProducts: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, sku, category, brand")
          .eq("is_active", true)
          .order("name")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allProducts.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return allProducts;
    },
  });

  // Build warehouseProducts - only products with stock > 0 in the selected warehouse
  const warehouseProducts = useMemo(() => {
    return allActiveProducts
      .map((p) => ({
        product_id: p.id,
        current_stock: warehouseStockMap.get(p.id) ?? 0,
        name: p.name,
        sku: p.sku,
        category: p.category || "Sin categoría",
      }))
      .filter((p) => p.current_stock > 0);
  }, [allActiveProducts, warehouseStockMap]);

  // During active inventory, derive search results from ALL active products (including stock 0 for unexpected finds)
  const products: ProductSearchResult[] = useMemo(() => {
    if (!search || search.length < 2) return [];

    if (inventoryStarted && activeWarehouseId) {
      const normalizedSearch = search.trim().toLowerCase();
      return allActiveProducts
        .filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(normalizedSearch))
        .map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          current_stock: warehouseStockMap.get(p.id) ?? 0,
          brand: p.brand || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 20);
    }

    return searchedProducts as ProductSearchResult[];
  }, [search, inventoryStarted, activeWarehouseId, allActiveProducts, warehouseStockMap, searchedProducts]);

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
    queryKey: ["physical-inv-batches", allProductIds, activeWarehouseId, inventoryStarted, warehouses.map((w) => `${w.id}:${w.code}`).join("|")],
    enabled: allProductIds.length > 0,
    queryFn: async () => {
      const groupBatchesByProduct = (batchRows: ProductBatchRow[]) => {
        const map: Record<string, ProductBatchRow[]> = {};
        batchRows.forEach((batch) => {
          if (!map[batch.product_id]) map[batch.product_id] = [];
          map[batch.product_id].push(batch);
        });
        return map;
      };

      const { data, error } = await supabase
        .from("product_batches")
        .select("id, product_id, batch_number, current_quantity, expiration_date")
        .in("product_id", allProductIds)
        .eq("is_active", true)
        .order("expiration_date");
      if (error) throw error;

      const allBatches = (data || []) as ProductBatchRow[];
      if (!allBatches.length || !activeWarehouseId || !inventoryStarted) {
        return groupBatchesByProduct(allBatches);
      }

      const principalWarehouse = warehouses.find((warehouse) => warehouse.code === "PRINCIPAL");
      if (!principalWarehouse) {
        return groupBatchesByProduct(allBatches);
      }

      const batchIds = allBatches.map((batch) => batch.id);

      const { data: transfers, error: transfersError } = await supabase
        .from("warehouse_transfers")
        .select("batch_id, from_warehouse_id, to_warehouse_id, quantity")
        .in("batch_id", batchIds)
        .eq("status", "completada")
        .not("batch_id", "is", null);
      if (transfersError) throw transfersError;

      let movementPage = 0;
      const movementPageSize = 1000;
      let movements: { batch_id: string | null; location: string | null; movement_type: string; quantity: number }[] = [];

      while (true) {
        const { data: movementChunk, error: movementError } = await supabase
          .from("inventory_movements")
          .select("batch_id, location, movement_type, quantity")
          .in("batch_id", batchIds)
          .not("batch_id", "is", null)
          .not("location", "is", null)
          .range(movementPage * movementPageSize, (movementPage + 1) * movementPageSize - 1);

        if (movementError) throw movementError;
        if (!movementChunk || movementChunk.length === 0) break;

        movements = movements.concat(movementChunk);
        if (movementChunk.length < movementPageSize) break;
        movementPage += 1;
      }

      const warehouseIds = new Set(warehouses.map((warehouse) => warehouse.id));
      const warehouseAliases = new Map<string, string>();
      warehouses.forEach((warehouse) => {
        warehouseAliases.set(warehouse.name, warehouse.id);
        warehouseAliases.set(warehouse.code, warehouse.id);
      });

      const resolveWarehouseId = (location: string | null) => {
        if (!location) return null;
        if (warehouseIds.has(location)) return location;
        return warehouseAliases.get(location) ?? null;
      };

      const transferMap: Record<string, Record<string, number>> = {};
      (transfers || []).forEach((transfer) => {
        if (!transfer.batch_id) return;
        if (!transferMap[transfer.batch_id]) transferMap[transfer.batch_id] = {};

        transferMap[transfer.batch_id][transfer.from_warehouse_id] = (transferMap[transfer.batch_id][transfer.from_warehouse_id] || 0) - transfer.quantity;
        transferMap[transfer.batch_id][transfer.to_warehouse_id] = (transferMap[transfer.batch_id][transfer.to_warehouse_id] || 0) + transfer.quantity;
      });

      const salesMap: Record<string, Record<string, number>> = {};
      movements.forEach((movement) => {
        if (!movement.batch_id) return;

        const warehouseId = resolveWarehouseId(movement.location);
        if (!warehouseId) return;

        if (!salesMap[movement.batch_id]) salesMap[movement.batch_id] = {};

        if (movement.movement_type === "salida") {
          salesMap[movement.batch_id][warehouseId] = (salesMap[movement.batch_id][warehouseId] || 0) + movement.quantity;
        } else if (movement.movement_type === "entrada") {
          salesMap[movement.batch_id][warehouseId] = (salesMap[movement.batch_id][warehouseId] || 0) - movement.quantity;
        }
      });

      const scopedBatches = allBatches
        .map((batch) => {
          const batchTransfers = transferMap[batch.id] || {};
          const batchSales = salesMap[batch.id] || {};

          let warehouseQuantity = 0;

          // Compute raw non-principal totals for normalization
          const rawNonPrincipal: { whId: string; qty: number }[] = [];
          let rawNonPrincipalTotal = 0;
          for (const warehouse of warehouses) {
            if (warehouse.id === principalWarehouse.id) continue;
            const netTransfer = batchTransfers[warehouse.id] || 0;
            const netSales = batchSales[warehouse.id] || 0;
            const whQty = Math.max(0, netTransfer - netSales);
            if (whQty > 0) {
              rawNonPrincipal.push({ whId: warehouse.id, qty: whQty });
              rawNonPrincipalTotal += whQty;
            }
          }

          // Normalize if non-principal exceeds batch total (prevents inflated calculations)
          let effectiveNonPrincipalTotal = rawNonPrincipalTotal;
          if (rawNonPrincipalTotal > batch.current_quantity) {
            const scale = batch.current_quantity / rawNonPrincipalTotal;
            effectiveNonPrincipalTotal = 0;
            for (const np of rawNonPrincipal) {
              np.qty = Math.round(np.qty * scale);
              effectiveNonPrincipalTotal += np.qty;
            }
            // Clamp to batch total
            effectiveNonPrincipalTotal = Math.min(effectiveNonPrincipalTotal, batch.current_quantity);
          }

          if (activeWarehouseId === principalWarehouse.id) {
            warehouseQuantity = Math.max(0, batch.current_quantity - effectiveNonPrincipalTotal);
          } else {
            const match = rawNonPrincipal.find(np => np.whId === activeWarehouseId);
            warehouseQuantity = match ? match.qty : 0;
          }

          return {
            ...batch,
            current_quantity: warehouseQuantity,
          };
        })
        .filter((batch) => batch.current_quantity > 0);

      return groupBatchesByProduct(scopedBatches);
    },
  });

  // Fetch saved counts grouped by session
  const { data: savedSessions = [] } = useQuery({
    queryKey: ["physical-inv-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physical_inventory_counts")
        .select("*, products(name, sku, brand), product_batches(batch_number), warehouses(name)")
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
      clearAutoSave();
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
      const existingRows = rows.filter((r) => r.id && !r._isNew);
      const newRows = rows.filter((r) => r._isNew);

      for (const row of existingRows) {
        const { error } = await supabase
          .from("physical_inventory_counts")
          .update({
            counted_quantity: row.counted_quantity,
            notes: row.notes,
          })
          .eq("id", row.id);
        if (error) throw error;
      }

      if (newRows.length > 0) {
        const inserts = newRows.map((r) => ({
          product_id: r.product_id,
          batch_id: r.batch_id,
          warehouse_id: r.warehouse_id,
          counted_quantity: r.counted_quantity,
          system_quantity: r.system_quantity,
          notes: r.notes || null,
          counted_by: user?.id,
          session_id: r.session_id,
          session_warehouse_name: r.session_warehouse_name,
        }));
        const { error } = await supabase.from("physical_inventory_counts").insert(inserts);
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
    clearAutoSave();
    setInventoryStarted(false);
    setActiveWarehouseId(null);
    setEntries([]);
    setSearch("");
  };

  const addProduct = async (product: typeof products[0]) => {
    const whId = activeWarehouseId;
    if (!whId) return;
    const wh = warehouses.find((w) => w.id === whId);
    const exists = entries.find((e) => e.product_id === product.id && e.warehouse_id === whId);
    if (exists) { toast.info("Este producto ya está en la lista"); return; }

    const createEntries = (batches: ProductBatchRow[], useWarehouseSystemQuantity = true): CountEntry[] => {
      // Use warehouse_stock as the authoritative total for this product in this warehouse
      const warehouseTotalStock = warehouseStockMap.get(product.id) ?? 0;
      const batchCalcTotal = useWarehouseSystemQuantity
        ? batches.reduce((sum, b) => sum + b.current_quantity, 0)
        : 0;

      return batches.map((b) => {
        let systemQty = 0;
        if (useWarehouseSystemQuantity) {
          if (warehouseTotalStock > 0 && batchCalcTotal > 0) {
            systemQty = Math.round((b.current_quantity / batchCalcTotal) * warehouseTotalStock);
          } else if (warehouseTotalStock > 0) {
            systemQty = b.current_quantity;
          } else {
            // warehouse_stock is 0 — system quantity should be 0
            systemQty = 0;
          }
        }
        return {
          product_id: product.id,
          product_name: product.name,
          product_brand: product.brand || null,
          batch_id: b.id,
          batch_number: b.batch_number,
          warehouse_id: whId,
          warehouse_name: wh?.name || "",
          counted_quantity: 0,
          system_quantity: systemQty,
          notes: "",
        };
      });
    };

    const batches = batchesMap[product.id] || [];
    if (batches.length > 0) {
      setEntries((prev) => [...createEntries(batches), ...prev]);
      setSearch("");
      return;
    }

    const { data: globalBatches, error: globalBatchesError } = await supabase
      .from("product_batches")
      .select("id, product_id, batch_number, current_quantity, expiration_date")
      .eq("product_id", product.id)
      .eq("is_active", true)
      .gt("current_quantity", 0)
      .order("expiration_date");

    if (globalBatchesError) {
      toast.error(globalBatchesError.message || "Error al consultar lotes del producto");
      return;
    }

    if ((globalBatches || []).length > 0) {
      setEntries((prev) => [...createEntries((globalBatches || []) as ProductBatchRow[], false), ...prev]);
      setSearch("");
      toast.info("Se agregaron los lotes existentes con stock sistema 0 para este almacén.");
      return;
    }

    if (batches.length === 0) {
      setPendingProduct(product);
      setNewBatchModalOpen(true);
      toast.info("Este producto no tiene lotes. Crea uno para agregarlo al conteo.");
      return;
    }
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
      {/* Recovery Banner */}
      {showRecoveryBanner && !inventoryStarted && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Sesión de conteo no guardada detectada</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-700">
              Se encontraron datos de un conteo físico que no se guardó. ¿Deseas recuperarlos?
            </span>
            <div className="flex gap-2 ml-4">
              <Button size="sm" variant="outline" onClick={handleDismissRecovery}>
                Descartar
              </Button>
              <Button size="sm" onClick={handleRecoverSession} className="bg-amber-600 hover:bg-amber-700 text-white">
                Recuperar sesión
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

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
                   <TableHead>Marca</TableHead>
                   <TableHead>Lote</TableHead>
                   <TableHead className="text-center">Qty Sistema</TableHead>
                   <TableHead className="text-center">Qty Contada</TableHead>
                   <TableHead className="text-center">Diferencia</TableHead>
                   <TableHead>Notas</TableHead>
                    <TableHead></TableHead>
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
                          <TableCell className="text-xs text-muted-foreground">
                            {isFirst ? (entry.product_brand || "—") : ""}
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
                            {isFirst && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-xs h-7"
                                onClick={() => {
                                  setAddBatchProduct({ id: pid, name: productName });
                                  setAddBatchModalOpen(true);
                                }}
                              >
                                <PlusCircle className="h-3 w-3" />
                                Lote
                              </Button>
                            )}
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
                          <TableCell colSpan={3}></TableCell>
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
                  const allZero = entries.every((e) => e.counted_quantity === 0);
                  if (allZero) {
                    toast.error("Debes registrar el conteo de al menos un producto antes de guardar");
                    return;
                  }
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
          sessionId={viewSession.sessionId}
        />
      )}

      {/* Edit Dialog */}
      {editSessionId && editEntries.length > 0 && (
        <PhysicalCountEditDialog
          open={!!editSessionId}
          onOpenChange={(open) => { if (!open) { setEditSessionId(null); setEditEntries([]); } }}
          entries={editEntries}
          onUpdateEntry={updateEditEntry}
          onAddEntry={(entry) => setEditEntries((prev) => [entry, ...prev])}
          onSave={() => updateMutation.mutate(editEntries)}
          saving={updateMutation.isPending}
          sessionId={editSessionId}
          sessionWarehouseName={savedSessions.find((s) => s.sessionId === editSessionId)?.warehouseName || ""}
          warehouseId={editEntries[0]?.warehouse_id || ""}
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

      {/* Quick Product Create Modal */}
      <QuickProductCreateModal
        open={quickProductOpen}
        onOpenChange={setQuickProductOpen}
        onProductCreated={(product) => {
          queryClient.invalidateQueries({ queryKey: ["physical-inv-products"] });
          queryClient.invalidateQueries({ queryKey: ["physical-inv-batches"] });
          setPendingProduct({ ...product, brand: null });
          toast.info(`Producto "${product.name}" creado. Ahora crea un lote para agregarlo al conteo.`);
          setNewBatchModalOpen(true);
        }}
      />

      {/* New Batch Modal */}
      <NewBatchModal
        open={newBatchModalOpen}
        onOpenChange={(open) => {
          setNewBatchModalOpen(open);
          if (!open) setPendingProduct(null);
        }}
        productId={pendingProduct?.id}
        productName={pendingProduct?.name}
        onConfirm={async (batchNumber, expirationDate, selectedProductId, selectedProductName, barcodeFromModal) => {
          if (!selectedProductId) return;
          try {
            // Check if batch already exists for this product
            const { data: existingBatch } = await supabase
              .from("product_batches")
              .select("id, batch_number, current_quantity")
              .eq("product_id", selectedProductId)
              .eq("batch_number", batchNumber)
              .maybeSingle();

            let newBatch = existingBatch;

            if (!existingBatch) {
              const { data: created, error } = await supabase.from("product_batches").insert({
                product_id: selectedProductId,
                batch_number: batchNumber,
                expiration_date: expirationDate,
                barcode: barcodeFromModal || "",
                initial_quantity: 0,
                current_quantity: 0,
              }).select("id, batch_number, current_quantity").single();
              if (error) throw error;
              newBatch = created;
              toast.success(`Lote "${batchNumber}" creado para ${selectedProductName}`);
            } else {
              toast.info(`Lote "${batchNumber}" ya existe, se usará el existente.`);
            }
            queryClient.invalidateQueries({ queryKey: ["physical-inv-batches"] });
            queryClient.invalidateQueries({ queryKey: ["physical-inv-products"] });

            // Auto-add to count entries if inventory session is active
            if (inventoryStarted && activeWarehouseId && newBatch) {
              const wh = warehouses.find((w) => w.id === activeWarehouseId);
              const alreadyInEntries = entries.some(
                (e) => e.product_id === selectedProductId && e.batch_id === newBatch.id
              );
              if (!alreadyInEntries) {
                setEntries((prev) => [{
                  product_id: selectedProductId,
                  product_name: selectedProductName || "",
                  product_brand: null,
                  batch_id: newBatch.id,
                  batch_number: newBatch.batch_number,
                  warehouse_id: activeWarehouseId,
                  warehouse_name: wh?.name || "",
                  counted_quantity: 0,
                  system_quantity: 0,
                  notes: "",
                }, ...prev]);
                toast.info("Producto agregado al conteo. Ingresa la cantidad contada.");
              }
            }
            setPendingProduct(null);
          } catch (err: any) {
            toast.error(err.message || "Error al crear lote");
          }
        }}
      />

      {/* Add Batch to Count Modal */}
      {addBatchProduct && (
        <AddBatchToCountModal
          open={addBatchModalOpen}
          onOpenChange={(open) => {
            setAddBatchModalOpen(open);
            if (!open) setAddBatchProduct(null);
          }}
          productId={addBatchProduct.id}
          productName={addBatchProduct.name}
          existingBatchIds={entries.filter((e) => e.product_id === addBatchProduct.id).map((e) => e.batch_id).filter(Boolean) as string[]}
          onSelectBatch={(batch) => {
            if (!activeWarehouseId) return;
            const wh = warehouses.find((w) => w.id === activeWarehouseId);
            const alreadyExists = entries.some(
              (e) => e.product_id === addBatchProduct.id && e.batch_id === batch.id
            );
            if (alreadyExists) {
              toast.info("Este lote ya está en el conteo");
              return;
            }
            setEntries((prev) => [{
              product_id: addBatchProduct.id,
              product_name: addBatchProduct.name,
              product_brand: (addBatchProduct as any).brand || null,
              batch_id: batch.id,
              batch_number: batch.batch_number,
              warehouse_id: activeWarehouseId,
              warehouse_name: wh?.name || "",
              counted_quantity: 0,
              system_quantity: 0,
              notes: "",
            }, ...prev]);
            toast.success(`Lote "${batch.batch_number}" agregado al conteo`);
          }}
          onCreateNewBatch={() => {
            setPendingProduct({ id: addBatchProduct.id, name: addBatchProduct.name, sku: "", category: null, current_stock: 0, brand: null });
            setNewBatchModalOpen(true);
          }}
        />
      )}
    </div>
  );
}

// Edit dialog inline component
function PhysicalCountEditDialog({
  open, onOpenChange, entries, onUpdateEntry, onAddEntry, onSave, saving, sessionId, sessionWarehouseName, warehouseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: any[];
  onUpdateEntry: (index: number, field: string, value: any) => void;
  onAddEntry: (entry: any) => void;
  onSave: () => void;
  saving: boolean;
  sessionId: string;
  sessionWarehouseName: string;
  warehouseId: string;
}) {
  const [search, setSearch] = useState("");
  const [addBatchOpen, setAddBatchOpen] = useState(false);
  const [addBatchProduct, setAddBatchProduct] = useState<{ id: string; name: string } | null>(null);
  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<{ id: string; name: string } | null>(null);

  const { data: searchProducts = [] } = useQuery({
    queryKey: ["edit-dialog-products", search],
    enabled: !!search && search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category, current_stock, brand")
        .eq("is_active", true)
        .eq("catalog_only", false)
        .or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
        .order("name")
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  // IDs of products already in the entries list
  const existingProductIds = useMemo(() => new Set(entries.map((e: any) => e.product_id)), [entries]);

  // Sort search results: existing products first
  const sortedSearchProducts = useMemo(() => {
    return [...searchProducts].sort((a: any, b: any) => {
      const aExists = existingProductIds.has(a.id) ? 0 : 1;
      const bExists = existingProductIds.has(b.id) ? 0 : 1;
      return aExists - bExists;
    });
  }, [searchProducts, existingProductIds]);

  // Sort entries to bring matching products to top when searching
  const sortedEntryIndices = useMemo(() => {
    const indices = entries.map((_: any, i: number) => i);
    if (!search || search.length < 2) return indices;
    const q = search.toLowerCase();
    return indices.sort((a: number, b: number) => {
      const ea = entries[a];
      const eb = entries[b];
      const aMatch = (ea.products?.name?.toLowerCase().includes(q) || ea.products?.sku?.toLowerCase().includes(q)) ? 0 : 1;
      const bMatch = (eb.products?.name?.toLowerCase().includes(q) || eb.products?.sku?.toLowerCase().includes(q)) ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [entries, search]);
  const handleAddProduct = async (product: { id: string; name: string; sku: string }) => {
    // Check if product already in entries
    const existing = entries.some((e: any) => e.product_id === product.id);

    // Fetch batches for this product
    const { data: batches, error } = await supabase
      .from("product_batches")
      .select("id, batch_number, current_quantity, expiration_date")
      .eq("product_id", product.id)
      .eq("is_active", true)
      .order("expiration_date");

    if (error) {
      toast.error("Error al consultar lotes");
      return;
    }

    if (!batches || batches.length === 0) {
      // No batches - open create batch modal
      setPendingProduct({ id: product.id, name: product.name });
      setNewBatchOpen(true);
      setSearch("");
      toast.info("Este producto no tiene lotes. Crea uno para agregarlo.");
      return;
    }

    // Add batches not already in entries
    let added = 0;
    batches.forEach((b) => {
      const alreadyIn = entries.some((e: any) => e.product_id === product.id && e.batch_id === b.id);
      if (!alreadyIn) {
        onAddEntry({
          _isNew: true,
          product_id: product.id,
          products: { name: product.name, sku: product.sku || "" },
          batch_id: b.id,
          product_batches: { batch_number: b.batch_number },
          warehouse_id: warehouseId,
          session_id: sessionId,
          session_warehouse_name: sessionWarehouseName,
          counted_quantity: 0,
          system_quantity: 0,
          notes: "",
        });
        added++;
      }
    });

    if (added > 0) {
      toast.success(`${added} lote(s) agregado(s) para "${product.name}"`);
    } else {
      toast.info("Todos los lotes de este producto ya están en el conteo");
    }
    setSearch("");
  };

  const handleSelectBatchFromModal = (batch: { id: string; batch_number: string; current_quantity: number }) => {
    if (!addBatchProduct) return;
    const alreadyIn = entries.some((e: any) => e.product_id === addBatchProduct.id && e.batch_id === batch.id);
    if (alreadyIn) {
      toast.info("Este lote ya está en el conteo");
      return;
    }
    onAddEntry({
      _isNew: true,
      product_id: addBatchProduct.id,
      products: { name: addBatchProduct.name },
      batch_id: batch.id,
      product_batches: { batch_number: batch.batch_number },
      warehouse_id: warehouseId,
      session_id: sessionId,
      session_warehouse_name: sessionWarehouseName,
      counted_quantity: 0,
      system_quantity: 0,
      notes: "",
    });
    toast.success(`Lote "${batch.batch_number}" agregado al conteo`);
  };

  // Group entries by product for the "Agregar Lote" button
  const productGroups = new Map<string, { name: string; firstIdx: number }>();
  entries.forEach((c: any, idx: number) => {
    if (!productGroups.has(c.product_id)) {
      productGroups.set(c.product_id, { name: c.products?.name || "—", firstIdx: idx });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Conteo Físico</DialogTitle>
        </DialogHeader>

        {/* Product search */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto por nombre o SKU para agregar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
           {search.length >= 2 && sortedSearchProducts.length > 0 && (
            <div className="border rounded-md max-h-40 overflow-y-auto">
              {sortedSearchProducts.map((p: any) => {
                const alreadyInList = existingProductIds.has(p.id);
                return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-4 py-2 hover:bg-muted/50 text-sm border-b last:border-b-0 ${alreadyInList ? "bg-primary/5" : ""}`}
                >
                  <div>
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 text-muted-foreground text-xs">{p.sku}</span>
                    {alreadyInList && <Badge variant="secondary" className="ml-2 text-xs">Ya en listado</Badge>}
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => handleAddProduct(p)} className="gap-1">
                    <Package className="h-3.5 w-3.5" />
                    Agregar
                  </Button>
                </div>
                );
              })}
            </div>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead className="text-center">Qty Sistema</TableHead>
              <TableHead className="text-center">Qty Contada</TableHead>
              <TableHead className="text-center">Diferencia</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedEntryIndices.map((idx: number) => {
              const c = entries[idx];
              const diff = c.counted_quantity - c.system_quantity;
              const isFirstOfProduct = productGroups.get(c.product_id)?.firstIdx === idx;
              const q = search?.toLowerCase() || "";
              const isSearchMatch = q.length >= 2 && (c.products?.name?.toLowerCase().includes(q) || c.products?.sku?.toLowerCase().includes(q));
              return (
                <TableRow key={c.id || `new-${idx}`} className={`${c._isNew ? "bg-primary/5" : ""} ${isSearchMatch ? "bg-accent/30" : ""}`}>
                  <TableCell className="font-medium text-sm">
                    {c.products?.name || "—"}
                    {c._isNew && <Badge variant="outline" className="ml-2 text-xs">Nuevo</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {c.products?.sku || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.products?.brand || "—"}
                  </TableCell>
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
                  <TableCell>
                    {isFirstOfProduct && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7"
                        onClick={() => {
                          setAddBatchProduct({ id: c.product_id, name: c.products?.name || "" });
                          setAddBatchOpen(true);
                        }}
                      >
                        <PlusCircle className="h-3 w-3" />
                        Lote
                      </Button>
                    )}
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

      {/* Add Batch Modal inside edit dialog */}
      {addBatchProduct && (
        <AddBatchToCountModal
          open={addBatchOpen}
          onOpenChange={(open) => {
            setAddBatchOpen(open);
            if (!open) setAddBatchProduct(null);
          }}
          productId={addBatchProduct.id}
          productName={addBatchProduct.name}
          existingBatchIds={entries.filter((e: any) => e.product_id === addBatchProduct.id).map((e: any) => e.batch_id).filter(Boolean)}
          onSelectBatch={handleSelectBatchFromModal}
          onCreateNewBatch={() => {
            setPendingProduct(addBatchProduct);
            setNewBatchOpen(true);
          }}
        />
      )}

      {/* New Batch Modal inside edit dialog */}
      <NewBatchModal
        open={newBatchOpen}
        onOpenChange={(open) => {
          setNewBatchOpen(open);
          if (!open) setPendingProduct(null);
        }}
        productId={pendingProduct?.id}
        productName={pendingProduct?.name}
        onConfirm={async (batchNumber, expirationDate, selectedProductId, selectedProductName, barcodeFromModal) => {
          if (!selectedProductId) return;
          try {
            const { data: newBatch, error } = await supabase.from("product_batches").insert({
              product_id: selectedProductId,
              batch_number: batchNumber,
              expiration_date: expirationDate,
              barcode: barcodeFromModal || "",
              initial_quantity: 0,
              current_quantity: 0,
            }).select("id, batch_number, current_quantity").single();
            if (error) throw error;
            toast.success(`Lote "${batchNumber}" creado para ${selectedProductName}`);

            onAddEntry({
              _isNew: true,
              product_id: selectedProductId,
              products: { name: selectedProductName || "" },
              batch_id: newBatch.id,
              product_batches: { batch_number: newBatch.batch_number },
              warehouse_id: warehouseId,
              session_id: sessionId,
              session_warehouse_name: sessionWarehouseName,
              counted_quantity: 0,
              system_quantity: 0,
              notes: "",
            });
            toast.info("Lote agregado al conteo.");
            setPendingProduct(null);
          } catch (err: any) {
            toast.error(err.message || "Error al crear lote");
          }
        }}
      />
    </Dialog>
  );
}
