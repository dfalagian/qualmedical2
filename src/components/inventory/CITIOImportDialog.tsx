import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Search, Plus, Check, Pill, Package } from "lucide-react";
import { cn } from "@/lib/utils";

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
  current_stock?: number;
  codigo_sat?: string;
  clave_unidad?: string;
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
  const [selectedMedication, setSelectedMedication] = useState<CITIOMedication | null>(null);

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
        med.medication_families?.name?.toLowerCase().includes(term)
    );
  }, [medications, searchTerm]);

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

  const handleImport = () => {
    if (selectedMedication) {
      onImport(selectedMedication);
      setSelectedMedication(null);
      setSearchTerm("");
    }
  };

  const isAlreadyImported = (id: string) => existingCitioIds.includes(id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Importar desde Catálogo CITIO
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar medicamento por nombre, marca o familia..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="flex-1 min-h-[300px] max-h-[400px] border rounded-md">
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
                      const isSelected = selectedMedication?.id === med.id;
                      
                      return (
                        <button
                          key={med.id}
                          onClick={() => !imported && setSelectedMedication(med)}
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
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className="font-medium truncate">{med.name}</span>
                              <span className="text-muted-foreground text-xs truncate">
                                {med.brand}
                                {med.presentacion && ` • ${med.presentacion}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {med.price_type_1 && (
                                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                  ${med.price_type_1.toFixed(2)}
                                </Badge>
                              )}
                              {imported ? (
                                <Badge variant="outline" className="text-green-600 text-xs px-1.5 py-0">
                                  <Check className="h-3 w-3 mr-0.5" />
                                  Imp.
                                </Badge>
                              ) : isSelected ? (
                                <Check className="h-4 w-4 text-primary" />
                              ) : null}
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

        {selectedMedication && (
          <div className="p-3 bg-primary/5 border rounded-lg">
            <div className="text-sm font-medium mb-1">Seleccionado:</div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <span className="font-semibold">{selectedMedication.name}</span>
              <span className="text-muted-foreground">- {selectedMedication.brand}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button 
            onClick={handleImport} 
            disabled={!selectedMedication}
          >
            <Plus className="h-4 w-4 mr-2" />
            Importar al Inventario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
