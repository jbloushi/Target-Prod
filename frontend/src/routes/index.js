import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';

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
const PublicLocationPage = lazy(() => import('../pages/PublicLocationPage'));
const PublicTrackingLandingPage = lazy(() => import('../pages/PublicTrackingLandingPage'));

const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const ShipmentsPage = lazy(() => import('../pages/ShipmentsPage'));
const DriverPickupPage = lazy(() => import('../pages/DriverPickupPage'));
const WarehouseScanPage = lazy(() => import('../pages/WarehouseScanPage'));
const InConstructionPage = lazy(() => import('../pages/InConstructionPage'));
const FinancePage = lazy(() => import('../pages/FinancePage'));
const ShipmentDetailsPage = lazy(() => import('../pages/ShipmentDetailsPage'));
const TrackingLandingPage = lazy(() => import('../pages/TrackingLandingPage'));
const PrivacyPage = lazy(() => import('../pages/PrivacyPage'));
const TermsPage = lazy(() => import('../pages/TermsPage'));



const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, background: 'var(--bg-primary, #0a0e1a)' }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="10" fill="#00d9b8" />
        <path d="M10 20h20M20 10v20" stroke="white" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(0,217,184,0.2)', borderTopColor: '#00d9b8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // If user doesn't have required role, redirect to their default page
    if (user?.role === 'driver') {
      return <Navigate to="/driver/pickup" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const RedirectToShipment = () => {
  const { trackingNumber } = useParams();
  return <Navigate to={`/shipment/${trackingNumber}`} replace />;
};

const AppRoutes = () => {
  return (
    <Suspense fallback={<div style={{ padding: '24px' }}>Loading...</div>}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/" element={<LoginPage />} />

        {/* Standalone Driver Route (No Sidebar) */}
        <Route path="/driver/pickup" element={
          <ProtectedRoute allowedRoles={['driver', 'admin', 'staff']}>
            <DriverPickupPage />
          </ProtectedRoute>
        } />

        <Route element={<Layout />}>
          <Route path="dashboard" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <DashboardPage />
            </ProtectedRoute>
          } />

          <Route path="admin/users" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminUsersPage />
            </ProtectedRoute>
          } />

          <Route path="admin/organizations" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'manager']}>
              <AdminOrganizationsPage />
            </ProtectedRoute>
          } />

          <Route path="shipments" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ShipmentsPage />
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
          <Route path="shipment/:trackingNumber" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <ShipmentDetailsPage />
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

          {/* Public Routes */}
          <Route path="track" element={<PublicTrackingLandingPage />} />
          <Route path="track/:trackingNumber" element={<PublicTrackingLandingPage />} />
          <Route path="track/:trackingNumber/location" element={<PublicLocationPage />} />
          <Route path="shipments/:trackingNumber" element={<RedirectToShipment />} />

          {/* Placeholder Routes for Premium UI Demo */}
          <Route path="analytics" element={<InConstructionPage title="Analytics" description="Advanced reporting and fleet insights coming soon." />} />
          <Route path="calendar" element={<InConstructionPage title="Calendar" description="Schedule pickups and view delivery timelines." />} />
          <Route path="warehouse" element={<InConstructionPage title="Warehouse Management" description="Inventory and storage controls." />} />
          <Route path="fleets" element={<InConstructionPage title="Fleet Management" description="Vehicle tracking and maintenance logs." />} />
          <Route path="drivers" element={<InConstructionPage title="Driver Management" description="Manage driver profiles and assignments." />} />
          <Route path="finance" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <FinancePage />
            </ProtectedRoute>
          } />
          <Route path="billing" element={<Navigate to="/finance" replace />} />

          {/* Messages & Notifications */}
          <Route path="messages" element={<InConstructionPage title="Messages" description="Communication center." />} />
          <Route path="notifications" element={<InConstructionPage title="Notifications" description="System alerts and updates." />} />

          <Route path="settings" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'driver', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <SettingsPage />
            </ProtectedRoute>
          } />
          <Route path="address-book" element={
            <ProtectedRoute allowedRoles={['admin', 'staff', 'client', 'manager', 'accounting', 'org_manager', 'org_agent']}>
              <AddressBookPage />
            </ProtectedRoute>
          } />

          <Route path="forgot-password" element={<InConstructionPage title="Password Reset" description="Password recovery is coming soon." />} />

          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
