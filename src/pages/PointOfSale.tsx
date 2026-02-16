import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { POSInterface } from "@/components/pos/POSInterface";

const PointOfSale = () => {
  const { isAdmin, isVendedor } = useAuth();

  if (!isAdmin && !isVendedor) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <POSInterface />
    </DashboardLayout>
  );
};

export default PointOfSale;
