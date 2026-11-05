import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Repository } from '@/data/repository';
import type { Message, ThreadSummary } from '@/domain/types';
import { makeRepo, renderWithProviders, signInAs } from '@/features/home/testing';

import { ThreadScreen } from '../ThreadScreen';
import { ThreadsScreen } from '../ThreadsScreen';

let mockRepo: Repository;
jest.mock('@/data', () => ({ useRepo: () => mockRepo, getRepo: () => mockRepo, peekRepo: () => mockRepo }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));

const now = Date.now();
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();

const careTeam: ThreadSummary = {
  id: 'th-care',
  organizationId: 'org-1',
  childId: 'child-aarav',
  kind: 'care_team',
  title: 'Aarav · Care team',
  createdAt: iso(10_000),
  childName: 'Aarav Mehta',
  memberNames: ['Priya Sharma', 'Ms. Riya Menon', 'Kavya Iyer'],
  lastMessage: { body: 'See you on Monday!', senderName: 'Ms. Riya Menon', createdAt: iso(30) },
  unreadCount: 2,
};
const staffOnly: ThreadSummary = {
  ...careTeam,
  id: 'th-staff',
  kind: 'staff_only',
  title: 'Aarav · Staff only',
  memberNames: ['Ms. Riya Menon', 'Kavya Iyer'],
  lastMessage: { body: 'Plan for Monday', senderName: 'Kavya Iyer', createdAt: iso(60) },
  unreadCount: 0,
};

const msgs: Message[] = [
  { id: 'm1', threadId: 'th-care', senderId: 'user-riya', senderName: 'Ms. Riya Menon', senderRole: 'therapist', body: 'Aarav did well with picture cards today.', attachments: [], createdAt: iso(120), readBy: [] },
  { id: 'm2', threadId: 'th-care', senderId: 'user-parent', senderName: 'Priya Sharma', senderRole: 'parent', body: 'Thank you! We will practise at home.', attachments: [], createdAt: iso(60), readBy: ['Ms. Riya Menon'] },
];

beforeEach(() => mockPush.mockClear());

describe('ThreadsScreen', () => {
  it('shows segments for staff and filters staff-only threads', async () => {
    signInAs('therapist', { name: 'Ms. Riya Menon', userId: 'user-riya' });
    mockRepo = makeRepo({ messaging: { listThreads: async () => [staffOnly, careTeam] } });
    await renderWithProviders(<ThreadsScreen />);
    expect(screen.getByText('Aarav Mehta · Care team')).toBeTruthy();
    expect(screen.getByText('Aarav Mehta · Staff only')).toBeTruthy();
    expect(screen.getByText('With Priya Sharma, Kavya Iyer')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Staff only' }));
    expect(screen.queryByText('Aarav Mehta · Care team')).toBeNull();
    await fireEvent.press(screen.getByTestId('thread-th-staff'));
    expect(mockPush).toHaveBeenCalledWith('/messages/th-staff');
  });

  it('hides segments for parents and shows unread counts', async () => {
    signInAs('parent', { name: 'Priya Sharma', userId: 'user-parent', childIds: ['child-aarav'] });
    mockRepo = makeRepo({ messaging: { listThreads: async () => [careTeam] } });
    await renderWithProviders(<ThreadsScreen />);
    expect(screen.queryByTestId('thread-segments')).toBeNull();
    expect(screen.getByText('Aarav · Care team')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Ms. Riya Menon: See you on Monday!')).toBeTruthy();
  });
});

describe('ThreadScreen', () => {
  function setup(thread: ThreadSummary = careTeam) {
    const markRead = jest.fn(async () => undefined);
    const send = jest.fn(async (threadId: string, body: string) => ({
      id: 'm3',
      threadId,
      senderId: 'user-parent',
      senderName: 'Priya Sharma',
      senderRole: 'parent' as const,
      body,
      attachments: [],
      createdAt: new Date().toISOString(),
      readBy: [],
    }));
    mockRepo = makeRepo({
      messaging: { getThread: async () => thread, listMessages: async () => msgs, markRead, send, listThreads: async () => [thread], unreadCount: async () => 0 },
    });
    return { markRead, send };
  }

  beforeEach(() => signInAs('parent', { name: 'Priya Sharma', userId: 'user-parent', childIds: ['child-aarav'] }));

  it('shows bubbles, sender role, the care-team banner and a read receipt; marks read', async () => {
    const { markRead } = setup();
    await renderWithProviders(<ThreadScreen threadId="th-care" />);
    expect(screen.getByText('Aarav did well with picture cards today.')).toBeTruthy();
    expect(screen.getByText(/· Therapist/)).toBeTruthy();
    expect(screen.getByText("This conversation stays with Aarav's care team, even when staff change.")).toBeTruthy();
    expect(screen.getByTestId('receipt').props.children).toBe('Seen by Ms. Riya Menon');
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0);
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('th-care'));
  });

  it('labels staff-only threads clearly', async () => {
    setup(staffOnly);
    signInAs('therapist', { name: 'Ms. Riya Menon', userId: 'user-riya' });
    await renderWithProviders(<ThreadScreen threadId="th-staff" />);
    expect(screen.getByText("Staff only — parents can't see this")).toBeTruthy();
  });

  it('sends a message optimistically', async () => {
    const { send } = setup();
    await renderWithProviders(<ThreadScreen threadId="th-care" />);
    await fireEvent.changeText(screen.getByTestId('composer-input'), 'Can we move Friday to 11?');
    await fireEvent.press(screen.getByTestId('send'));
    expect(await screen.findByText('Can we move Friday to 11?')).toBeTruthy();
    await waitFor(() => expect(send).toHaveBeenCalledWith('th-care', 'Can we move Friday to 11?', undefined));
    expect(screen.getByTestId('composer-input').props.value).toBe('');
  });
});
