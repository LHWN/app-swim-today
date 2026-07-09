import { ClassSlot, DayId, DayOption, NotificationPrefs, Notice } from './types';

export const CURRENT_SCHEDULE_VERSION = 6;
export const DISPLAY_DAYS = 14;
export const SYNC_DAYS = 30;
export const SYNC_PAST_DAYS = 30;
export const APP_TIME_ZONE = 'Asia/Seoul';

export const DAYS: Array<{ id: DayId; label: string; shortLabel: string }> = [
  { id: 'mon', label: '월요일', shortLabel: '월' },
  { id: 'tue', label: '화요일', shortLabel: '화' },
  { id: 'wed', label: '수요일', shortLabel: '수' },
  { id: 'thu', label: '목요일', shortLabel: '목' },
  { id: 'fri', label: '금요일', shortLabel: '금' },
  { id: 'sat', label: '토요일', shortLabel: '토' },
  { id: 'sun', label: '일요일', shortLabel: '일' }
];

const POOL_HOURS = Array.from({ length: 18 }, (_, index) => index + 5);
const WEEKDAY_HOURS = POOL_HOURS;
const WEEKEND_HOURS = POOL_HOURS;

const datePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const weekdayFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: APP_TIME_ZONE,
  weekday: 'short'
});

const dateLabelFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: APP_TIME_ZONE,
  month: 'long',
  day: 'numeric',
  weekday: 'short'
});

const shortDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: APP_TIME_ZONE,
  month: 'numeric',
  day: 'numeric'
});

const hourFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

export const defaultPrefs: NotificationPrefs = {
  classSoon: true,
  reservation: true,
  notice: true,
  attendance: true,
  classChange: true,
  rebook: true
};

export function getDateKey(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;

  return datePartsFormatter.format(date);
}

export function getTodayKey() {
  return getDateKey(new Date());
}

export function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 0, 0, 0));

  return getDateKey(date);
}

export function formatSlotHour(startsAt: string) {
  return hourFormatter.format(new Date(startsAt));
}

export function getSlotTimeParts(startsAt: string) {
  const [hourText, minuteText] = formatSlotHour(startsAt).split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0
  };
}

export function formatSlotDate(startsAt: string) {
  return dateLabelFormatter.format(new Date(startsAt));
}

export function formatShortSlotDate(startsAt: string) {
  return shortDateFormatter.format(new Date(startsAt));
}

export function getSlotWeekday(startsAt: string) {
  return weekdayFormatter.format(new Date(startsAt));
}

export function getWeekdayLabel(weekday: number) {
  return DAYS[weekday - 1]?.label ?? '';
}

export function getWeekdayShortLabel(weekday: number) {
  return DAYS[weekday - 1]?.shortLabel ?? '';
}

export function getDateOptions(slots: ClassSlot[]): DayOption[] {
  const seen = new Set<string>();

  return slots.reduce<DayOption[]>((options, slot) => {
    if (seen.has(slot.date)) {
      return options;
    }

    seen.add(slot.date);
    options.push({
      id: slot.date,
      label: slot.dateLabel,
      shortLabel: slot.weekdayLabel,
      caption: slot.shortDateLabel
    });

    return options;
  }, []);
}

export function sortSlotsByStartsAt(a: ClassSlot, b: ClassSlot) {
  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
}

export function createSlotFromRemote({
  id,
  startsAt,
  instructor,
  capacity,
  durationMinutes = 60,
  isActive = true
}: {
  id: string;
  startsAt: string;
  instructor: string;
  capacity: number;
  durationMinutes?: number;
  isActive?: boolean;
}): ClassSlot {
  const timeParts = getSlotTimeParts(startsAt);

  return {
    id,
    date: getDateKey(startsAt),
    dateLabel: formatSlotDate(startsAt),
    shortDateLabel: formatShortSlotDate(startsAt),
    weekdayLabel: getSlotWeekday(startsAt),
    hour: timeParts.hour,
    minute: timeParts.minute,
    startMinutes: timeParts.hour * 60 + timeParts.minute,
    startsAt,
    instructor,
    capacity,
    durationMinutes,
    isActive,
    fixedLessonIds: [],
    fixedMembers: [],
    absences: [],
    substitutes: [],
    openSeatCount: 0,
    fixedLessonId: null,
    fixedMember: null,
    absence: null,
    substituteBy: null,
    reservedBy: null,
    waitlist: []
  };
}

export function createInitialSlots(): ClassSlot[] {
  const today = getTodayKey();

  return Array.from({ length: DISPLAY_DAYS }, (_, dayOffset) => addDays(today, dayOffset)).flatMap((dateKey) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const weekend = dayOfWeek === 0 || dayOfWeek === 6;
    const hours = weekend ? WEEKEND_HOURS : WEEKDAY_HOURS;

    return hours.map((hour) => {
      const startsAt = new Date(Date.UTC(year, month - 1, day, hour - 9, 0, 0)).toISOString();
      const instructor = getInstructor(startsAt);

      return createSlotFromRemote({
        id: `local-${dateKey}-${hour}`,
        startsAt,
        instructor,
        capacity: 1,
        isActive: false
      });
    });
  });
}

function getInstructor(startsAt: string) {
  const date = new Date(startsAt);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIME_ZONE, weekday: 'short' }).format(date);
  const { hour } = getSlotTimeParts(startsAt);
  const weekend = weekday === 'Sat' || weekday === 'Sun';

  if (weekend) {
    return hour <= 13 ? '신준혁' : '이혜원';
  }

  if (hour <= 8) {
    return '김성대';
  }

  if (hour <= 16) {
    return '이민기';
  }

  if (hour <= 18) {
    return '대표님';
  }

  return '한승빈';
}

export const initialNotices: Notice[] = [
  {
    id: 'notice-water-quality',
    title: '6월 수질 점검 일정 안내',
    body: '매주 수요일 13:00-14:00에는 정기 수질 점검이 진행됩니다. 해당 시간 수업은 정상 운영됩니다.',
    author: '관리자',
    createdAt: new Date('2026-06-10T09:00:00+09:00').toISOString()
  },
  {
    id: 'notice-small-lesson',
    title: '대체 예약 운영 안내',
    body: '고정 수업 회원이 결석 처리한 시간만 빈자리로 열립니다. 열린 시간은 다른 회원이 대체 예약할 수 있습니다.',
    author: '관리자',
    createdAt: new Date('2026-06-08T11:30:00+09:00').toISOString()
  }
];
