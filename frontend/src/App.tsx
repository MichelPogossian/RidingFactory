import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import PublicLayout from "@/layouts/PublicLayout";
import AdminLayout from "@/layouts/AdminLayout";
import HomePage from "@/pages/public/HomePage";
import BookingPage from "@/pages/public/BookingPage";
import VoucherPage from "@/pages/public/VoucherPage";
import PassCardPage from "@/pages/public/PassCardPage";
import LoginPage from "@/pages/admin/LoginPage";
import DashboardPage from "@/pages/admin/DashboardPage";
import PlanningPage from "@/pages/admin/PlanningPage";
import BookingsPage from "@/pages/admin/BookingsPage";
import CustomersPage from "@/pages/admin/CustomersPage";
import PosPage from "@/pages/admin/PosPage";
import ProductsPage from "@/pages/admin/ProductsPage";
import VouchersPage from "@/pages/admin/VouchersPage";
import PassCardsPage from "@/pages/admin/PassCardsPage";
import DocumentsPage from "@/pages/admin/DocumentsPage";
import AnalyticsPage from "@/pages/admin/AnalyticsPage";
import ConditionsPage from "@/pages/admin/ConditionsPage";
import AssistantPage from "@/pages/admin/AssistantPage";
import CatalogPage from "@/pages/admin/CatalogPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = useAuth((s) => s.token);
  return token ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/reserver" element={<BookingPage />} />
        <Route path="/reserver/:activitySlug" element={<BookingPage />} />
        <Route path="/bon-cadeau" element={<VoucherPage />} />
        <Route path="/cartes" element={<PassCardPage />} />
      </Route>
      <Route path="/admin/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="planning" element={<PlanningPage />} />
        <Route path="reservations" element={<BookingsPage />} />
        <Route path="clients" element={<CustomersPage />} />
        <Route path="caisse" element={<PosPage />} />
        <Route path="produits" element={<ProductsPage />} />
        <Route path="bons-cadeaux" element={<VouchersPage />} />
        <Route path="cartes" element={<PassCardsPage />} />
        <Route path="facturation" element={<DocumentsPage />} />
        <Route path="analyses" element={<AnalyticsPage />} />
        <Route path="conditions" element={<ConditionsPage />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="catalogue" element={<CatalogPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
