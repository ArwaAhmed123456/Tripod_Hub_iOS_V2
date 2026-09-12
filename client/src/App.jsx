// Final deployment version - manual logs, security, and Totmonslow data included
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MobileLanding from './pages/MobileLanding';
import MobileForm from './pages/MobileForm';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import ProjectDetails from './pages/ProjectDetails';

import AdminSignup from './pages/AdminSignup';
import AdminLayout from './components/AdminLayout';
import ActivityPage from './pages/ActivityPage';
import AttendancePage from './pages/AttendancePage';
import PeopleDirectory from './pages/PeopleDirectory';
import ManageSettings from './pages/ManageSettings';
import ProfilePage from './pages/ProfilePage';
import SupportPage from './pages/SupportPage';
import EvacuationPage from './pages/EvacuationPage';
import SupportCollectionPage from './pages/SupportCollectionPage';
import SupportArticlePage from './pages/SupportArticlePage';
import SupportWhatsNewPage from './pages/SupportWhatsNewPage';
import ProtectedRoute from './components/ProtectedRoute';

import PublicVisitorCheckIn from './pages/PublicVisitorCheckIn';
import PublicSupportPage from './pages/PublicSupportPage';
import PublicLanding from './pages/PublicLanding';
import PendingOrganizations from './pages/manage/PendingOrganizations';
import CamerasPage from './pages/CamerasPage';
import SuperAdminPage from './pages/SuperAdminPage';

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Redirect Root to Public Landing Page */}
        <Route path="/" element={<PublicLanding />} />

        {/* Mobile Routes */}
        <Route path="/mobile-landing" element={<MobileLanding />} />
        <Route path="/form" element={<MobileForm />} />

        {/* Public Visitor Check-in Route */}
        <Route path="/checkin/:siteId" element={<PublicVisitorCheckIn />} />

        {/* Public Support Route for App Store verification */}
        <Route path="/support" element={<PublicSupportPage />} />

        {/* Admin Login & Signup */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/register" element={<AdminSignup />} />
        <Route
          path="/admin/signup"
          element={
            <ProtectedRoute roleRequired="superadmin">
              <AdminSignup />
            </ProtectedRoute>
          }
        />

        {/* Admin Layout */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/activity" replace />} />
          <Route path="activity"    element={<ActivityPage />} />
          <Route path="cameras"     element={<CamerasPage />} />
          <Route path="attendance"  element={<AttendancePage />} />
          <Route path="people"      element={<PeopleDirectory />} />
          <Route path="manage/*"    element={<ManageSettings />} />
          <Route path="evacuation"  element={<EvacuationPage />} />
          <Route path="support"     element={<SupportPage />} />
          <Route path="support/whats-new" element={<SupportWhatsNewPage />} />
          <Route path="support/collections/:collectionSlug" element={<SupportCollectionPage />} />
          <Route path="support/articles/:articleSlug" element={<SupportArticlePage />} />
          <Route path="profile"     element={<ProfilePage />} />
          {/* Pending Organizations (superadmin only) */}
          <Route path="pending-organizations" element={<PendingOrganizations />} />
          {/* Super Admin Console (superadmin only) */}
          <Route
            path="superadmin"
            element={
              <ProtectedRoute roleRequired="superadmin">
                <SuperAdminPage />
              </ProtectedRoute>
            }
          />
          {/* Legacy */}
          <Route path="project/:id" element={<ProjectDetails />} />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
