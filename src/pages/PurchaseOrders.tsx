import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { formatSupplierName } from "@/lib/formatters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShoppingCart, Plus, DollarSign } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PurchaseOrders = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [orderNumber, setOrderNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["purchase_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, profiles(full_name, company_name)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers_for_orders"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name, email");

      if (error) throw error;
      return data;
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!orderNumber || !amount || !selectedSupplier || !user) {
        throw new Error("Todos los campos son obligatorios");
      }

      const { error } = await supabase
        .from("purchase_orders")
        .insert([{
          order_number: orderNumber,
          supplier_id: selectedSupplier,
          amount: parseFloat(amount),
          description: description || null,
          created_by: user.id,
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden de compra creada");
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      setOrderNumber("");
      setAmount("");
      setDescription("");
      setSelectedSupplier("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al crear orden");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ status })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado actualizado");
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar");
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completada":
        return <Badge className="bg-success">Completada</Badge>;
      case "cancelada":
        return <Badge variant="destructive">Cancelada</Badge>;
      case "en_proceso":
        return <Badge className="bg-warning">En Proceso</Badge>;
      default:
        return <Badge variant="secondary">Pendiente</Badge>;
    }
  };

  if (!isAdmin && orders && orders.length === 0) {
    return (
      <DashboardLayout>
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Órdenes de Compra
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center py-8 text-muted-foreground">
              No tienes órdenes de compra asignadas
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Órdenes de Compra</h2>
          <p className="text-muted-foreground">
            {isAdmin ? "Gestiona las órdenes de compra" : "Consulta tus órdenes de compra"}
          </p>
        </div>

        {isAdmin && (
          <Card className="shadow-md border-primary/20">
            <CardHeader className="bg-gradient-primary/10">
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Nueva Orden de Compra
              </CardTitle>
              <CardDescription>Crea una nueva orden para un proveedor</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createOrderMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="supplier">Proveedor *</Label>
                  <Select value={selectedSupplier} onValueChange={setSelectedSupplier} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers?.map((supplier: any) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.company_name || supplier.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="orderNumber">Número de Orden *</Label>
                    <Input
                      id="orderNumber"
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      placeholder="OC-12345"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="amount">Monto (MXN) *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="10000.00"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descripción de la orden..."
                    rows={3}
                  />
                </div>

                <Button type="submit" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Orden
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Órdenes de Compra
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando órdenes...</p>
            ) : orders && orders.length > 0 ? (
              <div className="space-y-4">
                {orders.map((order: any) => (
                  <div
                    key={order.id}
                    className="p-4 border rounded-lg hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold text-lg">{order.order_number}</h4>
                          {getStatusBadge(order.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Proveedor: {formatSupplierName(order.profiles)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary flex items-center gap-1">
                          <DollarSign className="h-5 w-5" />
                          {order.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground">{order.currency}</p>
                      </div>
                    </div>

                    {order.description && (
                      <p className="text-sm mb-2 text-muted-foreground">{order.description}</p>
                    )}

                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground">
                        Creada: {new Date(order.created_at).toLocaleDateString('es-MX')}
                      </p>

                      {isAdmin && (
                        <Select
                          value={order.status}
                          onValueChange={(value) =>
                            updateStatusMutation.mutate({ id: order.id, status: value })
                          }
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendiente">Pendiente</SelectItem>
                            <SelectItem value="en_proceso">En Proceso</SelectItem>
                            <SelectItem value="completada">Completada</SelectItem>
                            <SelectItem value="cancelada">Cancelada</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                No hay órdenes de compra
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default PurchaseOrders;