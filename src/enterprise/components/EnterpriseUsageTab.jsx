import React from 'react';
import {
  FiBarChart2, FiTrendingUp, FiZap, FiDownload, FiUsers, FiDatabase,
  FiCheckCircle, FiAlertCircle
} from 'react-icons/fi';

export default function EnterpriseUsageTab({ _tenant }) {
  return (
    <div className="enterprise-tab-content">
      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">Usage & Quota Analytics</h2>
            <p className="enterprise-tab-subtitle">Real-time resource utilization, token consumption meters, and billing thresholds</p>
          </div>
          <span className="enterprise-pill enterprise-pill-success">
            <FiCheckCircle aria-hidden="true" /> Enterprise Tier Active
          </span>
        </div>

        {/* Quota Progress Bars */}
        <div className="enterprise-usage-bars-grid">
          <div className="enterprise-usage-card">
            <div className="enterprise-usage-header">
              <div className="enterprise-usage-title">
                <FiZap /> <strong>AI Generation Tokens</strong>
              </div>
              <span><strong>18,420</strong> / 100,000 daily</span>
            </div>
            <div className="enterprise-progress-bar">
              <div className="enterprise-progress-fill success" style={{ width: '18.4%' }} />
            </div>
            <small className="text-muted">18.4% consumed · Resets at midnight UTC</small>
          </div>

          <div className="enterprise-usage-card">
            <div className="enterprise-usage-header">
              <div className="enterprise-usage-title">
                <FiUsers /> <strong>Seat Allocation</strong>
              </div>
              <span><strong>12</strong> / 25 seats</span>
            </div>
            <div className="enterprise-progress-bar">
              <div className="enterprise-progress-fill success" style={{ width: '48%' }} />
            </div>
            <small className="text-muted">13 seats available</small>
          </div>

          <div className="enterprise-usage-card">
            <div className="enterprise-usage-header">
              <div className="enterprise-usage-title">
                <FiDownload /> <strong>PDF & DOCX High-Fidelity Exports</strong>
              </div>
              <span><strong>48</strong> / 1,000 monthly</span>
            </div>
            <div className="enterprise-progress-bar">
              <div className="enterprise-progress-fill success" style={{ width: '4.8%' }} />
            </div>
            <small className="text-muted">4.8% consumed · Unlimited high-res downloads</small>
          </div>

          <div className="enterprise-usage-card">
            <div className="enterprise-usage-header">
              <div className="enterprise-usage-title">
                <FiDatabase /> <strong>Encrypted Artifact Storage</strong>
              </div>
              <span><strong>2.1 GB</strong> / 50 GB</span>
            </div>
            <div className="enterprise-progress-bar">
              <div className="enterprise-progress-fill success" style={{ width: '4.2%' }} />
            </div>
            <small className="text-muted">4.2% consumed · HMAC-SHA256 authenticated</small>
          </div>
        </div>
      </div>
    </div>
  );
}
