import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
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
  DAYS,
  defaultPrefs,
  initialNotices,
  mergeSlotsWithCurrentSchedule,
  slotsMatchCurrentSchedule
} from './src/data';
import { sendLocalNotification } from './src/notifications';
import {
  AuthProvider,
  ClassSlot,
  DayId,
  NotificationKey,
  NotificationPrefs,
  Notice,
  ReservationPerson,
  TabId,
  User,
  UserRole
} from './src/types';

const STORAGE_KEY = 'oneuldo-swim-state-v3';
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
  { id: 'reserve', label: '예약', icon: 'calendar' },
  { id: 'notices', label: '공지', icon: 'bell' },
  { id: 'alerts', label: '알림', icon: 'toggle-right' },
  { id: 'profile', label: '내정보', icon: 'user' }
];

interface PersistedState {
  scheduleVersion?: number;
  user: User | null;
  slots: ClassSlot[];
  notices: Notice[];
  prefs: NotificationPrefs;
  passBalance?: number;
  passBalances?: Record<string, number>;
}

function getTodayId(): DayId {
  const day = new Date().getDay();
  return DAYS[(day + 6) % 7].id;
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`;
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

function createReservationPerson(user: User): ReservationPerson {
  return {
    userId: user.id,
    userName: user.name,
    createdAt: new Date().toISOString()
  };
}

function isReservedByUser(slot: ClassSlot, user?: User | null) {
  return Boolean(user && slot.reservedBy?.userId === user.id);
}

function isWaitlistedByUser(slot: ClassSlot, user?: User | null) {
  return Boolean(user && slot.waitlist.some((person) => person.userId === user.id));
}

function sortSlotsByDayAndHour(a: ClassSlot, b: ClassSlot) {
  return DAYS.findIndex((day) => day.id === a.day) - DAYS.findIndex((day) => day.id === b.day) || a.hour - b.hour;
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
  const [selectedDay, setSelectedDay] = useState<DayId>(getTodayId());
  const [slots, setSlots] = useState<ClassSlot[]>(createInitialSlots);
  const [notices, setNotices] = useState<Notice[]>(initialNotices);
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [passBalance, setPassBalance] = useState(DEFAULT_PASS_BALANCE);
  const [passBalances, setPassBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    async function hydrate() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedState;
          const migratedSlots = mergeSlotsWithCurrentSchedule(parsed.slots, parsed.user);
          const migratedPassBalance =
            parsed.passBalance ??
            Math.max(0, DEFAULT_PASS_BALANCE - migratedSlots.filter((slot) => isReservedByUser(slot, parsed.user)).length);
          const migratedPassBalances = parsed.passBalances ?? (parsed.user ? { [parsed.user.id]: migratedPassBalance } : {});
          setUser(parsed.user);
          setSlots(migratedSlots);
          setNotices(mergeNoticesWithCurrentDefaults(parsed.notices));
          setPrefs({ ...defaultPrefs, ...parsed.prefs });
          setPassBalances(migratedPassBalances);
          setPassBalance(parsed.user ? migratedPassBalances[parsed.user.id] ?? migratedPassBalance : DEFAULT_PASS_BALANCE);
        }
      } catch {
        Alert.alert('저장된 데이터를 불러오지 못했습니다.');
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

    const state: PersistedState = { scheduleVersion: CURRENT_SCHEDULE_VERSION, user, slots, notices, prefs, passBalance };
    state.passBalances = passBalances;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {
      Alert.alert('변경 내용을 저장하지 못했습니다.');
    });
  }, [hydrated, user, slots, notices, prefs, passBalance, passBalances]);

  useEffect(() => {
    if (!user || user.role === 'admin') {
      setPassBalance(DEFAULT_PASS_BALANCE);
      return;
    }

    setPassBalance(passBalances[user.id] ?? DEFAULT_PASS_BALANCE);
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!slotsMatchCurrentSchedule(slots)) {
      setSlots((current) => mergeSlotsWithCurrentSchedule(current, user));
    }
  }, [slots, user]);

  const myReservations = useMemo(
    () => slots.filter((slot) => isReservedByUser(slot, user)).sort(sortSlotsByDayAndHour),
    [slots, user]
  );

  const nextClass = myReservations[0];
  const reservedSlots = useMemo(() => slots.filter((slot) => slot.reservedBy).sort(sortSlotsByDayAndHour), [slots]);

  const setCurrentPassBalance: React.Dispatch<React.SetStateAction<number>> = (value) => {
    setPassBalance((current) => {
      const next = typeof value === 'function' ? (value as (previous: number) => number)(current) : value;

      if (user?.role === 'member') {
        setPassBalances((currentBalances) => ({
          ...currentBalances,
          [user.id]: next
        }));
      }

      return next;
    });
  };

  if (showLaunchScreen || !hydrated || !fontsLoaded) {
    return <LaunchScreen />;
  }

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
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
            <Feather name="phone" size={22} color={colors.blue700} />
          </Pressable>
        </View>

        <View style={styles.content}>
          {activeTab === 'home' ? (
            <HomeScreen
              userRole={user.role}
              nextClass={nextClass}
              notices={notices}
              myReservations={myReservations}
              slots={slots}
              passBalance={passBalance}
              onReservePress={() => setActiveTab('reserve')}
              onNoticePress={() => setActiveTab('notices')}
            />
          ) : null}

          {activeTab === 'reserve' ? (
            <ReserveScreen
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              user={user}
              slots={slots}
              setSlots={setSlots}
              passBalance={passBalance}
              setPassBalance={setCurrentPassBalance}
              prefs={prefs}
            />
          ) : null}

          {activeTab === 'notices' ? (
            <NoticesScreen userRole={user.role} notices={notices} setNotices={setNotices} prefs={prefs} />
          ) : null}

          {activeTab === 'alerts' ? <AlertsScreen prefs={prefs} setPrefs={setPrefs} /> : null}

          {activeTab === 'profile' ? (
            <ProfileScreen
              user={user}
              reservationCount={user.role === 'admin' ? reservedSlots.length : myReservations.length}
              passBalance={passBalance}
              onLogout={() => {
                setUser(null);
                setActiveTab('home');
              }}
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

function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [role, setRole] = useState<UserRole>('member');
  const [displayName, setDisplayName] = useState('회원');

  function selectRole(nextRole: UserRole) {
    setRole(nextRole);
    setDisplayName((current) => {
      if (!current.trim() || current === '회원' || current === '관리자') {
        return nextRole === 'admin' ? '관리자' : '회원';
      }

      return current;
    });
  }

  function signIn(provider: AuthProvider) {
    const providerName = providerMeta[provider].label.replace('로 시작', '');
    const normalizedName = displayName.trim() || (role === 'admin' ? '관리자' : '회원');
    const normalizedId = normalizedName.replace(/\s+/g, '-');
    onLogin({
      id: role === 'admin' ? 'admin' : `${provider}-${normalizedId}`,
      name: normalizedName,
      provider,
      role
    });

    if (role === 'admin') {
      Alert.alert('관리자 모드', '공지사항 작성 권한이 활성화되었습니다.');
    } else {
      Alert.alert('가입 완료', `${providerName} 계정으로 로그인했습니다.`);
    }
  }

  return (
    <SafeAreaView style={styles.loginSafeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.loginHero}>
        <Image source={logoOnNavyImage} style={styles.loginHeroImage} resizeMode="contain" />
        <Text style={styles.loginTitle}>오늘도수영</Text>
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
          <Pressable style={[styles.roleButton, role === 'member' && styles.roleButtonActive]} onPress={() => selectRole('member')}>
            <Feather name="user" size={17} color={role === 'member' ? colors.white : colors.blue700} />
            <Text style={[styles.roleButtonText, role === 'member' && styles.roleButtonTextActive]}>회원</Text>
          </Pressable>
          <Pressable style={[styles.roleButton, role === 'admin' && styles.roleButtonActive]} onPress={() => selectRole('admin')}>
            <Feather name="shield" size={17} color={role === 'admin' ? colors.white : colors.blue700} />
            <Text style={[styles.roleButtonText, role === 'admin' && styles.roleButtonTextActive]}>관리자</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          placeholder={role === 'admin' ? '관리자 이름' : '회원 이름'}
          placeholderTextColor={colors.muted}
          value={displayName}
          onChangeText={setDisplayName}
          returnKeyType="done"
        />

        {(Object.keys(providerMeta) as AuthProvider[]).map((provider) => {
          const meta = providerMeta[provider];
          return (
            <Pressable
              key={provider}
              style={[
                styles.ssoButton,
                { backgroundColor: meta.color },
                provider === 'google' && styles.googleButton
              ]}
              onPress={() => signIn(provider)}
            >
              <Text style={[styles.ssoButtonText, { color: meta.textColor }]}>{meta.label}</Text>
            </Pressable>
          );
        })}

        <Pressable style={styles.phoneLink} onPress={callContact}>
          <Feather name="phone-call" size={16} color={colors.blue700} />
          <Text style={styles.phoneLinkText}>문의 {CONTACT_PHONE}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function HomeScreen({
  userRole,
  nextClass,
  notices,
  myReservations,
  slots,
  passBalance,
  onReservePress,
  onNoticePress
}: {
  userRole: UserRole;
  nextClass?: ClassSlot;
  notices: Notice[];
  myReservations: ClassSlot[];
  slots: ClassSlot[];
  passBalance: number;
  onReservePress: () => void;
  onNoticePress: () => void;
}) {
  const isAdmin = userRole === 'admin';
  const reservedSlots = slots.filter((slot) => slot.reservedBy).sort(sortSlotsByDayAndHour);
  const waitlistCount = slots.reduce((count, slot) => count + slot.waitlist.length, 0);
  const heroIcon = isAdmin ? 'users' : nextClass ? 'calendar' : 'plus-circle';

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroIconBadge}>
            <Feather name={heroIcon} size={24} color={colors.blue900} />
          </View>
          <View style={styles.heroDots}>
            <View style={styles.heroDotActive} />
            <View style={styles.heroDot} />
            <View style={styles.heroDot} />
          </View>
        </View>
        <View>
          <Text style={styles.heroTitle}>
            {isAdmin
              ? `확정 ${reservedSlots.length}건`
              : nextClass
                ? `${getDayLabel(nextClass.day)} ${formatHour(nextClass.hour)}`
                : '예약한 수업이 없습니다'}
          </Text>
          <Text style={styles.heroBody}>
            {isAdmin
              ? `대기 ${waitlistCount}명`
              : nextClass
                ? `${nextClass.instructor} 강사 수업`
                : '시간 선택'}
          </Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={onReservePress}>
          <Feather name="calendar" size={18} color={colors.blue700} />
          <Text style={styles.primaryButtonText}>{isAdmin ? '표' : '예약'}</Text>
        </Pressable>
      </View>

      <View style={styles.metricsGrid}>
        {isAdmin ? (
          <>
            <MetricCard label="확정 예약" value={`${reservedSlots.length}건`} icon="check-circle" />
            <MetricCard label="대기 인원" value={`${waitlistCount}명`} icon="users" />
            <MetricCard label="운영" value="06-23" icon="clock" />
          </>
        ) : (
          <>
            <MetricCard label="내 예약" value={`${myReservations.length}개`} icon="check-circle" />
            <MetricCard label="남은 횟수" value={`${passBalance}회`} icon="credit-card" />
            <MetricCard label="운영" value="06-23" icon="clock" />
          </>
        )}
      </View>

      {isAdmin ? <AdminReservationOverview slots={reservedSlots} /> : null}

      <SectionHeader title="최근 공지" actionLabel="전체" onAction={onNoticePress} />
      {notices.slice(0, 2).map((notice) => (
        <NoticeCard key={notice.id} notice={notice} compact />
      ))}
    </ScrollView>
  );
}

function AdminReservationOverview({ slots }: { slots: ClassSlot[] }) {
  return (
    <View style={styles.adminOverview}>
      <View style={styles.adminOverviewHeader}>
        <Text style={styles.adminOverviewTitle}>회원 예약 목록</Text>
        <Text style={styles.adminOverviewCount}>{slots.length}건</Text>
      </View>

      {slots.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="calendar" size={22} color={colors.blue700} />
          <Text style={styles.emptyStateText}>아직 확정된 예약이 없습니다.</Text>
        </View>
      ) : (
        slots.map((slot) => (
          <View key={slot.id} style={styles.adminReservationRow}>
            <View style={styles.adminReservationTime}>
              <Text style={styles.adminReservationDay}>{getDayLabel(slot.day)}</Text>
              <Text style={styles.adminReservationHour}>{formatHour(slot.hour)}</Text>
            </View>
            <View style={styles.adminReservationCopy}>
              <Text style={styles.adminReservationName}>{slot.reservedBy?.userName ?? '회원'}</Text>
              <Text style={styles.adminReservationMeta}>
                {slot.instructor} 강사{slot.waitlist.length > 0 ? ` · 대기 ${slot.waitlist.length}명` : ''}
              </Text>
            </View>
          </View>
        ))
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
  selectedDay,
  setSelectedDay,
  user,
  slots,
  setSlots,
  passBalance,
  setPassBalance,
  prefs
}: {
  selectedDay: DayId;
  setSelectedDay: (day: DayId) => void;
  user: User;
  slots: ClassSlot[];
  setSlots: React.Dispatch<React.SetStateAction<ClassSlot[]>>;
  passBalance: number;
  setPassBalance: React.Dispatch<React.SetStateAction<number>>;
  prefs: NotificationPrefs;
}) {
  const daySlots = slots.filter((slot) => slot.day === selectedDay);
  const reservedCount = slots.filter((slot) => slot.reservedBy).length;

  function updateSlot(slotId: string, updater: (slot: ClassSlot) => ClassSlot) {
    setSlots((current) => current.map((slot) => (slot.id === slotId ? updater(slot) : slot)));
  }

  async function reserve(slot: ClassSlot) {
    if (user.role === 'admin') {
      Alert.alert('관리자 모드', '관리자는 홈 화면에서 회원별 예약 현황을 확인할 수 있습니다.');
      return;
    }

    const mine = isReservedByUser(slot, user);
    const waiting = isWaitlistedByUser(slot, user);

    if (mine) {
      updateSlot(slot.id, (target) => ({
        ...target,
        reservedBy: null
      }));
      setPassBalance((current) => current + 1);

      if (prefs.reservation) {
        await sendLocalNotification('예약 취소', `${getDayLabel(slot.day)} ${formatHour(slot.hour)} 수업 예약이 취소되었습니다. 횟수권 1회가 복구되었습니다.`);
      }
      return;
    }

    if (slot.reservedBy) {
      if (waiting) {
        updateSlot(slot.id, (target) => ({
          ...target,
          waitlist: target.waitlist.filter((person) => person.userId !== user.id)
        }));

        if (prefs.reservation) {
          await sendLocalNotification('대기 취소', `${getDayLabel(slot.day)} ${formatHour(slot.hour)} 수업 대기가 취소되었습니다.`);
        }
        return;
      }

      updateSlot(slot.id, (target) => ({
        ...target,
        waitlist: target.waitlist.some((person) => person.userId === user.id)
          ? target.waitlist
          : [...target.waitlist, createReservationPerson(user)]
      }));

      if (prefs.reservation) {
        await sendLocalNotification('대기 등록', `${getDayLabel(slot.day)} ${formatHour(slot.hour)} 수업은 예약 마감되어 대기 명단에 등록되었습니다.`);
      }
      return;
    }

    if (passBalance <= 0) {
      Alert.alert('남은 횟수가 없습니다', '횟수권을 충전한 뒤 예약할 수 있습니다.');
      return;
    }

    updateSlot(slot.id, (target) => ({
      ...target,
      reservedBy: createReservationPerson(user),
      waitlist: target.waitlist.filter((person) => person.userId !== user.id)
    }));
    setPassBalance((current) => Math.max(0, current - 1));

    if (prefs.reservation) {
      await sendLocalNotification('예약 확정', `${getDayLabel(slot.day)} ${formatHour(slot.hour)} 수업 예약이 완료되었습니다.`);
    }

    if (prefs.classSoon) {
      await sendLocalNotification('수업 리마인드', `${slot.instructor} 강사의 수업을 잊지 마세요.`);
    }
  }

  return (
    <View style={styles.screenBody}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daySelector}>
        {DAYS.map((day) => {
          const selected = selectedDay === day.id;
          return (
            <Pressable key={day.id} style={[styles.dayPill, selected && styles.dayPillActive]} onPress={() => setSelectedDay(day.id)}>
              <Text style={[styles.dayPillText, selected && styles.dayPillTextActive]}>{day.shortLabel}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.passSummary}>
        <View style={styles.passSummaryStat}>
          <Feather name={user.role === 'admin' ? 'check-circle' : 'credit-card'} size={22} color={colors.blue700} />
          <Text style={styles.passSummaryValue}>{user.role === 'admin' ? `${reservedCount}건` : `${passBalance}회`}</Text>
        </View>
        <View style={styles.passSummaryBadge}>
          <Feather name="lock" size={16} color={colors.blue700} />
          <Text style={styles.passSummaryBadgeText}>1</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.slotList} showsVerticalScrollIndicator={false}>
        {daySlots.map((slot) => {
          const mine = isReservedByUser(slot, user);
          const waiting = isWaitlistedByUser(slot, user);
          const isTaken = Boolean(slot.reservedBy);
          const noPass = user.role === 'member' && passBalance <= 0 && !mine && !isTaken;
          const waitlistCopy = slot.waitlist.length > 0 ? ` · 대기 ${slot.waitlist.length}명` : '';
          const slotMeta = slot.reservedBy ? `${slot.reservedBy.userName}${waitlistCopy}` : `가능${waitlistCopy}`;
          const buttonLabel = user.role === 'admin' ? '확인' : mine ? '취소' : isTaken && waiting ? '대기취소' : isTaken ? '대기' : noPass ? '횟수' : '예약';
          const statusColor = mine ? colors.success : waiting ? colors.warning : isTaken ? colors.blue600 : colors.aqua500;
          return (
            <View key={slot.id} style={[styles.slotCard, mine && styles.slotCardReserved]}>
              <View style={styles.slotTimeBlock}>
                <Text style={styles.slotTime}>{formatHour(slot.hour)}</Text>
                <View style={[styles.slotStatusDot, { backgroundColor: statusColor }]} />
              </View>
              <View style={styles.slotDetails}>
                <Text style={styles.slotTitle}>{slot.instructor} 강사</Text>
                <View style={styles.slotMetaRow}>
                  <Feather name={isTaken ? 'user' : 'circle'} size={13} color={statusColor} />
                  <Text style={styles.slotMeta}>{slotMeta}</Text>
                  {waiting && !mine ? <Text style={styles.waitlistText}>내 대기</Text> : null}
                </View>
              </View>
              <Pressable
                style={[
                  styles.reserveButton,
                  (mine || (isTaken && waiting)) && styles.cancelButton,
                  ((isTaken && !waiting) || noPass || user.role === 'admin') && !mine && styles.waitButton
                ]}
                onPress={() => reserve(slot)}
                accessibilityLabel={buttonLabel}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.reserveButtonText,
                    (mine || (isTaken && waiting)) && styles.cancelButtonText,
                    ((isTaken && !waiting) || noPass || user.role === 'admin') && !mine && styles.waitButtonText
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
  setNotices,
  prefs
}: {
  userRole: UserRole;
  notices: Notice[];
  setNotices: React.Dispatch<React.SetStateAction<Notice[]>>;
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

  async function publishNotice() {
    if (!title.trim() || !body.trim()) {
      Alert.alert('제목과 내용을 입력해주세요.');
      return;
    }

    const notice: Notice = {
      id: `notice-${Date.now()}`,
      title: title.trim(),
      body: body.trim(),
      author: '관리자',
      createdAt: new Date().toISOString(),
      imageUri
    };

    setNotices((current) => [notice, ...current]);
    setTitle('');
    setBody('');
    setImageUri(undefined);

    if (prefs.notice) {
      await sendLocalNotification('새 공지사항', notice.title);
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
            <Pressable style={styles.publishButton} onPress={publishNotice}>
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
  onLogout
}: {
  user: User;
  reservationCount: number;
  passBalance: number;
  onLogout: () => void;
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
        <InfoRow icon="calendar" label={user.role === 'admin' ? '확정 예약' : '이번 주 예약'} value={`${reservationCount}개`} />
        {user.role === 'admin' ? (
          <InfoRow icon="users" label="예약 관리" value="홈에서 확인" />
        ) : (
          <InfoRow icon="credit-card" label="남은 횟수권" value={`${passBalance}회`} />
        )}
        <InfoRow icon="phone" label="문의" value={CONTACT_PHONE} onPress={callContact} />
        <InfoRow icon="smartphone" label="앱 버전" value={Platform.OS === 'ios' ? 'iOS 테스트' : '모바일 테스트'} />
      </View>

      <Pressable style={styles.logoutButton} onPress={onLogout}>
        <Feather name="log-out" size={18} color={colors.danger} />
        <Text style={styles.logoutText}>로그아웃</Text>
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

function getDayLabel(dayId: DayId) {
  return DAYS.find((day) => day.id === dayId)?.label ?? '';
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
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.blue200
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
  loginHero: {
    flex: 1,
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
