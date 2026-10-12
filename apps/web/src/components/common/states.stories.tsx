import type { Meta, StoryObj } from '@storybook/react-vite';
import { BellOff, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import { EmptyState, ErrorState, LoadingState } from './states.tsx';

/**
 * The three async presentations every data surface uses.
 *
 * Documented together because their value is consistency: a user who has
 * learned what a failed panel looks like in one place should recognise it
 * everywhere.
 */
const meta = {
  title: 'Feedback/Async States',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => <LoadingState />,
};

export const LoadingWithLabel: Story = {
  render: () => <LoadingState label="Loading review tasks…" />,
};

export const Empty: Story = {
  render: () => (
    <EmptyState
      icon={<BellOff className="size-5" />}
      title="You have no notifications."
      hint="Approvals, change requests and resubmissions will appear here."
    />
  ),
};

export const EmptyWithAction: Story = {
  render: () => (
    <EmptyState
      icon={<FileQuestion className="size-6" />}
      title="We could not find that page."
      action={<Button variant="link">Back to Dashboard</Button>}
    />
  ),
};

export const Error: Story = {
  render: () => <ErrorState onRetry={() => undefined} />,
};

export const ErrorWithMessage: Story = {
  render: () => (
    <ErrorState
      title="This page ran into a problem"
      message="Could not reach the server. Check your connection and try again."
      onRetry={() => undefined}
    />
  ),
};
