import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { todayLocalStr } from "@/lib/formatters";

interface WhatsAppProductMatcherProps {
  request: any;
  onConverted: () => void;
}

interface ProductSelection {
  productId: string;
  productName: string;
}

export function WhatsAppProductMatcher({ request, onConverted }: WhatsAppProductMatcherProps) {
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selections, setSelections] = useState<Record<string, ProductSelection>>({});
  const [converting, setConverting] = useState(false);

  const productos: any[] = request.extracted_data?.productos || [];

  const { data: products = [] } = useQuery({
    queryKey: ["all-products-for-matching"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, brand, grupo_sat, current_stock")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  if (productos.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No hay productos extraídos en esta solicitud.</p>;
  }

  const handleSelect = (idx: number, productId: string, productName: string) => {
    setSelections(prev => ({ ...prev, [idx]: { productId, productName } }));
    setOpenPopoverId(null);
    setSearchTerm("");
  };

  const handleClear = (idx: number) => {
    setSelections(prev => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  const handleConvertToQuote = async () => {
    setConverting(true);
    try {
      // Find or create client
      const contactName = request.contact_name || request.extracted_data?.datos_fiscales?.emisor_nombre || "WhatsApp";
      let clientId: string;

      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .ilike("nombre_cliente", `%${contactName}%`)
        .limit(1)
        .single();

      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const { data: newClient, error: clientError } = await supabase
          .from("clients")
          .insert({
            nombre_cliente: contactName,
            razon_social: request.extracted_data?.datos_fiscales?.emisor_nombre || null,
            rfc: request.extracted_data?.datos_fiscales?.emisor_rfc || null,
          })
          .select("id")
          .single();
        if (clientError) throw clientError;
        clientId = newClient.id;
      }

      // Generate folio
      const { data: folioData } = await supabase.rpc("generate_quote_folio");
      const folio = folioData || `COT-WA-${Date.now()}`;

      // Calculate totals
      const subtotal = productos.reduce((sum: number, p: any) =>
        sum + (Number(p.cantidad || 1) * Number(p.precio_unitario || 0)), 0
      );

      // Create quote
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          client_id: clientId,
          folio,
          concepto: request.extracted_data?.resumen || `Solicitud WhatsApp - ${contactName}`,
          fecha_cotizacion: todayLocalStr(),
          subtotal,
          total: subtotal,
          status: "borrador",
          notes: `Importado desde WhatsApp. Contacto: ${contactName}${request.source_phone ? ` (${request.source_phone})` : ''}`,
        })
        .select("id")
        .single();
      if (quoteError) throw quoteError;

      // Build catalog lookup
      const catalogById = new Map(products.map((p: any) => [p.id, p]));

      // Create quote items
      const quoteItems = productos.map((p: any, idx: number) => {
        const selection = selections[idx];
        const productId = selection?.productId || null;
        const catalogProduct = productId ? catalogById.get(productId) : null;
        const nombreFinal = catalogProduct?.name || p.descripcion;

        return {
          quote_id: quote.id,
          product_id: productId,
          nombre_producto: nombreFinal,
          cantidad: Number(p.cantidad || 1),
          precio_unitario: Number(p.precio_unitario || 0),
          importe: Number(p.cantidad || 1) * Number(p.precio_unitario || 0),
        };
      });

      const { error: itemsError } = await supabase.from("quote_items").insert(quoteItems);
      if (itemsError) throw itemsError;

      // Update sales request status
      await supabase
        .from("sales_requests")
        .update({ status: "completada" })
        .eq("id", request.id);

      toast.success(`Cotización ${folio} creada exitosamente`);
      onConverted();
    } catch (err: any) {
      toast.error(err.message || "Error al convertir a cotización");
    } finally {
      setConverting(false);
    }
  };

  const linkedCount = Object.keys(selections).length;
  const totalCount = productos.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Vincule cada producto con el catálogo de inventario antes de convertir.
          <span className="ml-2 font-medium">
            {linkedCount}/{totalCount} vinculados
          </span>
        </div>
        <Button
          size="sm"
          className="gap-1"
          disabled={converting || request.status === "completada"}
          onClick={handleConvertToQuote}
        >
          {converting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Convirtiendo...
            </>
          ) : (
            <>
              <ArrowRight className="h-3.5 w-3.5" />
              Convertir a cotización
            </>
          )}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descripción extraída</TableHead>
              <TableHead className="w-[60px]">Cant.</TableHead>
              <TableHead className="w-[90px]">P. Unit.</TableHead>
              <TableHead className="w-[280px]">Producto inventario</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productos.map((p: any, idx: number) => {
              const sel = selections[idx];
              return (
                <TableRow key={idx}>
                  <TableCell className="text-xs">
                    {p.descripcion}
                    {sel && (
                      <span className="block text-[10px] text-green-600">✓ {sel.productName}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-center">{p.cantidad || 1}</TableCell>
                  <TableCell className="text-xs text-right">
                    ${Number(p.precio_unitario || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <Popover
                      open={openPopoverId === String(idx)}
                      onOpenChange={(open) => {
                        setOpenPopoverId(open ? String(idx) : null);
                        if (!open) setSearchTerm("");
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "w-full justify-between text-xs h-7",
                            sel && "border-green-300 bg-green-50"
                          )}
                        >
                          <span className="truncate">
                            {sel ? sel.productName : "Seleccionar..."}
                          </span>
                          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[350px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Buscar producto..."
                            className="text-xs"
                            value={searchTerm}
                            onValueChange={setSearchTerm}
                          />
                          <CommandList>
                            <CommandEmpty>No encontrado.</CommandEmpty>
                            <CommandGroup className="max-h-[200px] overflow-auto">
                              {sel && (
                                <CommandItem
                                  onSelect={() => handleClear(idx)}
                                  className="text-xs text-destructive"
                                >
                                  ✕ Quitar vinculación
                                </CommandItem>
                              )}
                              {(() => {
                                const term = searchTerm.toLowerCase().trim();
                                const filtered = term
                                  ? products.filter((pr: any) =>
                                      pr.name.toLowerCase().includes(term) ||
                                      pr.sku.toLowerCase().includes(term) ||
                                      (pr.brand && pr.brand.toLowerCase().includes(term)) ||
                                      (pr.grupo_sat && pr.grupo_sat.toLowerCase().includes(term))
                                    )
                                  : products.slice(0, 50);
                                return filtered.slice(0, 50).map((product: any) => (
                                  <CommandItem
                                    key={product.id}
                                    value={product.id}
                                    onSelect={() => handleSelect(idx, product.id, product.name)}
                                    className="text-xs"
                                  >
                                    <Check
                                      className={cn(
                                        "mr-1 h-3 w-3",
                                        sel?.productId === product.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="truncate font-medium">{product.name}</div>
                                      <div className="text-[10px] text-muted-foreground">
                                        SKU: {product.sku}
                                        {product.brand && ` | ${product.brand}`}
                                        {product.current_stock != null && ` | Stock: ${product.current_stock}`}
                                      </div>
                                    </div>
                                  </CommandItem>
                                ));
                              })()}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
