import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Printer, ArrowRightLeft, Package, Tag as TagIcon, Check, X, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { openWarehouseTransferPrint, TransferPrintItem, TransferPrintData } from "./warehouseTransferPrint";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLogger";
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

interface TransferRecord {
  id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  product_id: string | null;
  rfid_tag_id: string | null;
  batch_id: string | null;
  quantity: number | null;
  transfer_type: string;
  notes: string | null;
  created_at: string;
  status: string;
  transfer_group_id: string | null;
  from_warehouse?: { name: string } | null;
  to_warehouse?: { name: string } | null;
  products?: { name: string; brand: string | null; unit: string | null } | null;
  product_batches?: { batch_number: string; expiration_date: string } | null;
  rfid_tags?: {
    epc: string;
    products?: { name: string; brand: string | null; unit: string | null } | null;
    product_batches?: { batch_number: string; expiration_date: string } | null;
  } | null;
}

interface GroupedTransfer {
  key: string;
  groupId: string | null;
  date: string;
  fromWarehouse: string;
  fromWarehouseId: string;
  toWarehouse: string;
  toWarehouseId: string;
  items: TransferRecord[];
  notes: string | null;
  status: string;
}

export function WarehouseTransferHistory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "approve" | "cancel" | "deleteItem"; group?: GroupedTransfer; itemId?: string } | null>(null);

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ["warehouse_transfers_history"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("warehouse_transfers")
        .select(`
          *,
          from_warehouse:warehouses!warehouse_transfers_from_warehouse_id_fkey(name),
          to_warehouse:warehouses!warehouse_transfers_to_warehouse_id_fkey(name),
          products:product_id(name, brand, unit),
          product_batches:batch_id(batch_number, expiration_date),
          rfid_tags:rfid_tag_id(
            epc,
            products:product_id(name, brand, unit),
            product_batches:batch_id(batch_number, expiration_date)
          )
        `) as any)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as TransferRecord[];
    },
  });

  // Group transfers by transfer_group_id or by timestamp + warehouses
  const grouped: GroupedTransfer[] = [];
  const seen = new Set<string>();

  for (const t of transfers) {
    const key = t.transfer_group_id || `${t.created_at.slice(0, 16)}_${t.from_warehouse_id}_${t.to_warehouse_id}`;

    if (!seen.has(key)) {
      seen.add(key);
      const groupItems = transfers.filter(x =>
        t.transfer_group_id
          ? x.transfer_group_id === t.transfer_group_id
          : (x.created_at.slice(0, 16) === t.created_at.slice(0, 16) &&
             x.from_warehouse_id === t.from_warehouse_id &&
             x.to_warehouse_id === t.to_warehouse_id)
      );
      grouped.push({
        key,
        groupId: t.transfer_group_id,
        date: t.created_at,
        fromWarehouse: (t.from_warehouse as any)?.name || "—",
        fromWarehouseId: t.from_warehouse_id,
        toWarehouse: (t.to_warehouse as any)?.name || "—",
        toWarehouseId: t.to_warehouse_id,
        items: groupItems,
        notes: t.notes,
        status: t.status || "aprobada",
      });
    }
  }

  // Approve mutation - applies stock changes
  const approveMutation = useMutation({
    mutationFn: async (group: GroupedTransfer) => {
      for (const item of group.items) {
        if (item.transfer_type === "rfid" && item.rfid_tag_id) {
          // Move RFID tag to destination warehouse
          const { error: tagError } = await supabase
            .from("rfid_tags")
            .update({
              warehouse_id: group.toWarehouseId,
              last_location: group.toWarehouse,
              last_read_at: new Date().toISOString(),
            })
            .eq("id", item.rfid_tag_id);
          if (tagError) throw tagError;
        } else if (item.transfer_type === "manual" && item.product_id && item.quantity) {
          // Decrement source warehouse stock
          const { data: sourceStock } = await supabase
            .from("warehouse_stock")
            .select("current_stock")
            .eq("product_id", item.product_id)
            .eq("warehouse_id", group.fromWarehouseId)
            .maybeSingle();

          if (!sourceStock || sourceStock.current_stock < item.quantity) {
            const prodName = (item.products as any)?.name || "Producto";
            throw new Error(`Stock insuficiente para ${prodName} en almacén origen`);
          }

          await supabase
            .from("warehouse_stock")
            .update({ current_stock: sourceStock.current_stock - item.quantity })
            .eq("product_id", item.product_id)
            .eq("warehouse_id", group.fromWarehouseId);

          // Increment (or create) destination warehouse stock
          const { data: destStock } = await supabase
            .from("warehouse_stock")
            .select("current_stock")
            .eq("product_id", item.product_id)
            .eq("warehouse_id", group.toWarehouseId)
            .maybeSingle();

          if (destStock) {
            await supabase
              .from("warehouse_stock")
              .update({ current_stock: destStock.current_stock + item.quantity })
              .eq("product_id", item.product_id)
              .eq("warehouse_id", group.toWarehouseId);
          } else {
            await supabase
              .from("warehouse_stock")
              .insert({
                product_id: item.product_id,
                warehouse_id: group.toWarehouseId,
                current_stock: item.quantity,
              });
          }
        }
      }

      // Mark all items as approved
      const itemIds = group.items.map(i => i.id);
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from("warehouse_transfers")
        .update({
          status: "aprobada",
          approved_at: new Date().toISOString(),
          approved_by: user?.id || null,
        })
        .in("id", itemIds);
    },
    onSuccess: (_, group) => {
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers_history"] });
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products_for_transfer"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse_stock"] });

      logActivity({
        section: "inventario",
        action: "aprobar",
        entityType: "Transferencia Almacén",
        entityName: `${group.fromWarehouse} → ${group.toWarehouse}`,
        details: { items_count: group.items.length },
      });

      // Generate PDF
      handlePrint(group);

      toast({ title: "Transferencia aprobada", description: "El stock se ha movido correctamente." });
    },
    onError: (error: Error) => {
      toast({ title: "Error al aprobar", description: error.message, variant: "destructive" });
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (group: GroupedTransfer) => {
      const itemIds = group.items.map(i => i.id);
      await supabase
        .from("warehouse_transfers")
        .update({ status: "cancelada" })
        .in("id", itemIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers_history"] });
      toast({ title: "Transferencia cancelada" });
    },
  });

  // Delete single item from pending transfer
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("warehouse_transfers")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers_history"] });
      toast({ title: "Producto eliminado de la transferencia" });
    },
  });

  const handlePrint = (group: GroupedTransfer) => {
    const printItems: TransferPrintItem[] = group.items.map((item, idx) => {
      if (item.transfer_type === "rfid" && item.rfid_tags) {
        const tag = item.rfid_tags as any;
        return {
          index: idx + 1,
          productName: tag.products?.name || "Sin producto",
          brand: tag.products?.brand || "",
          batchNumber: tag.product_batches?.batch_number || "",
          expirationDate: tag.product_batches?.expiration_date
            ? format(new Date(tag.product_batches.expiration_date), "dd/MM/yyyy")
            : "",
          quantity: 1,
          unit: tag.products?.unit || "pieza",
          epc: tag.epc,
          type: "rfid" as const,
        };
      } else {
        const prod = item.products as any;
        const batch = item.product_batches as any;
        return {
          index: idx + 1,
          productName: prod?.name || "Sin producto",
          brand: prod?.brand || "",
          batchNumber: batch?.batch_number || "",
          expirationDate: batch?.expiration_date
            ? format(new Date(batch.expiration_date + "T00:00:00"), "dd/MM/yyyy")
            : "",
          quantity: item.quantity || 0,
          unit: prod?.unit || "pieza",
          type: "manual" as const,
        };
      }
    });

    openWarehouseTransferPrint({
      transferDate: new Date(group.date),
      fromWarehouse: group.fromWarehouse,
      toWarehouse: group.toWarehouse,
      items: printItems,
      notes: group.notes || undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pendiente":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Pendiente</Badge>;
      case "aprobada":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Aprobada</Badge>;
      case "cancelada":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Cancelada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Cargando historial...</div>;
  }

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <ArrowRightLeft className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">No hay transferencias registradas</p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Productos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="w-[160px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.map((group) => {
              const totalQty = group.items.reduce((s, i) => s + (i.quantity || 1), 0);
              const hasRfid = group.items.some((i) => i.transfer_type === "rfid");
              const hasManual = group.items.some((i) => i.transfer_type === "manual");
              const isPending = group.status === "pendiente";
              const isExpanded = expandedGroup === group.key;

              return (
                <>
                  <TableRow key={group.key} className={isPending ? "bg-yellow-50/50" : ""}>
                    <TableCell className="text-xs">
                      {format(new Date(group.date), "dd/MM/yyyy HH:mm", { locale: es })}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{group.fromWarehouse}</TableCell>
                    <TableCell className="text-sm font-medium">{group.toWarehouse}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                        className="flex items-center gap-1 hover:underline"
                      >
                        <Badge variant="secondary">{totalQty} unidad{totalQty !== 1 ? "es" : ""}</Badge>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    </TableCell>
                    <TableCell>{getStatusBadge(group.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {hasRfid && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <TagIcon className="h-3 w-3" /> RFID
                          </Badge>
                        )}
                        {hasManual && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Package className="h-3 w-3" /> Manual
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                      {group.notes || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {isPending && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => setConfirmAction({ type: "approve", group })}
                              title="Aprobar transferencia"
                              disabled={approveMutation.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setConfirmAction({ type: "cancel", group })}
                              title="Cancelar transferencia"
                              disabled={cancelMutation.isPending}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {group.status === "aprobada" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handlePrint(group)}
                            title="Imprimir reporte"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expanded detail rows */}
                  {isExpanded && group.items.map((item) => {
                    const isRfid = item.transfer_type === "rfid";
                    const prodName = isRfid
                      ? (item.rfid_tags as any)?.products?.name || "Sin producto"
                      : (item.products as any)?.name || "Sin producto";
                    const batchNum = isRfid
                      ? (item.rfid_tags as any)?.product_batches?.batch_number
                      : (item.product_batches as any)?.batch_number;
                    const qty = item.quantity || 1;

                    return (
                      <TableRow key={item.id} className="bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={3} className="text-xs">
                          <div className="flex items-center gap-2">
                            {isRfid ? <TagIcon className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                            <span className="font-medium">{prodName}</span>
                            {batchNum && <span className="text-muted-foreground">Lote: {batchNum}</span>}
                            <Badge variant="secondary" className="text-xs">{qty} ud{qty !== 1 ? "s" : ""}</Badge>
                            {isRfid && <span className="font-mono text-xs text-muted-foreground">{(item.rfid_tags as any)?.epc}</span>}
                          </div>
                        </TableCell>
                        <TableCell colSpan={3} />
                        <TableCell>
                          {isPending && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-500 hover:text-red-600"
                              onClick={() => setConfirmAction({ type: "deleteItem", itemId: item.id })}
                              title="Quitar de la transferencia"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Confirmation dialogs */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "approve" && "¿Aprobar transferencia?"}
              {confirmAction?.type === "cancel" && "¿Cancelar transferencia?"}
              {confirmAction?.type === "deleteItem" && "¿Eliminar producto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "approve" && "Se moverá el stock del almacén origen al destino. Esta acción no se puede deshacer."}
              {confirmAction?.type === "cancel" && "La transferencia se marcará como cancelada. No se moverá stock."}
              {confirmAction?.type === "deleteItem" && "Se eliminará este producto de la transferencia pendiente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmAction?.type === "approve" && confirmAction.group) {
                approveMutation.mutate(confirmAction.group);
              } else if (confirmAction?.type === "cancel" && confirmAction.group) {
                cancelMutation.mutate(confirmAction.group);
              } else if (confirmAction?.type === "deleteItem" && confirmAction.itemId) {
                deleteItemMutation.mutate(confirmAction.itemId);
              }
              setConfirmAction(null);
            }}>
              Sí, confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
