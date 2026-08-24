import React, { useState } from 'react';
import { FiX, FiUserPlus, FiMail, FiUser, FiShield, FiBriefcase, FiCreditCard, FiDollarSign } from 'react-icons/fi';
import { createAdminUser } from '../../../services/platformApi';

export default function CreateUserModal({
  isOpen,
  onClose,
  onUserCreated,
  availableTenants = [],
  availableCurrencies = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'AED', 'JPY']
}) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('USER');
  const [tenantId, setTenantId] = useState('');
  const [tenantRole, setTenantRole] = useState('ENTERPRISE_MEMBER');
  const [membership, setMembership] = useState('Basic');
  const [durationMonths, setDurationMonths] = useState(12);
  const [preferredCurrency, setPreferredCurrency] = useState('INR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await createAdminUser({
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        role,
        tenantId: tenantId || null,
        tenantRole: tenantId ? tenantRole : null,
        membership,
        durationMonths: membership === 'Premium' ? durationMonths : 0,
        preferredCurrency,
      });

      if (res.success) {
        if (onUserCreated) onUserCreated(res.user);
        onClose();
      } else {
        setError(res.error || 'Failed to create user account.');
      }
    } catch (err) {
      setError(err.message || 'Failed to create user account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      onClick={() => !loading && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-user-modal-title"
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <h3 id="create-user-modal-title" className="font-bold text-slate-900 flex items-center gap-2 text-sm">
            <FiUserPlus className="text-indigo-600 h-5 w-5" /> Provision New User Account
          </h3>
          <button
            type="button"
            onClick={() => !loading && onClose()}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition"
            aria-label="Close"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs" role="alert">
              {error}
            </div>
          )}

          {/* Email & Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Email Address *</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 pl-8 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500 font-semibold"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <FiMail className="absolute left-2.5 top-2.5 text-slate-400" />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Full Name</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Jane Doe"
                  className="w-full px-3 py-2 pl-8 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500 font-semibold"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <FiUser className="absolute left-2.5 top-2.5 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Platform Role & Preferred Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Platform Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
              >
                <option value="USER">USER (Career Builder)</option>
                <option value="EMPLOYER">EMPLOYER (Recruiter)</option>
                <option value="SUPPORT">SUPPORT (Help Desk)</option>
                <option value="AUDITOR">AUDITOR (Compliance)</option>
                <option value="ADMIN">ADMIN (Platform Administrator)</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Preferred Currency</label>
              <select
                value={preferredCurrency}
                onChange={(e) => setPreferredCurrency(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
              >
                {availableCurrencies.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Initial Tenant Assignment */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <h4 className="font-bold text-slate-900 text-[11px] flex items-center gap-1.5">
              <FiBriefcase className="text-indigo-600" /> Initial Organization Assignment (Optional)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Organization</label>
                <select
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-xs"
                >
                  <option value="">
                    {availableTenants.length === 0 ? '-- No Organizations Created --' : '-- None (Individual Consumer) --'}
                  </option>
                  {availableTenants.map(t => (
                    <option key={t.id} value={t.id}>{t.displayName} ({t.slug})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Tenant Role</label>
                <select
                  disabled={!tenantId}
                  value={tenantRole}
                  onChange={(e) => setTenantRole(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-xs disabled:opacity-50"
                >
                  <option value="ENTERPRISE_MEMBER">ENTERPRISE_MEMBER</option>
                  <option value="ENTERPRISE_ADMIN">ENTERPRISE_ADMIN</option>
                </select>
              </div>
            </div>
          </div>

          {/* Membership Tier & Duration */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <h4 className="font-bold text-slate-900 text-[11px] flex items-center gap-1.5">
              <FiCreditCard className="text-indigo-600" /> Membership Grant
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Initial Membership</label>
                <select
                  value={membership}
                  onChange={(e) => setMembership(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-xs"
                >
                  <option value="Basic">Basic (Free Tier)</option>
                  <option value="Premium">Premium (Pro Tier)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Grant Duration</label>
                <select
                  disabled={membership !== 'Premium'}
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-xs disabled:opacity-50"
                >
                  <option value={1}>1 Month</option>
                  <option value={3}>3 Months</option>
                  <option value={6}>6 Months</option>
                  <option value={12}>12 Months (1 Year)</option>
                  <option value={24}>24 Months (2 Years)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition shadow-xs flex items-center gap-1.5"
            >
              {loading ? 'Provisioning…' : <><FiUserPlus /> Provision Account</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
