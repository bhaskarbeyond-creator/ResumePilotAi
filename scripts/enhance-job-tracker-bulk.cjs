const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'frontend', 'src', 'pages', 'dashboard', 'job-tracker.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add state hooks for selection and bulk actions
const stateTarget = '  const [removal, setRemoval] = useState<{ session: number; open: boolean; job: TrackedJob } | null>(null);';
const stateReplacement = `  const [removal, setRemoval] = useState<{ session: number; open: boolean; job: TrackedJob } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const toggleSelectJob = useCallback((job: TrackedJob) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(job.id)) next.delete(job.id);
      else next.add(job.id);
      return next;
    });
  }, []);

  const allSelected = visible.length > 0 && visible.every((job) => selectedIds.has(job.id));
  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map((j) => j.id)));
    }
  }, [allSelected, visible]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkMove = async (targetStatus: TrackerStatus) => {
    const jobsToMove = jobs.filter((j) => selectedIds.has(j.id) && j.status !== targetStatus);
    if (!jobsToMove.length) {
      setSelectedIds(new Set());
      return;
    }
    setNotice({ tone: 'info', text: \`Moving \${jobsToMove.length} \${jobsToMove.length === 1 ? 'job' : 'jobs'} to \${stageLabel(targetStatus)}...\` });
    let movedCount = 0;
    for (const job of jobsToMove) {
      try {
        await moveJob(job, targetStatus, 'stage');
        movedCount++;
      } catch (err) {
        console.error('Bulk move item error:', err);
      }
    }
    setSelectedIds(new Set());
    setNotice({ tone: 'success', text: \`Moved \${movedCount} \${movedCount === 1 ? 'job' : 'jobs'} to \${stageLabel(targetStatus)}.\` });
    refreshInBackground();
  };

  const handleBulkDelete = async () => {
    const jobsToDelete = jobs.filter((j) => selectedIds.has(j.id));
    if (!jobsToDelete.length) return;
    setIsBulkDeleting(true);
    let deletedCount = 0;
    for (const job of jobsToDelete) {
      try {
        await deleteTrackedJob(job);
        deletedCount++;
      } catch (err) {
        console.error('Bulk delete item error:', err);
      }
    }
    setJobs((current) => current.filter((j) => !selectedIds.has(j.id)));
    setSelectedIds(new Set());
    setIsBulkDeleting(false);
    setShowBulkDeleteModal(false);
    setNotice({ tone: 'success', text: \`Removed \${deletedCount} \${deletedCount === 1 ? 'job' : 'jobs'} from your tracker.\` });
    refreshInBackground();
  };`;

content = content.replace(stateTarget, stateReplacement);

// 2. Add onToggleSelect to entryProps
const entryPropsTarget = `  const entryProps = {
    onMove: (job: TrackedJob, status: TrackerStatus, via?: 'stage' | 'advance') => void moveJob(job, status, via),
    onEdit: (job: TrackedJob, focus?: 'interview') => openForm({ mode: 'edit', job, focus }, actionsTriggerId(job)),
    onDelete: openRemoval, onExportInterview: exportInterview,
  };`;

const entryPropsReplacement = `  const entryProps = {
    onMove: (job: TrackedJob, status: TrackerStatus, via?: 'stage' | 'advance') => void moveJob(job, status, via),
    onEdit: (job: TrackedJob, focus?: 'interview') => openForm({ mode: 'edit', job, focus }, actionsTriggerId(job)),
    onDelete: openRemoval, onExportInterview: exportInterview,
    onToggleSelect: toggleSelectJob,
  };`;

content = content.replace(entryPropsTarget, entryPropsReplacement);

// 3. Add Select All button to toolbar
const toolbarTarget = `<div role="group" aria-label="View" className="flex rounded-lg border border-border bg-surface p-0.5">{([['board', 'Board', LayoutGrid], ['list', 'List', List]] as Array<[TrackerView, string, typeof List]>).map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setParam('view', value, 'board')} className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-500', view === value ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink')}><Icon className="size-4" aria-hidden="true" />{label}</button>)}</div>
        </div>`;

const toolbarReplacement = `<div role="group" aria-label="View" className="flex rounded-lg border border-border bg-surface p-0.5">{([['board', 'Board', LayoutGrid], ['list', 'List', List]] as Array<[TrackerView, string, typeof List]>).map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setParam('view', value, 'board')} className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-500', view === value ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink')}><Icon className="size-4" aria-hidden="true" />{label}</button>)}</div>
          <Button type="button" variant="outline" size="sm" onClick={handleSelectAll} className="flex items-center gap-1.5 text-xs">
            {allSelected ? <CheckSquare className="size-4 text-brand-600" /> : <Square className="size-4 text-ink-muted" />}
            {allSelected ? 'Deselect all' : 'Select all'}
          </Button>
        </div>`;

content = content.replace(toolbarTarget, toolbarReplacement);

// 4. Pass selected to TrackerEntry in board and list view
content = content.replace(
  '<TrackerEntry job={job} moving={movingIds.has(job.id)} {...entryProps} dragging={dragId === job.id}',
  '<TrackerEntry job={job} selected={selectedIds.has(job.id)} moving={movingIds.has(job.id)} {...entryProps} dragging={dragId === job.id}'
);

content = content.replace(
  '<TrackerEntry job={job} moving={movingIds.has(job.id)} {...entryProps} />',
  '<TrackerEntry job={job} selected={selectedIds.has(job.id)} moving={movingIds.has(job.id)} {...entryProps} />'
);

// 5. Add floating bulk action toolbar and bulk delete modal before the closing </div>
const closingTarget = '  </div>;\n}';
const bulkUI = `
    {selectedIds.size > 0 && (
      <div
        role="region"
        aria-label="Bulk actions toolbar"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/95 px-5 py-3 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4"
      >
        <span className="text-xs font-bold text-ink">
          {selectedIds.size} {selectedIds.size === 1 ? 'job' : 'jobs'} selected
        </span>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-ink-muted">Move to:</span>
          {TRACKER_STAGES.map((stage) => (
            <Button
              key={stage.id}
              variant="outline"
              size="xs"
              onClick={() => void handleBulkMove(stage.id)}
              className="text-xs"
            >
              {stage.label}
            </Button>
          ))}
        </div>
        <div className="h-4 w-px bg-border" />
        <Button
          variant="destructive"
          size="xs"
          onClick={() => setShowBulkDeleteModal(true)}
          className="text-xs flex items-center gap-1"
        >
          <Trash2 className="size-3.5" /> Delete
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={handleClearSelection}
          className="text-xs text-ink-muted"
        >
          Clear
        </Button>
      </div>
    )}

    <Dialog open={showBulkDeleteModal} onOpenChange={setShowBulkDeleteModal}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {selectedIds.size} tracked jobs?</DialogTitle>
          <DialogDescription>
            The selected {selectedIds.size} jobs will be permanently removed from your private tracker. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={isBulkDeleting}
            onClick={() => setShowBulkDeleteModal(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={isBulkDeleting}
            onClick={() => void handleBulkDelete()}
          >
            {isBulkDeleting ? 'Deleting...' : \`Confirm Delete (\${selectedIds.size})\`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}`;

content = content.replace(closingTarget, bulkUI);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully enhanced job-tracker.tsx with multi-select bulk actions.');
