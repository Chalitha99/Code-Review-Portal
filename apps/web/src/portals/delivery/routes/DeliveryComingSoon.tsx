import { Truck } from 'lucide-react';
import { PageContainer } from '@/components/common/PageContainer.tsx';
import { EmptyState, EmptyStateIcon } from '@/components/common/states.tsx';

/**
 * Placeholder shell for the Delivery Portal (phase 2).
 *
 * It exists so `/delivery` resolves rather than falling through to the 404
 * route. `constants/routePaths` has declared the address since the scaffold was
 * written, but nothing mounted it, so the one link that would prove the portal
 * structure works led to a Not Found page.
 *
 * Deliberately has no workspace guard: there are no Delivery roles yet, and
 * inventing one here would be a decision this file is not entitled to make.
 */
export function DeliveryComingSoon() {
  return (
    <PageContainer>
      <EmptyState
        icon={
          <EmptyStateIcon>
            <Truck className="size-6" aria-hidden="true" />
          </EmptyStateIcon>
        }
        title="Delivery Portal"
        hint="This workspace is not built yet. It arrives in phase 2, alongside the delivery hand-off from an approved code review."
      />
    </PageContainer>
  );
}
