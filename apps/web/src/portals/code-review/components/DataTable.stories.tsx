import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import { SearchField } from '@/components/ui/controls.tsx';
import { CustomerChip, PriorityPill } from './badges.tsx';
import { DateCell, MonoId, RowArrowAction, StatusCell, TitleCell } from './cells.tsx';
import { DataTable } from '@/components/common/DataTable.tsx';
import { columnHelper } from '@/components/common/dataTableColumns.ts';
import { EmptyState } from '@/components/common/states.tsx';
import type { Priority, TaskStatus } from '@sdp/contracts';

interface DemoTask {
  id: string;
  taskCode: string;
  title: string;
  version: string | null;
  crimId: string;
  customerName: string;
  customerColor: string;
  status: TaskStatus;
  cycle: number;
  priority: Priority;
  createdAt: string;
}

const helper = columnHelper<DemoTask>();

const columns = helper.columns([
  helper.accessor('taskCode', {
    header: 'Task ID',
    cell: (context) => <MonoId value={context.getValue()} />,
  }),
  helper.accessor('title', {
    header: 'Title',
    cell: (context) => <TitleCell title={context.getValue()} />,
  }),
  helper.accessor('crimId', {
    header: 'CRIM ID',
    cell: (context) => <MonoId value={context.getValue()} />,
  }),
  helper.accessor('customerName', {
    header: 'Customer',
    cell: (context) => (
      <CustomerChip
        name={context.getValue()}
        color={context.row.original.customerColor}
        variant="inline"
      />
    ),
  }),
  helper.accessor('status', {
    header: 'Status',
    cell: (context) => (
      <StatusCell status={context.getValue()} cycle={context.row.original.cycle} />
    ),
  }),
  helper.accessor('priority', {
    header: 'Priority',
    cell: (context) => <PriorityPill priority={context.getValue()} />,
  }),
  helper.accessor('createdAt', {
    header: 'Created',
    cell: (context) => <DateCell>{context.getValue()}</DateCell>,
  }),
  helper.display({
    id: 'actions',
    header: '',
    cell: (context) => (
      <RowArrowAction label={`Open ${context.row.original.taskCode}`} onClick={() => undefined} />
    ),
  }),
]);

const ROWS: DemoTask[] = [
  {
    id: '1',
    taskCode: 'SEMCO-016',
    title: 'SEMCO - 290',
    version: 'V0',
    crimId: '290',
    customerName: 'SEMCO',
    customerColor: '#6d28d9',
    status: 'Approved',
    cycle: 2,
    priority: 'Medium',
    createdAt: 'Jul 24, 2026',
  },
  {
    id: '2',
    taskCode: 'AASL-018',
    title: 'AASL - CRIM-848',
    version: 'V0',
    crimId: 'CRIM-848',
    customerName: 'AASL',
    customerColor: '#16a34a',
    status: 'InReview',
    cycle: 1,
    priority: 'Medium',
    createdAt: 'Jul 23, 2026',
  },
  {
    id: '3',
    taskCode: 'AASL-019',
    title: 'AASL - CRIM-851',
    version: null,
    crimId: 'CRIM-851',
    customerName: 'AASL',
    customerColor: '#16a34a',
    status: 'ChangesRequested',
    cycle: 3,
    priority: 'High',
    createdAt: 'Jul 22, 2026',
  },
  {
    id: '4',
    taskCode: 'NOL-004',
    title: 'NoLimit - CRIM-902',
    version: 'V2',
    crimId: 'CRIM-902',
    customerName: 'NoLimit',
    customerColor: '#2563eb',
    status: 'Draft',
    cycle: 1,
    priority: 'Low',
    createdAt: 'Jul 21, 2026',
  },
];

const meta = {
  title: 'Library/DataTable',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render() {
    const [query, setQuery] = useState('');
    return (
      <DataTable
        data={ROWS}
        columns={columns}
        getRowId={(row) => row.id}
        getRowAccent={(row) => row.customerColor}
        globalFilter={query}
        countNoun="tasks"
        caption="Review tasks"
        toolbar={
          <SearchField
            value={query}
            onValueChange={setQuery}
            label="Search tasks"
            className="max-w-xs"
          />
        }
      />
    );
  },
};

/** Pagination appears only once there is more than one page. */
export const Paginated: Story = {
  render: () => (
    <DataTable
      data={[...ROWS, ...ROWS, ...ROWS].map((row, index) => ({
        ...row,
        id: String(index),
      }))}
      columns={columns}
      getRowId={(row) => row.id}
      getRowAccent={(row) => row.customerColor}
      pageSize={5}
      countNoun="tasks"
      caption="Review tasks"
    />
  ),
};

/** Nothing has been created yet — distinct from "your filters matched nothing". */
export const Empty: Story = {
  render: () => (
    <DataTable
      data={[]}
      columns={columns}
      countNoun="tasks"
      caption="Review tasks"
      emptyState={
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No review tasks yet"
          hint="Create your first task to get started."
          action={<Button>New Review Task</Button>}
        />
      }
    />
  ),
};

export const NoMatches: Story = {
  render: () => (
    <DataTable
      data={ROWS}
      columns={columns}
      globalFilter="zzz"
      countNoun="tasks"
      caption="Review tasks"
    />
  ),
};

export const Loading: Story = {
  render: () => (
    <DataTable
      data={undefined}
      columns={columns}
      isLoading
      countNoun="tasks"
      caption="Review tasks"
    />
  ),
};

export const Failed: Story = {
  render: () => (
    <DataTable
      data={undefined}
      columns={columns}
      error={new Error('offline')}
      onRetry={() => undefined}
      countNoun="tasks"
      caption="Review tasks"
    />
  ),
};
