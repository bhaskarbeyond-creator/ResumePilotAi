# Job Tracker finalization evidence

The canonical tracker remains the owner-scoped `users/{uid}/jobTracker/{jobId}` subcollection and remains separate from employer application state.

## Historical comparison and fixes

- Existing create/edit/move/delete/search and keyboard-select move alternative were preserved.
- Previous writes had no revisions, so stale tabs could overwrite moves/edits or delete a changed target.
- Create now starts at revision 1. Edit, stage move, and delete use Firestore transactions with expected revisions and return `TRACKER_CONFLICT` on stale state.
- Firestore rules enforce create revision 1 and update revision `+1`, including against direct SDK writes.
- Optimistic stage movement still preserves responsiveness, but durable response updates the local revision; failures rollback and conflicts refresh.
- Native `window.confirm` deletion was replaced with a labelled, keyboard-dismissible alert dialog using the loaded revision.
- Account UID changes already clear tracker state before loading, preserving cross-account isolation.

## Validation

- Job Tracker targeted tests: 3/3.
- Product suite: 63/63 plus template render 1/1.
- Security suite: 22/22 static/browser plus 64/64 backend.
- Build: passed in 4.33 seconds (4.721 seconds wall time).
- ESLint: 0 errors, 493 warnings.
- `git diff --check`: passed.

Firestore emulator execution remains unavailable because Java is not installed; the expanded revision rules test is present but not represented as executed.
