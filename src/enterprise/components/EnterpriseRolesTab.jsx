import React from 'react';
import { FiShield, FiCheck, FiX, FiInfo } from 'react-icons/fi';

const PERMISSIONS_MATRIX = [
  { resource: 'Organization Settings & Lifecycle', owner: true, admin: true, manager: false, member: false, viewer: false },
  { resource: 'Workspace Create & Management', owner: true, admin: true, manager: true, member: false, viewer: false },
  { resource: 'Team Creation & Member Assignment', owner: true, admin: true, manager: true, member: false, viewer: false },
  { resource: 'User Invitations & Role Changes', owner: true, admin: true, manager: false, member: false, viewer: false },
  { resource: 'AI Provider Policy & Quotas', owner: true, admin: true, manager: false, member: false, viewer: false },
  { resource: 'AI Generation & Usage', owner: true, admin: true, manager: true, member: true, viewer: false },
  { resource: 'Resume & Document Creation', owner: true, admin: true, manager: true, member: true, viewer: false },
  { resource: 'Resume PDF & DOCX Export', owner: true, admin: true, manager: true, member: true, viewer: true },
  { resource: 'Audit Log Inspection', owner: true, admin: true, manager: false, member: false, viewer: false },
  { resource: 'Service Accounts & API Keys', owner: true, admin: true, manager: false, member: false, viewer: false },
  { resource: 'Support & Break-Glass Access', owner: true, admin: false, manager: false, member: false, viewer: false },
];

export default function EnterpriseRolesTab() {
  return (
    <div className="enterprise-tab-content">
      <div className="enterprise-card">
        <h2 className="enterprise-tab-title">Roles & Access Control Matrix</h2>
        <p className="enterprise-tab-subtitle">
          Hierarchical role-based access control (RBAC) enforced cryptographically on every API and database transaction
        </p>

        <div className="enterprise-roles-summary-grid">
          <div className="enterprise-role-card">
            <div className="enterprise-role-header">
              <span className="enterprise-pill enterprise-pill-template">OWNER</span>
              <strong>Primary Tenant Owner</strong>
            </div>
            <p>Full sovereign control over billing, tenant lifecycle, break-glass support, and destructive deletion.</p>
          </div>

          <div className="enterprise-role-card">
            <div className="enterprise-role-header">
              <span className="enterprise-pill enterprise-pill-success">ADMIN</span>
              <strong>Platform Administrator</strong>
            </div>
            <p>User provisioning, security policies, AI provider allowlists, service accounts, and audit log inspection.</p>
          </div>

          <div className="enterprise-role-card">
            <div className="enterprise-role-header">
              <span className="enterprise-pill enterprise-pill-secondary">MANAGER</span>
              <strong>Workspace Manager</strong>
            </div>
            <p>Workspace operations, team group management, and document collaboration oversight.</p>
          </div>

          <div className="enterprise-role-card">
            <div className="enterprise-role-header">
              <span className="enterprise-pill enterprise-pill-secondary">MEMBER</span>
              <strong>Enterprise Member</strong>
            </div>
            <p>Standard builder access to Smart Composer, 51 template presets, AI generation, and exports.</p>
          </div>

          <div className="enterprise-role-card">
            <div className="enterprise-role-header">
              <span className="enterprise-pill enterprise-pill-secondary">VIEWER</span>
              <strong>Read-Only Reviewer</strong>
            </div>
            <p>Read-only review of candidate documents, proofing, and executive feedback.</p>
          </div>
        </div>

        <h3 className="enterprise-card-title" style={{ marginTop: '2rem' }}>Detailed Permission Matrix</h3>
        <div className="enterprise-table-wrapper">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Resource Capability</th>
                <th className="text-center">Owner</th>
                <th className="text-center">Admin</th>
                <th className="text-center">Manager</th>
                <th className="text-center">Member</th>
                <th className="text-center">Viewer</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS_MATRIX.map((row, idx) => (
                <tr key={idx}>
                  <td><strong>{row.resource}</strong></td>
                  <td className="text-center text-success">{row.owner ? <FiCheck /> : <FiX className="text-muted" />}</td>
                  <td className="text-center text-success">{row.admin ? <FiCheck /> : <FiX className="text-muted" />}</td>
                  <td className="text-center">{row.manager ? <FiCheck className="text-success" /> : <FiX className="text-muted" />}</td>
                  <td className="text-center">{row.member ? <FiCheck className="text-success" /> : <FiX className="text-muted" />}</td>
                  <td className="text-center">{row.viewer ? <FiCheck className="text-success" /> : <FiX className="text-muted" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
