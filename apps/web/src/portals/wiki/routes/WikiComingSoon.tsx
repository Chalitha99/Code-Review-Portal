import { BookOpen } from 'lucide-react';
import { PageContainer } from '@/components/common/PageContainer.tsx';
import { EmptyState, EmptyStateIcon } from '@/components/common/states.tsx';

/**
 * Placeholder shell for the Wiki Portal (phase 3).
 *
 * See the note in `DeliveryComingSoon.tsx` — same reasoning, same absence of a
 * workspace guard.
 */
export function WikiComingSoon() {
  return (
    <PageContainer>
      <EmptyState
        icon={
          <EmptyStateIcon>
            <BookOpen className="size-6" aria-hidden="true" />
          </EmptyStateIcon>
        }
        title="Wiki"
        hint="This workspace is not built yet. It arrives in phase 3 as the knowledge base for the Service Delivery Portal."
      />
    </PageContainer>
  );
}
