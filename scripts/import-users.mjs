import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 터미널 환경변수로 먼저 넣어주세요.');
  process.exit(1);
}

if (serviceRoleKey.startsWith('sb_publishable_')) {
  console.error('SUPABASE_SERVICE_ROLE_KEY에 publishable key가 들어가 있습니다. Auth Admin 회원 생성에는 사용할 수 없습니다.');
  console.error('Supabase Dashboard > Project Settings > API Keys > Legacy API Keys > service_role 값을 넣어주세요.');
  process.exit(1);
}

if (serviceRoleKey.startsWith('sb_secret_')) {
  console.error('SUPABASE_SERVICE_ROLE_KEY에 sb_secret_ 키가 들어가 있습니다.');
  console.error('이 스크립트의 auth.admin.createUser에는 Legacy API Keys의 service_role JWT 키를 사용해주세요.');
  process.exit(1);
}

if (serviceRoleKey.split('.').length !== 3) {
  console.error('SUPABASE_SERVICE_ROLE_KEY 형식이 service_role JWT처럼 보이지 않습니다.');
  console.error('올바른 값은 보통 eyJ... 로 시작하고 점(.)이 2개 들어간 긴 문자열입니다.');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, 'initial-users.csv');
const supabase = createClient(supabaseUrl, serviceRoleKey);

const csv = fs.readFileSync(csvPath, 'utf8').trim();
const [headerLine, ...lines] = csv.split('\n').filter((line) => line.trim().length > 0);
const headers = headerLine.split(',');

function parseLine(line) {
  const values = line.split(',');
  return Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? '']));
}

for (const line of lines) {
  const row = parseLine(line);

  const { data, error } = await supabase.auth.admin.createUser({
    email: row.email,
    password: row.password,
    email_confirm: true,
    user_metadata: {
      name: row.name,
      phone: row.phone
    }
  });

  if (error) {
    console.error('실패:', row.email, error.message);
    continue;
  }

  await supabase
    .from('profiles')
    .update({
      name: row.name,
      phone: row.phone,
      pass_balance: Number(row.pass_balance || 12)
    })
    .eq('id', data.user.id);

  console.log('생성:', row.email);
}
