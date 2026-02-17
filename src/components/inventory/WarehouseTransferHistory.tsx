import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Printer, ArrowRightLeft, Package, Tag as TagIcon } from "lucide-react";
import { openWarehouseTransferPrint, TransferPrintItem, TransferPrintData } from "./warehouseTransferPrint";

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
  date: string;
  fromWarehouse: string;
  toWarehouse: string;
  items: TransferRecord[];
  notes: string | null;
}

export function WarehouseTransferHistory() {
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

  // Group transfers by timestamp + warehouses (same batch operation)
  const grouped: GroupedTransfer[] = [];
  const seen = new Set<string>();

  for (const t of transfers) {
    // Group by minute + warehouse pair
    const dateMin = t.created_at.slice(0, 16);
    const key = `${dateMin}_${t.from_warehouse_id}_${t.to_warehouse_id}`;

    if (!seen.has(key)) {
      seen.add(key);
      grouped.push({
        key,
        date: t.created_at,
        fromWarehouse: (t.from_warehouse as any)?.name || "—",
        toWarehouse: (t.to_warehouse as any)?.name || "—",
        items: transfers.filter(
          (x) =>
            x.created_at.slice(0, 16) === dateMin &&
            x.from_warehouse_id === t.from_warehouse_id &&
            x.to_warehouse_id === t.to_warehouse_id
        ),
        notes: t.notes,
      });
    }
  }

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

    const printData: TransferPrintData = {
      transferDate: new Date(group.date),
      fromWarehouse: group.fromWarehouse,
      toWarehouse: group.toWarehouse,
      items: printItems,
      notes: group.notes || undefined,
    };

    openWarehouseTransferPrint(printData);
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
    <ScrollArea className="h-[500px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead>Destino</TableHead>
            <TableHead>Productos</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Notas</TableHead>
            <TableHead className="w-[80px]">Reporte</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grouped.map((group) => {
            const totalQty = group.items.reduce((s, i) => s + (i.quantity || 1), 0);
            const hasRfid = group.items.some((i) => i.transfer_type === "rfid");
            const hasManual = group.items.some((i) => i.transfer_type === "manual");

            return (
              <TableRow key={group.key}>
                <TableCell className="text-xs">
                  {format(new Date(group.date), "dd/MM/yyyy HH:mm", { locale: es })}
                </TableCell>
                <TableCell className="text-sm font-medium">{group.fromWarehouse}</TableCell>
                <TableCell className="text-sm font-medium">{group.toWarehouse}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{totalQty} unidad{totalQty !== 1 ? "es" : ""}</Badge>
                </TableCell>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handlePrint(group)}
                    title="Imprimir reporte"
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
