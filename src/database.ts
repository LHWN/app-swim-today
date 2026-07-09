import { addDays, createSlotFromRemote, getTodayKey, getWeekdayLabel, SYNC_DAYS, SYNC_PAST_DAYS } from './data';
import { assertSupabaseConfig, supabase } from './supabase';
import {
  AbsenceAction,
  AuthProvider,
  ClassSlot,
  FixedLesson,
  InstructorLessonTime,
  LessonAbsenceRequest,
  LessonFeedback,
  LessonFeedbackMediaType,
  LessonFeedbackTarget,
  LessonAssignmentRequest,
  LessonAssignmentRequestType,
  LessonChangeRequest,
  LessonChangeRequestStatus,
  MemberRequest,
  MemberRequestStatus,
  MemberSummary,
  Notice,
  PassTransaction,
  ReservationAction,
  ReservationPerson,
  SpecialLesson,
  SpecialLessonRegistration,
  SpecialLessonRegistrationStatus,
  StoreOrder,
  StoreOrderStatus,
  StoreProduct,
  User,
  UserRole
} from './types';

const DEFAULT_PASS_BALANCE = 12;

function formatTimeLabel(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

interface ProfileRow {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  pass_balance: number;
  created_at: string;
}

interface ReservationSnapshotRow {
  slot_id: string;
  starts_at: string;
  instructor: string;
  capacity: number;
  duration_minutes: number;
  is_active: boolean;
  fixed_lesson_id: string | null;
  fixed_lesson_capacity: number | null;
  fixed_lesson_duration_minutes: number | null;
  fixed_user_id: string | null;
  fixed_user_name: string | null;
  absence_user_id: string | null;
  absence_user_name: string | null;
  absence_created_at: string | null;
  substitute_user_id: string | null;
  substitute_user_name: string | null;
  substitute_duration_minutes: number | null;
  substitute_created_at: string | null;
}

interface MemberSummaryRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  pass_balance: number;
  lesson_capacity: number;
  pass_total_count: number;
  pass_remaining_count: number;
  fixed_lesson_count: number;
  absence_count: number;
  substitute_reservation_count: number;
  reserved_count: number;
  waitlist_count: number;
  created_at: string;
}

interface FixedLessonRow {
  id: string;
  weekday: number;
  slot_hour: number;
  slot_minute: number;
  instructor: string;
  duration_minutes: number;
  lesson_capacity: number;
}

interface InstructorLessonTimeRow {
  id: string;
  instructor: string;
  weekday: number;
  slot_hour: number;
  slot_minute: number;
  created_at: string;
  updated_at: string;
}

interface NoticeRow {
  id: string;
  title: string;
  body: string;
  image_path: string | null;
  author: string;
  created_at: string;
}

interface PassTransactionRow {
  id: string;
  user_id: string;
  amount: number;
  balance_after: number;
  reason: string;
  reservation_id: string | null;
  created_by: string | null;
  created_at: string;
}

interface LessonChangeRequestRow {
  id: string;
  user_id: string;
  user_name: string;
  source_slot_id: string;
  source_starts_at: string;
  source_instructor: string;
  target_slot_id: string;
  target_starts_at: string;
  target_instructor: string;
  status: LessonChangeRequestStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
}

interface LessonAbsenceRequestRow {
  id: string;
  user_id: string;
  user_name: string;
  slot_id: string;
  starts_at: string;
  instructor: string;
  status: LessonChangeRequestStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
}

interface LessonAssignmentRequestRow {
  id: string;
  user_id: string;
  user_name: string;
  slot_id: string;
  starts_at: string;
  instructor: string;
  request_type: LessonAssignmentRequestType;
  status: LessonChangeRequestStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  review_comment: string;
}

interface LessonFeedbackRow {
  id: string;
  slot_id: string;
  user_id: string;
  user_name: string;
  starts_at: string;
  instructor: string;
  feedback_text: string;
  media_path: string | null;
  media_type: LessonFeedbackMediaType | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface LessonFeedbackTargetRow {
  slot_id: string;
  starts_at: string;
  instructor: string;
  duration_minutes: number;
  user_id: string;
  user_name: string;
  feedback_id: string | null;
  feedback_text: string | null;
  media_path: string | null;
  media_type: LessonFeedbackMediaType | null;
  feedback_created_at: string | null;
  feedback_updated_at: string | null;
}

interface SpecialLessonRow {
  id: string;
  title: string;
  description: string;
  image_path: string | null;
  starts_at: string;
  instructor: string;
  duration_minutes: number;
  capacity: number;
  is_active: boolean;
  application_count: number;
  approved_count: number;
  my_registration_id: string | null;
  my_status: SpecialLessonRegistrationStatus | null;
  my_queue_position: number | null;
  created_at: string;
}

interface SpecialLessonRegistrationRow {
  id: string;
  special_lesson_id: string;
  special_lesson_title: string;
  starts_at: string;
  instructor: string;
  capacity: number;
  user_id: string;
  user_name: string;
  status: SpecialLessonRegistrationStatus;
  queue_position: number;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
}

interface MemberRequestRow {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  body: string;
  status: MemberRequestStatus;
  admin_reply: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
}

interface StoreProductRow {
  id: string;
  name: string;
  description: string;
  image_path: string | null;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  created_at: string;
}

interface StoreOrderRow {
  id: string;
  product_id: string;
  product_name: string;
  user_id: string;
  user_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: StoreOrderStatus;
  admin_comment: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
}

export interface SignUpInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface PublishLessonFeedbackInput {
  slotId: string;
  userId: string;
  feedbackText: string;
  mediaUri?: string;
  mediaType?: LessonFeedbackMediaType;
}

export interface CreateSpecialLessonInput {
  title: string;
  description: string;
  imageUri?: string;
  startsAt: string;
  instructor: string;
  durationMinutes: number;
  capacity: number;
}

export interface UpdateSpecialLessonInput extends CreateSpecialLessonInput {
  id: string;
}

export interface CreateMemberRequestInput {
  title: string;
  body: string;
}

export interface CreateStoreProductInput {
  name: string;
  description: string;
  imageUri?: string;
  price: number;
  stockQuantity: number;
}

export interface SaveInstructorLessonTimeInput {
  id?: string | null;
  instructor: string;
  weekday: number;
  hour: number;
  minute: number;
}

export interface ReservationUpdate {
  action: ReservationAction;
  slots: ClassSlot[];
  user: User;
}

export interface AbsenceUpdate {
  action: AbsenceAction;
  slots: ClassSlot[];
  user: User;
  requests: LessonAbsenceRequest[];
}

export interface PublishNoticeInput {
  title: string;
  body: string;
  imageUri?: string;
}

export interface UpdateNoticeInput {
  id: string;
  title: string;
  body: string;
  imageUri?: string;
  replaceImage?: boolean;
}

export class DatabaseError extends Error {
  code:
    | 'EMAIL_EXISTS'
    | 'INVALID_CREDENTIALS'
    | 'INVALID_INPUT'
    | 'NO_PASS'
    | 'CONFIG'
    | 'CONFIRM_EMAIL'
    | 'FORBIDDEN'
    | 'UNKNOWN';

  constructor(
    code:
      | 'EMAIL_EXISTS'
      | 'INVALID_CREDENTIALS'
      | 'INVALID_INPUT'
      | 'NO_PASS'
      | 'CONFIG'
      | 'CONFIRM_EMAIL'
      | 'FORBIDDEN'
      | 'UNKNOWN',
    message: string
  ) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
  }
}

export async function initializeDatabase() {
  try {
    assertSupabaseConfig();
  } catch (error) {
    throw new DatabaseError('CONFIG', error instanceof Error ? error.message : 'Supabase 설정을 확인해주세요.');
  }
}

export async function getCurrentUser() {
  await initializeDatabase();

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw toDatabaseError(error.message);
  }

  if (!data.session?.user) {
    return null;
  }

  return getMemberById(data.session.user.id);
}

export async function signUp(input: SignUpInput) {
  await initializeDatabase();

  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const password = input.password;

  validateCredentials(name, email, phone, password);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        phone
      }
    }
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  if (!data.session?.user) {
    return null;
  }

  const user = await getMemberById(data.session.user.id);

  if (!user) {
    throw new DatabaseError('UNKNOWN', '가입 정보를 불러오지 못했습니다.');
  }

  return user;
}

export async function signIn(emailInput: string, password: string) {
  await initializeDatabase();

  const email = normalizeEmail(emailInput);

  if (!email || password.length < 1) {
    throw new DatabaseError('INVALID_INPUT', '이메일과 비밀번호를 입력해주세요.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  if (!data.user) {
    throw new DatabaseError('INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인해주세요.');
  }

  const user = await getMemberById(data.user.id);

  if (!user) {
    throw new DatabaseError('UNKNOWN', '회원 정보를 불러오지 못했습니다.');
  }

  return user;
}

export async function signOut() {
  await initializeDatabase();

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw toDatabaseError(error.message);
  }
}

export async function deleteAccount() {
  await initializeDatabase();

  const { error } = await supabase.functions.invoke('delete-account', {
    method: 'POST'
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  await supabase.auth.signOut();
}

export async function getMemberById(id: string) {
  await initializeDatabase();

  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,name,phone,role,pass_balance,created_at')
    .eq('id', id)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return data ? mapProfileRow(data) : null;
}

export async function getMemberSummaries() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_member_summaries').returns<MemberSummaryRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  const rows = (data ?? []) as MemberSummaryRow[];

  return rows.map<MemberSummary>((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    passBalance: row.pass_balance,
    lessonCapacity: row.lesson_capacity ?? 1,
    passTotalCount: row.pass_total_count ?? Math.max(row.pass_balance, 8),
    passRemainingCount: row.pass_remaining_count ?? row.pass_balance,
    fixedLessonCount: row.fixed_lesson_count,
    absenceCount: row.absence_count,
    substituteReservationCount: row.substitute_reservation_count,
    reservedCount: row.reserved_count,
    waitlistCount: row.waitlist_count,
    createdAt: row.created_at
  }));
}

export async function getMyFixedLessons() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_my_fixed_lessons').returns<FixedLessonRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return ((data ?? []) as FixedLessonRow[]).map<FixedLesson>((row) => ({
    id: row.id,
    weekday: row.weekday,
    weekdayLabel: getWeekdayLabel(row.weekday),
    hour: row.slot_hour,
    minute: row.slot_minute ?? 0,
    startMinutes: row.slot_hour * 60 + (row.slot_minute ?? 0),
    timeLabel: formatTimeLabel(row.slot_hour, row.slot_minute ?? 0),
    instructor: row.instructor,
    durationMinutes: row.duration_minutes ?? 60,
    lessonCapacity: row.lesson_capacity ?? 1
  }));
}

export async function getInstructorLessonTimes() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_instructor_lesson_times').returns<InstructorLessonTimeRow[]>();

  if (error) {
    const normalizedMessage = error.message.toLowerCase();

    if (
      normalizedMessage.includes('could not find the function') ||
      normalizedMessage.includes('schema cache') ||
      normalizedMessage.includes('does not exist')
    ) {
      return [];
    }

    throw toDatabaseError(error.message);
  }

  return ((data ?? []) as InstructorLessonTimeRow[]).map<InstructorLessonTime>((row) => ({
    id: row.id,
    instructor: row.instructor,
    weekday: row.weekday,
    weekdayLabel: getWeekdayLabel(row.weekday),
    hour: row.slot_hour,
    minute: row.slot_minute ?? 0,
    startMinutes: row.slot_hour * 60 + (row.slot_minute ?? 0),
    timeLabel: formatTimeLabel(row.slot_hour, row.slot_minute ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function getSlotsSnapshot(startDate: string, days: number) {
  await initializeDatabase();

  const { data, error } = await supabase
    .rpc('get_lesson_slots_snapshot', { p_start_date: startDate, p_days: days })
    .returns<ReservationSnapshotRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  const rows = (data ?? []) as ReservationSnapshotRow[];
  const slotsById = new Map<string, ClassSlot>();

  rows.forEach((row) => {
    const existingSlot = slotsById.get(row.slot_id);
    const slot =
      existingSlot ??
      createSlotFromRemote({
        id: row.slot_id,
        startsAt: row.starts_at,
        instructor: row.instructor,
        capacity: row.capacity,
        durationMinutes: row.duration_minutes ?? 60,
        isActive: row.is_active
      });

    slotsById.set(row.slot_id, slot);

    if (row.fixed_lesson_id && !slot.fixedLessonIds.includes(row.fixed_lesson_id)) {
      slot.fixedLessonIds.push(row.fixed_lesson_id);
    }

    if (row.fixed_user_name) {
      const person: ReservationPerson = {
        userId: row.fixed_user_id ?? '',
        userName: row.fixed_user_name,
        createdAt: row.starts_at,
        fixedLessonId: row.fixed_lesson_id,
        lessonCapacity: row.fixed_lesson_capacity,
        durationMinutes: row.fixed_lesson_duration_minutes ?? row.duration_minutes ?? 60
      };

      if (!slot.fixedMembers.some((member) => member.userId === person.userId && member.userName === person.userName)) {
        slot.fixedMembers.push(person);
      }
    }

    if (row.absence_created_at) {
      const person: ReservationPerson = {
        userId: row.absence_user_id ?? '',
        userName: row.absence_user_name ?? '회원',
        createdAt: row.absence_created_at
      };

      if (!slot.absences.some((absence) => absence.createdAt === person.createdAt && absence.userName === person.userName)) {
        slot.absences.push(person);
      }
    }

    if (row.substitute_created_at) {
      const person: ReservationPerson = {
        userId: row.substitute_user_id ?? '',
        userName: row.substitute_user_name ?? '회원',
        createdAt: row.substitute_created_at,
        durationMinutes: row.substitute_duration_minutes ?? row.duration_minutes ?? 60
      };

      if (!slot.substitutes.some((substitute) => substitute.createdAt === person.createdAt && substitute.userName === person.userName)) {
        slot.substitutes.push(person);
      }
    }
  });

  return Array.from(slotsById.values()).map((slot) => {
    slot.fixedLessonId = slot.fixedLessonIds[0] ?? null;
    slot.fixedMember = slot.fixedMembers.find((member) => Boolean(member.userId)) ?? slot.fixedMembers[0] ?? null;
    slot.absence = slot.absences[0] ?? null;
    slot.substituteBy = slot.substitutes.find((substitute) => Boolean(substitute.userId)) ?? slot.substitutes[0] ?? null;
    slot.reservedBy = slot.substituteBy;
    slot.openSeatCount = Math.max(0, slot.absences.length - slot.substitutes.length);

    return slot;
  });
}

export function getSlotsFromDatabase() {
  return getSlotsSnapshot(getTodayKey(), SYNC_DAYS);
}

export function getPastSlotsFromDatabase() {
  return getSlotsSnapshot(addDays(getTodayKey(), -SYNC_PAST_DAYS), SYNC_PAST_DAYS);
}

export async function toggleFixedLessonAbsence(slotId: string, memberId: string): Promise<AbsenceUpdate> {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('toggle_fixed_lesson_absence', { p_slot_id: slotId });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [slots, user, requests] = await Promise.all([getSlotsFromDatabase(), getMemberById(memberId), getLessonAbsenceRequests()]);

  if (!user) {
    throw new DatabaseError('UNKNOWN', '예약 변경 결과를 불러오지 못했습니다.');
  }

  return { action: data as AbsenceAction, slots, user, requests };
}

export async function getLessonAbsenceRequests() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_lesson_absence_requests').returns<LessonAbsenceRequestRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return ((data ?? []) as LessonAbsenceRequestRow[]).map(mapLessonAbsenceRequestRow);
}

export async function cancelLessonAbsenceRequest(requestId: string) {
  await initializeDatabase();

  const { error } = await supabase.rpc('cancel_lesson_absence_request', {
    p_request_id: requestId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return getLessonAbsenceRequests();
}

export async function reviewLessonAbsenceRequest(requestId: string, approved: boolean) {
  await initializeDatabase();

  const { error } = await supabase.rpc('review_lesson_absence_request', {
    p_request_id: requestId,
    p_approved: approved
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots, requests] = await Promise.all([getMemberSummaries(), getSlotsFromDatabase(), getLessonAbsenceRequests()]);

  return { members, slots, requests };
}

export async function toggleOpenSlotReservation(slotId: string, memberId: string): Promise<ReservationUpdate> {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('toggle_open_slot_reservation', { p_slot_id: slotId });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [slots, user] = await Promise.all([getSlotsFromDatabase(), getMemberById(memberId)]);

  if (!user) {
    throw new DatabaseError('UNKNOWN', '예약 변경 결과를 불러오지 못했습니다.');
  }

  return { action: data as ReservationAction, slots, user };
}

export async function toggleReservation(slotId: string, memberId: string): Promise<ReservationUpdate> {
  return toggleOpenSlotReservation(slotId, memberId);
}

export async function adjustMemberPass(memberId: string, amount: number, reason: string) {
  await initializeDatabase();

  const { error } = await supabase.rpc('adjust_member_pass', {
    p_user_id: memberId,
    p_amount: amount,
    p_reason: reason
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return getMemberSummaries();
}

export async function updateMemberPassProduct(memberId: string, lessonCapacity: number) {
  await initializeDatabase();

  if (!memberId || lessonCapacity < 1 || lessonCapacity > 3) {
    throw new DatabaseError('INVALID_INPUT', '변경할 회원과 수업 상품을 확인해주세요.');
  }

  const { error } = await supabase.rpc('update_member_pass_product', {
    p_user_id: memberId,
    p_lesson_capacity: lessonCapacity
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return getMemberSummaries();
}

export async function upsertFixedLesson(
  memberId: string,
  weekday: number,
  hour: number,
  minute: number,
  durationMinutes = 60,
  instructor = ''
) {
  await initializeDatabase();

  if (weekday < 1 || weekday > 7 || hour < 0 || hour > 23 || ![0, 30].includes(minute) || ![30, 60].includes(durationMinutes)) {
    throw new DatabaseError('INVALID_INPUT', '요일, 시간, 수업 길이를 확인해주세요.');
  }

  const { error } = await supabase.rpc('upsert_fixed_lesson', {
    p_user_id: memberId,
    p_weekday: weekday,
    p_slot_hour: hour,
    p_slot_minute: minute,
    p_instructor: instructor.trim(),
    p_duration_minutes: durationMinutes
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots] = await Promise.all([getMemberSummaries(), getSlotsFromDatabase()]);

  return { members, slots };
}

export async function updateFixedLesson(
  fixedLessonId: string,
  weekday: number,
  hour: number,
  minute: number,
  durationMinutes = 60,
  instructor = ''
) {
  await initializeDatabase();

  if (!fixedLessonId || weekday < 1 || weekday > 7 || hour < 0 || hour > 23 || ![0, 30].includes(minute) || ![30, 60].includes(durationMinutes)) {
    throw new DatabaseError('INVALID_INPUT', '수정할 고정 수업, 요일, 시간, 수업 길이를 확인해주세요.');
  }

  const { error } = await supabase.rpc('update_fixed_lesson', {
    p_fixed_lesson_id: fixedLessonId,
    p_weekday: weekday,
    p_slot_hour: hour,
    p_slot_minute: minute,
    p_instructor: instructor.trim(),
    p_duration_minutes: durationMinutes
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots] = await Promise.all([getMemberSummaries(), getSlotsFromDatabase()]);

  return { members, slots };
}

export async function cancelFixedLesson(fixedLessonId: string) {
  await initializeDatabase();

  if (!fixedLessonId) {
    throw new DatabaseError('INVALID_INPUT', '취소할 고정 수업을 확인해주세요.');
  }

  const { error } = await supabase.rpc('cancel_fixed_lesson', {
    p_fixed_lesson_id: fixedLessonId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots] = await Promise.all([getMemberSummaries(), getSlotsFromDatabase()]);

  return { members, slots };
}

export async function cancelFixedLessonAttendance(slotId: string, fixedLessonId: string) {
  await initializeDatabase();

  if (!slotId || !fixedLessonId) {
    throw new DatabaseError('INVALID_INPUT', '제외할 수업과 고정 회원을 확인해주세요.');
  }

  const { error } = await supabase.rpc('admin_cancel_fixed_lesson_attendance', {
    p_slot_id: slotId,
    p_fixed_lesson_id: fixedLessonId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots] = await Promise.all([getMemberSummaries(), getSlotsFromDatabase()]);

  return { members, slots };
}

export async function updateLessonSlotInstructor(slotId: string, instructor: string) {
  await initializeDatabase();

  if (!slotId || !instructor.trim()) {
    throw new DatabaseError('INVALID_INPUT', '수업 시간과 강사명을 확인해주세요.');
  }

  const { error } = await supabase.rpc('update_lesson_slot_instructor', {
    p_slot_id: slotId,
    p_instructor: instructor.trim()
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots] = await Promise.all([getMemberSummaries(), getSlotsFromDatabase()]);

  return { members, slots };
}

export async function saveInstructorLessonTime(input: SaveInstructorLessonTimeInput) {
  await initializeDatabase();

  if (
    input.weekday < 1 ||
    input.weekday > 7 ||
    input.hour < 0 ||
    input.hour > 23 ||
    ![0, 30].includes(input.minute) ||
    !input.instructor.trim()
  ) {
    throw new DatabaseError('INVALID_INPUT', '강사, 요일, 시간을 확인해주세요.');
  }

  const { error } = await supabase.rpc('upsert_instructor_lesson_time', {
    p_time_id: input.id ?? null,
    p_instructor: input.instructor.trim(),
    p_weekday: input.weekday,
    p_slot_hour: input.hour,
    p_slot_minute: input.minute
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [instructorLessonTimes, members, slots] = await Promise.all([
    getInstructorLessonTimes(),
    getMemberSummaries(),
    getSlotsFromDatabase()
  ]);

  return { instructorLessonTimes, members, slots };
}

export async function cancelInstructorLessonTime(timeId: string) {
  await initializeDatabase();

  if (!timeId) {
    throw new DatabaseError('INVALID_INPUT', '삭제할 강사 배정 시간을 확인해주세요.');
  }

  const { error } = await supabase.rpc('cancel_instructor_lesson_time', {
    p_time_id: timeId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [instructorLessonTimes, members, slots] = await Promise.all([
    getInstructorLessonTimes(),
    getMemberSummaries(),
    getSlotsFromDatabase()
  ]);

  return { instructorLessonTimes, members, slots };
}

export async function createLessonSlot(slotDate: string, hour: number, minute: number, instructor: string, durationMinutes: number) {
  await initializeDatabase();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate) || hour < 0 || hour > 23 || ![0, 30].includes(minute) || !instructor.trim() || ![30, 60].includes(durationMinutes)) {
    throw new DatabaseError('INVALID_INPUT', '추가할 수업 날짜, 시간, 강사, 수업 종류를 확인해주세요.');
  }

  const { error } = await supabase.rpc('create_lesson_slot', {
    p_slot_date: slotDate,
    p_slot_hour: hour,
    p_slot_minute: minute,
    p_instructor: instructor.trim(),
    p_duration_minutes: durationMinutes
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots] = await Promise.all([getMemberSummaries(), getSlotsFromDatabase()]);

  return { members, slots };
}

export async function updateLessonSlotDetails(slotId: string, instructor: string, durationMinutes: number, capacity: number) {
  await initializeDatabase();

  if (!slotId || !instructor.trim() || ![30, 60].includes(durationMinutes) || capacity < 1 || capacity > 3) {
    throw new DatabaseError('INVALID_INPUT', '변경할 수업, 강사, 수업 종류를 확인해주세요.');
  }

  const { error } = await supabase.rpc('update_lesson_slot_details', {
    p_slot_id: slotId,
    p_instructor: instructor.trim(),
    p_duration_minutes: durationMinutes,
    p_capacity: capacity
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots] = await Promise.all([getMemberSummaries(), getSlotsFromDatabase()]);

  return { members, slots };
}

export async function assignLessonReservation(slotId: string, memberId: string, durationMinutes = 60) {
  await initializeDatabase();

  if (!slotId || !memberId || ![30, 60].includes(durationMinutes)) {
    throw new DatabaseError('INVALID_INPUT', '배정할 수업, 회원, 수업 길이를 확인해주세요.');
  }

  const { error } = await supabase.rpc('admin_assign_lesson_reservation', {
    p_slot_id: slotId,
    p_user_id: memberId,
    p_duration_minutes: durationMinutes
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots] = await Promise.all([getMemberSummaries(), getSlotsFromDatabase()]);

  return { members, slots };
}

export async function cancelLessonReservation(slotId: string, memberId: string) {
  await initializeDatabase();

  if (!slotId || !memberId) {
    throw new DatabaseError('INVALID_INPUT', '취소할 수업과 회원을 확인해주세요.');
  }

  const { error } = await supabase.rpc('admin_cancel_lesson_reservation', {
    p_slot_id: slotId,
    p_user_id: memberId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots] = await Promise.all([getMemberSummaries(), getSlotsFromDatabase()]);

  return { members, slots };
}

export async function cancelLessonSlot(slotId: string) {
  await initializeDatabase();

  if (!slotId) {
    throw new DatabaseError('INVALID_INPUT', '닫을 수업을 확인해주세요.');
  }

  const { error } = await supabase.rpc('cancel_lesson_slot', {
    p_slot_id: slotId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots] = await Promise.all([getMemberSummaries(), getSlotsFromDatabase()]);

  return { members, slots };
}

export async function getLessonChangeRequests() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_lesson_change_requests').returns<LessonChangeRequestRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return ((data ?? []) as LessonChangeRequestRow[]).map(mapLessonChangeRequestRow);
}

export async function createLessonChangeRequest(sourceSlotId: string, targetSlotId: string) {
  await initializeDatabase();

  const { error } = await supabase.rpc('create_lesson_change_request', {
    p_source_slot_id: sourceSlotId,
    p_target_slot_id: targetSlotId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return getLessonChangeRequests();
}

export async function cancelLessonChangeRequest(requestId: string) {
  await initializeDatabase();

  const { error } = await supabase.rpc('cancel_lesson_change_request', {
    p_request_id: requestId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return getLessonChangeRequests();
}

export async function reviewLessonChangeRequest(requestId: string, approved: boolean) {
  await initializeDatabase();

  const { error } = await supabase.rpc('review_lesson_change_request', {
    p_request_id: requestId,
    p_approved: approved
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots, requests] = await Promise.all([getMemberSummaries(), getSlotsFromDatabase(), getLessonChangeRequests()]);

  return { members, slots, requests };
}

export async function getLessonAssignmentRequests() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_lesson_assignment_requests').returns<LessonAssignmentRequestRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return ((data ?? []) as LessonAssignmentRequestRow[]).map(mapLessonAssignmentRequestRow);
}

export async function createLessonAssignmentRequest(slotId: string, requestType: LessonAssignmentRequestType) {
  await initializeDatabase();

  const { error } = await supabase.rpc('create_lesson_assignment_request', {
    p_slot_id: slotId,
    p_request_type: requestType
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return getLessonAssignmentRequests();
}

export async function cancelLessonAssignmentRequest(requestId: string) {
  await initializeDatabase();

  const { error } = await supabase.rpc('cancel_lesson_assignment_request', {
    p_request_id: requestId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return getLessonAssignmentRequests();
}

export async function cancelMyLessonReservation(slotId: string, memberId: string) {
  await initializeDatabase();

  if (!slotId || !memberId) {
    throw new DatabaseError('INVALID_INPUT', '취소할 수업을 확인해주세요.');
  }

  const { error } = await supabase.rpc('cancel_my_lesson_reservation', {
    p_slot_id: slotId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [slots, user, assignmentRequests] = await Promise.all([
    getSlotsFromDatabase(),
    getMemberById(memberId),
    getLessonAssignmentRequests()
  ]);

  if (!user) {
    throw new DatabaseError('UNKNOWN', '수업 취소 결과를 불러오지 못했습니다.');
  }

  return { slots, user, assignmentRequests };
}

export async function reviewLessonAssignmentRequest(requestId: string, approved: boolean, comment = '') {
  await initializeDatabase();

  let { error } = await supabase.rpc('review_lesson_assignment_request', {
    p_request_id: requestId,
    p_approved: approved,
    p_review_comment: comment.trim()
  });

  if (error && /p_review_comment|schema cache|function public\.review_lesson_assignment_request/i.test(error.message)) {
    const fallback = await supabase.rpc('review_lesson_assignment_request', {
      p_request_id: requestId,
      p_approved: approved
    });
    error = fallback.error;
  }

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [members, slots, requests] = await Promise.all([
    getMemberSummaries(),
    getSlotsFromDatabase(),
    getLessonAssignmentRequests()
  ]);

  return { members, slots, requests };
}

export async function getLessonFeedbacks() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_lesson_feedbacks').returns<LessonFeedbackRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return Promise.all(((data ?? []) as LessonFeedbackRow[]).map(mapLessonFeedbackRow));
}

export async function getLessonFeedbackTargets() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_lesson_feedback_targets', { p_days: 14 }).returns<LessonFeedbackTargetRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return Promise.all(((data ?? []) as LessonFeedbackTargetRow[]).map(mapLessonFeedbackTargetRow));
}

export async function publishLessonFeedback(input: PublishLessonFeedbackInput) {
  await initializeDatabase();

  const feedbackText = input.feedbackText.trim();

  if (feedbackText.length > 100) {
    throw new DatabaseError('INVALID_INPUT', '피드백 글은 100자 이내로 입력해주세요.');
  }

  const mediaPath = input.mediaUri && input.mediaType
    ? await uploadLessonFeedbackMedia(input.userId, input.slotId, input.mediaUri, input.mediaType)
    : null;

  if (!feedbackText && !mediaPath) {
    throw new DatabaseError('INVALID_INPUT', '사진, 동영상 또는 피드백 글을 입력해주세요.');
  }

  const { error } = await supabase.rpc('upsert_lesson_feedback', {
    p_slot_id: input.slotId,
    p_user_id: input.userId,
    p_feedback_text: feedbackText,
    p_media_path: mediaPath,
    p_media_type: mediaPath ? input.mediaType : null
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [feedbacks, targets] = await Promise.all([getLessonFeedbacks(), getLessonFeedbackTargets()]);

  return { feedbacks, targets };
}

export async function getSpecialLessons() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_special_lessons').returns<SpecialLessonRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return ((data ?? []) as SpecialLessonRow[]).map(mapSpecialLessonRow);
}

export async function getSpecialLessonRegistrations() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_special_lesson_registrations').returns<SpecialLessonRegistrationRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return ((data ?? []) as SpecialLessonRegistrationRow[]).map(mapSpecialLessonRegistrationRow);
}

export async function createSpecialLesson(input: CreateSpecialLessonInput) {
  await initializeDatabase();

  const title = input.title.trim();

  if (!title) {
    throw new DatabaseError('INVALID_INPUT', '특별수업명을 입력해주세요.');
  }

  const imagePath = input.imageUri ? await uploadSpecialLessonImage(input.imageUri) : null;
  const { error } = await supabase.rpc('create_special_lesson', {
    p_title: title,
    p_description: input.description.trim(),
    p_starts_at: input.startsAt,
    p_instructor: input.instructor.trim(),
    p_duration_minutes: input.durationMinutes,
    p_capacity: input.capacity,
    p_image_path: imagePath
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [specialLessons, registrations] = await Promise.all([getSpecialLessons(), getSpecialLessonRegistrations()]);

  return { specialLessons, registrations };
}

export async function updateSpecialLesson(input: UpdateSpecialLessonInput) {
  await initializeDatabase();

  const title = input.title.trim();

  if (!input.id || !title) {
    throw new DatabaseError('INVALID_INPUT', '수정할 특별수업과 수업명을 확인해주세요.');
  }

  const imagePath = input.imageUri ? await uploadSpecialLessonImage(input.imageUri) : null;
  const { error } = await supabase.rpc('update_special_lesson', {
    p_special_lesson_id: input.id,
    p_title: title,
    p_description: input.description.trim(),
    p_starts_at: input.startsAt,
    p_instructor: input.instructor.trim(),
    p_duration_minutes: input.durationMinutes,
    p_capacity: input.capacity,
    p_image_path: imagePath
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [specialLessons, registrations] = await Promise.all([getSpecialLessons(), getSpecialLessonRegistrations()]);

  return { specialLessons, registrations };
}

export async function applySpecialLesson(specialLessonId: string) {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('apply_special_lesson', {
    p_special_lesson_id: specialLessonId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [specialLessons, registrations] = await Promise.all([getSpecialLessons(), getSpecialLessonRegistrations()]);

  return {
    status: data as SpecialLessonRegistrationStatus,
    specialLessons,
    registrations
  };
}

export async function cancelSpecialLessonRegistration(registrationId: string) {
  await initializeDatabase();

  const { error } = await supabase.rpc('cancel_special_lesson_registration', {
    p_registration_id: registrationId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [specialLessons, registrations] = await Promise.all([getSpecialLessons(), getSpecialLessonRegistrations()]);

  return { specialLessons, registrations };
}

export async function reviewSpecialLessonRegistration(registrationId: string, approved: boolean) {
  await initializeDatabase();

  const { error } = await supabase.rpc('review_special_lesson_registration', {
    p_registration_id: registrationId,
    p_approved: approved
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [specialLessons, registrations] = await Promise.all([getSpecialLessons(), getSpecialLessonRegistrations()]);

  return { specialLessons, registrations };
}

export async function getMemberRequests() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_member_requests').returns<MemberRequestRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return ((data ?? []) as MemberRequestRow[]).map(mapMemberRequestRow);
}

export async function createMemberRequest(input: CreateMemberRequestInput) {
  await initializeDatabase();

  const title = input.title.trim();
  const body = input.body.trim();

  if (!title || !body) {
    throw new DatabaseError('INVALID_INPUT', '제목과 내용을 입력해주세요.');
  }

  if (title.length > 60 || body.length > 500) {
    throw new DatabaseError('INVALID_INPUT', '제목은 60자, 내용은 500자 이내로 입력해주세요.');
  }

  const { error } = await supabase.rpc('create_member_request', {
    p_title: title,
    p_body: body
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return getMemberRequests();
}

export async function reviewMemberRequest(requestId: string, status: MemberRequestStatus, reply = '') {
  await initializeDatabase();

  const { error } = await supabase.rpc('review_member_request', {
    p_request_id: requestId,
    p_status: status,
    p_admin_reply: reply.trim()
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return getMemberRequests();
}

export async function getStoreProducts() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_store_products').returns<StoreProductRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return ((data ?? []) as StoreProductRow[]).map(mapStoreProductRow);
}

export async function createStoreProduct(input: CreateStoreProductInput) {
  await initializeDatabase();

  const name = input.name.trim();
  const description = input.description.trim();

  if (!name) {
    throw new DatabaseError('INVALID_INPUT', '상품명을 입력해주세요.');
  }

  if (!Number.isInteger(input.price) || input.price < 0 || !Number.isInteger(input.stockQuantity) || input.stockQuantity < 0) {
    throw new DatabaseError('INVALID_INPUT', '상품 가격과 재고를 확인해주세요.');
  }

  const imagePath = input.imageUri ? await uploadStoreProductImage(input.imageUri) : null;
  const { error } = await supabase.rpc('create_store_product', {
    p_name: name,
    p_description: description,
    p_image_path: imagePath,
    p_price: input.price,
    p_stock_quantity: input.stockQuantity
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return getStoreProducts();
}

export async function getStoreOrders() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_store_orders').returns<StoreOrderRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return ((data ?? []) as StoreOrderRow[]).map(mapStoreOrderRow);
}

export async function createStoreOrder(productId: string, quantity: number) {
  await initializeDatabase();

  if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new DatabaseError('INVALID_INPUT', '구매할 상품과 수량을 확인해주세요.');
  }

  const { error } = await supabase.rpc('create_store_order', {
    p_product_id: productId,
    p_quantity: quantity
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [products, orders] = await Promise.all([getStoreProducts(), getStoreOrders()]);

  return { products, orders };
}

export async function cancelStoreOrder(orderId: string) {
  await initializeDatabase();

  const { error } = await supabase.rpc('cancel_store_order', {
    p_order_id: orderId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [products, orders] = await Promise.all([getStoreProducts(), getStoreOrders()]);

  return { products, orders };
}

export async function reviewStoreOrder(orderId: string, approved: boolean, comment = '') {
  await initializeDatabase();

  const { error } = await supabase.rpc('review_store_order', {
    p_order_id: orderId,
    p_approved: approved,
    p_admin_comment: comment.trim()
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  const [products, orders] = await Promise.all([getStoreProducts(), getStoreOrders()]);

  return { products, orders };
}

export async function getPassTransactions(memberId?: string) {
  await initializeDatabase();

  const { data, error } = await supabase
    .rpc('get_pass_transactions', { p_user_id: memberId ?? null })
    .returns<PassTransactionRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return ((data ?? []) as PassTransactionRow[]).map<PassTransaction>((row) => ({
    id: row.id,
    userId: row.user_id,
    amount: row.amount,
    balanceAfter: row.balance_after,
    reason: row.reason,
    reservationId: row.reservation_id,
    createdBy: row.created_by,
    createdAt: row.created_at
  }));
}

export async function getNoticesFromDatabase() {
  await initializeDatabase();

  const { data, error } = await supabase.rpc('get_notices').returns<NoticeRow[]>();

  if (error) {
    throw toDatabaseError(error.message);
  }

  return ((data ?? []) as NoticeRow[]).map<Notice>((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    author: row.author,
    createdAt: row.created_at,
    imagePath: row.image_path ?? undefined,
    imageUri: row.image_path ? getNoticeImageUrl(row.image_path) : undefined
  }));
}

export async function publishNotice(input: PublishNoticeInput) {
  await initializeDatabase();

  const title = input.title.trim();
  const body = input.body.trim();

  if (!title || !body) {
    throw new DatabaseError('INVALID_INPUT', '공지 제목과 내용을 입력해주세요.');
  }

  const imagePath = input.imageUri ? await uploadNoticeImage(input.imageUri) : null;
  const { error } = await supabase.rpc('create_notice', {
    p_title: title,
    p_body: body,
    p_image_path: imagePath
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return getNoticesFromDatabase();
}

export async function updateNotice(input: UpdateNoticeInput) {
  await initializeDatabase();

  const title = input.title.trim();
  const body = input.body.trim();

  if (!input.id || !title || !body) {
    throw new DatabaseError('INVALID_INPUT', '공지 제목과 내용을 입력해주세요.');
  }

  const imagePath = input.replaceImage && input.imageUri ? await uploadNoticeImage(input.imageUri) : null;
  const { data, error } = await supabase.rpc('update_notice', {
    p_notice_id: input.id,
    p_title: title,
    p_body: body,
    p_image_path: imagePath,
    p_replace_image: input.replaceImage ?? false
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  if (input.replaceImage && typeof data === 'string' && data.length > 0) {
    await removeNoticeImage(data);
  }

  return getNoticesFromDatabase();
}

export async function deleteNotice(noticeId: string) {
  await initializeDatabase();

  if (!noticeId) {
    throw new DatabaseError('INVALID_INPUT', '삭제할 공지를 찾지 못했습니다.');
  }

  const { data, error } = await supabase.rpc('delete_notice', {
    p_notice_id: noticeId
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  if (typeof data === 'string' && data.length > 0) {
    await removeNoticeImage(data);
  }

  return getNoticesFromDatabase();
}

async function uploadNoticeImage(imageUri: string) {
  const response = await fetch(imageUri);
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const filePath = `${new Date().toISOString().slice(0, 10)}/${cryptoRandomId()}.${extension}`;
  const { error } = await supabase.storage.from('notice-images').upload(filePath, arrayBuffer, {
    contentType,
    upsert: false
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return filePath;
}

async function removeNoticeImage(imagePath: string) {
  const { error } = await supabase.storage.from('notice-images').remove([imagePath]);

  if (error) {
    console.warn('공지 이미지 삭제 실패:', error.message);
  }
}

async function uploadSpecialLessonImage(imageUri: string) {
  const response = await fetch(imageUri);
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const extension = getMediaExtension(contentType, 'image');
  const filePath = `${new Date().toISOString().slice(0, 10)}/${cryptoRandomId()}.${extension}`;
  const { error } = await supabase.storage.from('special-lesson-images').upload(filePath, arrayBuffer, {
    contentType,
    upsert: false
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return filePath;
}

async function uploadStoreProductImage(imageUri: string) {
  const response = await fetch(imageUri);
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const extension = getMediaExtension(contentType, 'image');
  const filePath = `${new Date().toISOString().slice(0, 10)}/${cryptoRandomId()}.${extension}`;
  const { error } = await supabase.storage.from('store-product-images').upload(filePath, arrayBuffer, {
    contentType,
    upsert: false
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return filePath;
}

async function uploadLessonFeedbackMedia(
  userId: string,
  slotId: string,
  mediaUri: string,
  mediaType: LessonFeedbackMediaType
) {
  const response = await fetch(mediaUri);
  const arrayBuffer = await response.arrayBuffer();
  const fallbackContentType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
  const contentType = response.headers.get('content-type') ?? fallbackContentType;
  const extension = getMediaExtension(contentType, mediaType);
  const safeSlotId = slotId.replace(/[^a-zA-Z0-9-]/g, '');
  const filePath = `${userId}/${safeSlotId}/${cryptoRandomId()}.${extension}`;
  const { error } = await supabase.storage.from('lesson-feedback').upload(filePath, arrayBuffer, {
    contentType,
    upsert: false
  });

  if (error) {
    throw toDatabaseError(error.message);
  }

  return filePath;
}

function getNoticeImageUrl(imagePath: string) {
  return supabase.storage.from('notice-images').getPublicUrl(imagePath).data.publicUrl;
}

function getSpecialLessonImageUrl(imagePath: string) {
  return supabase.storage.from('special-lesson-images').getPublicUrl(imagePath).data.publicUrl;
}

function getStoreProductImageUrl(imagePath: string) {
  return supabase.storage.from('store-product-images').getPublicUrl(imagePath).data.publicUrl;
}

async function getLessonFeedbackMediaUrl(mediaPath: string | null) {
  if (!mediaPath) {
    return undefined;
  }

  const { data, error } = await supabase.storage.from('lesson-feedback').createSignedUrl(mediaPath, 60 * 60 * 24 * 7);

  if (error) {
    return undefined;
  }

  return data.signedUrl;
}

function getMediaExtension(contentType: string, mediaType: LessonFeedbackMediaType) {
  if (mediaType === 'video') {
    if (contentType.includes('quicktime')) {
      return 'mov';
    }

    if (contentType.includes('webm')) {
      return 'webm';
    }

    return 'mp4';
  }

  if (contentType.includes('png')) {
    return 'png';
  }

  if (contentType.includes('webp')) {
    return 'webp';
  }

  return 'jpg';
}

function cryptoRandomId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string) {
  return phone.trim().replace(/[^\d]/g, '');
}

function validateCredentials(name: string, email: string, phone: string, password: string) {
  if (name.length < 2) {
    throw new DatabaseError('INVALID_INPUT', '이름을 2자 이상 입력해주세요.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DatabaseError('INVALID_INPUT', '이메일 형식을 확인해주세요.');
  }

  if (!/^01\d{8,9}$/.test(phone)) {
    throw new DatabaseError('INVALID_INPUT', '휴대폰 번호를 확인해주세요.');
  }

  if (password.length < 8) {
    throw new DatabaseError('INVALID_INPUT', '비밀번호는 8자 이상이어야 합니다.');
  }
}

function mapProfileRow(row: ProfileRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    provider: 'email' as AuthProvider,
    role: row.role,
    passBalance: row.pass_balance ?? DEFAULT_PASS_BALANCE
  };
}

function mapLessonChangeRequestRow(row: LessonChangeRequestRow): LessonChangeRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    sourceSlotId: row.source_slot_id,
    sourceStartsAt: row.source_starts_at,
    sourceInstructor: row.source_instructor,
    targetSlotId: row.target_slot_id,
    targetStartsAt: row.target_starts_at,
    targetInstructor: row.target_instructor,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedByName: row.reviewed_by_name
  };
}

function mapLessonAbsenceRequestRow(row: LessonAbsenceRequestRow): LessonAbsenceRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    slotId: row.slot_id,
    startsAt: row.starts_at,
    instructor: row.instructor,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedByName: row.reviewed_by_name
  };
}

function mapLessonAssignmentRequestRow(row: LessonAssignmentRequestRow): LessonAssignmentRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    slotId: row.slot_id,
    startsAt: row.starts_at,
    instructor: row.instructor,
    requestType: row.request_type,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedByName: row.reviewed_by_name,
    reviewComment: row.review_comment ?? ''
  };
}

async function mapLessonFeedbackRow(row: LessonFeedbackRow): Promise<LessonFeedback> {
  return {
    id: row.id,
    slotId: row.slot_id,
    userId: row.user_id,
    userName: row.user_name,
    startsAt: row.starts_at,
    instructor: row.instructor,
    feedbackText: row.feedback_text,
    mediaPath: row.media_path,
    mediaType: row.media_type,
    mediaUri: await getLessonFeedbackMediaUrl(row.media_path),
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function mapLessonFeedbackTargetRow(row: LessonFeedbackTargetRow): Promise<LessonFeedbackTarget> {
  return {
    slotId: row.slot_id,
    startsAt: row.starts_at,
    instructor: row.instructor,
    durationMinutes: row.duration_minutes,
    userId: row.user_id,
    userName: row.user_name,
    feedbackId: row.feedback_id,
    feedbackText: row.feedback_text,
    mediaPath: row.media_path,
    mediaType: row.media_type,
    mediaUri: await getLessonFeedbackMediaUrl(row.media_path),
    feedbackCreatedAt: row.feedback_created_at,
    feedbackUpdatedAt: row.feedback_updated_at
  };
}

function mapSpecialLessonRow(row: SpecialLessonRow): SpecialLesson {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imagePath: row.image_path,
    imageUri: row.image_path ? getSpecialLessonImageUrl(row.image_path) : undefined,
    startsAt: row.starts_at,
    instructor: row.instructor,
    durationMinutes: row.duration_minutes,
    capacity: row.capacity,
    isActive: row.is_active,
    applicationCount: row.application_count,
    approvedCount: row.approved_count,
    myRegistrationId: row.my_registration_id,
    myStatus: row.my_status,
    myQueuePosition: row.my_queue_position,
    createdAt: row.created_at
  };
}

function mapSpecialLessonRegistrationRow(row: SpecialLessonRegistrationRow): SpecialLessonRegistration {
  return {
    id: row.id,
    specialLessonId: row.special_lesson_id,
    specialLessonTitle: row.special_lesson_title,
    startsAt: row.starts_at,
    instructor: row.instructor,
    capacity: row.capacity,
    userId: row.user_id,
    userName: row.user_name,
    status: row.status,
    queuePosition: row.queue_position,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedByName: row.reviewed_by_name
  };
}

function mapMemberRequestRow(row: MemberRequestRow): MemberRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    title: row.title,
    body: row.body,
    status: row.status,
    adminReply: row.admin_reply ?? '',
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedByName: row.reviewed_by_name
  };
}

function mapStoreProductRow(row: StoreProductRow): StoreProduct {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imagePath: row.image_path,
    imageUri: row.image_path ? getStoreProductImageUrl(row.image_path) : undefined,
    price: row.price,
    stockQuantity: row.stock_quantity,
    isActive: row.is_active,
    createdAt: row.created_at
  };
}

function mapStoreOrderRow(row: StoreOrderRow): StoreOrder {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    userId: row.user_id,
    userName: row.user_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    totalPrice: row.total_price,
    status: row.status,
    adminComment: row.admin_comment ?? '',
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedByName: row.reviewed_by_name
  };
}

function toDatabaseError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('already registered') || normalizedMessage.includes('already exists')) {
    return new DatabaseError('EMAIL_EXISTS', '이미 가입된 이메일입니다.');
  }

  if (
    normalizedMessage.includes('invalid login') ||
    normalizedMessage.includes('invalid credentials') ||
    normalizedMessage.includes('email not confirmed')
  ) {
    return new DatabaseError('INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인해주세요.');
  }

  if (normalizedMessage.includes('remaining pass') || message.includes('남은 횟수가 없습니다')) {
    return new DatabaseError('NO_PASS', '남은 횟수가 없습니다.');
  }

  if (
    normalizedMessage.includes('permission') ||
    normalizedMessage.includes('권한') ||
    normalizedMessage.includes('row-level security') ||
    normalizedMessage.includes('forbidden')
  ) {
    return new DatabaseError('FORBIDDEN', '권한이 없습니다.');
  }

  if (
    normalizedMessage.includes('fixed lesson') ||
    message.includes('고정 수업') ||
    message.includes('열린 수업') ||
    message.includes('대체 예약') ||
    message.includes('변경 요청') ||
    message.includes('빈자리')
  ) {
    return new DatabaseError('INVALID_INPUT', message);
  }

  if (
    normalizedMessage.includes('could not find the function') ||
    normalizedMessage.includes('could not choose the best candidate function') ||
    normalizedMessage.includes('schema cache') ||
    normalizedMessage.includes('does not exist')
  ) {
    return new DatabaseError(
      'UNKNOWN',
      `Supabase 스키마가 앱 코드와 맞지 않습니다. Supabase SQL Editor에서 최신 supabase/schema.sql 전체를 다시 실행해주세요. 원문: ${message}`
    );
  }

  if (message.includes('Supabase')) {
    return new DatabaseError('CONFIG', message);
  }

  return new DatabaseError('UNKNOWN', message);
}
