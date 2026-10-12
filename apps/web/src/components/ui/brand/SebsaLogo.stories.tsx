import type { Meta, StoryObj } from '@storybook/react-vite';
import { SebsaLogo } from '@/components/ui';

/**
 * The official SEBSA mark, transcribed from
 * https://sebsaworld.com/wp-content/uploads/sebsa-logo.svg
 *
 * Colours are never altered in `brand` tone. Aspect ratio is fixed by the
 * component — callers set height only, so the mark cannot be stretched.
 */
const meta = {
  title: 'Brand/SebsaLogo',
  component: SebsaLogo,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SebsaLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Brand: Story = {
  args: { height: 48 },
};

/** For the login panel and any other placement on the brand gradient. */
export const Inverse: Story = {
  args: { height: 48, tone: 'inverse' },
  parameters: { backgrounds: { value: 'brand' } },
};

/** Single-colour contexts — print, watermarks, low-ink rendering. */
export const Mono: Story = {
  args: { height: 48, tone: 'mono' },
  render: (args) => (
    <div className="text-ink-900">
      <SebsaLogo {...args} />
    </div>
  ),
};

/**
 * The tagline is roughly 12 units tall in a 79-unit viewBox, so it turns to
 * grey noise when small. `tagline="auto"` drops it below 28px rather than
 * rendering something unreadable.
 */
export const SizeRamp: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-5">
      {[20, 26, 34, 48, 72].map((height) => (
        <div key={height} className="flex items-center gap-4">
          <span className="w-12 font-mono text-xs text-ink-400">{height}px</span>
          <SebsaLogo height={height} />
        </div>
      ))}
    </div>
  ),
};

export const TaglineAlways: Story = {
  args: { height: 20, tagline: 'always' },
};

export const TaglineNever: Story = {
  args: { height: 48, tagline: 'never' },
};

/**
 * Two instances on one page. This is the case the component exists to solve:
 * the source SVG hardcodes `id="linear-gradient"`, so duplicate IDs in the DOM
 * would make the second instance resolve its fill against the first. Both must
 * show the full gradient.
 */
export const TwoInstances: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <SebsaLogo height={44} />
      <SebsaLogo height={44} />
    </div>
  ),
};
