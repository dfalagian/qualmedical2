import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";
import { useSupplierApproval } from "@/hooks/useSupplierApproval";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface SupplierApprovalButtonProps {
  supplierId: string;
  supplierName: string;
  approved: boolean;
}

export function SupplierApprovalButton({ 
  supplierId, 
  supplierName, 
  approved 
}: SupplierApprovalButtonProps) {
  const { approve, revoke, isLoading } = useSupplierApproval();

  if (approved) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading}
            className="gap-2"
          >
            <XCircle className="h-4 w-4" />
            Revocar Aprobación
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar aprobación?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de revocar la aprobación del proveedor <strong>{supplierName}</strong>.
              El proveedor no podrá acceder al sistema hasta que sea aprobado nuevamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => revoke(supplierId)}>
              Revocar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="default"
          size="sm"
          disabled={isLoading}
          className="gap-2"
        >
          <CheckCircle className="h-4 w-4" />
          Aprobar Proveedor
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Aprobar proveedor?</AlertDialogTitle>
          <AlertDialogDescription>
            Estás a punto de aprobar al proveedor <strong>{supplierName}</strong>.
            Una vez aprobado, el proveedor podrá acceder y operar en el sistema.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => approve(supplierId)}>
            Aprobar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
