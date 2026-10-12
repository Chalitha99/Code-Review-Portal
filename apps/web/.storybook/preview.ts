/// <reference types="vite/client" />
import type { Preview } from '@storybook/react-vite';
import '../src/styles/index.css';

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    /*
     * Axe runs on every story and reports in the a11y panel and test output.
     * 'todo' (report, don't fail) while the known findings are open: Rank and
     * status badge colours below 4.5:1 contrast, and DataTable story issues.
     * Switch to 'error' once they are fixed so regressions fail the build.
     */
    a11y: { test: 'todo' },
  },
};

export default preview;
