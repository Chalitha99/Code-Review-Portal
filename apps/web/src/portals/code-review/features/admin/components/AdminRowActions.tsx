import { Pencil, Power, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui/controls.tsx';

/**
 * The edit / activate-deactivate / delete trio the admin tables share.
 *
 * Extracted because the Quality Checklist tab alone renders it three times, and
 * the ordering and tone of these three buttons is exactly the sort of thing that
 * drifts when copied: the destructive one must be last and red, the reversible
 * one in the middle.
 */
export function AdminRowActions({
  isActive,
  editLabel,
  toggleLabel,
  deleteLabel,
  onEdit,
  onToggle,
  onDelete,
}: {
  isActive: boolean;
  editLabel: string;
  toggleLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton
        label={editLabel}
        icon={<Pencil className="size-4" />}
        size="sm"
        onClick={onEdit}
      />
      <IconButton
        label={toggleLabel}
        icon={<Power className="size-4" />}
        tone={isActive ? 'danger' : 'success'}
        size="sm"
        onClick={onToggle}
      />
      <IconButton
        label={deleteLabel}
        icon={<Trash2 className="size-4" />}
        tone="danger"
        size="sm"
        onClick={onDelete}
      />
    </div>
  );
}
