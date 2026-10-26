import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithPlan } from './helpers';

describe('timeline', () => {
  it('groups tasks into phases and shows dependency chips', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByRole('heading', { name: '4+ months out' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Final week' })).toBeInTheDocument();
    const caterer = screen.getByTestId('task-caterer');
    expect(within(caterer).getByText('Book venue and fix muhurat date')).toBeInTheDocument();
    expect(screen.getByText('On track')).toBeInTheDocument();
  });

  it('delaying the venue highlights downstream tasks with text, not just colour', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    const venue = screen.getByTestId('task-venue');
    await user.click(within(venue).getByRole('button', { name: 'Mark delayed' }));
    const days = within(venue).getByLabelText('Delayed by (days)');
    await user.clear(days);
    await user.type(days, '40');
    await user.click(within(venue).getByRole('button', { name: 'Apply delay' }));

    expect(within(venue).getByText('Delayed 40 days')).toBeInTheDocument();
    const caterer = screen.getByTestId('task-caterer');
    expect(caterer).toHaveAttribute('data-affected', 'true');
    expect(
      within(caterer).getByText(/Pushed by delay in "Book venue and fix muhurat date"/),
    ).toBeInTheDocument();
    expect(within(caterer).getByText(/Now expected/)).toBeInTheDocument();
    expect(screen.getByTestId('task-outfits')).not.toHaveAttribute('data-affected');
    expect(screen.getByText(/tasks need attention/)).toBeInTheDocument();

    await user.click(within(venue).getByRole('button', { name: 'Change delay' }));
    await user.click(within(venue).getByRole('button', { name: 'Clear delay' }));
    expect(screen.getByTestId('task-caterer')).not.toHaveAttribute('data-affected');
    expect(screen.getByText('On track')).toBeInTheDocument();
  });

  it('marks tasks done, rejects bad delay input and stores assignees', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    const venue = screen.getByTestId('task-venue');
    await user.click(within(venue).getByRole('button', { name: 'Done' }));
    expect(within(venue).getByText('Done', { selector: 'span' })).toBeInTheDocument();
    await user.click(within(venue).getByRole('button', { name: 'Mark as to do' }));

    const outfits = screen.getByTestId('task-outfits');
    await user.type(within(outfits).getByLabelText('Assignee'), 'Mama');
    expect(within(outfits).getByLabelText('Assignee')).toHaveValue('Mama');
    await user.click(within(outfits).getByRole('button', { name: 'Mark delayed' }));
    const days = within(outfits).getByLabelText('Delayed by (days)');
    await user.clear(days);
    await user.type(days, '0');
    expect(within(outfits).getByText('Enter 1 to 365 days.')).toBeInTheDocument();
    expect(within(outfits).getByRole('button', { name: 'Apply delay' })).toBeDisabled();
  });

  it('flags an event date that is too close as overdue/too late', async () => {
    const { user } = renderWithPlan({ eventDate: '2026-01-05' });
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getAllByText(/Overdue|Due date already passed/).length).toBeGreaterThan(0);
  });
});
