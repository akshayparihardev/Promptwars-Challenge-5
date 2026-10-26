import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderApp, renderWithPlan } from './helpers';

afterEach(() => vi.unstubAllGlobals());

describe('create a plan and watch it react', () => {
  it('wedding plan -> change guests -> over-budget banner -> options -> apply', async () => {
    const { user } = renderApp();
    await user.type(screen.getByLabelText('Total budget (₹)'), '8 lakh');
    expect(screen.getByText(/Reads as ₹8,00,000/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Number of guests'), '200');
    fireEvent.change(screen.getByLabelText('Event date'), { target: { value: '2026-07-15' } });
    await user.click(screen.getByText('Make it yours (optional)'));
    await user.click(screen.getByLabelText('Catering'));
    await user.click(screen.getByRole('button', { name: 'Create my plan' }));

    expect(await screen.findByRole('heading', { name: 'Budget at a glance' })).toBeInTheDocument();
    expect(screen.getByTestId('over-budget-region')).toBeEmptyDOMElement();
    const catering = screen.getByRole('article', { name: 'Catering' });
    expect(within(catering).getByText('Estimate')).toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText('Number of guests')[0] as HTMLElement, { target: { value: '260' } });
    const banner = screen.getByTestId('over-budget-region');
    expect(banner).toHaveTextContent(/Over budget by ₹/);
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('heading', { name: 'Ways to close the gap' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Reduce guests by/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Apply' }).length).toBeLessThanOrEqual(3);

    await user.click(screen.getAllByRole('button', { name: 'Apply' })[0] as HTMLElement);
    expect(screen.getByText(/Apply "Reduce guests by/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, apply' }));
    await waitFor(() => expect(screen.getByTestId('over-budget-region')).toBeEmptyDOMElement());
  });

  it('shows friendly validation errors and creates nothing', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Create my plan' }));
    expect(screen.getByText('Enter your total budget, for example 8 lakh.')).toBeInTheDocument();
    expect(screen.getByText(/Enter a guest count/)).toBeInTheDocument();
    expect(screen.getByText('Pick the event date.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Total budget (₹)'), 'lots');
    expect(screen.getByText(/Couldn't read that amount/)).toBeInTheDocument();
  });

  it('rejects past dates', async () => {
    const { user } = renderApp();
    await user.type(screen.getByLabelText('Total budget (₹)'), '5 lakh');
    await user.type(screen.getByLabelText('Number of guests'), '50');
    fireEvent.change(screen.getByLabelText('Event date'), { target: { value: '2025-01-01' } });
    await user.click(screen.getByRole('button', { name: 'Create my plan' }));
    expect(screen.getByText('Pick today or a future date.')).toBeInTheDocument();
  });
});

describe('budget interactions', () => {
  it('number input redistributes, shows a diff toast, and lock protects a category', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    await user.click(screen.getByRole('button', { name: 'Lock Catering amount' }));
    expect(screen.getByRole('button', { name: 'Lock Catering amount' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Catering amount')).toBeDisabled();

    const photo = screen.getByLabelText('Photography & video amount (₹)');
    await user.clear(photo);
    await user.type(photo, '1.2 lakh');
    await user.tab();
    const toast = screen.getAllByRole('status').find((el) => /Photography & video \+/.test(el.textContent ?? ''));
    expect(toast).toBeDefined();
    expect(toast?.textContent).toMatch(/−₹/);
    expect(toast?.textContent).not.toMatch(/Catering/);
  });

  it('invalid amount shows an error without changing anything', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    const decor = screen.getByLabelText('Decor amount (₹)');
    await user.clear(decor);
    await user.type(decor, 'abc');
    await user.tab();
    expect(screen.getByText(/Couldn.t read that amount\./)).toBeInTheDocument();
  });

  it('explain options calls the AI and shows plain-language text; failure offers retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'AI_UNAVAILABLE' }, 503))
      .mockResolvedValueOnce(jsonResponse({ explanations: [{ optionId: 'reduce_guests', summary: 'Invite a few fewer people.', bestWhen: 'Your list is flexible.' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const { user } = renderWithPlan({ guests: 200 });
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    fireEvent.change(screen.getAllByLabelText('Number of guests')[0] as HTMLElement, { target: { value: '260' } });
    await user.click(screen.getByRole('button', { name: 'Explain these options' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/AI help is unavailable/);
    // engine still works while AI is down
    expect(screen.getByTestId('over-budget-region')).toHaveTextContent(/Over budget/);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Invite a few fewer people.')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).options.length).toBeGreaterThan(0);
  });
});

describe('AI intake', () => {
  it('fills the form from a description', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          occasion: 'kids_birthday',
          totalBudget: 150000,
          guests: 30,
          eventDate: '2026-03-10',
          vibe: 'dinosaurs',
          nonNegotiables: ['entertainment'],
          city: null,
        }),
      ),
    );
    const { user } = renderApp();
    await user.type(screen.getByLabelText('Event description'), 'Kids birthday, 30 guests, 1.5 lakh');
    await user.click(screen.getByRole('button', { name: 'Fill form from description' }));
    expect(await screen.findByText(/Filled occasion, budget, guests, date, style, priorities/)).toBeInTheDocument();
    expect(screen.getByLabelText('Occasion')).toHaveValue('kids_birthday');
    expect(screen.getByLabelText('Number of guests')).toHaveValue(30);
    expect(screen.getByLabelText('Total budget (₹)')).toHaveValue('150000');
  });
});

describe('vendors', () => {
  const quote = {
    vendorName: 'Shree Caterers',
    category: 'catering',
    totalPrice: null,
    pricePerPlate: 1500,
    guestMinimum: 250,
    overtimeFeePerHour: null,
    taxIncluded: null,
    advancePercent: null,
    inclusions: [],
    exclusions: [],
    cancellationPolicy: null,
  };

  it('analyze -> flags -> copy inquiry -> accept marks category verified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(quote)));
    const { user } = renderWithPlan();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(screen.getByRole('tab', { name: 'Vendors' }));
    await user.type(await screen.findByLabelText('Quote text'), 'Per plate 1500, min 250 plates');
    await user.click(screen.getByRole('button', { name: 'Analyze quote' }));
    const result = await screen.findByTestId('quote-result');
    expect(result).toHaveTextContent(/Vendor minimum is 250 guests/);
    expect(result).toHaveTextContent(/GST\/tax is not mentioned/);
    expect(result).toHaveTextContent(/over your Catering budget/);

    await user.click(screen.getByRole('button', { name: 'Copy inquiry message' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Is GST/tax included'));
    expect(await screen.findByText(/Message copied/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept quote' }));
    expect(await screen.findByText(/Quote accepted/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Side-by-side quotes for Catering/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Accepted/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: 'Budget' }));
    expect(within(screen.getByRole('article', { name: 'Catering' })).getByText('Verified quote')).toBeInTheDocument();
  });

  it('shows a retry when quote extraction fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'AI_RESPONSE_INVALID' }, 502)));
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Vendors' }));
    await user.type(await screen.findByLabelText('Quote text'), 'some quote');
    await user.click(screen.getByRole('button', { name: 'Analyze quote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not trust/);
  });
});

describe('header and ideas', () => {
  it('reset needs confirmation', async () => {
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText(/Reset the whole plan/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, reset' }));
    expect(screen.getByRole('button', { name: 'Create my plan' })).toBeInTheDocument();
  });

  it('shows readiness and share-link fallback', async () => {
    const { user } = renderWithPlan();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true });
    expect(within(screen.getByRole('banner')).getByText(/Plan readiness 0%/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    expect(((await screen.findByLabelText('Copy this link')) as HTMLInputElement).value).toContain('#plan=');
  });

  it('ideas panel is labelled as AI with no prices and can retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ themes: [{ title: 'Marigold Mehfil', description: 'Warm florals.' }], activities: ['Antakshari'], foodStyle: ['Chaat counter'], personalTouches: [] }),
      ),
    );
    const { user } = renderWithPlan();
    await user.click(screen.getByRole('tab', { name: 'Plan setup' }));
    expect(await screen.findByText(/AI suggestions · no prices/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get ideas' }));
    expect(await screen.findByText('Marigold Mehfil')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate ideas' })).toBeInTheDocument();
  });
});

describe('share-link notices', () => {
  it('shows a friendly message for a bad link', () => {
    renderApp(null, { kind: 'bad_link', message: 'That share link could not be opened.' });
    expect(screen.getByText(/could not be opened/)).toBeInTheDocument();
  });
});
