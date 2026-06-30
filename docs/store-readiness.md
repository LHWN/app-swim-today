# 앱스토어 제출 준비 점검

이 문서는 오늘도수영을 Apple App Store와 Google Play에 제출하기 전 확인할 항목입니다.

## 현재 코드에서 보강한 항목

- 앱 내 계정 삭제 기능 제공
- 개인정보 처리방침과 계정 삭제 안내를 내정보 화면에서 접근 가능하게 제공
- iOS 사진 접근 권한 문구 보강
- Android에서 앱 기능에 필요 없는 `RECORD_AUDIO` 권한 차단
- iOS `buildNumber`, Android `versionCode`, EAS production 빌드 설정 추가
- 1024x1024 앱 아이콘 추가

## 제출 전에 반드시 필요한 외부 작업

1. 개인정보 처리방침 URL을 공개 웹 URL로 배포합니다.
   - 임시 문서: `docs/privacy-policy.md`
   - 권장 공개 URL 예: `https://lhwn.github.io/app-swim-today/privacy-policy.html`
2. 계정 삭제 안내 URL을 공개 웹 URL로 배포합니다.
   - 임시 문서: `docs/account-deletion.md`
   - Google Play Console의 계정 삭제 URL 필드에 입력해야 합니다.
3. App Store Connect와 Play Console에 데모 계정을 준비합니다.
4. Supabase 운영 프로젝트에 최신 `supabase/schema.sql`을 적용하고 `delete-account` Edge Function을 배포합니다.
5. EAS production 환경변수에 Supabase URL과 publishable key를 등록합니다.
6. 실제 기기에서 회원가입, 로그인, 예약, 결석, 특별수업, 이미지 업로드, 계정 삭제를 테스트합니다.

## 스토어 개인정보 입력 참고

수집/처리하는 데이터:

- 이름
- 이메일 주소
- 휴대폰 번호
- 사용자 ID 또는 계정 식별자
- 예약, 결석, 특별수업 신청, 횟수권 이력
- 사용자가 선택해 업로드한 이미지 또는 동영상

사용 목적:

- 앱 기능 제공
- 계정 관리
- 수업 예약 및 운영
- 사용자 지원

공유/판매:

- 광고 목적 판매 없음
- Supabase를 인증, 데이터베이스, 저장소 운영을 위한 처리자로 사용

권한:

- 사진 보관함: 공지, 특별수업 포스터, 수업 피드백 이미지 선택
- 알림: 수업, 예약, 공지 알림
