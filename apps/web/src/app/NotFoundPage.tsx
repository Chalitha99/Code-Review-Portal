import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/common/states.tsx';
import { ROUTES } from '@/config/routes.ts';
import common from '@/content/common.json';

export function NotFoundPage() {
  return (
    <EmptyState
      className="min-h-[60vh]"
      icon={<FileQuestion className="size-6" />}
      title={common.errors.notFound}
      action={
        <Link
          to={ROUTES.home}
          className="text-sm font-semibold text-brand-blue-600 hover:text-brand-blue-500"
        >
          {common.actions.backToDashboard}
        </Link>
      }
    />
  );
}
