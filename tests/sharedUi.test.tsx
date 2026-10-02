import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AsyncState, Button, Dialog, Field } from '@shared/ui';

describe('shared UI primitives', () => {
  it('exposes button variants and loading behavior', () => {
    render(
      <Button variant="secondary" loading>
        저장
      </Button>,
    );
    const button = screen.getByRole('button', { name: '처리 중' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('connects a field error to its control', () => {
    render(
      <Field label="수량" error="수량을 입력해 주세요." required>
        <input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /수량/ });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('수량을 입력해 주세요.');
  });

  it('uses alert semantics for errors', () => {
    render(<AsyncState status="error" message="불러오지 못했습니다." />);
    expect(screen.getByRole('alert')).toHaveTextContent('불러오지 못했습니다.');
  });
});

describe('Dialog', () => {
  it('traps focus, closes by Escape, and restores trigger focus', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    function Fixture() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            열기
          </button>
          <Dialog
            open={open}
            labelledBy="dialog-title"
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          >
            <h2 id="dialog-title">공통 대화상자</h2>
            <button type="button">첫 동작</button>
            <button type="button">마지막 동작</button>
          </Dialog>
        </>
      );
    }

    render(<Fixture />);
    const trigger = screen.getByRole('button', { name: '열기' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: '첫 동작' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: '마지막 동작' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
  });
});
