import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
import { getDefaultLandingPath, getStoredUiVersion } from '../utils/uiVersion';

const ShipmentWizardV2 = lazy(() => import('../pages/ShipmentWizardV2'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const ContactPage = lazy(() => import('../pages/ContactPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const LoginPage = lazy(() => import('../pages/LoginPage'));
const SignupPage = lazy(() => import('../pages/SignupPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
// import ProfilePage from '../pages/ProfilePage'; // Deprecated
const AddressBookPage = lazy(() => import('../pages/AddressBookPage'));
const AdminUsersPage = lazy(() => import('../pages/AdminUsersPage'));
const AdminOrganizationsPage = lazy(() => import('../pages/AdminOrganizationsPage'));
const AdminWhatsAppLogsPage = lazy(() => import('../pages/AdminWhatsAppLogsPage'));
const PhenixAuditLogsPage = lazy(() => import('../pages/PhenixAuditLogsPage'));
const PublicLocationPage = lazy(() => import('../pages/PublicLocationPage'));
const PublicTrackingLandingPage = lazy(() => import('../pages/PublicTrackingLandingPage'));
const PublicCheckoutPage = lazy(() => import('../pages/PublicCheckoutPage'));
const PublicReturnPortalPage = lazy(() => import('../pages/PublicReturnPortalPage'));

const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const DashboardV2Page = lazy(() => import('../pages/v2/DashboardV2Page'));
const ShipmentsPage = lazy(() => import('../pages/ShipmentsPage'));
const ShipmentsV2Page = lazy(() => import('../pages/v2/ShipmentsV2Page'));
const ShipmentWizardV2Cockpit = lazy(() => import('../pages/v2/ShipmentWizardV2Cockpit'));
const DriverPickupPage = lazy(() => import('../pages/DriverPickupPage'));
const WarehouseScanPage = lazy(() => import('../pages/WarehouseScanPage'));
const InConstructionPage = lazy(() => import('../pages/InConstructionPage'));
const FinancePage = lazy(() => import('../pages/FinancePage'));
const FinanceV2Page = lazy(() => import('../pages/v2/FinanceV2Page'));
const AddressBookV2Page = lazy(() => import('../pages/v2/AddressBookV2Page'));
const SettingsV2Page = lazy(() => import('../pages/v2/SettingsV2Page'));
const SupportCenterV2Page = lazy(() => import('../pages/v2/SupportCenterV2Page'));
const ModuleHubV2Page = lazy(() => import('../pages/v2/ModuleHubV2Page'));
const AdminUsersV2Page = lazy(() => import('../pages/v2/AdminUsersV2Page'));
const AdminOrganizationsV2Page = lazy(() => import('../pages/v2/AdminOrganizationsV2Page'));
const AdminRateCardsV2Page = lazy(() => import('../pages/v2/AdminRateCardsV2Page'));
const AdminWhatsAppLogsV2Page = lazy(() => import('../pages/v2/AdminWhatsAppLogsV2Page'));
const PhenixAuditLogsV2Page = lazy(() => import('../pages/v2/PhenixAuditLogsV2Page'));
const ShipmentDetailsV2Page = lazy(() => import('../pages/v2/ShipmentDetailsV2Page'));
const DriverPickupV2Page = lazy(() => import('../pages/v2/DriverPickupV2Page'));
const DriverRunV2Page = lazy(() => import('../pages/v2/DriverRunV2Page'));
const WarehouseScanV2Page = lazy(() => import('../pages/v2/WarehouseScanV2Page'));
const FleetDispatchV2Page = lazy(() => import('../pages/v2/FleetDispatchV2Page'));
const ShipmentDetailsPage = lazy(() => import('../pages/ShipmentDetailsPage'));
const TrackingLandingPage = lazy(() => import('../pages/TrackingLandingPage'));
const PrivacyPage = lazy(() => import('../pages/PrivacyPage'));
const TermsPage = lazy(() => import('../pages/TermsPage'));
const ApiDocsPage = lazy(() => import('../pages/ApiDocsPage'));
const FleetDispatchPage = lazy(() => import('../pages/FleetDispatchPage'));
const DriverRunPage = lazy(() => import('../pages/DriverRunPage'));
const SupportCenterPage = lazy(() => import('../pages/SupportCenterPage'));



const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, background: '#f3f7fb' }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="10" fill="url(#grad)" />
        <path d="M10 20h20M20 10v20" stroke="white" strokeWidth="3" strokeLinecap="round" />
        <defs><linearGradient id="grad" x1="0" y1="0" x2="40" y2="40"><stop stopColor="#0EA5E9"/><stop offset="1" stopColor="#2563EB"/></linearGradient></defs>
      </svg>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(0,80,212,0.15)', borderTopColor: '#0050d4', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // If user doesn't have required role, redirect to their default page
    return <Navigate to={getDefaultLandingPath(user?.role)} replace />;
  }

  return children;
};

const RootRedirect = () => {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return null;
  if (isAuthenticated && user) {
    return <Navigate to={getDefaultLandingPath(user.role)} replace />;
  }
  return <Navigate to="/login" replace />;
};

const RedirectToShipment = () => {
  const { trackingNumber } = useParams();
  const prefix = getStoredUiVersion() === 'v1' ? '/shipment' : '/shipment-v2';
  return <Navigate to={`${prefix}/${trackingNumber}`} replace />;
};

const AppRoutes = () => {
  return (
    <Suspense fallback={<div style={{ padding: '24px' }}>Loading...</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/" element={<RootRedirect />} />

        {/* Standalone Public Pay-by-Link Checkout */}
        <Route path="/pay/:trackingNumber" element={<PublicCheckoutPage />} />
        <Route path="/checkout/:trackingNumber" element={<PublicCheckoutPage />} />

        {/* Standalone Customer Self-Service Return Portal */}
        <Route path="/returns" element={<PublicReturnPortalPage />} />
        <Route path="/returns/:trackingNumber" element={<PublicReturnPortalPage />} />

        {/* Standalone Customer Self-Service GPS Pin Portal */}
        <Route path="/location" element={<PublicLocationPage />} />
        <Route path="/location/:token" element={<PublicLocationPage />} />
        <Route path="location/:token" element={<PublicLocationPage />} />

        {/* Standalone Driver Route (No Sidebar) */}
        <Route path="/driver/pickup" element={
          <ProtectedRoute allowedRoles={['driver', 'admin', 'staff', 'manager']}>
            <DriverPickupPage />
          </ProtectedRoute>
        } />
        <Route path="/driver/pickup-v2" element={
          <ProtectedRoute allowedRoles={['driver', 'admin', 'staff', 'manager']}>
            <DriverPickupV2Page />
          </ProtectedRoute>
        } />
        <Route path="/driver/runs" element={
          <ProtectedRoute allowedRoles={['driver', 'admin', 'staff', 'manager']}>
            <DriverRunPage />
          </ProtectedRoute>
        } />
        <Route path="/driver/runs-v2" element={
          <ProtectedRoute allowedRoles={['driver', 'admin', 'staff', 'manager']}>
            <DriverRunV2Page />
          </ProtectedRoute>
        } />

        <Route element={<Layout />}>
          <Route path="dashboard" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <DashboardPage />
            </ProtectedRoute>
          } />

          <Route path="dashboard-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <DashboardV2Page />
            </ProtectedRoute>
          } />

          <Route path="dashboard-v1" element={<Navigate to="/dashboard" replace />} />

          <Route path="fleet/dispatch" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'staff', 'accounting']}>
              <FleetDispatchPage />
            </ProtectedRoute>
          } />

          <Route path="fleet/dispatch-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'staff', 'accounting']}>
              <FleetDispatchV2Page />
            </ProtectedRoute>
          } />

          <Route path="admin/users" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'accounting', 'org_manager']}>
              <AdminUsersPage />
            </ProtectedRoute>
          } />

          <Route path="admin/users-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'accounting', 'org_manager']}>
              <AdminUsersV2Page />
            </ProtectedRoute>
          } />

          <Route path="admin/organizations" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'accounting']}>
              <AdminOrganizationsPage />
            </ProtectedRoute>
          } />

          <Route path="admin/organizations-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'accounting']}>
              <AdminOrganizationsV2Page />
            </ProtectedRoute>
          } />

          <Route path="admin/whatsapp-logs" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'accounting']}>
              <AdminWhatsAppLogsPage />
            </ProtectedRoute>
          } />

          <Route path="admin/whatsapp-logs-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'accounting']}>
              <AdminWhatsAppLogsV2Page />
            </ProtectedRoute>
          } />

          <Route path="admin/phenix-audit" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'accounting']}>
              <PhenixAuditLogsPage />
            </ProtectedRoute>
          } />

          <Route path="admin/phenix-audit-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'accounting']}>
              <PhenixAuditLogsV2Page />
            </ProtectedRoute>
          } />

          <Route path="admin/rate-cards" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'accounting']}>
              <Navigate to="/settings?tab=ratecards" replace />
            </ProtectedRoute>
          } />

          <Route path="admin/rate-cards-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'accounting']}>
              <AdminRateCardsV2Page />
            </ProtectedRoute>
          } />

          <Route path="shipments" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ShipmentsPage />
            </ProtectedRoute>
          } />

          <Route path="shipments-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ShipmentsV2Page />
            </ProtectedRoute>
          } />

          <Route path="about" element={<AboutPage />} />
          <Route path="contact" element={<ContactPage />} />

          {/* Protected Client/Staff Routes */}
          <Route path="create" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ShipmentWizardV2 />
            </ProtectedRoute>
          } />

          {/* Correct mapping for 'New Shipment' button in ShipmentsPage */}
          <Route path="create-shipment" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ShipmentWizardV2 />
            </ProtectedRoute>
          } />


          <Route path="tracking/:trackingNumber" element={<RedirectToShipment />} />
          <Route path="tracking" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <TrackingLandingPage />
            </ProtectedRoute>
          } />
          {/* Explicit New Shipment aliases */}
          <Route path="shipment/new" element={<Navigate to="/create" replace />} />
          <Route path="shipment/new-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ShipmentWizardV2Cockpit />
            </ProtectedRoute>
          } />
          <Route path="shipments/new" element={<Navigate to="/create" replace />} />
          <Route path="shipment/:trackingNumber" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ShipmentDetailsPage />
            </ProtectedRoute>
          } />
          <Route path="shipment-v2/:trackingNumber" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ShipmentDetailsV2Page />
            </ProtectedRoute>
          } />
          <Route path="shipment-v2/:trackingNumber/edit" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ShipmentWizardV2Cockpit />
            </ProtectedRoute>
          } />
          <Route path="shipment/:trackingNumber/edit" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'org_manager', 'org_agent']}>
              <ShipmentWizardV2 />
            </ProtectedRoute>
          } />

          {/* Warehouse Tools */}
          <Route path="warehouse/scan" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'manager']}>
              <WarehouseScanPage />
            </ProtectedRoute>
          } />
          <Route path="warehouse/scan-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'manager']}>
              <WarehouseScanV2Page />
            </ProtectedRoute>
          } />

          {/* Public Routes */}
          <Route path="track" element={<PublicTrackingLandingPage />} />
          <Route path="track/:trackingNumber" element={<PublicTrackingLandingPage />} />
          <Route path="track/:trackingNumber/location" element={<PublicLocationPage />} />
          <Route path="shipments/:trackingNumber" element={<RedirectToShipment />} />

          {/* Placeholder Routes for Premium UI Demo */}
          <Route path="analytics" element={<InConstructionPage title="Analytics" description="Advanced reporting and fleet insights coming soon." />} />
          <Route path="analytics-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ModuleHubV2Page module="analytics" />
            </ProtectedRoute>
          } />
          <Route path="calendar" element={<InConstructionPage title="Calendar" description="Schedule pickups and view delivery timelines." />} />
          <Route path="calendar-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ModuleHubV2Page module="calendar" />
            </ProtectedRoute>
          } />
          <Route path="warehouse" element={<InConstructionPage title="Warehouse Management" description="Inventory and storage controls." />} />
          <Route path="warehouse-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'manager']}>
              <ModuleHubV2Page module="warehouse" />
            </ProtectedRoute>
          } />
          <Route path="fleets" element={<InConstructionPage title="Fleet Management" description="Vehicle tracking and maintenance logs." />} />
          <Route path="fleets-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'manager', 'accounting', 'driver']}>
              <ModuleHubV2Page module="fleets" />
            </ProtectedRoute>
          } />
          <Route path="drivers" element={<InConstructionPage title="Driver Management" description="Manage driver profiles and assignments." />} />
          <Route path="drivers-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'manager', 'accounting', 'driver']}>
              <ModuleHubV2Page module="drivers" />
            </ProtectedRoute>
          } />
          <Route path="finance" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <FinancePage />
            </ProtectedRoute>
          } />
          <Route path="finance-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <FinanceV2Page />
            </ProtectedRoute>
          } />
          <Route path="billing" element={<Navigate to="/finance" replace />} />
          <Route path="financials" element={<Navigate to="/finance" replace />} />

          {/* Support Center & Omnichannel Chat */}
          <Route path="support" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <SupportCenterPage />
            </ProtectedRoute>
          } />
          <Route path="support/:conversationId" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <SupportCenterPage />
            </ProtectedRoute>
          } />
          <Route path="support-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <SupportCenterV2Page />
            </ProtectedRoute>
          } />
          <Route path="support-v2/:conversationId" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <SupportCenterV2Page />
            </ProtectedRoute>
          } />

          {/* Messages & Notifications */}
          <Route path="messages" element={<Navigate to="/support" replace />} />
          <Route path="notifications" element={<InConstructionPage title="Notifications" description="System alerts and updates." />} />
          <Route path="notifications-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'driver', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ModuleHubV2Page module="notifications" />
            </ProtectedRoute>
          } />

          <Route path="settings" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'driver', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <SettingsPage />
            </ProtectedRoute>
          } />
          <Route path="settings-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'driver', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <SettingsV2Page />
            </ProtectedRoute>
          } />
          <Route path="address-book" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <AddressBookPage />
            </ProtectedRoute>
          } />
          <Route path="address-book-v2" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <AddressBookV2Page />
            </ProtectedRoute>
          } />

          <Route path="api-docs" element={<ApiDocsPage />} />

          <Route path="forgot-password" element={<InConstructionPage title="Password Reset" description="Password recovery is coming soon." />} />
          <Route path="forgot-password-v2" element={<ModuleHubV2Page module="forgot-password" />} />

          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
