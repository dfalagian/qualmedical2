import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Search, Pill, Pencil, Trash2, Save, X, ChevronDown, ChevronRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
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

interface Medication {
  id: string;
  name: string;
  brand: string;
  description: string;
  dosage?: string;
  lote?: string;
  family?: string;
  familia?: string;
  [key: string]: any;
}

// Map of field names to Spanish labels
const fieldLabels: Record<string, string> = {
  name: 'Nombre',
  brand: 'Marca',
  description: 'Descripción',
  dosage: 'Dosis',
  lote: 'Lote',
  family: 'Familia',
  familia: 'Familia',
  quantity: 'Cantidad',
  price: 'Precio',
  expiration: 'Caducidad',
  expiration_date: 'Fecha Caducidad',
  created_at: 'Creado',
  updated_at: 'Actualizado',
};

const MedicationsCatalogCITIO = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [groupByFamily, setGroupByFamily] = useState(true);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: medications, isLoading, error } = useQuery({
    queryKey: ['external-medications-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-external-medications');
      
      if (error) throw error;
      
      const result = data?.data;
      
      if (result?.medications && Array.isArray(result.medications)) {
        return result.medications as Medication[];
      }
      
      if (Array.isArray(result)) {
        return result as Medication[];
      }
      
      console.log('Unexpected response format:', JSON.stringify(data).slice(0, 300));
      return [] as Medication[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updateData: Record<string, any>) => {
      const { data, error } = await supabase.functions.invoke('get-external-medications', {
        method: 'PUT',
        body: updateData,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Medicamento actualizado correctamente');
      queryClient.invalidateQueries({ queryKey: ['external-medications-catalog'] });
      setEditingMedication(null);
      setEditFormData({});
    },
    onError: (error: Error) => {
      toast.error(`Error al actualizar: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('get-external-medications', {
        method: 'DELETE',
        body: { id },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Medicamento eliminado correctamente');
      queryClient.invalidateQueries({ queryKey: ['external-medications-catalog'] });
      setDeleteConfirmId(null);
    },
    onError: (error: Error) => {
      toast.error(`Error al eliminar: ${error.message}`);
    },
  });

  // Get all columns from data (excluding id)
  const allColumns = useMemo(() => {
    if (!medications || medications.length === 0) return [];
    const cols = Object.keys(medications[0]).filter(col => col !== 'id');
    // Sort to put important columns first
    const priority = ['name', 'brand', 'description', 'dosage', 'lote', 'family', 'familia'];
    return cols.sort((a, b) => {
      const aIdx = priority.indexOf(a);
      const bIdx = priority.indexOf(b);
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return a.localeCompare(b);
    });
  }, [medications]);

  // Display columns (first 6 most important)
  const displayColumns = allColumns.slice(0, 6);

  // Filter medications based on search term
  const filteredMedications = useMemo(() => {
    if (!medications) return [];
    const searchLower = searchTerm.toLowerCase();
    return medications.filter((med) => 
      Object.values(med).some(
        (value) => value && String(value).toLowerCase().includes(searchLower)
      )
    );
  }, [medications, searchTerm]);

  // Group medications by family
  const groupedMedications = useMemo(() => {
    if (!groupByFamily) return null;
    
    const groups: Record<string, Medication[]> = {};
    filteredMedications.forEach(med => {
      const familyKey = med.family || med.familia || 'Sin Familia';
      if (!groups[familyKey]) {
        groups[familyKey] = [];
      }
      groups[familyKey].push(med);
    });
    
    // Sort families alphabetically
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredMedications, groupByFamily]);

  // Get unique families for filter
  const families = useMemo(() => {
    if (!medications) return [];
    const familySet = new Set<string>();
    medications.forEach(med => {
      const family = med.family || med.familia;
      if (family) familySet.add(family);
    });
    return Array.from(familySet).sort();
  }, [medications]);

  const toggleFamily = (family: string) => {
    setExpandedFamilies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(family)) {
        newSet.delete(family);
      } else {
        newSet.add(family);
      }
      return newSet;
    });
  };

  const expandAllFamilies = () => {
    if (groupedMedications) {
      setExpandedFamilies(new Set(groupedMedications.map(([family]) => family)));
    }
  };

  const collapseAllFamilies = () => {
    setExpandedFamilies(new Set());
  };

  const handleEdit = (medication: Medication) => {
    setEditingMedication(medication);
    setEditFormData({ ...medication });
  };

  const handleSaveEdit = () => {
    if (!editFormData.id) return;
    updateMutation.mutate(editFormData);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteMutation.mutate(deleteConfirmId);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

  const getFieldLabel = (field: string) => {
    return fieldLabels[field] || field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
  };

  const renderMedicationRow = (med: Medication) => (
    <TableRow key={med.id}>
      {displayColumns.map((col) => (
        <TableCell key={col} className="max-w-xs truncate" title={String(med[col] || '')}>
          {med[col] !== null && med[col] !== undefined 
            ? String(med[col]) 
            : '-'}
        </TableCell>
      ))}
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleEdit(med)}
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleDelete(med.id)}
            className="text-destructive hover:text-destructive"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Pill className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Catálogo Medicamentos CITIO</h1>
            <p className="text-muted-foreground">
              Consulta, edita y elimina medicamentos del catálogo externo
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <span>Medicamentos</span>
              <div className="flex items-center gap-4">
                {medications && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {filteredMedications.length} de {medications.length} registros
                    {families.length > 0 && ` • ${families.length} familias`}
                  </span>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, marca, lote, familia..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Select value={groupByFamily ? 'grouped' : 'list'} onValueChange={(v) => setGroupByFamily(v === 'grouped')}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grouped">Agrupar por Familia</SelectItem>
                    <SelectItem value="list">Vista de Lista</SelectItem>
                  </SelectContent>
                </Select>
                {groupByFamily && (
                  <>
                    <Button variant="outline" size="sm" onClick={expandAllFamilies}>
                      Expandir
                    </Button>
                    <Button variant="outline" size="sm" onClick={collapseAllFamilies}>
                      Colapsar
                    </Button>
                  </>
                )}
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  No se pudo cargar el catálogo: {(error as Error).message}
                </AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : groupByFamily && groupedMedications ? (
              <div className="space-y-2">
                {groupedMedications.map(([family, meds]) => (
                  <Collapsible
                    key={family}
                    open={expandedFamilies.has(family)}
                    onOpenChange={() => toggleFamily(family)}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-between p-4 h-auto hover:bg-accent"
                      >
                        <div className="flex items-center gap-3">
                          {expandedFamilies.has(family) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <span className="font-semibold">{family}</span>
                          <Badge variant="secondary">{meds.length} medicamentos</Badge>
                        </div>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="rounded-md border overflow-x-auto ml-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {displayColumns.map((col) => (
                                <TableHead key={col} className="whitespace-nowrap">
                                  {getFieldLabel(col)}
                                </TableHead>
                              ))}
                              <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {meds.map(renderMedicationRow)}
                          </TableBody>
                        </Table>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
                {groupedMedications.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'No se encontraron medicamentos con ese criterio' : 'No hay medicamentos en el catálogo'}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {displayColumns.map((col) => (
                        <TableHead key={col} className="whitespace-nowrap">
                          {getFieldLabel(col)}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMedications.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={displayColumns.length + 1} className="text-center py-8 text-muted-foreground">
                          {searchTerm ? 'No se encontraron medicamentos con ese criterio' : 'No hay medicamentos en el catálogo'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMedications.map(renderMedicationRow)
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingMedication} onOpenChange={(open) => !open && setEditingMedication(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Medicamento</DialogTitle>
            <DialogDescription>
              Modifica los campos que deseas actualizar
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {allColumns.map((col) => (
              <div key={col} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={col} className="text-right">
                  {getFieldLabel(col)}
                </Label>
                <Input
                  id={col}
                  value={editFormData[col] || ''}
                  onChange={(e) => handleInputChange(col, e.target.value)}
                  className="col-span-3"
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMedication(null)}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar medicamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El medicamento será eliminado permanentemente del catálogo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default MedicationsCatalogCITIO;
