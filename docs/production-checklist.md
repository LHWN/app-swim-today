# 운영 및 앱스토어 제출 체크리스트

이 앱은 Supabase Auth, Postgres, RLS, RPC를 운영 데이터의 기준으로 사용합니다. 앱에는 Supabase Project URL과 publishable key만 넣고, DB 비밀번호, service role key, access token은 넣지 않습니다.

## Supabase 운영 설정

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/schema.sql` 전체를 실행합니다.
3. 앱에서 사용할 `.env`를 설정합니다.

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

4. 계정 삭제 Edge Function을 배포합니다.

```bash
supabase functions deploy delete-account
```

Supabase Cloud에서 기본 제공되는 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 환경변수를 사용합니다. 자체 환경에서 배포한다면 이 값들을 함수 환경변수로 설정해야 합니다.

5. 첫 관리자 계정으로 회원가입한 뒤 SQL Editor에서 관리자 권한으로 승격합니다.

```sql
update public.profiles
set role = 'admin'
where email = 'admin@example.com';
```

회원에게 고정 수업을 배정할 때는 회원 `id`를 확인한 뒤 앱 관리자 화면에서 요일, 시간, 강사, 수업 상품 인원(1:1/1:2/1:3)을 저장합니다. SQL Editor에서 직접 넣을 때는 `lesson_capacity`에 상품 인원을 넣습니다.

```sql
select id, name, email
from public.profiles
order by created_at desc;

insert into public.fixed_lessons (user_id, weekday, slot_hour, instructor, lesson_capacity)
values
  ('회원 uuid', 1, 19, '이혜원', 2)
on conflict (user_id, weekday, slot_hour) where is_active = true
do update set
  instructor = excluded.instructor,
  lesson_capacity = excluded.lesson_capacity,
  updated_at = now();
```

6. `profiles`, `lesson_slots`, `fixed_lessons`, `lesson_absences`, `reservations`, `pass_transactions`, `notices` 테이블의 RLS가 켜져 있는지 확인합니다.
7. Supabase Auth에서 이메일 인증, 비밀번호 정책, SMTP 발신 설정을 운영 기준으로 맞춥니다.
8. Supabase Dashboard의 Security Advisor와 Performance Advisor를 확인합니다.
9. 운영 공지 이미지는 민감한 회원정보가 들어가지 않는 파일만 업로드합니다. 현재 `notice-images` 버킷은 공지 표시를 위해 public URL을 사용합니다.

## 운영 데이터 구조

- 회원가입: Supabase Auth가 로그인 계정을 만들고 `handle_new_user` 트리거가 `profiles`와 최초 횟수권 이력을 만듭니다.
- 고정 수업 배정: 관리자가 앱에서 회원별 요일, 시간, 담당 강사, 수업 상품 인원을 배정합니다. 앱 RPC와 DB 트리거는 같은 시간대 회원 수가 각 회원의 상품 인원을 넘지 않게 막습니다.
- 강사 변경: 정기 고정수업의 기본 강사는 회원별 고정수업 저장으로 바꾸고, 특정 날짜의 대체 강사는 운영표의 강사 변경으로 `lesson_slots`에 반영합니다.
- 수업 조회: 앱은 `get_lesson_slots_snapshot` RPC로 날짜별 슬롯, 고정 회원, 결석 여부, 대체 예약 상태를 읽습니다.
- 결석 처리: 고정 수업 회원은 `toggle_fixed_lesson_absence` RPC로 해당 날짜 수업을 빈자리로 공개하거나 취소합니다.
- 대체 예약: 다른 회원은 `toggle_open_slot_reservation` RPC로 공개된 빈자리만 예약/취소합니다. 이 함수가 횟수권 차감/복구를 한 트랜잭션에서 처리합니다.
- 다음 수업 변경 요청: 회원은 다음 고정수업에 한해 빈자리로 변경 요청을 만들 수 있습니다. 관리자가 승인하면 원래 수업은 결석 처리되고 요청한 빈자리에 배정되며, 횟수권은 추가 차감하지 않습니다.
- 횟수권 관리: 관리자는 앱에서 회원별 `+1`, `-1` 조정을 할 수 있고, DB에는 `pass_transactions` 이력이 남습니다.
- 공지사항: 관리자는 앱에서 제목, 내용, 이미지를 등록하고 회원은 최신 공지를 읽습니다.
- 계정 삭제: 앱은 `delete-account` Edge Function을 호출합니다. 함수 내부에서 로그인 토큰을 검증한 뒤 service role로 Supabase Auth 사용자를 삭제합니다.

## 앱스토어 제출 전 필수 항목

1. 실제 기기에서 회원가입, 로그인, 로그아웃, 고정 수업 확인, 결석 처리, 결석 취소, 빈자리 대체 예약, 대체 예약 취소, 공지 작성, 이미지 업로드를 테스트합니다.
2. App Review용 데모 계정을 준비하고 App Store Connect Review Notes에 적습니다.
3. 백엔드 서비스를 켠 상태로 제출합니다. 로그인 앱은 리뷰 중 실제 서버가 동작해야 합니다.
4. 개인정보처리방침 URL을 준비하고 App Store Connect, Play Console, 앱 안의 접근 가능한 위치에 넣습니다.
5. 앱이 계정 생성을 지원하므로 프로필 화면의 계정 삭제 버튼과 `delete-account` Edge Function을 실제 프로젝트에서 테스트합니다.
6. Google Play 제출 시 계정 삭제 안내 URL을 Play Console에 입력합니다.
7. App Privacy 및 Data safety 항목에는 수집 데이터로 이름, 이메일, 휴대폰 번호, 예약 정보, 사용자 식별자, 사용자가 업로드한 이미지를 반영합니다.
8. Android 빌드 매니페스트에 불필요한 마이크 권한이 포함되지 않았는지 확인합니다.
9. 카메라/사진 접근 문구가 공지, 특별수업, 수업 피드백 이미지 업로드 목적을 정확히 설명하는지 확인합니다.
10. TestFlight에서 내부 테스트 후 외부 테스트 또는 App Review로 진행합니다.

## 참고 공식 문서

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Database Functions: https://supabase.com/docs/guides/database/functions
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
