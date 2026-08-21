import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiSearch, FiGrid, FiUsers, FiSettings, FiShield, FiServer,
  FiActivity, FiFileText, FiLayers, FiMail, FiBriefcase, FiX,
  FiCommand, FiRefreshCw, FiZap, FiLock
} from 'react-icons/fi';
import { FaRobot, FaCreditCard, FaEnvelope, FaGlobeAsia, FaReceipt } from 'react-icons/fa';
import { searchPlatform } from '../../../services/platformApi';

const COMMAND_ITEMS = [
  // Primary Navigation
  { id: 'nav-dash', label: 'Dashboard & Platform Health', category: 'Navigation', icon: FiGrid, path: '/adm/dashboard' },
  { id: 'nav-users', label: 'Users Manager', category: 'Navigation', icon: FiUsers, path: '/adm/users' },
  { id: 'nav-audit', label: 'Admin Audit Logs', category: 'Navigation', icon: FiShield, path: '/adm/audit-logs' },
  { id: 'nav-queues', label: 'Queue & DLQ Monitor', category: 'Navigation', icon: FiActivity, path: '/adm/queues' },
  { id: 'nav-tenants', label: 'Enterprise Tenants Registry', category: 'Navigation', icon: FiServer, path: '/adm/tenants' },
  { id: 'nav-employers', label: 'Employer Applications', category: 'Navigation', icon: FiBriefcase, path: '/adm/employer-applications' },
  { id: 'nav-jobs', label: 'Jobs Manager', category: 'Navigation', icon: FiLayers, path: '/adm/jobs-manager' },
  { id: 'nav-blog', label: 'Blog Engine', category: 'Navigation', icon: FiFileText, path: '/adm/blog-management' },
  { id: 'nav-messages', label: 'Contact Messages', category: 'Navigation', icon: FiMail, path: '/adm/messages' },
  { id: 'nav-security', label: 'Security Events', category: 'Navigation', icon: FiLock, path: '/adm/security' },
  { id: 'nav-ops', label: 'Platform Operations', category: 'Navigation', icon: FiActivity, path: '/adm/operations' },
  { id: 'nav-reviews', label: 'Reviews', category: 'Navigation', icon: FiFileText, path: '/adm/reviews' },
  { id: 'nav-trusted', label: 'Trusted By', category: 'Navigation', icon: FiShield, path: '/adm/trustedby' },
  { id: 'nav-landing', label: 'Landing Pages', category: 'Navigation', icon: FiLayers, path: '/adm/landing-pages' },
  { id: 'nav-companies', label: 'Company Management', category: 'Navigation', icon: FiBriefcase, path: '/adm/company-management' },
  { id: 'nav-phrases', label: 'Phrases', category: 'Navigation', icon: FiFileText, path: '/adm/phrases' },
  { id: 'nav-attention', label: 'Attention / derived incidents', category: 'Navigation', icon: FiActivity, path: '/adm/attention' },
  { id: 'nav-operators', label: 'Platform Operators', category: 'Navigation', icon: FiLock, path: '/adm/operators' },

  // Settings Tabs
  { id: 'set-ai', label: 'AI Models & Provider Settings', category: 'Settings', icon: FaRobot, path: '/adm/settings?tab=aiSettings' },
  { id: 'set-smtp', label: 'Email & SMTP Configuration', category: 'Settings', icon: FaEnvelope, path: '/adm/settings?tab=emailSettings' },
  { id: 'set-pay', label: 'Payment Gateways & Subscriptions', category: 'Settings', icon: FaCreditCard, path: '/adm/settings?tab=subscriptionsSettings' },
  { id: 'set-orders', label: 'Orders & Transactions', category: 'Settings', icon: FaReceipt, path: '/adm/settings?tab=ordersManagement' },
  { id: 'set-security', label: 'Security & Abuse Limits', category: 'Settings', icon: FiLock, path: '/adm/settings?tab=securityLimitsSettings' },
  { id: 'set-health', label: 'System Health Settings', category: 'Settings', icon: FiActivity, path: '/adm/settings?tab=systemHealthSettings' },
  { id: 'set-geo', label: 'Indian Geo-SEO', category: 'Settings', icon: FaGlobeAsia, path: '/adm/settings?tab=geoSeoSettings' },
  { id: 'set-modules', label: 'Addon Modules & Feature Flags', category: 'Settings', icon: FiSettings, path: '/adm/settings?tab=modulesSettings' },
  { id: 'set-brand', label: 'Brand Identity & Meta', category: 'Settings', icon: FiSettings, path: '/adm/settings?tab=websiteSettings' },
];

export default function AdminCommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [entityHits, setEntityHits] = useState([]);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (q.length < 2) {
      setEntityHits([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await searchPlatform(q);
        if (cancelled) return;
        const hits = [
          ...(result.tenants || []).map(tenant => ({
            id: `tenant-${tenant.id}`,
            label: `Tenant: ${tenant.displayName || tenant.slug}`,
            category: 'Tenants',
            icon: FiServer,
            path: `/adm/tenants?focus=${encodeURIComponent(tenant.id)}`,
          })),
          ...(result.users || []).map(user => ({
            id: `user-${user.id}`,
            label: `User: ${user.email || user.id}`,
            category: 'Users',
            icon: FiUsers,
            path: '/adm/users',
          })),
        ];
        setEntityHits(hits);
      } catch {
        if (!cancelled) setEntityHits([]);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nav = !q ? COMMAND_ITEMS : COMMAND_ITEMS.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
    return [...entityHits, ...nav];
  }, [query, entityHits]);

  const handleSelect = (item) => {
    onClose();
    if (item.path) {
      navigate(item.path);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(filteredItems[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-slate-900/60 backdrop-blur-xs p-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <FiSearch className="h-5 w-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-0 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden"
            placeholder="Type a command, module, or setting name…"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-slate-500 shadow-2xs">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 sm:hidden"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No admin modules or settings matched &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors text-sm ${
                    isSelected ? 'bg-indigo-50 text-indigo-900 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <Icon className="h-4 w-4 shrink-0" />
                    </div>
                    <span className="truncate">{item.label}</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Navigate <kbd className="font-mono text-[10px] bg-white border border-slate-200 px-1 py-0.5 rounded">↑</kbd><kbd className="font-mono text-[10px] bg-white border border-slate-200 px-1 py-0.5 rounded">↓</kbd></span>
            <span>Select <kbd className="font-mono text-[10px] bg-white border border-slate-200 px-1 py-0.5 rounded">↵</kbd></span>
          </div>
          <span className="font-mono text-[10px] text-slate-400">Super Admin Command Center</span>
        </div>
      </div>
    </div>
  );
}
