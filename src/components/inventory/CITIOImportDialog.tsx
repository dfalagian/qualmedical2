import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Check, Pill, Package, CheckSquare, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CITIOMedication {
  id: string;
  name: string;
  brand: string;
  description: string;
  presentacion?: string;
  medication_families?: {
    id: string;
    name: string;
  };
  price_type_1?: number;
  price_type_2?: number;
  price_type_3?: number;
  price_type_4?: number;
  current_stock?: number;
  codigo_sat?: string;
  clave_unidad?: string;
  medication_code?: string;
  grupo_sat?: string;
}

interface CITIOImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (medication: CITIOMedication) => void;
  existingCitioIds: string[];
}

export function CITIOImportDialog({
  open,
  onOpenChange,
  onImport,
  existingCitioIds,
}: CITIOImportDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMedications, setSelectedMedications] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const queryClient = useQueryClient();

  const { data: medications = [], isLoading, error } = useQuery({
    queryKey: ['citio-medications-for-import'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-external-medications');
      
      if (error) throw error;
      
      const result = data?.data;
      
      if (result?.medications && Array.isArray(result.medications)) {
        return result.medications as CITIOMedication[];
      } else if (Array.isArray(result)) {
        return result as CITIOMedication[];
      }
      
      return [] as CITIOMedication[];
    },
    enabled: open,
  });

  const filteredMedications = useMemo(() => {
    if (!searchTerm.trim()) return medications;
    
    const term = searchTerm.toLowerCase();
    return medications.filter(
      (med) =>
        med.name?.toLowerCase().includes(term) ||
        med.brand?.toLowerCase().includes(term) ||
        med.description?.toLowerCase().includes(term) ||
        med.medication_families?.name?.toLowerCase().includes(term) ||
        med.medication_code?.toLowerCase().includes(term) ||
        med.grupo_sat?.toLowerCase().includes(term)
    );
  }, [medications, searchTerm]);

  // Medicamentos disponibles para importar (no importados aún)
  const availableMedications = useMemo(() => {
    return filteredMedications.filter(med => !existingCitioIds.includes(med.id));
  }, [filteredMedications, existingCitioIds]);

  const groupedByFamily = useMemo(() => {
    const groups: Record<string, CITIOMedication[]> = {};
    
    filteredMedications.forEach((med) => {
      const family = med.medication_families?.name || "Sin Familia";
      if (!groups[family]) {
        groups[family] = [];
      }
      groups[family].push(med);
    });
    
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredMedications]);

  const isAlreadyImported = (id: string) => existingCitioIds.includes(id);

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedMedications);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedMedications(newSelection);
  };

  const selectAll = () => {
    const allAvailableIds = availableMedications.map(med => med.id);
    setSelectedMedications(new Set(allAvailableIds));
  };

  const deselectAll = () => {
    setSelectedMedications(new Set());
  };

  const allSelected = availableMedications.length > 0 && 
    availableMedications.every(med => selectedMedications.has(med.id));

  // Generar SKU único
  const generateUniqueSKU = async (barcode: string): Promise<string> => {
    const basePrefix = barcode ? `${barcode}-QUAL` : 'MED-QUAL';
    
    // Buscar SKUs existentes con este prefijo
    const { data: existingSkus } = await supabase
      .from('products')
      .select('sku')
      .like('sku', `${basePrefix}-%`);
    
    // Encontrar el siguiente número secuencial
    let maxNum = 0;
    if (existingSkus && existingSkus.length > 0) {
      existingSkus.forEach(p => {
        const match = p.sku.match(/-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
    }
    
    return `${basePrefix}-${String(maxNum + 1).padStart(4, '0')}`;
  };

  // Importación masiva
  const handleBulkImport = async () => {
    if (selectedMedications.size === 0) return;
    
    setIsImporting(true);
    
    try {
      const selectedMeds = medications.filter(med => selectedMedications.has(med.id));
      let successCount = 0;
      let errorCount = 0;
      
      for (const med of selectedMeds) {
        try {
          const sku = await generateUniqueSKU(med.medication_code || '');
          
          const { error } = await supabase
            .from('products')
            .insert({
              citio_id: med.id,
              sku: sku,
              name: med.name,
              description: med.description,
              barcode: med.medication_code || null,
              brand: med.brand || null,
              category: med.medication_families?.name || null,
              grupo_sat: med.grupo_sat || null,
              unit: med.presentacion || 'pieza',
              price_type_1: med.price_type_1 || null,
              price_type_2: med.price_type_2 || null,
              price_type_3: med.price_type_3 || null,
              price_type_4: med.price_type_4 || null,
              current_stock: 0,
              minimum_stock: 0,
              is_active: true,
              rfid_required: false,
            });
          
          if (error) {
            console.error(`Error importing ${med.name}:`, error);
            errorCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          console.error(`Error importing ${med.name}:`, err);
          errorCount++;
        }
      }
      
      // Invalidar queries
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products-list'] });
      
      if (successCount > 0) {
        toast.success(`${successCount} producto(s) importado(s) correctamente`);
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} producto(s) no pudieron ser importados`);
      }
      
      // Limpiar selección y cerrar
      setSelectedMedications(new Set());
      setSearchTerm("");
      onOpenChange(false);
      
    } catch (error: any) {
      toast.error("Error en la importación: " + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  // Importación individual (mantener compatibilidad)
  const handleSingleImport = () => {
    if (selectedMedications.size === 1) {
      const medId = Array.from(selectedMedications)[0];
      const med = medications.find(m => m.id === medId);
      if (med) {
        onImport(med);
        setSelectedMedications(new Set());
        setSearchTerm("");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Importar desde Catálogo CITIO
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar medicamento por nombre, marca, familia o grupo SAT..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={allSelected ? deselectAll : selectAll}
            disabled={availableMedications.length === 0}
            className="whitespace-nowrap"
          >
            {allSelected ? (
              <>
                <Square className="h-4 w-4 mr-1" />
                Deseleccionar
              </>
            ) : (
              <>
                <CheckSquare className="h-4 w-4 mr-1" />
                Seleccionar Todos ({availableMedications.length})
              </>
            )}
          </Button>
        </div>

        {selectedMedications.size > 0 && (
          <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg">
            <Package className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              {selectedMedications.size} producto(s) seleccionado(s)
            </span>
          </div>
        )}

        <ScrollArea className="h-[300px] border rounded-md">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="p-4 text-center text-destructive">
              Error al cargar el catálogo CITIO
            </div>
          ) : filteredMedications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No se encontraron medicamentos
            </div>
          ) : (
            <div className="p-2">
              {groupedByFamily.map(([family, meds]) => (
                <div key={family} className="mb-4">
                  <div className="px-2 py-1 text-sm font-semibold text-muted-foreground bg-muted/50 rounded mb-2">
                    {family} ({meds.length})
                  </div>
                  <div className="space-y-0.5">
                    {meds.map((med) => {
                      const imported = isAlreadyImported(med.id);
                      const isSelected = selectedMedications.has(med.id);
                      
                      return (
                        <button
                          key={med.id}
                          onClick={() => !imported && toggleSelection(med.id)}
                          disabled={imported}
                          className={cn(
                            "w-full text-left px-2 py-1.5 rounded border transition-all text-sm",
                            imported
                              ? "bg-muted/30 opacity-60 cursor-not-allowed"
                              : isSelected
                              ? "bg-primary/10 border-primary"
                              : "hover:bg-accent hover:border-accent-foreground/20"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            {!imported && (
                              <Checkbox 
                                checked={isSelected} 
                                className="mt-0.5"
                                onClick={(e) => e.stopPropagation()}
                                onCheckedChange={() => toggleSelection(med.id)}
                              />
                            )}
                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                  <span className="font-medium truncate">{med.name}</span>
                                  <span className="text-muted-foreground text-xs truncate">
                                    {med.brand}
                                    {med.presentacion && ` • ${med.presentacion}`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {med.price_type_1 != null && med.price_type_1 > 0 && (
                                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                      ${med.price_type_1.toFixed(2)}
                                    </Badge>
                                  )}
                                  {imported && (
                                    <Badge variant="secondary" className="text-xs px-1.5 py-0 border-green-200 bg-green-50 text-green-700">
                                      <Check className="h-3 w-3 mr-0.5" />
                                      Imp.
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                                {med.medication_code && (
                                  <span className="font-mono bg-muted px-1 rounded">CB: {med.medication_code}</span>
                                )}
                                {med.grupo_sat && (
                                  <span className="bg-accent text-accent-foreground px-1 rounded truncate max-w-[300px]" title={med.grupo_sat}>
                                    {med.grupo_sat}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={isImporting}>Cancelar</Button>
          </DialogClose>
          <Button 
            onClick={handleBulkImport} 
            disabled={selectedMedications.size === 0 || isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Importar {selectedMedications.size > 0 ? `(${selectedMedications.size})` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}