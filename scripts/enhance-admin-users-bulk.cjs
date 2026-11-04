const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('D:/xampp/htdocs/IME365/frontend/src/components/admin/AdminUsersTab.tsx');
let content = fs.readFileSync(targetFile, 'utf8').replace(/\r\n/g, '\n');

// 1. Check if state already has selectedUids
if (!content.includes('selectedUids')) {
  const stateHookTarget = "  const [observingUser, setObservingUser] = useState<string | null>(null);";
  const stateHookReplacement = `  const [observingUser, setObservingUser] = useState<string | null>(null);

  // Multi-select bulk user management state
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [bulkActionPending, setBulkActionPending] = useState(false);
  const [bulkConfirmAction, setBulkConfirmAction] = useState<'suspend' | 'activate' | 'revoke-sessions' | null>(null);

  const handleToggleSelectAll = () => {
    if (selectedUids.length === filteredUsers.length) {
      setSelectedUids([]);
    } else {
      setSelectedUids(filteredUsers.map(u => u.id));
    }
  };

  const handleToggleSelectOne = (uid: string) => {
    setSelectedUids(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const executeBulkAction = async (action: 'suspend' | 'activate' | 'revoke-sessions') => {
    if (!selectedUids.length || bulkActionPending) return;
    setBulkActionPending(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await post<{
        success: boolean;
        summary: { total: number; succeeded: number; failed: number };
        results?: { succeeded: string[]; failed: { uid: string; error: string }[] };
      }>('/admin/users/bulk-status', {
        uids: selectedUids,
        action,
        status: action === 'suspend' ? 'SUSPENDED' : action === 'activate' ? 'ACTIVE' : undefined,
        revokeSessions: action === 'revoke-sessions' || action === 'suspend',
      });
      if (res.success || (res.summary && res.summary.succeeded > 0)) {
        setActionSuccess(\`Bulk \${action} completed: \${res.summary?.succeeded ?? selectedUids.length} succeeded, \${res.summary?.failed ?? 0} failed.\`);
        setSelectedUids([]);
        setBulkConfirmAction(null);
        await loadUsers();
      } else {
        setActionError(\`Bulk \${action} failed: \${res.results?.failed?.[0]?.error || 'Operation failed'}\`);
      }
    } catch (err) {
      setActionError(normalizeError(err).message);
    } finally {
      setBulkActionPending(false);
    }
  };`;
  content = content.replace(stateHookTarget, stateHookReplacement);
}

// 2. Add Bulk Toolbar before table if not already added
if (!content.includes('selectedUids.length > 0 &&')) {
  const tableSearchTarget = "      {/* ─── Users Table ─── */}";
  const tableSearchReplacement = `      {/* ─── Multi-Select Bulk Actions Toolbar ─── */}
      {selectedUids.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800/60 shadow-sm transition-all">
          <div className="text-xs font-semibold text-brand-900 dark:text-brand-200 flex items-center gap-2">
            <CheckCircle2 className="size-4 text-brand-600 dark:text-brand-400" />
            <span>{selectedUids.length} user{selectedUids.length === 1 ? '' : 's'} selected for governance action</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActionPending}
              onClick={() => setBulkConfirmAction('activate')}
              className="text-xs h-7 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            >
              Bulk Activate
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActionPending}
              onClick={() => setBulkConfirmAction('suspend')}
              className="text-xs h-7 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              Bulk Suspend
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActionPending}
              onClick={() => setBulkConfirmAction('revoke-sessions')}
              className="text-xs h-7 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              Revoke Sessions
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkActionPending}
              onClick={() => setSelectedUids([])}
              className="text-xs h-7 text-ink-muted hover:text-ink"
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* ─── Users Table ─── */}`;
  content = content.replace(tableSearchTarget, tableSearchReplacement);
}

// 3. Add checkbox to table header
if (!content.includes('aria-label="Select all users"')) {
  const theadTarget = `<thead className="bg-canvas border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">User Identity</th>`;
  const theadReplacement = `<thead className="bg-canvas border-b border-border">
            <tr>
              <th className="px-3 py-3 w-10 text-center">
                <input
                  type="checkbox"
                  aria-label="Select all users"
                  checked={filteredUsers.length > 0 && selectedUids.length === filteredUsers.length}
                  onChange={handleToggleSelectAll}
                  className="size-4 rounded border-border text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">User Identity</th>`;
  content = content.replace(theadTarget, theadReplacement);
}

// 4. Update colSpan from 7 to 8
content = content.replace('colSpan={7}', 'colSpan={8}');

// 5. Add checkbox cell to tbody rows
if (!content.includes('aria-label={`Select user ${user.email}`}')) {
  const tbodyRowTarget = `{!loading && filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-neutral-25 dark:hover:bg-neutral-800/30 transition-colors">
                <td className="px-4 py-3">`;
  const tbodyRowReplacement = `{!loading && filteredUsers.map((user) => (
              <tr key={user.id} className={cn("hover:bg-neutral-25 dark:hover:bg-neutral-800/30 transition-colors", selectedUids.includes(user.id) && "bg-brand-50/40 dark:bg-brand-950/20")}>
                <td className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label={\`Select user \${user.email}\`}
                    checked={selectedUids.includes(user.id)}
                    onChange={() => handleToggleSelectOne(user.id)}
                    className="size-4 rounded border-border text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3">`;
  content = content.replace(tbodyRowTarget, tbodyRowReplacement);
}

// 6. Add Bulk Confirmation Dialog before Provision User Modal
if (!content.includes('Confirm Bulk Governance Action')) {
  const dialogEndTarget = `      {/* Provision User Modal */}`;
  const dialogEndReplacement = `      {/* Bulk Action Confirmation Modal */}
      <Dialog open={bulkConfirmAction !== null} onOpenChange={(open) => { if (!open && !bulkActionPending) setBulkConfirmAction(null); }}>
        <DialogContent className="max-w-md p-6 bg-surface border-border">
          <DialogTitle className="text-base font-bold text-ink flex items-center gap-2">
            <ShieldAlert className="size-5 text-amber-500" />
            <span>Confirm Bulk Governance Action</span>
          </DialogTitle>
          <div className="py-3 text-xs text-ink-secondary space-y-2">
            <p>
              Are you sure you want to perform <strong className="text-ink font-bold uppercase">{bulkConfirmAction}</strong> on{' '}
              <strong className="text-ink font-bold">{selectedUids.length} selected user(s)</strong>?
            </p>
            {bulkConfirmAction === 'suspend' && (
              <p className="text-rose-600 dark:text-rose-400 font-medium">
                This will disable user authentication in the identity directory and revoke all active sessions immediately.
              </p>
            )}
            {bulkConfirmAction === 'revoke-sessions' && (
              <p className="text-amber-600 dark:text-amber-400 font-medium">
                All refresh tokens and active server sessions will be revoked. Users will be prompted to re-authenticate on next request.
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActionPending}
              onClick={() => setBulkConfirmAction(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant={bulkConfirmAction === 'suspend' ? 'destructive' : 'default'}
              disabled={bulkActionPending}
              onClick={() => bulkConfirmAction && void executeBulkAction(bulkConfirmAction)}
              className="text-xs"
            >
              {bulkActionPending ? 'Executing…' : \`Confirm \${bulkConfirmAction}\`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Provision User Modal */}`;
  content = content.replace(dialogEndTarget, dialogEndReplacement);
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Successfully enhanced AdminUsersTab.tsx with complete bulk selection and actions!');
