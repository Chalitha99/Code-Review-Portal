import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { apiStub } from '@tests/support/apiStub.ts';
import { buildDataset } from '@tests/support/fixtures/dataset.ts';
import { renderWithProviders } from '@tests/support/renderWithProviders.tsx';
import { TaskInformationCard } from '@/portals/code-review/components/TaskInformationCard.tsx';

describe('TaskInformationCard cycle', () => {
  it('shows the counted cycle without an adjustment badge', async () => {
    apiStub.get('/task-types', () => []);
    const [base] = buildDataset().tasks;
    if (!base) throw new Error('dataset has no tasks');
    const task = { ...base, reviewRound: 2, countedCycle: 0, adjustedCycles: [1] };

    renderWithProviders(<TaskInformationCard task={task} />);

    expect(await screen.findByText('Cycle 0')).toBeInTheDocument();
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.queryByText(/Adjusted/)).not.toBeInTheDocument();
  });
});
