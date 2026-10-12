import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from './Button.tsx';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  parameters: { layout: 'centered' },
  args: { children: 'Submit for Review' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * All variants side by side. `brand` carries the official gradient and is
 * reserved for the single most important action on a page.
 */
export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} variant="primary">
        Primary
      </Button>
      <Button {...args} variant="brand">
        Brand
      </Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
      <Button {...args} variant="success">
        Approve Task
      </Button>
      <Button {...args} variant="danger">
        Request Changes
      </Button>
      <Button {...args} variant="link">
        Link
      </Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="md">
        Medium
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} leadingIcon={<Check className="size-4" />}>
        Approve
      </Button>
      <Button {...args} variant="secondary" trailingIcon={<ArrowRight className="size-4" />}>
        Next: Quality Checklist
      </Button>
    </div>
  ),
};

/**
 * The label stays mounted while loading, so the button does not change width
 * and the surrounding layout does not shift.
 */
export const Loading: Story = {
  args: { isLoading: true, loadingLabel: 'Signing in…' },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const FullWidth: Story = {
  args: { fullWidth: true, variant: 'brand' },
  parameters: { layout: 'padded' },
};
