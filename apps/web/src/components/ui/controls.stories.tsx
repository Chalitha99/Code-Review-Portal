import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Eye, Trash2, UserPlus } from 'lucide-react';
import { MAX_FEEDBACK_SUMMARY_CHARS } from '@sdp/contracts';
import { Field } from './Field.tsx';
import { Select, SearchableSelect } from './Select.tsx';
import { Checkbox, IconButton, RadioGroup, SearchField, Textarea } from './controls.tsx';

const meta = {
  title: 'Primitives/Form controls',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const CUSTOMERS = [
  { value: 'all', label: 'All customers' },
  { value: 'aasl', label: 'AASL' },
  { value: 'semco', label: 'SEMCO' },
  { value: 'nolimit', label: 'NoLimit' },
];

const RANKS = [
  {
    value: '1',
    label: 'Rank 1 — No serious issues',
    description: 'The task may be approved.',
  },
  {
    value: '2',
    label: 'Rank 2 — Minor issues',
    description: 'Approve is blocked. Findings and at least one screenshot are required.',
  },
  {
    value: '3',
    label: 'Rank 3 — Serious issues',
    description: 'Approve is blocked. Findings and at least one screenshot are required.',
  },
];

export const Selects: Story = {
  render: function Render() {
    const [value, setValue] = useState('all');
    const [reviewer, setReviewer] = useState('');

    return (
      <div className="grid max-w-sm gap-4">
        <Select
          value={value}
          onValueChange={setValue}
          options={CUSTOMERS}
          label="Customer:"
          aria-label="Filter by customer"
        />
        <SearchableSelect
          value={reviewer}
          onValueChange={setReviewer}
          options={CUSTOMERS}
          placeholder="Select a reviewer"
          aria-label="Reviewer"
        />
        <Select
          value="all"
          onValueChange={() => undefined}
          options={CUSTOMERS}
          disabled
          aria-label="Disabled example"
        />
      </div>
    );
  },
};

/** Inside a `Field`, the select inherits the label, hint and error wiring. */
export const SelectInAField: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <div className="max-w-sm">
        <Field label="Customer" required error={value === '' ? 'Select a customer' : undefined}>
          <Select
            value={value}
            onValueChange={setValue}
            options={CUSTOMERS.slice(1)}
            placeholder="Select a customer"
          />
        </Field>
      </div>
    );
  },
};

export const Search: Story = {
  render: function Render() {
    const [query, setQuery] = useState('AASL');
    return (
      <div className="max-w-sm">
        <SearchField value={query} onValueChange={setQuery} label="Search tasks" />
      </div>
    );
  },
};

export const TextareaWithCounter: Story = {
  render: function Render() {
    const [text, setText] = useState('');
    return (
      <div className="max-w-lg">
        <Field label="Feedback summary" required hint="Visible to the developer.">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_FEEDBACK_SUMMARY_CHARS}
            showCount
            rows={5}
            placeholder="Summarise the outcome of this review…"
          />
        </Field>
      </div>
    );
  },
};

export const Checkboxes: Story = {
  render: function Render() {
    const [checked, setChecked] = useState(true);
    return (
      <div className="grid max-w-sm gap-3">
        <Checkbox checked={checked} onCheckedChange={setChecked} label="Remember me" />
        <Checkbox
          checked={false}
          onCheckedChange={() => undefined}
          label="Customization"
          description="Adds the customization section to the quality checklist."
        />
        <Checkbox checked disabled onCheckedChange={() => undefined} label="Disabled and checked" />
      </div>
    );
  },
};

/** The card treatment the Review Ranking form uses. */
export const Ranks: Story = {
  render: function Render() {
    const [value, setValue] = useState<string | null>(null);
    return (
      <div className="max-w-lg">
        <RadioGroup value={value} onValueChange={setValue} options={RANKS} label="Review ranking" />
      </div>
    );
  },
};

export const IconButtons: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <IconButton label="View task" icon={<Eye className="size-4" />} />
      <IconButton label="Assign reviewer" icon={<UserPlus className="size-4" />} tone="primary" />
      <IconButton label="Delete task" icon={<Trash2 className="size-4" />} tone="danger" />
      <IconButton label="Disabled" icon={<Eye className="size-4" />} disabled />
      <IconButton label="Small" icon={<Eye className="size-3.5" />} size="sm" />
    </div>
  ),
};
