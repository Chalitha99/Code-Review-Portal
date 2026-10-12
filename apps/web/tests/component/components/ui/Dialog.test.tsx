import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from '@/components/ui/Dialog.tsx';

/**
 * The modal shell behind every dialog in the product.
 *
 * These tests are about STRUCTURE rather than behaviour, because structure is
 * what regressed: `description` used to render inside the header, so the
 * confirmation message on thirteen destructive dialogs read as a subtitle
 * beside the close button while the body below it was an empty padded band.
 * The assertions below fail if it ever moves back.
 */

/** The element wrapping the title — i.e. the header region. */
function headerOf(dialog: HTMLElement) {
  const header = within(dialog).getByRole('heading').parentElement;
  if (header === null) throw new Error('the title has no containing region');
  return header;
}

describe('Dialog', () => {
  it('renders the description in the body, not in the header', () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="Delete this user?" description="Ada is removed.">
        {null}
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    const description = screen.getByText('Ada is removed.');

    expect(headerOf(dialog)).not.toContainElement(description);
    // Still the accessible description — Radix wires `aria-describedby` through
    // context, so moving the element must not have cost us the association.
    expect(dialog).toHaveAttribute('aria-describedby', description.id);
  });

  it('separates its regions with spacing rather than rules', () => {
    render(
      <Dialog
        open
        onOpenChange={vi.fn()}
        title="Delete this user?"
        description="Ada is removed."
        footer={<button type="button">Delete</button>}
      >
        {null}
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    for (const region of Array.from(dialog.children)) {
      expect(region.className).not.toMatch(/\bborder-[bt]\b/);
    }
  });

  it('omits the body entirely when there is nothing to put in it', () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="Delete this user?" footer={<span>actions</span>}>
        {null}
      </Dialog>,
    );

    // Header and footer only. A third region here is the blank padded band.
    expect(screen.getByRole('dialog').children).toHaveLength(2);
  });

  it('keeps the footer actions below the body', () => {
    render(
      <Dialog
        open
        onOpenChange={vi.fn()}
        title="Delete this user?"
        description="Ada is removed."
        footer={<button type="button">Delete User</button>}
      >
        <p>Ada owns no tasks.</p>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    const body = screen.getByText('Ada owns no tasks.').parentElement;
    const action = screen.getByRole('button', { name: 'Delete User' });

    expect(body).not.toBeNull();
    expect(body).not.toContainElement(action);
    expect(within(dialog).getByText('Ada is removed.').parentElement).toBe(body);
  });

  it('closes through the header control', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(
      <Dialog
        open
        onOpenChange={onOpenChange}
        title="Delete this user?"
        description="Ada is removed."
      >
        {null}
      </Dialog>,
    );

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
