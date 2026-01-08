import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Search, Pill } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const MedicationsCatalogCITIO = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: medications, isLoading, error } = useQuery({
    queryKey: ['external-medications-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-external-medications');
      
      if (error) throw error;
      return data.data || [];
    },
  });

  // Filter medications based on search term
  const filteredMedications = medications?.filter((med: any) => {
    const searchLower = searchTerm.toLowerCase();
    return Object.values(med).some(
      (value) => value && String(value).toLowerCase().includes(searchLower)
    );
  }) || [];

  // Get column headers from first item
  const columns = medications && medications.length > 0 
    ? Object.keys(medications[0]) 
    : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Pill className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Catálogo Medicamentos CITIO</h1>
            <p className="text-muted-foreground">
              Consulta del catálogo de medicamentos desde base de datos externa
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
                  placeholder="Buscar en el catálogo..."
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
                      {columns.map((col) => (
                        <TableHead key={col} className="whitespace-nowrap">
                          {col}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMedications.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={columns.length || 1} className="text-center py-8 text-muted-foreground">
                          {searchTerm ? 'No se encontraron medicamentos con ese criterio' : 'No hay medicamentos en el catálogo'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMedications.map((med: any, index: number) => (
                        <TableRow key={med.id || index}>
                          {columns.map((col) => (
                            <TableCell key={col} className="whitespace-nowrap">
                              {med[col] !== null && med[col] !== undefined 
                                ? String(med[col]) 
                                : '-'}
                            </TableCell>
                          ))}
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
    </DashboardLayout>
  );
};

export default MedicationsCatalogCITIO;
