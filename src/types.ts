export type DayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type AuthProvider = 'naver' | 'kakao' | 'google' | 'apple';

export type UserRole = 'member' | 'admin';

export type TabId = 'home' | 'reserve' | 'notices' | 'alerts' | 'profile';

export type NotificationKey =
  | 'classSoon'
  | 'reservation'
  | 'notice'
  | 'attendance'
  | 'classChange'
  | 'rebook';

export interface DayOption {
  id: DayId;
  label: string;
  shortLabel: string;
}

export interface User {
  id: string;
  name: string;
  provider: AuthProvider;
  role: UserRole;
}

export interface ReservationPerson {
  userId: string;
  userName: string;
  createdAt: string;
}

export interface ClassSlot {
  id: string;
  day: DayId;
  hour: number;
  instructor: string;
  reservedBy: ReservationPerson | null;
  waitlist: ReservationPerson[];
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  author: string;
  createdAt: string;
  imageUri?: string;
}

export type NotificationPrefs = Record<NotificationKey, boolean>;
