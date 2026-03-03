import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, CheckCircle2 } from "lucide-react";

interface SessionCount {
  id: string;
  product_id: string;
  batch_id: string | null;
  warehouse_id: string;
  counted_quantity: number;
  system_quantity: number;
  difference: number | null;
  notes: string | null;
  counted_at: string;
  session_warehouse_name: string | null;
  products?: { name: string; sku: string } | null;
  product_batches?: { batch_number: string } | null;
  warehouses?: { name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts: SessionCount[];
  warehouseName: string;
  sessionDate: string;
}

export function PhysicalCountSessionView({ open, onOpenChange, counts, warehouseName, sessionDate }: Props) {
  const handlePrint = () => {
    const productGroups: Record<string, SessionCount[]> = {};
    counts.forEach((c) => {
      const pid = c.product_id;
      if (!productGroups[pid]) productGroups[pid] = [];
      productGroups[pid].push(c);
    });

    const html = `
      <!DOCTYPE html>
      <html><head>
        <meta charset="utf-8">
        <title>Conteo Físico - ${warehouseName}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          .header-info { color: #666; margin-bottom: 16px; font-size: 11px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f5f5f5; font-size: 11px; }
          .total-row { background: #f0f0f0; font-weight: bold; }
          .diff-ok { color: green; }
          .diff-bad { color: red; font-weight: bold; }
          .text-center { text-align: center; }
          @media print { body { margin: 10px; } }
        </style>
      </head><body>
        <h1>Reporte de Conteo Físico</h1>
        <div class="header-info">
          <strong>Almacén:</strong> ${warehouseName} &nbsp;&nbsp;|&nbsp;&nbsp;
          <strong>Fecha:</strong> ${new Date(sessionDate).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <strong>Total productos:</strong> ${Object.keys(productGroups).length}
        </div>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Lote</th>
              <th class="text-center">Qty Sistema</th>
              <th class="text-center">Qty Contada</th>
              <th class="text-center">Diferencia</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(productGroups).map((group) => {
              const productName = group[0].products?.name || "—";
              const rows = group.map((c, i) => {
                const diff = c.counted_quantity - c.system_quantity;
                return `<tr>
                  <td>${i === 0 ? productName : ""}</td>
                  <td>${c.product_batches?.batch_number || "—"}</td>
                  <td class="text-center">${c.system_quantity}</td>
                  <td class="text-center">${c.counted_quantity}</td>
                  <td class="text-center ${diff === 0 ? "diff-ok" : "diff-bad"}">${diff === 0 ? "OK" : (diff > 0 ? "+" : "") + diff}</td>
                  <td>${c.notes || ""}</td>
                </tr>`;
              }).join("");

              if (group.length > 1) {
                const totalSys = group.reduce((s, c) => s + c.system_quantity, 0);
                const totalCounted = group.reduce((s, c) => s + c.counted_quantity, 0);
                const totalDiff = totalCounted - totalSys;
                return rows + `<tr class="total-row">
                  <td colspan="2" style="text-align:right">Total ${productName}:</td>
                  <td class="text-center">${totalSys}</td>
                  <td class="text-center">${totalCounted}</td>
                  <td class="text-center ${totalDiff === 0 ? "diff-ok" : "diff-bad"}">${totalDiff === 0 ? "OK" : (totalDiff > 0 ? "+" : "") + totalDiff}</td>
                  <td></td>
                </tr>`;
              }
              return rows;
            }).join("")}
          </tbody>
        </table>
        <script>window.onload = () => window.print();</script>
      </body></html>
    `;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  const totalSystem = counts.reduce((s, c) => s + c.system_quantity, 0);
  const totalCounted = counts.reduce((s, c) => s + c.counted_quantity, 0);
  const withDiff = counts.filter((c) => c.counted_quantity - c.system_quantity !== 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Detalle de Conteo Físico</span>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" />
              Imprimir PDF
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
          <span><strong>Almacén:</strong> {warehouseName}</span>
          <span><strong>Fecha:</strong> {new Date(sessionDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <span><strong>Registros:</strong> {counts.length}</span>
          {withDiff > 0 && <Badge variant="destructive">{withDiff} con diferencia</Badge>}
        </div>

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
            {counts.map((c) => {
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
                  <TableCell className="text-center font-mono">{c.counted_quantity}</TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={diff === 0 ? "secondary" : "destructive"}
                      className={diff === 0 ? "bg-green-100 text-green-800" : ""}
                    >
                      {diff === 0 ? <><CheckCircle2 className="h-3 w-3 mr-1" />OK</> : `${diff > 0 ? "+" : ""}${diff}`}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.notes || "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="flex justify-between text-sm mt-2 border-t pt-2">
          <span>Total Sistema: <strong>{totalSystem}</strong></span>
          <span>Total Contado: <strong>{totalCounted}</strong></span>
          <span>Diferencia global: <strong className={totalCounted - totalSystem !== 0 ? "text-destructive" : "text-green-600"}>
            {totalCounted - totalSystem === 0 ? "OK" : `${totalCounted - totalSystem > 0 ? "+" : ""}${totalCounted - totalSystem}`}
          </strong></span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
