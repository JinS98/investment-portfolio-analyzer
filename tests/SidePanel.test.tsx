import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SidePanel } from '../src/components/layout/SidePanel/SidePanel';

describe('SidePanel', () => {
  it('renders an accessible dialog and locks body scrolling while open', () => {
    const { rerender } = render(
      <SidePanel isOpen labelledBy="panel-title" onClose={vi.fn()}>
        <h2 id="panel-title">종목 상세</h2>
      </SidePanel>,
    );

    expect(screen.getByRole('dialog', { name: '종목 상세' })).toBeInTheDocument();
    expect(document.body).toHaveStyle({ overflow: 'hidden' });

    rerender(
      <SidePanel isOpen={false} labelledBy="panel-title" onClose={vi.fn()}>
        <h2 id="panel-title">종목 상세</h2>
      </SidePanel>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes with Escape and backdrop clicks but not with panel clicks', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <SidePanel isOpen labelledBy="panel-title" onClose={onClose}>
        <h2 id="panel-title">종목 상세</h2>
        <button type="button">패널 동작</button>
      </SidePanel>,
    );

    await user.click(screen.getByRole('button', { name: '패널 동작' }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
