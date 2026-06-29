# 오늘도수영

iOS 우선 테스트를 목표로 만든 Expo/React Native 모바일 앱입니다. 같은 코드베이스에서 Android 빌드로 확장할 수 있습니다.

## 실행

Supabase 프로젝트를 만든 뒤 SQL Editor에서 `supabase/schema.sql`을 먼저 실행하고, `.env`를 설정합니다.

```bash
cp .env.example .env
```

`.env`에는 Supabase Project URL과 publishable key를 넣습니다. service role 또는 secret key는 앱에 넣지 마세요.

```bash
npm install
npm run ios
```

iOS Simulator 접근이 어려운 환경에서는 웹 미리보기로 기능 흐름을 확인할 수 있습니다.

```bash
npm run web
```

## 포함 기능

- 이름, 휴대폰 번호, 이메일, 비밀번호 기반 회원가입 및 로그인
- Supabase Auth와 Postgres 중앙 DB를 통한 회원 정보, 고정 수업, 잔여 횟수권, 결석, 대체 예약 관리
- 회원별 특정 요일/시간 고정 수업 배정과 1:1, 1:2, 1:3 상품 인원 관리
- 고정 수업 회원이 못 오는 날 결석 처리하면 해당 수업이 빈자리로 공개
- 다른 회원은 공개된 빈자리만 대체 예약
- 회원 홈에서 다음 수업, 진행 강사, 고정 수업, 잔여 횟수 확인
- 다음 고정수업에 한해 빈자리로 수업 변경 요청, 관리자 승인/거절
- 관리자 홈에서 날짜별 운영표, 회원별 고정 수업, 담당 강사, 잔여 횟수 확인 및 수정
- 관리자 전용 공지 작성 및 이미지 첨부
- 수업 임박, 예약 확정, 공지사항, 출석 리마인드, 강사/일정 변경, 재예약 추천 알림 설정
- 문의 전화 `010-4698-3505`

## 데이터베이스

상용 운영 데이터는 Supabase Postgres에 저장합니다. DB 스키마, RLS 정책, 예약 RPC는 `supabase/schema.sql`에 있습니다.

- `profiles`: 회원 이름, 휴대폰 번호, 이메일, 권한, 잔여 횟수권
- `lesson_slots`: 실제 날짜/시간별 수업 슬롯
- `fixed_lessons`: 회원별 고정 요일/시간/담당 강사/수업 상품 인원 배정
- `lesson_absences`: 고정 수업 회원의 날짜별 결석 처리
- `reservations`: 결석으로 열린 빈자리의 대체 예약
- `pass_transactions`: 횟수권 충전, 차감, 취소 복구 이력
- `notices`: 공지사항 데이터
- Supabase Storage `notice-images`: 공지사항 이미지

고정 회원의 결석 처리는 `toggle_fixed_lesson_absence(slot_id)` RPC로 처리합니다. 다른 회원의 빈자리 대체 예약은 `toggle_open_slot_reservation(slot_id)` RPC로 처리합니다. 앱은 직접 여러 테이블을 수정하지 않고 RPC를 호출하므로 예약 가능 여부, 횟수권 차감/복구, 중복 예약 방지가 DB 트랜잭션 안에서 처리됩니다.

다음 고정수업 변경 요청은 `lesson_change_requests`에 저장됩니다. 회원은 빈자리인 수업으로만 요청할 수 있고, 관리자가 승인하면 원래 다음 고정수업은 결석 처리로 열리며 요청한 빈자리에 회원이 배정됩니다. 이 변경 승인은 추가 수업이 아니므로 횟수권을 별도로 차감하지 않습니다.

관리자의 회원 횟수권 조정은 `adjust_member_pass(user_id, amount, reason)` RPC로 처리합니다. 특정 날짜 수업의 대체 강사 변경은 `update_lesson_slot_instructor(slot_id, instructor)` RPC로 처리합니다. 앱에는 DB 비밀번호나 service role key를 넣지 않고, 공개 가능한 publishable key만 둡니다.

회원가입은 항상 일반 회원으로 생성됩니다. 관리자는 Supabase SQL Editor에서 해당 계정을 승격합니다.

```sql
update public.profiles
set role = 'admin'
where email = 'admin@example.com';
```

관리자는 앱의 회원 목록에서 `calendar` 버튼으로 고정 수업을 배정할 수 있습니다. 이때 회원별로 1:1, 1:2, 1:3 수업 상품을 같이 선택합니다. 같은 요일/시간에 여러 회원이 들어갈 수 있지만, DB 함수가 그 시간대 회원들의 상품 인원 중 가장 작은 값보다 많은 회원이 배정되지 않게 막습니다.

앱에서 호출하는 RPC는 아래 형태입니다. `weekday`는 월요일 1부터 일요일 7까지이고, 마지막 값은 수업 상품 인원입니다.

```sql
select public.upsert_fixed_lesson(
  '회원 uuid',
  1,
  19,
  '이혜원',
  2
);
```

Supabase SQL Editor에서 한 번에 넣을 때는 로그인 사용자 컨텍스트가 없으므로 RPC 대신 `fixed_lessons`에 직접 넣습니다.

```sql
insert into public.fixed_lessons (user_id, weekday, slot_hour, instructor, lesson_capacity)
values
  ('회원 uuid 1', 1, 19, '이혜원', 2),
  ('회원 uuid 2', 1, 19, '이혜원', 2)
on conflict (user_id, weekday, slot_hour) where is_active = true
do update set
  instructor = excluded.instructor,
  lesson_capacity = excluded.lesson_capacity,
  updated_at = now();
```

## Supabase 설정

1. Supabase 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 전체 실행
3. `supabase/functions/delete-account` Edge Function 배포
4. Project Settings 또는 Connect dialog에서 Project URL과 publishable key 확인
5. `.env.example`을 `.env`로 복사하고 값 입력
6. 앱 재시작

RLS가 켜져 있으므로 회원은 자기 정보와 자기 예약만 직접 조회할 수 있고, 관리자는 전체 회원/예약 요약을 볼 수 있습니다.

실제 SSO, 원격 푸시 발송은 운영 백엔드와 각 플랫폼 개발자 콘솔 설정이 필요합니다. 계정 삭제는 Edge Function에서 service role key로 처리하므로 service role key를 앱 `.env`에 넣지 마세요.

앱스토어 제출 전 운영 점검 항목은 `docs/production-checklist.md`를 확인하세요.
