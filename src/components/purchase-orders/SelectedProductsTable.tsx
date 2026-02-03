import React from "react";
import { Package, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface SelectedProductRow {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  hasIva: boolean;
  ivaAmount: number;
  total: number;
}

interface SelectedProductsTableProps {
  products: SelectedProductRow[];
  onRemove: (productId: string) => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  maxHeight?: number; // px
}

export const SelectedProductsTable = React.memo(
  ({ products, onRemove, onQuantityChange, maxHeight = 320 }: SelectedProductsTableProps) => {
    return (
      <div className="border rounded-lg overflow-hidden bg-background">
        {products.length > 0 ? (
          <ScrollArea className="w-full" style={{ maxHeight }}>
            <div className="w-full overflow-x-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b bg-background">
                  <tr>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[44%]">
                      Producto
                    </th>
                    <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground w-[12%]">
                      Cant.
                    </th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground w-[14%]">
                      P. Unit.
                    </th>
                    <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground w-[12%]">
                      IVA
                    </th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground w-[14%]">
                      Importe
                    </th>
                    <th className="h-12 px-2 text-left align-middle font-medium text-muted-foreground w-[4%]" />
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {products.map((p, idx) => (
                    <tr key={`${p.id}-${p.sku}-${idx}`} className="border-b transition-colors hover:bg-muted/50">
                      <td className="p-4 align-middle">
                        <div>
                          <p className="font-medium text-sm">{p.name}</p>
                          <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>
                        </div>
                      </td>

                      <td className="p-4 align-middle text-center">
                        <Input
                          type="number"
                          min={1}
                          value={p.quantity}
                          onChange={(e) =>
                            onQuantityChange(p.id, Math.max(1, parseInt(e.target.value) || 1))
                          }
                          className="w-16 h-8 text-center mx-auto"
                        />
                      </td>

                      <td className="p-4 align-middle text-right">${p.unitPrice.toFixed(2)}</td>

                      <td className="p-4 align-middle text-center">
                        {p.hasIva ? (
                          <span className="text-xs text-primary font-medium">${p.ivaAmount.toFixed(2)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">0%</span>
                        )}
                      </td>

                      <td className="p-4 align-middle text-right font-semibold">${p.total.toFixed(2)}</td>

                      <td className="p-2 align-middle">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => onRemove(p.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No hay productos agregados</p>
            <p className="text-xs">Usa el buscador para agregar productos</p>
          </div>
        )}
      </div>
    );
  },
);

SelectedProductsTable.displayName = "SelectedProductsTable";
