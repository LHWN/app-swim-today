export type DayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type AuthProvider = 'email' | 'naver' | 'kakao' | 'google' | 'apple';

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
  id: string;
  label: string;
  shortLabel: string;
  caption?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  provider: AuthProvider;
  role: UserRole;
  passBalance: number;
}

export interface ReservationPerson {
  userId: string;
  userName: string;
  createdAt: string;
  fixedLessonId?: string | null;
  lessonCapacity?: number | null;
}

export interface FixedLesson {
  id: string;
  weekday: number;
  weekdayLabel: string;
  hour: number;
  minute: number;
  startMinutes: number;
  timeLabel: string;
  instructor: string;
  lessonCapacity: number;
}

export interface ClassSlot {
  id: string;
  date: string;
  dateLabel: string;
  shortDateLabel: string;
  weekdayLabel: string;
  hour: number;
  minute: number;
  startMinutes: number;
  startsAt: string;
  instructor: string;
  capacity: number;
  durationMinutes: number;
  isActive: boolean;
  fixedLessonIds: string[];
  fixedMembers: ReservationPerson[];
  absences: ReservationPerson[];
  substitutes: ReservationPerson[];
  openSeatCount: number;
  fixedLessonId: string | null;
  fixedMember: ReservationPerson | null;
  absence: ReservationPerson | null;
  substituteBy: ReservationPerson | null;
  reservedBy: ReservationPerson | null;
  waitlist: ReservationPerson[];
}

export type ReservationAction = 'substituteReserved' | 'substituteCanceled';

export type AbsenceAction = 'absenceCreated' | 'absenceCanceled';

export type LessonChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'canceled';

export type LessonAssignmentRequestType = 'extra_lesson' | 'free_swim';

export type LessonFeedbackMediaType = 'image' | 'video';

export type SpecialLessonRegistrationStatus = 'pending' | 'waitlisted' | 'approved' | 'rejected' | 'canceled';

export interface LessonChangeRequest {
  id: string;
  userId: string;
  userName: string;
  sourceSlotId: string;
  sourceStartsAt: string;
  sourceInstructor: string;
  targetSlotId: string;
  targetStartsAt: string;
  targetInstructor: string;
  status: LessonChangeRequestStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
}

export interface LessonAssignmentRequest {
  id: string;
  userId: string;
  userName: string;
  slotId: string;
  startsAt: string;
  instructor: string;
  requestType: LessonAssignmentRequestType;
  status: LessonChangeRequestStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
}

export interface LessonFeedback {
  id: string;
  slotId: string;
  userId: string;
  userName: string;
  startsAt: string;
  instructor: string;
  feedbackText: string;
  mediaPath: string | null;
  mediaType: LessonFeedbackMediaType | null;
  mediaUri?: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LessonFeedbackTarget {
  slotId: string;
  startsAt: string;
  instructor: string;
  durationMinutes: number;
  userId: string;
  userName: string;
  feedbackId: string | null;
  feedbackText: string | null;
  mediaPath: string | null;
  mediaType: LessonFeedbackMediaType | null;
  mediaUri?: string;
  feedbackCreatedAt: string | null;
  feedbackUpdatedAt: string | null;
}

export interface SpecialLesson {
  id: string;
  title: string;
  description: string;
  imagePath: string | null;
  imageUri?: string;
  startsAt: string;
  instructor: string;
  durationMinutes: number;
  capacity: number;
  isActive: boolean;
  applicationCount: number;
  approvedCount: number;
  myRegistrationId: string | null;
  myStatus: SpecialLessonRegistrationStatus | null;
  myQueuePosition: number | null;
  createdAt: string;
}

export interface SpecialLessonRegistration {
  id: string;
  specialLessonId: string;
  specialLessonTitle: string;
  startsAt: string;
  instructor: string;
  capacity: number;
  userId: string;
  userName: string;
  status: SpecialLessonRegistrationStatus;
  queuePosition: number;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
}

export interface MemberSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  passBalance: number;
  lessonCapacity: number;
  passTotalCount: number;
  passRemainingCount: number;
  fixedLessonCount: number;
  absenceCount: number;
  substituteReservationCount: number;
  reservedCount: number;
  waitlistCount: number;
  createdAt: string;
}

export interface PassTransaction {
  id: string;
  userId: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  reservationId: string | null;
  createdBy: string | null;
  createdAt: string;
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
