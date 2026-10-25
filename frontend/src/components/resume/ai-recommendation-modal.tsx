/**
 * AiRecommendationModal Component
 *
 * World-Class AI Recommendation Review Modal for Skills, Certifications & Competencies:
 * - Categorizes AI suggestions into Mandatory / Core Required & Recommended items
 * - Live search filter across items
 * - Multi-select checkboxes with Select All / Deselect All
 * - Responsive, mobile-first Cuba executive glassmorphism dialog
 * - Zero simulated latency; truthful backend integration
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sparkles,
  Check,
  Search,
  Flame,
  X,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RecommendationItem {
  id?: string;
  name: string;
  category?: 'mandatory' | 'core' | 'recommended' | string;
  issuer?: string;
  basis?: string;
}

export interface AiRecommendationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  type?: 'skills' | 'certifications' | 'keywords';
  targetRole?: string;
  items: RecommendationItem[];
  onApply: (selectedItems: RecommendationItem[]) => void;
}

export function AiRecommendationModal({
  isOpen,
  onClose,
  title = 'Review AI Recommendations',
  subtitle = 'Check the items you possess to add them to your resume.',
  type = 'skills',
  targetRole,
  items = [],
  onApply,
}: AiRecommendationModalProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Default to selecting all returned recommendations on modal open
  useEffect(() => {
    if (isOpen && items.length > 0) {
      setSelectedIndices(new Set(items.map((_, i) => i)));
      setSearchQuery('');
    }
  }, [isOpen, items]);

  const toggleItem = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIndices(new Set(items.map((_, i) => i)));
  };

  const selectNone = () => {
    setSelectedIndices(new Set());
  };

  const handleConfirm = () => {
    const selected = items.filter((_, i) => selectedIndices.has(i));
    onApply(selected);
    onClose();
  };

  // Filter items by search query
  const filteredIndexedItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items
      .map((item, idx) => ({ ...item, originalIndex: idx }))
      .filter((item) => {
        if (!q) return true;
        const nameMatch = item.name.toLowerCase().includes(q);
        const issuerMatch = item.issuer?.toLowerCase().includes(q);
        return nameMatch || issuerMatch;
      });
  }, [items, searchQuery]);

  const mandatoryItems = useMemo(() => {
    return filteredIndexedItems.filter(
      (item) => item.category === 'mandatory' || item.category === 'core'
    );
  }, [filteredIndexedItems]);

  const recommendedItems = useMemo(() => {
    return filteredIndexedItems.filter(
      (item) => item.category !== 'mandatory' && item.category !== 'core'
    );
  }, [filteredIndexedItems]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-2xl bg-surface/95 backdrop-blur-xl border-border shadow-2xl rounded-2xl sm:rounded-3xl p-0 overflow-hidden"
        data-testid="ai-recommendation-modal"
      >
        {/* Header */}
        <DialogHeader className="p-5 sm:p-6 border-b border-border/80 bg-neutral-50/70">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-brand-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg font-bold text-ink truncate">
                {title} {targetRole ? `for ${targetRole}` : ''}
              </DialogTitle>
              <DialogDescription className="text-xs text-ink-muted mt-0.5">
                {subtitle}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Search & Selection Controls Bar */}
        <div className="px-5 py-3 bg-neutral-100/60 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 max-w-xs">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Filter ${type}...`}
              className="h-8 pl-8 text-xs bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
            <span className="font-semibold text-ink-muted">
              <strong>{selectedIndices.size}</strong> of {items.length} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-brand-600 font-bold hover:underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-border">|</span>
              <button
                type="button"
                onClick={selectNone}
                className="text-ink-muted font-medium hover:underline cursor-pointer"
              >
                Deselect All
              </button>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto max-h-[60vh] space-y-5">
          {items.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-muted">
              No recommendations returned. Please add more career details to your resume.
            </div>
          ) : filteredIndexedItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-muted">
              No items match your search "{searchQuery}".
            </div>
          ) : (
            <>
              {/* Mandatory / Core Group */}
              {mandatoryItems.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-extrabold uppercase tracking-wider">
                      <Flame className="size-3 text-rose-600" /> Core / High-Priority
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      Essential keywords standard for this domain
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {mandatoryItems.map((item) => {
                      const isSelected = selectedIndices.has(item.originalIndex);
                      return (
                        <div
                          key={item.originalIndex}
                          onClick={() => toggleItem(item.originalIndex)}
                          className={cn(
                            'p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5',
                            isSelected
                              ? 'border-brand-300 bg-brand-50/60 text-brand-950 font-semibold shadow-2xs'
                              : 'border-border bg-surface text-ink-muted opacity-60 hover:opacity-100'
                          )}
                        >
                          <div
                            className={cn(
                              'size-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                              isSelected
                                ? 'bg-brand-600 border-brand-600 text-white'
                                : 'border-border bg-white'
                            )}
                          >
                            {isSelected && <Check className="size-3" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="leading-tight block truncate">{item.name}</span>
                            {item.issuer && (
                              <span className="text-[10px] text-ink-muted block truncate">{item.issuer}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recommended Group */}
              {recommendedItems.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold uppercase tracking-wider">
                      <Sparkles className="size-3 text-indigo-600" /> Recommended Additions
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      Complementary skills to boost ATS score
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {recommendedItems.map((item) => {
                      const isSelected = selectedIndices.has(item.originalIndex);
                      return (
                        <div
                          key={item.originalIndex}
                          onClick={() => toggleItem(item.originalIndex)}
                          className={cn(
                            'p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5',
                            isSelected
                              ? 'border-brand-300 bg-brand-50/60 text-brand-950 font-semibold shadow-2xs'
                              : 'border-border bg-surface text-ink-muted opacity-60 hover:opacity-100'
                          )}
                        >
                          <div
                            className={cn(
                              'size-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                              isSelected
                                ? 'bg-brand-600 border-brand-600 text-white'
                                : 'border-border bg-white'
                            )}
                          >
                            {isSelected && <Check className="size-3" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="leading-tight block truncate">{item.name}</span>
                            {item.issuer && (
                              <span className="text-[10px] text-ink-muted block truncate">{item.issuer}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t border-border bg-neutral-50/70 flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleConfirm}
            disabled={selectedIndices.size === 0}
            className="gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4"
          >
            <Plus className="size-4" />
            <span>Add Selected ({selectedIndices.size})</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
