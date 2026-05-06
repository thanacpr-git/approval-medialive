import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import MatchSchedule from './pages/MatchSchedule';
import UploadMatch from './pages/UploadMatch';
import AuditLog from './pages/AuditLog';
import ApprovalPage from './pages/ApprovalPage';

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <Layout user={user} signOut={signOut}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/matches" element={<MatchSchedule />} />
            <Route path="/upload" element={<UploadMatch />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/approval/:token" element={<ApprovalPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      )}
    </Authenticator>
  );
}

export default App;
