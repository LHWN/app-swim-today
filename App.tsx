import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
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
  View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as ImagePicker from 'expo-image-picker';
import { colors, shadows } from './src/theme';
import {
  CURRENT_SCHEDULE_VERSION,
  createInitialSlots,
  defaultPrefs,
  formatSlotHour,
  getDateOptions,
  getTodayKey,
  initialNotices,
  sortSlotsByStartsAt
} from './src/data';
import {
  adjustMemberPass,
  applySpecialLesson,
  assignLessonReservation,
  cancelLessonAssignmentRequest,
  cancelLessonChangeRequest,
  cancelFixedLesson,
  cancelLessonReservation,
  cancelLessonSlot,
  cancelSpecialLessonRegistration,
  createSpecialLesson,
  createLessonAssignmentRequest,
  createLessonSlot,
  createLessonChangeRequest,
  CreateSpecialLessonInput,
  DatabaseError,
  deleteAccount,
  getCurrentUser,
  getLessonAssignmentRequests,
  getLessonChangeRequests,
  getLessonFeedbacks,
  getLessonFeedbackTargets,
  getMemberById,
  getMemberSummaries,
  getMyFixedLessons,
  getNoticesFromDatabase,
  getSpecialLessonRegistrations,
  getSpecialLessons,
  publishLessonFeedback,
  getSlotsFromDatabase,
  publishNotice,
  PublishLessonFeedbackInput,
  reviewLessonAssignmentRequest,
  reviewLessonChangeRequest,
  reviewSpecialLessonRegistration,
  signIn,
  signOut,
  signUp,
  SignUpInput,
  toggleFixedLessonAbsence,
  updateFixedLesson,
  updateLessonSlotDetails,
  updateLessonSlotInstructor,
  updateMemberPassProduct,
  upsertFixedLesson
} from './src/database';
import { sendLocalNotification } from './src/notifications';
import {
  AbsenceAction,
  AuthProvider,
  ClassSlot,
  FixedLesson,
  LessonAssignmentRequest,
  LessonAssignmentRequestType,
  LessonChangeRequest,
  LessonFeedback,
  LessonFeedbackMediaType,
  LessonFeedbackTarget,
  MemberSummary,
  NotificationKey,
  NotificationPrefs,
  Notice,
  ReservationPerson,
  SpecialLesson,
  SpecialLessonRegistration,
  SpecialLessonRegistrationStatus,
  TabId,
  User,
  UserRole,
  DayOption
} from './src/types';

const LEGACY_STORAGE_KEY = 'oneuldo-swim-state-v3';
const SETTINGS_STORAGE_KEY = 'oneuldo-swim-settings-v1';
const CONTACT_PHONE = '010-4698-3505';
const DEFAULT_PASS_BALANCE = 12;
const brandLogoImage = require('./logo.png');
const logoOnNavyImage = require('./logo-on-navy.png');

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

function isFreeSwimCandidateSlot(slot: ClassSlot) {
  return !slot.isActive && !hasAnyAssignedMember(slot);
}

function isVisibleLessonSlot(slot: ClassSlot, user: User) {
  if (user.role === 'admin') {
    return Boolean(slot.fixedLessonIds.length > 0 || slot.absences.length > 0 || slot.substitutes.length > 0);
  }

  return (
    isFixedLessonForUser(slot, user) ||
    isReservedByUser(slot, user) ||
    hasAnyAssignedMember(slot) ||
    isUnassignedOpenLesson(slot) ||
    isFreeSwimCandidateSlot(slot)
  );
}

function isUpcomingSlot(slot: ClassSlot) {
  return new Date(slot.startsAt).getTime() >= Date.now();
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

function getFeedbackTargetKey(target?: LessonFeedbackTarget | null) {
  return target ? `${target.slotId}:${target.userId}` : '';
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

async function openFeedbackMedia(uri: string) {
  const canOpen = await Linking.canOpenURL(uri);

  if (!canOpen) {
    Alert.alert('첨부 파일', '첨부 파일을 열 수 없습니다.');
    return;
  }

  await Linking.openURL(uri);
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

  if (completedRequest.status === 'approved') {
    await sendLocalNotification('배정 완료', `${slotLabel} ${requestLabel} 신청이 승인되었습니다.`);
    return;
  }

  if (completedRequest.status === 'rejected') {
    await sendLocalNotification('신청 거절', `${slotLabel} ${requestLabel} 신청이 거절되었습니다.`);
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
  const [notices, setNotices] = useState<Notice[]>(initialNotices);
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [passBalance, setPassBalance] = useState(DEFAULT_PASS_BALANCE);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [fixedLessons, setFixedLessons] = useState<FixedLesson[]>([]);
  const [changeRequests, setChangeRequests] = useState<LessonChangeRequest[]>([]);
  const [assignmentRequests, setAssignmentRequests] = useState<LessonAssignmentRequest[]>([]);
  const [lessonFeedbacks, setLessonFeedbacks] = useState<LessonFeedback[]>([]);
  const [lessonFeedbackTargets, setLessonFeedbackTargets] = useState<LessonFeedbackTarget[]>([]);
  const [specialLessons, setSpecialLessons] = useState<SpecialLesson[]>([]);
  const [specialLessonRegistrations, setSpecialLessonRegistrations] = useState<SpecialLessonRegistration[]>([]);
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
            nextNotices,
            nextFixedLessons,
            nextChangeRequests,
            nextAssignmentRequests,
            nextFeedbacks,
            nextFeedbackTargets,
            nextSpecialLessons,
            nextSpecialLessonRegistrations
          ] = await Promise.all([
            getSlotsFromDatabase(),
            getNoticesFromDatabase(),
            savedUser.role === 'member' ? getMyFixedLessons() : Promise.resolve([]),
            getLessonChangeRequests(),
            getLessonAssignmentRequests(),
            getLessonFeedbacks(),
            savedUser.role === 'admin' ? getLessonFeedbackTargets() : Promise.resolve([]),
            getSpecialLessons(),
            getSpecialLessonRegistrations()
          ]);
          setSlots(nextSlots);
          setNotices(nextNotices.length > 0 ? nextNotices : initialNotices);
          setFixedLessons(nextFixedLessons);
          setChangeRequests(nextChangeRequests);
          setAssignmentRequests(nextAssignmentRequests);
          setLessonFeedbacks(nextFeedbacks);
          lessonFeedbacksRef.current = nextFeedbacks;
          setLessonFeedbackTargets(nextFeedbackTargets);
          setSpecialLessons(nextSpecialLessons);
          setSpecialLessonRegistrations(nextSpecialLessonRegistrations);
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
      latestUser,
      nextNotices,
      nextFixedLessons,
      nextChangeRequests,
      nextAssignmentRequests,
      nextFeedbacks,
      nextFeedbackTargets,
      nextSpecialLessons,
      nextSpecialLessonRegistrations
    ] = await Promise.all([
      getSlotsFromDatabase(),
      getMemberById(nextUser.id),
      getNoticesFromDatabase(),
      nextUser.role === 'member' ? getMyFixedLessons() : Promise.resolve([]),
      getLessonChangeRequests(),
      getLessonAssignmentRequests(),
      getLessonFeedbacks(),
      nextUser.role === 'admin' ? getLessonFeedbackTargets() : Promise.resolve([]),
      getSpecialLessons(),
      getSpecialLessonRegistrations()
    ]);
    const normalizedUser = latestUser ?? nextUser;

    setSlots(nextSlots);
    if (resetSelectedDate) {
      setSelectedDate(nextSlots[0]?.date ?? getTodayKey());
    }
    setNotices(nextNotices.length > 0 ? nextNotices : initialNotices);
    setFixedLessons(nextFixedLessons);
    setChangeRequests(nextChangeRequests);
    setAssignmentRequests(nextAssignmentRequests);
    assignmentRequestsRef.current = nextAssignmentRequests;
    setLessonFeedbacks(nextFeedbacks);
    lessonFeedbacksRef.current = nextFeedbacks;
    setLessonFeedbackTargets(nextFeedbackTargets);
    setSpecialLessons(nextSpecialLessons);
    setSpecialLessonRegistrations(nextSpecialLessonRegistrations);
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
    fixedLessonId?: string | null
  ) {
    const result = fixedLessonId
      ? await updateFixedLesson(fixedLessonId, weekday, hour, minute)
      : await upsertFixedLesson(memberId, weekday, hour, minute);
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

  async function handleUpdateLessonInstructor(slotId: string, instructor: string) {
    const result = await updateLessonSlotInstructor(slotId, instructor);
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

  async function handleAssignLessonReservation(slotId: string, memberId: string) {
    const result = await assignLessonReservation(slotId, memberId);
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

  async function handleCreateChangeRequest(targetSlotId: string) {
    const nextRequests = await createLessonChangeRequest(targetSlotId);
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

  async function handleCreateAssignmentRequest(slotId: string, requestType: LessonAssignmentRequestType) {
    const nextRequests = await createLessonAssignmentRequest(slotId, requestType);
    setAssignmentRequests(nextRequests);
  }

  async function handleCancelAssignmentRequest(requestId: string) {
    const nextRequests = await cancelLessonAssignmentRequest(requestId);
    setAssignmentRequests(nextRequests);
  }

  async function handleReviewAssignmentRequest(requestId: string, approved: boolean) {
    const result = await reviewLessonAssignmentRequest(requestId, approved);
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

  async function handlePublishNotice(title: string, body: string, imageUri?: string) {
    const nextNotices = await publishNotice({ title, body, imageUri });
    setNotices(nextNotices.length > 0 ? nextNotices : initialNotices);
  }

  function resetSessionState() {
    setUser(null);
    setSlots(createInitialSlots());
    setSelectedDate(getTodayKey());
    setPassBalance(DEFAULT_PASS_BALANCE);
    setMembers([]);
    setFixedLessons([]);
    setChangeRequests([]);
    setAssignmentRequests([]);
    setLessonFeedbacks([]);
    lessonFeedbacksRef.current = [];
    setLessonFeedbackTargets([]);
    setSpecialLessons([]);
    setSpecialLessonRegistrations([]);
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

  const myFixedSlots = useMemo(
    () => slots.filter((slot) => isFixedLessonForUser(slot, user)).sort(sortSlotsByStartsAt),
    [slots, user]
  );
  const assignedFixedSlots = useMemo(
    () => myFixedSlots.filter((slot) => !isAbsentByUser(slot, user) && isUpcomingSlot(slot)),
    [myFixedSlots, user]
  );
  const nextFixedClass = useMemo(
    () => assignedFixedSlots[0],
    [assignedFixedSlots]
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
  const dateOptions = useMemo(() => getDateOptions(slots), [slots]);

  if (showLaunchScreen || !hydrated || !fontsLoaded) {
    return <LaunchScreen />;
  }

  if (!user) {
    return <LoginScreen onSignIn={handleSignIn} onSignUp={handleSignUp} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.appShell}>
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <Image source={logoOnNavyImage} style={styles.headerLogoImage} resizeMode="contain" />
            <View style={styles.headerTextBlock}>
              <Text style={styles.headerTitle}>{user.name}님</Text>
            </View>
          </View>
          <Pressable style={styles.contactButton} onPress={callContact} accessibilityLabel="문의 전화" accessibilityRole="button">
            <Text style={styles.contactButtonText}>문의</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          {activeTab === 'home' ? (
            <HomeScreen
              userRole={user.role}
              nextClass={nextClass}
              nextFixedClass={nextFixedClass}
              notices={notices}
              fixedLessons={fixedLessons}
              openSlots={openSlots}
              slots={slots}
              members={members}
              changeRequests={changeRequests}
              assignmentRequests={assignmentRequests}
              lessonFeedbacks={lessonFeedbacks}
              lessonFeedbackTargets={lessonFeedbackTargets}
              specialLessons={specialLessons}
              specialLessonRegistrations={specialLessonRegistrations}
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
              onCreateChangeRequest={handleCreateChangeRequest}
              onCancelChangeRequest={handleCancelChangeRequest}
              onReviewChangeRequest={handleReviewChangeRequest}
              onCancelAssignmentRequest={handleCancelAssignmentRequest}
              onReviewAssignmentRequest={handleReviewAssignmentRequest}
              onPublishLessonFeedback={handlePublishLessonFeedback}
              onCreateSpecialLesson={handleCreateSpecialLesson}
              onApplySpecialLesson={handleApplySpecialLesson}
              onCancelSpecialLessonRegistration={handleCancelSpecialLessonRegistration}
              onReviewSpecialLessonRegistration={handleReviewSpecialLessonRegistration}
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
              slots={slots}
              passBalance={passBalance}
              prefs={prefs}
              assignmentRequests={assignmentRequests}
              onAbsence={handleAbsenceChange}
              onCreateAssignmentRequest={handleCreateAssignmentRequest}
              onCancelAssignmentRequest={handleCancelAssignmentRequest}
            />
          ) : null}

          {activeTab === 'notices' ? (
            <NoticesScreen userRole={user.role} notices={notices} onPublishNotice={handlePublishNotice} prefs={prefs} />
          ) : null}

          {activeTab === 'alerts' ? <AlertsScreen prefs={prefs} setPrefs={setPrefs} /> : null}

          {activeTab === 'profile' ? (
            <ProfileScreen
              user={user}
              reservationCount={user.role === 'admin' ? reservedSlots.length : myReservations.length}
              passBalance={passBalance}
              onLogout={handleLogout}
              onDeleteAccount={handleDeleteAccount}
            />
          ) : null}
        </View>

        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <Pressable key={tab.id} style={[styles.tabItem, selected && styles.tabItemActive]} onPress={() => setActiveTab(tab.id)}>
                <Feather name={tab.icon} size={20} color={selected ? colors.white : colors.blue700} />
                <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
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
  onSignUp
}: {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (input: SignUpInput) => Promise<void>;
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) {
      return;
    }

    try {
      setSubmitting(true);

      if (mode === 'signin') {
        await onSignIn(email, password);
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
      <ScrollView contentContainerStyle={styles.loginScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeScreen({
  userRole,
  nextClass,
  nextFixedClass,
  notices,
  fixedLessons,
  openSlots,
  slots,
  members,
  changeRequests,
  assignmentRequests,
  lessonFeedbacks,
  lessonFeedbackTargets,
  specialLessons,
  specialLessonRegistrations,
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
  onCreateChangeRequest,
  onCancelChangeRequest,
  onReviewChangeRequest,
  onCancelAssignmentRequest,
  onReviewAssignmentRequest,
  onPublishLessonFeedback,
  onCreateSpecialLesson,
  onApplySpecialLesson,
  onCancelSpecialLessonRegistration,
  onReviewSpecialLessonRegistration,
  onReservePress,
  onNoticePress
}: {
  userRole: UserRole;
  nextClass?: ClassSlot;
  nextFixedClass?: ClassSlot;
  notices: Notice[];
  fixedLessons: FixedLesson[];
  openSlots: ClassSlot[];
  slots: ClassSlot[];
  members: MemberSummary[];
  changeRequests: LessonChangeRequest[];
  assignmentRequests: LessonAssignmentRequest[];
  lessonFeedbacks: LessonFeedback[];
  lessonFeedbackTargets: LessonFeedbackTarget[];
  specialLessons: SpecialLesson[];
  specialLessonRegistrations: SpecialLessonRegistration[];
  passBalance: number;
  onAdjustMemberPass: (memberId: string, amount: number) => Promise<void>;
  onUpdateMemberPassProduct: (memberId: string, lessonCapacity: number) => Promise<void>;
  onSaveFixedLesson: (
    memberId: string,
    weekday: number,
    hour: number,
    minute: number,
    fixedLessonId?: string | null
  ) => Promise<void>;
  onCancelFixedLesson: (fixedLessonId: string) => Promise<void>;
  onUpdateLessonInstructor: (slotId: string, instructor: string) => Promise<void>;
  onCreateLessonSlot: (slotDate: string, hour: number, minute: number, instructor: string, durationMinutes: number) => Promise<void>;
  onUpdateLessonSlot: (slotId: string, instructor: string, durationMinutes: number, capacity: number) => Promise<void>;
  onAssignLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonSlot: (slotId: string) => Promise<void>;
  onCreateChangeRequest: (targetSlotId: string) => Promise<void>;
  onCancelChangeRequest: (requestId: string) => Promise<void>;
  onReviewChangeRequest: (requestId: string, approved: boolean) => Promise<void>;
  onCancelAssignmentRequest: (requestId: string) => Promise<void>;
  onReviewAssignmentRequest: (requestId: string, approved: boolean) => Promise<void>;
  onPublishLessonFeedback: (input: PublishLessonFeedbackInput) => Promise<void>;
  onCreateSpecialLesson: (input: CreateSpecialLessonInput) => Promise<void>;
  onApplySpecialLesson: (specialLessonId: string) => Promise<SpecialLessonRegistrationStatus>;
  onCancelSpecialLessonRegistration: (registrationId: string) => Promise<void>;
  onReviewSpecialLessonRegistration: (registrationId: string, approved: boolean) => Promise<void>;
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
        assignmentRequests={assignmentRequests}
        lessonFeedbackTargets={lessonFeedbackTargets}
        specialLessons={specialLessons}
        specialLessonRegistrations={specialLessonRegistrations}
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
        onReviewChangeRequest={onReviewChangeRequest}
        onReviewAssignmentRequest={onReviewAssignmentRequest}
        onPublishLessonFeedback={onPublishLessonFeedback}
        onCreateSpecialLesson={onCreateSpecialLesson}
        onReviewSpecialLessonRegistration={onReviewSpecialLessonRegistration}
        onNoticePress={onNoticePress}
      />
    );
  }

  return (
    <MemberHomeScreen
      nextClass={nextClass}
      nextFixedClass={nextFixedClass}
      notices={notices}
      fixedLessons={fixedLessons}
      openSlots={openSlots}
      changeRequests={changeRequests}
      assignmentRequests={assignmentRequests}
      lessonFeedbacks={lessonFeedbacks}
      specialLessons={specialLessons}
      passBalance={passBalance}
      onCreateChangeRequest={onCreateChangeRequest}
      onCancelChangeRequest={onCancelChangeRequest}
      onCancelAssignmentRequest={onCancelAssignmentRequest}
      onApplySpecialLesson={onApplySpecialLesson}
      onCancelSpecialLessonRegistration={onCancelSpecialLessonRegistration}
      onReservePress={onReservePress}
      onNoticePress={onNoticePress}
    />
  );
}

function MemberHomeScreen({
  nextClass,
  nextFixedClass,
  notices,
  fixedLessons,
  openSlots,
  changeRequests,
  assignmentRequests,
  lessonFeedbacks,
  specialLessons,
  passBalance,
  onCreateChangeRequest,
  onCancelChangeRequest,
  onCancelAssignmentRequest,
  onApplySpecialLesson,
  onCancelSpecialLessonRegistration,
  onReservePress,
  onNoticePress
}: {
  nextClass?: ClassSlot;
  nextFixedClass?: ClassSlot;
  notices: Notice[];
  fixedLessons: FixedLesson[];
  openSlots: ClassSlot[];
  changeRequests: LessonChangeRequest[];
  assignmentRequests: LessonAssignmentRequest[];
  lessonFeedbacks: LessonFeedback[];
  specialLessons: SpecialLesson[];
  passBalance: number;
  onCreateChangeRequest: (targetSlotId: string) => Promise<void>;
  onCancelChangeRequest: (requestId: string) => Promise<void>;
  onCancelAssignmentRequest: (requestId: string) => Promise<void>;
  onApplySpecialLesson: (specialLessonId: string) => Promise<SpecialLessonRegistrationStatus>;
  onCancelSpecialLessonRegistration: (registrationId: string) => Promise<void>;
  onReservePress: () => void;
  onNoticePress: () => void;
}) {
  const pendingRequest = changeRequests.find((request) => request.status === 'pending');
  const recentRequest = changeRequests.find((request) => request.status !== 'pending');
  const pendingAssignmentRequests = assignmentRequests.filter((request) => request.status === 'pending');
  const recentAssignmentRequest = assignmentRequests.find((request) => request.status !== 'pending');

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.focusCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroIconBadge}>
            <Feather name="calendar" size={24} color={colors.blue900} />
          </View>
          <Text style={styles.focusBadge}>잔여 {passBalance}회</Text>
        </View>
        <View>
          <Text style={styles.heroTitle}>{nextClass ? `${nextClass.shortDateLabel} ${formatSlotHour(nextClass.startsAt)}` : '예정된 수업 없음'}</Text>
          <Text style={styles.heroBody}>
            {nextClass ? `${nextClass.instructor} 강사 · ${nextClass.weekdayLabel}` : '관리자에게 고정 수업 배정을 요청해주세요'}
          </Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={onReservePress}>
          <Feather name="search" size={18} color={colors.blue700} />
          <Text style={styles.primaryButtonText}>빈자리 확인</Text>
        </Pressable>
      </View>

      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{fixedLessons.length}</Text>
          <Text style={styles.summaryLabel}>고정수업</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{passBalance}</Text>
          <Text style={styles.summaryLabel}>남은횟수</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{pendingAssignmentRequests.length}</Text>
          <Text style={styles.summaryLabel}>승인대기</Text>
        </View>
      </View>

      <LessonChangeRequestPanel
        nextClass={nextFixedClass}
        openSlots={openSlots}
        pendingRequest={pendingRequest}
        recentRequest={recentRequest}
        onCreateChangeRequest={onCreateChangeRequest}
        onCancelChangeRequest={onCancelChangeRequest}
      />

      <View style={styles.adminOverview}>
        <View style={styles.adminOverviewHeader}>
          <Text style={styles.adminOverviewTitle}>내 고정 수업</Text>
          <Text style={styles.adminOverviewCount}>{fixedLessons.length}개</Text>
        </View>
        {fixedLessons.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="clock" size={22} color={colors.blue700} />
            <Text style={styles.emptyStateText}>아직 고정 수업이 배정되지 않았습니다.</Text>
          </View>
        ) : (
          fixedLessons.map((lesson) => (
            <View key={lesson.id} style={styles.adminReservationRow}>
              <View style={styles.adminReservationTime}>
                <Text style={styles.adminReservationDay}>{lesson.weekdayLabel}</Text>
                <Text style={styles.adminReservationHour}>{lesson.timeLabel}</Text>
              </View>
              <View style={styles.adminReservationCopy}>
                <Text style={styles.adminReservationName}>{lesson.instructor} 강사</Text>
                <Text style={styles.adminReservationMeta}>{formatLessonCapacity(lesson.lessonCapacity)} 수업</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.adminOverview}>
        <View style={styles.adminOverviewHeader}>
          <Text style={styles.adminOverviewTitle}>신청 가능한 빈자리</Text>
          <Text style={styles.adminOverviewCount}>{openSlots.reduce((count, slot) => count + slot.openSeatCount, 0)}개</Text>
        </View>
        {openSlots.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="unlock" size={22} color={colors.blue700} />
            <Text style={styles.emptyStateText}>지금 신청 가능한 빈자리가 없습니다.</Text>
          </View>
        ) : (
          openSlots.slice(0, 3).map((slot) => (
            <View key={slot.id} style={styles.adminReservationRow}>
              <View style={styles.adminReservationTime}>
                <Text style={styles.adminReservationDay}>{slot.shortDateLabel}</Text>
                <Text style={styles.adminReservationHour}>{formatSlotHour(slot.startsAt)}</Text>
              </View>
              <View style={styles.adminReservationCopy}>
                <Text style={styles.adminReservationName}>{slot.instructor} 강사</Text>
                <Text style={styles.adminReservationMeta}>빈자리 {slot.openSeatCount}개</Text>
              </View>
            </View>
          ))
        )}
        <Pressable style={styles.secondaryActionButton} onPress={onReservePress}>
          <Feather name="plus-circle" size={17} color={colors.blue700} />
          <Text style={styles.secondaryActionText}>달력에서 신청</Text>
        </Pressable>
      </View>

      <MemberAssignmentRequestSummary
        pendingRequests={pendingAssignmentRequests}
        recentRequest={recentAssignmentRequest}
        onCancelAssignmentRequest={onCancelAssignmentRequest}
      />

      <MemberLessonFeedbackOverview feedbacks={lessonFeedbacks} />

      <MemberSpecialLessonOverview
        specialLessons={specialLessons}
        onApplySpecialLesson={onApplySpecialLesson}
        onCancelSpecialLessonRegistration={onCancelSpecialLessonRegistration}
      />

      <SectionHeader title="최근 공지" actionLabel="전체" onAction={onNoticePress} />
      {notices.slice(0, 2).map((notice) => (
        <NoticeCard key={notice.id} notice={notice} compact />
      ))}
    </ScrollView>
  );
}

function MemberAssignmentRequestSummary({
  pendingRequests,
  recentRequest,
  onCancelAssignmentRequest
}: {
  pendingRequests: LessonAssignmentRequest[];
  recentRequest?: LessonAssignmentRequest;
  onCancelAssignmentRequest: (requestId: string) => Promise<void>;
}) {
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  async function cancelRequest(request: LessonAssignmentRequest) {
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

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>내 신청 현황</Text>
        <Text style={styles.adminOverviewCount}>{pendingRequests.length}건 대기</Text>
      </View>

      {pendingRequests.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="check-circle" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>승인 대기 중인 신청이 없습니다.</Text>
        </View>
      ) : (
        pendingRequests.map((request) => {
          const canceling = cancelingId === request.id;

          return (
            <View key={request.id} style={styles.requestCard}>
              <Text style={styles.requestTitle}>{formatAssignmentRequestType(request.requestType)} 승인 대기</Text>
              <Text style={styles.requestMeta}>
                {formatSlotBrief(request.startsAt)} · {request.instructor} 강사
              </Text>
              <Pressable
                style={[styles.secondaryActionButton, canceling && styles.disabledButton]}
                onPress={() => cancelRequest(request)}
                disabled={canceling}
              >
                <Feather name="x-circle" size={17} color={colors.blue700} />
                <Text style={styles.secondaryActionText}>신청 취소</Text>
              </Pressable>
            </View>
          );
        })
      )}

      {pendingRequests.length === 0 && recentRequest ? (
        <Text style={styles.requestFootnote}>
          최근 신청: {formatAssignmentRequestType(recentRequest.requestType)} · {formatRequestStatus(recentRequest.status)} · {formatSlotBrief(recentRequest.startsAt)}
        </Text>
      ) : null}
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
          <View key={feedback.id} style={styles.feedbackCard}>
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

  return (
    <Pressable
      style={[styles.feedbackVideoButton, compact && styles.feedbackVideoButtonCompact]}
      onPress={() => openFeedbackMedia(uri)}
      accessibilityRole="button"
      accessibilityLabel="피드백 동영상 보기"
    >
      <Feather name="play-circle" size={compact ? 18 : 22} color={colors.white} />
      <Text style={styles.feedbackVideoText}>동영상 보기</Text>
    </Pressable>
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
  const visibleLessons = specialLessons.slice(0, 5);

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
        <Text style={styles.adminOverviewCount}>{specialLessons.length}개</Text>
      </View>

      {visibleLessons.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="star" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>모집 중인 특별수업이 없습니다.</Text>
        </View>
      ) : (
        visibleLessons.map((lesson) => {
          const applied = Boolean(lesson.myRegistrationId);
          const canCancel = lesson.myStatus === 'pending' || lesson.myStatus === 'waitlisted';
          const statusText = formatSpecialLessonStatus(lesson.myStatus);
          const queueText = lesson.myQueuePosition
            ? `선착순 ${lesson.myQueuePosition}번 · ${lesson.myQueuePosition <= lesson.capacity ? '정원 안' : '대기'}`
            : `${lesson.approvedCount}/${lesson.capacity}명 확정`;
          const applying = applyingId === lesson.id;
          const canceling = Boolean(lesson.myRegistrationId && cancelingId === lesson.myRegistrationId);
          const busy = applying || canceling;

          return (
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
                <Text style={[styles.specialStatusBadge, lesson.myStatus === 'approved' && styles.specialStatusBadgeApproved]}>
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
              ) : !applied ? (
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

function LessonChangeRequestPanel({
  nextClass,
  openSlots,
  pendingRequest,
  recentRequest,
  onCreateChangeRequest,
  onCancelChangeRequest
}: {
  nextClass?: ClassSlot;
  openSlots: ClassSlot[];
  pendingRequest?: LessonChangeRequest;
  recentRequest?: LessonChangeRequest;
  onCreateChangeRequest: (targetSlotId: string) => Promise<void>;
  onCancelChangeRequest: (requestId: string) => Promise<void>;
}) {
  const [submittingSlotId, setSubmittingSlotId] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const requestableSlots = openSlots.filter((slot) => slot.id !== nextClass?.id).slice(0, 3);

  async function requestChange(slot: ClassSlot) {
    if (submittingSlotId) {
      return;
    }

    Alert.alert('변경 요청', `${formatSlotBrief(nextClass?.startsAt)} 수업을 ${formatSlotBrief(slot.startsAt)} 수업으로 변경 요청할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '요청',
        onPress: async () => {
          try {
            setSubmittingSlotId(slot.id);
            await onCreateChangeRequest(slot.id);
            Alert.alert('요청 완료', '관리자 승인 후 변경이 확정됩니다.');
          } catch (error) {
            const message = error instanceof DatabaseError ? error.message : '변경 요청을 만들지 못했습니다.';
            Alert.alert('요청 실패', message);
          } finally {
            setSubmittingSlotId(null);
          }
        }
      }
    ]);
  }

  async function cancelRequest() {
    if (!pendingRequest || canceling) {
      return;
    }

    try {
      setCanceling(true);
      await onCancelChangeRequest(pendingRequest.id);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '변경 요청을 취소하지 못했습니다.';
      Alert.alert('취소 실패', message);
    } finally {
      setCanceling(false);
    }
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>다음 수업 변경 요청</Text>
        <Text style={styles.adminOverviewCount}>{pendingRequest ? '대기중' : `${requestableSlots.length}개`}</Text>
      </View>

      {!nextClass ? (
        <View style={styles.emptyState}>
          <Feather name="clock" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>변경 요청할 다음 고정수업이 없습니다.</Text>
        </View>
      ) : pendingRequest ? (
        <View style={styles.requestCard}>
          <Text style={styles.requestTitle}>승인 대기</Text>
          <Text style={styles.requestMeta}>
            {formatSlotBrief(pendingRequest.sourceStartsAt)} → {formatSlotBrief(pendingRequest.targetStartsAt)}
          </Text>
          <Pressable style={[styles.secondaryActionButton, canceling && styles.disabledButton]} onPress={cancelRequest} disabled={canceling}>
            <Feather name="x-circle" size={17} color={colors.blue700} />
            <Text style={styles.secondaryActionText}>요청 취소</Text>
          </Pressable>
        </View>
      ) : requestableSlots.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="unlock" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>변경 요청 가능한 빈자리가 없습니다.</Text>
        </View>
      ) : (
        requestableSlots.map((slot) => (
          <View key={slot.id} style={styles.adminReservationRow}>
            <View style={styles.adminReservationTime}>
              <Text style={styles.adminReservationDay}>{slot.shortDateLabel}</Text>
              <Text style={styles.adminReservationHour}>{formatSlotHour(slot.startsAt)}</Text>
            </View>
            <View style={styles.adminReservationCopy}>
              <Text style={styles.adminReservationName}>{slot.instructor} 강사</Text>
              <Text style={styles.adminReservationMeta}>빈자리 {slot.openSeatCount}개</Text>
            </View>
            <Pressable
              style={[styles.memberAdjustButton, submittingSlotId === slot.id && styles.disabledButton]}
              onPress={() => requestChange(slot)}
              disabled={Boolean(submittingSlotId)}
              accessibilityLabel="변경 요청"
              accessibilityRole="button"
            >
              <Text style={styles.memberAdjustButtonText}>요청</Text>
            </Pressable>
          </View>
        ))
      )}

      {!pendingRequest && recentRequest ? (
        <Text style={styles.requestFootnote}>
          최근 요청: {formatRequestStatus(recentRequest.status)} · {formatSlotBrief(recentRequest.targetStartsAt)}
        </Text>
      ) : null}
    </View>
  );
}

function AdminHomeScreen({
  slots,
  members,
  notices,
  openSlots,
  changeRequests,
  assignmentRequests,
  lessonFeedbackTargets,
  specialLessons,
  specialLessonRegistrations,
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
  onReviewChangeRequest,
  onReviewAssignmentRequest,
  onPublishLessonFeedback,
  onCreateSpecialLesson,
  onReviewSpecialLessonRegistration,
  onNoticePress
}: {
  slots: ClassSlot[];
  members: MemberSummary[];
  notices: Notice[];
  openSlots: ClassSlot[];
  changeRequests: LessonChangeRequest[];
  assignmentRequests: LessonAssignmentRequest[];
  lessonFeedbackTargets: LessonFeedbackTarget[];
  specialLessons: SpecialLesson[];
  specialLessonRegistrations: SpecialLessonRegistration[];
  onAdjustMemberPass: (memberId: string, amount: number) => Promise<void>;
  onUpdateMemberPassProduct: (memberId: string, lessonCapacity: number) => Promise<void>;
  onSaveFixedLesson: (
    memberId: string,
    weekday: number,
    hour: number,
    minute: number,
    fixedLessonId?: string | null
  ) => Promise<void>;
  onCancelFixedLesson: (fixedLessonId: string) => Promise<void>;
  onUpdateLessonInstructor: (slotId: string, instructor: string) => Promise<void>;
  onCreateLessonSlot: (slotDate: string, hour: number, minute: number, instructor: string, durationMinutes: number) => Promise<void>;
  onUpdateLessonSlot: (slotId: string, instructor: string, durationMinutes: number, capacity: number) => Promise<void>;
  onAssignLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonSlot: (slotId: string) => Promise<void>;
  onReviewChangeRequest: (requestId: string, approved: boolean) => Promise<void>;
  onReviewAssignmentRequest: (requestId: string, approved: boolean) => Promise<void>;
  onPublishLessonFeedback: (input: PublishLessonFeedbackInput) => Promise<void>;
  onCreateSpecialLesson: (input: CreateSpecialLessonInput) => Promise<void>;
  onReviewSpecialLessonRegistration: (registrationId: string, approved: boolean) => Promise<void>;
  onNoticePress: () => void;
}) {
  const fixedLessonCount = members.reduce((count, member) => count + member.fixedLessonCount, 0);
  const openSeatTotal = openSlots.reduce((count, slot) => count + slot.openSeatCount, 0);
  const substituteCount = slots.reduce((count, slot) => count + slot.substitutes.length, 0);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

      <AdminChangeRequestOverview requests={changeRequests} onReviewChangeRequest={onReviewChangeRequest} />
      <AdminAssignmentRequestOverview requests={assignmentRequests} onReviewAssignmentRequest={onReviewAssignmentRequest} />
      <AdminSpecialLessonOverview
        specialLessons={specialLessons}
        registrations={specialLessonRegistrations}
        onCreateSpecialLesson={onCreateSpecialLesson}
        onReviewSpecialLessonRegistration={onReviewSpecialLessonRegistration}
      />
      <AdminLessonFeedbackOverview targets={lessonFeedbackTargets} onPublishLessonFeedback={onPublishLessonFeedback} />
      <AdminScheduleOverview
        slots={slots}
        members={members}
        onCreateLessonSlot={onCreateLessonSlot}
        onUpdateLessonSlot={onUpdateLessonSlot}
        onAssignLessonReservation={onAssignLessonReservation}
        onCancelLessonReservation={onCancelLessonReservation}
        onCancelLessonSlot={onCancelLessonSlot}
        onUpdateLessonInstructor={onUpdateLessonInstructor}
      />
      <AdminMemberOverview
        slots={slots}
        members={members}
        onAdjustMemberPass={onAdjustMemberPass}
        onUpdateMemberPassProduct={onUpdateMemberPassProduct}
        onSaveFixedLesson={onSaveFixedLesson}
        onCancelFixedLesson={onCancelFixedLesson}
      />

      <SectionHeader title="최근 공지" actionLabel="전체" onAction={onNoticePress} />
      {notices.slice(0, 1).map((notice) => (
        <NoticeCard key={notice.id} notice={notice} compact />
      ))}
    </ScrollView>
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

function AdminAssignmentRequestOverview({
  requests,
  onReviewAssignmentRequest
}: {
  requests: LessonAssignmentRequest[];
  onReviewAssignmentRequest: (requestId: string, approved: boolean) => Promise<void>;
}) {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const pendingRequests = requests.filter((request) => request.status === 'pending');

  async function review(request: LessonAssignmentRequest, approved: boolean) {
    if (reviewingId) {
      return;
    }

    try {
      setReviewingId(request.id);
      await onReviewAssignmentRequest(request.id, approved);

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
  onReviewSpecialLessonRegistration
}: {
  specialLessons: SpecialLesson[];
  registrations: SpecialLessonRegistration[];
  onCreateSpecialLesson: (input: CreateSpecialLessonInput) => Promise<void>;
  onReviewSpecialLessonRegistration: (registrationId: string, approved: boolean) => Promise<void>;
}) {
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

  async function createLesson() {
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
      await onCreateSpecialLesson({
        title,
        description,
        imageUri,
        startsAt,
        instructor,
        durationMinutes,
        capacity: nextCapacity
      });
      setTitle('');
      setDescription('');
      setImageUri(undefined);
      setInstructor('');
      setCapacity('8');
      Alert.alert('특별수업 등록', '회원에게 특별수업 모집이 노출됩니다.');
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '특별수업을 등록하지 못했습니다.';
      Alert.alert('등록 실패', message);
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
        <Text style={styles.adminOverviewTitle}>특별수업 모집</Text>
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
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.specialLessonPosterPreview} resizeMode="cover" /> : null}
        <Pressable style={styles.secondaryActionButton} onPress={pickSpecialLessonImage}>
          <Feather name="image" size={17} color={colors.blue700} />
          <Text style={styles.secondaryActionText}>{imageUri ? '포스터 변경' : '포스터 등록'}</Text>
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
        <Pressable style={[styles.secondaryActionButton, creating && styles.disabledButton]} onPress={createLesson} disabled={creating}>
          <Feather name="plus-circle" size={17} color={colors.blue700} />
          <Text style={styles.secondaryActionText}>{creating ? '등록중' : '특별수업 등록'}</Text>
        </Pressable>
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
  const [feedbackText, setFeedbackText] = useState('');
  const [mediaUri, setMediaUri] = useState<string | undefined>();
  const [mediaType, setMediaType] = useState<LessonFeedbackMediaType | undefined>();
  const [saving, setSaving] = useState(false);
  const selectedTarget = useMemo(() => {
    return targets.find((target) => getFeedbackTargetKey(target) === selectedTargetKey) ?? null;
  }, [selectedTargetKey, targets]);
  const pendingCount = targets.filter((target) => !target.feedbackId).length;
  const previewUri = mediaUri ?? selectedTarget?.mediaUri;
  const previewType = mediaType ?? selectedTarget?.mediaType ?? undefined;

  useEffect(() => {
    if (selectedTargetKey && !targets.some((target) => getFeedbackTargetKey(target) === selectedTargetKey)) {
      setSelectedTargetKey(null);
    }
  }, [selectedTargetKey, targets]);

  useEffect(() => {
    if (!selectedTarget) {
      setFeedbackText('');
      setMediaUri(undefined);
      setMediaType(undefined);
      return;
    }

    setFeedbackText(selectedTarget?.feedbackText ?? '');
    setMediaUri(undefined);
    setMediaType(undefined);
  }, [selectedTarget?.slotId, selectedTarget?.userId, selectedTarget?.feedbackText]);

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
    if (!selectedTarget || saving) {
      return;
    }

    try {
      setSaving(true);
      await onPublishLessonFeedback({
        slotId: selectedTarget.slotId,
        userId: selectedTarget.userId,
        feedbackText,
        mediaUri,
        mediaType
      });
      setSelectedTargetKey(null);
      setFeedbackText('');
      setMediaUri(undefined);
      setMediaType(undefined);
      Alert.alert('피드백 저장', '회원에게 수업 피드백이 등록되었습니다.');
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '피드백을 저장하지 못했습니다.';
      Alert.alert('저장 실패', message);
    } finally {
      setSaving(false);
    }
  }

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
            <View style={styles.feedbackComposer}>
              <View style={styles.feedbackComposerHeader}>
                <Text style={styles.requestTitle}>
                  {selectedTarget.userName} · {formatSlotBrief(selectedTarget.startsAt)}
                </Text>
                <Text style={styles.requestMeta}>{selectedTarget.instructor} 강사</Text>
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
          ) : null}
        </>
      )}
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
  onCancelLessonSlot,
  onUpdateLessonInstructor
}: {
  slots: ClassSlot[];
  members: MemberSummary[];
  onCreateLessonSlot: (slotDate: string, hour: number, minute: number, instructor: string, durationMinutes: number) => Promise<void>;
  onUpdateLessonSlot: (slotId: string, instructor: string, durationMinutes: number, capacity: number) => Promise<void>;
  onAssignLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonSlot: (slotId: string) => Promise<void>;
  onUpdateLessonInstructor: (slotId: string, instructor: string) => Promise<void>;
}) {
  const [slotDate, setSlotDate] = useState(slots[0]?.date ?? getTodayKey());
  const [slotTime, setSlotTime] = useState('19:00');
  const [slotInstructor, setSlotInstructor] = useState('');
  const [slotDuration, setSlotDuration] = useState(60);
  const [addingSlot, setAddingSlot] = useState(false);
  const [assignmentQuery, setAssignmentQuery] = useState('');
  const [selectedAssignmentMemberId, setSelectedAssignmentMemberId] = useState<string | null>(null);
  const calendarHeaderScrollRef = useRef<ScrollView | null>(null);
  const calendarBodyScrollRef = useRef<ScrollView | null>(null);
  const syncingCalendarScroll = useRef(false);
  const operatingSlots = useMemo(
    () => [...slots].sort(sortSlotsByStartsAt),
    [slots]
  );
  const dateColumns = useMemo(() => {
    const seen = new Set<string>();

    return operatingSlots.reduce<Array<{ date: string; shortDateLabel: string; weekdayLabel: string }>>((columns, slot) => {
      if (seen.has(slot.date)) {
        return columns;
      }

      seen.add(slot.date);
      columns.push({
        date: slot.date,
        shortDateLabel: slot.shortDateLabel,
        weekdayLabel: slot.weekdayLabel
      });

      return columns;
    }, []);
  }, [operatingSlots]);
  const operatingTimes = useMemo(
    () => Array.from(new Set(operatingSlots.map((slot) => slot.startMinutes))).sort((a, b) => a - b),
    [operatingSlots]
  );
  const slotMap = useMemo(() => {
    return operatingSlots.reduce<Map<string, ClassSlot>>((map, slot) => {
      map.set(getCalendarSlotKey(slot.date, slot.startMinutes), slot);
      return map;
    }, new Map());
  }, [operatingSlots]);
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

  function syncCalendarHorizontalScroll(target: 'header' | 'body', event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (syncingCalendarScroll.current) {
      return;
    }

    const x = event.nativeEvent.contentOffset.x;
    syncingCalendarScroll.current = true;

    if (target === 'header') {
      calendarHeaderScrollRef.current?.scrollTo({ x, animated: false });
    } else {
      calendarBodyScrollRef.current?.scrollTo({ x, animated: false });
    }

    requestAnimationFrame(() => {
      syncingCalendarScroll.current = false;
    });
  }

  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>운영 달력</Text>
        <Text style={styles.adminOverviewCount}>{operatingSlots.length}칸</Text>
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
            style={[styles.input, styles.fixedLessonSmallInput]}
            value={slotTime}
            onChangeText={setSlotTime}
            keyboardType="numbers-and-punctuation"
            placeholder="13:30"
            placeholderTextColor={colors.muted}
          />
          <TextInput
            style={[styles.input, styles.fixedLessonInstructorInput]}
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

      {operatingSlots.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="calendar" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>배정된 수업이 없습니다.</Text>
        </View>
      ) : (
        <View style={styles.calendarFrame}>
          <View style={styles.calendarPinnedHeader}>
            <View style={[styles.calendarTimeCell, styles.calendarHeaderTimeCell]}>
              <Text style={styles.calendarTimeText}>시간</Text>
            </View>
            <ScrollView
              ref={calendarHeaderScrollRef}
              style={styles.calendarHorizontalScroll}
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(event) => syncCalendarHorizontalScroll('body', event)}
            >
              <View style={styles.calendarDateHeaderRow}>
                {dateColumns.map((column) => (
                  <View key={column.date} style={styles.calendarDateHeaderCell}>
                    <Text style={styles.calendarDateText}>{column.shortDateLabel}</Text>
                    <Text style={styles.calendarWeekdayText}>{column.weekdayLabel}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>

          <ScrollView style={styles.calendarBodyScroll} nestedScrollEnabled showsVerticalScrollIndicator>
            <View style={styles.calendarBodyRow}>
              <View style={styles.calendarTimeColumn}>
                {operatingTimes.map((startMinutes) => (
                  <View key={startMinutes} style={styles.calendarTimeCell}>
                    <Text style={styles.calendarTimeText}>{formatMinuteLabel(startMinutes)}</Text>
                  </View>
                ))}
              </View>

              <ScrollView
                ref={calendarBodyScrollRef}
                style={styles.calendarHorizontalScroll}
                horizontal
                showsHorizontalScrollIndicator
                scrollEventThrottle={16}
                onScroll={(event) => syncCalendarHorizontalScroll('header', event)}
              >
                <View>
                  {operatingTimes.map((startMinutes) => (
                    <View key={startMinutes} style={styles.calendarRow}>
                      {dateColumns.map((column) => {
                        const slot = slotMap.get(getCalendarSlotKey(column.date, startMinutes));

                        return (
                          <AdminCalendarCell
                            key={`${column.date}-${startMinutes}`}
                            slot={slot}
                            selectedAssignmentMember={selectedAssignmentMember}
                            onOpenLessonSlot={onCreateLessonSlot}
                            onUpdateLessonSlot={onUpdateLessonSlot}
                            onAssignLessonReservation={onAssignLessonReservation}
                            onCancelLessonReservation={onCancelLessonReservation}
                            onCancelLessonSlot={onCancelLessonSlot}
                            onUpdateLessonInstructor={onUpdateLessonInstructor}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function AdminCalendarCell({
  slot,
  selectedAssignmentMember,
  onOpenLessonSlot,
  onUpdateLessonSlot,
  onAssignLessonReservation,
  onCancelLessonReservation,
  onCancelLessonSlot,
  onUpdateLessonInstructor
}: {
  slot?: ClassSlot;
  selectedAssignmentMember: MemberSummary | null;
  onOpenLessonSlot: (slotDate: string, hour: number, minute: number, instructor: string, durationMinutes: number) => Promise<void>;
  onUpdateLessonSlot: (slotId: string, instructor: string, durationMinutes: number, capacity: number) => Promise<void>;
  onAssignLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonReservation: (slotId: string, memberId: string) => Promise<void>;
  onCancelLessonSlot: (slotId: string) => Promise<void>;
  onUpdateLessonInstructor: (slotId: string, instructor: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [instructor, setInstructor] = useState(slot?.instructor ?? '');
  const [durationMinutes, setDurationMinutes] = useState(slot?.durationMinutes ?? 60);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    setInstructor(slot?.instructor ?? '');
  }, [slot?.instructor]);

  useEffect(() => {
    setDurationMinutes(slot?.durationMinutes ?? 60);
  }, [slot?.durationMinutes]);

  if (!slot) {
    return <View style={[styles.calendarSlotCell, styles.calendarEmptySlotCell]} />;
  }

  const currentSlot = slot;
  const isOpen = currentSlot.isActive;
  const hasFixedLesson = currentSlot.fixedMembers.length > 0;
  const absentUserIds = new Set(currentSlot.absences.map((person) => person.userId));
  const attendingFixedMembers = currentSlot.fixedMembers.filter((member) => !absentUserIds.has(member.userId));
  const fixedNames = formatPersonNames(attendingFixedMembers);
  const absenceNames = formatPersonNames(currentSlot.absences);
  const occupiedCount = attendingFixedMembers.length + currentSlot.substitutes.length;
  const hasOpenSeat = currentSlot.openSeatCount > 0;
  const hasMemberAssignment = currentSlot.fixedMembers.length > 0 || currentSlot.substitutes.length > 0 || currentSlot.absences.length > 0;
  const selectedAssigned = Boolean(
    selectedAssignmentMember && currentSlot.substitutes.some((person) => person.userId === selectedAssignmentMember.id)
  );
  const selectedAlreadyFixed = Boolean(
    selectedAssignmentMember && currentSlot.fixedMembers.some((person) => person.userId === selectedAssignmentMember.id)
  );

  async function cancelAssignedMember(person: ReservationPerson) {
    if (assigning || !person.userId) {
      return;
    }

    try {
      setAssigning(true);
      await onCancelLessonReservation(currentSlot.id, person.userId);
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '배정을 취소하지 못했습니다.';
      Alert.alert('배정 취소 실패', message);
    } finally {
      setAssigning(false);
    }
  }

  async function openSlot() {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      await onOpenLessonSlot(currentSlot.date, currentSlot.hour, currentSlot.minute, instructor || currentSlot.instructor, durationMinutes);
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
      await onUpdateLessonSlot(currentSlot.id, instructor, durationMinutes, currentSlot.capacity);
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
      `${currentSlot.shortDateLabel} ${formatSlotHour(currentSlot.startsAt)} 수업을 닫을까요? 이 날짜 수업 전체가 닫히고, 대체/개별 예약은 취소 및 환불됩니다.`,
      [
        { text: '닫기', style: 'cancel' },
        {
          text: '수업 닫기',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await onCancelLessonSlot(currentSlot.id);
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

  async function toggleAssignment() {
    if (!selectedAssignmentMember || assigning || selectedAlreadyFixed || !isOpen) {
      return;
    }

    try {
      setAssigning(true);

      if (selectedAssigned) {
        await onCancelLessonReservation(currentSlot.id, selectedAssignmentMember.id);
      } else {
        await onAssignLessonReservation(currentSlot.id, selectedAssignmentMember.id);
      }
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '회원 배정을 저장하지 못했습니다.';
      Alert.alert(selectedAssigned ? '배정 취소 실패' : '배정 실패', message);
    } finally {
      setAssigning(false);
    }
  }

  return (
    <View
      style={[
        styles.calendarSlotCell,
        !isOpen && styles.calendarClosedSlotCell,
        isOpen && (hasMemberAssignment ? styles.calendarAssignedSlotCell : styles.calendarUnassignedSlotCell),
        isOpen && hasOpenSeat && styles.calendarOpenSlotCell,
        isOpen && currentSlot.substitutes.length > 0 && styles.calendarBookedSlotCell
      ]}
    >
      <View style={styles.calendarCellTopRow}>
        {editing ? (
          <TextInput
            style={[styles.input, styles.calendarInstructorInput]}
            value={instructor}
            onChangeText={setInstructor}
            placeholder="강사"
            placeholderTextColor={colors.muted}
          />
        ) : (
          <View style={styles.calendarInstructorBlock}>
            <Text style={styles.calendarInstructorChip} numberOfLines={1}>
              {currentSlot.instructor}
            </Text>
            <Text style={styles.calendarDurationChip}>{formatLessonDuration(currentSlot.durationMinutes)}</Text>
          </View>
        )}
        <Text style={[styles.calendarAssignmentBadge, !hasMemberAssignment && styles.calendarAssignmentBadgeEmpty, !isOpen && styles.calendarAssignmentBadgeClosed]}>
          {!isOpen ? '닫힘' : hasMemberAssignment ? '배정' : '미배정'}
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
                accessibilityLabel={`${formatLessonDuration(duration)} 수업 선택`}
              >
                <Text style={[styles.lessonDurationButtonText, selected && styles.lessonDurationButtonTextActive]}>
                  {formatLessonDuration(duration)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.calendarMemberLines}>
        {fixedNames ? (
          <Text style={styles.calendarMemberPrimaryText} numberOfLines={2}>
            {fixedNames}
          </Text>
        ) : null}
        {currentSlot.substitutes.map((person) => (
          <View key={`${person.userId}-${person.createdAt}`} style={styles.calendarSubstituteRow}>
            <Text style={[styles.calendarMemberText, styles.calendarSubstituteText, styles.calendarSubstituteName]} numberOfLines={1}>
              개별 {person.userName}
            </Text>
            <Pressable
              style={[styles.calendarInlineCancelButton, assigning && styles.disabledButton]}
              onPress={() => cancelAssignedMember(person)}
              disabled={assigning}
              accessibilityLabel={`${person.userName} 개별 배정 취소`}
              accessibilityRole="button"
            >
              <Feather name="x" size={13} color={colors.danger} />
            </Pressable>
          </View>
        ))}
        {absenceNames ? (
          <Text style={[styles.calendarMemberText, styles.calendarAbsenceText]} numberOfLines={2}>
            결석 {absenceNames}
          </Text>
        ) : null}
        {!fixedNames && currentSlot.substitutes.length === 0 && !absenceNames ? (
          <>
            <Text style={styles.calendarUnassignedTitle}>{isOpen ? '회원 미배정' : '수업 닫힘'}</Text>
            <Text style={styles.calendarMutedText}>{isOpen ? '수업만 열려있음' : '열면 다시 운영됨'}</Text>
          </>
        ) : null}
      </View>

      <View style={styles.calendarCellFooter}>
        <Text style={[styles.calendarOpenSeatText, hasOpenSeat && styles.calendarOpenSeatActiveText]}>
          {!isOpen ? '닫힌 수업' : hasOpenSeat ? `빈자리 ${currentSlot.openSeatCount}` : `출석 ${occupiedCount}`}
        </Text>
        <View style={styles.calendarCellActions}>
          {!isOpen ? (
            <Pressable
              style={[styles.calendarEditButton, saving && styles.disabledButton]}
              onPress={openSlot}
              disabled={saving}
              accessibilityLabel="수업 열기"
              accessibilityRole="button"
            >
              <Text style={styles.calendarEditButtonText}>열기</Text>
            </Pressable>
          ) : (
            <>
              {selectedAssignmentMember ? (
                <Pressable
                  style={[
                    styles.calendarAssignButton,
                    selectedAssigned && styles.calendarAssignButtonActive,
                    (assigning || selectedAlreadyFixed) && styles.disabledButton
                  ]}
                  onPress={toggleAssignment}
                  disabled={assigning || selectedAlreadyFixed}
                  accessibilityLabel={selectedAssigned ? '회원 배정 취소' : '회원 배정'}
                  accessibilityRole="button"
                >
                  <Text style={[styles.calendarAssignButtonText, selectedAssigned && styles.calendarAssignButtonTextActive]}>
                    {selectedAlreadyFixed ? '고정' : selectedAssigned ? '배정취소' : '배정'}
                  </Text>
                </Pressable>
              ) : null}
	              <Pressable
	                style={[styles.calendarEditButton, saving && styles.disabledButton]}
	                onPress={editing ? saveSlotDetails : () => setEditing(true)}
	                disabled={saving}
	                accessibilityLabel={editing ? '수업 저장' : '강사 변경'}
	                accessibilityRole="button"
	              >
	                <Text style={styles.calendarEditButtonText}>{editing ? '저장' : '강사'}</Text>
	              </Pressable>
              <Pressable
                style={[styles.calendarDeleteButton, deleting && styles.disabledButton]}
                onPress={confirmCancelSlot}
                disabled={deleting}
                accessibilityLabel="수업 닫기"
                accessibilityRole="button"
              >
                <Text style={styles.calendarDeleteButtonText}>닫기</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function getCalendarSlotKey(date: string, startMinutes: number) {
  return `${date}-${startMinutes}`;
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
  const [savingLesson, setSavingLesson] = useState(false);
  const memberOptions = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();

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
  }, [memberQuery, members]);
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
    setEditingFixedLessonId(firstDraft?.id ?? null);
    setEditingLessonMemberId(member.id);
  }

  function editFixedLessonDraft(draft: FixedLessonDraft) {
    setLessonWeekday(String(draft.weekday));
    setLessonTime(draft.timeLabel);
    setEditingFixedLessonId(draft.id);
  }

  function startNewFixedLesson() {
    setLessonWeekday('1');
    setLessonTime('19:00');
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

    try {
      setSavingLesson(true);
      await onSaveFixedLesson(member.id, weekday, timeParts.hour, timeParts.minute, editingFixedLessonId);
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

      {members.filter((member) => member.role === 'member').length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="users" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>가입된 회원이 없습니다.</Text>
        </View>
      ) : selectedMember ? (
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
                const selected = selectedMember.id === member.id;
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

          {(() => {
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
                                  {draft.instructor} 강사
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

                    <View style={styles.fixedLessonEditorRow}>
	                      <TextInput
	                        style={[styles.input, styles.fixedLessonSmallInput]}
	                        value={lessonWeekday}
	                        onChangeText={setLessonWeekday}
	                        keyboardType="number-pad"
	                        placeholder="요일"
	                        placeholderTextColor={colors.muted}
	                      />
	                      <TextInput
	                        style={[styles.input, styles.fixedLessonSmallInput]}
	                        value={lessonTime}
	                        onChangeText={setLessonTime}
	                        keyboardType="numbers-and-punctuation"
	                        placeholder="13:30"
	                        placeholderTextColor={colors.muted}
	                      />
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
          })()}
        </>
      ) : (
        <View style={styles.emptyState}>
          <Feather name="search" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>선택할 회원이 없습니다.</Text>
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
  passBalance,
  prefs,
  assignmentRequests,
  onAbsence,
  onCreateAssignmentRequest,
  onCancelAssignmentRequest
}: {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  dateOptions: DayOption[];
  user: User;
  slots: ClassSlot[];
  passBalance: number;
  prefs: NotificationPrefs;
  assignmentRequests: LessonAssignmentRequest[];
  onAbsence: (slot: ClassSlot) => Promise<AbsenceAction>;
  onCreateAssignmentRequest: (slotId: string, requestType: LessonAssignmentRequestType) => Promise<void>;
  onCancelAssignmentRequest: (requestId: string) => Promise<void>;
}) {
  const daySlots = slots.filter((slot) => slot.date === selectedDate && isVisibleLessonSlot(slot, user)).sort(sortSlotsByStartsAt);
  const requestableCount = daySlots.filter((slot) => isUnassignedOpenLesson(slot) || isFreeSwimCandidateSlot(slot)).length;
  const substituteCount = slots.reduce((count, slot) => count + slot.substitutes.length, 0);
  const pendingAssignmentBySlot = useMemo(() => {
    return assignmentRequests
      .filter((request) => request.status === 'pending')
      .reduce<Map<string, LessonAssignmentRequest>>((map, request) => {
        map.set(request.slotId, request);
        return map;
      }, new Map());
  }, [assignmentRequests]);
  const [submittingSlotId, setSubmittingSlotId] = useState<string | null>(null);
  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(null);

  async function toggleAbsence(slot: ClassSlot) {
    if (user.role === 'admin') {
      Alert.alert('관리자 모드', '관리자는 회원별 고정 수업과 열린 자리를 확인할 수 있습니다.');
      return;
    }

    try {
      const action = await onAbsence(slot);
      const slotLabel = `${slot.shortDateLabel} ${formatSlotHour(slot.startsAt)}`;

      if (action === 'absenceCreated' && prefs.reservation) {
        await sendLocalNotification('결석 처리', `${slotLabel} 고정 수업이 빈자리로 열렸습니다.`);
      }

      if (action === 'absenceCanceled' && prefs.reservation) {
        await sendLocalNotification('결석 취소', `${slotLabel} 고정 수업 결석 처리가 취소되었습니다.`);
      }
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '결석 처리 내용을 저장하지 못했습니다.';
      Alert.alert('결석 처리 실패', message);
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
        ? `${slotLabel}은 수업이 닫힌 시간이라 자유수영 신청으로 접수됩니다.`
        : `${slotLabel}은 수업이 열려 있는 시간이라 추가 수업 신청으로 접수됩니다.`;

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
          <Feather name={user.role === 'admin' ? 'check-circle' : 'credit-card'} size={22} color={colors.blue700} />
          <Text style={styles.passSummaryValue}>{user.role === 'admin' ? `${substituteCount}건` : `${passBalance}회`}</Text>
        </View>
        <View style={styles.passSummaryBadge}>
          <Feather name="unlock" size={16} color={colors.blue700} />
          <Text style={styles.passSummaryBadgeText}>신청 가능 {requestableCount}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.slotList} showsVerticalScrollIndicator={false}>
        {daySlots.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="calendar" size={22} color={colors.blue700} />
            <Text style={styles.emptyStateText}>이 날짜에는 표시할 고정 수업이나 빈자리가 없습니다.</Text>
          </View>
        ) : null}
        {daySlots.map((slot) => {
          const fixedMine = isFixedLessonForUser(slot, user);
          const assignedMine = isReservedByUser(slot, user);
          const absenceMine = isAbsentByUser(slot, user);
          const pendingRequest = pendingAssignmentBySlot.get(slot.id);
          const assignedBySomeone = hasAnyAssignedMember(slot);
          const unassignedOpen = isUnassignedOpenLesson(slot);
          const freeSwimCandidate = isFreeSwimCandidateSlot(slot);
          const absenceCancellationBlocked = absenceMine && slot.substitutes.length >= slot.absences.length;
          const canRequestExtra = user.role === 'member' && unassignedOpen && !pendingRequest && passBalance > 0;
          const canRequestFreeSwim = user.role === 'member' && freeSwimCandidate && !pendingRequest;
          const isRequesting = submittingSlotId === slot.id;
          const isCancelingRequest = pendingRequest ? cancelingRequestId === pendingRequest.id : false;
          const noPass = user.role === 'member' && unassignedOpen && !pendingRequest && passBalance <= 0;
          const disabled =
            user.role === 'admin' ||
            isRequesting ||
            isCancelingRequest ||
            (fixedMine && absenceCancellationBlocked) ||
            (!fixedMine && !pendingRequest && !canRequestExtra && !canRequestFreeSwim);
          const buttonLabel = (() => {
            if (user.role === 'admin') {
              return '확인';
            }

            if (fixedMine && absenceMine && absenceCancellationBlocked) {
              return '대체완료';
            }

            if (fixedMine && absenceMine) {
              return '결석취소';
            }

            if (fixedMine) {
              return '결석';
            }

            if (pendingRequest) {
              return isCancelingRequest ? '취소중' : '대기취소';
            }

            if (assignedMine) {
              return '배정됨';
            }

            if (canRequestExtra) {
              return isRequesting ? '신청중' : '수업신청';
            }

            if (canRequestFreeSwim) {
              return isRequesting ? '신청중' : '자유수영';
            }

            if (noPass) {
              return '횟수';
            }

            if (assignedBySomeone) {
              return '배정됨';
            }

            return slot.isActive ? '마감' : '닫힘';
          })();
          const statusColor = fixedMine
            ? absenceMine
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
          const slotMeta = fixedMine
            ? absenceMine
              ? slot.substitutes.length > 0
                ? `내 결석 · 대체 ${slot.substitutes.length}/${slot.absences.length}`
                : '내 결석 · 빈자리 공개'
              : slot.openSeatCount > 0
                ? `내 고정 수업 · 빈자리 ${slot.openSeatCount}개`
                : '내 고정 수업'
            : assignedMine
              ? slot.isActive
                ? '내 추가 수업'
                : '내 자유수영'
              : pendingRequest
                ? `${formatAssignmentRequestType(pendingRequest.requestType)} 승인 대기`
                : assignedBySomeone
                  ? slot.isActive
                    ? '다른 회원 배정'
                    : '닫힌 시간 · 배정 있음'
                  : unassignedOpen
                    ? '수업 열림 · 배정 없음'
                    : freeSwimCandidate
                      ? '수업 닫힘 · 자유수영 가능'
                      : slot.isActive
                        ? '수업 열림'
                        : '수업 닫힘';
          const handlePress = () => {
            if (fixedMine) {
              void toggleAbsence(slot);
              return;
            }

            if (pendingRequest) {
              void cancelAssignmentRequest(pendingRequest);
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
          const metaIcon = fixedMine || assignedMine
            ? 'user'
            : pendingRequest
              ? 'clock'
              : assignedBySomeone
                ? 'users'
                : unassignedOpen || freeSwimCandidate
                  ? 'plus-circle'
                  : 'lock';
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
                <View style={styles.slotMetaRow}>
                  <Feather name={metaIcon} size={13} color={statusColor} />
                  <Text style={styles.slotMeta}>{slotMeta}</Text>
                  {unassignedOpen || freeSwimCandidate ? <Text style={styles.waitlistText}>신청 가능</Text> : null}
                </View>
              </View>
              <Pressable
                style={[
                  styles.reserveButton,
                  (pendingRequest || (fixedMine && absenceMine && !absenceCancellationBlocked)) && styles.cancelButton,
                  (disabled || canRequestExtra || canRequestFreeSwim) && !fixedMine && !pendingRequest && styles.waitButton,
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
                    (pendingRequest || (fixedMine && absenceMine && !absenceCancellationBlocked)) && styles.cancelButtonText,
                    (disabled || canRequestExtra || canRequestFreeSwim) && !fixedMine && !pendingRequest && styles.waitButtonText
                  ]}
                >
                  {buttonLabel}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function NoticesScreen({
  userRole,
  notices,
  onPublishNotice,
  prefs
}: {
  userRole: UserRole;
  notices: Notice[];
  onPublishNotice: (title: string, body: string, imageUri?: string) => Promise<void>;
  prefs: NotificationPrefs;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>();

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
    }
  }

  async function submitNotice() {
    if (!title.trim() || !body.trim()) {
      Alert.alert('제목과 내용을 입력해주세요.');
      return;
    }

    try {
      const noticeTitle = title.trim();
      await onPublishNotice(noticeTitle, body.trim(), imageUri);
      setTitle('');
      setBody('');
      setImageUri(undefined);

      if (prefs.notice) {
        await sendLocalNotification('새 공지사항', noticeTitle);
      }
    } catch (error) {
      const message = error instanceof DatabaseError ? error.message : '공지사항을 등록하지 못했습니다.';
      Alert.alert('등록 실패', message);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {userRole === 'admin' ? (
        <View style={styles.adminComposer}>
          <View style={styles.composerHeader}>
            <Feather name="shield" size={18} color={colors.blue700} />
            <Text style={styles.composerTitle}>관리자 공지 작성</Text>
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
            <Pressable style={styles.secondaryButton} onPress={pickImage}>
              <Feather name="image" size={17} color={colors.blue700} />
              <Text style={styles.secondaryButtonText}>이미지</Text>
            </Pressable>
            <Pressable style={styles.publishButton} onPress={submitNotice}>
              <Feather name="send" size={17} color={colors.white} />
              <Text style={styles.publishButtonText}>등록</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <SectionHeader title="공지사항" />
      {notices.map((notice) => (
        <NoticeCard key={notice.id} notice={notice} />
      ))}
    </ScrollView>
  );
}

function NoticeCard({ notice, compact = false }: { notice: Notice; compact?: boolean }) {
  return (
    <View style={styles.noticeCard}>
      {notice.imageUri ? <Image source={{ uri: notice.imageUri }} style={styles.noticeImage} /> : null}
      <Text style={styles.noticeTitle}>{notice.title}</Text>
      {compact ? null : <Text style={styles.noticeBody}>{notice.body}</Text>}
      <View style={styles.noticeFooter}>
        <Text style={styles.noticeMeta}>{notice.author}</Text>
        <Text style={styles.noticeMeta}>{formatNoticeDate(notice.createdAt)}</Text>
      </View>
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
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
    </ScrollView>
  );
}

function ProfileScreen({
  user,
  reservationCount,
  passBalance,
  onLogout,
  onDeleteAccount
}: {
  user: User;
  reservationCount: number;
  passBalance: number;
  onLogout: () => void;
  onDeleteAccount: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Feather name={user.role === 'admin' ? 'shield' : 'user'} size={30} color={colors.white} />
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileName}>{user.name}</Text>
          <Text style={styles.profileMeta}>
            {providerMeta[user.provider].label.replace('로 시작', '')} · {user.role === 'admin' ? '관리자' : '회원'}
          </Text>
        </View>
      </View>

      <View style={styles.infoList}>
        <InfoRow icon="calendar" label={user.role === 'admin' ? '운영 변동' : '대체 예약'} value={`${reservationCount}개`} />
        {user.role === 'admin' ? (
          <InfoRow icon="users" label="예약 관리" value="홈에서 확인" />
        ) : (
          <InfoRow icon="credit-card" label="남은 횟수권" value={`${passBalance}회`} />
        )}
        <InfoRow icon="phone" label="휴대폰" value={formatPhoneNumber(user.phone)} />
        <InfoRow icon="phone" label="문의" value={CONTACT_PHONE} onPress={callContact} />
        <InfoRow icon="smartphone" label="앱 버전" value={Platform.OS === 'ios' ? 'iOS 테스트' : '모바일 테스트'} />
      </View>

      <Pressable style={styles.logoutButton} onPress={onLogout}>
        <Feather name="log-out" size={18} color={colors.danger} />
        <Text style={styles.logoutText}>로그아웃</Text>
      </Pressable>

      <Pressable style={styles.deleteAccountButton} onPress={onDeleteAccount}>
        <Feather name="trash-2" size={18} color={colors.danger} />
        <Text style={styles.deleteAccountText}>계정 삭제</Text>
      </Pressable>
    </ScrollView>
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
  header: {
    backgroundColor: colors.blue900,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16
  },
  headerBrand: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  headerLogoImage: {
    width: 74,
    height: 56
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
    fontSize: 24,
    fontWeight: '800',
    maxWidth: 210
  },
  contactButton: {
    minWidth: 56,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.blue200,
    paddingHorizontal: 10
  },
  contactButtonText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 14,
    fontWeight: '900'
  },
  content: {
    flex: 1
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 104,
    gap: 14
  },
  loginSafeArea: {
    flex: 1,
    backgroundColor: colors.blue900
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 12
  },
  roleSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
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
    backgroundColor: colors.blue900
  },
  roleButtonText: {
    ...type.bold,
    color: colors.blue700,
    fontWeight: '800'
  },
  roleButtonTextActive: {
    color: colors.white
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
    backgroundColor: colors.blue900,
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
    backgroundColor: colors.blue900,
    borderRadius: 8,
    padding: 22,
    gap: 18,
    ...shadows.soft
  },
  focusCard: {
    backgroundColor: colors.blue900,
    borderRadius: 8,
    padding: 22,
    gap: 18,
    ...shadows.soft
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  heroIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.aqua100,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroDots: {
    flexDirection: 'row',
    gap: 6
  },
  heroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.32)'
  },
  heroDotActive: {
    width: 22,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.aqua500
  },
  heroTitle: {
    ...type.extraBold,
    color: colors.white,
    fontSize: 30,
    fontWeight: '900',
    marginTop: 2
  },
  heroBody: {
    ...type.bold,
    color: colors.aqua100,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8
  },
  focusBadge: {
    ...type.extraBold,
    color: colors.aqua100,
    fontSize: 15,
    fontWeight: '900'
  },
  primaryButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  primaryButtonText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 16,
    fontWeight: '900'
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 14,
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
    gap: 8
  },
  summaryItem: {
    flex: 1,
    minHeight: 70,
    borderRadius: 8,
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
    fontSize: 22,
    fontWeight: '900'
  },
  summaryLabel: {
    ...type.bold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4
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
    fontSize: 20,
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 8
  },
  dayPill: {
    width: 54,
    height: 54,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dayPillActive: {
    backgroundColor: colors.blue900,
    borderColor: colors.blue900
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
    color: colors.white
  },
  slotList: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 104,
    gap: 10
  },
  passSummary: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
    fontSize: 25,
    fontWeight: '900'
  },
  passSummaryBadge: {
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: colors.aqua100,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12
  },
  passSummaryBadgeText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 13,
    fontWeight: '900'
  },
  slotCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadows.card
  },
  slotCardReserved: {
    borderColor: colors.blue700,
    backgroundColor: colors.blue50
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
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.blue900,
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
  cancelButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.danger
  },
  cancelButtonText: {
    color: colors.danger
  },
  waitButton: {
    backgroundColor: colors.aqua100
  },
  waitButtonText: {
    ...type.bold,
    color: colors.blue800,
    fontSize: 13
  },
  secondaryActionButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  secondaryActionText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 14,
    fontWeight: '900'
  },
  requestCard: {
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
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
  requestApproveButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.blue900,
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
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#F3C5C5',
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
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 10
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
    borderRadius: 8,
    backgroundColor: colors.blue50
  },
  feedbackImageCompact: {
    height: 132
  },
  feedbackVideoButton: {
    minHeight: 76,
    borderRadius: 8,
    backgroundColor: colors.blue900,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  feedbackVideoButtonCompact: {
    minHeight: 52
  },
  feedbackVideoText: {
    ...type.extraBold,
    color: colors.white,
    fontSize: 14,
    fontWeight: '900'
  },
  feedbackTargetList: {
    gap: 8,
    paddingVertical: 2
  },
  feedbackTargetChip: {
    width: 132,
    minHeight: 78,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    gap: 4
  },
  feedbackTargetChipActive: {
    backgroundColor: colors.blue900,
    borderColor: colors.blue900
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
    borderRadius: 8,
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
    borderRadius: 8,
    backgroundColor: colors.blue50
  },
  specialLessonPosterPreview: {
    width: '100%',
    height: 156,
    borderRadius: 8,
    backgroundColor: colors.white
  },
  specialStatusBadge: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 12,
    fontWeight: '900',
    backgroundColor: colors.aqua100,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    overflow: 'hidden'
  },
  specialStatusBadgeApproved: {
    color: colors.white,
    backgroundColor: colors.success
  },
  adminOverview: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
    ...shadows.card
  },
  adminOverviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  adminOverviewTitle: {
    ...type.extraBold,
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900'
  },
  adminOverviewCount: {
    ...type.bold,
    color: colors.blue700,
    fontSize: 13,
    fontWeight: '800'
  },
  emptyState: {
    minHeight: 76,
    borderRadius: 8,
    backgroundColor: colors.blue50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  emptyStateText: {
    ...type.bold,
    color: colors.blue700,
    fontSize: 14,
    fontWeight: '800'
  },
  adminReservationRow: {
    minHeight: 66,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  adminScheduleRow: {
    minHeight: 76,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  calendarGrid: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.white
  },
  calendarRow: {
    flexDirection: 'row'
  },
  calendarFrame: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.white
  },
  calendarPinnedHeader: {
    flexDirection: 'row',
    backgroundColor: colors.blue900,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineStrong
  },
  calendarHorizontalScroll: {
    flex: 1
  },
  calendarDateHeaderRow: {
    flexDirection: 'row'
  },
  calendarBodyScroll: {
    maxHeight: 560
  },
  calendarBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  calendarTimeColumn: {
    width: 64,
    backgroundColor: colors.blue50
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
    backgroundColor: colors.blue900,
    borderColor: colors.blue900
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
    backgroundColor: colors.blue900,
    borderColor: colors.blue900
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
  calendarTimeCell: {
    width: 64,
    minHeight: 152,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.blue50,
    alignItems: 'center',
    justifyContent: 'center'
  },
  calendarHeaderTimeCell: {
    minHeight: 58
  },
  calendarTimeText: {
    ...type.extraBold,
    color: colors.blue800,
    fontSize: 13,
    fontWeight: '900'
  },
  calendarDateHeaderCell: {
    width: 158,
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.blue900,
    justifyContent: 'center'
  },
  calendarDateText: {
    ...type.extraBold,
    color: colors.white,
    fontSize: 15,
    fontWeight: '900'
  },
  calendarWeekdayText: {
    ...type.bold,
    color: colors.aqua100,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2
  },
  calendarSlotCell: {
    width: 158,
    minHeight: 152,
    padding: 10,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    gap: 7
  },
  calendarAssignedSlotCell: {
    backgroundColor: colors.white,
    borderLeftWidth: 3,
    borderLeftColor: colors.blue700
  },
  calendarUnassignedSlotCell: {
    backgroundColor: '#FBFDFF',
    borderStyle: 'dashed'
  },
  calendarClosedSlotCell: {
    backgroundColor: '#F1F5F7',
    borderStyle: 'dashed',
    opacity: 0.9
  },
  calendarEmptySlotCell: {
    backgroundColor: colors.white
  },
  calendarOpenSlotCell: {
    backgroundColor: colors.blue50
  },
  calendarBookedSlotCell: {
    borderColor: colors.lineStrong
  },
  calendarCellTopRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  calendarInstructorBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  calendarInstructorChip: {
    ...type.extraBold,
    flex: 1,
    minWidth: 0,
    alignSelf: 'flex-start',
    color: colors.blue800,
    fontSize: 11,
    fontWeight: '900',
    backgroundColor: colors.aqua100,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4
  },
  calendarDurationChip: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 10,
    fontWeight: '900',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.blue200,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    overflow: 'hidden'
  },
  calendarAssignmentBadge: {
    ...type.extraBold,
    color: colors.white,
    fontSize: 10,
    fontWeight: '900',
    backgroundColor: colors.blue900,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    overflow: 'hidden'
  },
  calendarAssignmentBadgeEmpty: {
    color: colors.blue700,
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue200
  },
  calendarAssignmentBadgeClosed: {
    color: colors.muted,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.lineStrong
  },
  calendarInstructorText: {
    ...type.extraBold,
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900'
  },
  calendarCapacityText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 12,
    fontWeight: '900'
  },
  calendarMemberLines: {
    flex: 1,
    gap: 3
  },
  calendarCapacitySelector: {
    flexDirection: 'row',
    gap: 4
  },
  calendarCapacityButton: {
    flex: 1,
    minHeight: 28,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center'
  },
  calendarCapacityButtonActive: {
    backgroundColor: colors.blue900,
    borderColor: colors.blue900
  },
  calendarCapacityButtonText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 10,
    fontWeight: '900'
  },
  calendarCapacityButtonTextActive: {
    color: colors.white
  },
  calendarMemberText: {
    ...type.bold,
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  calendarSubstituteRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  calendarSubstituteName: {
    flex: 1,
    minWidth: 0
  },
  calendarInlineCancelButton: {
    width: 22,
    height: 22,
    borderRadius: 8,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#F3C5C5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  calendarMemberPrimaryText: {
    ...type.extraBold,
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
  calendarUnassignedTitle: {
    ...type.extraBold,
    color: colors.muted,
    fontSize: 15,
    fontWeight: '900'
  },
  calendarCellFooter: {
    minHeight: 30,
    gap: 6
  },
  calendarCellActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  calendarOpenSeatText: {
    ...type.bold,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800'
  },
  calendarOpenSeatActiveText: {
    color: colors.blue700
  },
  calendarEditButton: {
    flex: 1,
    minHeight: 28,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7
  },
  calendarEditButtonText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 11,
    fontWeight: '900'
  },
  calendarAssignButton: {
    flex: 1,
    minHeight: 28,
    borderRadius: 8,
    backgroundColor: colors.aqua100,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5
  },
  calendarAssignButtonActive: {
    backgroundColor: '#FFF5F5',
    borderColor: '#F3C5C5'
  },
  calendarAssignButtonText: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 10,
    fontWeight: '900'
  },
  calendarAssignButtonTextActive: {
    color: colors.danger
  },
  calendarDeleteButton: {
    flex: 1,
    minHeight: 28,
    borderRadius: 8,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#F3C5C5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7
  },
  calendarDeleteButtonText: {
    ...type.extraBold,
    color: colors.danger,
    fontSize: 11,
    fontWeight: '900'
  },
  calendarInstructorInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    height: 34,
    paddingHorizontal: 8,
    fontSize: 12
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
    backgroundColor: colors.blue900,
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
    backgroundColor: colors.blue900,
    borderColor: colors.blue900
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
    paddingHorizontal: 8
  },
  memberAdjustButtonDanger: {
    backgroundColor: colors.white,
    borderColor: '#F3C5C5'
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
    backgroundColor: colors.blue900,
    borderColor: colors.blue900
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
    borderRadius: 8,
    padding: 16,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    ...type.regular,
    color: colors.ink,
    fontSize: 15,
    backgroundColor: colors.surface
  },
  multilineInput: {
    minHeight: 104,
    paddingTop: 12,
    textAlignVertical: 'top'
  },
  previewImage: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    backgroundColor: colors.blue50
  },
  composerActions: {
    flexDirection: 'row',
    gap: 10
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
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
    borderRadius: 8,
    backgroundColor: colors.blue900,
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
  noticeCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8,
    ...shadows.card
  },
  noticeImage: {
    width: '100%',
    height: 170,
    borderRadius: 8,
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
  alertHero: {
    backgroundColor: colors.blue900,
    borderRadius: 8,
    padding: 18,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...shadows.card
  },
  preferenceIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
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
    borderRadius: 8,
    backgroundColor: colors.blue900,
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
    borderRadius: 8,
    padding: 18,
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
    borderRadius: 8,
    backgroundColor: colors.blue900,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadows.card
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
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#F3C5C5',
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
    borderRadius: 8,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#F3C5C5',
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
    left: 14,
    right: 14,
    bottom: 12,
    minHeight: 70,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    padding: 7,
    gap: 6,
    ...shadows.soft
  },
  tabItem: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3
  },
  tabItemActive: {
    backgroundColor: colors.blue900
  },
  tabLabel: {
    ...type.extraBold,
    color: colors.blue700,
    fontSize: 11,
    fontWeight: '900'
  },
  tabLabelActive: {
    color: colors.white
  }
});
