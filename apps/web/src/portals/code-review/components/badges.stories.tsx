import type { Meta, StoryObj } from '@storybook/react-vite';
import { TASK_STATUSES, PRIORITIES, REVIEW_RANKS, ROLES } from '@sdp/contracts';
import {
  ActiveBadge,
  CustomerChip,
  CycleBadge,
  PriorityPill,
  RankBadge,
  RoleBadges,
  StatusBadge,
  Tag,
  VersionTag,
} from './badges.tsx';

const meta = {
  title: 'Library/Badges',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Every badge in the family, in every value it can take. */
export const AllStates: Story = {
  render: () => (
    <div>
      <Row label="Task status">
        {TASK_STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </Row>

      <Row label="Priority">
        {PRIORITIES.map((priority) => (
          <PriorityPill key={priority} priority={priority} />
        ))}
      </Row>

      <Row label="Review rank">
        {REVIEW_RANKS.map((rank) => (
          <RankBadge key={rank} rank={rank} />
        ))}
      </Row>

      <Row label="Roles">
        <RoleBadges roles={ROLES} />
      </Row>

      <Row label="Customer — pill and inline">
        <CustomerChip name="AASL" color="#16a34a" />
        <CustomerChip name="SEMCO" color="#6d28d9" />
        <CustomerChip name="AASL" color="#16a34a" variant="inline" />
      </Row>

      <Row label="Cycle — renders nothing at cycle 1">
        <CycleBadge cycle={1} />
        <CycleBadge cycle={2} />
        <CycleBadge cycle={5} />
      </Row>

      <Row label="Version — renders nothing when empty">
        <VersionTag version={null} />
        <VersionTag version="V1" />
        <VersionTag version="24R2" />
      </Row>

      <Row label="Active state">
        <ActiveBadge isActive />
        <ActiveBadge isActive={false} />
      </Row>

      <Row label="Neutral tag">
        <Tag>11 tasks</Tag>
        <Tag>Unassigned</Tag>
      </Row>
    </div>
  ),
};
