import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface POSClientSelectorProps {
  selectedClientId: string;
  setSelectedClientId: (id: string) => void;
}

export const POSClientSelector = ({ selectedClientId, setSelectedClientId }: POSClientSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const queryClient = useQueryClient();

  const { data: clients = [] } = useQuery({
    queryKey: ["pos-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, nombre_cliente, razon_social, rfc")
        .eq("is_active", true)
        .order("nombre_cliente");
      if (error) throw error;
      return data || [];
    },
  });

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    const { data, error } = await supabase
      .from("clients")
      .insert({ nombre_cliente: newClientName.trim() })
      .select("id")
      .single();
    if (error) {
      toast.error("Error al crear cliente");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["pos-clients"] });
    setSelectedClientId(data.id);
    setNewClientName("");
    setShowNewClient(false);
    toast.success("Cliente creado");
  };

  if (showNewClient) {
    return (
      <div className="space-y-3">
        <Label className="text-sm font-medium">Nuevo cliente</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Nombre del cliente"
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            className="h-11"
            autoFocus
          />
          <Button onClick={handleCreateClient} className="h-11 shrink-0" disabled={!newClientName.trim()}>
            Crear
          </Button>
          <Button variant="ghost" onClick={() => setShowNewClient(false)} className="h-11 shrink-0">
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Cliente</Label>
        <Button variant="ghost" size="sm" onClick={() => setShowNewClient(true)} className="h-7 text-xs gap-1">
          <UserPlus className="h-3 w-3" /> Nuevo
        </Button>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="w-full justify-between h-11 text-left font-normal"
          >
            {selectedClient ? selectedClient.nombre_cliente : "Seleccionar cliente (opcional)"}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput placeholder="Buscar cliente..." />
            <CommandList>
              <CommandEmpty>Sin resultados</CommandEmpty>
              <CommandGroup>
                {clients.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={client.nombre_cliente}
                    onSelect={() => {
                      setSelectedClientId(client.id === selectedClientId ? "" : client.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", selectedClientId === client.id ? "opacity-100" : "opacity-0")} />
                    <div>
                      <div className="font-medium">{client.nombre_cliente}</div>
                      {client.rfc && <div className="text-xs text-muted-foreground">{client.rfc}</div>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
