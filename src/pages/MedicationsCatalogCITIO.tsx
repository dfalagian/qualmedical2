import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Search, Pill, Pencil, Trash2, Save, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
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
  [key: string]: any;
}

const MedicationsCatalogCITIO = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
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

  // Filter medications based on search term
  const filteredMedications = medications?.filter((med) => {
    const searchLower = searchTerm.toLowerCase();
    return Object.values(med).some(
      (value) => value && String(value).toLowerCase().includes(searchLower)
    );
  }) || [];

  // Get column headers from first item (exclude internal fields)
  const displayColumns = ['name', 'brand', 'description', 'dosage'];
  const allColumns = medications && medications.length > 0 
    ? Object.keys(medications[0]).filter(col => col !== 'id')
    : displayColumns;

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
            <CardTitle className="flex items-center justify-between">
              <span>Medicamentos</span>
              {medications && (
                <span className="text-sm font-normal text-muted-foreground">
                  {filteredMedications.length} de {medications.length} registros
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, marca, descripción..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
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
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {displayColumns.map((col) => (
                        <TableHead key={col} className="whitespace-nowrap capitalize">
                          {col === 'name' ? 'Nombre' : 
                           col === 'brand' ? 'Marca' :
                           col === 'description' ? 'Descripción' :
                           col === 'dosage' ? 'Dosis' : col}
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
                      filteredMedications.map((med) => (
                        <TableRow key={med.id}>
                          {displayColumns.map((col) => (
                            <TableCell key={col} className="max-w-xs truncate">
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
                      ))
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
                <Label htmlFor={col} className="text-right capitalize">
                  {col === 'name' ? 'Nombre' : 
                   col === 'brand' ? 'Marca' :
                   col === 'description' ? 'Descripción' :
                   col === 'dosage' ? 'Dosis' : col}
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
