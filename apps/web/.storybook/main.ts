import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook: the component catalogue and its interaction/accessibility checks.
 *
 * Stories stay next to their components (`*.stories.tsx`) — they document the
 * component. Tests live in `tests/`; the stories also run as tests through
 * `@storybook/addon-vitest` (`npm run test:storybook`, in a real browser).
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: { name: '@storybook/react-vite', options: {} },
};

export default config;
