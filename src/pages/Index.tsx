import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Building2, FileCheck, Receipt, MessageSquare, ShoppingCart } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: FileCheck,
      title: "Gestión de Documentos",
      description: "Sube y gestiona toda tu documentación empresarial de forma segura",
    },
    {
      icon: Receipt,
      title: "Control de Facturas",
      description: "Administra tus facturas XML y PDF con historial completo de pagos",
    },
    {
      icon: MessageSquare,
      title: "Comunicación Directa",
      description: "Sistema de mensajería integrado con el equipo administrativo",
    },
    {
      icon: ShoppingCart,
      title: "Órdenes de Compra",
      description: "Consulta y gestiona tus órdenes de compra en tiempo real",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-primary py-20 px-4">
        <div className="container mx-auto text-center">
          <div className="mx-auto mb-6 w-20 h-20 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center">
            <Building2 className="h-12 w-12 text-white" />
          </div>
          <h1 className="mb-4 text-4xl md:text-5xl lg:text-6xl font-bold text-white">
            Sistema de Gestión de Proveedores
          </h1>
          <p className="mb-8 text-xl text-white/90 max-w-2xl mx-auto">
            Plataforma integral para la gestión eficiente de proveedores mexicanos
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              variant="secondary"
              onClick={() => navigate("/auth")}
              className="text-lg px-8"
            >
              Iniciar Sesión
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => navigate("/auth")}
              className="text-lg px-8 bg-white/10 text-white border-white/20 hover:bg-white/20"
            >
              Registrarse
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Funcionalidades Principales
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Todo lo que necesitas para gestionar tu relación con proveedores de manera eficiente
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div 
                  key={feature.title}
                  className="bg-card border rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow"
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-secondary">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            ¿Listo para comenzar?
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            Accede al sistema y comienza a gestionar tu documentación y pagos de forma eficiente
          </p>
          <Button 
            size="lg"
            onClick={() => navigate("/auth")}
            className="text-lg px-8"
          >
            Acceder al Sistema
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container mx-auto text-center text-muted-foreground">
          <p>&copy; 2025 Sistema de Gestión de Proveedores. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
