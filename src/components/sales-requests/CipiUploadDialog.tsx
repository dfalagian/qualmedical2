import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Image, FileText, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

interface CipiUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "cipi" | "cipi_pro";
  onSuccess: () => void;
}

interface ParsedExcelData {
  header: Record<string, any>;
  items: Array<Record<string, any>>;
  subtotal: number;
  impuestos: number;
  total: number;
}

export function CipiUploadDialog({ open, onOpenChange, type, onSuccess }: CipiUploadDialogProps) {
  const [uploading, setUploading] = useState(false);
  const [rawText, setRawText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const parseExcel = (file: File): Promise<ParsedExcelData> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];

          // Get all cells including hidden columns info
          const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
          
          // Check for hidden columns
          const hiddenCols = new Set<number>();
          if (sheet["!cols"]) {
            sheet["!cols"].forEach((col: any, idx: number) => {
              if (col && col.hidden) hiddenCols.add(idx);
            });
          }

          // Parse header info from top rows
          const header: Record<string, any> = {};
          const getCellValue = (ref: string) => {
            const cell = sheet[ref];
            return cell ? (cell.v !== undefined ? cell.v : '') : '';
          };

          // Extract header fields based on the known CIPI format
          header.empresa = getCellValue("B3") || '';
          header.razon_social = getCellValue("B4") || '';
          header.rfc = getCellValue("B5") || '';
          header.cfdi = getCellValue("B6") || '';
          header.concepto = getCellValue("B7") || '';
          header.folio = getCellValue("G3") || '';
          header.fecha_cotizacion = getCellValue("G4") || '';
          header.factura_anterior = getCellValue("G5") || '';
          header.fecha_ultima_factura = getCellValue("G6") || '';
          header.monto_ultima_factura = getCellValue("G7") || '';
          header.fecha_entrega = getCellValue("B8") || '';

          // Find the data header row (DESCRIPCION, MARCA, LOTE, etc.)
          let headerRow = -1;
          for (let r = 0; r <= Math.min(range.e.r, 20); r++) {
            const cellA = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
            if (cellA && typeof cellA.v === 'string' && cellA.v.toUpperCase().includes('DESCRIPCION')) {
              headerRow = r;
              break;
            }
          }

          if (headerRow === -1) {
            // Try to find it by scanning all cells
            for (let r = 0; r <= Math.min(range.e.r, 20); r++) {
              for (let c = 0; c <= range.e.c; c++) {
                const cell = sheet[XLSX.utils.encode_cell({ r, c })];
                if (cell && typeof cell.v === 'string' && cell.v.toUpperCase().includes('DESCRIPCION')) {
                  headerRow = r;
                  break;
                }
              }
              if (headerRow !== -1) break;
            }
          }

          // Map column headers, excluding hidden columns
          const colMap: Record<number, string> = {};
          if (headerRow !== -1) {
            for (let c = range.s.c; c <= range.e.c; c++) {
              if (hiddenCols.has(c)) continue;
              const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
              if (cell && cell.v) {
                const val = String(cell.v).toUpperCase().trim();
                colMap[c] = val;
              }
            }
          }

          // Parse items starting after header row
          const items: Array<Record<string, any>> = [];
          let currentCategory = "";
          let subtotal = 0;
          let impuestos = 0;
          let total = 0;

          for (let r = headerRow + 1; r <= range.e.r; r++) {
            const firstCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
            const firstVal = firstCell ? String(firstCell.v || '').trim() : '';

            // Check for subtotal/total rows
            if (firstVal.toUpperCase().includes('SUB TOTAL') || firstVal.toUpperCase().includes('SUBTOTAL')) continue;
            if (firstVal.toUpperCase().includes('IMPUESTOS')) continue;
            if (firstVal.toUpperCase() === 'TOTAL') continue;

            // Check for totals in other columns
            let isTotalRow = false;
            for (let c = 0; c <= range.e.c; c++) {
              const cell = sheet[XLSX.utils.encode_cell({ r, c })];
              if (cell && typeof cell.v === 'string') {
                const v = cell.v.toUpperCase().trim();
                if (v === 'SUB TOTAL:' || v === 'SUBTOTAL:') {
                  const nextCell = sheet[XLSX.utils.encode_cell({ r, c: c + 1 })];
                  if (nextCell) subtotal = Number(nextCell.v) || 0;
                  isTotalRow = true;
                }
                if (v === 'IMPUESTOS:') {
                  const nextCell = sheet[XLSX.utils.encode_cell({ r, c: c + 1 })];
                  if (nextCell) impuestos = Number(nextCell.v) || 0;
                  isTotalRow = true;
                }
                if (v === 'TOTAL:') {
                  const nextCell = sheet[XLSX.utils.encode_cell({ r, c: c + 1 })];
                  if (nextCell) total = Number(nextCell.v) || 0;
                  isTotalRow = true;
                }
              }
            }
            if (isTotalRow) continue;

            // Check if this is a category header (e.g., MEDICAMENTOS, ONCOLOGICOS, etc.)
            const categories = ['MEDICAMENTOS', 'ONCOLOGICOS', 'INMUNOTERAPIA', 'SOLUCIONES', 'INSUMOS'];
            if (categories.includes(firstVal.toUpperCase())) {
              currentCategory = firstVal.toUpperCase();
              continue;
            }

            // Skip empty rows
            if (!firstVal) continue;

            // This should be a product row
            const item: Record<string, any> = { categoria: currentCategory };

            for (const [colIdx, colName] of Object.entries(colMap)) {
              const c = Number(colIdx);
              if (hiddenCols.has(c)) continue;
              const cell = sheet[XLSX.utils.encode_cell({ r, c })];
              if (!cell) continue;

              let value = cell.v;
              // Handle dates
              if (cell.t === 'd' || (cell.t === 'n' && colName.includes('CAD'))) {
                if (cell.w) value = cell.w;
                else if (typeof value === 'number') {
                  const date = XLSX.SSF.parse_date_code(value);
                  if (date) value = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
                }
              }

              if (colName.includes('DESCRIPCION')) item.descripcion = String(value || '');
              else if (colName === 'MARCA') item.marca = String(value || '');
              else if (colName === 'LOTE') item.lote = String(value || '');
              else if (colName === 'CAD') item.caducidad = value;
              else if (colName === 'UNIDAD' || colName.includes('UNIDAD')) {
                // Check if this is quantity (number) or unit type
                if (typeof value === 'number') item.cantidad = value;
                else item.cantidad = parseInt(String(value)) || 1;
              }
              else if (colName.includes('PRECIO UNITARIO')) item.precio_unitario = Number(value) || 0;
              else if (colName === 'IVA') item.iva = Number(value) || 0;
              else if (colName === 'PRECIO' && !colName.includes('UNITARIO')) item.precio = Number(value) || 0;
            }

            if (item.descripcion) {
              items.push(item);
            }
          }

          resolve({ header, items, subtotal, impuestos, total });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Parse Excel client-side
      const parsed = await parseExcel(file);

      // Upload file to storage
      const filePath = `cipi/${type}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("sales-requests")
        .upload(filePath, file);
      
      const fileUrl = uploadError ? null : filePath;

      // Parse date values
      let fechaCotizacion: string | null = null;
      let fechaEntrega: string | null = null;
      let fechaUltimaFactura: string | null = null;

      const parseDate = (val: any): string | null => {
        if (!val) return null;
        if (typeof val === 'number') {
          const d = XLSX.SSF.parse_date_code(val);
          if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }
        if (typeof val === 'string') {
          const d = new Date(val);
          if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        }
        return null;
      };

      fechaCotizacion = parseDate(parsed.header.fecha_cotizacion);
      fechaEntrega = parseDate(parsed.header.fecha_entrega);
      fechaUltimaFactura = parseDate(parsed.header.fecha_ultima_factura);

      // Create CIPI request
      const { data: request, error: insertError } = await supabase
        .from("cipi_requests")
        .insert({
          type,
          folio: parsed.header.folio ? String(parsed.header.folio) : null,
          empresa: parsed.header.empresa ? String(parsed.header.empresa) : null,
          razon_social: parsed.header.razon_social ? String(parsed.header.razon_social) : null,
          rfc: parsed.header.rfc ? String(parsed.header.rfc) : null,
          cfdi: parsed.header.cfdi ? String(parsed.header.cfdi) : null,
          concepto: parsed.header.concepto ? String(parsed.header.concepto) : null,
          fecha_cotizacion: fechaCotizacion,
          fecha_entrega: fechaEntrega,
          factura_anterior: parsed.header.factura_anterior ? String(parsed.header.factura_anterior) : null,
          fecha_ultima_factura: fechaUltimaFactura,
          monto_ultima_factura: parsed.header.monto_ultima_factura ? Number(parsed.header.monto_ultima_factura) : null,
          subtotal: parsed.subtotal,
          impuestos: parsed.impuestos,
          total: parsed.total,
          file_url: fileUrl,
          file_name: file.name,
          file_type: file.type,
          extraction_status: "completed",
          status: "nueva",
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // Insert items
      if (parsed.items.length > 0) {
        const items = parsed.items.map((item) => ({
          cipi_request_id: request.id,
          categoria: item.categoria || null,
          descripcion: item.descripcion || "Sin descripción",
          marca: item.marca || null,
          lote: item.lote ? String(item.lote) : null,
          caducidad: parseDate(item.caducidad),
          cantidad: item.cantidad || 1,
          precio_unitario: item.precio_unitario || 0,
          iva: item.iva || 0,
          precio: item.precio || 0,
        }));

        const { error: itemsError } = await supabase.from("cipi_request_items").insert(items);
        if (itemsError) throw itemsError;
      }

      toast.success(`${parsed.items.length} productos extraídos del Excel`);
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error parsing Excel:", err);
      toast.error(err.message || "Error al procesar el Excel");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Upload file to storage
      const filePath = `cipi/${type}/${Date.now()}_${file.name}`;
      await supabase.storage.from("sales-requests").upload(filePath, file);

      // Create request with pending extraction
      const { data: request, error } = await supabase
        .from("cipi_requests")
        .insert({
          type,
          file_url: filePath,
          file_name: file.name,
          file_type: file.type,
          extraction_status: "pending",
          status: "nueva",
        })
        .select("id")
        .single();

      if (error) throw error;

      // Trigger AI extraction
      toast.info("Extrayendo información del archivo...");
      const { error: fnError } = await supabase.functions.invoke("extract-cipi-request", {
        body: { requestId: request.id },
      });

      if (fnError) {
        toast.warning("El archivo se guardó pero la extracción falló. Puede reintentar.");
      } else {
        toast.success("Información extraída exitosamente");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al subir archivo");
    } finally {
      setUploading(false);
      if (mediaInputRef.current) mediaInputRef.current.value = "";
    }
  };

  const handleTextSubmit = async () => {
    if (!rawText.trim()) {
      toast.error("Ingrese el texto de la solicitud");
      return;
    }

    setUploading(true);
    try {
      const { data: request, error } = await supabase
        .from("cipi_requests")
        .insert({
          type,
          raw_text: rawText,
          extraction_status: "pending",
          status: "nueva",
        })
        .select("id")
        .single();

      if (error) throw error;

      toast.info("Extrayendo información del texto...");
      const { error: fnError } = await supabase.functions.invoke("extract-cipi-request", {
        body: { requestId: request.id },
      });

      if (fnError) {
        toast.warning("Guardado pero extracción falló.");
      } else {
        toast.success("Información extraída exitosamente");
      }

      setRawText("");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva solicitud {type === "cipi" ? "CIPI" : "CIPI Pro"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="excel" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="excel" className="gap-1 text-xs">
              <FileSpreadsheet className="h-3 w-3" />
              Excel
            </TabsTrigger>
            <TabsTrigger value="media" className="gap-1 text-xs">
              <Image className="h-3 w-3" />
              Imagen/PDF
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-1 text-xs">
              <FileText className="h-3 w-3" />
              Texto libre
            </TabsTrigger>
          </TabsList>

          <TabsContent value="excel" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Archivo Excel (.xlsx, .xls)</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelUpload}
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground">
                Se extraerán automáticamente los productos, precios y datos del encabezado.
              </p>
            </div>
            {uploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Procesando Excel...
              </div>
            )}
          </TabsContent>

          <TabsContent value="media" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Imagen o PDF</Label>
              <Input
                ref={mediaInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleMediaUpload}
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground">
                Se usará IA para extraer la información del archivo.
              </p>
            </div>
            {uploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Procesando archivo...
              </div>
            )}
          </TabsContent>

          <TabsContent value="text" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Texto libre</Label>
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Escriba o pegue aquí la solicitud de medicamentos..."
                rows={6}
                disabled={uploading}
              />
            </div>
            <Button onClick={handleTextSubmit} disabled={uploading || !rawText.trim()} className="w-full gap-2">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Enviar y extraer
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
