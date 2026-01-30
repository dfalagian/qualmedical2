import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Warehouse } from "lucide-react";

interface WarehouseFilterProps {
  value: string;
  onChange: (value: string) => void;
  showAllOption?: boolean;
  className?: string;
}

export function WarehouseFilter({ 
  value, 
  onChange, 
  showAllOption = true,
  className 
}: WarehouseFilterProps) {
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, code, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <div className="flex items-center gap-2">
          <Warehouse className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="Almacén" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {showAllOption && (
          <SelectItem value="all">
            <div className="flex items-center gap-2">
              <Warehouse className="h-4 w-4" />
              Todos los almacenes
            </div>
          </SelectItem>
        )}
        {warehouses.map((w) => (
          <SelectItem key={w.id} value={w.id}>
            <div className="flex items-center gap-2">
              <Warehouse className="h-4 w-4" />
              {w.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
