import { ClassSlot, DayOption, NotificationPrefs, Notice, ReservationPerson, User } from './types';

export const CURRENT_SCHEDULE_VERSION = 5;

export const DAYS: DayOption[] = [
  { id: 'mon', label: '월요일', shortLabel: '월' },
  { id: 'tue', label: '화요일', shortLabel: '화' },
  { id: 'wed', label: '수요일', shortLabel: '수' },
  { id: 'thu', label: '목요일', shortLabel: '목' },
  { id: 'fri', label: '금요일', shortLabel: '금' },
  { id: 'sat', label: '토요일', shortLabel: '토' },
  { id: 'sun', label: '일요일', shortLabel: '일' }
];

const WEEKDAY_HOURS = Array.from({ length: 18 }, (_, index) => index + 6);
const WEEKEND_HOURS = Array.from({ length: 10 }, (_, index) => index + 9);

function isWeekend(dayId: DayOption['id']) {
  return dayId === 'sat' || dayId === 'sun';
}

function getHoursForDay(dayId: DayOption['id']) {
  return isWeekend(dayId) ? WEEKEND_HOURS : WEEKDAY_HOURS;
}

function getInstructor(dayId: DayOption['id'], hour: number) {
  if (isWeekend(dayId)) {
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

export const defaultPrefs: NotificationPrefs = {
  classSoon: true,
  reservation: true,
  notice: true,
  attendance: true,
  classChange: true,
  rebook: true
};

export function createInitialSlots(): ClassSlot[] {
  return DAYS.flatMap((day, dayIndex) =>
    getHoursForDay(day.id).map((hour, hourIndex) => {
      return {
        id: `${day.id}-${hour}`,
        day: day.id,
        hour,
        instructor: getInstructor(day.id, hour),
        reservedBy: null,
        waitlist: []
      };
    })
  );
}

function createLegacyReservation(user?: User | null): ReservationPerson {
  return {
    userId: user?.id ?? 'legacy-member',
    userName: user?.name ?? '회원',
    createdAt: new Date().toISOString()
  };
}

export function mergeSlotsWithCurrentSchedule(savedSlots?: ClassSlot[], user?: User | null) {
  const savedById = new Map((savedSlots ?? []).map((slot) => [slot.id, slot]));

  return createInitialSlots().map((slot) => {
    const saved = savedById.get(slot.id) as (ClassSlot & { reservedByMe?: boolean; waitlist?: number | ReservationPerson[] }) | undefined;

    return {
      ...slot,
      reservedBy: saved?.reservedBy ?? (saved?.reservedByMe ? createLegacyReservation(user) : null),
      waitlist: Array.isArray(saved?.waitlist) ? saved.waitlist : []
    };
  });
}

export function slotsMatchCurrentSchedule(slots: ClassSlot[]) {
  const currentSlots = createInitialSlots();
  const currentById = new Map(currentSlots.map((slot) => [slot.id, slot]));

  if (slots.length !== currentSlots.length) {
    return false;
  }

  return slots.every((slot) => {
    const current = currentById.get(slot.id);
    return current?.instructor === slot.instructor;
  });
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
    title: '예약 운영 안내',
    body: '한 타임은 한 회원이 예약하면 마감됩니다. 이미 예약된 시간은 대기 등록을 이용해주세요.',
    author: '관리자',
    createdAt: new Date('2026-06-08T11:30:00+09:00').toISOString()
  }
];
