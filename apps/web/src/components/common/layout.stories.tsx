import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  Repeat,
  Shield,
  Users,
  XCircle,
} from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { Button } from '@/components/ui/Button.tsx';
import { Alert } from '@/components/ui/Alert.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { RouteTabs, Tabs } from '@/components/ui/Tabs.tsx';
import { KpiCard, StatCard } from './KpiCard.tsx';
import { BackLink, Breadcrumbs, PageHeader } from './PageHeader.tsx';
import { RequirementList, Stepper } from './Stepper.tsx';
import { DonutChart } from './charts/DonutChart.tsx';
import { MetricBar } from './charts/MetricBar.tsx';

const meta = {
  title: 'Library/Layout & workflow',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/admin/users']}>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Headers: Story = {
  render: () => (
    <div className="space-y-8">
      <div className="space-y-3">
        <Breadcrumbs
          items={[
            { label: 'Home', to: '/' },
            { label: 'My Tasks', to: '/developer' },
            { label: 'AASL-019' },
          ]}
        />
        <PageHeader
          title="Admin Dashboard"
          subtitle="Full system overview and management."
          icon={<Shield className="size-5" />}
          tone="admin"
          actions={<Button>New Review Task</Button>}
        />
      </div>
      <BackLink to="/developer" label="Back to My Tasks" />
    </div>
  ),
};

export const Metrics: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Tasks" value={33} icon={<ClipboardList className="size-4" />} />
        <StatCard
          label="Approved"
          value={2}
          tone="green"
          icon={<CheckCircle2 className="size-4" />}
        />
        <StatCard label="Cancelled" value={16} tone="red" icon={<XCircle className="size-4" />} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Approval rate"
          value="14.3%"
          caption="Of submitted tasks"
          target={{ met: false }}
          icon={<CheckCircle2 className="size-4" />}
        />
        <KpiCard
          label="Avg review cycles"
          value="2.00"
          caption="Per approved task"
          target={{ met: true }}
          icon={<Repeat className="size-4" />}
        />
        {/* No target defined — the indicator line is simply absent. */}
        <KpiCard
          label="Active team"
          value={17}
          caption="Team members by role"
          icon={<Users className="size-4" />}
        />
      </div>

      <div className="max-w-sm">
        <MetricBar value={25} label="Approval rate" valueLabel="25%" />
      </div>
    </div>
  ),
};

export const Charts: Story = {
  render: () => (
    <div className="grid gap-6 sm:grid-cols-2">
      <DonutChart
        emptyLabel="No review outcomes yet"
        valueLabel="Tasks"
        centerLabel="33"
        centerCaption="tasks"
        slices={[
          { id: 'draft', label: 'Draft', value: 3, color: '#f59e0b' },
          { id: 'submitted', label: 'Submitted', value: 5, color: '#7c3aed' },
          { id: 'review', label: 'In Review', value: 1, color: '#1e3a8a' },
          {
            id: 'changes',
            label: 'Changes Requested',
            value: 6,
            color: '#dc2626',
          },
        ]}
      />
      {/* FL 2.4.3: an empty analytics panel says so rather than drawing a zero ring. */}
      <DonutChart emptyLabel="No completed reviews yet" valueLabel="Reviews" slices={[]} />
    </div>
  ),
};

export const WizardChrome: Story = {
  render: () => (
    <div className="space-y-8">
      <Stepper
        steps={[
          { id: 'details', title: 'Task Details', state: 'complete' },
          { id: 'checklist', title: 'Quality Checklist', state: 'current' },
          { id: 'review', title: 'Review & Submit', state: 'upcoming' },
        ]}
      />
      <Stepper
        steps={[
          { id: 'details', title: 'Task Details', state: 'complete' },
          { id: 'checklist', title: 'Quality Checklist', state: 'error' },
          { id: 'review', title: 'Review & Submit', state: 'upcoming' },
        ]}
      />
      <div className="max-w-md">
        <RequirementList
          requirements={[
            { id: 'customer', label: 'Customer selected', state: 'met' },
            { id: 'crim', label: 'CRIM ID entered', state: 'met' },
            {
              id: 'types',
              label: 'At least one task type selected',
              state: 'pending',
            },
            {
              id: 'answers',
              label: '4 checklist questions unanswered',
              state: 'blocking',
            },
          ]}
        />
      </div>
    </div>
  ),
};

export const Alerts: Story = {
  render: () => (
    <div className="space-y-3">
      <Alert tone="info" title="Checklist required">
        Complete every question before submitting for review.
      </Alert>
      <Alert tone="success" title="Approved">
        By Hiruni Wijethilaka · Cycle 1
      </Alert>
      <Alert tone="warning" title="Changes requested">
        Resolve or reject each finding, then resubmit.
      </Alert>
      <Alert tone="danger" title="Approve is blocked at Rank 2">
        Add detailed review findings and at least one screenshot, then choose Request Changes.
      </Alert>
    </div>
  ),
};

export const TabStrips: Story = {
  render: function Render() {
    const [tab, setTab] = useState('developers');
    return (
      <div className="space-y-6">
        <RouteTabs
          label="Admin sections"
          tabs={[
            {
              to: '/admin',
              label: 'Tasks',
              icon: <ClipboardList className="size-4" />,
              end: true,
            },
            {
              to: '/admin/users',
              label: 'Users',
              icon: <Users className="size-4" />,
            },
            {
              to: '/admin/customers',
              label: 'Customers',
              icon: <FileText className="size-4" />,
            },
          ]}
        />
        <Tabs
          label="Report breakdown"
          value={tab}
          onValueChange={setTab}
          tabs={[
            {
              value: 'developers',
              label: 'Developers',
              content: <p>Developer performance</p>,
            },
            {
              value: 'reviewers',
              label: 'Reviewers',
              content: <p>Reviewer activity</p>,
            },
            {
              value: 'customers',
              label: 'Customers',
              content: <p>Customer overview</p>,
            },
          ]}
        />
      </div>
    );
  },
};

export const Modal: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Add User</Button>
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="Add User"
          description="Grant a team member access to the portal."
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setOpen(false)}>Save</Button>
            </>
          }
        >
          <p className="text-sm text-ink-500">Form fields go here.</p>
        </Dialog>
      </>
    );
  },
};
