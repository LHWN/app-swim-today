import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ScrollViewProps } from 'react-native';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { colors, radius, shadows, spacing, typography } from './src/theme';
import {
  addDays,
  CURRENT_SCHEDULE_VERSION,
  createInitialSlots,
  defaultPrefs,
  formatSlotHour,
  getDateKey,
  getDateOptions,
  getTodayKey,
  initialNotices,
  sortSlotsByStartsAt
} from './src/data';
import {
  adjustMemberPass,
  applySpecialLesson,
  assignLessonReservation,
  cancelLessonAbsenceRequest,
  cancelInstructorLessonTime,
  cancelStoreOrder,
  cancelLessonAssignmentRequest,
  cancelLessonChangeRequest,
  cancelFixedLesson,
  cancelFixedLessonAttendance,
  cancelLessonReservation,
  cancelLessonSlot,
  cancelMyLessonReservation,
  cancelSpecialLessonRegistration,
  createMemberRequest,
  createSpecialLesson,
  createLessonAssignmentRequest,
  createLessonSlot,
  createLessonChangeRequest,
  createStoreOrder,
  createStoreProduct,
  CreateMemberRequestInput,
  CreateSpecialLessonInput,
  CreateStoreProductInput,
  DatabaseError,
  deleteAccount,
  deleteNotice,
  getCurrentUser,
  getLessonAbsenceRequests,
  getLessonAssignmentRequests,
  getLessonChangeRequests,
  getLessonFeedbacks,
  getLessonFeedbackTargets,
  getInstructorLessonTimes,
  getMemberRequests,
  getMemberById,
  getMemberSummaries,
  getMyFixedLessons,
  getNoticesFromDatabase,
  getPastSlotsFromDatabase,
  getSpecialLessonRegistrations,
  getSpecialLessons,
  getStoreOrders,
  getStoreProducts,
  publishLessonFeedback,
  getSlotsFromDatabase,
  publishNotice,
  PublishLessonFeedbackInput,
  reviewLessonAssignmentRequest,
  reviewLessonAbsenceRequest,
  reviewLessonChangeRequest,
  reviewMemberRequest,
  reviewSpecialLessonRegistration,
  reviewStoreOrder,
  saveInstructorLessonTime,
  SaveInstructorLessonTimeInput,
  signIn,
  signOut,
  signUp,
  SignUpInput,
  toggleFixedLessonAbsence,
  updateFixedLesson,
  updateLessonSlotDetails,
  updateLessonSlotInstructor,
  updateMemberPassProduct,
  updateNotice,
  updateSpecialLesson,
  UpdateNoticeInput,
  UpdateSpecialLessonInput,
  upsertFixedLesson
} from './src/database';
import { sendLocalNotification } from './src/notifications';
import {
  AbsenceAction,
  AuthProvider,
  ClassSlot,
  FixedLesson,
  LessonAbsenceRequest,
  LessonAssignmentRequest,
  LessonAssignmentRequestType,
  LessonChangeRequest,
  LessonFeedback,
  LessonFeedbackMediaType,
  LessonFeedbackTarget,
  InstructorLessonTime,
  MemberRequest,
  MemberRequestStatus,
  MemberSummary,
  NotificationKey,
  NotificationPrefs,
  Notice,
  ReservationPerson,
  SpecialLesson,
  SpecialLessonRegistration,
  SpecialLessonRegistrationStatus,
  StoreOrder,
  StoreProduct,
  TabId,
  User,
  UserRole,
  DayOption
} from './src/types';

const LEGACY_STORAGE_KEY = 'oneuldo-swim-state-v3';
const SETTINGS_STORAGE_KEY = 'oneuldo-swim-settings-v1';
const CONTACT_PHONE = '010-4698-3505';
// const PRIVACY_POLICY_URL = 'https://github.com/LHWN/app-swim-today/blob/main/docs/privacy-policy.md';
// const ACCOUNT_DELETION_URL = 'https://github.com/LHWN/app-swim-today/blob/main/docs/account-deletion.md';
const PRIVACY_POLICY_URL = 'https://lhwn.github.io/app-swim-today/privacy-policy.html';
const ACCOUNT_DELETION_URL = 'https://lhwn.github.io/app-swim-today/account-deletion.html';
const DEFAULT_PASS_BALANCE = 12;
const POOL_OPEN_HOUR = 5;
const POOL_CLOSE_HOUR = 22;
const REQUESTABLE_WINDOW_DAYS = 30;
const REQUESTABLE_WINDOW_MS = REQUESTABLE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const ADMIN_PAST_LESSON_DAYS = 14;
const ADMIN_PAST_LESSON_WINDOW_MS = ADMIN_PAST_LESSON_DAYS * 24 * 60 * 60 * 1000;
const TOOLTIP_HORIZONTAL_MARGIN = 16;
const TOOLTIP_MAX_WIDTH = 280;
const brandLogoImage = require('./logo.png');
const logoOnNavyImage = require('./logo-on-navy.png');
const keyboardAvoidingBehavior = Platform.OS === 'ios' ? 'padding' : undefined;
const defaultKeyboardDismissMode = Platform.OS === 'ios' ? 'interactive' : 'on-drag';
const isDevelopmentBuild = typeof __DEV__ === 'boolean' ? __DEV__ : false;
const testAdminEmail = process.env.EXPO_PUBLIC_TEST_ADMIN_EMAIL?.trim() ?? '';
const testAdminPassword = process.env.EXPO_PUBLIC_TEST_ADMIN_PASSWORD?.trim() ?? '';
const testMemberEmail = process.env.EXPO_PUBLIC_TEST_MEMBER_EMAIL?.trim() ?? '';
const testMemberPassword = process.env.EXPO_PUBLIC_TEST_MEMBER_PASSWORD?.trim() ?? '';
const weekdayOptions = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 7, label: '일' }
];
const lessonTimeOptions = Array.from({ length: (POOL_CLOSE_HOUR - POOL_OPEN_HOUR) * 2 + 1 }, (_, index) => {
  const totalMinutes = POOL_OPEN_HOUR * 60 + index * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  return {
    value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    hour,
    minute
  };
});

const FONT = {
  light: 'NanumSquareL',
  regular: 'NanumSquareR',
  bold: 'NanumSquareB',
  extraBold: 'NanumSquareEB'
};

const type = {
  light: { fontFamily: FONT.light },
  regular: { fontFamily: FONT.regular },
  bold: { fontFamily: FONT.bold },
  extraBold: { fontFamily: FONT.extraBold }
};

const providerMeta: Record<AuthProvider, { label: string; color: string; textColor: string }> = {
  email: { label: '이메일', color: colors.blue900, textColor: colors.white },
  naver: { label: '네이버로 시작', color: '#03C75A', textColor: '#FFFFFF' },
  kakao: { label: '카카오로 시작', color: '#FEE500', textColor: '#181600' },
  google: { label: 'Google로 시작', color: '#FFFFFF', textColor: '#263238' },
  apple: { label: 'Apple로 시작', color: '#111111', textColor: '#FFFFFF' }
};

const notificationLabels: Record<NotificationKey, { title: string; icon: keyof typeof Feather.glyphMap }> = {
  classSoon: { title: '수업 전', icon: 'clock' },
  reservation: { title: '예약', icon: 'check-circle' },
  notice: { title: '공지', icon: 'bell' },
  attendance: { title: '출석', icon: 'user-check' },
  classChange: { title: '변경', icon: 'refresh-cw' },
  rebook: { title: '재예약', icon: 'repeat' }
};

const tabs: Array<{ id: TabId; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'reserve', label: '수업', icon: 'calendar' },
  { id: 'notices', label: '공지', icon: 'bell' },
  { id: 'profile', label: '내정보', icon: 'user' }
];

type TestAccountId = 'admin' | 'member';

interface TestAccount {
  id: TestAccountId;
  label: string;
  email: string;
  password: string;
  icon: keyof typeof Feather.glyphMap;
}

const rawTestAccounts: TestAccount[] = [
  {
    id: 'admin',
    label: '관리자',
    email: testAdminEmail,
    password: testAdminPassword,
    icon: 'shield'
  },
  {
    id: 'member',
    label: '회원',
    email: testMemberEmail,
    password: testMemberPassword,
    icon: 'user'
  }
];
const configuredTestAccounts = isDevelopmentBuild
  ? rawTestAccounts.filter((account) => account.email.length > 0 && account.password.length > 0)
  : [];

interface HomeMenuOption<T extends string> {
  id: T;
  label: string;
  description?: string;
  icon: keyof typeof Feather.glyphMap;
  count?: number;
}

type MemberHomeSection = 'lessons' | 'requests' | 'special' | 'store' | 'feedback';
type AdminHomeSection = 'requests' | 'members' | 'instructors' | 'content' | 'store';
type MemberDetailView = 'pastLessons' | 'lessonRequests' | 'memberRequests' | 'storeOrders';
type ProfileDetailView = 'basicInfo' | 'memberRequests';

function isPastDate(value?: string | null) {
  return Boolean(value && new Date(value).getTime() < Date.now());
}

function formatFixedLessonSummary(fixedLessons: FixedLesson[]) {
  if (fixedLessons.length === 0) {
    return '고정수업 미설정';
  }

  const visibleLessons = fixedLessons.slice(0, 2).map((lesson) => `${lesson.weekdayLabel} ${lesson.timeLabel}`);
  const hiddenCount = fixedLessons.length - visibleLessons.length;

  return hiddenCount > 0 ? `${visibleLessons.join(' · ')} 외 ${hiddenCount}개` : visibleLessons.join(' · ');
}

function KeyboardAwareScrollView({
  children,
  keyboardDismissMode,
  keyboardShouldPersistTaps,
  automaticallyAdjustKeyboardInsets,
  ...props
}: ScrollViewProps) {
  return (
    <ScrollView
      keyboardDismissMode={keyboardDismissMode ?? defaultKeyboardDismissMode}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
      automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets ?? Platform.OS === 'ios'}
      {...props}
    >
      {children}
    </ScrollView>
  );
}

function WeekdaySelector({ value, onChange }: { value: number; onChange: (weekday: number) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactSelector}>
      {weekdayOptions.map((option) => {
        const selected = value === option.value;

        return (
          <Pressable
            key={option.value}
            style={[styles.selectorChip, selected && styles.selectorChipActive]}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
          >
            <Text style={[styles.selectorChipText, selected && styles.selectorChipTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function LessonTimeSelector({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactSelector}>
      {lessonTimeOptions.map((option) => {
        const selected = value === option.value;

        return (
          <Pressable
            key={option.value}
            style={[styles.timeSelectorChip, selected && styles.selectorChipActive]}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
          >
            <Text style={[styles.selectorChipText, selected && styles.selectorChipTextActive]}>{option.value}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function DropdownSelect({
  value,
  options,
  onChange,
  placeholder = '선택'
}: {
  value: string;
  options: Array<{ value: string; label: string; meta?: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.dropdownWrap}>
      <Pressable style={styles.dropdownButton} onPress={() => setOpen((current) => !current)} accessibilityRole="button">
        <Text style={selected ? styles.dropdownButtonText : styles.dropdownPlaceholder}>{selected?.label ?? placeholder}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.blue700} />
      </Pressable>
      {open ? (
        <View style={styles.dropdownMenu}>
          <ScrollView nestedScrollEnabled style={styles.dropdownMenuScroll}>
            {options.map((option) => {
              const active = option.value === value;

              return (
                <Pressable
                  key={option.value}
                  style={[styles.dropdownOption, active && styles.dropdownOptionActive]}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}>{option.label}</Text>
                  {option.meta ? <Text style={[styles.dropdownOptionMeta, active && styles.dropdownOptionMetaActive]}>{option.meta}</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function DurationSelector({ value, onChange }: { value: number; onChange: (duration: number) => void }) {
  return (
    <View style={styles.lessonDurationSelector}>
      {[30, 60].map((duration) => {
        const selected = value === duration;

        return (
          <Pressable
            key={duration}
            style={[styles.lessonDurationButton, selected && styles.lessonDurationButtonActive]}
            onPress={() => onChange(duration)}
            accessibilityRole="button"
          >
            <Text style={[styles.lessonDurationButtonText, selected && styles.lessonDurationButtonTextActive]}>
              {duration === 30 ? '30분' : '1시간'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MultiWeekdaySelector({ values, onChange }: { values: number[]; onChange: (weekdays: number[]) => void }) {
  function toggle(value: number) {
    const nextValues = values.includes(value) ? values.filter((item) => item !== value) : [...values, value].sort((a, b) => a - b);
    onChange(nextValues.length > 0 ? nextValues : [value]);
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactSelector}>
      {weekdayOptions.map((option) => {
        const selected = values.includes(option.value);

        return (
          <Pressable
            key={option.value}
            style={[styles.selectorChip, selected && styles.selectorChipActive]}
            onPress={() => toggle(option.value)}
            accessibilityRole="button"
          >
            <Text style={[styles.selectorChipText, selected && styles.selectorChipTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function MultiLessonTimeSelector({ values, onChange }: { values: string[]; onChange: (times: string[]) => void }) {
  function toggle(value: string) {
    const nextValues = values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value].sort((a, b) => a.localeCompare(b));
    onChange(nextValues.length > 0 ? nextValues : [value]);
  }

  return (
    <View style={styles.multiTimeGrid}>
      {lessonTimeOptions.map((option) => {
        const selected = values.includes(option.value);

        return (
          <Pressable
            key={option.value}
            style={[styles.multiTimeButton, selected && styles.selectorChipActive]}
            onPress={() => toggle(option.value)}
            accessibilityRole="button"
          >
            <Text style={[styles.selectorChipText, selected && styles.selectorChipTextActive]}>{option.value}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface PersistedState {
  scheduleVersion?: number;
  user?: User | null;
  slots?: ClassSlot[];
  notices?: Notice[];
  prefs?: NotificationPrefs;
  passBalance?: number;
  passBalances?: Record<string, number>;
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/[^\d]/g, '');

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return value || '-';
}

function formatNoticeDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function mergeNoticesWithCurrentDefaults(savedNotices?: Notice[]) {
  if (!savedNotices?.length) {
    return initialNotices;
  }

  const defaultsById = new Map(initialNotices.map((notice) => [notice.id, notice]));
  const reservationNotice = defaultsById.get('notice-small-lesson') ?? initialNotices[1];
  const migratedNotices = savedNotices.map((notice) => {
    const defaultNotice = defaultsById.get(notice.id);
    const hasOldLessonCopy = /1:1|1:2|1:3|소수 정원/.test(`${notice.title} ${notice.body}`);

    if (hasOldLessonCopy) {
      return reservationNotice;
    }

    return defaultNotice && notice.id === 'notice-small-lesson' ? defaultNotice : notice;
  });
  const uniqueNotices = migratedNotices.filter(
    (notice, index, allNotices) => allNotices.findIndex((currentNotice) => currentNotice.id === notice.id) === index
  );
  const savedIds = new Set(uniqueNotices.map((notice) => notice.id));
  const missingDefaults = initialNotices.filter((notice) => !savedIds.has(notice.id));

  return [...uniqueNotices, ...missingDefaults];
}

async function callContact() {
  const phoneUrl = `tel:${CONTACT_PHONE.replaceAll('-', '')}`;
  const canOpen = await Linking.canOpenURL(phoneUrl);

  if (!canOpen) {
    Alert.alert('문의 전화', CONTACT_PHONE);
    return;
  }

  await Linking.openURL(phoneUrl);
}

function isReservedByUser(slot: ClassSlot, user?: User | null) {
  return Boolean(user && slot.substitutes.some((person) => person.userId === user.id));
}

function isFixedLessonForUser(slot: ClassSlot, user?: User | null) {
  return Boolean(user && slot.fixedMembers.some((person) => person.userId === user.id));
}

function isAbsentByUser(slot: ClassSlot, user?: User | null) {
  return Boolean(user && slot.absences.some((person) => person.userId === user.id));
}

function isOpenSubstituteSlot(slot: ClassSlot) {
  return slot.openSeatCount > 0;
}

function hasAnyAssignedMember(slot: ClassSlot) {
  return slot.fixedMembers.length > 0 || slot.substitutes.length > 0;
}

function isUnassignedOpenLesson(slot: ClassSlot) {
  return slot.isActive && !hasAnyAssignedMember(slot);
}

function isPoolOperatingSlot(slot: ClassSlot) {
  return slot.hour >= POOL_OPEN_HOUR && slot.hour <= POOL_CLOSE_HOUR;
}

function isFreeSwimCandidateSlot(slot: ClassSlot) {
  return isPoolOperatingSlot(slot) && !slot.isActive && !hasAnyAssignedMember(slot);
}

function isVisibleLessonSlot(slot: ClassSlot, user: User) {
  if (user.role === 'admin') {
    return Boolean(slot.fixedLessonIds.length > 0 || slot.absences.length > 0 || slot.substitutes.length > 0);
  }

  return (
    isFixedLessonForUser(slot, user) ||
    isReservedByUser(slot, user) ||
    isUnassignedOpenLesson(slot) ||
    isFreeSwimCandidateSlot(slot)
  );
}

function isUpcomingSlot(slot: ClassSlot) {
  return new Date(slot.startsAt).getTime() >= Date.now();
}

function isWithinRequestableWindow(slot: ClassSlot) {
  const startsAt = new Date(slot.startsAt).getTime();
  const now = Date.now();

  return startsAt >= now && startsAt <= now + REQUESTABLE_WINDOW_MS;
}

function isWithinAdminPastLessonWindow(slot: ClassSlot) {
  const startsAt = new Date(slot.startsAt).getTime();
  const now = Date.now();

  return startsAt < now && startsAt >= now - ADMIN_PAST_LESSON_WINDOW_MS;
}

function getAdminLessonTabSlots(currentSlots: ClassSlot[], pastSlots: ClassSlot[]) {
  const slotsById = new Map<string, ClassSlot>();

  [...pastSlots.filter(isWithinAdminPastLessonWindow), ...currentSlots].forEach((slot) => {
    slotsById.set(slot.id, slot);
  });

  return Array.from(slotsById.values()).sort(sortSlotsByStartsAt);
}

function formatLessonCapacity(capacity: number) {
  return `1:${capacity}`;
}

function formatLessonDuration(durationMinutes: number) {
  return durationMinutes === 30 ? '30분' : '1시간';
}

function parseLessonTimeInput(value: string) {
  const trimmed = value.trim();
  const match = /^(\d{1,2})(?::?([0-5]\d))?$/.exec(trimmed);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);

  if (hour < 0 || hour > 23 || ![0, 30].includes(minute)) {
    return null;
  }

  return { hour, minute };
}

function formatSlotBrief(startsAt?: string) {
  if (!startsAt) {
    return '다음 수업';
  }

  const date = new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date(startsAt));

  return `${date} ${formatSlotHour(startsAt)}`;
}

function getWeekStartKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isoWeekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (isoWeekday - 1));

  return date.toISOString().slice(0, 10);
}

function formatDateKeyShort(dateKey: string) {
  const [, month, day] = dateKey.split('-').map(Number);

  return `${month}/${day}`;
}

function formatWeekRange(startDateKey: string) {
  return `${formatDateKeyShort(startDateKey)}-${formatDateKeyShort(addDays(startDateKey, 6))}`;
}

function formatRequestStatus(status: LessonChangeRequest['status']) {
  if (status === 'approved') {
    return '승인';
  }

  if (status === 'rejected') {
    return '거절';
  }

  if (status === 'canceled') {
    return '취소';
  }

  return '대기';
}

function formatAssignmentRequestType(type: LessonAssignmentRequestType) {
  return type === 'free_swim' ? '자유수영' : '추가 수업';
}

function getFeedbackTargetKeyFor(slotId: string, userId: string) {
  return `${slotId}:${userId}`;
}

function getFeedbackTargetKey(target?: LessonFeedbackTarget | null) {
  return target ? getFeedbackTargetKeyFor(target.slotId, target.userId) : '';
}

function canWriteLessonFeedbackForPerson(slot: ClassSlot, person: ReservationPerson, target?: LessonFeedbackTarget | null) {
  return Boolean(person.userId) && (Boolean(target) || (slot.isActive && isPastDate(slot.startsAt)));
}

function createLessonFeedbackTargetFromPerson(slot: ClassSlot, person: ReservationPerson, target?: LessonFeedbackTarget | null): LessonFeedbackTarget {
  if (target) {
    return target;
  }

  return {
    slotId: slot.id,
    startsAt: slot.startsAt,
    instructor: slot.instructor,
    durationMinutes: person.durationMinutes ?? slot.durationMinutes,
    userId: person.userId,
    userName: person.userName,
    feedbackId: null,
    feedbackText: null,
    mediaPath: null,
    mediaType: null,
    feedbackCreatedAt: null,
    feedbackUpdatedAt: null
  };
}

function buildKoreaDateTimeIso(dateText: string, timeText: string) {
  const [year, month, day] = dateText.split('-').map(Number);
  const timeParts = parseLessonTimeInput(timeText);

  if (!year || !month || !day || !timeParts) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, timeParts.hour - 9, timeParts.minute, 0)).toISOString();
}

function formatSpecialLessonStatus(status?: SpecialLessonRegistrationStatus | null) {
  if (status === 'approved') {
    return '참여 확정';
  }

  if (status === 'waitlisted') {
    return '대기';
  }

  if (status === 'pending') {
    return '신청완료';
  }

  if (status === 'rejected') {
    return '미승인';
  }

  if (status === 'canceled') {
    return '취소';
  }

  return '신청 가능';
}

function formatMemberRequestStatus(status: MemberRequestStatus) {
  if (status === 'reviewing') {
    return '처리중';
  }

  if (status === 'resolved') {
    return '해결';
  }

  if (status === 'rejected') {
    return '거절';
  }

  return '접수';
}

function formatStoreOrderStatus(status: StoreOrder['status']) {
  if (status === 'confirmed') {
    return '구매확정';
  }

  if (status === 'canceled') {
    return '취소';
  }

  return '승인대기';
}

function formatWon(amount: number) {
  return `${amount.toLocaleString('ko-KR')}원`;
}

async function openFeedbackMedia(uri: string) {
  const canOpen = await Linking.canOpenURL(uri);

  if (!canOpen) {
    Alert.alert('첨부 파일', '첨부 파일을 열 수 없습니다.');
    return;
  }

  await Linking.openURL(uri);
}

async function openExternalUrl(url: string, fallbackTitle: string) {
  const canOpen = await Linking.canOpenURL(url);

  if (!canOpen) {
    Alert.alert(fallbackTitle, url);
    return;
  }

  await Linking.openURL(url);
}

async function notifyAssignmentRequestChanges(
  previousRequests: LessonAssignmentRequest[],
  nextRequests: LessonAssignmentRequest[],
  currentUser: User
) {
  const previousById = new Map(previousRequests.map((request) => [request.id, request]));

  if (currentUser.role === 'admin') {
    const newPendingRequests = nextRequests.filter((request) => request.status === 'pending' && !previousById.has(request.id));

    if (newPendingRequests.length === 0) {
      return;
    }

    const firstRequest = newPendingRequests[0];
    const suffix = newPendingRequests.length > 1 ? ` 외 ${newPendingRequests.length - 1}건` : '';
    await sendLocalNotification(
      '새 수업 신청',
      `${firstRequest.userName} 회원의 ${formatAssignmentRequestType(firstRequest.requestType)} 신청${suffix}이 들어왔습니다.`
    );
    return;
  }

  const completedRequest = nextRequests.find((request) => {
    const previous = previousById.get(request.id);

    return previous?.status === 'pending' && request.status !== 'pending';
  });

  if (!completedRequest) {
    return;
  }

  const requestLabel = formatAssignmentRequestType(completedRequest.requestType);
  const slotLabel = formatSlotBrief(completedRequest.startsAt);
  const commentSuffix = completedRequest.reviewComment ? ` · ${completedRequest.reviewComment}` : '';

  if (completedRequest.status === 'approved') {
    await sendLocalNotification('배정 완료', `${slotLabel} ${requestLabel} 신청이 승인되었습니다.${commentSuffix}`);
    return;
  }

  if (completedRequest.status === 'rejected') {
    await sendLocalNotification('신청 거절', `${slotLabel} ${requestLabel} 신청이 거절되었습니다.${commentSuffix}`);
  }
}

async function notifyLessonFeedbackChanges(
  previousFeedbacks: LessonFeedback[],
  nextFeedbacks: LessonFeedback[],
  currentUser: User
) {
  if (currentUser.role !== 'member') {
    return;
  }

  const previousById = new Map(previousFeedbacks.map((feedback) => [feedback.id, feedback]));
  const newMediaFeedback = nextFeedbacks.find((feedback) => {
    if (!feedback.mediaPath) {
      return false;
    }

    const previous = previousById.get(feedback.id);

    return !previous || previous.mediaPath !== feedback.mediaPath;
  });

  if (!newMediaFeedback) {
    return;
  }

  await sendLocalNotification(
    '새 수업 피드백',
    `${formatSlotBrief(newMediaFeedback.startsAt)} 수업 사진/동영상이 등록되었습니다.`
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    [FONT.light]: require('./fonts/NanumSquareL.ttf'),
    [FONT.regular]: require('./fonts/NanumSquareR.ttf'),
    [FONT.bold]: require('./fonts/NanumSquareB.ttf'),
    [FONT.extraBold]: require('./fonts/NanumSquareEB.ttf')
  });
  const [hydrated, setHydrated] = useState(false);
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [selectedDate, setSelectedDate] = useState(getTodayKey());
  const [slots, setSlots] = useState<ClassSlot[]>(createInitialSlots);
  const [pastSlots, setPastSlots] = useState<ClassSlot[]>([]);
  const [notices, setNotices] = useState<Notice[]>(initialNotices);
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [passBalance, setPassBalance] = useState(DEFAULT_PASS_BALANCE);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [fixedLessons, setFixedLessons] = useState<FixedLesson[]>([]);
  const [changeRequests, setChangeRequests] = useState<LessonChangeRequest[]>([]);
  const [absenceRequests, setAbsenceRequests] = useState<LessonAbsenceRequest[]>([]);
  const [assignmentRequests, setAssignmentRequests] = useState<LessonAssignmentRequest[]>([]);
  const [lessonFeedbacks, setLessonFeedbacks] = useState<LessonFeedback[]>([]);
  const [lessonFeedbackTargets, setLessonFeedbackTargets] = useState<LessonFeedbackTarget[]>([]);
  const [instructorLessonTimes, setInstructorLessonTimes] = useState<InstructorLessonTime[]>([]);
  const [specialLessons, setSpecialLessons] = useState<SpecialLesson[]>([]);
  const [specialLessonRegistrations, setSpecialLessonRegistrations] = useState<SpecialLessonRegistration[]>([]);
  const [memberRequests, setMemberRequests] = useState<MemberRequest[]>([]);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [storeOrders, setStoreOrders] = useState<StoreOrder[]>([]);
  const assignmentRequestsRef = useRef<LessonAssignmentRequest[]>([]);
  const lessonFeedbacksRef = useRef<LessonFeedback[]>([]);
  const pollingRefreshRef = useRef(false);

  useEffect(() => {
    async function hydrate() {
      try {
        const [settingsRaw, legacyRaw] = await Promise.all([
          AsyncStorage.getItem(SETTINGS_STORAGE_KEY),
          AsyncStorage.getItem(LEGACY_STORAGE_KEY)
        ]);
        const parsed = JSON.parse(settingsRaw ?? legacyRaw ?? '{}') as PersistedState;
        const savedUser = await getCurrentUser();

        setNotices(mergeNoticesWithCurrentDefaults(parsed.notices));
        setPrefs({ ...defaultPrefs, ...parsed.prefs });

        if (savedUser) {
          setUser(savedUser);
          const [
            nextSlots,
            nextPastSlots,
            nextNotices,
            nextFixedLessons,
            nextChangeRequests,
            nextAbsenceRequests,
            nextAssignmentRequests,
            nextFeedbacks,
            nextFeedbackTargets,
            nextInstructorLessonTimes,
            nextSpecialLessons,
            nextSpecialLessonRegistrations,
            nextMemberRequests,
            nextStoreProducts,
            nextStoreOrders
          ] = await Promise.all([
            getSlotsFromDatabase(),
            getPastSlotsFromDatabase(),
            getNoticesFromDatabase(),
            savedUser.role === 'member' ? getMyFixedLessons() : Promise.resolve([]),
            getLessonChangeRequests(),
            getLessonAbsenceRequests(),
            getLessonAssignmentRequests(),
            getLessonFeedbacks(),
            savedUser.role === 'admin' ? getLessonFeedbackTargets() : Promise.resolve([]),
            savedUser.role === 'admin' ? getInstructorLessonTimes() : Promise.resolve([]),
            getSpecialLessons(),
            getSpecialLessonRegistrations(),
            getMemberRequests(),
            getStoreProducts(),
            getStoreOrders()
          ]);
          setSlots(nextSlots);
          setPastSlots(nextPastSlots);
          setNotices(nextNotices.length > 0 ? nextNotices : initialNotices);
          setFixedLessons(nextFixedLessons);
          setChangeRequests(nextChangeRequests);
          setAbsenceRequests(nextAbsenceRequests);
          setAssignmentRequests(nextAssignmentRequests);
          setLessonFeedbacks(nextFeedbacks);
          lessonFeedbacksRef.current = nextFeedbacks;
          setLessonFeedbackTargets(nextFeedbackTargets);
          setInstructorLessonTimes(nextInstructorLessonTimes);
          setSpecialLessons(nextSpecialLessons);
          setSpecialLessonRegistrations(nextSpecialLessonRegistrations);
          setMemberRequests(nextMemberRequests);
          setStoreProducts(nextStoreProducts);
          setStoreOrders(nextStoreOrders);
          setPassBalance(savedUser.passBalance);
          setMembers(savedUser.role === 'admin' ? await getMemberSummaries() : []);
        }
      } catch (error) {
        if (error instanceof DatabaseError && error.code === 'CONFIG') {
          setNotices(initialNotices);
          setPrefs(defaultPrefs);
          return;
        }

        const message = error instanceof Error ? error.message : '원인을 확인할 수 없습니다.';
        Alert.alert('저장된 데이터를 불러오지 못했습니다.', message);
      } finally {
        setHydrated(true);
      }
    }

    hydrate();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLaunchScreen(false);
    }, 1400);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const state: PersistedState = { scheduleVersion: CURRENT_SCHEDULE_VERSION, prefs };
    AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state)).catch(() => {
      Alert.alert('변경 내용을 저장하지 못했습니다.');
    });
  }, [hydrated, prefs]);

  useEffect(() => {
    assignmentRequestsRef.current = assignmentRequests;
  }, [assignmentRequests]);

  useEffect(() => {
    lessonFeedbacksRef.current = lessonFeedbacks;
  }, [lessonFeedbacks]);

  useEffect(() => {
    if (!hydrated || !user) {
      return;
    }

    const refresh = async () => {
      if (pollingRefreshRef.current) {
        return;
      }

      try {
        pollingRefreshRef.current = true;
        await refreshDatabaseState(user, { resetSelectedDate: false, notifyAssignmentChanges: true });
      } catch {
        // Background refresh should not interrupt the current screen.
      } finally {
        pollingRefreshRef.current = false;
      }
    };

    const timer = setInterval(refresh, 30000);

    return () => clearInterval(timer);
  }, [hydrated, user?.id, user?.role, prefs.reservation]);

  async function refreshDatabaseState(
    nextUser: User,
    options: { resetSelectedDate?: boolean; notifyAssignmentChanges?: boolean } = {}
  ) {
    const { resetSelectedDate = true, notifyAssignmentChanges = false } = options;
    const previousAssignmentRequests = assignmentRequestsRef.current;
    const previousLessonFeedbacks = lessonFeedbacksRef.current;
    const [
      nextSlots,
      nextPastSlots,
      latestUser,
      nextNotices,
      nextFixedLessons,
      nextChangeRequests,
      nextAbsenceRequests,
      nextAssignmentRequests,
      nextFeedbacks,
      nextFeedbackTargets,
      nextInstructorLessonTimes,
      nextSpecialLessons,
      nextSpecialLessonRegistrations,
      nextMemberRequests,
      nextStoreProducts,
      nextStoreOrders
    ] = await Promise.all([
      getSlotsFromDatabase(),
      getPastSlotsFromDatabase(),
      getMemberById(nextUser.id),
      getNoticesFromDatabase(),
      nextUser.role === 'member' ? getMyFixedLessons() : Promise.resolve([]),
      getLessonChangeRequests(),
      getLessonAbsenceRequests(),
      getLessonAssignmentRequests(),
      getLessonFeedbacks(),
      nextUser.role === 'admin' ? getLessonFeedbackTargets() : Promise.resolve([]),
      nextUser.role === 'admin' ? getInstructorLessonTimes() : Promise.resolve([]),
      getSpecialLessons(),
      getSpecialLessonRegistrations(),
      getMemberRequests(),
      getStoreProducts(),
      getStoreOrders()
    ]);
    const normalizedUser = latestUser ?? nextUser;

    setSlots(nextSlots);
    setPastSlots(nextPastSlots);
    if (resetSelectedDate) {
      setSelectedDate(nextSlots[0]?.date ?? getTodayKey());
    }
    setNotices(nextNotices.length > 0 ? nextNotices : initialNotices);
    setFixedLessons(nextFixedLessons);
    setChangeRequests(nextChangeRequests);
    setAbsenceRequests(nextAbsenceRequests);
    setAssignmentRequests(nextAssignmentRequests);
    assignmentRequestsRef.current = nextAssignmentRequests;
    setLessonFeedbacks(nextFeedbacks);
    lessonFeedbacksRef.current = nextFeedbacks;
    setLessonFeedbackTargets(nextFeedbackTargets);
    setInstructorLessonTimes(nextInstructorLessonTimes);
    setSpecialLessons(nextSpecialLessons);
    setSpecialLessonRegistrations(nextSpecialLessonRegistrations);
    setMemberRequests(nextMemberRequests);
    setStoreProducts(nextStoreProducts);
    setStoreOrders(nextStoreOrders);
    setUser(normalizedUser);
    setPassBalance(normalizedUser.passBalance);
    setMembers(normalizedUser.role === 'admin' ? await getMemberSummaries() : []);

    if (notifyAssignmentChanges && prefs.reservation) {
      await notifyAssignmentRequestChanges(previousAssignmentRequests, nextAssignmentRequests, normalizedUser);
      await notifyLessonFeedbackChanges(previousLessonFeedbacks, nextFeedbacks, normalizedUser);
    }

    return normalizedUser;
  }

  async function completeAuth(nextUser: User) {
    await refreshDatabaseState(nextUser);
    setActiveTab('home');
  }

  async function handleSignIn(email: string, password: string) {
    const nextUser = await signIn(email, password);
    await completeAuth(nextUser);
  }

  async function handleSwitchTestAccount(account: TestAccount) {
    await signOut();
    resetSessionState();
    const nextUser = await signIn(account.email, account.password);
    await completeAuth(nextUser);
  }

  async function handleSignUp(input: SignUpInput) {
    const nextUser = await signUp(input);

    if (nextUser) {
      await completeAuth(nextUser);
    }
  }

  async function handleAbsenceChange(slot: ClassSlot) {
    if (!user) {
      throw new DatabaseError('INVALID_CREDENTIALS', '로그인이 필요합니다.');
    }

    const update = await toggleFixedLessonAbsence(slot.id, user.id);
    setSlots(update.slots);
    setUser(update.user);
    setPassBalance(update.user.passBalance);
    setAbsenceRequests(update.requests);

    return update.action;
  }

  async function handleAdjustMemberPass(memberId: string, amount: number) {
    const reason = amount > 0 ? 'admin_charge' : 'admin_deduct';
    const nextMembers = await adjustMemberPass(memberId, amount, reason);
    setMembers(nextMembers);
  }

  async function handleSaveFixedLesson(
    memberId: string,
    weekday: number,
    hour: number,
    minute: number,
    durationMinutes: number,
    fixedLessonId?: string | null
  ) {
    const result = fixedLessonId
      ? await updateFixedLesson(fixedLessonId, weekday, hour, minute, durationMinutes)
      : await upsertFixedLesson(memberId, weekday, hour, minute, durationMinutes);
    setMembers(result.members);
    setSlots(result.slots);
  }

  async function handleUpdateMemberPassProduct(memberId: string, lessonCapacity: number) {
    const nextMembers = await updateMemberPassProduct(memberId, lessonCapacity);
    setMembers(nextMembers);
  }

  async function handleCancelFixedLesson(fixedLessonId: string) {
    const result = await cancelFixedLesson(fixedLessonId);
    setMembers(result.members);
    setSlots(result.slots);
  }

  async function handleCancelFixedLessonAttendance(slotId: string, fixedLessonId: string) {
    const result = await cancelFixedLessonAttendance(slotId, fixedLessonId);
    setMembers(result.members);
    setSlots(result.slots);
  }

  async function handleUpdateLessonInstructor(slotId: string, instructor: string) {
    const result = await updateLessonSlotInstructor(slotId, instructor);
    setMembers(result.members);
    setSlots(result.slots);
  }

  async function handleSaveInstructorLessonTime(input: SaveInstructorLessonTimeInput) {
    const result = await saveInstructorLessonTime(input);
    setInstructorLessonTimes(result.instructorLessonTimes);
    setMembers(result.members);
    setSlots(result.slots);
  }

  async function handleCancelInstructorLessonTime(timeId: string) {
    const result = await cancelInstructorLessonTime(timeId);
    setInstructorLessonTimes(result.instructorLessonTimes);
    setMembers(result.members);
    setSlots(result.slots);
  }

  async function handleCreateLessonSlot(slotDate: string, hour: number, minute: number, instructor: string, durationMinutes: number) {
    const result = await createLessonSlot(slotDate, hour, minute, instructor, durationMinutes);
    setMembers(result.members);
    setSlots(result.slots);
  }

  async function handleUpdateLessonSlot(slotId: string, instructor: string, durationMinutes: number, capacity: number) {
    const result = await updateLessonSlotDetails(slotId, instructor, durationMinutes, capacity);
    setMembers(result.members);
    setSlots(result.slots);
  }

  async function handleAssignLessonReservation(slotId: string, memberId: string, durationMinutes: number) {
    const result = await assignLessonReservation(slotId, memberId, durationMinutes);
    setMembers(result.members);
    setSlots(result.slots);
  }

  async function handleCancelLessonReservation(slotId: string, memberId: string) {
    const result = await cancelLessonReservation(slotId, memberId);
    setMembers(result.members);
    setSlots(result.slots);
  }

  async function handleCancelLessonSlot(slotId: string) {
    const result = await cancelLessonSlot(slotId);
    setMembers(result.members);
    setSlots(result.slots);
  }

  async function handleCreateChangeRequest(sourceSlotId: string, targetSlotId: string) {
    const nextRequests = await createLessonChangeRequest(sourceSlotId, targetSlotId);
    setChangeRequests(nextRequests);
  }

  async function handleCancelChangeRequest(requestId: string) {
    const nextRequests = await cancelLessonChangeRequest(requestId);
    setChangeRequests(nextRequests);
  }

  async function handleReviewChangeRequest(requestId: string, approved: boolean) {
    const result = await reviewLessonChangeRequest(requestId, approved);
    setMembers(result.members);
    setSlots(result.slots);
    setChangeRequests(result.requests);
  }

  async function handleCancelAbsenceRequest(requestId: string) {
    const nextRequests = await cancelLessonAbsenceRequest(requestId);
    setAbsenceRequests(nextRequests);
  }

  async function handleReviewAbsenceRequest(requestId: string, approved: boolean) {
    const result = await reviewLessonAbsenceRequest(requestId, approved);
    setMembers(result.members);
    setSlots(result.slots);
    setAbsenceRequests(result.requests);
  }

  async function handleCreateAssignmentRequest(slotId: string, requestType: LessonAssignmentRequestType) {
    const nextRequests = await createLessonAssignmentRequest(slotId, requestType);
    setAssignmentRequests(nextRequests);
  }

  async function handleCancelAssignmentRequest(requestId: string) {
    const nextRequests = await cancelLessonAssignmentRequest(requestId);
    setAssignmentRequests(nextRequests);
  }

  async function handleCancelMyLessonReservation(slotId: string) {
    if (!user) {
      throw new DatabaseError('INVALID_CREDENTIALS', '로그인이 필요합니다.');
    }

    const result = await cancelMyLessonReservation(slotId, user.id);
    setSlots(result.slots);
    setUser(result.user);
    setPassBalance(result.user.passBalance);
    setAssignmentRequests(result.assignmentRequests);
  }

  async function handleReviewAssignmentRequest(requestId: string, approved: boolean, comment = '') {
    const result = await reviewLessonAssignmentRequest(requestId, approved, comment);
    setMembers(result.members);
    setSlots(result.slots);
    setAssignmentRequests(result.requests);

    if (user) {
      const latestUser = await getMemberById(user.id);

      if (latestUser) {
        setUser(latestUser);
        setPassBalance(latestUser.passBalance);
      }
    }
  }

  async function handlePublishLessonFeedback(input: PublishLessonFeedbackInput) {
    const result = await publishLessonFeedback(input);
    setLessonFeedbacks(result.feedbacks);
    lessonFeedbacksRef.current = result.feedbacks;
    setLessonFeedbackTargets(result.targets);
  }

  async function handleCreateSpecialLesson(input: CreateSpecialLessonInput) {
    const result = await createSpecialLesson(input);
    setSpecialLessons(result.specialLessons);
    setSpecialLessonRegistrations(result.registrations);
  }

  async function handleUpdateSpecialLesson(input: UpdateSpecialLessonInput) {
    const result = await updateSpecialLesson(input);
    setSpecialLessons(result.specialLessons);
    setSpecialLessonRegistrations(result.registrations);
  }

  async function handleApplySpecialLesson(specialLessonId: string) {
    const result = await applySpecialLesson(specialLessonId);
    setSpecialLessons(result.specialLessons);
    setSpecialLessonRegistrations(result.registrations);

    return result.status;
  }

  async function handleCancelSpecialLessonRegistration(registrationId: string) {
    const result = await cancelSpecialLessonRegistration(registrationId);
    setSpecialLessons(result.specialLessons);
    setSpecialLessonRegistrations(result.registrations);
  }

  async function handleReviewSpecialLessonRegistration(registrationId: string, approved: boolean) {
    const result = await reviewSpecialLessonRegistration(registrationId, approved);
    setSpecialLessons(result.specialLessons);
    setSpecialLessonRegistrations(result.registrations);
  }

  async function handleCreateMemberRequest(input: CreateMemberRequestInput) {
    const nextRequests = await createMemberRequest(input);
    setMemberRequests(nextRequests);
  }

  async function handleReviewMemberRequest(requestId: string, status: MemberRequestStatus, reply = '') {
    const nextRequests = await reviewMemberRequest(requestId, status, reply);
    setMemberRequests(nextRequests);
  }

  async function handleCreateStoreProduct(input: CreateStoreProductInput) {
    const nextProducts = await createStoreProduct(input);
    setStoreProducts(nextProducts);
  }

  async function handleCreateStoreOrder(productId: string, quantity: number) {
    const result = await createStoreOrder(productId, quantity);
    setStoreProducts(result.products);
    setStoreOrders(result.orders);
  }

  async function handleCancelStoreOrder(orderId: string) {
    const result = await cancelStoreOrder(orderId);
    setStoreProducts(result.products);
    setStoreOrders(result.orders);
  }

  async function handleReviewStoreOrder(orderId: string, approved: boolean, comment = '') {
    const result = await reviewStoreOrder(orderId, approved, comment);
    setStoreProducts(result.products);
    setStoreOrders(result.orders);
  }

  async function handlePublishNotice(title: string, body: string, imageUri?: string) {
    const nextNotices = await publishNotice({ title, body, imageUri });
    setNotices(nextNotices.length > 0 ? nextNotices : initialNotices);
  }

  async function handleUpdateNotice(input: UpdateNoticeInput) {
    const nextNotices = await updateNotice(input);
    setNotices(nextNotices.length > 0 ? nextNotices : initialNotices);
  }

  async function handleDeleteNotice(noticeId: string) {
    const nextNotices = await deleteNotice(noticeId);
    setNotices(nextNotices);
  }

  function resetSessionState() {
    setUser(null);
    setSlots(createInitialSlots());
    setPastSlots([]);
    setSelectedDate(getTodayKey());
    setPassBalance(DEFAULT_PASS_BALANCE);
    setMembers([]);
    setFixedLessons([]);
    setChangeRequests([]);
    setAbsenceRequests([]);
    setAssignmentRequests([]);
    setLessonFeedbacks([]);
    lessonFeedbacksRef.current = [];
    setLessonFeedbackTargets([]);
    setInstructorLessonTimes([]);
    setSpecialLessons([]);
    setSpecialLessonRegistrations([]);
    setMemberRequests([]);
    setStoreProducts([]);
    setStoreOrders([]);
    setActiveTab('home');
  }

  async function handleLogout() {
    await signOut();
    resetSessionState();
  }

  function handleDeleteAccount() {
    Alert.alert(
      '계정 삭제',
      '계정을 삭제하면 회원 정보, 예약, 횟수권 이력이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              resetSessionState();
              Alert.alert('삭제 완료', '계정이 삭제되었습니다.');
            } catch (error) {
              const message = error instanceof DatabaseError ? error.message : '계정을 삭제하지 못했습니다.';
              Alert.alert('삭제 실패', message);
            }
          }
        }
      ]
    );
  }

  const myReservations = useMemo(
    () => slots.filter((slot) => isReservedByUser(slot, user)).sort(sortSlotsByStartsAt),
    [slots, user]
  );
  const myPastReservations = useMemo(
    () => pastSlots.filter((slot) => isReservedByUser(slot, user)).sort(sortSlotsByStartsAt),
    [pastSlots, user]
  );

  const myFixedSlots = useMemo(
    () => slots.filter((slot) => isFixedLessonForUser(slot, user)).sort(sortSlotsByStartsAt),
    [slots, user]
  );
  const myPastFixedSlots = useMemo(
    () => pastSlots.filter((slot) => isFixedLessonForUser(slot, user)).sort(sortSlotsByStartsAt),
    [pastSlots, user]
  );
  const myAttendingFixedSlots = useMemo(
    () => myFixedSlots.filter((slot) => !isAbsentByUser(slot, user)),
    [myFixedSlots, user]
  );
  const myAttendingPastFixedSlots = useMemo(
    () => myPastFixedSlots.filter((slot) => !isAbsentByUser(slot, user)),
    [myPastFixedSlots, user]
  );
  const myLessonFixedSlots = useMemo(
    () => [...myAttendingPastFixedSlots, ...myAttendingFixedSlots].sort(sortSlotsByStartsAt),
    [myAttendingPastFixedSlots, myAttendingFixedSlots]
  );
  const myLessonReservations = useMemo(
    () => [...myPastReservations, ...myReservations].sort(sortSlotsByStartsAt),
    [myPastReservations, myReservations]
  );
  const assignedFixedSlots = useMemo(
    () => myAttendingFixedSlots.filter(isUpcomingSlot),
    [myAttendingFixedSlots]
  );
  const myUpcomingLessons = useMemo(
    () => [...assignedFixedSlots, ...myReservations.filter(isUpcomingSlot)].sort(sortSlotsByStartsAt),
    [assignedFixedSlots, myReservations]
  );
  const nextClass = myUpcomingLessons[0];
  const openSlots = useMemo(() => slots.filter(isOpenSubstituteSlot).sort(sortSlotsByStartsAt), [slots]);
  const reservedSlots = useMemo(
    () => slots.filter((slot) => slot.absences.length > 0 || slot.substitutes.length > 0).sort(sortSlotsByStartsAt),
    [slots]
  );
  const reserveSlots = useMemo(
    () => (user?.role === 'admin' ? getAdminLessonTabSlots(slots, pastSlots) : slots),
    [pastSlots, slots, user?.role]
  );
  const dateOptions = useMemo(() => getDateOptions(reserveSlots), [reserveSlots]);

  if (showLaunchScreen || !hydrated || !fontsLoaded) {
    return <LaunchScreen />;
  }

  if (!user) {
    return <LoginScreen onSignIn={handleSignIn} onSignUp={handleSignUp} testAccounts={configuredTestAccounts} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={keyboardAvoidingBehavior}>
        <View style={styles.appShell}>
          <View style={styles.header}>
            <View style={styles.headerBrand}>
              <Image source={logoOnNavyImage} style={styles.headerLogoImage} resizeMode="contain" />
              <View style={styles.headerTextBlock}>
                <Text style={styles.headerTitle}>{user.name}님</Text>
              </View>
            </View>
            {user.role === 'admin' ? null : (
              <Pressable style={styles.contactButton} onPress={callContact} accessibilityLabel="문의 전화" accessibilityRole="button">
                <Feather name="phone-call" size={15} color={colors.white} />
                <Text style={styles.contactButtonText}>전화 문의</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.content}>
            {activeTab === 'home' ? (
              <HomeScreen
                userRole={user.role}
                nextClass={nextClass}
                notices={notices}
                fixedLessons={fixedLessons}
                myFixedLessonSlots={myLessonFixedSlots}
                myReservations={myLessonReservations}
                openSlots={openSlots}
                slots={slots}
                members={members}
                changeRequests={changeRequests}
                absenceRequests={absenceRequests}
                assignmentRequests={assignmentRequests}
                lessonFeedbackTargets={lessonFeedbackTargets}
                lessonFeedbacks={lessonFeedbacks}
                instructorLessonTimes={instructorLessonTimes}
                specialLessons={specialLessons}
                specialLessonRegistrations={specialLessonRegistrations}
                memberRequests={memberRequests}
                storeProducts={storeProducts}
                storeOrders={storeOrders}
                passBalance={passBalance}
                onAdjustMemberPass={handleAdjustMemberPass}
                onUpdateMemberPassProduct={handleUpdateMemberPassProduct}
                onSaveFixedLesson={handleSaveFixedLesson}
                onCancelFixedLesson={handleCancelFixedLesson}
                onUpdateLessonInstructor={handleUpdateLessonInstructor}
                onCreateLessonSlot={handleCreateLessonSlot}
                onUpdateLessonSlot={handleUpdateLessonSlot}
                onAssignLessonReservation={handleAssignLessonReservation}
                onCancelLessonReservation={handleCancelLessonReservation}
                onCancelLessonSlot={handleCancelLessonSlot}
                onSaveInstructorLessonTime={handleSaveInstructorLessonTime}
                onCancelInstructorLessonTime={handleCancelInstructorLessonTime}
                onCancelChangeRequest={handleCancelChangeRequest}
                onReviewChangeRequest={handleReviewChangeRequest}
                onCancelAbsenceRequest={handleCancelAbsenceRequest}
                onReviewAbsenceRequest={handleReviewAbsenceRequest}
                onCancelAssignmentRequest={handleCancelAssignmentRequest}
                onReviewAssignmentRequest={handleReviewAssignmentRequest}
                onPublishLessonFeedback={handlePublishLessonFeedback}
                onCreateSpecialLesson={handleCreateSpecialLesson}
                onUpdateSpecialLesson={handleUpdateSpecialLesson}
                onApplySpecialLesson={handleApplySpecialLesson}
                onCancelSpecialLessonRegistration={handleCancelSpecialLessonRegistration}
                onReviewSpecialLessonRegistration={handleReviewSpecialLessonRegistration}
                onCreateMemberRequest={handleCreateMemberRequest}
                onReviewMemberRequest={handleReviewMemberRequest}
                onCreateStoreProduct={handleCreateStoreProduct}
                onCreateStoreOrder={handleCreateStoreOrder}
                onCancelStoreOrder={handleCancelStoreOrder}
                onReviewStoreOrder={handleReviewStoreOrder}
                onReservePress={() => setActiveTab('reserve')}
                onNoticePress={() => setActiveTab('notices')}
              />
            ) : null}

            {activeTab === 'reserve' ? (
              <ReserveScreen
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                dateOptions={dateOptions}
                user={user}
                slots={reserveSlots}
                members={members}
                passBalance={passBalance}
                prefs={prefs}
                changeRequests={changeRequests}
                absenceRequests={absenceRequests}
                assignmentRequests={assignmentRequests}
                lessonFeedbackTargets={lessonFeedbackTargets}
                onAbsence={handleAbsenceChange}
                onCancelAbsenceRequest={handleCancelAbsenceRequest}
                onCreateAssignmentRequest={handleCreateAssignmentRequest}
                onCancelAssignmentRequest={handleCancelAssignmentRequest}
                onCancelMyLessonReservation={handleCancelMyLessonReservation}
                onCreateLessonSlot={handleCreateLessonSlot}
                onUpdateLessonSlot={handleUpdateLessonSlot}
                onAssignLessonReservation={handleAssignLessonReservation}
                onCancelLessonReservation={handleCancelLessonReservation}
                onCancelLessonSlot={handleCancelLessonSlot}
                onCancelFixedLessonAttendance={handleCancelFixedLessonAttendance}
                onPublishLessonFeedback={handlePublishLessonFeedback}
              />
            ) : null}

            {activeTab === 'notices' ? (
              <NoticesScreen
                userRole={user.role}
                notices={notices}
                onPublishNotice={handlePublishNotice}
                onUpdateNotice={handleUpdateNotice}
                onDeleteNotice={handleDeleteNotice}
                prefs={prefs}
              />
            ) : null}

            {activeTab === 'alerts' ? <AlertsScreen prefs={prefs} setPrefs={setPrefs} /> : null}

            {activeTab === 'profile' ? (
              <ProfileScreen
                user={user}
                reservationCount={user.role === 'admin' ? reservedSlots.length : myReservations.length}
                passBalance={passBalance}
                memberRequests={memberRequests}
                onCreateMemberRequest={handleCreateMemberRequest}
              onLogout={handleLogout}
              onDeleteAccount={handleDeleteAccount}
              testAccounts={configuredTestAccounts}
              onSwitchTestAccount={handleSwitchTestAccount}
            />
          ) : null}
          </View>

          <View style={styles.tabBar}>
            {tabs.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <Pressable key={tab.id} style={[styles.tabItem, selected && styles.tabItemActive]} onPress={() => setActiveTab(tab.id)}>
                  <Feather name={tab.icon} size={20} color={selected ? colors.blue900 : colors.muted} />
                  <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LaunchScreen() {
  return (
    <SafeAreaView style={styles.launchScreen}>
      <StatusBar barStyle="dark-content" />
      <Image source={brandLogoImage} style={styles.launchLogo} resizeMode="contain" />
    </SafeAreaView>
  );
}

function LoginScreen({
  onSignIn,
  onSignUp,
  testAccounts
}: {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (input: SignUpInput) => Promise<void>;
  testAccounts: TestAccount[];
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function signInWithCredentials(nextEmail: string, nextPassword: string) {
    await onSignIn(nextEmail, nextPassword);
  }

  async function quickSignIn(account: TestAccount) {
    if (submitting) {
      return;
    }

    try {
      setSubmitting(true);
      setMode('signin');
      setEmail(account.email);
      setPassword(account.password);
      await signInWithCredentials(account.email, account.password);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '잠시 후 다시 시도해주세요.';
      Alert.alert('로그인 실패', message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    if (submitting) {
      return;
    }

    try {
      setSubmitting(true);
      if (mode === 'signin') {
        await signInWithCredentials(email, password);
        return;
      }

      await onSignUp({
        name: displayName,
        email,
        phone,
        password
      });
      Alert.alert('가입 완료', '이메일 인증이 켜져 있으면 메일 인증 후 로그인해주세요.');
      setMode('signin');
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '잠시 후 다시 시도해주세요.';
      Alert.alert(mode === 'signin' ? '로그인 실패' : '가입 실패', message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.loginSafeArea}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={keyboardAvoidingBehavior}>
        <KeyboardAwareScrollView contentContainerStyle={styles.loginScrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.loginHero}>
            <Image source={logoOnNavyImage} style={styles.loginHeroImage} resizeMode="contain" />
            {/* <Text style={styles.loginTitle}>오늘도수영</Text> */}
            <View style={styles.loginIconRow}>
              <View style={styles.loginIconChip}>
                <Feather name="calendar" size={18} color={colors.blue900} />
              </View>
              <View style={styles.loginIconChip}>
                <Feather name="bell" size={18} color={colors.blue900} />
              </View>
              <View style={styles.loginIconChip}>
                <Feather name="credit-card" size={18} color={colors.blue900} />
              </View>
            </View>
          </View>

          <View style={styles.loginPanel}>
          <View style={styles.roleSwitch}>
            <Pressable style={[styles.roleButton, mode === 'signin' && styles.roleButtonActive]} onPress={() => setMode('signin')}>
              <Feather name="log-in" size={17} color={mode === 'signin' ? colors.white : colors.blue700} />
              <Text style={[styles.roleButtonText, mode === 'signin' && styles.roleButtonTextActive]}>로그인</Text>
            </Pressable>
            <Pressable style={[styles.roleButton, mode === 'signup' && styles.roleButtonActive]} onPress={() => setMode('signup')}>
              <Feather name="user-plus" size={17} color={mode === 'signup' ? colors.white : colors.blue700} />
              <Text style={[styles.roleButtonText, mode === 'signup' && styles.roleButtonTextActive]}>회원가입</Text>
            </Pressable>
          </View>

          {mode === 'signin' && testAccounts.length > 0 ? (
            <View style={styles.devLoginPanel}>
              <Text style={styles.devLoginTitle}>테스트 로그인</Text>
              <View style={styles.devAccountButtons}>
                {testAccounts.map((account) => (
                  <Pressable
                    key={account.id}
                    style={[styles.devAccountButton, submitting && styles.disabledButton]}
                    onPress={() => quickSignIn(account)}
                    disabled={submitting}
                    accessibilityRole="button"
                    accessibilityLabel={`${account.label} 테스트 로그인`}
                  >
                    <Feather name={account.icon} size={16} color={colors.blue700} />
                    <Text style={styles.devAccountButtonText}>{account.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {mode === 'signup' ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="회원 이름"
                placeholderTextColor={colors.muted}
                value={displayName}
                onChangeText={setDisplayName}
                returnKeyType="next"
              />

              <TextInput
                style={styles.input}
                placeholder="휴대폰 번호"
                placeholderTextColor={colors.muted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                returnKeyType="next"
              />
            </>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="이메일"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            returnKeyType="done"
            onSubmitEditing={submit}
          />

          <Pressable
            style={[styles.authSubmitButton, submitting && styles.disabledButton]}
            onPress={submit}
            disabled={submitting}
            accessibilityRole="button"
          >
            {submitting ? <ActivityIndicator color={colors.white} /> : <Feather name={mode === 'signin' ? 'log-in' : 'user-plus'} size={18} color={colors.white} />}
            <Text style={styles.authSubmitButtonText}>{mode === 'signin' ? '로그인' : '가입'}</Text>
          </Pressable>

          <Pressable style={styles.phoneLink} onPress={callContact}>
            <Feather name="phone-call" size={16} color={colors.blue700} />
            <Text style={styles.phoneLinkText}>문의 {CONTACT_PHONE}</Text>
          </Pressable>
          </View>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HomeScreen({
  userRole,
  nextClass,
  notices,
  fixedLessons,
  myFixedLessonSlots,
  myReservations,
  openSlots,
  slots,
  members,
  changeRequests,
  absenceRequests,
  assignmentRequests,
  lessonFeedbackTargets,
  lessonFeedbacks,
  instructorLessonTimes,
  specialLessons,
  specialLessonRegistrations,
  memberRequests,
  storeProducts,
  storeOrders,
  passBalance,
  onAdjustMemberPass,
  onUpdateMemberPassProduct,
  onSaveFixedLesson,
  onCancelFixedLesson,
  onUpdateLessonInstructor,
  onCreateLessonSlot,
  onUpdateLessonSlot,
  onAssignLessonReservation,
  onCancelLessonReservation,
  onCancelLessonSlot,
  onSaveInstructorLessonTime,
  onCancelInstructorLessonTime,
  onCancelChangeRequest,
  onReviewChangeRequest,
  onCancelAbsenceRequest,
  onReviewAbsenceRequest,
  onCancelAssignmentRequest,
  onReviewAssignmentRequest,
  onPublishLessonFeedback,
  onCreateSpecialLesson,
  onUpdateSpecialLesson,
  onApplySpecialLesson,
  onCancelSpecialLessonRegistration,
  onReviewSpecialLessonRegistration,
  onCreateMemberRequest,
  onReviewMemberRequest,
  onCreateStoreProduct,
  onCreateStoreOrder,
  onCancelStoreOrder,
  onReviewStoreOrder,
  onReservePress,
  onNoticePress
}: {
  userRole: UserRole;
  nextClass?: ClassSlot;
  notices: Notice[];
  fixedLessons: FixedLesson[];
  myFixedLessonSlots: ClassSlot[];
  myReservations: ClassSlot[];
  openSlots: ClassSlot[];
  slots: ClassSlot[];
  members: MemberSummary[];
  changeRequests: LessonChangeRequest[];
  absenceRequests: LessonAbsenceRequest[];
  assignmentRequests: LessonAssignmentRequest[];
  lessonFeedbackTargets: LessonFeedbackTarget[];
  lessonFeedbacks: LessonFeedback[];
  instructorLessonTimes: InstructorLessonTime[];
  specialLessons: SpecialLesson[];
  specialLessonRegistrations: SpecialLessonRegistration[];
  memberRequests: MemberRequest[];
  storeProducts: StoreProduct[];
  storeOrders: StoreOrder[];
  passBalance: number;
  onAdjustMemberPass: (memberId: string, amount: number) => Promise<void>;
  onUpdateMemberPassProduct: (memberId: string, lessonCapacity: number) => Promise<void>;
  onSaveFixedLesson: (
    memberId: string,
    weekday: number,
    hour: number,
    minute: number,
    durationMinutes: number,
    fixedLessonId?: string | null
  ) => Promise<void>;
  onCancelFixedLesson: (fixedLessonId: string) => Promise<void>;
  onUpdateLessonInstructor: (slotId: string, instructor: string) => Promise<void>;
  onCreateLessonSlot: (slotDate: string, hour: number, minute: number, instructor: string, durationMinutes: number) => Promise<void>;
  onUpdateLessonSlot: (slotId: string, instructor: string, durationMinutes: number, capacity: number) => Promise<void>;
  onAssignLessonReservation: (slotId: string, memberId: string, durationMinutes: number) => Promise<void>;
  onCancelLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonSlot: (slotId: string) => Promise<void>;
  onSaveInstructorLessonTime: (input: SaveInstructorLessonTimeInput) => Promise<void>;
  onCancelInstructorLessonTime: (timeId: string) => Promise<void>;
  onCancelChangeRequest: (requestId: string) => Promise<void>;
  onReviewChangeRequest: (requestId: string, approved: boolean) => Promise<void>;
  onCancelAbsenceRequest: (requestId: string) => Promise<void>;
  onReviewAbsenceRequest: (requestId: string, approved: boolean) => Promise<void>;
  onCancelAssignmentRequest: (requestId: string) => Promise<void>;
  onReviewAssignmentRequest: (requestId: string, approved: boolean, comment?: string) => Promise<void>;
  onPublishLessonFeedback: (input: PublishLessonFeedbackInput) => Promise<void>;
  onCreateSpecialLesson: (input: CreateSpecialLessonInput) => Promise<void>;
  onUpdateSpecialLesson: (input: UpdateSpecialLessonInput) => Promise<void>;
  onApplySpecialLesson: (specialLessonId: string) => Promise<SpecialLessonRegistrationStatus>;
  onCancelSpecialLessonRegistration: (registrationId: string) => Promise<void>;
  onReviewSpecialLessonRegistration: (registrationId: string, approved: boolean) => Promise<void>;
  onCreateMemberRequest: (input: CreateMemberRequestInput) => Promise<void>;
  onReviewMemberRequest: (requestId: string, status: MemberRequestStatus, reply?: string) => Promise<void>;
  onCreateStoreProduct: (input: CreateStoreProductInput) => Promise<void>;
  onCreateStoreOrder: (productId: string, quantity: number) => Promise<void>;
  onCancelStoreOrder: (orderId: string) => Promise<void>;
  onReviewStoreOrder: (orderId: string, approved: boolean, comment?: string) => Promise<void>;
  onReservePress: () => void;
  onNoticePress: () => void;
}) {
  const isAdmin = userRole === 'admin';

  if (isAdmin) {
    return (
      <AdminHomeScreen
        slots={slots}
        members={members}
        notices={notices}
        openSlots={openSlots}
        changeRequests={changeRequests}
        absenceRequests={absenceRequests}
        assignmentRequests={assignmentRequests}
        lessonFeedbackTargets={lessonFeedbackTargets}
        instructorLessonTimes={instructorLessonTimes}
        specialLessons={specialLessons}
        specialLessonRegistrations={specialLessonRegistrations}
        memberRequests={memberRequests}
        storeProducts={storeProducts}
        storeOrders={storeOrders}
        onAdjustMemberPass={onAdjustMemberPass}
        onUpdateMemberPassProduct={onUpdateMemberPassProduct}
        onSaveFixedLesson={onSaveFixedLesson}
        onCancelFixedLesson={onCancelFixedLesson}
        onUpdateLessonInstructor={onUpdateLessonInstructor}
        onCreateLessonSlot={onCreateLessonSlot}
        onUpdateLessonSlot={onUpdateLessonSlot}
        onAssignLessonReservation={onAssignLessonReservation}
        onCancelLessonReservation={onCancelLessonReservation}
        onCancelLessonSlot={onCancelLessonSlot}
        onSaveInstructorLessonTime={onSaveInstructorLessonTime}
        onCancelInstructorLessonTime={onCancelInstructorLessonTime}
        onReviewChangeRequest={onReviewChangeRequest}
        onReviewAbsenceRequest={onReviewAbsenceRequest}
        onReviewAssignmentRequest={onReviewAssignmentRequest}
        onPublishLessonFeedback={onPublishLessonFeedback}
        onCreateSpecialLesson={onCreateSpecialLesson}
        onUpdateSpecialLesson={onUpdateSpecialLesson}
        onReviewSpecialLessonRegistration={onReviewSpecialLessonRegistration}
        onReviewMemberRequest={onReviewMemberRequest}
        onCreateStoreProduct={onCreateStoreProduct}
        onReviewStoreOrder={onReviewStoreOrder}
        onNoticePress={onNoticePress}
      />
    );
  }

  return (
    <MemberHomeScreen
      nextClass={nextClass}
      fixedLessons={fixedLessons}
      myFixedLessonSlots={myFixedLessonSlots}
      myReservations={myReservations}
      slots={slots}
      changeRequests={changeRequests}
      absenceRequests={absenceRequests}
      assignmentRequests={assignmentRequests}
      lessonFeedbacks={lessonFeedbacks}
      specialLessons={specialLessons}
      memberRequests={memberRequests}
      storeProducts={storeProducts}
      storeOrders={storeOrders}
      passBalance={passBalance}
      onCancelChangeRequest={onCancelChangeRequest}
      onCancelAbsenceRequest={onCancelAbsenceRequest}
      onCancelAssignmentRequest={onCancelAssignmentRequest}
      onApplySpecialLesson={onApplySpecialLesson}
      onCancelSpecialLessonRegistration={onCancelSpecialLessonRegistration}
      onCreateMemberRequest={onCreateMemberRequest}
      onCreateStoreOrder={onCreateStoreOrder}
      onCancelStoreOrder={onCancelStoreOrder}
      onReservePress={onReservePress}
    />
  );
}

function HomeSectionMenu<T extends string>({
  options,
  selectedId,
  onSelect
}: {
  options: Array<HomeMenuOption<T>>;
  selectedId: T;
  onSelect: (id: T) => void;
}) {
  return (
    <View style={styles.homeSectionMenu}>
      {options.map((option) => {
        const selected = selectedId === option.id;
        const showCount = typeof option.count === 'number' && option.count > 0;

        return (
          <Pressable
            key={option.id}
            style={[styles.homeSectionMenuButton, selected && styles.homeSectionMenuButtonActive]}
            onPress={() => onSelect(option.id)}
            accessibilityRole="button"
            accessibilityLabel={option.label}
          >
            <View style={styles.homeSectionMenuTopRow}>
              <View style={[styles.homeSectionMenuIcon, selected && styles.homeSectionMenuIconActive]}>
                <Feather name={option.icon} size={18} color={selected ? colors.white : colors.blue700} />
              </View>
              {showCount ? (
                <Text style={[styles.homeSectionMenuCount, selected && styles.homeSectionMenuCountActive]}>{option.count}</Text>
              ) : null}
            </View>
            <View style={styles.homeSectionMenuCopy}>
              <View style={styles.homeSectionMenuTitleRow}>
                <Text style={[styles.homeSectionMenuText, selected && styles.homeSectionMenuTextActive]} numberOfLines={1}>
                  {option.label}
                </Text>
                {option.description ? (
                  <InfoTooltip
                    message={option.description}
                    iconColor={selected ? colors.blue900 : colors.blue700}
                    accessibilityLabel={`${option.label} 설명`}
                  />
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function InfoTooltip({
  message,
  iconColor = colors.blue700,
  accessibilityLabel = '설명 보기'
}: {
  message: string;
  iconColor?: string;
  accessibilityLabel?: string;
}) {
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH, Math.max(160, windowWidth - TOOLTIP_HORIZONTAL_MARGIN * 2));
  const tooltipLeft = anchor
    ? Math.min(
        Math.max(TOOLTIP_HORIZONTAL_MARGIN, anchor.x + anchor.width / 2 - tooltipWidth / 2),
        windowWidth - tooltipWidth - TOOLTIP_HORIZONTAL_MARGIN
      )
    : TOOLTIP_HORIZONTAL_MARGIN;
  const tooltipTop = anchor ? anchor.y + anchor.height + 8 : 0;
  const caretLeft = anchor
    ? Math.min(Math.max(14, anchor.x + anchor.width / 2 - tooltipLeft - 5), tooltipWidth - 20)
    : 18;

  function toggleTooltip() {
    if (open) {
      setOpen(false);
      return;
    }

    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }

  return (
    <View style={styles.infoTooltipWrap}>
      <Pressable
        ref={anchorRef}
        style={styles.infoIconButton}
        onPress={toggleTooltip}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Feather name="info" size={14} color={iconColor} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.tooltipOverlay} onPress={() => setOpen(false)}>
          {anchor ? (
            <View style={[styles.tooltipBubble, { left: tooltipLeft, top: tooltipTop, width: tooltipWidth }]}>
              <View style={[styles.tooltipCaret, { left: caretLeft }]} />
              <Text style={styles.tooltipText}>{message}</Text>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

function HomeEmptyPanel({ icon, message }: { icon: keyof typeof Feather.glyphMap; message: string }) {
  return (
    <View style={styles.adminOverview}>
      <View style={styles.emptyState}>
        <Feather name={icon} size={22} color={colors.blue700} />
        <Text style={styles.emptyStateText}>{message}</Text>
      </View>
    </View>
  );
}

function MemberHomeScreen({
  nextClass,
  fixedLessons,
  myFixedLessonSlots,
  myReservations,
  slots,
  changeRequests,
  absenceRequests,
  assignmentRequests,
  lessonFeedbacks,
  specialLessons,
  memberRequests,
  storeProducts,
  storeOrders,
  passBalance,
  onCancelChangeRequest,
  onCancelAbsenceRequest,
  onCancelAssignmentRequest,
  onApplySpecialLesson,
  onCancelSpecialLessonRegistration,
  onCreateMemberRequest,
  onCreateStoreOrder,
  onCancelStoreOrder,
  onReservePress
}: {
  nextClass?: ClassSlot;
  fixedLessons: FixedLesson[];
  myFixedLessonSlots: ClassSlot[];
  myReservations: ClassSlot[];
  slots: ClassSlot[];
  changeRequests: LessonChangeRequest[];
  absenceRequests: LessonAbsenceRequest[];
  assignmentRequests: LessonAssignmentRequest[];
  lessonFeedbacks: LessonFeedback[];
  specialLessons: SpecialLesson[];
  memberRequests: MemberRequest[];
  storeProducts: StoreProduct[];
  storeOrders: StoreOrder[];
  passBalance: number;
  onCancelChangeRequest: (requestId: string) => Promise<void>;
  onCancelAbsenceRequest: (requestId: string) => Promise<void>;
  onCancelAssignmentRequest: (requestId: string) => Promise<void>;
  onApplySpecialLesson: (specialLessonId: string) => Promise<SpecialLessonRegistrationStatus>;
  onCancelSpecialLessonRegistration: (registrationId: string) => Promise<void>;
  onCreateMemberRequest: (input: CreateMemberRequestInput) => Promise<void>;
  onCreateStoreOrder: (productId: string, quantity: number) => Promise<void>;
  onCancelStoreOrder: (orderId: string) => Promise<void>;
  onReservePress: () => void;
}) {
  const [selectedSection, setSelectedSection] = useState<MemberHomeSection>('lessons');
  const [detailView, setDetailView] = useState<MemberDetailView | null>(null);
  const pendingChangeRequests = changeRequests.filter((request) => request.status === 'pending');
  const recentChangeRequest = changeRequests.find((request) => request.status !== 'pending');
  const pendingAbsenceRequests = absenceRequests.filter((request) => request.status === 'pending');
  const recentAbsenceRequest = absenceRequests.find((request) => request.status !== 'pending');
  const pendingAssignmentRequests = assignmentRequests.filter((request) => request.status === 'pending');
  const recentAssignmentRequest = assignmentRequests.find((request) => request.status !== 'pending');
  const pendingRequestCount = pendingAssignmentRequests.length + pendingChangeRequests.length + pendingAbsenceRequests.length;
  const allLessonRequestCount = changeRequests.length + absenceRequests.length + assignmentRequests.length;
  const upcomingFixedLessonSlots = myFixedLessonSlots.filter(isUpcomingSlot);
  const upcomingReservations = myReservations.filter(isUpcomingSlot);
  const upcomingLessonCount = upcomingFixedLessonSlots.length + upcomingReservations.length;
  const activeStoreProductCount = storeProducts.filter((product) => product.isActive).length;
  const upcomingSpecialLessonCount = specialLessons.filter((lesson) => new Date(lesson.startsAt).getTime() >= Date.now()).length;
  const fixedLessonSummary = formatFixedLessonSummary(fixedLessons);
  const memberMenuOptions: Array<HomeMenuOption<MemberHomeSection>> = [
    { id: 'lessons', label: '내 수업', description: '', icon: 'calendar', count: upcomingLessonCount },
    { id: 'requests', label: '요청 관리', description: '', icon: 'inbox', count: allLessonRequestCount },
    { id: 'special', label: '특별수업', description: '', icon: 'star', count: upcomingSpecialLessonCount },
    { id: 'store', label: '상품 구매', description: '', icon: 'shopping-bag', count: activeStoreProductCount },
    { id: 'feedback', label: '수업 피드백', description: '', icon: 'message-circle', count: lessonFeedbacks.length }
  ];
  const selectSection = (section: MemberHomeSection) => {
    setSelectedSection(section);
    setDetailView(null);
  };

  const detailTitle = (() => {
    if (detailView === 'pastLessons') {
      return '지난 내 수업';
    }

    if (detailView === 'lessonRequests') {
      return '전체 수업 요청';
    }

    if (detailView === 'storeOrders') {
      return '내 구매 신청';
    }

    return '';
  })();

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.focusCard}>
        <View style={styles.heroTopRow}>
          <Text style={styles.focusEyebrow} numberOfLines={1}>{nextClass ? '다음 예약 수업' : '예약된 다음 수업 없음'}</Text>
          <Text style={styles.focusBadge}>남은 수업권 {passBalance}회</Text>
        </View>
        <View>
          <Text style={styles.heroTitle} numberOfLines={1}>{nextClass ? `${nextClass.shortDateLabel} ${formatSlotHour(nextClass.startsAt)}` : '예정된 수업 없음'}</Text>
          <Text style={styles.heroBody} numberOfLines={2}>
            {nextClass ? `${nextClass.weekdayLabel} · ${nextClass.instructor} 강사 · ${formatLessonDuration(nextClass.durationMinutes)}` : '고정 수업이 배정되면 여기에 표시됩니다'}
          </Text>
        </View>
        <View style={styles.memberFixedScheduleLine}>
          <Feather name="repeat" size={15} color={colors.blue700} />
          <Text style={styles.memberFixedScheduleText} numberOfLines={1}>내 고정수업 · {fixedLessonSummary}</Text>
        </View>
        {pendingRequestCount > 0 ? (
          <View style={styles.memberPendingLine}>
            <Feather name="clock" size={15} color={colors.warning} />
            <Text style={styles.memberPendingText}>관리자 확인 대기 {pendingRequestCount}건</Text>
          </View>
        ) : null}
        <View style={styles.memberHeroActions}>
          <Pressable style={styles.primaryButton} onPress={onReservePress}>
            <Feather name="arrow-right-circle" size={18} color={colors.white} />
            <Text style={styles.primaryButtonText}>수업 신청·취소하기</Text>
          </Pressable>
        </View>
      </View>

      <HomeSectionMenu options={memberMenuOptions} selectedId={selectedSection} onSelect={selectSection} />

      {detailView ? (
        <MemberDetailHeader title={detailTitle} onBack={() => setDetailView(null)} />
      ) : null}

      {detailView === 'pastLessons' ? (
        <MemberPastLessonOverview
          fixedLessonSlots={myFixedLessonSlots}
          reservations={myReservations}
          feedbacks={lessonFeedbacks}
        />
      ) : null}

      {detailView === 'lessonRequests' ? (
        <MemberRequestSummary
          pendingChangeRequests={pendingChangeRequests}
          recentChangeRequest={recentChangeRequest}
          pendingAbsenceRequests={pendingAbsenceRequests}
          recentAbsenceRequest={recentAbsenceRequest}
          pendingRequests={pendingAssignmentRequests}
          recentRequest={recentAssignmentRequest}
          changeRequests={changeRequests}
          absenceRequests={absenceRequests}
          assignmentRequests={assignmentRequests}
          onCancelChangeRequest={onCancelChangeRequest}
          onCancelAbsenceRequest={onCancelAbsenceRequest}
          onCancelAssignmentRequest={onCancelAssignmentRequest}
          showAll
        />
      ) : null}

      {detailView === 'storeOrders' ? (
        <MemberStoreOrderOverview orders={storeOrders} onCancelStoreOrder={onCancelStoreOrder} />
      ) : null}

      {!detailView && selectedSection === 'lessons' ? (
        <MemberLessonOverview
          fixedLessonSlots={myFixedLessonSlots}
          reservations={myReservations}
          onShowPastLessons={() => setDetailView('pastLessons')}
        />
      ) : null}

      {!detailView && selectedSection === 'requests' ? (
        <>
          <MemberRequestSummary
            pendingChangeRequests={pendingChangeRequests}
            recentChangeRequest={recentChangeRequest}
            pendingAbsenceRequests={pendingAbsenceRequests}
            recentAbsenceRequest={recentAbsenceRequest}
            pendingRequests={pendingAssignmentRequests}
            recentRequest={recentAssignmentRequest}
            changeRequests={changeRequests}
            absenceRequests={absenceRequests}
            assignmentRequests={assignmentRequests}
            onCancelChangeRequest={onCancelChangeRequest}
            onCancelAbsenceRequest={onCancelAbsenceRequest}
            onCancelAssignmentRequest={onCancelAssignmentRequest}
            onShowAll={allLessonRequestCount > 0 ? () => setDetailView('lessonRequests') : undefined}
          />
        </>
      ) : null}

      {!detailView && selectedSection === 'special' ? (
        <MemberSpecialLessonOverview
          specialLessons={specialLessons}
          onApplySpecialLesson={onApplySpecialLesson}
          onCancelSpecialLessonRegistration={onCancelSpecialLessonRegistration}
        />
      ) : null}

      {!detailView && selectedSection === 'store' ? (
        <MemberStoreOverview
          products={storeProducts}
          orders={storeOrders}
          onCreateStoreOrder={onCreateStoreOrder}
          onShowOrders={() => setDetailView('storeOrders')}
        />
      ) : null}

      {!detailView && selectedSection === 'feedback' ? (
        lessonFeedbacks.length > 0 ? (
          <MemberLessonFeedbackOverview feedbacks={lessonFeedbacks} />
        ) : (
          <HomeEmptyPanel icon="message-circle" message="아직 등록된 수업 피드백이 없습니다." />
        )
      ) : null}
    </KeyboardAwareScrollView>
  );
}

function MemberDetailHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.memberDetailHeader}>
      <Pressable style={styles.memberDetailBackButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="뒤로가기">
        <Feather name="chevron-left" size={20} color={colors.blue700} />
        <Text style={styles.memberDetailBackText}>뒤로</Text>
      </Pressable>
      <Text style={styles.memberDetailTitle}>{title}</Text>
    </View>
  );
}

function MemberLessonOverview({
  fixedLessonSlots,
  reservations,
  onShowPastLessons
}: {
  fixedLessonSlots: ClassSlot[];
  reservations: ClassSlot[];
  onShowPastLessons: () => void;
}) {
  const upcomingFixedSlots = fixedLessonSlots.filter(isUpcomingSlot);
  const upcomingReservations = reservations.filter(isUpcomingSlot);
  const upcomingLessons = [
    ...upcomingFixedSlots.map((slot) => ({ slot, label: '고정 수업' })),
    ...upcomingReservations.map((slot) => ({ slot, label: slot.isActive ? '추가 수업' : '자유수영' }))
  ].sort((a, b) => new Date(a.slot.startsAt).getTime() - new Date(b.slot.startsAt).getTime());
  const totalCount = upcomingLessons.length;

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <View style={styles.feedbackCardTitleBlock}>
          <Text style={styles.adminOverviewTitle}>예정 수업</Text>
        </View>
        <Text style={[styles.timelineBadge, styles.timelineBadgeUpcoming]}>{totalCount}개 예정</Text>
      </View>
      {totalCount === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="clock" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>아직 예정된 수업이 없습니다.</Text>
        </View>
      ) : null}

      {upcomingLessons.length > 0 ? (
        <View style={styles.memberLessonGroup}>
          {/* <Text style={styles.memberLessonGroupTitle}></Text> */}
          {upcomingLessons.map(({ slot, label }) => (
            <View key={`${label}-${slot.id}`} style={[styles.adminReservationRow, styles.timelineCardUpcoming]}>
              <View style={styles.adminReservationTime}>
                <Text style={styles.adminReservationDay}>{slot.shortDateLabel}</Text>
                <Text style={styles.adminReservationHour}>{formatSlotHour(slot.startsAt)}</Text>
              </View>
              <View style={styles.adminReservationCopy}>
                <Text style={styles.adminReservationName}>{label}</Text>
                <Text style={styles.adminReservationMeta}>
                  {slot.weekdayLabel} · {slot.instructor} 강사 · {formatLessonDuration(slot.durationMinutes)}
                </Text>
              </View>
              <Text style={[styles.timelineBadge, styles.timelineBadgeUpcoming]}>예정</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable style={styles.secondaryActionButton} onPress={onShowPastLessons}>
        <Feather name="clock" size={17} color={colors.blue700} />
        <Text style={styles.secondaryActionText}>지난 내 수업</Text>
      </Pressable>
    </View>
  );
}

function MemberPastLessonOverview({
  fixedLessonSlots,
  reservations,
  feedbacks
}: {
  fixedLessonSlots: ClassSlot[];
  reservations: ClassSlot[];
  feedbacks: LessonFeedback[];
}) {
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const feedbackBySlot = useMemo(() => new Map(feedbacks.map((feedback) => [feedback.slotId, feedback])), [feedbacks]);
  const pastLessons = useMemo(
    () =>
      [
        ...fixedLessonSlots
          .filter((slot) => !isUpcomingSlot(slot))
          .map((slot) => ({ slot, label: '고정 수업' })),
        ...reservations
          .filter((slot) => !isUpcomingSlot(slot))
          .map((slot) => ({ slot, label: slot.isActive ? '추가 수업' : '자유수영' }))
      ].sort((a, b) => new Date(b.slot.startsAt).getTime() - new Date(a.slot.startsAt).getTime()),
    [fixedLessonSlots, reservations]
  );

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>지난 내 수업</Text>
        <Text style={[styles.timelineBadge, styles.timelineBadgePast]}>{pastLessons.length}개 완료</Text>
      </View>

      {pastLessons.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="clock" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>지난 수업 내역이 없습니다.</Text>
        </View>
      ) : (
        pastLessons.map(({ slot, label }) => {
          const feedback = feedbackBySlot.get(slot.id);
          const feedbackOpen = Boolean(feedback && selectedFeedbackId === feedback.id);

          return (
            <View key={`${label}-${slot.id}`} style={styles.memberPastLessonItem}>
              <View style={[styles.adminReservationRow, styles.timelineCardPast]}>
                <View style={styles.adminReservationTime}>
                  <Text style={styles.adminReservationDay}>{slot.shortDateLabel}</Text>
                  <Text style={styles.adminReservationHour}>{formatSlotHour(slot.startsAt)}</Text>
                </View>
                <View style={styles.adminReservationCopy}>
                  <Text style={styles.adminReservationName}>{label}</Text>
                  <Text style={[styles.adminReservationMeta, styles.memberPastLessonMeta]} numberOfLines={1}>
                    {slot.shortDateLabel} {formatSlotHour(slot.startsAt)} · {slot.instructor} 강사 · {formatLessonDuration(slot.durationMinutes)}
                  </Text>
                </View>
                <Pressable
                  style={[styles.memberFeedbackButton, !feedback && styles.disabledButton]}
                  onPress={() => feedback && setSelectedFeedbackId(feedbackOpen ? null : feedback.id)}
                  disabled={!feedback}
                  accessibilityRole="button"
                >
                  <Text style={[styles.memberFeedbackButtonText, !feedback && styles.memberFeedbackButtonTextDisabled]}>
                    {feedback ? (feedbackOpen ? '닫기' : '피드백 보기') : '피드백 없음'}
                  </Text>
                </Pressable>
              </View>
              {feedbackOpen && feedback ? (
                <View style={[styles.feedbackCard, styles.memberInlineFeedbackCard]}>
                  <View style={styles.feedbackCardHeader}>
                    <View style={styles.feedbackCardTitleBlock}>
                      <Text style={styles.requestTitle}>피드백</Text>
                      <Text style={styles.requestMeta}>
                        {formatSlotBrief(feedback.startsAt)} · {feedback.instructor} 강사
                      </Text>
                    </View>
                  </View>
                  <LessonFeedbackMediaPreview uri={feedback.mediaUri} mediaType={feedback.mediaType ?? undefined} />
                  {feedback.feedbackText ? <Text style={styles.feedbackBody}>{feedback.feedbackText}</Text> : null}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

function MemberRequestSummary({
  pendingChangeRequests,
  recentChangeRequest,
  pendingAbsenceRequests,
  recentAbsenceRequest,
  pendingRequests,
  recentRequest,
  changeRequests,
  absenceRequests,
  assignmentRequests,
  onCancelChangeRequest,
  onCancelAbsenceRequest,
  onCancelAssignmentRequest,
  onShowAll,
  showAll = false
}: {
  pendingChangeRequests: LessonChangeRequest[];
  recentChangeRequest?: LessonChangeRequest;
  pendingAbsenceRequests: LessonAbsenceRequest[];
  recentAbsenceRequest?: LessonAbsenceRequest;
  pendingRequests: LessonAssignmentRequest[];
  recentRequest?: LessonAssignmentRequest;
  changeRequests: LessonChangeRequest[];
  absenceRequests: LessonAbsenceRequest[];
  assignmentRequests: LessonAssignmentRequest[];
  onCancelChangeRequest: (requestId: string) => Promise<void>;
  onCancelAbsenceRequest: (requestId: string) => Promise<void>;
  onCancelAssignmentRequest: (requestId: string) => Promise<void>;
  onShowAll?: () => void;
  showAll?: boolean;
}) {
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const pendingCount = pendingRequests.length + pendingChangeRequests.length + pendingAbsenceRequests.length;
  const allRequestItems = [
    ...changeRequests.map((request) => ({
      id: request.id,
      kind: 'change' as const,
      title: '수업 변경',
      meta: `${formatSlotBrief(request.sourceStartsAt)} → ${formatSlotBrief(request.targetStartsAt)}`,
      detail: `${request.sourceInstructor} 강사 → ${request.targetInstructor} 강사`,
      startsAt: request.targetStartsAt,
      createdAt: request.createdAt,
      status: request.status,
      request
    })),
    ...absenceRequests.map((request) => ({
      id: request.id,
      kind: 'absence' as const,
      title: '수업 취소 요청',
      meta: `${formatSlotBrief(request.startsAt)} · ${request.instructor} 강사`,
      detail: '',
      startsAt: request.startsAt,
      createdAt: request.createdAt,
      status: request.status,
      request
    })),
    ...assignmentRequests.map((request) => ({
      id: request.id,
      kind: 'assignment' as const,
      title: formatAssignmentRequestType(request.requestType),
      meta: `${formatSlotBrief(request.startsAt)} · ${request.instructor} 강사`,
      detail: request.reviewComment ? `관리자 메모: ${request.reviewComment}` : '',
      startsAt: request.startsAt,
      createdAt: request.createdAt,
      status: request.status,
      request
    }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const visibleRequestItems = showAll ? allRequestItems : allRequestItems.slice(0, 3);

  async function cancelAssignmentRequest(request: LessonAssignmentRequest) {
    if (cancelingId) {
      return;
    }

    try {
      setCancelingId(request.id);
      await onCancelAssignmentRequest(request.id);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '신청을 취소하지 못했습니다.';
      Alert.alert('취소 실패', message);
    } finally {
      setCancelingId(null);
    }
  }

  async function cancelChangeRequest(request: LessonChangeRequest) {
    if (cancelingId) {
      return;
    }

    try {
      setCancelingId(request.id);
      await onCancelChangeRequest(request.id);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '변경 요청을 취소하지 못했습니다.';
      Alert.alert('취소 실패', message);
    } finally {
      setCancelingId(null);
    }
  }

  async function cancelAbsenceRequest(request: LessonAbsenceRequest) {
    if (cancelingId) {
      return;
    }

    try {
      setCancelingId(request.id);
      await onCancelAbsenceRequest(request.id);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '수업 취소 요청을 취소하지 못했습니다.';
      Alert.alert('취소 실패', message);
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <View style={styles.feedbackCardTitleBlock}>
          <View style={styles.adminOverviewTitleRow}>
            <Text style={styles.adminOverviewTitle}>{showAll ? '전체 수업 요청' : '최근 수업 요청'}</Text>
            <InfoTooltip message="수업 취소, 추가수업, 자유수영 신청 내역입니다." />
          </View>
        </View>
        <Text style={[styles.timelineBadge, pendingCount > 0 ? styles.statusBadgePending : styles.statusBadgeSuccess]}>
          {pendingCount}건 대기
        </Text>
      </View>

      {visibleRequestItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="check-circle" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>수업 요청 내역이 없습니다.</Text>
        </View>
      ) : (
        visibleRequestItems.map((item) => {
          const canceling = cancelingId === item.id;
          const pending = item.status === 'pending';
          const past = isPastDate(item.startsAt);
          const badgeStyle = pending
            ? styles.statusBadgePending
            : item.status === 'approved'
              ? styles.statusBadgeSuccess
              : item.status === 'rejected'
                ? styles.statusBadgeDanger
                : styles.timelineBadgePast;
          const cardStyle = pending ? styles.timelineCardPending : past ? styles.timelineCardPast : styles.timelineCardUpcoming;
          const cancelLabel = item.kind === 'change' ? '변경 취소' : item.kind === 'absence' ? '요청 취소' : '신청 취소';
          const cancelRequest = () => {
            if (item.kind === 'change') {
              void cancelChangeRequest(item.request);
              return;
            }

            if (item.kind === 'absence') {
              void cancelAbsenceRequest(item.request);
              return;
            }

            void cancelAssignmentRequest(item.request);
          };

          return (
            <View key={`${item.kind}-${item.id}`} style={[styles.requestCard, cardStyle]}>
              <View style={styles.requestCardHeader}>
                <View style={styles.feedbackCardTitleBlock}>
                  <Text style={styles.requestTitle}>{item.title}</Text>
                  <Text style={styles.requestMeta}>{item.meta}</Text>
                </View>
                <Text style={[styles.timelineBadge, badgeStyle]}>{formatRequestStatus(item.status)}</Text>
              </View>
              {item.detail ? <Text style={styles.requestFootnote}>{item.detail}</Text> : null}
              <Text style={styles.requestMeta}>{formatNoticeDate(item.createdAt)}</Text>
              {pending ? (
                <Pressable
                  style={[styles.secondaryActionButton, canceling && styles.disabledButton]}
                  onPress={cancelRequest}
                  disabled={canceling}
                >
                  <Feather name="x-circle" size={17} color={colors.blue700} />
                  <Text style={styles.secondaryActionText}>{canceling ? '취소중' : cancelLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}

      {!showAll && onShowAll ? (
        <Pressable style={styles.secondaryActionButton} onPress={onShowAll}>
          <Feather name="list" size={17} color={colors.blue700} />
          <Text style={styles.secondaryActionText}>전체보기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MemberRequestOverview({
  requests,
  onCreateMemberRequest,
  onShowAll,
  showList = false,
  showComposer = !showList
}: {
  requests: MemberRequest[];
  onCreateMemberRequest: (input: CreateMemberRequestInput) => Promise<void>;
  onShowAll?: () => void;
  showList?: boolean;
  showComposer?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const activeCount = requests.filter((request) => request.status === 'pending' || request.status === 'reviewing').length;
  const visibleRequests = showList ? requests : [];

  async function submitRequest() {
    if (submitting) {
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (!trimmedTitle || !trimmedBody) {
      Alert.alert('문의 입력', '제목과 내용을 입력해주세요.');
      return;
    }

    try {
      setSubmitting(true);
      await onCreateMemberRequest({ title: trimmedTitle, body: trimmedBody });
      setTitle('');
      setBody('');
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '문의를 등록하지 못했습니다.';
      Alert.alert('등록 실패', message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <View style={styles.feedbackCardTitleBlock}>
          <Text style={styles.adminOverviewTitle}>{showList ? '문의 접수 내역' : '문의 접수'}</Text>
          <Text style={styles.requestMeta}>{showList ? '등록한 문의와 관리자 답변' : '관리자에게 전달할 내용을 작성하세요'}</Text>
        </View>
        <Text style={[styles.timelineBadge, activeCount > 0 ? styles.statusBadgePending : styles.statusBadgeSuccess]}>
          {activeCount}건 처리중
        </Text>
      </View>

      {showComposer ? (
        <View style={styles.requestCard}>
        <TextInput
          style={styles.input}
          placeholder="제목"
          placeholderTextColor={colors.muted}
          value={title}
          maxLength={60}
          onChangeText={setTitle}
          returnKeyType="next"
        />
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="문의하거나 요청할 내용을 입력해주세요"
          placeholderTextColor={colors.muted}
          value={body}
          maxLength={500}
          multiline
          textAlignVertical="top"
          onChangeText={setBody}
        />
        <Pressable
          style={[styles.secondaryActionButton, submitting && styles.disabledButton]}
          onPress={submitRequest}
          disabled={submitting}
        >
          <Feather name="send" size={17} color={colors.blue700} />
          <Text style={styles.secondaryActionText}>{submitting ? '등록중' : '문의 보내기'}</Text>
        </Pressable>
        {onShowAll ? (
          <Pressable style={styles.secondaryActionButton} onPress={onShowAll}>
            <Feather name="list" size={17} color={colors.blue700} />
            <Text style={styles.secondaryActionText}>전체보기</Text>
          </Pressable>
        ) : null}
      </View>
      ) : null}

      {showList && visibleRequests.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="message-square" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>등록한 문의가 없습니다.</Text>
        </View>
      ) : null}

      {showList ? (
        visibleRequests.map((request) => (
          <View key={request.id} style={[styles.requestCard, request.status === 'pending' || request.status === 'reviewing' ? styles.timelineCardPending : styles.timelineCardPast]}>
            <View style={styles.requestCardHeader}>
              <View style={styles.feedbackCardTitleBlock}>
                <Text style={styles.requestTitle}>{request.title}</Text>
                <Text style={styles.requestMeta}>{formatNoticeDate(request.createdAt)}</Text>
              </View>
              <Text
                style={[
                  styles.timelineBadge,
                  request.status === 'pending' || request.status === 'reviewing'
                    ? styles.statusBadgePending
                    : request.status === 'resolved'
                      ? styles.statusBadgeSuccess
                      : styles.statusBadgeDanger
                ]}
              >
                {formatMemberRequestStatus(request.status)}
              </Text>
            </View>
            <Text style={styles.feedbackBody}>{request.body}</Text>
            {request.adminReply ? <Text style={styles.requestFootnote}>관리자 답변: {request.adminReply}</Text> : null}
          </View>
        ))
      ) : null}
    </View>
  );
}

function MemberStoreOverview({
  products,
  orders,
  onCreateStoreOrder,
  onShowOrders
}: {
  products: StoreProduct[];
  orders: StoreOrder[];
  onCreateStoreOrder: (productId: string, quantity: number) => Promise<void>;
  onShowOrders: () => void;
}) {
  const [quantityByProduct, setQuantityByProduct] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const visibleProducts = products.filter((product) => product.isActive);
  const pendingOrderCount = orders.filter((order) => order.status === 'pending').length;

  function getQuantity(productId: string) {
    const rawValue = quantityByProduct[productId] ?? '1';
    const parsed = Number(rawValue.replace(/[^\d]/g, ''));

    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 99) : 1;
  }

  async function buyProduct(product: StoreProduct) {
    if (busyId) {
      return;
    }

    const quantity = getQuantity(product.id);

    try {
      setBusyId(product.id);
      await onCreateStoreOrder(product.id, quantity);
      setQuantityByProduct((current) => ({ ...current, [product.id]: '1' }));
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '구매 신청을 등록하지 못했습니다.';
      Alert.alert('구매 실패', message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <View style={styles.feedbackCardTitleBlock}>
          <View style={styles.adminOverviewTitleRow}>
            <Text style={styles.adminOverviewTitle}>수영용품 구매</Text>
            <InfoTooltip message="구매 신청 후 관리자가 확정하면 내 구매 신청에서 상태를 확인할 수 있습니다." />
          </View>
        </View>
        <Text style={[styles.timelineBadge, pendingOrderCount > 0 ? styles.statusBadgePending : styles.statusBadgeSuccess]}>
          {pendingOrderCount}건 대기
        </Text>
      </View>

      <Pressable style={styles.secondaryActionButton} onPress={onShowOrders}>
        <Feather name="shopping-bag" size={17} color={colors.blue700} />
        <Text style={styles.secondaryActionText}>내 구매 신청</Text>
      </Pressable>

      {visibleProducts.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="shopping-bag" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>판매 중인 상품이 없습니다.</Text>
        </View>
      ) : (
        visibleProducts.map((product) => {
          const busy = busyId === product.id;
          const soldOut = product.stockQuantity <= 0;

          return (
            <View key={product.id} style={styles.requestCard}>
              {product.imageUri ? <Image source={{ uri: product.imageUri }} style={styles.storeProductImage} resizeMode="cover" /> : null}
              <View style={styles.requestCardHeader}>
                <Text style={styles.requestTitle}>{product.name}</Text>
                <Text style={styles.requestMeta}>{formatWon(product.price)}</Text>
              </View>
              {product.description ? <Text style={styles.feedbackBody}>{product.description}</Text> : null}
              <Text style={styles.requestMeta}>재고 {product.stockQuantity}개</Text>
              <TextInput
                style={[styles.input, styles.storeQuantityInput]}
                value={quantityByProduct[product.id] ?? '1'}
                onChangeText={(value) => setQuantityByProduct((current) => ({ ...current, [product.id]: value.replace(/[^\d]/g, '') }))}
                keyboardType="number-pad"
                placeholder="수량"
                placeholderTextColor={colors.muted}
                maxLength={2}
              />
              <Pressable
                style={[styles.secondaryActionButton, (busy || soldOut) && styles.disabledButton]}
                onPress={() => buyProduct(product)}
                disabled={busy || soldOut}
              >
                <Feather name="shopping-cart" size={17} color={colors.blue700} />
                <Text style={styles.secondaryActionText}>{soldOut ? '품절' : busy ? '신청중' : '구매 신청'}</Text>
              </Pressable>
            </View>
          );
        })
      )}
    </View>
  );
}

function MemberStoreOrderOverview({
  orders,
  onCancelStoreOrder
}: {
  orders: StoreOrder[];
  onCancelStoreOrder: (orderId: string) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function cancelOrder(order: StoreOrder) {
    if (busyId) {
      return;
    }

    try {
      setBusyId(order.id);
      await onCancelStoreOrder(order.id);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '구매 신청을 취소하지 못했습니다.';
      Alert.alert('취소 실패', message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>내 구매 신청</Text>
        <Text style={styles.adminOverviewCount}>{orders.length}건</Text>
      </View>

      {orders.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="shopping-bag" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>구매 신청 내역이 없습니다.</Text>
        </View>
      ) : (
        orders.map((order) => {
          const pending = order.status === 'pending';
          const busy = busyId === order.id;
          const badgeStyle = pending
            ? styles.statusBadgePending
            : order.status === 'confirmed'
              ? styles.statusBadgeSuccess
              : styles.statusBadgeDanger;

          return (
            <View key={order.id} style={[styles.requestCard, pending ? styles.timelineCardPending : styles.timelineCardPast]}>
              <View style={styles.requestCardHeader}>
                <View style={styles.feedbackCardTitleBlock}>
                  <Text style={styles.requestTitle}>{order.productName}</Text>
                  <Text style={styles.requestMeta}>{formatNoticeDate(order.createdAt)}</Text>
                </View>
                <Text style={[styles.timelineBadge, badgeStyle]}>{formatStoreOrderStatus(order.status)}</Text>
              </View>
              <Text style={styles.requestMeta}>
                {order.quantity}개 · {formatWon(order.totalPrice)}
              </Text>
              {order.adminComment ? <Text style={styles.requestFootnote}>관리자 메모: {order.adminComment}</Text> : null}
              {pending ? (
                <Pressable
                  style={[styles.secondaryActionButton, busy && styles.disabledButton]}
                  onPress={() => cancelOrder(order)}
                  disabled={busy}
                >
                  <Feather name="x-circle" size={17} color={colors.blue700} />
                  <Text style={styles.secondaryActionText}>{busy ? '취소중' : '구매 신청 취소'}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

function MemberLessonFeedbackOverview({ feedbacks }: { feedbacks: LessonFeedback[] }) {
  const visibleFeedbacks = feedbacks.slice(0, 5);

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>수업 피드백</Text>
        <Text style={styles.adminOverviewCount}>{feedbacks.length}건</Text>
      </View>

      {visibleFeedbacks.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="message-square" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>아직 등록된 수업 피드백이 없습니다.</Text>
        </View>
      ) : (
        visibleFeedbacks.map((feedback) => (
          <View key={feedback.id} style={[styles.feedbackCard, styles.timelineCardPast]}>
            <View style={styles.feedbackCardHeader}>
              <View style={styles.feedbackCardTitleBlock}>
                <Text style={styles.requestTitle}>{formatSlotBrief(feedback.startsAt)}</Text>
                <Text style={styles.requestMeta}>
                  {feedback.instructor} 강사 · {feedback.createdByName ?? '관리자'}
                </Text>
              </View>
              <Feather name={feedback.mediaType === 'video' ? 'video' : feedback.mediaType === 'image' ? 'image' : 'message-circle'} size={18} color={colors.blue700} />
            </View>
            <LessonFeedbackMediaPreview uri={feedback.mediaUri} mediaType={feedback.mediaType ?? undefined} />
            {feedback.feedbackText ? <Text style={styles.feedbackBody}>{feedback.feedbackText}</Text> : null}
          </View>
        ))
      )}
    </View>
  );
}

function LessonFeedbackMediaPreview({
  uri,
  mediaType,
  compact = false
}: {
  uri?: string;
  mediaType?: LessonFeedbackMediaType;
  compact?: boolean;
}) {
  if (!uri || !mediaType) {
    return null;
  }

  if (mediaType === 'image') {
    return <Image source={{ uri }} style={[styles.feedbackImage, compact && styles.feedbackImageCompact]} resizeMode="cover" />;
  }

  return <FeedbackVideoPlayer uri={uri} compact={compact} />;
}

function FeedbackVideoPlayer({ uri, compact = false }: { uri: string; compact?: boolean }) {
  const player = useVideoPlayer(uri);

  return (
    <View style={[styles.feedbackVideoFrame, compact && styles.feedbackVideoFrameCompact]}>
      <VideoView
        style={styles.feedbackVideo}
        player={player}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
      />
    </View>
  );
}

function MemberSpecialLessonOverview({
  specialLessons,
  onApplySpecialLesson,
  onCancelSpecialLessonRegistration
}: {
  specialLessons: SpecialLesson[];
  onApplySpecialLesson: (specialLessonId: string) => Promise<SpecialLessonRegistrationStatus>;
  onCancelSpecialLessonRegistration: (registrationId: string) => Promise<void>;
}) {
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [lessonViewMode, setLessonViewMode] = useState<'upcoming' | 'past'>('upcoming');
  const now = Date.now();
  const upcomingLessons = specialLessons.filter((lesson) => new Date(lesson.startsAt).getTime() >= now);
  const pastLessons = specialLessons.filter((lesson) => new Date(lesson.startsAt).getTime() < now);
  const visibleLessons = lessonViewMode === 'upcoming' ? upcomingLessons : pastLessons;
  const selectedLessonLabel = lessonViewMode === 'upcoming' ? '예정' : '지난';
  const emptyLessonMessage = lessonViewMode === 'upcoming' ? '예정된 특별수업이 없습니다.' : '지난 특별수업이 없습니다.';

  async function applyLesson(lesson: SpecialLesson) {
    if (applyingId) {
      return;
    }

    Alert.alert('특별수업 신청', `${lesson.title} 특별수업을 신청할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '신청',
        onPress: async () => {
          try {
            setApplyingId(lesson.id);
            const status = await onApplySpecialLesson(lesson.id);
            Alert.alert(
              '신청 완료',
              status === 'waitlisted'
                ? '정원을 초과해 대기 순번으로 접수되었습니다.'
                : '정원 안 신청으로 접수되었습니다. 관리자 승인 후 참여가 확정됩니다.'
            );
          } catch (error) {
            const message = error instanceof DatabaseError ? error.message : '특별수업을 신청하지 못했습니다.';
            Alert.alert('신청 실패', message);
          } finally {
            setApplyingId(null);
          }
        }
      }
    ]);
  }

  async function cancelRegistration(lesson: SpecialLesson) {
    if (!lesson.myRegistrationId || cancelingId) {
      return;
    }

    try {
      setCancelingId(lesson.myRegistrationId);
      await onCancelSpecialLessonRegistration(lesson.myRegistrationId);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '특별수업 신청을 취소하지 못했습니다.';
      Alert.alert('취소 실패', message);
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>특별수업</Text>
        <Text style={styles.adminOverviewCount}>
          {selectedLessonLabel} {visibleLessons.length}개
        </Text>
      </View>

      <View style={styles.specialLessonFilterRow}>
        {[
          { id: 'upcoming' as const, label: '예정', count: upcomingLessons.length },
          { id: 'past' as const, label: '지난', count: pastLessons.length }
        ].map((filter) => {
          const selected = lessonViewMode === filter.id;

          return (
            <Pressable
              key={filter.id}
              style={[styles.specialLessonFilterButton, selected && styles.specialLessonFilterButtonActive]}
              onPress={() => setLessonViewMode(filter.id)}
              accessibilityRole="button"
            >
              <Text style={[styles.specialLessonFilterText, selected && styles.specialLessonFilterTextActive]}>
                {filter.label} {filter.count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {visibleLessons.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="star" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>{emptyLessonMessage}</Text>
        </View>
      ) : (
        visibleLessons.map((lesson) => {
          const applied = Boolean(lesson.myRegistrationId);
          const lessonStarted = new Date(lesson.startsAt).getTime() <= Date.now();
          const canCancel = !lessonStarted && (lesson.myStatus === 'pending' || lesson.myStatus === 'waitlisted');
          const canApply = !applied && !lessonStarted;
          const statusText = lessonStarted ? '지난 수업' : formatSpecialLessonStatus(lesson.myStatus);
          const queueText = lesson.myQueuePosition
            ? `선착순 ${lesson.myQueuePosition}번 · ${lesson.myQueuePosition <= lesson.capacity ? '정원 안' : '대기'}`
            : `${lesson.approvedCount}/${lesson.capacity}명 확정`;
          const applying = applyingId === lesson.id;
          const canceling = Boolean(lesson.myRegistrationId && cancelingId === lesson.myRegistrationId);
          const busy = applying || canceling;

          return (
            <View key={lesson.id} style={[styles.requestCard, lessonStarted ? styles.timelineCardPast : styles.timelineCardUpcoming]}>
              {lesson.imageUri ? (
                <Image source={{ uri: lesson.imageUri }} style={styles.specialLessonPoster} resizeMode="cover" />
              ) : null}
              <View style={styles.specialLessonHeader}>
                <View style={styles.feedbackCardTitleBlock}>
                  <Text style={styles.requestTitle}>{lesson.title}</Text>
                  <Text style={styles.requestMeta}>
                    {formatSlotBrief(lesson.startsAt)} · {lesson.instructor || '담당 강사 미정'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.timelineBadge,
                    lessonStarted
                      ? styles.timelineBadgePast
                      : lesson.myStatus === 'approved'
                        ? styles.statusBadgeSuccess
                        : lesson.myStatus === 'pending' || lesson.myStatus === 'waitlisted'
                          ? styles.statusBadgePending
                          : styles.timelineBadgeUpcoming
                  ]}
                >
                  {statusText}
                </Text>
              </View>
              {lesson.description ? <Text style={styles.feedbackBody}>{lesson.description}</Text> : null}
              <Text style={styles.requestMeta}>
                모집 {lesson.capacity}명 · 신청 {lesson.applicationCount}명 · {queueText}
              </Text>
              {applied && canCancel ? (
                <Pressable
                  style={[styles.secondaryActionButton, busy && styles.disabledButton]}
                  onPress={() => cancelRegistration(lesson)}
                  disabled={busy}
                >
                  <Feather name="x-circle" size={17} color={colors.blue700} />
                  <Text style={styles.secondaryActionText}>신청 취소</Text>
                </Pressable>
              ) : canApply ? (
                <Pressable
                  style={[styles.secondaryActionButton, busy && styles.disabledButton]}
                  onPress={() => applyLesson(lesson)}
                  disabled={busy}
                >
                  <Feather name="star" size={17} color={colors.blue700} />
                  <Text style={styles.secondaryActionText}>{applying ? '신청중' : '특별수업 신청'}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

function AdminHomeScreen({
  slots,
  members,
  notices,
  openSlots,
  changeRequests,
  absenceRequests,
  assignmentRequests,
  lessonFeedbackTargets,
  instructorLessonTimes,
  specialLessons,
  specialLessonRegistrations,
  memberRequests,
  storeProducts,
  storeOrders,
  onAdjustMemberPass,
  onUpdateMemberPassProduct,
  onSaveFixedLesson,
  onCancelFixedLesson,
  onUpdateLessonInstructor,
  onCreateLessonSlot,
  onUpdateLessonSlot,
  onAssignLessonReservation,
  onCancelLessonReservation,
  onCancelLessonSlot,
  onSaveInstructorLessonTime,
  onCancelInstructorLessonTime,
  onReviewChangeRequest,
  onReviewAbsenceRequest,
  onReviewAssignmentRequest,
  onPublishLessonFeedback,
  onCreateSpecialLesson,
  onUpdateSpecialLesson,
  onReviewSpecialLessonRegistration,
  onReviewMemberRequest,
  onCreateStoreProduct,
  onReviewStoreOrder,
  onNoticePress
}: {
  slots: ClassSlot[];
  members: MemberSummary[];
  notices: Notice[];
  openSlots: ClassSlot[];
  changeRequests: LessonChangeRequest[];
  absenceRequests: LessonAbsenceRequest[];
  assignmentRequests: LessonAssignmentRequest[];
  lessonFeedbackTargets: LessonFeedbackTarget[];
  instructorLessonTimes: InstructorLessonTime[];
  specialLessons: SpecialLesson[];
  specialLessonRegistrations: SpecialLessonRegistration[];
  memberRequests: MemberRequest[];
  storeProducts: StoreProduct[];
  storeOrders: StoreOrder[];
  onAdjustMemberPass: (memberId: string, amount: number) => Promise<void>;
  onUpdateMemberPassProduct: (memberId: string, lessonCapacity: number) => Promise<void>;
  onSaveFixedLesson: (
    memberId: string,
    weekday: number,
    hour: number,
    minute: number,
    durationMinutes: number,
    fixedLessonId?: string | null
  ) => Promise<void>;
  onCancelFixedLesson: (fixedLessonId: string) => Promise<void>;
  onUpdateLessonInstructor: (slotId: string, instructor: string) => Promise<void>;
  onCreateLessonSlot: (slotDate: string, hour: number, minute: number, instructor: string, durationMinutes: number) => Promise<void>;
  onUpdateLessonSlot: (slotId: string, instructor: string, durationMinutes: number, capacity: number) => Promise<void>;
  onAssignLessonReservation: (slotId: string, memberId: string, durationMinutes: number) => Promise<void>;
  onCancelLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonSlot: (slotId: string) => Promise<void>;
  onSaveInstructorLessonTime: (input: SaveInstructorLessonTimeInput) => Promise<void>;
  onCancelInstructorLessonTime: (timeId: string) => Promise<void>;
  onReviewChangeRequest: (requestId: string, approved: boolean) => Promise<void>;
  onReviewAbsenceRequest: (requestId: string, approved: boolean) => Promise<void>;
  onReviewAssignmentRequest: (requestId: string, approved: boolean, comment?: string) => Promise<void>;
  onPublishLessonFeedback: (input: PublishLessonFeedbackInput) => Promise<void>;
  onCreateSpecialLesson: (input: CreateSpecialLessonInput) => Promise<void>;
  onUpdateSpecialLesson: (input: UpdateSpecialLessonInput) => Promise<void>;
  onReviewSpecialLessonRegistration: (registrationId: string, approved: boolean) => Promise<void>;
  onReviewMemberRequest: (requestId: string, status: MemberRequestStatus, reply?: string) => Promise<void>;
  onCreateStoreProduct: (input: CreateStoreProductInput) => Promise<void>;
  onReviewStoreOrder: (orderId: string, approved: boolean, comment?: string) => Promise<void>;
  onNoticePress: () => void;
}) {
  const [selectedSection, setSelectedSection] = useState<AdminHomeSection>('requests');
  const fixedLessonCount = members.reduce((count, member) => count + member.fixedLessonCount, 0);
  const openSeatTotal = openSlots.reduce((count, slot) => count + slot.openSeatCount, 0);
  const substituteCount = slots.reduce((count, slot) => count + slot.substitutes.length, 0);
  const pendingAbsenceCount = absenceRequests.filter((request) => request.status === 'pending').length;
  const pendingAssignmentCount = assignmentRequests.filter((request) => request.status === 'pending').length;
  const pendingChangeCount = changeRequests.filter((request) => request.status === 'pending').length;
  const pendingMemberRequestCount = memberRequests.filter((request) => request.status === 'pending' || request.status === 'reviewing').length;
  const pendingRequestTotal = pendingAbsenceCount + pendingAssignmentCount + pendingChangeCount + pendingMemberRequestCount;
  const pendingSpecialRegistrationCount = specialLessonRegistrations.filter((registration) => registration.status === 'pending' || registration.status === 'waitlisted').length;
  const pendingFeedbackCount = lessonFeedbackTargets.filter((target) => !target.feedbackId).length;
  const pendingStoreOrderCount = storeOrders.filter((order) => order.status === 'pending').length;
  const adminMenuOptions: Array<HomeMenuOption<AdminHomeSection>> = [
    { id: 'requests', label: '승인 요청', description: '취소·신청·문의', icon: 'inbox', count: pendingRequestTotal },
    { id: 'members', label: '회원 관리', description: '회원권·고정수업', icon: 'users', count: members.length },
    { id: 'instructors', label: '강사', description: '요일·시간 배정', icon: 'briefcase', count: new Set(instructorLessonTimes.map((time) => time.instructor)).size },
    { id: 'content', label: '콘텐츠', description: '특별수업·피드백', icon: 'edit-3', count: pendingSpecialRegistrationCount + pendingFeedbackCount },
    { id: 'store', label: '상품 판매', description: '상품·구매 확정', icon: 'shopping-bag', count: pendingStoreOrderCount }
  ];

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{members.length}</Text>
          <Text style={styles.summaryLabel}>회원</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{fixedLessonCount}</Text>
          <Text style={styles.summaryLabel}>고정수업</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{openSeatTotal}</Text>
          <Text style={styles.summaryLabel}>빈자리</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{substituteCount}</Text>
          <Text style={styles.summaryLabel}>대체</Text>
        </View>
      </View>

      <HomeSectionMenu options={adminMenuOptions} selectedId={selectedSection} onSelect={setSelectedSection} />

      {selectedSection === 'requests' ? (
        pendingRequestTotal > 0 ? (
          <>
            {pendingAbsenceCount > 0 ? <AdminAbsenceRequestOverview requests={absenceRequests} onReviewAbsenceRequest={onReviewAbsenceRequest} /> : null}
            {pendingAssignmentCount > 0 ? <AdminAssignmentRequestOverview requests={assignmentRequests} onReviewAssignmentRequest={onReviewAssignmentRequest} /> : null}
            {pendingChangeCount > 0 ? <AdminChangeRequestOverview requests={changeRequests} onReviewChangeRequest={onReviewChangeRequest} /> : null}
            {pendingMemberRequestCount > 0 ? <AdminMemberRequestOverview requests={memberRequests} onReviewMemberRequest={onReviewMemberRequest} /> : null}
          </>
        ) : (
          <HomeEmptyPanel icon="check-circle" message="처리할 요청이 없습니다." />
        )
      ) : null}

      {selectedSection === 'members' ? (
        <AdminMemberOverview
          slots={slots}
          members={members}
          onAdjustMemberPass={onAdjustMemberPass}
          onUpdateMemberPassProduct={onUpdateMemberPassProduct}
          onSaveFixedLesson={onSaveFixedLesson}
          onCancelFixedLesson={onCancelFixedLesson}
        />
      ) : null}

      {selectedSection === 'instructors' ? (
        <AdminInstructorOverview
          slots={slots}
          instructorLessonTimes={instructorLessonTimes}
          onSaveInstructorLessonTime={onSaveInstructorLessonTime}
          onCancelInstructorLessonTime={onCancelInstructorLessonTime}
        />
      ) : null}

      {selectedSection === 'content' ? (
        <>
          <AdminSpecialLessonOverview
            specialLessons={specialLessons}
            registrations={specialLessonRegistrations}
            onCreateSpecialLesson={onCreateSpecialLesson}
            onUpdateSpecialLesson={onUpdateSpecialLesson}
            onReviewSpecialLessonRegistration={onReviewSpecialLessonRegistration}
          />
          <AdminLessonFeedbackOverview targets={lessonFeedbackTargets} onPublishLessonFeedback={onPublishLessonFeedback} />
          <SectionHeader title="최근 공지" actionLabel="전체" onAction={onNoticePress} />
          {notices.length > 0 ? (
            notices.slice(0, 1).map((notice) => <NoticeCard key={notice.id} notice={notice} compact />)
          ) : (
            <HomeEmptyPanel icon="bell" message="등록된 공지가 없습니다." />
          )}
        </>
      ) : null}

      {selectedSection === 'store' ? (
        <AdminStoreOverview
          products={storeProducts}
          orders={storeOrders}
          onCreateStoreProduct={onCreateStoreProduct}
          onReviewStoreOrder={onReviewStoreOrder}
        />
      ) : null}
    </KeyboardAwareScrollView>
  );
}

function AdminMemberRequestOverview({
  requests,
  onReviewMemberRequest
}: {
  requests: MemberRequest[];
  onReviewMemberRequest: (requestId: string, status: MemberRequestStatus, reply?: string) => Promise<void>;
}) {
  const [replyByRequest, setReplyByRequest] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const pendingRequests = requests.filter((request) => request.status === 'pending' || request.status === 'reviewing');
  const recentRequest = requests.find((request) => request.status === 'resolved' || request.status === 'rejected');

  async function review(request: MemberRequest, status: MemberRequestStatus) {
    if (reviewingId) {
      return;
    }

    try {
      setReviewingId(request.id);
      await onReviewMemberRequest(request.id, status, replyByRequest[request.id]?.trim() ?? '');
      setReplyByRequest((current) => ({ ...current, [request.id]: '' }));
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '요구사항을 처리하지 못했습니다.';
      Alert.alert('처리 실패', message);
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>회원 요구사항</Text>
        <Text style={styles.adminOverviewCount}>{pendingRequests.length}건</Text>
      </View>

      {pendingRequests.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="message-square" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>처리할 회원 요구사항이 없습니다.</Text>
        </View>
      ) : (
        pendingRequests.map((request) => {
          const reviewing = reviewingId === request.id;

          return (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestCardHeader}>
                <View style={styles.feedbackCardTitleBlock}>
                  <Text style={styles.requestTitle}>{request.title}</Text>
                  <Text style={styles.requestMeta}>
                    {request.userName} · {formatNoticeDate(request.createdAt)}
                  </Text>
                </View>
                <Text style={styles.specialStatusBadge}>{formatMemberRequestStatus(request.status)}</Text>
              </View>
              <Text style={styles.feedbackBody}>{request.body}</Text>
              <TextInput
                style={[styles.input, styles.reviewCommentInput]}
                value={replyByRequest[request.id] ?? ''}
                onChangeText={(value) => setReplyByRequest((current) => ({ ...current, [request.id]: value }))}
                placeholder="답변 메모"
                placeholderTextColor={colors.muted}
                maxLength={200}
              />
              <View style={styles.requestActions}>
                <Pressable
                  style={[styles.requestRejectButton, reviewing && styles.disabledButton]}
                  onPress={() => review(request, 'rejected')}
                  disabled={reviewing}
                >
                  <Feather name="x" size={16} color={colors.danger} />
                  <Text style={styles.requestRejectText}>거절</Text>
                </Pressable>
                <Pressable
                  style={[styles.requestNeutralButton, reviewing && styles.disabledButton]}
                  onPress={() => review(request, 'reviewing')}
                  disabled={reviewing}
                >
                  <Feather name="clock" size={16} color={colors.blue700} />
                  <Text style={styles.secondaryActionText}>처리중</Text>
                </Pressable>
                <Pressable
                  style={[styles.requestApproveButton, reviewing && styles.disabledButton]}
                  onPress={() => review(request, 'resolved')}
                  disabled={reviewing}
                >
                  <Feather name="check" size={16} color={colors.white} />
                  <Text style={styles.requestApproveText}>해결</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      {pendingRequests.length === 0 && recentRequest ? (
        <Text style={styles.requestFootnote}>
          최근 처리: {recentRequest.userName} · {formatMemberRequestStatus(recentRequest.status)}
        </Text>
      ) : null}
    </View>
  );
}

function AdminStoreOverview({
  products,
  orders,
  onCreateStoreProduct,
  onReviewStoreOrder
}: {
  products: StoreProduct[];
  orders: StoreOrder[];
  onCreateStoreProduct: (input: CreateStoreProductInput) => Promise<void>;
  onReviewStoreOrder: (orderId: string, approved: boolean, comment?: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [price, setPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [commentByOrder, setCommentByOrder] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const pendingOrders = orders.filter((order) => order.status === 'pending');
  const visibleProducts = products.slice(0, 4);

  async function createProduct() {
    if (creating) {
      return;
    }

    const trimmedName = name.trim();
    const nextPrice = Number(price.replace(/[^\d]/g, ''));
    const nextStock = Number(stockQuantity.replace(/[^\d]/g, ''));

    if (!trimmedName || !Number.isFinite(nextPrice) || !Number.isFinite(nextStock)) {
      Alert.alert('상품 입력', '상품명, 가격, 재고를 입력해주세요.');
      return;
    }

    try {
      setCreating(true);
      await onCreateStoreProduct({
        name: trimmedName,
        description: description.trim(),
        imageUri,
        price: nextPrice,
        stockQuantity: nextStock
      });
      setName('');
      setDescription('');
      setImageUri(undefined);
      setPrice('');
      setStockQuantity('');
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '상품을 등록하지 못했습니다.';
      Alert.alert('등록 실패', message);
    } finally {
      setCreating(false);
    }
  }

  async function pickStoreProductImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('사진 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.86
    });

    if (!result.canceled) {
      setImageUri(result.assets[0]?.uri);
    }
  }

  async function reviewOrder(order: StoreOrder, approved: boolean) {
    if (reviewingId) {
      return;
    }

    try {
      setReviewingId(order.id);
      await onReviewStoreOrder(order.id, approved, commentByOrder[order.id]?.trim() ?? '');
      setCommentByOrder((current) => ({ ...current, [order.id]: '' }));
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '구매 신청을 처리하지 못했습니다.';
      Alert.alert('처리 실패', message);
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>상품 판매</Text>
        <Text style={styles.adminOverviewCount}>{pendingOrders.length}건 대기</Text>
      </View>

      <View style={styles.requestCard}>
        <Text style={styles.requestTitle}>상품 등록</Text>
        <TextInput
          style={styles.input}
          placeholder="상품명"
          placeholderTextColor={colors.muted}
          value={name}
          maxLength={60}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="상품 설명"
          placeholderTextColor={colors.muted}
          value={description}
          maxLength={300}
          onChangeText={setDescription}
        />
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.storeProductImagePreview} resizeMode="cover" /> : null}
        <Pressable style={styles.secondaryActionButton} onPress={pickStoreProductImage}>
          <Feather name="image" size={17} color={colors.blue700} />
          <Text style={styles.secondaryActionText}>{imageUri ? '상품 이미지 변경' : '상품 이미지 등록'}</Text>
        </Pressable>
        <View style={styles.requestActions}>
          <TextInput
            style={[styles.input, styles.storeNumberInput]}
            placeholder="가격"
            placeholderTextColor={colors.muted}
            value={price}
            keyboardType="number-pad"
            onChangeText={(value) => setPrice(value.replace(/[^\d]/g, ''))}
          />
          <TextInput
            style={[styles.input, styles.storeNumberInput]}
            placeholder="재고"
            placeholderTextColor={colors.muted}
            value={stockQuantity}
            keyboardType="number-pad"
            onChangeText={(value) => setStockQuantity(value.replace(/[^\d]/g, ''))}
          />
        </View>
        <Pressable style={[styles.secondaryActionButton, creating && styles.disabledButton]} onPress={createProduct} disabled={creating}>
          <Feather name="plus-circle" size={17} color={colors.blue700} />
          <Text style={styles.secondaryActionText}>{creating ? '등록중' : '상품 등록'}</Text>
        </Pressable>
      </View>

      {pendingOrders.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="shopping-bag" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>승인 대기 중인 구매 신청이 없습니다.</Text>
        </View>
      ) : (
        pendingOrders.map((order) => {
          const reviewing = reviewingId === order.id;

          return (
            <View key={order.id} style={styles.requestCard}>
              <View style={styles.requestCardHeader}>
                <View style={styles.feedbackCardTitleBlock}>
                  <Text style={styles.requestTitle}>{order.productName}</Text>
                  <Text style={styles.requestMeta}>
                    {order.userName} · {order.quantity}개 · {formatWon(order.totalPrice)}
                  </Text>
                </View>
                <Text style={styles.specialStatusBadge}>{formatStoreOrderStatus(order.status)}</Text>
              </View>
              <TextInput
                style={[styles.input, styles.reviewCommentInput]}
                value={commentByOrder[order.id] ?? ''}
                onChangeText={(value) => setCommentByOrder((current) => ({ ...current, [order.id]: value }))}
                placeholder="처리 메모"
                placeholderTextColor={colors.muted}
                maxLength={200}
              />
              <View style={styles.requestActions}>
                <Pressable
                  style={[styles.requestRejectButton, reviewing && styles.disabledButton]}
                  onPress={() => reviewOrder(order, false)}
                  disabled={reviewing}
                >
                  <Feather name="x" size={16} color={colors.danger} />
                  <Text style={styles.requestRejectText}>취소</Text>
                </Pressable>
                <Pressable
                  style={[styles.requestApproveButton, reviewing && styles.disabledButton]}
                  onPress={() => reviewOrder(order, true)}
                  disabled={reviewing}
                >
                  <Feather name="check" size={16} color={colors.white} />
                  <Text style={styles.requestApproveText}>확정</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      {visibleProducts.length > 0 ? (
        <View style={styles.requestListSpacing}>
          <Text style={styles.requestTitle}>등록 상품</Text>
          {visibleProducts.map((product) => (
            <View key={product.id} style={styles.adminReservationRow}>
              {product.imageUri ? <Image source={{ uri: product.imageUri }} style={styles.storeProductThumb} resizeMode="cover" /> : null}
              <View style={styles.adminReservationCopy}>
                <Text style={styles.adminReservationName}>{product.name}</Text>
                <Text style={styles.adminReservationMeta}>
                  {formatWon(product.price)} · 재고 {product.stockQuantity}개
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AdminChangeRequestOverview({
  requests,
  onReviewChangeRequest
}: {
  requests: LessonChangeRequest[];
  onReviewChangeRequest: (requestId: string, approved: boolean) => Promise<void>;
}) {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const pendingRequests = requests.filter((request) => request.status === 'pending');

  async function review(request: LessonChangeRequest, approved: boolean) {
    if (reviewingId) {
      return;
    }

    try {
      setReviewingId(request.id);
      await onReviewChangeRequest(request.id, approved);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '변경 요청을 처리하지 못했습니다.';
      Alert.alert('처리 실패', message);
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>변경 요청</Text>
        <Text style={styles.adminOverviewCount}>{pendingRequests.length}건</Text>
      </View>

      {pendingRequests.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="inbox" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>승인 대기 중인 요청이 없습니다.</Text>
        </View>
      ) : (
        pendingRequests.map((request) => {
          const reviewing = reviewingId === request.id;

          return (
            <View key={request.id} style={styles.requestCard}>
              <Text style={styles.requestTitle}>{request.userName}</Text>
              <Text style={styles.requestMeta}>
                {formatSlotBrief(request.sourceStartsAt)} → {formatSlotBrief(request.targetStartsAt)}
              </Text>
              <Text style={styles.requestMeta}>
                {request.sourceInstructor} 강사 → {request.targetInstructor} 강사
              </Text>
              <View style={styles.requestActions}>
                <Pressable
                  style={[styles.requestRejectButton, reviewing && styles.disabledButton]}
                  onPress={() => review(request, false)}
                  disabled={reviewing}
                >
                  <Feather name="x" size={16} color={colors.danger} />
                  <Text style={styles.requestRejectText}>거절</Text>
                </Pressable>
                <Pressable
                  style={[styles.requestApproveButton, reviewing && styles.disabledButton]}
                  onPress={() => review(request, true)}
                  disabled={reviewing}
                >
                  <Feather name="check" size={16} color={colors.white} />
                  <Text style={styles.requestApproveText}>승인</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

function AdminAbsenceRequestOverview({
  requests,
  onReviewAbsenceRequest
}: {
  requests: LessonAbsenceRequest[];
  onReviewAbsenceRequest: (requestId: string, approved: boolean) => Promise<void>;
}) {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const pendingRequests = requests.filter((request) => request.status === 'pending');

  async function review(request: LessonAbsenceRequest, approved: boolean) {
    if (reviewingId) {
      return;
    }

    try {
      setReviewingId(request.id);
      await onReviewAbsenceRequest(request.id, approved);

      if (approved) {
        await sendLocalNotification('수업 취소 승인', `${request.userName} 회원의 ${formatSlotBrief(request.startsAt)} 수업 취소를 승인했습니다.`);
      }
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '수업 취소 요청을 처리하지 못했습니다.';
      Alert.alert('처리 실패', message);
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>수업 취소 요청</Text>
        <Text style={styles.adminOverviewCount}>{pendingRequests.length}건</Text>
      </View>

      {pendingRequests.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="inbox" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>승인 대기 중인 수업 취소 요청이 없습니다.</Text>
        </View>
      ) : (
        pendingRequests.map((request) => {
          const reviewing = reviewingId === request.id;

          return (
            <View key={request.id} style={styles.requestCard}>
              <Text style={styles.requestTitle}>{request.userName} · 수업 취소 요청</Text>
              <Text style={styles.requestMeta}>
                {formatSlotBrief(request.startsAt)} · {request.instructor} 강사
              </Text>
              <View style={styles.requestActions}>
                <Pressable
                  style={[styles.requestRejectButton, reviewing && styles.disabledButton]}
                  onPress={() => review(request, false)}
                  disabled={reviewing}
                >
                  <Feather name="x" size={16} color={colors.danger} />
                  <Text style={styles.requestRejectText}>거절</Text>
                </Pressable>
                <Pressable
                  style={[styles.requestApproveButton, reviewing && styles.disabledButton]}
                  onPress={() => review(request, true)}
                  disabled={reviewing}
                >
                  <Feather name="check" size={16} color={colors.white} />
                  <Text style={styles.requestApproveText}>승인</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

function AdminAssignmentRequestOverview({
  requests,
  onReviewAssignmentRequest
}: {
  requests: LessonAssignmentRequest[];
  onReviewAssignmentRequest: (requestId: string, approved: boolean, comment?: string) => Promise<void>;
}) {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const pendingRequests = requests.filter((request) => request.status === 'pending');

  async function review(request: LessonAssignmentRequest, approved: boolean) {
    if (reviewingId) {
      return;
    }

    try {
      setReviewingId(request.id);
      const comment = reviewComments[request.id]?.trim() ?? '';
      await onReviewAssignmentRequest(request.id, approved, comment);
      setReviewComments((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });

      if (approved) {
        await sendLocalNotification(
          '배정 완료',
          `${request.userName} 회원의 ${formatAssignmentRequestType(request.requestType)} 신청을 승인했습니다.`
        );
      }
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '신청을 처리하지 못했습니다.';
      Alert.alert('처리 실패', message);
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>수업/자유수영 신청</Text>
        <Text style={styles.adminOverviewCount}>{pendingRequests.length}건</Text>
      </View>

      {pendingRequests.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="inbox" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>승인 대기 중인 신청이 없습니다.</Text>
        </View>
      ) : (
        pendingRequests.map((request) => {
          const reviewing = reviewingId === request.id;

          return (
            <View key={request.id} style={styles.requestCard}>
              <Text style={styles.requestTitle}>
                {request.userName} · {formatAssignmentRequestType(request.requestType)}
              </Text>
              <Text style={styles.requestMeta}>
                {formatSlotBrief(request.startsAt)} · {request.instructor} 강사
              </Text>
              <TextInput
                style={[styles.input, styles.reviewCommentInput]}
                value={reviewComments[request.id] ?? ''}
                onChangeText={(value) => setReviewComments((current) => ({ ...current, [request.id]: value.slice(0, 120) }))}
                placeholder="회원에게 전달할 코멘트"
                placeholderTextColor={colors.muted}
                multiline
                maxLength={120}
              />
              <View style={styles.requestActions}>
                <Pressable
                  style={[styles.requestRejectButton, reviewing && styles.disabledButton]}
                  onPress={() => review(request, false)}
                  disabled={reviewing}
                >
                  <Feather name="x" size={16} color={colors.danger} />
                  <Text style={styles.requestRejectText}>거절</Text>
                </Pressable>
                <Pressable
                  style={[styles.requestApproveButton, reviewing && styles.disabledButton]}
                  onPress={() => review(request, true)}
                  disabled={reviewing}
                >
                  <Feather name="check" size={16} color={colors.white} />
                  <Text style={styles.requestApproveText}>승인</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

function AdminSpecialLessonOverview({
  specialLessons,
  registrations,
  onCreateSpecialLesson,
  onUpdateSpecialLesson,
  onReviewSpecialLessonRegistration
}: {
  specialLessons: SpecialLesson[];
  registrations: SpecialLessonRegistration[];
  onCreateSpecialLesson: (input: CreateSpecialLessonInput) => Promise<void>;
  onUpdateSpecialLesson: (input: UpdateSpecialLessonInput) => Promise<void>;
  onReviewSpecialLessonRegistration: (registrationId: string, approved: boolean) => Promise<void>;
}) {
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [lessonDate, setLessonDate] = useState(getTodayKey());
  const [lessonTime, setLessonTime] = useState('19:00');
  const [instructor, setInstructor] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [capacity, setCapacity] = useState('8');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [creating, setCreating] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const pendingRegistrations = registrations.filter((registration) => registration.status === 'pending' || registration.status === 'waitlisted');
  const activeRegistrationCount = registrations.filter((registration) => registration.status !== 'rejected' && registration.status !== 'canceled').length;
  const editingLesson = editingLessonId ? specialLessons.find((lesson) => lesson.id === editingLessonId) ?? null : null;
  const posterPreviewUri = imageUri ?? editingLesson?.imageUri;

  function resetLessonForm() {
    setEditingLessonId(null);
    setTitle('');
    setDescription('');
    setLessonDate(getTodayKey());
    setLessonTime('19:00');
    setInstructor('');
    setImageUri(undefined);
    setCapacity('8');
    setDurationMinutes(60);
  }

  function startEditLesson(lesson: SpecialLesson) {
    setEditingLessonId(lesson.id);
    setTitle(lesson.title);
    setDescription(lesson.description);
    setLessonDate(getDateKey(lesson.startsAt));
    setLessonTime(formatSlotHour(lesson.startsAt));
    setInstructor(lesson.instructor);
    setImageUri(undefined);
    setCapacity(String(lesson.capacity));
    setDurationMinutes(lesson.durationMinutes);
  }

  async function submitLesson() {
    if (creating) {
      return;
    }

    const startsAt = buildKoreaDateTimeIso(lessonDate, lessonTime);
    const nextCapacity = Number(capacity);

    if (!startsAt) {
      Alert.alert('일시 확인', '특별수업 날짜와 시간을 확인해주세요.');
      return;
    }

    if (!Number.isInteger(nextCapacity) || nextCapacity < 1 || nextCapacity > 99) {
      Alert.alert('모집 인원 확인', '모집 인원은 1명에서 99명 사이로 입력해주세요.');
      return;
    }

    try {
      setCreating(true);
      const input = {
        title,
        description,
        imageUri,
        startsAt,
        instructor,
        durationMinutes,
        capacity: nextCapacity
      };

      if (editingLessonId) {
        await onUpdateSpecialLesson({ ...input, id: editingLessonId });
      } else {
        await onCreateSpecialLesson(input);
      }

      resetLessonForm();
      Alert.alert(editingLessonId ? '특별수업 수정' : '특별수업 등록', editingLessonId ? '특별수업 정보가 수정되었습니다.' : '회원에게 특별수업 모집이 노출됩니다.');
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '특별수업을 저장하지 못했습니다.';
      Alert.alert(editingLessonId ? '수정 실패' : '등록 실패', message);
    } finally {
      setCreating(false);
    }
  }

  async function pickSpecialLessonImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('사진 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.86
    });

    if (!result.canceled) {
      setImageUri(result.assets[0]?.uri);
    }
  }

  async function reviewRegistration(registration: SpecialLessonRegistration, approved: boolean) {
    if (reviewingId) {
      return;
    }

    try {
      setReviewingId(registration.id);
      await onReviewSpecialLessonRegistration(registration.id, approved);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '특별수업 신청을 처리하지 못했습니다.';
      Alert.alert('처리 실패', message);
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>{editingLessonId ? '특별수업 수정' : '특별수업 모집'}</Text>
        <Text style={styles.adminOverviewCount}>{pendingRegistrations.length}건 대기</Text>
      </View>

      <View style={styles.feedbackComposer}>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="특별수업명"
          placeholderTextColor={colors.muted}
        />
        <View style={styles.calendarAddRow}>
          <TextInput
            style={[styles.input, styles.calendarDateInput]}
            value={lessonDate}
            onChangeText={setLessonDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, styles.fixedLessonSmallInput]}
            value={lessonTime}
            onChangeText={setLessonTime}
            placeholder="19:00"
            placeholderTextColor={colors.muted}
          />
          <TextInput
            style={[styles.input, styles.fixedLessonSmallInput]}
            value={capacity}
            onChangeText={setCapacity}
            keyboardType="number-pad"
            placeholder="인원"
            placeholderTextColor={colors.muted}
          />
        </View>
        <TextInput
          style={styles.input}
          value={instructor}
          onChangeText={setInstructor}
          placeholder="담당 강사"
          placeholderTextColor={colors.muted}
        />
        <TextInput
          style={[styles.input, styles.feedbackTextInput]}
          value={description}
          onChangeText={(value) => setDescription(value.slice(0, 300))}
          placeholder="안내 문구 300자 이내"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={300}
        />
        {posterPreviewUri ? <Image source={{ uri: posterPreviewUri }} style={styles.specialLessonPosterPreview} resizeMode="cover" /> : null}
        <Pressable style={styles.secondaryActionButton} onPress={pickSpecialLessonImage}>
          <Feather name="image" size={17} color={colors.blue700} />
          <Text style={styles.secondaryActionText}>{posterPreviewUri ? '포스터 변경' : '포스터 등록'}</Text>
        </Pressable>
        <View style={styles.lessonDurationSelector}>
          {[30, 60, 90, 120].map((duration) => {
            const selected = durationMinutes === duration;

            return (
              <Pressable
                key={duration}
                style={[styles.lessonDurationButton, selected && styles.lessonDurationButtonActive]}
                onPress={() => setDurationMinutes(duration)}
              >
                <Text style={[styles.lessonDurationButtonText, selected && styles.lessonDurationButtonTextActive]}>
                  {duration}분
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.requestActions}>
          {editingLessonId ? (
            <Pressable style={[styles.requestRejectButton, creating && styles.disabledButton]} onPress={resetLessonForm} disabled={creating}>
              <Feather name="x" size={16} color={colors.danger} />
              <Text style={styles.requestRejectText}>취소</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[
              editingLessonId ? styles.requestApproveButton : styles.secondaryActionButton,
              creating && styles.disabledButton
            ]}
            onPress={submitLesson}
            disabled={creating}
          >
            <Feather name={editingLessonId ? 'save' : 'plus-circle'} size={17} color={editingLessonId ? colors.white : colors.blue700} />
            <Text style={editingLessonId ? styles.requestApproveText : styles.secondaryActionText}>
              {creating ? '저장중' : editingLessonId ? '수정 저장' : '특별수업 등록'}
            </Text>
          </Pressable>
        </View>
      </View>

      {specialLessons.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="star" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>등록된 특별수업이 없습니다.</Text>
        </View>
      ) : (
        specialLessons.slice(0, 4).map((lesson) => (
          <View key={lesson.id} style={styles.requestCard}>
            {lesson.imageUri ? (
              <Image source={{ uri: lesson.imageUri }} style={styles.specialLessonPoster} resizeMode="cover" />
            ) : null}
            <View style={styles.specialLessonHeader}>
              <View style={styles.feedbackCardTitleBlock}>
                <Text style={styles.requestTitle}>{lesson.title}</Text>
                <Text style={styles.requestMeta}>
                  {formatSlotBrief(lesson.startsAt)} · {lesson.instructor || '담당 강사 미정'}
                </Text>
              </View>
              <Text style={styles.adminReservationMeta}>
                확정 {lesson.approvedCount}/{lesson.capacity}
              </Text>
            </View>
            {lesson.description ? <Text style={styles.feedbackBody}>{lesson.description}</Text> : null}
            <Text style={styles.requestMeta}>신청 {lesson.applicationCount}명 · {lesson.durationMinutes}분</Text>
            <Pressable
              style={[styles.secondaryActionButton, editingLessonId === lesson.id && styles.memberAdjustButtonActive]}
              onPress={() => startEditLesson(lesson)}
              accessibilityRole="button"
            >
              <Feather name="edit-2" size={17} color={colors.blue700} />
              <Text style={styles.secondaryActionText}>{editingLessonId === lesson.id ? '수정 중' : '수정'}</Text>
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>신청자</Text>
        <Text style={styles.adminOverviewCount}>{activeRegistrationCount}명</Text>
      </View>

      {registrations.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="users" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>아직 특별수업 신청자가 없습니다.</Text>
        </View>
      ) : (
        registrations.slice(0, 12).map((registration) => {
          const reviewing = reviewingId === registration.id;
          const reviewable = registration.status === 'pending' || registration.status === 'waitlisted';

          return (
            <View key={registration.id} style={styles.requestCard}>
              <View style={styles.specialLessonHeader}>
                <View style={styles.feedbackCardTitleBlock}>
                  <Text style={styles.requestTitle}>
                    {registration.queuePosition}번 · {registration.userName}
                  </Text>
                  <Text style={styles.requestMeta}>
                    {registration.specialLessonTitle} · {formatSlotBrief(registration.startsAt)}
                  </Text>
                </View>
                <Text style={[styles.specialStatusBadge, registration.status === 'approved' && styles.specialStatusBadgeApproved]}>
                  {formatSpecialLessonStatus(registration.status)}
                </Text>
              </View>
              {reviewable ? (
                <View style={styles.requestActions}>
                  <Pressable
                    style={[styles.requestRejectButton, reviewing && styles.disabledButton]}
                    onPress={() => reviewRegistration(registration, false)}
                    disabled={reviewing}
                  >
                    <Feather name="x" size={16} color={colors.danger} />
                    <Text style={styles.requestRejectText}>거절</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.requestApproveButton, reviewing && styles.disabledButton]}
                    onPress={() => reviewRegistration(registration, true)}
                    disabled={reviewing}
                  >
                    <Feather name="check" size={16} color={colors.white} />
                    <Text style={styles.requestApproveText}>승인</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

function AdminLessonFeedbackOverview({
  targets,
  onPublishLessonFeedback
}: {
  targets: LessonFeedbackTarget[];
  onPublishLessonFeedback: (input: PublishLessonFeedbackInput) => Promise<void>;
}) {
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const selectedTarget = useMemo(() => {
    return targets.find((target) => getFeedbackTargetKey(target) === selectedTargetKey) ?? null;
  }, [selectedTargetKey, targets]);
  const pendingCount = targets.filter((target) => !target.feedbackId).length;

  useEffect(() => {
    if (selectedTargetKey && !targets.some((target) => getFeedbackTargetKey(target) === selectedTargetKey)) {
      setSelectedTargetKey(null);
    }
  }, [selectedTargetKey, targets]);

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>수업 피드백</Text>
        <Text style={styles.adminOverviewCount}>{pendingCount}건 미작성</Text>
      </View>

      {targets.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="message-square" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>최근 종료된 배정 수업이 없습니다.</Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.feedbackTargetList}>
            {targets.slice(0, 18).map((target) => {
              const targetKey = getFeedbackTargetKey(target);
              const selected = targetKey === selectedTargetKey;

              return (
                <Pressable
                  key={targetKey}
                  style={[styles.feedbackTargetChip, selected && styles.feedbackTargetChipActive]}
                  onPress={() => setSelectedTargetKey(targetKey)}
                  accessibilityRole="button"
                  accessibilityLabel={`${target.userName} 피드백 선택`}
                >
                  <Text style={[styles.feedbackTargetName, selected && styles.feedbackTargetNameActive]} numberOfLines={1}>
                    {target.userName}
                  </Text>
                  <Text style={[styles.feedbackTargetMeta, selected && styles.feedbackTargetMetaActive]} numberOfLines={1}>
                    {formatSlotBrief(target.startsAt)}
                  </Text>
                  <Text style={[styles.feedbackTargetState, selected && styles.feedbackTargetMetaActive]}>
                    {target.feedbackId ? '작성됨' : '미작성'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedTarget ? (
            <AdminLessonFeedbackComposer
              target={selectedTarget}
              onPublishLessonFeedback={onPublishLessonFeedback}
              onSaved={() => setSelectedTargetKey(null)}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function AdminLessonFeedbackModal({
  target,
  onClose,
  onPublishLessonFeedback
}: {
  target: LessonFeedbackTarget | null;
  onClose: () => void;
  onPublishLessonFeedback: (input: PublishLessonFeedbackInput) => Promise<void>;
}) {
  if (!target) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.feedbackCardTitleBlock}>
              <Text style={styles.modalTitle}>수업 피드백</Text>
              <Text style={styles.requestMeta}>
                {target.userName} · {formatSlotBrief(target.startsAt)}
              </Text>
            </View>
            <Pressable style={styles.modalCloseButton} onPress={onClose} accessibilityRole="button">
              <Feather name="x" size={18} color={colors.blue700} />
            </Pressable>
          </View>

          <AdminLessonFeedbackComposer target={target} onPublishLessonFeedback={onPublishLessonFeedback} onSaved={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function AdminLessonFeedbackComposer({
  target,
  onPublishLessonFeedback,
  onSaved
}: {
  target: LessonFeedbackTarget;
  onPublishLessonFeedback: (input: PublishLessonFeedbackInput) => Promise<void>;
  onSaved: () => void;
}) {
  const [feedbackText, setFeedbackText] = useState('');
  const [mediaUri, setMediaUri] = useState<string | undefined>();
  const [mediaType, setMediaType] = useState<LessonFeedbackMediaType | undefined>();
  const [saving, setSaving] = useState(false);
  const previewUri = mediaUri ?? target.mediaUri;
  const previewType = mediaType ?? target.mediaType ?? undefined;

  useEffect(() => {
    setFeedbackText(target.feedbackText ?? '');
    setMediaUri(undefined);
    setMediaType(undefined);
  }, [target.slotId, target.userId, target.feedbackText]);

  async function pickFeedbackMedia() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('사진 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.82,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    const nextMediaType: LessonFeedbackMediaType = asset?.type === 'video' ? 'video' : 'image';

    setMediaUri(asset?.uri);
    setMediaType(nextMediaType);
  }

  async function submitFeedback() {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      await onPublishLessonFeedback({
        slotId: target.slotId,
        userId: target.userId,
        feedbackText,
        mediaUri,
        mediaType
      });
      setFeedbackText('');
      setMediaUri(undefined);
      setMediaType(undefined);
      onSaved();
      Alert.alert('피드백 저장', '회원에게 수업 피드백이 등록되었습니다.');
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '피드백을 저장하지 못했습니다.';
      Alert.alert('저장 실패', message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.feedbackComposer}>
      <View style={styles.feedbackComposerHeader}>
        <Text style={styles.requestTitle}>
          {target.userName} · {formatSlotBrief(target.startsAt)}
        </Text>
        <Text style={styles.requestMeta}>{target.instructor} 강사</Text>
      </View>
      <TextInput
        style={[styles.input, styles.feedbackTextInput]}
        value={feedbackText}
        onChangeText={(value) => setFeedbackText(value.slice(0, 100))}
        placeholder="피드백 글 100자 이내"
        placeholderTextColor={colors.muted}
        multiline
        maxLength={100}
      />
      <Text style={styles.feedbackCounter}>{feedbackText.length}/100</Text>
      <LessonFeedbackMediaPreview uri={previewUri} mediaType={previewType} compact />
      <View style={styles.requestActions}>
        <Pressable style={styles.requestRejectButton} onPress={pickFeedbackMedia}>
          <Feather name="paperclip" size={16} color={colors.danger} />
          <Text style={styles.requestRejectText}>{mediaUri ? '첨부 변경' : '사진/영상'}</Text>
        </Pressable>
        <Pressable
          style={[styles.requestApproveButton, saving && styles.disabledButton]}
          onPress={submitFeedback}
          disabled={saving}
        >
          <Feather name="send" size={16} color={colors.white} />
          <Text style={styles.requestApproveText}>{saving ? '저장중' : '저장'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AdminScheduleOverview({
  slots,
  members,
  onCreateLessonSlot,
  onUpdateLessonSlot,
  onAssignLessonReservation,
  onCancelLessonReservation,
  onCancelLessonSlot
}: {
  slots: ClassSlot[];
  members: MemberSummary[];
  onCreateLessonSlot: (slotDate: string, hour: number, minute: number, instructor: string, durationMinutes: number) => Promise<void>;
  onUpdateLessonSlot: (slotId: string, instructor: string, durationMinutes: number, capacity: number) => Promise<void>;
  onAssignLessonReservation: (slotId: string, memberId: string, durationMinutes: number) => Promise<void>;
  onCancelLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonSlot: (slotId: string) => Promise<void>;
}) {
  const [slotDate, setSlotDate] = useState(slots[0]?.date ?? getTodayKey());
  const [slotTime, setSlotTime] = useState('19:00');
  const [slotInstructor, setSlotInstructor] = useState('');
  const [slotDuration, setSlotDuration] = useState(60);
  const [addingSlot, setAddingSlot] = useState(false);
  const [assignmentQuery, setAssignmentQuery] = useState('');
  const [selectedAssignmentMemberId, setSelectedAssignmentMemberId] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState('');
  const operatingSlots = useMemo(() => [...slots].sort(sortSlotsByStartsAt), [slots]);
  const weekOptions = useMemo(() => {
    const weekStarts = Array.from(new Set(operatingSlots.map((slot) => getWeekStartKey(slot.date))));

    return weekStarts.map((weekStart) => {
      const weekSlots = operatingSlots.filter((slot) => getWeekStartKey(slot.date) === weekStart);
      const activeCount = weekSlots.filter((slot) => slot.isActive).length;

      return {
        id: weekStart,
        label: formatWeekRange(weekStart),
        count: activeCount
      };
    });
  }, [operatingSlots]);
  const selectedWeekSlots = useMemo(
    () => operatingSlots.filter((slot) => getWeekStartKey(slot.date) === selectedWeekStart),
    [operatingSlots, selectedWeekStart]
  );
  const selectedWeekDates = useMemo(() => {
    const seen = new Set<string>();

    return selectedWeekSlots.reduce<Array<{ date: string; shortDateLabel: string; weekdayLabel: string }>>((dates, slot) => {
      if (seen.has(slot.date)) {
        return dates;
      }

      seen.add(slot.date);
      dates.push({
        date: slot.date,
        shortDateLabel: slot.shortDateLabel,
        weekdayLabel: slot.weekdayLabel
      });

      return dates;
    }, []);
  }, [selectedWeekSlots]);
  const selectedWeekActiveCount = selectedWeekSlots.filter((slot) => slot.isActive).length;
  const assignmentMembers = useMemo(() => {
    const query = assignmentQuery.trim().toLowerCase();

    return members
      .filter((member) => member.role === 'member')
      .filter((member) => {
        if (!query) {
          return true;
        }

        return (
          member.name.toLowerCase().includes(query) ||
          member.email.toLowerCase().includes(query) ||
          formatPhoneNumber(member.phone).includes(query)
        );
      });
  }, [assignmentQuery, members]);
  const selectedAssignmentMember = useMemo(() => {
    return assignmentMembers.find((member) => member.id === selectedAssignmentMemberId) ?? assignmentMembers[0] ?? null;
  }, [assignmentMembers, selectedAssignmentMemberId]);

  useEffect(() => {
    if (!selectedWeekStart && weekOptions[0]) {
      setSelectedWeekStart(weekOptions[0].id);
      return;
    }

    if (selectedWeekStart && !weekOptions.some((week) => week.id === selectedWeekStart)) {
      setSelectedWeekStart(weekOptions[0]?.id ?? '');
    }
  }, [selectedWeekStart, weekOptions]);

  useEffect(() => {
    if (!slotDate && slots[0]?.date) {
      setSlotDate(slots[0].date);
    }
  }, [slotDate, slots]);

  useEffect(() => {
    if (!selectedAssignmentMemberId && assignmentMembers[0]) {
      setSelectedAssignmentMemberId(assignmentMembers[0].id);
      return;
    }

    if (selectedAssignmentMemberId && !assignmentMembers.some((member) => member.id === selectedAssignmentMemberId)) {
      setSelectedAssignmentMemberId(assignmentMembers[0]?.id ?? null);
    }
  }, [assignmentMembers, selectedAssignmentMemberId]);

  async function addLessonSlot() {
    if (addingSlot) {
      return;
    }

    const timeParts = parseLessonTimeInput(slotTime);

    if (!timeParts) {
      Alert.alert('시간 확인', '수업 시작 시간은 13:00 또는 13:30처럼 입력해주세요.');
      return;
    }

    if (timeParts.hour < POOL_OPEN_HOUR || timeParts.hour > POOL_CLOSE_HOUR) {
      Alert.alert('영업시간 확인', '수업은 05:00부터 22:00 사이에만 열 수 있습니다.');
      return;
    }

    try {
      setAddingSlot(true);
      await onCreateLessonSlot(slotDate, timeParts.hour, timeParts.minute, slotInstructor, slotDuration);
      setSlotInstructor('');
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '수업을 추가하지 못했습니다.';
      Alert.alert('추가 실패', message);
    } finally {
      setAddingSlot(false);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <View style={styles.feedbackCardTitleBlock}>
          <Text style={styles.adminOverviewTitle}>주간 수업 운영</Text>
          <Text style={styles.requestMeta}>수업별로 바로 열고 닫을 수 있습니다.</Text>
        </View>
        <Text style={styles.adminOverviewCount}>{selectedWeekActiveCount}/{selectedWeekSlots.length}개 열림</Text>
      </View>

      <View style={styles.calendarAddPanel}>
        <View style={styles.calendarAddRow}>
          <TextInput
            style={[styles.input, styles.calendarDateInput]}
            value={slotDate}
            onChangeText={setSlotDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, styles.fixedLessonSmallInput, styles.calendarTimeInput]}
            value={slotTime}
            onChangeText={setSlotTime}
            keyboardType="numbers-and-punctuation"
            placeholder="13:30"
            placeholderTextColor={colors.muted}
          />
          <TextInput
            style={[styles.input, styles.fixedLessonInstructorInput, styles.calendarAddInstructorInput]}
            value={slotInstructor}
            onChangeText={setSlotInstructor}
            placeholder="강사"
            placeholderTextColor={colors.muted}
          />
        </View>
        <View style={styles.lessonDurationSelector}>
          {[30, 60].map((duration) => {
            const selected = slotDuration === duration;

            return (
              <Pressable
                key={duration}
                style={[styles.lessonDurationButton, selected && styles.lessonDurationButtonActive]}
                onPress={() => setSlotDuration(duration)}
                accessibilityRole="button"
                accessibilityLabel={`${formatLessonDuration(duration)} 수업 선택`}
              >
                <Text style={[styles.lessonDurationButtonText, selected && styles.lessonDurationButtonTextActive]}>
                  {formatLessonDuration(duration)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable style={[styles.secondaryActionButton, addingSlot && styles.disabledButton]} onPress={addLessonSlot} disabled={addingSlot}>
          <Text style={styles.secondaryActionText}>수업 추가</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekSelector}>
        {weekOptions.map((week) => {
          const selected = selectedWeekStart === week.id;

          return (
            <Pressable
              key={week.id}
              style={[styles.weekSelectorButton, selected && styles.weekSelectorButtonActive]}
              onPress={() => setSelectedWeekStart(week.id)}
              accessibilityRole="button"
            >
              <Text style={[styles.weekSelectorText, selected && styles.weekSelectorTextActive]}>{week.label}</Text>
              <Text style={[styles.weekSelectorMeta, selected && styles.weekSelectorMetaActive]}>{week.count}개 열림</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.calendarAssignmentPanel}>
        <View style={styles.calendarAssignmentHeader}>
          <Text style={styles.calendarAssignmentTitle}>배정할 회원</Text>
          <Text style={styles.calendarAssignmentHint}>
            {selectedAssignmentMember ? `${selectedAssignmentMember.name} 선택됨` : '회원 없음'}
          </Text>
        </View>
        <TextInput
          style={styles.input}
          value={assignmentQuery}
          onChangeText={setAssignmentQuery}
          placeholder="이름, 이메일, 휴대폰 검색"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarAssignmentMemberList}>
          {assignmentMembers.map((member) => {
            const selected = selectedAssignmentMember?.id === member.id;

            return (
              <Pressable
                key={member.id}
                style={[styles.calendarAssignmentMemberChip, selected && styles.calendarAssignmentMemberChipActive]}
                onPress={() => setSelectedAssignmentMemberId(member.id)}
                accessibilityRole="button"
                accessibilityLabel={`${member.name} 회원 선택`}
              >
                <Text style={[styles.calendarAssignmentMemberName, selected && styles.calendarAssignmentMemberNameActive]}>
                  {member.name}
                </Text>
                <Text style={[styles.calendarAssignmentMemberMeta, selected && styles.calendarAssignmentMemberMetaActive]}>
                  잔여 {member.passBalance}회
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {selectedWeekSlots.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="calendar" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>이 주에는 수업 시간이 없습니다.</Text>
        </View>
      ) : (
        <View style={styles.weekLessonList}>
          {selectedWeekDates.map((day) => {
            const daySlots = selectedWeekSlots.filter((slot) => slot.date === day.date);
            const openCount = daySlots.filter((slot) => slot.isActive).length;

            return (
              <View key={day.date} style={styles.weekDaySection}>
                <View style={styles.weekDayHeader}>
                  <Text style={styles.weekDayTitle}>
                    {day.shortDateLabel} {day.weekdayLabel}
                  </Text>
                  <Text style={styles.weekDayMeta}>{openCount}/{daySlots.length}개 열림</Text>
                </View>
                {daySlots.map((slot) => (
                  <AdminWeeklyLessonRow
                    key={slot.id}
                    slot={slot}
                    selectedAssignmentMember={selectedAssignmentMember}
                    onOpenLessonSlot={onCreateLessonSlot}
                    onUpdateLessonSlot={onUpdateLessonSlot}
                    onAssignLessonReservation={onAssignLessonReservation}
                    onCancelLessonReservation={onCancelLessonReservation}
                    onCancelLessonSlot={onCancelLessonSlot}
                  />
                ))}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function AdminWeeklyLessonRow({
  slot,
  selectedAssignmentMember,
  onOpenLessonSlot,
  onUpdateLessonSlot,
  onAssignLessonReservation,
  onCancelLessonReservation,
  onCancelLessonSlot,
  onCancelFixedLesson
}: {
  slot: ClassSlot;
  selectedAssignmentMember: MemberSummary | null;
  onOpenLessonSlot: (slotDate: string, hour: number, minute: number, instructor: string, durationMinutes: number) => Promise<void>;
  onUpdateLessonSlot: (slotId: string, instructor: string, durationMinutes: number, capacity: number) => Promise<void>;
  onAssignLessonReservation: (slotId: string, memberId: string, durationMinutes: number) => Promise<void>;
  onCancelLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonSlot: (slotId: string) => Promise<void>;
  onCancelFixedLesson?: (fixedLessonId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [instructor, setInstructor] = useState(slot.instructor);
  const [durationMinutes, setDurationMinutes] = useState(slot.durationMinutes);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [cancelingFixedLessonId, setCancelingFixedLessonId] = useState<string | null>(null);
  const isOpen = slot.isActive;
  const absentUserIds = new Set(slot.absences.map((person) => person.userId));
  const attendingFixedMembers = slot.fixedMembers.filter((member) => !absentUserIds.has(member.userId));
  const absenceNames = formatPersonNames(slot.absences);
  const selectedAssigned = Boolean(
    selectedAssignmentMember && slot.substitutes.some((person) => person.userId === selectedAssignmentMember.id)
  );
  const selectedAlreadyFixed = Boolean(
    selectedAssignmentMember && slot.fixedMembers.some((person) => person.userId === selectedAssignmentMember.id)
  );
  const occupiedCount = attendingFixedMembers.length + slot.substitutes.length;

  useEffect(() => {
    setInstructor(slot.instructor);
  }, [slot.instructor]);

  useEffect(() => {
    setDurationMinutes(slot.durationMinutes);
  }, [slot.durationMinutes]);

  async function openSlot() {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      await onOpenLessonSlot(slot.date, slot.hour, slot.minute, instructor || slot.instructor, durationMinutes);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '수업을 열지 못했습니다.';
      Alert.alert('열기 실패', message);
    } finally {
      setSaving(false);
    }
  }

  async function saveSlotDetails() {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      await onUpdateLessonSlot(slot.id, instructor, durationMinutes, slot.capacity);
      setEditing(false);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '수업을 변경하지 못했습니다.';
      Alert.alert('변경 실패', message);
    } finally {
      setSaving(false);
    }
  }

  function confirmCancelSlot() {
    if (deleting) {
      return;
    }

    Alert.alert(
      '수업 닫기',
      `${slot.shortDateLabel} ${formatSlotHour(slot.startsAt)} 수업을 닫을까요? 이 시간의 개별 배정은 취소 및 환불됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '닫기',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await onCancelLessonSlot(slot.id);
            } catch (error) {
              const message = error instanceof DatabaseError ? error.message : '수업을 닫지 못했습니다.';
              Alert.alert('닫기 실패', message);
            } finally {
              setDeleting(false);
            }
          }
        }
      ]
    );
  }

  async function cancelAssignedMember(person: ReservationPerson) {
    if (assigning || !person.userId) {
      return;
    }

    try {
      setAssigning(true);
      await onCancelLessonReservation(slot.id, person.userId);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '배정을 취소하지 못했습니다.';
      Alert.alert('배정 취소 실패', message);
    } finally {
      setAssigning(false);
    }
  }

  function confirmCancelFixedMember(person: ReservationPerson) {
    if (!onCancelFixedLesson || !person.fixedLessonId || cancelingFixedLessonId) {
      return;
    }

    Alert.alert(
      '고정수업 삭제',
      `${person.userName} 회원의 ${slot.weekdayLabel} ${formatSlotHour(slot.startsAt)} 고정수업을 삭제할까요? 앞으로 같은 요일/시간 배정이 취소됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancelingFixedLessonId(person.fixedLessonId ?? '');
              await onCancelFixedLesson(person.fixedLessonId ?? '');
            } catch (error) {
              const message = error instanceof DatabaseError ? error.message : '고정수업을 삭제하지 못했습니다.';
              Alert.alert('삭제 실패', message);
            } finally {
              setCancelingFixedLessonId(null);
            }
          }
        }
      ]
    );
  }

  async function toggleAssignment() {
    if (!selectedAssignmentMember || assigning || selectedAlreadyFixed || !isOpen) {
      return;
    }

    try {
      setAssigning(true);

      if (selectedAssigned) {
        await onCancelLessonReservation(slot.id, selectedAssignmentMember.id);
      } else {
        await onAssignLessonReservation(slot.id, selectedAssignmentMember.id, 60);
      }
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '회원 배정을 저장하지 못했습니다.';
      Alert.alert(selectedAssigned ? '배정 취소 실패' : '배정 실패', message);
    } finally {
      setAssigning(false);
    }
  }

  return (
    <View style={[styles.weekLessonRow, !isOpen && styles.weekLessonRowClosed]}>
      <View style={styles.weekLessonTopRow}>
        <View style={styles.adminReservationTime}>
          <Text style={styles.adminReservationDay}>{slot.weekdayLabel}</Text>
          <Text style={styles.adminReservationHour}>{formatSlotHour(slot.startsAt)}</Text>
        </View>
        <View style={styles.adminReservationCopy}>
          {editing ? (
            <TextInput
              style={[styles.input, styles.inlineInstructorInput]}
              value={instructor}
              onChangeText={setInstructor}
              placeholder="강사"
              placeholderTextColor={colors.muted}
            />
          ) : (
            <Text style={styles.adminReservationName}>{slot.instructor} 강사</Text>
          )}
          <Text style={styles.adminReservationMeta}>
            {isOpen ? `열림 · 출석 ${occupiedCount}명` : '닫힘'} · {formatLessonDuration(slot.durationMinutes)}
            {slot.openSeatCount > 0 ? ` · 빈자리 ${slot.openSeatCount}개` : ''}
          </Text>
        </View>
        <Text style={[styles.timelineBadge, isOpen ? styles.statusBadgeSuccess : styles.timelineBadgePast]}>
          {isOpen ? '열림' : '닫힘'}
        </Text>
      </View>

      {editing ? (
        <View style={styles.lessonDurationSelector}>
          {[30, 60].map((duration) => {
            const selected = durationMinutes === duration;

            return (
              <Pressable
                key={duration}
                style={[styles.lessonDurationButton, selected && styles.lessonDurationButtonActive]}
                onPress={() => setDurationMinutes(duration)}
                accessibilityRole="button"
              >
                <Text style={[styles.lessonDurationButtonText, selected && styles.lessonDurationButtonTextActive]}>
                  {formatLessonDuration(duration)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.weekLessonPeople}>
        {attendingFixedMembers.map((person) => {
          const cancelingFixed = cancelingFixedLessonId === person.fixedLessonId;

          return (
            <View key={`${person.fixedLessonId ?? person.userId}-${person.userName}`} style={styles.weekSubstituteRow}>
              <Text style={styles.calendarMemberPrimaryText} numberOfLines={1}>
                고정 {person.userName}
              </Text>
              {onCancelFixedLesson && person.fixedLessonId ? (
                <Pressable
                  style={[styles.calendarInlineCancelButton, cancelingFixed && styles.disabledButton]}
                  onPress={() => confirmCancelFixedMember(person)}
                  disabled={cancelingFixed}
                  accessibilityRole="button"
                >
                  <Feather name="x" size={13} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {slot.substitutes.map((person) => (
          <View key={`${person.userId}-${person.createdAt}`} style={styles.weekSubstituteRow}>
            <Text style={[styles.calendarMemberText, styles.calendarSubstituteText, styles.calendarSubstituteName]} numberOfLines={1}>
              개별 {person.userName}
            </Text>
            <Pressable
              style={[styles.calendarInlineCancelButton, assigning && styles.disabledButton]}
              onPress={() => cancelAssignedMember(person)}
              disabled={assigning}
              accessibilityRole="button"
            >
              <Feather name="x" size={13} color={colors.danger} />
            </Pressable>
          </View>
        ))}
        {absenceNames ? <Text style={[styles.calendarMemberText, styles.calendarAbsenceText]}>결석 {absenceNames}</Text> : null}
        {attendingFixedMembers.length === 0 && slot.substitutes.length === 0 && !absenceNames ? (
          <Text style={styles.calendarMutedText}>배정된 회원 없음</Text>
        ) : null}
      </View>

      <View style={styles.weekLessonActions}>
        {!isOpen ? (
          <Pressable
            style={[styles.requestApproveButton, saving && styles.disabledButton]}
            onPress={openSlot}
            disabled={saving}
            accessibilityRole="button"
          >
            <Feather name="unlock" size={16} color={colors.white} />
            <Text style={styles.requestApproveText}>{saving ? '여는중' : '열기'}</Text>
          </Pressable>
        ) : (
          <>
            {selectedAssignmentMember ? (
              <Pressable
                style={[
                  styles.requestNeutralButton,
                  selectedAssigned && styles.requestRejectButton,
                  (assigning || selectedAlreadyFixed) && styles.disabledButton
                ]}
                onPress={toggleAssignment}
                disabled={assigning || selectedAlreadyFixed}
                accessibilityRole="button"
              >
                <Feather name={selectedAssigned ? 'x' : 'user-plus'} size={16} color={selectedAssigned ? colors.danger : colors.blue700} />
                <Text style={selectedAssigned ? styles.requestRejectText : styles.secondaryActionText}>
                  {selectedAlreadyFixed ? '고정수업' : selectedAssigned ? '배정취소' : '회원배정'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.requestNeutralButton, saving && styles.disabledButton]}
              onPress={editing ? saveSlotDetails : () => setEditing(true)}
              disabled={saving}
              accessibilityRole="button"
            >
              <Feather name={editing ? 'save' : 'edit-2'} size={16} color={colors.blue700} />
              <Text style={styles.secondaryActionText}>{editing ? '저장' : '강사·시간'}</Text>
            </Pressable>
            <Pressable
              style={[styles.requestRejectButton, deleting && styles.disabledButton]}
              onPress={confirmCancelSlot}
              disabled={deleting}
              accessibilityRole="button"
            >
              <Feather name="lock" size={16} color={colors.danger} />
              <Text style={styles.requestRejectText}>{deleting ? '닫는중' : '닫기'}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function formatMinuteLabel(startMinutes: number) {
  const hour = Math.floor(startMinutes / 60);
  const minute = startMinutes % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatHourLabel(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatPersonNames(people: ReservationPerson[]) {
  return people.map((person) => person.userName).join(', ');
}

function AdminScheduleRow({
  slot,
  onUpdateLessonInstructor
}: {
  slot: ClassSlot;
  onUpdateLessonInstructor: (slotId: string, instructor: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [instructor, setInstructor] = useState(slot.instructor);
  const [saving, setSaving] = useState(false);
  const memberNames = slot.fixedMembers.map((member) => member.userName).join(', ') || '고정 회원 없음';

  async function saveInstructor() {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      await onUpdateLessonInstructor(slot.id, instructor);
      setEditing(false);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '강사를 변경하지 못했습니다.';
      Alert.alert('변경 실패', message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.adminScheduleRow}>
      <View style={styles.adminReservationTime}>
        <Text style={styles.adminReservationDay}>{slot.shortDateLabel}</Text>
        <Text style={styles.adminReservationHour}>{formatSlotHour(slot.startsAt)}</Text>
      </View>
      <View style={styles.adminReservationCopy}>
        {editing ? (
          <TextInput
            style={[styles.input, styles.inlineInstructorInput]}
            value={instructor}
            onChangeText={setInstructor}
            placeholder="강사"
            placeholderTextColor={colors.muted}
          />
        ) : (
          <Text style={styles.adminReservationName}>{slot.instructor} 강사</Text>
        )}
        <Text style={styles.adminReservationMeta}>
          {memberNames} · 결석 {slot.absences.length} · 대체 {slot.substitutes.length} · 빈자리 {slot.openSeatCount}
        </Text>
      </View>
      <Pressable
        style={[styles.memberAdjustButton, saving && styles.disabledButton]}
        onPress={editing ? saveInstructor : () => setEditing(true)}
        disabled={saving}
        accessibilityLabel={editing ? '강사 저장' : '강사 변경'}
        accessibilityRole="button"
      >
        <Text style={styles.memberAdjustButtonText}>{editing ? '저장' : '강사'}</Text>
      </Pressable>
    </View>
  );
}

function AdminReservationOverview({ slots }: { slots: ClassSlot[] }) {
  const changedCount = slots.reduce((count, slot) => count + slot.absences.length + slot.substitutes.length, 0);

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>열린 자리/대체 예약</Text>
        <Text style={styles.adminOverviewCount}>{changedCount}건</Text>
      </View>

      {slots.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="calendar" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>아직 열린 자리나 대체 예약이 없습니다.</Text>
        </View>
      ) : (
        slots.map((slot) => (
          <View key={slot.id} style={styles.adminReservationRow}>
            <View style={styles.adminReservationTime}>
              <Text style={styles.adminReservationDay}>{slot.shortDateLabel}</Text>
              <Text style={styles.adminReservationHour}>{formatSlotHour(slot.startsAt)}</Text>
            </View>
            <View style={styles.adminReservationCopy}>
              <Text style={styles.adminReservationName}>
                {slot.substitutes.length > 0 ? `대체 ${slot.substitutes.length}명` : `빈자리 ${slot.openSeatCount}개`}
              </Text>
              <Text style={styles.adminReservationMeta}>
                {slot.instructor} 강사 · 결석 {slot.absences.length}명 · 남은 빈자리 {slot.openSeatCount}개
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function getMemberLessonLabels(slots: ClassSlot[], memberId: string) {
  const labels = new Map<string, string>();

  slots.forEach((slot) => {
    if (!slot.fixedMembers.some((member) => member.userId === memberId)) {
      return;
    }

    const key = `${slot.weekdayLabel}-${slot.startMinutes}`;
    if (!labels.has(key)) {
      labels.set(key, `${slot.weekdayLabel} ${formatSlotHour(slot.startsAt)} · ${slot.instructor}`);
    }
  });

  return Array.from(labels.values());
}

interface FixedLessonDraft {
  id: string;
  weekday: number;
  weekdayLabel: string;
  hour: number;
  minute: number;
  startMinutes: number;
  timeLabel: string;
  instructor: string;
  durationMinutes: number;
  lessonCapacity: number;
}

function getMemberFixedLessonDrafts(slots: ClassSlot[], memberId: string) {
  const drafts = new Map<string, FixedLessonDraft>();

  [...slots].sort(sortSlotsByStartsAt).forEach((slot) => {
    const fixedMember = slot.fixedMembers.find((member) => member.userId === memberId && member.fixedLessonId);

    if (!fixedMember?.fixedLessonId || drafts.has(fixedMember.fixedLessonId)) {
      return;
    }

    drafts.set(fixedMember.fixedLessonId, {
      id: fixedMember.fixedLessonId,
      weekday: getWeekdayNumberFromDateKey(slot.date),
      weekdayLabel: slot.weekdayLabel,
      hour: slot.hour,
      minute: slot.minute,
      startMinutes: slot.startMinutes,
      timeLabel: formatSlotHour(slot.startsAt),
      instructor: slot.instructor,
      durationMinutes: fixedMember.durationMinutes ?? slot.durationMinutes ?? 60,
      lessonCapacity: Math.min(Math.max(fixedMember.lessonCapacity ?? slot.capacity, 1), 3)
    });
  });

  return Array.from(drafts.values());
}

function getWeekdayNumberFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return weekday === 0 ? 7 : weekday;
}

function AdminMemberOverview({
  slots,
  members,
  onAdjustMemberPass,
  onUpdateMemberPassProduct,
  onSaveFixedLesson,
  onCancelFixedLesson
}: {
  slots: ClassSlot[];
  members: MemberSummary[];
  onAdjustMemberPass: (memberId: string, amount: number) => Promise<void>;
  onUpdateMemberPassProduct: (memberId: string, lessonCapacity: number) => Promise<void>;
  onSaveFixedLesson: (
    memberId: string,
    weekday: number,
    hour: number,
    minute: number,
    durationMinutes: number,
    fixedLessonId?: string | null
  ) => Promise<void>;
  onCancelFixedLesson: (fixedLessonId: string) => Promise<void>;
}) {
  const [adjustingMemberId, setAdjustingMemberId] = useState<string | null>(null);
  const [editingLessonMemberId, setEditingLessonMemberId] = useState<string | null>(null);
  const [editingFixedLessonId, setEditingFixedLessonId] = useState<string | null>(null);
  const [cancelingFixedLessonId, setCancelingFixedLessonId] = useState<string | null>(null);
  const [updatingProductMemberId, setUpdatingProductMemberId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [lessonWeekday, setLessonWeekday] = useState('1');
  const [lessonTime, setLessonTime] = useState('19:00');
  const [lessonDuration, setLessonDuration] = useState(60);
  const [savingLesson, setSavingLesson] = useState(false);
  const memberList = useMemo(() => members.filter((member) => member.role === 'member'), [members]);
  const memberOptions = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();

    return memberList.filter((member) => {
      if (!query) {
        return true;
      }

      return (
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        formatPhoneNumber(member.phone).includes(query)
      );
    });
  }, [memberList, memberQuery]);
  const selectedMember = useMemo(() => {
    return memberOptions.find((member) => member.id === selectedMemberId) ?? memberOptions[0] ?? null;
  }, [memberOptions, selectedMemberId]);

  useEffect(() => {
    if (!selectedMemberId && memberOptions[0]) {
      setSelectedMemberId(memberOptions[0].id);
      return;
    }

    if (selectedMemberId && !memberOptions.some((member) => member.id === selectedMemberId)) {
      setSelectedMemberId(memberOptions[0]?.id ?? null);
    }
  }, [memberOptions, selectedMemberId]);

  async function adjustPass(member: MemberSummary, amount: number) {
    if (adjustingMemberId) {
      return;
    }

    const verb = amount > 0 ? '추가' : '차감';
    const unit = Math.abs(amount);

    Alert.alert('횟수권 변경', `${member.name} 회원의 횟수권을 ${unit}회 ${verb}할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: verb,
        style: amount > 0 ? 'default' : 'destructive',
        onPress: async () => {
          try {
            setAdjustingMemberId(member.id);
            await onAdjustMemberPass(member.id, amount);
          } catch (error) {
            const message = error instanceof DatabaseError ? error.message : '횟수권을 변경하지 못했습니다.';
            Alert.alert('변경 실패', message);
          } finally {
            setAdjustingMemberId(null);
          }
        }
      }
    ]);
  }

  function openLessonEditor(member: MemberSummary) {
    if (editingLessonMemberId === member.id) {
      setEditingLessonMemberId(null);
      return;
    }

    const fixedLessonDrafts = getMemberFixedLessonDrafts(slots, member.id);
    const firstDraft = fixedLessonDrafts[0];

    setLessonWeekday(String(firstDraft?.weekday ?? 1));
    setLessonTime(firstDraft?.timeLabel ?? '19:00');
    setLessonDuration(firstDraft?.durationMinutes ?? 60);
    setEditingFixedLessonId(firstDraft?.id ?? null);
    setEditingLessonMemberId(member.id);
  }

  function editFixedLessonDraft(draft: FixedLessonDraft) {
    setLessonWeekday(String(draft.weekday));
    setLessonTime(draft.timeLabel);
    setLessonDuration(draft.durationMinutes);
    setEditingFixedLessonId(draft.id);
  }

  function startNewFixedLesson() {
    setLessonWeekday('1');
    setLessonTime('19:00');
    setLessonDuration(60);
    setEditingFixedLessonId(null);
  }

  async function saveFixedLesson(member: MemberSummary) {
    if (savingLesson) {
      return;
    }

    const weekday = Number(lessonWeekday);
    const timeParts = parseLessonTimeInput(lessonTime);

    if (!timeParts) {
      Alert.alert('시간 확인', '고정 수업 시간은 13:00 또는 13:30처럼 입력해주세요.');
      return;
    }

    if (timeParts.hour < POOL_OPEN_HOUR || timeParts.hour > POOL_CLOSE_HOUR) {
      Alert.alert('영업시간 확인', '고정 수업은 05:00부터 22:00 사이에만 등록할 수 있습니다.');
      return;
    }

    try {
      setSavingLesson(true);
      await onSaveFixedLesson(member.id, weekday, timeParts.hour, timeParts.minute, lessonDuration, editingFixedLessonId);
      setEditingLessonMemberId(null);
      setEditingFixedLessonId(null);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '고정 수업을 저장하지 못했습니다.';
      Alert.alert('저장 실패', message);
    } finally {
      setSavingLesson(false);
    }
  }

  async function updateProduct(member: MemberSummary, nextLessonCapacity: number) {
    if (updatingProductMemberId || member.lessonCapacity === nextLessonCapacity) {
      return;
    }

    try {
      setUpdatingProductMemberId(member.id);
      await onUpdateMemberPassProduct(member.id, nextLessonCapacity);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '수업 상품을 변경하지 못했습니다.';
      Alert.alert('상품 변경 실패', message);
    } finally {
      setUpdatingProductMemberId(null);
    }
  }

  function confirmCancelFixedLesson(member: MemberSummary, draft: FixedLessonDraft) {
    if (cancelingFixedLessonId) {
      return;
    }

    Alert.alert(
      '고정 수업 취소',
      `${member.name} 회원의 ${draft.weekdayLabel} ${draft.timeLabel} 고정 수업을 취소할까요? 향후 열린 결석 자리와 초과 대체예약도 정리됩니다.`,
      [
        { text: '닫기', style: 'cancel' },
        {
          text: '수업 취소',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancelingFixedLessonId(draft.id);
              await onCancelFixedLesson(draft.id);

              if (editingFixedLessonId === draft.id) {
                startNewFixedLesson();
              }
            } catch (error) {
              const message = error instanceof DatabaseError ? error.message : '고정 수업을 취소하지 못했습니다.';
              Alert.alert('취소 실패', message);
            } finally {
              setCancelingFixedLessonId(null);
            }
          }
        }
      ]
    );
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>회원 정보</Text>
        <Text style={styles.adminOverviewCount}>{members.length}명</Text>
      </View>

      {memberList.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="users" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>가입된 회원이 없습니다.</Text>
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={memberQuery}
            onChangeText={setMemberQuery}
            placeholder="회원 이름, 이메일, 전화번호 검색"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />

          <ScrollView style={styles.memberPickerList} nestedScrollEnabled showsVerticalScrollIndicator>
            {memberOptions.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="search" size={22} color={colors.blue700} />
                <Text style={styles.emptyStateText}>검색된 회원이 없습니다.</Text>
              </View>
            ) : (
              memberOptions.map((member) => {
                const selected = selectedMember?.id === member.id;
                const memberLessons = getMemberLessonLabels(slots, member.id);

                return (
                  <Pressable
                    key={member.id}
                    style={[styles.memberPickerRow, selected && styles.memberPickerRowActive]}
                    onPress={() => {
                      setSelectedMemberId(member.id);
                      setEditingLessonMemberId(null);
                      setEditingFixedLessonId(null);
                    }}
                    accessibilityLabel={`${member.name} 회원 선택`}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.memberPickerName, selected && styles.memberPickerNameActive]}>{member.name}</Text>
                    <Text style={[styles.memberPickerMeta, selected && styles.memberPickerMetaActive]}>
                      {formatLessonCapacity(member.lessonCapacity)} · 잔여 {member.passBalance}회 · {memberLessons[0] ?? `고정 ${member.fixedLessonCount}개`}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {selectedMember ? (() => {
            const member = selectedMember;
            const adjusting = adjustingMemberId === member.id;
            const editingLesson = editingLessonMemberId === member.id;
            const updatingProduct = updatingProductMemberId === member.id;
            const memberLessons = getMemberLessonLabels(slots, member.id);
            const memberFixedLessonDrafts = getMemberFixedLessonDrafts(slots, member.id);

            return (
              <>
                <View style={styles.memberRow}>
                  <View style={styles.memberAvatar}>
                    <Feather name="user" size={18} color={colors.white} />
                  </View>
                  <View style={styles.memberCopy}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberEmail}>{member.email}</Text>
                    <Text style={styles.memberEmail}>{formatPhoneNumber(member.phone)}</Text>
                    <Text style={styles.memberMeta}>
                      {formatLessonCapacity(member.lessonCapacity)} 회원권 · 잔여 {member.passBalance}회
                    </Text>
                    <View style={styles.lessonCapacitySelector}>
                      {[1, 2, 3].map((capacity) => {
                        const selectedProduct = member.lessonCapacity === capacity;

                        return (
                          <Pressable
                            key={capacity}
                            style={[
                              styles.lessonCapacityButton,
                              selectedProduct && styles.lessonCapacityButtonActive,
                              updatingProduct && styles.disabledButton
                            ]}
                            onPress={() => updateProduct(member, capacity)}
                            disabled={updatingProduct}
                            accessibilityLabel={`${formatLessonCapacity(capacity)} 회원권`}
                            accessibilityRole="button"
                          >
                            <Text style={[styles.lessonCapacityText, selectedProduct && styles.lessonCapacityTextActive]}>
                              {formatLessonCapacity(capacity)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.memberMeta}>{memberLessons[0] ?? `고정 ${member.fixedLessonCount}개`}</Text>
                    {memberLessons.length > 1 ? <Text style={styles.memberMetaMuted}>{memberLessons.slice(1, 3).join(' · ')}</Text> : null}
                  </View>
                  <View style={styles.memberActions}>
                    <Pressable
                      style={[styles.memberAdjustButton, editingLesson && styles.memberAdjustButtonActive]}
                      onPress={() => openLessonEditor(member)}
                      accessibilityLabel="고정 수업 배정"
                      accessibilityRole="button"
                    >
                      <Text style={styles.memberAdjustButtonText}>수업</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.memberAdjustButton, styles.memberAdjustButtonDanger, adjusting && styles.disabledButton]}
                      onPress={() => adjustPass(member, -1)}
                      disabled={adjusting}
                      accessibilityLabel="횟수권 1회 차감"
                      accessibilityRole="button"
                    >
                      <Text style={[styles.memberAdjustButtonText, styles.memberAdjustButtonTextDanger]}>-1</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.memberAdjustButton, adjusting && styles.disabledButton]}
                      onPress={() => adjustPass(member, 1)}
                      disabled={adjusting}
                      accessibilityLabel="횟수권 1회 추가"
                      accessibilityRole="button"
                    >
                      <Text style={styles.memberAdjustButtonText}>+1</Text>
                    </Pressable>
                  </View>
                </View>

                {editingLesson ? (
                  <View style={styles.fixedLessonEditor}>
                    {memberFixedLessonDrafts.length > 0 ? (
                      <View style={styles.fixedLessonManageList}>
                        {memberFixedLessonDrafts.map((draft) => {
                          const selectedLesson = editingFixedLessonId === draft.id;
                          const canceling = cancelingFixedLessonId === draft.id;

                          return (
                            <View key={draft.id} style={[styles.fixedLessonManageRow, selectedLesson && styles.fixedLessonManageRowActive]}>
                              <View style={styles.fixedLessonManageCopy}>
                                <Text style={styles.fixedLessonManageTitle}>
                                  {draft.weekdayLabel} {draft.timeLabel}
                                </Text>
                                <Text style={styles.fixedLessonManageMeta}>
                                  {draft.instructor} 강사 · {formatLessonDuration(draft.durationMinutes)}
                                </Text>
                              </View>
                              <View style={styles.fixedLessonManageActions}>
                                <Pressable
                                  style={[styles.memberAdjustButton, selectedLesson && styles.memberAdjustButtonActive]}
                                  onPress={() => editFixedLessonDraft(draft)}
                                  accessibilityLabel="고정 수업 수정"
                                  accessibilityRole="button"
                                >
                                  <Text style={styles.memberAdjustButtonText}>수정</Text>
                                </Pressable>
                                <Pressable
                                  style={[styles.memberAdjustButton, styles.memberAdjustButtonDanger, canceling && styles.disabledButton]}
                                  onPress={() => confirmCancelFixedLesson(member, draft)}
                                  disabled={canceling}
                                  accessibilityLabel="고정 수업 취소"
                                  accessibilityRole="button"
                                >
                                  <Text style={[styles.memberAdjustButtonText, styles.memberAdjustButtonTextDanger]}>취소</Text>
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}

                    <Pressable
                      style={[styles.secondaryActionButton, editingFixedLessonId === null && styles.memberAdjustButtonActive]}
                      onPress={startNewFixedLesson}
                      accessibilityLabel="새 고정 수업 등록"
                      accessibilityRole="button"
                    >
                      <Text style={styles.secondaryActionText}>새 수업</Text>
                    </Pressable>

                    <View style={styles.selectorBlock}>
                      <Text style={styles.selectorLabel}>요일</Text>
                      <WeekdaySelector value={Number(lessonWeekday)} onChange={(weekday) => setLessonWeekday(String(weekday))} />
                    </View>
                    <View style={styles.selectorBlock}>
                      <Text style={styles.selectorLabel}>시간</Text>
                      <DropdownSelect
                        value={lessonTime}
                        options={lessonTimeOptions.map((option) => ({ value: option.value, label: option.value }))}
                        onChange={setLessonTime}
                        placeholder="시작 시간 선택"
                      />
                    </View>
                    <View style={styles.selectorBlock}>
                      <Text style={styles.selectorLabel}>수업 길이</Text>
                      <DurationSelector value={lessonDuration} onChange={setLessonDuration} />
                    </View>
                    <Pressable
                      style={[styles.publishButton, savingLesson && styles.disabledButton]}
                      onPress={() => saveFixedLesson(member)}
                      disabled={savingLesson}
                    >
                      <Feather name="save" size={17} color={colors.white} />
                      <Text style={styles.publishButtonText}>{editingFixedLessonId ? '고정 수업 변경 저장' : '고정 수업 등록'}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            );
          })() : null}
        </>
      )}
    </View>
  );
}

function AdminInstructorOverview({
  slots,
  instructorLessonTimes,
  onSaveInstructorLessonTime,
  onCancelInstructorLessonTime
}: {
  slots: ClassSlot[];
  instructorLessonTimes: InstructorLessonTime[];
  onSaveInstructorLessonTime: (input: SaveInstructorLessonTimeInput) => Promise<void>;
  onCancelInstructorLessonTime: (timeId: string) => Promise<void>;
}) {
  const instructorNames = useMemo(() => {
    const names = new Set<string>();

    instructorLessonTimes.forEach((time) => names.add(time.instructor));
    slots.forEach((slot) => {
      if (slot.instructor.trim()) {
        names.add(slot.instructor.trim());
      }
    });

    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ko-KR'));
  }, [instructorLessonTimes, slots]);
  const [selectedInstructor, setSelectedInstructor] = useState('');
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [instructorName, setInstructorName] = useState('');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1]);
  const [selectedLessonTimes, setSelectedLessonTimes] = useState<string[]>(['19:00']);
  const [saving, setSaving] = useState(false);
  const [cancelingTimeId, setCancelingTimeId] = useState<string | null>(null);
  const selectedTimes = useMemo(
    () =>
      instructorLessonTimes
        .filter((time) => time.instructor === selectedInstructor)
        .sort((a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes),
    [instructorLessonTimes, selectedInstructor]
  );
  const weeklyCount = selectedTimes.length;

  useEffect(() => {
    if (!selectedInstructor && instructorNames[0]) {
      setSelectedInstructor(instructorNames[0]);
      setInstructorName(instructorNames[0]);
      return;
    }

    if (selectedInstructor && !instructorNames.includes(selectedInstructor)) {
      setSelectedInstructor(instructorNames[0] ?? '');
      setInstructorName(instructorNames[0] ?? '');
    }
  }, [instructorNames, selectedInstructor]);

  function selectInstructor(name: string) {
    setSelectedInstructor(name);
    setInstructorName(name);
    setEditingTimeId(null);
  }

  function startNewInstructorTime() {
    setEditingTimeId(null);
    setInstructorName(selectedInstructor || instructorNames[0] || '');
    setSelectedWeekdays([1]);
    setSelectedLessonTimes(['19:00']);
  }

  function editInstructorTime(time: InstructorLessonTime) {
    setEditingTimeId(time.id);
    setInstructorName(time.instructor);
    setSelectedWeekdays([time.weekday]);
    setSelectedLessonTimes([time.timeLabel]);
  }

  async function saveTime() {
    if (saving) {
      return;
    }

    const normalizedInstructor = instructorName.trim();

    if (!normalizedInstructor) {
      Alert.alert('강사명 확인', '강사명을 입력해주세요.');
      return;
    }

    const parsedTimes = selectedLessonTimes
      .map((time) => ({ label: time, parts: parseLessonTimeInput(time) }))
      .filter((item): item is { label: string; parts: { hour: number; minute: number } } => Boolean(item.parts));

    if (selectedWeekdays.length === 0 || parsedTimes.length === 0) {
      Alert.alert('시간 확인', '요일과 수업 시간을 선택해주세요.');
      return;
    }

    try {
      setSaving(true);
      const targetWeekdays = editingTimeId ? [selectedWeekdays[0]] : selectedWeekdays;
      const targetTimes = editingTimeId ? [parsedTimes[0]] : parsedTimes;

      for (const weekday of targetWeekdays) {
        for (const time of targetTimes) {
          await onSaveInstructorLessonTime({
            id: editingTimeId,
            instructor: normalizedInstructor,
            weekday,
            hour: time.parts.hour,
            minute: time.parts.minute
          });
        }
      }

      setSelectedInstructor(normalizedInstructor);
      setEditingTimeId(null);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '강사 시간을 저장하지 못했습니다.';
      Alert.alert('저장 실패', message);
    } finally {
      setSaving(false);
    }
  }

  function confirmCancelTime(time: InstructorLessonTime) {
    if (cancelingTimeId) {
      return;
    }

    Alert.alert('강사 시간 삭제', `${time.instructor} 강사의 ${time.weekdayLabel} ${time.timeLabel} 배정을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            setCancelingTimeId(time.id);
            await onCancelInstructorLessonTime(time.id);
            if (editingTimeId === time.id) {
              startNewInstructorTime();
            }
          } catch (error) {
            const message = error instanceof DatabaseError ? error.message : '강사 시간을 삭제하지 못했습니다.';
            Alert.alert('삭제 실패', message);
          } finally {
            setCancelingTimeId(null);
          }
        }
      }
    ]);
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <View style={styles.feedbackCardTitleBlock}>
          <Text style={styles.adminOverviewTitle}>강사 배정</Text>
          <Text style={styles.requestMeta}>{selectedInstructor ? `${selectedInstructor} ${weeklyCount}개 시간` : '등록된 강사 없음'}</Text>
        </View>
        <Text style={styles.adminOverviewCount}>{instructorNames.length}명</Text>
      </View>

      {instructorNames.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarAssignmentMemberList}>
          {instructorNames.map((name) => {
            const selected = selectedInstructor === name;

            return (
              <Pressable
                key={name}
                style={[styles.calendarAssignmentMemberChip, selected && styles.calendarAssignmentMemberChipActive]}
                onPress={() => selectInstructor(name)}
                accessibilityRole="button"
              >
                <Text style={[styles.calendarAssignmentMemberName, selected && styles.calendarAssignmentMemberNameActive]}>{name}</Text>
                <Text style={[styles.calendarAssignmentMemberMeta, selected && styles.calendarAssignmentMemberMetaActive]}>
                  {instructorLessonTimes.filter((time) => time.instructor === name).length}개
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.fixedLessonEditor}>
        <TextInput
          style={styles.input}
          value={instructorName}
          onChangeText={setInstructorName}
          placeholder="강사명"
          placeholderTextColor={colors.muted}
        />
        <View style={styles.selectorBlock}>
          <Text style={styles.selectorLabel}>요일</Text>
          <MultiWeekdaySelector values={selectedWeekdays} onChange={setSelectedWeekdays} />
        </View>
        <View style={styles.selectorBlock}>
          <Text style={styles.selectorLabel}>시간</Text>
          <MultiLessonTimeSelector values={selectedLessonTimes} onChange={setSelectedLessonTimes} />
        </View>
        <View style={styles.composerActions}>
          <Pressable style={styles.secondaryButton} onPress={startNewInstructorTime} accessibilityRole="button">
            <Feather name="plus" size={17} color={colors.blue700} />
            <Text style={styles.secondaryButtonText}>새 시간</Text>
          </Pressable>
          <Pressable style={[styles.publishButton, saving && styles.disabledButton]} onPress={saveTime} disabled={saving}>
            <Feather name="save" size={17} color={colors.white} />
            <Text style={styles.publishButtonText}>
              {editingTimeId ? '변경 저장' : `${selectedWeekdays.length * selectedLessonTimes.length}개 등록`}
            </Text>
          </Pressable>
        </View>
      </View>

      {selectedTimes.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="briefcase" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>선택한 강사의 배정 시간이 없습니다.</Text>
        </View>
      ) : (
        <View style={styles.fixedLessonManageList}>
          {selectedTimes.map((time) => {
            const selected = editingTimeId === time.id;
            const canceling = cancelingTimeId === time.id;

            return (
              <View key={time.id} style={[styles.fixedLessonManageRow, selected && styles.fixedLessonManageRowActive]}>
                <View style={styles.fixedLessonManageCopy}>
                  <Text style={styles.fixedLessonManageTitle}>
                    {time.weekdayLabel} {time.timeLabel}
                  </Text>
                  <Text style={styles.fixedLessonManageMeta}>{time.instructor} 강사</Text>
                </View>
                <View style={styles.fixedLessonManageActions}>
                  <Pressable
                    style={[styles.memberAdjustButton, selected && styles.memberAdjustButtonActive]}
                    onPress={() => editInstructorTime(time)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.memberAdjustButtonText}>수정</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.memberAdjustButton, styles.memberAdjustButtonDanger, canceling && styles.disabledButton]}
                    onPress={() => confirmCancelTime(time)}
                    disabled={canceling}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.memberAdjustButtonText, styles.memberAdjustButtonTextDanger]}>삭제</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: keyof typeof Feather.glyphMap }) {
  return (
    <View style={styles.metricCard}>
      <Feather name={icon} size={22} color={colors.blue700} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function ReserveScreen({
  selectedDate,
  setSelectedDate,
  dateOptions,
  user,
  slots,
  members,
  passBalance,
  prefs,
  changeRequests,
  absenceRequests,
  assignmentRequests,
  lessonFeedbackTargets,
  onAbsence,
  onCancelAbsenceRequest,
  onCreateAssignmentRequest,
  onCancelAssignmentRequest,
  onCancelMyLessonReservation,
  onCreateLessonSlot,
  onUpdateLessonSlot,
  onAssignLessonReservation,
  onCancelLessonReservation,
  onCancelLessonSlot,
  onCancelFixedLessonAttendance,
  onPublishLessonFeedback
}: {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  dateOptions: DayOption[];
  user: User;
  slots: ClassSlot[];
  members: MemberSummary[];
  passBalance: number;
  prefs: NotificationPrefs;
  changeRequests: LessonChangeRequest[];
  absenceRequests: LessonAbsenceRequest[];
  assignmentRequests: LessonAssignmentRequest[];
  lessonFeedbackTargets: LessonFeedbackTarget[];
  onAbsence: (slot: ClassSlot) => Promise<AbsenceAction>;
  onCancelAbsenceRequest: (requestId: string) => Promise<void>;
  onCreateAssignmentRequest: (slotId: string, requestType: LessonAssignmentRequestType) => Promise<void>;
  onCancelAssignmentRequest: (requestId: string) => Promise<void>;
  onCancelMyLessonReservation: (slotId: string) => Promise<void>;
  onCreateLessonSlot: (slotDate: string, hour: number, minute: number, instructor: string, durationMinutes: number) => Promise<void>;
  onUpdateLessonSlot: (slotId: string, instructor: string, durationMinutes: number, capacity: number) => Promise<void>;
  onAssignLessonReservation: (slotId: string, memberId: string, durationMinutes: number) => Promise<void>;
  onCancelLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonSlot: (slotId: string) => Promise<void>;
  onCancelFixedLessonAttendance: (slotId: string, fixedLessonId: string) => Promise<void>;
  onPublishLessonFeedback: (input: PublishLessonFeedbackInput) => Promise<void>;
}) {
  const pendingAssignmentBySlot = useMemo(() => {
    return assignmentRequests
      .filter((request) => request.status === 'pending')
      .reduce<Map<string, LessonAssignmentRequest>>((map, request) => {
        map.set(request.slotId, request);
        return map;
      }, new Map());
  }, [assignmentRequests]);
  const pendingAbsenceBySlot = useMemo(() => {
    return absenceRequests
      .filter((request) => request.status === 'pending')
      .reduce<Map<string, LessonAbsenceRequest>>((map, request) => {
        map.set(request.slotId, request);
        return map;
      }, new Map());
  }, [absenceRequests]);
  const pendingChangeBySource = useMemo(() => {
    return changeRequests
      .filter((request) => request.status === 'pending')
      .reduce<Map<string, LessonChangeRequest>>((map, request) => {
        map.set(request.sourceSlotId, request);
        return map;
      }, new Map());
  }, [changeRequests]);

  const daySlots = slots
    .filter((slot) => {
      if (slot.date !== selectedDate) {
        return false;
      }

      if (user.role === 'admin') {
        return isVisibleLessonSlot(slot, user);
      }

      return (
        isFixedLessonForUser(slot, user) ||
        isReservedByUser(slot, user) ||
        pendingAssignmentBySlot.has(slot.id) ||
        (passBalance > 0 && isWithinRequestableWindow(slot) && isUnassignedOpenLesson(slot)) ||
        (isWithinRequestableWindow(slot) && isFreeSwimCandidateSlot(slot))
      );
    })
    .sort(sortSlotsByStartsAt);
  const [submittingSlotId, setSubmittingSlotId] = useState<string | null>(null);
  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(null);
  const todayKey = getTodayKey();

  if (user.role === 'admin') {
    return (
      <AdminLessonTabScreen
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        dateOptions={dateOptions}
        slots={slots}
        members={members}
        lessonFeedbackTargets={lessonFeedbackTargets}
        onOpenLessonSlot={onCreateLessonSlot}
        onUpdateLessonSlot={onUpdateLessonSlot}
        onAssignLessonReservation={onAssignLessonReservation}
        onCancelLessonReservation={onCancelLessonReservation}
        onCancelLessonSlot={onCancelLessonSlot}
        onCancelFixedLessonAttendance={onCancelFixedLessonAttendance}
        onPublishLessonFeedback={onPublishLessonFeedback}
      />
    );
  }

  async function toggleAbsence(slot: ClassSlot) {
    if (user.role === 'admin') {
      Alert.alert('관리자 모드', '관리자는 회원별 고정 수업과 열린 자리를 확인할 수 있습니다.');
      return;
    }

    try {
      const action = await onAbsence(slot);
      const slotLabel = `${slot.shortDateLabel} ${formatSlotHour(slot.startsAt)}`;

      if (action === 'absenceRequested' && prefs.reservation) {
        await sendLocalNotification('수업 취소 요청 접수', `${slotLabel} 고정 수업 취소 요청이 관리자에게 전달되었습니다.`);
        Alert.alert('요청 완료', '관리자 승인 후 수업이 취소되고 빈자리로 공개됩니다.');
      }

      if (action === 'absenceCanceled' && prefs.reservation) {
        await sendLocalNotification('수업 취소 철회', `${slotLabel} 고정 수업 취소 처리가 철회되었습니다.`);
      }
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '수업 취소 내용을 저장하지 못했습니다.';
      Alert.alert('수업 취소 실패', message);
    }
  }

  async function cancelAbsenceRequest(request: LessonAbsenceRequest) {
    if (cancelingRequestId) {
      return;
    }

    try {
      setCancelingRequestId(request.id);
      await onCancelAbsenceRequest(request.id);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '수업 취소 요청을 취소하지 못했습니다.';
      Alert.alert('취소 실패', message);
    } finally {
      setCancelingRequestId(null);
    }
  }

  async function requestAssignment(slot: ClassSlot, requestType: LessonAssignmentRequestType) {
    if (user.role === 'admin') {
      Alert.alert('관리자 모드', '관리자는 홈 화면에서 회원별 운영 현황을 확인할 수 있습니다.');
      return;
    }

    if (requestType === 'extra_lesson' && passBalance <= 0) {
      Alert.alert('남은 횟수가 없습니다', '횟수권을 충전한 뒤 예약할 수 있습니다.');
      return;
    }

    const requestLabel = formatAssignmentRequestType(requestType);
    const slotLabel = `${slot.shortDateLabel} ${formatSlotHour(slot.startsAt)}`;
    const requestDescription =
      requestType === 'free_swim'
        ? `${slotLabel} 자유수영을 신청합니다.`
        : `${slotLabel} 추가 수업을 신청합니다.`;

    Alert.alert(`${requestLabel} 신청`, `${requestDescription}\n관리자에게 신청할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '신청',
        onPress: async () => {
          try {
            setSubmittingSlotId(slot.id);
            await onCreateAssignmentRequest(slot.id, requestType);

            if (prefs.reservation) {
              await sendLocalNotification('신청 접수', `${slotLabel} ${requestLabel} 신청이 관리자에게 전달되었습니다.`);
            }

            Alert.alert('신청 완료', '관리자 승인 후 배정이 확정됩니다.');
          } catch (error) {
            const message = error instanceof DatabaseError ? error.message : '신청을 저장하지 못했습니다.';
            Alert.alert('신청 실패', message);
          } finally {
            setSubmittingSlotId(null);
          }
        }
      }
    ]);
  }

  async function cancelAssignmentRequest(request: LessonAssignmentRequest) {
    if (cancelingRequestId) {
      return;
    }

    try {
      setCancelingRequestId(request.id);
      await onCancelAssignmentRequest(request.id);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '신청을 취소하지 못했습니다.';
      Alert.alert('취소 실패', message);
    } finally {
      setCancelingRequestId(null);
    }
  }

  function cancelAssignedLesson(slot: ClassSlot) {
    if (submittingSlotId) {
      return;
    }

    const slotLabel = `${slot.shortDateLabel} ${formatSlotHour(slot.startsAt)}`;

    Alert.alert('수업 취소', `${slotLabel} 수업을 취소할까요?`, [
      { text: '닫기', style: 'cancel' },
      {
        text: '취소',
        style: 'destructive',
        onPress: async () => {
          try {
            setSubmittingSlotId(slot.id);
            await onCancelMyLessonReservation(slot.id);

            if (prefs.reservation) {
              await sendLocalNotification('수업 취소', `${slotLabel} 수업이 취소되었습니다.`);
            }
          } catch (error) {
            const message = error instanceof DatabaseError ? error.message : '수업을 취소하지 못했습니다.';
            Alert.alert('취소 실패', message);
          } finally {
            setSubmittingSlotId(null);
          }
        }
      }
    ]);
  }

  return (
    <View style={styles.screenBody}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daySelector}>
        {dateOptions.map((day) => {
          const selected = selectedDate === day.id;
          return (
            <Pressable key={day.id} style={[styles.dayPill, selected && styles.dayPillActive]} onPress={() => setSelectedDate(day.id)}>
              <Text style={[styles.dayPillText, selected && styles.dayPillTextActive]}>{day.shortLabel}</Text>
              {day.caption ? (
                <Text style={[styles.dayPillCaption, selected && styles.dayPillTextActive]}>{day.caption}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.passSummary}>
        <View style={styles.passSummaryStat}>
          <Feather name="credit-card" size={22} color={colors.blue700} />
          <View>
            <Text style={styles.passSummaryLabel}>남은 수업권</Text>
            <Text style={styles.passSummaryValue}>{passBalance}회</Text>
          </View>
        </View>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.slotList} showsVerticalScrollIndicator={false}>
        {daySlots.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="calendar" size={22} color={colors.blue700} />
            <Text style={styles.emptyStateText}>이 날짜에는 표시할 수업이 없습니다.</Text>
          </View>
        ) : null}
        {daySlots.map((slot) => {
          const fixedMine = isFixedLessonForUser(slot, user);
          const assignedMine = isReservedByUser(slot, user);
          const absenceMine = isAbsentByUser(slot, user);
          const pendingRequest = pendingAssignmentBySlot.get(slot.id);
          const pendingAbsenceRequest = fixedMine ? pendingAbsenceBySlot.get(slot.id) : undefined;
          const pendingChangeRequest = fixedMine ? pendingChangeBySource.get(slot.id) : undefined;
          const assignedBySomeone = hasAnyAssignedMember(slot);
          const canShowRequestableSlot = user.role === 'admin' || isWithinRequestableWindow(slot);
          const unassignedOpen = canShowRequestableSlot && isUnassignedOpenLesson(slot);
          const freeSwimCandidate = canShowRequestableSlot && isFreeSwimCandidateSlot(slot);
          const absenceRequestClosed = fixedMine && !absenceMine && !pendingAbsenceRequest && slot.date <= todayKey;
          const assignedCancellationClosed = assignedMine && slot.date <= todayKey;
          const absenceCancellationBlocked = absenceMine && slot.substitutes.length >= slot.absences.length;
          const canRequestExtra = user.role === 'member' && unassignedOpen && !pendingRequest && passBalance > 0;
          const canRequestFreeSwim = user.role === 'member' && freeSwimCandidate && !pendingRequest;
          const isRequesting = submittingSlotId === slot.id;
          const isCancelingRequest = pendingRequest ? cancelingRequestId === pendingRequest.id : false;
          const isCancelingAbsence = pendingAbsenceRequest ? cancelingRequestId === pendingAbsenceRequest.id : false;
          const disabled =
            user.role === 'admin' ||
            isRequesting ||
            isCancelingRequest ||
            isCancelingAbsence ||
            (fixedMine && Boolean(pendingChangeRequest)) ||
            absenceRequestClosed ||
            assignedCancellationClosed ||
            (fixedMine && absenceCancellationBlocked) ||
            (!fixedMine && !assignedMine && !pendingRequest && !canRequestExtra && !canRequestFreeSwim);
          const buttonLabel = (() => {
            if (user.role === 'admin') {
              return '확인';
            }

            if (fixedMine && absenceMine && absenceCancellationBlocked) {
              return '대체완료';
            }

            if (fixedMine && absenceMine) {
              return '취소철회';
            }

            if (fixedMine && pendingAbsenceRequest) {
              return isCancelingAbsence ? '취소중' : '요청취소';
            }

            if (fixedMine) {
              return absenceRequestClosed ? '마감' : '취소';
            }

            if (pendingRequest) {
              return isCancelingRequest ? '취소중' : '대기취소';
            }

            if (assignedMine) {
              return assignedCancellationClosed ? '마감' : isRequesting ? '취소중' : '취소';
            }

            if (canRequestExtra) {
              return isRequesting ? '신청중' : '추가신청';
            }

            if (canRequestFreeSwim) {
              return isRequesting ? '신청중' : '자유수영';
            }

            if (assignedBySomeone) {
              return '배정됨';
            }

            return slot.isActive ? '마감' : '닫힘';
          })();
          const statusColor = fixedMine
            ? pendingAbsenceRequest
              ? colors.warning
              : absenceMine
              ? colors.warning
              : colors.success
            : assignedMine
              ? colors.success
            : pendingRequest
              ? colors.warning
              : unassignedOpen
                ? colors.aqua500
                : freeSwimCandidate
                  ? colors.blue700
                  : assignedBySomeone
                    ? colors.blue600
                    : colors.muted;
          const slotMeta = (() => {
            if (fixedMine) {
              if (pendingChangeRequest) {
                return `변경 대기 · ${formatSlotBrief(pendingChangeRequest.targetStartsAt)}`;
              }

              if (pendingAbsenceRequest) {
                return '취소 승인 대기';
              }

              if (absenceMine) {
                return '취소된 수업';
              }

              if (absenceRequestClosed) {
                return '수업 취소 마감';
              }

              return '내 고정 수업';
            }

            if (assignedMine) {
              if (assignedCancellationClosed) {
                return slot.isActive ? '추가 수업 취소 마감' : '자유수영 취소 마감';
              }

              return slot.isActive ? '내 추가 수업' : '내 자유수영';
            }

            if (pendingRequest) {
              return `${formatAssignmentRequestType(pendingRequest.requestType)} 승인 대기`;
            }

            if (user.role === 'admin') {
              if (assignedBySomeone) {
                return slot.isActive ? '다른 회원 배정' : '닫힌 시간 · 배정 있음';
              }

              if (unassignedOpen) {
                return '수업 열림 · 배정 없음';
              }

              if (freeSwimCandidate) {
                return '수업 닫힘 · 자유수영 가능';
              }

              return slot.isActive ? '수업 열림' : '수업 닫힘';
            }

            return '';
          })();
          const showSlotMeta = Boolean(slotMeta);
          const handlePress = () => {
            if (fixedMine) {
              if (pendingAbsenceRequest) {
                void cancelAbsenceRequest(pendingAbsenceRequest);
                return;
              }

              void toggleAbsence(slot);
              return;
            }

            if (pendingRequest) {
              void cancelAssignmentRequest(pendingRequest);
              return;
            }

            if (assignedMine) {
              cancelAssignedLesson(slot);
              return;
            }

            if (canRequestExtra) {
              void requestAssignment(slot, 'extra_lesson');
              return;
            }

            if (canRequestFreeSwim) {
              void requestAssignment(slot, 'free_swim');
            }
          };
          const fixedAbsenceLabel = pendingAbsenceRequest
            ? isCancelingAbsence
              ? '취소중'
              : '요청취소'
            : absenceMine
              ? absenceCancellationBlocked
                ? '대체완료'
                : '취소철회'
              : absenceRequestClosed
                ? '마감'
                : '취소';
          const metaIcon = fixedMine || assignedMine
            ? 'user'
            : pendingRequest
              ? 'clock'
              : unassignedOpen || freeSwimCandidate
                  ? 'plus-circle'
                  : assignedBySomeone
                    ? 'users'
                    : 'lock';
          const showSlotActionButton =
            user.role === 'admin' ||
            assignedMine ||
            Boolean(pendingRequest) ||
            canRequestExtra ||
            canRequestFreeSwim;
          return (
            <View key={slot.id} style={[styles.slotCard, (fixedMine || assignedMine) && styles.slotCardReserved]}>
              <View style={styles.slotTimeBlock}>
                <Text style={styles.slotTime}>{formatSlotHour(slot.startsAt)}</Text>
                <View style={[styles.slotStatusDot, { backgroundColor: statusColor }]} />
              </View>
              <View style={styles.slotDetails}>
                <Text style={styles.slotTitle}>
                  {slot.instructor} 강사 · {formatLessonDuration(slot.durationMinutes)}
                </Text>
                {showSlotMeta ? (
                  <View style={styles.slotMetaRow}>
                    <Feather name={metaIcon} size={13} color={statusColor} />
                    <Text style={styles.slotMeta}>{slotMeta}</Text>
                  </View>
                ) : null}
              </View>
              {fixedMine ? (
                <View style={styles.slotActionGroup}>
                  <Pressable
                    style={[
                      styles.reserveButton,
                      styles.compactReserveButton,
                      (pendingAbsenceRequest || (absenceMine && !absenceCancellationBlocked)) && styles.cancelButton,
                      disabled && styles.disabledButton
                    ]}
                    onPress={handlePress}
                    disabled={disabled}
                    accessibilityLabel={fixedAbsenceLabel}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.reserveButtonText,
                        styles.compactReserveButtonText,
                        (pendingAbsenceRequest || (absenceMine && !absenceCancellationBlocked)) && styles.cancelButtonText
                      ]}
                    >
                      {fixedAbsenceLabel}
                    </Text>
                  </Pressable>
                </View>
              ) : showSlotActionButton ? (
                <Pressable
                  style={[
                    styles.reserveButton,
                    (pendingRequest || assignedMine) && styles.cancelButton,
                    (disabled || canRequestExtra || canRequestFreeSwim) && !pendingRequest && !assignedMine && styles.waitButton,
                    disabled && styles.disabledButton
                  ]}
                  onPress={handlePress}
                  disabled={disabled}
                  accessibilityLabel={buttonLabel}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.reserveButtonText,
                      (pendingRequest || assignedMine) && styles.cancelButtonText,
                      (disabled || canRequestExtra || canRequestFreeSwim) && !pendingRequest && !assignedMine && styles.waitButtonText
                    ]}
                  >
                    {buttonLabel}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </KeyboardAwareScrollView>
    </View>
  );
}

function AdminLessonTabScreen({
  selectedDate,
  setSelectedDate,
  dateOptions,
  slots,
  members,
  lessonFeedbackTargets,
  onOpenLessonSlot,
  onUpdateLessonSlot,
  onAssignLessonReservation,
  onCancelLessonReservation,
  onCancelLessonSlot,
  onCancelFixedLessonAttendance,
  onPublishLessonFeedback
}: {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  dateOptions: DayOption[];
  slots: ClassSlot[];
  members: MemberSummary[];
  lessonFeedbackTargets: LessonFeedbackTarget[];
  onOpenLessonSlot: (slotDate: string, hour: number, minute: number, instructor: string, durationMinutes: number) => Promise<void>;
  onUpdateLessonSlot: (slotId: string, instructor: string, durationMinutes: number, capacity: number) => Promise<void>;
  onAssignLessonReservation: (slotId: string, memberId: string, durationMinutes: number) => Promise<void>;
  onCancelLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonSlot: (slotId: string) => Promise<void>;
  onCancelFixedLessonAttendance: (slotId: string, fixedLessonId: string) => Promise<void>;
  onPublishLessonFeedback: (input: PublishLessonFeedbackInput) => Promise<void>;
}) {
  const [readOnly, setReadOnly] = useState(false);
  const [assigningSlot, setAssigningSlot] = useState<ClassSlot | null>(null);
  const [editingSlot, setEditingSlot] = useState<ClassSlot | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<LessonFeedbackTarget | null>(null);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const daySelectorRef = useRef<ScrollView | null>(null);
  const daySlots = useMemo(
    () => slots.filter((slot) => slot.date === selectedDate).sort(sortSlotsByStartsAt),
    [selectedDate, slots]
  );
  const feedbackTargetsByKey = useMemo(
    () => new Map(lessonFeedbackTargets.map((target) => [getFeedbackTargetKey(target), target])),
    [lessonFeedbackTargets]
  );
  const selectedDateLabel = dateOptions.find((day) => day.id === selectedDate)?.label ?? selectedDate;
  const instructorNames = useMemo(() => {
    const names = new Set<string>();

    slots.forEach((slot) => {
      if (slot.instructor.trim()) {
        names.add(slot.instructor.trim());
      }
    });

    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ko-KR'));
  }, [slots]);
  const openCount = daySlots.filter((slot) => slot.isActive).length;
  const assignedCount = daySlots.reduce((count, slot) => count + slot.fixedMembers.length + slot.substitutes.length, 0);

  useEffect(() => {
    const selectedIndex = dateOptions.findIndex((day) => day.id === selectedDate);

    if (selectedIndex < 0) {
      return;
    }

    daySelectorRef.current?.scrollTo({ x: Math.max(0, selectedIndex * 62 - 20), animated: false });
  }, [dateOptions, selectedDate]);

  function openFeedback(slot: ClassSlot, person: ReservationPerson) {
    const existingTarget = person.userId ? feedbackTargetsByKey.get(getFeedbackTargetKeyFor(slot.id, person.userId)) : undefined;

    if (!canWriteLessonFeedbackForPerson(slot, person, existingTarget)) {
      Alert.alert('피드백 작성', '종료된 수업의 배정 회원에게만 피드백을 작성할 수 있습니다.');
      return;
    }

    setFeedbackTarget(createLessonFeedbackTargetFromPerson(slot, person, existingTarget));
  }

  async function openSlot(slot: ClassSlot) {
    if (busySlotId) {
      return;
    }

    try {
      setBusySlotId(slot.id);
      await onOpenLessonSlot(slot.date, slot.hour, slot.minute, slot.instructor, slot.durationMinutes);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '수업을 열지 못했습니다.';
      Alert.alert('열기 실패', message);
    } finally {
      setBusySlotId(null);
    }
  }

  function confirmCloseSlot(slot: ClassSlot) {
    if (busySlotId) {
      return;
    }

    Alert.alert('수업 닫기', `${slot.shortDateLabel} ${formatSlotHour(slot.startsAt)} 수업을 닫을까요? 배정된 추가 수업은 취소됩니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '닫기',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusySlotId(slot.id);
            await onCancelLessonSlot(slot.id);
          } catch (error) {
            const message = error instanceof DatabaseError ? error.message : '수업을 닫지 못했습니다.';
            Alert.alert('닫기 실패', message);
          } finally {
            setBusySlotId(null);
          }
        }
      }
    ]);
  }

  function confirmCancelReservation(slot: ClassSlot, person: ReservationPerson) {
    if (busySlotId || !person.userId) {
      return;
    }

    Alert.alert('개별 배정 취소', `${person.userName} 회원의 ${formatSlotHour(slot.startsAt)} 배정을 취소할까요?`, [
      { text: '닫기', style: 'cancel' },
      {
        text: '취소',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusySlotId(slot.id);
            await onCancelLessonReservation(slot.id, person.userId);
          } catch (error) {
            const message = error instanceof DatabaseError ? error.message : '배정을 취소하지 못했습니다.';
            Alert.alert('취소 실패', message);
          } finally {
            setBusySlotId(null);
          }
        }
      }
    ]);
  }

  function confirmCancelFixedAttendance(slot: ClassSlot, person: ReservationPerson) {
    if (busySlotId || !person.fixedLessonId) {
      return;
    }

    Alert.alert('이 날짜만 제외', `${person.userName} 회원을 ${slot.shortDateLabel} ${formatSlotHour(slot.startsAt)} 수업에서만 제외할까요? 고정수업 자체는 유지됩니다.`, [
      { text: '닫기', style: 'cancel' },
      {
        text: '제외',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusySlotId(slot.id);
            await onCancelFixedLessonAttendance(slot.id, person.fixedLessonId ?? '');
          } catch (error) {
            const message = error instanceof DatabaseError ? error.message : '고정 회원을 제외하지 못했습니다.';
            Alert.alert('제외 실패', message);
          } finally {
            setBusySlotId(null);
          }
        }
      }
    ]);
  }

  return (
    <View style={styles.screenBody}>
      <ScrollView ref={daySelectorRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daySelector}>
        {dateOptions.map((day) => {
          const selected = selectedDate === day.id;

          return (
            <Pressable key={day.id} style={[styles.dayPill, selected && styles.dayPillActive]} onPress={() => setSelectedDate(day.id)}>
              <Text style={[styles.dayPillText, selected && styles.dayPillTextActive]}>{day.shortLabel}</Text>
              {day.caption ? <Text style={[styles.dayPillCaption, selected && styles.dayPillTextActive]}>{day.caption}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.adminLessonToolbar}>
        <View style={styles.feedbackCardTitleBlock}>
          <Text style={styles.adminOverviewTitle}>{selectedDateLabel}</Text>
          <Text style={styles.requestMeta}>{openCount}/{daySlots.length}개 열림 · 배정 {assignedCount}명</Text>
        </View>
        <Pressable style={styles.memberAdjustButton} onPress={() => setReadOnly((current) => !current)} accessibilityRole="button">
          <Feather name={readOnly ? 'edit-2' : 'eye'} size={16} color={colors.blue700} />
          <Text style={styles.memberAdjustButtonText}>{readOnly ? '운영' : '확정표'}</Text>
        </Pressable>
      </View>

      {readOnly ? (
        <AdminFinalScheduleView slots={daySlots} />
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={styles.lessonOperationList} showsVerticalScrollIndicator={false}>
          {daySlots.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="calendar" size={22} color={colors.blue700} />
              <Text style={styles.emptyStateText}>이 날짜에는 수업 시간이 없습니다.</Text>
            </View>
          ) : null}
          {daySlots.map((slot) => (
            <AdminLessonOperationCard
              key={slot.id}
              slot={slot}
              busy={busySlotId === slot.id}
              onAssign={() => setAssigningSlot(slot)}
              onEdit={() => setEditingSlot(slot)}
              onOpen={() => openSlot(slot)}
              onClose={() => confirmCloseSlot(slot)}
              onCancelReservation={(person) => confirmCancelReservation(slot, person)}
              onCancelFixedAttendance={(person) => confirmCancelFixedAttendance(slot, person)}
              feedbackTargetsByKey={feedbackTargetsByKey}
              onOpenFeedback={(person) => openFeedback(slot, person)}
            />
          ))}
        </KeyboardAwareScrollView>
      )}

      <AdminAssignLessonModal
        visible={Boolean(assigningSlot)}
        slot={assigningSlot}
        members={members}
        onClose={() => setAssigningSlot(null)}
        onAssign={async (memberId, durationMinutes) => {
          if (!assigningSlot) {
            return;
          }

          try {
            setBusySlotId(assigningSlot.id);
            await onAssignLessonReservation(assigningSlot.id, memberId, durationMinutes);
            setAssigningSlot(null);
          } catch (error) {
            const message = error instanceof DatabaseError ? error.message : '회원을 배정하지 못했습니다.';
            Alert.alert('배정 실패', message);
          } finally {
            setBusySlotId(null);
          }
        }}
      />

      <AdminEditLessonModal
        visible={Boolean(editingSlot)}
        slot={editingSlot}
        instructorNames={instructorNames}
        onClose={() => setEditingSlot(null)}
        onSave={async (instructor, durationMinutes, capacity) => {
          if (!editingSlot) {
            return;
          }

          try {
            setBusySlotId(editingSlot.id);
            await onUpdateLessonSlot(editingSlot.id, instructor, durationMinutes, capacity);
            setEditingSlot(null);
          } catch (error) {
            const message = error instanceof DatabaseError ? error.message : '수업 정보를 변경하지 못했습니다.';
            Alert.alert('변경 실패', message);
          } finally {
            setBusySlotId(null);
          }
        }}
      />

      <AdminLessonFeedbackModal
        target={feedbackTarget}
        onClose={() => setFeedbackTarget(null)}
        onPublishLessonFeedback={onPublishLessonFeedback}
      />
    </View>
  );
}

function AdminLessonOperationCard({
  slot,
  busy,
  onAssign,
  onEdit,
  onOpen,
  onClose,
  onCancelReservation,
  onCancelFixedAttendance,
  feedbackTargetsByKey,
  onOpenFeedback
}: {
  slot: ClassSlot;
  busy: boolean;
  onAssign: () => void;
  onEdit: () => void;
  onOpen: () => void;
  onClose: () => void;
  onCancelReservation: (person: ReservationPerson) => void;
  onCancelFixedAttendance: (person: ReservationPerson) => void;
  feedbackTargetsByKey: ReadonlyMap<string, LessonFeedbackTarget>;
  onOpenFeedback: (person: ReservationPerson) => void;
}) {
  const absentUserIds = new Set(slot.absences.map((person) => person.userId));
  const activeFixedMembers = slot.fixedMembers.filter((person) => !absentUserIds.has(person.userId));
  const occupiedCount = activeFixedMembers.length + slot.substitutes.length;
  const pastSlot = isPastDate(slot.startsAt);
  const statusLabel = pastSlot ? '종료' : slot.isActive ? '열림' : '닫힘';
  const statusStyle = pastSlot ? styles.timelineBadgePast : slot.isActive ? styles.statusBadgeSuccess : styles.timelineBadgePast;
  const renderFeedbackButton = (person: ReservationPerson) => {
    const target = person.userId ? feedbackTargetsByKey.get(getFeedbackTargetKeyFor(slot.id, person.userId)) : undefined;

    if (!canWriteLessonFeedbackForPerson(slot, person, target)) {
      return null;
    }

    return (
      <Pressable
        style={styles.personLineButton}
        onPress={() => onOpenFeedback(person)}
        accessibilityRole="button"
        accessibilityLabel={`${person.userName} 피드백 작성`}
      >
        <Text style={styles.personLineButtonText}>{target?.feedbackId ? '수정' : '피드백'}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.lessonOperationCard, !slot.isActive && styles.lessonOperationCardClosed]}>
      <View style={styles.lessonOperationHeader}>
        <View style={styles.lessonOperationTime}>
          <Text style={styles.adminReservationDay}>{slot.shortDateLabel}</Text>
          <Text style={styles.lessonOperationHour}>{formatSlotHour(slot.startsAt)}</Text>
        </View>
        <View style={styles.lessonOperationTitleBlock}>
          <View style={styles.lessonOperationTitleRow}>
            <Text style={styles.lessonOperationTitle}>{slot.instructor || '강사 미정'} 강사</Text>
            <Text style={[styles.timelineBadge, statusStyle]}>{statusLabel}</Text>
          </View>
          <Text style={styles.adminReservationMeta}>
            {formatLessonDuration(slot.durationMinutes)} · 정원 {slot.capacity}명 · 배정 {occupiedCount}명
          </Text>
        </View>
      </View>

      <View style={styles.lessonPersonSection}>
        {slot.fixedMembers.length === 0 && slot.substitutes.length === 0 ? (
          <Text style={styles.calendarMutedText}>배정된 회원이 없습니다.</Text>
        ) : null}

        {slot.fixedMembers.map((person) => {
          const absent = absentUserIds.has(person.userId);
          const durationLabel = formatLessonDuration(person.durationMinutes ?? slot.durationMinutes);

          return (
            <View key={`${person.fixedLessonId ?? person.userId}-${person.userName}`} style={styles.lessonPersonLine}>
              <View style={styles.lessonPersonCopy}>
                <Text style={[styles.lessonPersonName, absent && styles.lessonPersonNameMuted]}>{person.userName}</Text>
                <Text style={[styles.lessonPersonMeta, absent && styles.calendarAbsenceText]}>
                  {absent ? '이 날짜만 제외됨' : `고정수업 · ${durationLabel}`}
                </Text>
              </View>
              <View style={styles.lessonPersonActions}>
                {!absent ? renderFeedbackButton(person) : null}
                {!absent && person.fixedLessonId ? (
                  <Pressable
                    style={[styles.personLineButton, (busy || pastSlot) && styles.disabledButton]}
                    onPress={() => onCancelFixedAttendance(person)}
                    disabled={busy || pastSlot}
                    accessibilityRole="button"
                  >
                    <Text style={styles.personLineButtonText}>제외</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}

        {slot.substitutes.map((person) => (
          <View key={`${person.userId}-${person.createdAt}`} style={styles.lessonPersonLine}>
            <View style={styles.lessonPersonCopy}>
              <Text style={styles.lessonPersonName}>{person.userName}</Text>
              <Text style={[styles.lessonPersonMeta, styles.calendarSubstituteText]}>
                개별 배정 · {formatLessonDuration(person.durationMinutes ?? slot.durationMinutes)}
              </Text>
            </View>
            <View style={styles.lessonPersonActions}>
              {renderFeedbackButton(person)}
              <Pressable
                style={[styles.personLineButton, styles.personLineButtonDanger, (busy || pastSlot) && styles.disabledButton]}
                onPress={() => onCancelReservation(person)}
                disabled={busy || pastSlot}
                accessibilityRole="button"
              >
                <Text style={[styles.personLineButtonText, styles.memberAdjustButtonTextDanger]}>취소</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.lessonOperationActions}>
        <Pressable
          style={[styles.memberAdjustButton, (!slot.isActive || busy || pastSlot) && styles.disabledButton]}
          onPress={onAssign}
          disabled={!slot.isActive || busy || pastSlot}
          accessibilityRole="button"
        >
          <Feather name="user-plus" size={15} color={colors.blue700} />
          <Text style={styles.memberAdjustButtonText}>회원배정</Text>
        </Pressable>
        <Pressable style={[styles.memberAdjustButton, (busy || pastSlot) && styles.disabledButton]} onPress={onEdit} disabled={busy || pastSlot} accessibilityRole="button">
          <Feather name="settings" size={15} color={colors.blue700} />
          <Text style={styles.memberAdjustButtonText}>강사/시간</Text>
        </Pressable>
        <Pressable
          style={[styles.memberAdjustButton, slot.isActive && styles.memberAdjustButtonDanger, (busy || pastSlot) && styles.disabledButton]}
          onPress={slot.isActive ? onClose : onOpen}
          disabled={busy || pastSlot}
          accessibilityRole="button"
        >
          <Feather name={slot.isActive ? 'x-circle' : 'check-circle'} size={15} color={slot.isActive ? colors.danger : colors.blue700} />
          <Text style={[styles.memberAdjustButtonText, slot.isActive && styles.memberAdjustButtonTextDanger]}>
            {slot.isActive ? '닫기' : '열기'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function AdminAssignLessonModal({
  visible,
  slot,
  members,
  onClose,
  onAssign
}: {
  visible: boolean;
  slot: ClassSlot | null;
  members: MemberSummary[];
  onClose: () => void;
  onAssign: (memberId: string, durationMinutes: number) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const memberOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return members
      .filter((member) => member.role === 'member')
      .filter((member) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          member.name.toLowerCase().includes(normalizedQuery) ||
          member.email.toLowerCase().includes(normalizedQuery) ||
          formatPhoneNumber(member.phone).includes(normalizedQuery)
        );
      });
  }, [members, query]);
  const selectedMember = memberOptions.find((member) => member.id === selectedMemberId) ?? memberOptions[0] ?? null;

  useEffect(() => {
    if (!visible) {
      return;
    }

    setDurationMinutes(60);

    if (!selectedMemberId && memberOptions[0]) {
      setSelectedMemberId(memberOptions[0].id);
      return;
    }

    if (selectedMemberId && !memberOptions.some((member) => member.id === selectedMemberId)) {
      setSelectedMemberId(memberOptions[0]?.id ?? null);
    }
  }, [memberOptions, selectedMemberId, visible]);

  async function submit() {
    if (!selectedMember || submitting) {
      return;
    }

    try {
      setSubmitting(true);
      await onAssign(selectedMember.id, durationMinutes);
    } finally {
      setSubmitting(false);
    }
  }

  if (!slot) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.feedbackCardTitleBlock}>
              <Text style={styles.modalTitle}>회원배정</Text>
              <Text style={styles.requestMeta}>
                {slot.shortDateLabel} {formatSlotHour(slot.startsAt)} · {slot.instructor} 강사
              </Text>
            </View>
            <Pressable style={styles.modalCloseButton} onPress={onClose} accessibilityRole="button">
              <Feather name="x" size={18} color={colors.blue700} />
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="회원 이름, 이메일, 전화번호 검색"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />

          <ScrollView style={styles.modalMemberList} nestedScrollEnabled showsVerticalScrollIndicator>
            {memberOptions.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="search" size={22} color={colors.blue700} />
                <Text style={styles.emptyStateText}>검색된 회원이 없습니다.</Text>
              </View>
            ) : (
              memberOptions.map((member) => {
                const selected = selectedMember?.id === member.id;

                return (
                  <Pressable
                    key={member.id}
                    style={[styles.memberPickerRow, selected && styles.memberPickerRowActive]}
                    onPress={() => setSelectedMemberId(member.id)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.memberPickerName, selected && styles.memberPickerNameActive]}>{member.name}</Text>
                    <Text style={[styles.memberPickerMeta, selected && styles.memberPickerMetaActive]}>
                      잔여 {member.passBalance}회 · {formatLessonCapacity(member.lessonCapacity)}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View style={styles.selectorBlock}>
            <Text style={styles.selectorLabel}>수업 길이</Text>
            <DurationSelector value={durationMinutes} onChange={setDurationMinutes} />
          </View>

          <View style={styles.modalActions}>
            <Pressable style={styles.secondaryButton} onPress={onClose} accessibilityRole="button">
              <Text style={styles.secondaryButtonText}>닫기</Text>
            </Pressable>
            <Pressable
              style={[styles.publishButton, (!selectedMember || submitting) && styles.disabledButton]}
              onPress={submit}
              disabled={!selectedMember || submitting}
              accessibilityRole="button"
            >
              <Feather name="check" size={17} color={colors.white} />
              <Text style={styles.publishButtonText}>배정</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AdminEditLessonModal({
  visible,
  slot,
  instructorNames,
  onClose,
  onSave
}: {
  visible: boolean;
  slot: ClassSlot | null;
  instructorNames: string[];
  onClose: () => void;
  onSave: (instructor: string, durationMinutes: number, capacity: number) => Promise<void>;
}) {
  const [instructor, setInstructor] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity, setCapacity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const instructorOptions = useMemo(() => {
    const names = new Set(instructorNames);

    if (slot?.instructor.trim()) {
      names.add(slot.instructor.trim());
    }

    return Array.from(names)
      .sort((a, b) => a.localeCompare(b, 'ko-KR'))
      .map((name) => ({ value: name, label: `${name} 강사` }));
  }, [instructorNames, slot]);

  useEffect(() => {
    if (!slot || !visible) {
      return;
    }

    setInstructor(slot.instructor.trim());
    setDurationMinutes(slot.durationMinutes);
    setCapacity(slot.capacity);
  }, [slot, visible]);

  async function submit() {
    if (submitting || !slot) {
      return;
    }

    const normalizedInstructor = instructor.trim();

    if (!normalizedInstructor) {
      Alert.alert('강사 선택', '배정할 강사를 선택해주세요.');
      return;
    }

    try {
      setSubmitting(true);
      await onSave(normalizedInstructor, durationMinutes, capacity);
    } finally {
      setSubmitting(false);
    }
  }

  if (!slot) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.feedbackCardTitleBlock}>
              <Text style={styles.modalTitle}>강사/시간</Text>
              <Text style={styles.requestMeta}>
                {slot.shortDateLabel} {formatSlotHour(slot.startsAt)}
              </Text>
            </View>
            <Pressable style={styles.modalCloseButton} onPress={onClose} accessibilityRole="button">
              <Feather name="x" size={18} color={colors.blue700} />
            </Pressable>
          </View>

          <View style={styles.selectorBlock}>
            <Text style={styles.selectorLabel}>강사</Text>
            <DropdownSelect value={instructor} options={instructorOptions} onChange={setInstructor} placeholder="강사 선택" />
          </View>

          <View style={styles.selectorBlock}>
            <Text style={styles.selectorLabel}>수업 길이</Text>
            <DurationSelector value={durationMinutes} onChange={setDurationMinutes} />
          </View>

          <View style={styles.selectorBlock}>
            <Text style={styles.selectorLabel}>정원</Text>
            <View style={styles.lessonDurationSelector}>
              {[1, 2, 3].map((value) => {
                const selected = capacity === value;

                return (
                  <Pressable
                    key={value}
                    style={[styles.lessonDurationButton, selected && styles.lessonDurationButtonActive]}
                    onPress={() => setCapacity(value)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.lessonDurationButtonText, selected && styles.lessonDurationButtonTextActive]}>{value}명</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.modalActions}>
            <Pressable style={styles.secondaryButton} onPress={onClose} accessibilityRole="button">
              <Text style={styles.secondaryButtonText}>닫기</Text>
            </Pressable>
            <Pressable style={[styles.publishButton, submitting && styles.disabledButton]} onPress={submit} disabled={submitting} accessibilityRole="button">
              <Feather name="save" size={17} color={colors.white} />
              <Text style={styles.publishButtonText}>저장</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AdminFinalScheduleView({ slots }: { slots: ClassSlot[] }) {
  if (slots.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Feather name="calendar" size={22} color={colors.blue700} />
        <Text style={styles.emptyStateText}>확정된 수업 시간이 없습니다.</Text>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.finalScheduleList} showsVerticalScrollIndicator={false}>
      {slots.map((slot) => {
        const absentUserIds = new Set(slot.absences.map((person) => person.userId));
        const fixedMembers = slot.fixedMembers.filter((person) => !absentUserIds.has(person.userId));
        const extraMembers = slot.isActive ? slot.substitutes : [];
        const freeSwimmers = slot.isActive ? [] : slot.substitutes;
        const statusLabel = slot.isActive ? '수업' : freeSwimmers.length > 0 ? '자유수영' : '닫힘';
        const badgeStyle = slot.isActive ? styles.statusBadgeSuccess : freeSwimmers.length > 0 ? styles.statusBadgePending : styles.timelineBadgePast;

        return (
          <View key={slot.id} style={styles.finalScheduleRow}>
            <View style={styles.adminReservationTime}>
              <Text style={styles.adminReservationDay}>{slot.weekdayLabel}</Text>
              <Text style={styles.adminReservationHour}>{formatSlotHour(slot.startsAt)}</Text>
            </View>
            <View style={styles.adminReservationCopy}>
              <View style={styles.finalScheduleTitleRow}>
                <Text style={styles.adminReservationName}>{slot.instructor} 강사</Text>
                <Text style={[styles.timelineBadge, badgeStyle]}>{statusLabel}</Text>
              </View>
              <Text style={styles.adminReservationMeta}>{formatLessonDuration(slot.durationMinutes)} · 정원 {slot.capacity}명</Text>
              {fixedMembers.length > 0 ? (
                <Text style={styles.calendarMemberText}>고정 {formatPersonNames(fixedMembers)}</Text>
              ) : null}
              {extraMembers.length > 0 ? (
                <Text style={[styles.calendarMemberText, styles.calendarSubstituteText]}>추가 {formatPersonNames(extraMembers)}</Text>
              ) : null}
              {freeSwimmers.length > 0 ? (
                <Text style={[styles.calendarMemberText, styles.calendarSubstituteText]}>자유수영 {formatPersonNames(freeSwimmers)}</Text>
              ) : null}
              {slot.absences.length > 0 ? (
                <Text style={[styles.calendarMemberText, styles.calendarAbsenceText]}>결석 {formatPersonNames(slot.absences)}</Text>
              ) : null}
              {fixedMembers.length === 0 && extraMembers.length === 0 && freeSwimmers.length === 0 && slot.absences.length === 0 ? (
                <Text style={styles.calendarMutedText}>배정 없음</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </KeyboardAwareScrollView>
  );
}

function NoticesScreen({
  userRole,
  notices,
  onPublishNotice,
  onUpdateNotice,
  onDeleteNotice,
  prefs
}: {
  userRole: UserRole;
  notices: Notice[];
  onPublishNotice: (title: string, body: string, imageUri?: string) => Promise<void>;
  onUpdateNotice: (input: UpdateNoticeInput) => Promise<void>;
  onDeleteNotice: (noticeId: string) => Promise<void>;
  prefs: NotificationPrefs;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [imageChanged, setImageChanged] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingNoticeId, setDeletingNoticeId] = useState<string | null>(null);

  function openCreateComposer() {
    setEditingNotice(null);
    setTitle('');
    setBody('');
    setImageUri(undefined);
    setImageChanged(false);
    setComposerOpen(true);
  }

  function openEditComposer(notice: Notice) {
    setEditingNotice(notice);
    setTitle(notice.title);
    setBody(notice.body);
    setImageUri(notice.imageUri);
    setImageChanged(false);
    setComposerOpen(true);
  }

  function closeComposer() {
    setComposerOpen(false);
    setEditingNotice(null);
    setTitle('');
    setBody('');
    setImageUri(undefined);
    setImageChanged(false);
  }

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('사진 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.82
    });

    if (!result.canceled) {
      setImageUri(result.assets[0]?.uri);
      setImageChanged(true);
    }
  }

  function removeImage() {
    setImageUri(undefined);
    setImageChanged(true);
  }

  async function submitNotice() {
    if (submitting) {
      return;
    }

    if (!title.trim() || !body.trim()) {
      Alert.alert('제목과 내용을 입력해주세요.');
      return;
    }

    try {
      setSubmitting(true);
      const noticeTitle = title.trim();
      if (editingNotice) {
        await onUpdateNotice({
          id: editingNotice.id,
          title: noticeTitle,
          body: body.trim(),
          imageUri,
          replaceImage: imageChanged
        });
      } else {
        await onPublishNotice(noticeTitle, body.trim(), imageUri);

        if (prefs.notice) {
          await sendLocalNotification('새 공지사항', noticeTitle);
        }
      }

      closeComposer();
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '공지사항을 저장하지 못했습니다.';
      Alert.alert(editingNotice ? '수정 실패' : '등록 실패', message);
    } finally {
      setSubmitting(false);
    }
  }

  function confirmDeleteNotice(notice: Notice) {
    if (deletingNoticeId) {
      return;
    }

    Alert.alert('공지 삭제', `"${notice.title}" 공지를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeletingNoticeId(notice.id);
            await onDeleteNotice(notice.id);
            if (editingNotice?.id === notice.id) {
              closeComposer();
            }
          } catch (error) {
            const message = error instanceof DatabaseError ? error.message : '공지사항을 삭제하지 못했습니다.';
            Alert.alert('삭제 실패', message);
          } finally {
            setDeletingNoticeId(null);
          }
        }
      }
    ]);
  }

  if (userRole === 'admin' && composerOpen) {
    return (
      <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.adminComposer}>
          <View style={styles.composerHeader}>
            <Feather name="edit-3" size={18} color={colors.blue700} />
            <Text style={styles.composerTitle}>{editingNotice ? '공지 수정' : '공지 글쓰기'}</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="공지 제목"
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="공지 내용"
            placeholderTextColor={colors.muted}
            value={body}
            onChangeText={setBody}
            multiline
          />
          {imageUri ? <Image source={{ uri: imageUri }} style={styles.previewImage} /> : null}
          <View style={styles.composerActions}>
            <Pressable style={styles.secondaryButton} onPress={closeComposer}>
              <Feather name="list" size={17} color={colors.blue700} />
              <Text style={styles.secondaryButtonText}>목록</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={pickImage}>
              <Feather name="image" size={17} color={colors.blue700} />
              <Text style={styles.secondaryButtonText}>이미지</Text>
            </Pressable>
            {imageUri ? (
              <Pressable style={styles.secondaryButton} onPress={removeImage}>
                <Feather name="x" size={17} color={colors.danger} />
                <Text style={[styles.secondaryButtonText, styles.memberAdjustButtonTextDanger]}>제거</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable style={[styles.publishButton, submitting && styles.disabledButton]} onPress={submitNotice} disabled={submitting}>
            <Feather name={editingNotice ? 'save' : 'send'} size={17} color={colors.white} />
            <Text style={styles.publishButtonText}>{editingNotice ? '수정 저장' : '등록'}</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="공지사항" actionLabel={userRole === 'admin' ? '글쓰기' : undefined} onAction={userRole === 'admin' ? openCreateComposer : undefined} />
      {notices.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="bell" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>등록된 공지가 없습니다.</Text>
        </View>
      ) : (
        notices.map((notice) => (
          <NoticeCard
            key={notice.id}
            notice={notice}
            canManage={userRole === 'admin'}
            deleting={deletingNoticeId === notice.id}
            onEdit={() => openEditComposer(notice)}
            onDelete={() => confirmDeleteNotice(notice)}
          />
        ))
      )}
    </KeyboardAwareScrollView>
  );
}

function NoticeCard({
  notice,
  compact = false,
  canManage = false,
  deleting = false,
  onEdit,
  onDelete
}: {
  notice: Notice;
  compact?: boolean;
  canManage?: boolean;
  deleting?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <View style={styles.noticeCard}>
      {notice.imageUri ? <Image source={{ uri: notice.imageUri }} style={styles.noticeImage} /> : null}
      <Text style={styles.noticeTitle}>{notice.title}</Text>
      {compact ? null : <Text style={styles.noticeBody}>{notice.body}</Text>}
      <View style={styles.noticeFooter}>
        <Text style={styles.noticeMeta}>{notice.author}</Text>
        <Text style={styles.noticeMeta}>{formatNoticeDate(notice.createdAt)}</Text>
      </View>
      {canManage && !compact ? (
        <View style={styles.noticeManageActions}>
          <Pressable style={styles.memberAdjustButton} onPress={onEdit} accessibilityRole="button" accessibilityLabel="공지 수정">
            <Text style={styles.memberAdjustButtonText}>수정</Text>
          </Pressable>
          <Pressable
            style={[styles.memberAdjustButton, styles.memberAdjustButtonDanger, deleting && styles.disabledButton]}
            onPress={onDelete}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="공지 삭제"
          >
            <Text style={[styles.memberAdjustButtonText, styles.memberAdjustButtonTextDanger]}>{deleting ? '삭제중' : '삭제'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function AlertsScreen({
  prefs,
  setPrefs
}: {
  prefs: NotificationPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<NotificationPrefs>>;
}) {
  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.alertHero}>
        <Feather name="bell" size={26} color={colors.white} />
        <Text style={styles.alertHeroTitle}>알림</Text>
      </View>

      {(Object.keys(notificationLabels) as NotificationKey[]).map((key) => {
        const item = notificationLabels[key];
        return (
          <View key={key} style={styles.preferenceRow}>
            <View style={styles.preferenceIcon}>
              <Feather name={item.icon} size={19} color={colors.blue700} />
            </View>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>{item.title}</Text>
            </View>
            <Switch
              value={prefs[key]}
              onValueChange={(value) => setPrefs((current) => ({ ...current, [key]: value }))}
              trackColor={{ false: colors.line, true: colors.blue100 }}
              thumbColor={prefs[key] ? colors.blue700 : colors.white}
            />
          </View>
        );
      })}

      <Pressable
        style={styles.testNotificationButton}
        onPress={() => sendLocalNotification('오늘도수영 알림', '알림 설정이 정상적으로 동작합니다.')}
      >
        <Feather name="zap" size={18} color={colors.white} />
        <Text style={styles.testNotificationText}>테스트 알림 보내기</Text>
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

function ProfileScreen({
  user,
  reservationCount,
  passBalance,
  memberRequests,
  onCreateMemberRequest,
  onLogout,
  onDeleteAccount,
  testAccounts,
  onSwitchTestAccount
}: {
  user: User;
  reservationCount: number;
  passBalance: number;
  memberRequests: MemberRequest[];
  onCreateMemberRequest: (input: CreateMemberRequestInput) => Promise<void>;
  onLogout: () => void;
  onDeleteAccount: () => void;
  testAccounts: TestAccount[];
  onSwitchTestAccount: (account: TestAccount) => Promise<void>;
}) {
  const [switchingAccountId, setSwitchingAccountId] = useState<TestAccountId | null>(null);
  const [detailView, setDetailView] = useState<ProfileDetailView | null>(null);
  const activeMemberRequestCount = memberRequests.filter((request) => request.status === 'pending' || request.status === 'reviewing').length;

  async function switchTestAccount(account: TestAccount) {
    if (switchingAccountId || account.email === user.email) {
      return;
    }

    try {
      setSwitchingAccountId(account.id);
      await onSwitchTestAccount(account);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '계정을 전환하지 못했습니다.';
      Alert.alert('전환 실패', message);
    } finally {
      setSwitchingAccountId(null);
    }
  }

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Feather name={user.role === 'admin' ? 'shield' : 'user'} size={30} color={colors.white} />
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileName}>{user.name}</Text>
        </View>
      </View>

      {detailView ? (
        <MemberDetailHeader
          title={detailView === 'basicInfo' ? '기본 정보' : '문의 접수'}
          onBack={() => setDetailView(null)}
        />
      ) : null}

      {detailView === 'basicInfo' ? (
        <View style={styles.infoList}>
          <InfoRow icon="mail" label="이메일" value={user.email} />
          <InfoRow icon="user" label="계정" value={`${providerMeta[user.provider].label.replace('로 시작', '')} · ${user.role === 'admin' ? '관리자' : '회원'}`} />
          <InfoRow icon="phone" label="휴대폰" value={formatPhoneNumber(user.phone)} />
          <InfoRow icon="calendar" label={user.role === 'admin' ? '운영 변동' : '대체 예약'} value={`${reservationCount}개`} />
          {user.role === 'admin' ? (
            <InfoRow icon="users" label="예약 관리" value="홈에서 확인" />
          ) : (
            <InfoRow icon="credit-card" label="남은 횟수권" value={`${passBalance}회`} />
          )}
          <InfoRow icon="smartphone" label="앱 버전" value={Platform.OS === 'ios' ? 'iOS 테스트' : '모바일 테스트'} />
        </View>
      ) : null}

      {detailView === 'memberRequests' ? (
        <MemberRequestOverview
          requests={memberRequests}
          onCreateMemberRequest={onCreateMemberRequest}
          showList
          showComposer
        />
      ) : null}

      {!detailView ? (
        <>
          <View style={styles.infoList}>
            <InfoRow icon="user" label="기본 정보" value="보기" onPress={() => setDetailView('basicInfo')} />
            {user.role === 'member' ? (
              <InfoRow
                icon="message-square"
                label="문의 접수"
                value={activeMemberRequestCount > 0 ? `${activeMemberRequestCount}건 처리중` : '작성'}
                onPress={() => setDetailView('memberRequests')}
              />
            ) : null}
            <InfoRow icon="phone-call" label="전화 문의" value={CONTACT_PHONE} onPress={callContact} />
          </View>

          <View style={styles.infoList}>
            <InfoRow
              icon="shield"
              label="개인정보 처리방침"
              value="보기"
              onPress={() => openExternalUrl(PRIVACY_POLICY_URL, '개인정보 처리방침')}
            />
            <InfoRow
              icon="trash-2"
              label="계정 삭제 안내"
              value="보기"
              onPress={() => openExternalUrl(ACCOUNT_DELETION_URL, '계정 삭제 안내')}
            />
          </View>
        </>
      ) : null}

      {testAccounts.length > 0 ? (
        <View style={styles.devSwitchCard}>
          <View style={styles.devSwitchHeader}>
            <Feather name="repeat" size={18} color={colors.blue700} />
            <Text style={styles.devSwitchTitle}>테스트 계정 전환</Text>
          </View>
          <View style={styles.devAccountButtons}>
            {testAccounts.map((account) => {
              const current = account.email === user.email;
              const switching = switchingAccountId === account.id;

              return (
                <Pressable
                  key={account.id}
                  style={[styles.devAccountButton, current && styles.devAccountButtonActive, (current || Boolean(switchingAccountId)) && styles.disabledButton]}
                  onPress={() => switchTestAccount(account)}
                  disabled={current || Boolean(switchingAccountId)}
                  accessibilityRole="button"
                  accessibilityLabel={`${account.label} 테스트 계정으로 전환`}
                >
                  {switching ? <ActivityIndicator color={colors.blue700} /> : <Feather name={account.icon} size={16} color={colors.blue700} />}
                  <Text style={styles.devAccountButtonText}>{current ? `${account.label} 접속중` : account.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <Pressable style={styles.logoutButton} onPress={onLogout}>
        <Feather name="log-out" size={18} color={colors.danger} />
        <Text style={styles.logoutText}>로그아웃</Text>
      </Pressable>

      <Pressable style={styles.deleteAccountButton} onPress={onDeleteAccount}>
        <Feather name="trash-2" size={18} color={colors.danger} />
        <Text style={styles.deleteAccountText}>계정 삭제</Text>
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

function InfoRow({
  icon,
  label,
  value,
  onPress
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.infoRow} onPress={onPress}>
      <Feather name={icon} size={20} color={colors.blue700} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </Pressable>
  );
}

function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable style={styles.sectionAction} onPress={onAction}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Feather name="chevron-right" size={16} color={colors.blue700} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.blue900
  },
  launchScreen: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32
  },
  launchLogo: {
    width: '86%',
    maxWidth: 320,
    height: 292
  },
  appShell: {
    flex: 1,
    backgroundColor: colors.surface
  },
  keyboardAvoidingView: {
    flex: 1
  },
  header: {
    backgroundColor: colors.blue800,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.navyLine
  },
  headerBrand: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  headerLogoImage: {
    width: 58,
    height: 42
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0
  },
  headerKicker: {
    ...type.bold,
    color: colors.blue100,
    fontSize: 14,
    fontWeight: '700'
  },
  headerTitle: {
    ...type.extraBold,
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
    maxWidth: 210
  },
  contactButton: {
    minWidth: 92,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.navyGlass,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.navyLineStrong,
    paddingHorizontal: 12
  },
  contactButtonText: {
    ...type.extraBold,
    color: colors.white,
    fontSize: 14,
    fontWeight: '900'
  },
  content: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 104,
    gap: spacing.md
  },
  loginSafeArea: {
    flex: 1,
    backgroundColor: colors.blue800
  },
  loginScrollContent: {
    flexGrow: 1
  },
  loginHero: {
    flex: 1,
    minHeight: 280,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'flex-start'
  },
  loginHeroImage: {
    width: 236,
    height: 214
  },
  loginTitle: {
    ...type.extraBold,
    color: colors.white,
    fontSize: 38,
    fontWeight: '900',
    marginTop: 22
  },
  loginIconRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18
  },
  loginIconChip: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: colors.aqua100,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loginPanel: {
    backgroundColor: colors.white,
    padding: 22,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    gap: 12
  },
  roleSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.blue50,
    borderRadius: 8,
    padding: 4,
    marginBottom: 4
  },
  roleButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6
  },
  roleButtonActive: {
    backgroundColor: colors.blue700
  },
  roleButtonText: {
    ...type.bold,
    color: colors.blue700,
    fontWeight: '800'
  },
  roleButtonTextActive: {
    color: colors.white
  },
  devLoginPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.blue200,
    backgroundColor: colors.blue50,
    padding: 10,
    gap: 8
  },
  devLoginTitle: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 13,
    fontWeight: '900'
  },
  devAccountButtons: {
    flexDirection: 'row',
    gap: 8
  },
  devAccountButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10
  },
  devAccountButtonActive: {
    backgroundColor: colors.aqua100,
    borderColor: colors.blue700
  },
  devAccountButtonText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 13,
    fontWeight: '900'
  },
  ssoButton: {
    minHeight: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18
  },
  googleButton: {
    borderWidth: 1,
    borderColor: colors.line
  },
  ssoButtonText: {
    ...type.bold,
    fontSize: 16,
    fontWeight: '800'
  },
  authSubmitButton: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: colors.blue700,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18
  },
  authSubmitButtonText: {
    ...type.extraBold,
    color: colors.white,
    fontSize: 16,
    fontWeight: '900'
  },
  disabledButton: {
    opacity: 0.68
  },
  phoneLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  phoneLinkText: {
    ...type.bold,
    color: colors.blue700,
    fontWeight: '800'
  },
  heroCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.xl,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.blue200,
    ...shadows.soft
  },
  focusCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.xl,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.blue200,
    borderTopWidth: 3,
    borderTopColor: colors.aqua500,
    ...shadows.soft
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  heroDots: {
    flexDirection: 'row',
    gap: 6
  },
  heroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.navyDot
  },
  heroDotActive: {
    width: 22,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.aqua500
  },
  heroTitle: {
    ...type.extraBold,
    color: colors.blue900,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2
  },
  heroBody: {
    ...type.bold,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    marginTop: 6
  },
  focusBadge: {
    ...type.extraBold,
    color: colors.blue800,
    backgroundColor: colors.aqua100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.blue200,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '900',
    flexShrink: 0,
    textAlign: 'right'
  },
  focusEyebrow: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 15,
    fontWeight: '900',
    flex: 1,
    minWidth: 0
  },
  primaryButton: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.blue700,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.blue700
  },
  primaryButtonText: {
    ...type.extraBold,
    color: colors.white,
    fontSize: typography.button.fontSize,
    lineHeight: typography.button.lineHeight,
    fontWeight: '900'
  },
  memberHeroActions: {
    gap: 8
  },
  memberFixedScheduleLine: {
    minHeight: 32,
    borderRadius: radius.md,
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11
  },
  memberFixedScheduleText: {
    ...type.bold,
    color: colors.blue800,
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    minWidth: 0
  },
  memberPendingLine: {
    minHeight: 32,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningLine,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11
  },
  memberPendingText: {
    ...type.extraBold,
    color: colors.warningText,
    fontSize: 13,
    fontWeight: '900',
    flex: 1,
    minWidth: 0
  },
  memberDetailHeader: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.sm,
    ...shadows.card
  },
  memberDetailBackButton: {
    minHeight: 36,
    borderRadius: radius.md,
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue200,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 9
  },
  memberDetailBackText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 13,
    fontWeight: '900'
  },
  memberDetailTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
    flex: 1,
    minWidth: 0
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card
  },
  metricValue: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 12
  },
  metricLabel: {
    ...type.bold,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2
  },
  summaryStrip: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  summaryItem: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    ...shadows.card
  },
  summaryValue: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900'
  },
  summaryLabel: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4
  },
  homeSectionMenu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  homeSectionMenuButton: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 96,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...shadows.card
  },
  homeSectionMenuButtonActive: {
    backgroundColor: colors.aqua100,
    borderColor: colors.blue700
  },
  homeSectionMenuTopRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  homeSectionMenuIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.aqua100,
    alignItems: 'center',
    justifyContent: 'center'
  },
  homeSectionMenuIconActive: {
    backgroundColor: colors.blue700
  },
  homeSectionMenuCopy: {
    flex: 0,
    minWidth: 0,
    gap: 3,
    justifyContent: 'flex-end'
  },
  homeSectionMenuTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  homeSectionMenuText: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
    flexShrink: 1,
    minWidth: 0
  },
  homeSectionMenuTextActive: {
    color: colors.blue900
  },
  homeSectionMenuDescription: {
    ...type.bold,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700'
  },
  homeSectionMenuDescriptionActive: {
    color: colors.blue800
  },
  infoTooltipWrap: {
    alignSelf: 'flex-start'
  },
  infoIconButton: {
    width: 22,
    height: 22,
    borderRadius: radius.md,
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tooltipOverlay: {
    ...StyleSheet.absoluteFillObject
  },
  tooltipBubble: {
    position: 'absolute',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.blue200,
    borderRadius: radius.md,
    paddingHorizontal: 11,
    paddingVertical: 9,
    ...shadows.floating
  },
  tooltipCaret: {
    position: 'absolute',
    top: -5,
    width: 10,
    height: 10,
    backgroundColor: colors.white,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: colors.blue200,
    transform: [{ rotate: '45deg' }]
  },
  tooltipText: {
    ...type.bold,
    color: colors.blue800,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800'
  },
  homeSectionMenuCount: {
    ...type.extraBold,
    minWidth: 28,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.blue50,
    color: colors.blue800,
    fontSize: 13,
    fontWeight: '900',
    paddingHorizontal: 7,
    paddingVertical: 4,
    textAlign: 'center'
  },
  homeSectionMenuCountActive: {
    backgroundColor: colors.blue700,
    color: colors.white
  },
  sectionHeader: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sectionTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: typography.screenTitle.fontSize,
    lineHeight: typography.screenTitle.lineHeight,
    fontWeight: '900'
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 36
  },
  sectionActionText: {
    ...type.bold,
    color: colors.blue700,
    fontWeight: '800'
  },
  screenBody: {
    flex: 1
  },
  daySelector: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
    minHeight: 90
  },
  dayPill: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card
  },
  dayPillActive: {
    backgroundColor: colors.aqua100,
    borderColor: colors.blue700
  },
  dayPillText: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900'
  },
  dayPillCaption: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3
  },
  dayPillTextActive: {
    color: colors.blue900
  },
  slotList: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: 104,
    gap: 10
  },
  passSummary: {
    marginHorizontal: spacing.xl,
    marginTop: 6,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    ...shadows.card
  },
  passSummaryStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  passSummaryValue: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 22,
    fontWeight: '900'
  },
  passSummaryLabel: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2
  },
  changePickerCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.blue200,
    borderTopWidth: 3,
    borderTopColor: colors.aqua500,
    padding: spacing.md,
    gap: 10,
    ...shadows.card
  },
  changePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  changePickerTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  changePickerTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900'
  },
  changePickerMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3
  },
  changePickerCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.blue50,
    alignItems: 'center',
    justifyContent: 'center'
  },
  changeTargetRow: {
    minHeight: 62,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  weekSelector: {
    gap: 8,
    paddingRight: 2
  },
  weekSelectorButton: {
    minWidth: 104,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  weekSelectorButtonActive: {
    borderColor: colors.blue700,
    backgroundColor: colors.blue50
  },
  weekSelectorText: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900'
  },
  weekSelectorTextActive: {
    color: colors.blue900
  },
  weekSelectorMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2
  },
  weekSelectorMetaActive: {
    color: colors.blue700
  },
  weekLessonList: {
    gap: 12
  },
  weekDaySection: {
    gap: 8
  },
  weekDayHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  weekDayTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900'
  },
  weekDayMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  weekLessonRow: {
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
    padding: 12,
    gap: 10
  },
  weekLessonRowClosed: {
    borderLeftColor: colors.muted,
    backgroundColor: colors.blue50
  },
  weekLessonTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  weekLessonPeople: {
    gap: 4
  },
  weekSubstituteRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  weekLessonActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  adminLessonToolbar: {
    minHeight: 62,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10
  },
  finalScheduleList: {
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 20
  },
  finalScheduleRow: {
    minHeight: 86,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  finalScheduleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  lessonOperationList: {
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 22
  },
  lessonOperationCard: {
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 12
  },
  lessonOperationCardClosed: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong
  },
  lessonOperationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  lessonOperationTime: {
    width: 72
  },
  lessonOperationHour: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2
  },
  lessonOperationTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  lessonOperationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  lessonOperationTitle: {
    ...type.extraBold,
    color: colors.ink,
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '900'
  },
  lessonPersonSection: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
    gap: 4
  },
  lessonPersonLine: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  lessonPersonCopy: {
    flex: 1,
    minWidth: 0
  },
  lessonPersonActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6
  },
  lessonPersonName: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900'
  },
  lessonPersonNameMuted: {
    color: colors.muted
  },
  lessonPersonMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2
  },
  personLineButton: {
    minWidth: 48,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.blue200,
    backgroundColor: colors.blue50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  personLineButtonDanger: {
    borderColor: colors.dangerLine,
    backgroundColor: colors.white
  },
  personLineButtonText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 12,
    fontWeight: '900'
  },
  lessonOperationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  slotCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 13,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadows.card
  },
  slotCardReserved: {
    borderColor: colors.blue200,
    backgroundColor: colors.aqua100
  },
  slotTimeBlock: {
    width: 64,
    alignItems: 'flex-start',
    gap: 8
  },
  slotTime: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900'
  },
  slotStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  slotDetails: {
    flex: 1,
    minWidth: 0
  },
  slotTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900'
  },
  slotMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4
  },
  slotMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1
  },
  waitlistText: {
    ...type.bold,
    color: colors.warning,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 2
  },
  reserveButton: {
    width: 78,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.blue700,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  reserveButtonText: {
    ...type.extraBold,
    color: colors.white,
    fontSize: 13,
    fontWeight: '900'
  },
  slotActionGroup: {
    width: 74,
    gap: 6
  },
  compactReserveButton: {
    width: 74,
    height: 34
  },
  compactReserveButtonText: {
    fontSize: 12
  },
  cancelButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.dangerLine
  },
  cancelButtonText: {
    color: colors.danger
  },
  waitButton: {
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue200
  },
  waitButtonText: {
    ...type.bold,
    color: colors.blue800,
    fontSize: 13
  },
  secondaryActionButton: {
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md
  },
  secondaryActionText: {
    ...type.extraBold,
    color: colors.blue800,
    fontSize: typography.button.fontSize,
    lineHeight: typography.button.lineHeight,
    fontWeight: '900'
  },
  requestCard: {
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card
  },
  timelineCardUpcoming: {
    backgroundColor: colors.white,
    borderColor: colors.blue200,
    borderLeftWidth: 4,
    borderLeftColor: colors.aqua500
  },
  timelineCardPast: {
    backgroundColor: colors.blue50,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderLeftColor: colors.muted
  },
  timelineCardPending: {
    backgroundColor: colors.white,
    borderColor: colors.warningLine,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning
  },
  timelineBadge: {
    ...type.extraBold,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: typography.caption.fontSize - 1,
    fontWeight: '900'
  },
  timelineBadgeUpcoming: {
    color: colors.blue800,
    backgroundColor: colors.aqua100,
    borderColor: colors.blue200
  },
  timelineBadgePast: {
    color: colors.muted,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.line
  },
  statusBadgePending: {
    color: colors.warningText,
    backgroundColor: colors.warningBg,
    borderColor: colors.warningLine
  },
  statusBadgeSuccess: {
    color: colors.successText,
    backgroundColor: colors.successBg,
    borderColor: colors.successLine
  },
  statusBadgeDanger: {
    color: colors.dangerText,
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerLine
  },
  requestCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10
  },
  requestListSpacing: {
    gap: 8
  },
  requestTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900'
  },
  requestMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  requestFootnote: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8
  },
  compactSelector: {
    gap: 8,
    paddingRight: 2
  },
  selectorBlock: {
    gap: 8
  },
  selectorLabel: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900'
  },
  selectorChip: {
    minWidth: 46,
    minHeight: 38,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  timeSelectorChip: {
    minWidth: 70,
    minHeight: 38,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  selectorChipActive: {
    backgroundColor: colors.blue700,
    borderColor: colors.blue700
  },
  selectorChipText: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900'
  },
  selectorChipTextActive: {
    color: colors.white
  },
  dropdownWrap: {
    gap: 6
  },
  dropdownButton: {
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  dropdownButtonText: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900'
  },
  dropdownPlaceholder: {
    ...type.bold,
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700'
  },
  dropdownMenu: {
    maxHeight: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    overflow: 'hidden'
  },
  dropdownMenuScroll: {
    maxHeight: 220
  },
  dropdownOption: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  dropdownOptionActive: {
    backgroundColor: colors.blue700
  },
  dropdownOptionText: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900'
  },
  dropdownOptionTextActive: {
    color: colors.white
  },
  dropdownOptionMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2
  },
  dropdownOptionMetaActive: {
    color: colors.aqua100
  },
  multiTimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  multiTimeButton: {
    width: '22.5%',
    minWidth: 68,
    minHeight: 36,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  memberLessonGroup: {
    gap: 8
  },
  memberPastLessonItem: {
    gap: 8
  },
  memberPastLessonMeta: {
    flexShrink: 1,
    minWidth: 0
  },
  memberLessonGroupTitle: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 13,
    fontWeight: '900'
  },
  memberFeedbackButton: {
    minWidth: 86,
    minHeight: 36,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  memberFeedbackButtonText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 12,
    fontWeight: '900'
  },
  memberFeedbackButtonTextDisabled: {
    color: colors.muted
  },
  requestApproveButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.blue700,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6
  },
  requestApproveText: {
    ...type.extraBold,
    color: colors.white,
    fontSize: 14,
    fontWeight: '900'
  },
  requestRejectButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6
  },
  requestNeutralButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6
  },
  requestRejectText: {
    ...type.extraBold,
    color: colors.danger,
    fontSize: 14,
    fontWeight: '900'
  },
  feedbackCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 10
  },
  memberInlineFeedbackCard: {
    marginLeft: 10,
    backgroundColor: colors.white
  },
  feedbackCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  feedbackCardTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  feedbackBody: {
    ...type.bold,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700'
  },
  feedbackImage: {
    width: '100%',
    height: 188,
    borderRadius: radius.md,
    backgroundColor: colors.blue50
  },
  feedbackImageCompact: {
    height: 132
  },
  feedbackVideoFrame: {
    width: '100%',
    height: 188,
    borderRadius: radius.md,
    backgroundColor: colors.blue900,
    overflow: 'hidden'
  },
  feedbackVideoFrameCompact: {
    height: 132
  },
  feedbackVideo: {
    width: '100%',
    height: '100%'
  },
  feedbackTargetList: {
    gap: 8,
    paddingVertical: 2
  },
  feedbackTargetChip: {
    width: 132,
    minHeight: 78,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    gap: 4
  },
  feedbackTargetChipActive: {
    backgroundColor: colors.blue700,
    borderColor: colors.blue700
  },
  feedbackTargetName: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900'
  },
  feedbackTargetNameActive: {
    color: colors.white
  },
  feedbackTargetMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  feedbackTargetMetaActive: {
    color: colors.aqua100
  },
  feedbackTargetState: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 12,
    fontWeight: '900'
  },
  feedbackComposer: {
    borderRadius: radius.md,
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue200,
    padding: 12,
    gap: 8
  },
  feedbackComposerHeader: {
    gap: 3
  },
  feedbackTextInput: {
    minHeight: 76,
    textAlignVertical: 'top',
    paddingTop: 12
  },
  reviewCommentInput: {
    minHeight: 70,
    textAlignVertical: 'top',
    paddingTop: 12,
    backgroundColor: colors.white
  },
  storeQuantityInput: {
    width: 86,
    textAlign: 'center'
  },
  storeNumberInput: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center'
  },
  storeProductImage: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.blue50
  },
  storeProductImagePreview: {
    width: '100%',
    height: 150,
    borderRadius: radius.md,
    backgroundColor: colors.white
  },
  storeProductThumb: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.blue50
  },
  feedbackCounter: {
    ...type.bold,
    alignSelf: 'flex-end',
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  specialLessonHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  specialLessonPoster: {
    width: '100%',
    height: 210,
    borderRadius: radius.md,
    backgroundColor: colors.blue50
  },
  specialLessonPosterPreview: {
    width: '100%',
    height: 156,
    borderRadius: radius.md,
    backgroundColor: colors.white
  },
  specialLessonFilterRow: {
    flexDirection: 'row',
    gap: 6
  },
  specialLessonFilterButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  specialLessonFilterButtonActive: {
    backgroundColor: colors.blue700,
    borderColor: colors.blue700
  },
  specialLessonFilterText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 13,
    fontWeight: '900'
  },
  specialLessonFilterTextActive: {
    color: colors.white
  },
  specialStatusBadge: {
    ...type.extraBold,
    color: colors.blue800,
    fontSize: 11,
    fontWeight: '900',
    backgroundColor: colors.blue100,
    borderRadius: radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 4,
    overflow: 'hidden'
  },
  specialStatusBadgeApproved: {
    color: colors.successText,
    backgroundColor: colors.successBg
  },
  adminOverview: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.md,
    ...shadows.card
  },
  adminOverviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  adminOverviewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap'
  },
  adminOverviewTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: typography.sectionTitle.fontSize,
    lineHeight: typography.sectionTitle.lineHeight,
    fontWeight: '900',
    flexShrink: 1,
    minWidth: 0
  },
  adminOverviewCount: {
    ...type.bold,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 0
  },
  emptyState: {
    minHeight: 76,
    borderRadius: radius.md,
    backgroundColor: colors.blue50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  emptyStateText: {
    ...type.bold,
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800'
  },
  adminReservationRow: {
    minHeight: 66,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadows.card
  },
  adminScheduleRow: {
    minHeight: 76,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  calendarAddPanel: {
    borderRadius: 8,
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue200,
    padding: 12,
    gap: 10
  },
  calendarAddRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  calendarDateInput: {
    flex: 1.15,
    minWidth: 118
  },
  calendarTimeInput: {
    width: 88,
    paddingHorizontal: 10
  },
  calendarAddInstructorInput: {
    minWidth: 96
  },
  lessonDurationSelector: {
    flexDirection: 'row',
    gap: 6
  },
  lessonDurationButton: {
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    flex: 1
  },
  lessonDurationButtonActive: {
    backgroundColor: colors.blue700,
    borderColor: colors.blue700
  },
  lessonDurationButtonText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 12,
    fontWeight: '900'
  },
  lessonDurationButtonTextActive: {
    color: colors.white
  },
  calendarAssignmentPanel: {
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 10
  },
  calendarAssignmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  calendarAssignmentTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900'
  },
  calendarAssignmentHint: {
    ...type.bold,
    color: colors.blue700,
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'right'
  },
  calendarAssignmentMemberList: {
    gap: 8,
    paddingRight: 4
  },
  calendarAssignmentMemberChip: {
    minWidth: 92,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center'
  },
  calendarAssignmentMemberChipActive: {
    backgroundColor: colors.blue700,
    borderColor: colors.blue700
  },
  calendarAssignmentMemberName: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900'
  },
  calendarAssignmentMemberNameActive: {
    color: colors.white
  },
  calendarAssignmentMemberMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2
  },
  calendarAssignmentMemberMetaActive: {
    color: colors.aqua100
  },
  calendarMemberText: {
    ...type.bold,
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  calendarSubstituteName: {
    flex: 1,
    minWidth: 0
  },
  calendarInlineCancelButton: {
    width: 22,
    height: 22,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    alignItems: 'center',
    justifyContent: 'center'
  },
  calendarMemberPrimaryText: {
    ...type.extraBold,
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900'
  },
  calendarSubstituteText: {
    color: colors.success
  },
  calendarAbsenceText: {
    color: colors.warning
  },
  calendarMutedText: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  adminReservationTime: {
    width: 76
  },
  adminReservationDay: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  adminReservationHour: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2
  },
  adminReservationCopy: {
    flex: 1,
    minWidth: 0
  },
  adminReservationName: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900'
  },
  adminReservationMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4
  },
  memberRow: {
    minHeight: 78,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.blue700,
    alignItems: 'center',
    justifyContent: 'center'
  },
  memberCopy: {
    flex: 1,
    minWidth: 0
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  memberPickerList: {
    maxHeight: 220
  },
  memberPickerRow: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    marginBottom: 8
  },
  memberPickerRowActive: {
    backgroundColor: colors.blue700,
    borderColor: colors.blue700
  },
  memberPickerName: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900'
  },
  memberPickerNameActive: {
    color: colors.white
  },
  memberPickerMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3
  },
  memberPickerMetaActive: {
    color: colors.aqua100
  },
  memberAdjustButton: {
    minWidth: 46,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.aqua100,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8
  },
  memberAdjustButtonDanger: {
    backgroundColor: colors.white,
    borderColor: colors.dangerLine
  },
  memberAdjustButtonActive: {
    backgroundColor: colors.blue50,
    borderColor: colors.blue700
  },
  memberAdjustButtonText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 12,
    fontWeight: '900'
  },
  memberAdjustButtonTextDanger: {
    color: colors.danger
  },
  fixedLessonEditor: {
    borderRadius: 8,
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue200,
    padding: 12,
    gap: 10
  },
  fixedLessonManageList: {
    gap: 8
  },
  fixedLessonManageRow: {
    minHeight: 62,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  fixedLessonManageRowActive: {
    borderColor: colors.blue700,
    backgroundColor: colors.surface
  },
  fixedLessonManageCopy: {
    flex: 1,
    minWidth: 0
  },
  fixedLessonManageTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900'
  },
  fixedLessonManageMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3
  },
  fixedLessonManageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  fixedLessonEditorRow: {
    flexDirection: 'row',
    gap: 8
  },
  fixedLessonSmallInput: {
    width: 64,
    textAlign: 'center'
  },
  fixedLessonInstructorInput: {
    flex: 1,
    minWidth: 0
  },
  lessonCapacitySelector: {
    flexDirection: 'row',
    gap: 8
  },
  lessonCapacityButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center'
  },
  lessonCapacityButtonActive: {
    backgroundColor: colors.blue700,
    borderColor: colors.blue700
  },
  lessonCapacityText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 14,
    fontWeight: '900'
  },
  lessonCapacityTextActive: {
    color: colors.white
  },
  memberName: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900'
  },
  memberEmail: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3
  },
  memberMeta: {
    ...type.bold,
    color: colors.blue700,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4
  },
  memberMetaMuted: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3
  },
  inlineInstructorInput: {
    minHeight: 38,
    paddingHorizontal: 10,
    fontSize: 14
  },
  adminComposer: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
    ...shadows.card
  },
  composerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  composerTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900'
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    ...type.regular,
    color: colors.ink,
    fontSize: 15,
    backgroundColor: colors.white
  },
  multilineInput: {
    minHeight: 104,
    paddingTop: 12,
    textAlignVertical: 'top'
  },
  previewImage: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.blue50
  },
  composerActions: {
    flexDirection: 'row',
    gap: 10
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.blue700,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  secondaryButtonText: {
    ...type.extraBold,
    color: colors.blue700,
    fontWeight: '900'
  },
  publishButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.blue700,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  publishButtonText: {
    ...type.extraBold,
    color: colors.white,
    fontWeight: '900'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '88%',
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.floating
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10
  },
  modalTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900'
  },
  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.aqua100,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalMemberList: {
    maxHeight: 260
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10
  },
  noticeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8,
    ...shadows.card
  },
  noticeImage: {
    width: '100%',
    height: 170,
    borderRadius: radius.md,
    backgroundColor: colors.blue50,
    marginBottom: 4
  },
  noticeTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900'
  },
  noticeBody: {
    ...type.regular,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21
  },
  noticeBodyCompact: {
    ...type.regular,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21
  },
  noticeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2
  },
  noticeMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  noticeManageActions: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8
  },
  alertHero: {
    backgroundColor: colors.blue700,
    borderRadius: radius.md,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  alertHeroTitle: {
    ...type.extraBold,
    color: colors.white,
    fontSize: 20,
    fontWeight: '900'
  },
  preferenceRow: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...shadows.card
  },
  preferenceIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.blue50,
    alignItems: 'center',
    justifyContent: 'center'
  },
  preferenceCopy: {
    flex: 1,
    minWidth: 0
  },
  preferenceTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900'
  },
  testNotificationButton: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.blue700,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  testNotificationText: {
    ...type.extraBold,
    color: colors.white,
    fontSize: 16,
    fontWeight: '900'
  },
  profileCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...shadows.card
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: radius.md,
    backgroundColor: colors.blue700,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileCopy: {
    flex: 1,
    minWidth: 0
  },
  profileName: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900'
  },
  profileMeta: {
    ...type.bold,
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4
  },
  infoList: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadows.card
  },
  devSwitchCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.blue200,
    padding: 14,
    gap: 10,
    ...shadows.card
  },
  devSwitchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  devSwitchTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900'
  },
  infoRow: {
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  infoLabel: {
    flex: 1,
    ...type.bold,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800'
  },
  infoValue: {
    ...type.bold,
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700'
  },
  logoutButton: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  logoutText: {
    ...type.extraBold,
    color: colors.danger,
    fontSize: 16,
    fontWeight: '900'
  },
  deleteAccountButton: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  deleteAccountText: {
    ...type.extraBold,
    color: colors.danger,
    fontSize: 16,
    fontWeight: '900'
  },
  tabBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    minHeight: 68,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.blue200,
    flexDirection: 'row',
    padding: 7,
    gap: 6,
    ...shadows.floating
  },
  tabItem: {
    flex: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  tabItemActive: {
    backgroundColor: colors.aqua100,
    borderColor: colors.blue200
  },
  tabLabel: {
    ...type.extraBold,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900'
  },
  tabLabelActive: {
    color: colors.blue900
  }
});
