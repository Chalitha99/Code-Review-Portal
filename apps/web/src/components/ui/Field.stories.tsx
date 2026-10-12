import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field, Input } from './Field.tsx';

const meta = {
  title: 'Primitives/Field',
  component: Field,
  parameters: { layout: 'padded' },
  args: {
    label: 'CRIM ID',
    children: <Input placeholder="e.g. CRIM-2024-001" />,
  },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Required: Story = {
  args: { required: true },
};

/** The hint is linked via `aria-describedby`, not just placed nearby. */
export const WithHint: Story = {
  args: {
    label: 'Version',
    hint: 'If entered, version will be appended to the title (max 50 chars).',
    children: <Input placeholder="e.g. V1, 24R2, Patch 3" />,
  },
};

/**
 * Error state. The message carries `role="alert"` so it is announced when it
 * appears, and the input is marked `aria-invalid`.
 */
export const WithError: Story = {
  args: { required: true, error: 'Enter the CRIM ID' },
};

/** Hint and error coexist — both are referenced by the input. */
export const HintAndError: Story = {
  args: {
    label: 'Version',
    required: true,
    hint: 'Max 50 characters.',
    error: 'Version must be 50 characters or fewer',
  },
};

export const Disabled: Story = {
  args: { children: <Input disabled value="AASL-019" readOnly /> },
};
