import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Repository } from '@/data/repository';
import type { Announcement } from '@/domain/types';
import { makeRepo, renderWithProviders, signInAs } from '@/features/home/testing';

import { announcementSchema, toAnnouncementInput } from '../announcementForm';
import { AnnouncementsScreen } from '../AnnouncementsScreen';
import { NewAnnouncementScreen } from '../NewAnnouncementScreen';

let mockRepo: Repository;
jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: () => mockBack(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}));
let mockConfirm = true;
jest.mock('@/ui/Feedback', () => {
  const actual = jest.requireActual('@/ui/Feedback');
  return { ...actual, confirm: jest.fn(async () => mockConfirm) };
});

const ann = (id: string, daysAgo: number, urgent = false): Announcement => ({
  id,
  organizationId: 'org-1',
  title: `Title ${id}`,
  body: `Body ${id}`,
  audience: 'all_parents',
  urgent,
  createdBy: 'u',
  createdByName: 'Kavya Iyer',
  createdAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
});

describe('announcement form', () => {
  it('requires a therapy group when that audience is chosen', () => {
    const res = announcementSchema.safeParse({ title: 'Diwali break', body: 'Closed 1–5 Nov.', audience: 'therapy_type', urgent: false });
    expect(res.success).toBe(false);
    expect(res.success ? [] : res.error.issues.map((i) => i.message)).toContain('messages:new.errors.group');
  });

  it('drops the group id unless a group is the audience', () => {
    expect(toAnnouncementInput({ title: ' Hi ', body: ' There ', audience: 'everyone', therapyTypeId: 'x', urgent: true })).toEqual({
      title: 'Hi',
      body: 'There',
      audience: 'everyone',
      therapyTypeId: undefined,
      urgent: true,
    });
  });
});

describe('AnnouncementsScreen', () => {
  it('pins recent urgent notices and lets coordinators write one', async () => {
    signInAs('coordinator', { name: 'Kavya Iyer' });
    mockRepo = makeRepo({
      messaging: { listAnnouncements: async () => [ann('old', 3), ann('urgent', 1, true), ann('new', 0)] },
      org: { listTherapyTypes: async () => [] },
    });
    await renderWithProviders(<AnnouncementsScreen />);
    const titles = screen.getAllByText(/^Title /).map((n) => n.props.children);
    expect(titles).toEqual(['Title urgent', 'Title new', 'Title old']);
    expect(screen.getByText('Urgent')).toBeTruthy();
    expect(screen.getAllByText(/All parents$/).length).toBe(3);
    await fireEvent.press(screen.getByTestId('new-announcement'));
    expect(mockPush).toHaveBeenCalledWith('/announcements/new');
  });

  it('parents see no New button and no audience line', async () => {
    signInAs('parent', { childIds: ['c1'] });
    mockRepo = makeRepo({ messaging: { listAnnouncements: async () => [ann('a', 0)] }, org: { listTherapyTypes: async () => [] } });
    await renderWithProviders(<AnnouncementsScreen />);
    expect(screen.queryByTestId('new-announcement')).toBeNull();
    expect(screen.queryByText(/All parents$/)).toBeNull();
  });
});

describe('NewAnnouncementScreen', () => {
  it('validates, previews, confirms and sends', async () => {
    signInAs('school_admin', { name: 'Meenakshi Rao' });
    const createAnnouncement = jest.fn(async (input: Pick<Announcement, 'title' | 'body' | 'audience' | 'urgent'>) => ({ ...ann('x', 0), ...input }));
    mockRepo = makeRepo({ messaging: { createAnnouncement }, org: { listTherapyTypes: async () => [] } });
    await renderWithProviders(<NewAnnouncementScreen />);

    await fireEvent.press(screen.getByTestId('send-announcement'));
    expect(await screen.findByText('Add a short title (at least 3 letters)')).toBeTruthy();
    expect(createAnnouncement).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('title'), 'Centre closed on Friday');
    await fireEvent.changeText(screen.getByTestId('body'), 'Because of the local election, the centre is closed on Friday.');
    await fireEvent.press(screen.getByRole('checkbox', { name: /Everyone/ }));
    expect(screen.getAllByText('Centre closed on Friday').length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByTestId('send-announcement'));
    await waitFor(() =>
      expect(createAnnouncement).toHaveBeenCalledWith({
        title: 'Centre closed on Friday',
        body: 'Because of the local election, the centre is closed on Friday.',
        audience: 'everyone',
        therapyTypeId: undefined,
        urgent: false,
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('is not available to therapists', async () => {
    signInAs('therapist');
    mockRepo = makeRepo({ org: { listTherapyTypes: async () => [] } });
    await renderWithProviders(<NewAnnouncementScreen />);
    expect(screen.getByText('Only coordinators and school admins can send announcements')).toBeTruthy();
  });
});
