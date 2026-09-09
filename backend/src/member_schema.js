import { z } from 'zod';

const phone = z.string().trim()
  .regex(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, '휴대폰 번호를 확인해 주세요.')
  .transform((value) => value.replaceAll('-', ''));
export const memberSchema = z.object({
  name: z.string().trim().min(1).max(40),
  phone,
  churchName: z.string().trim().min(1).max(100),
  loginProvider: z.enum(['phone', 'naver', 'kakao', 'google']).default('phone'),
  providerUserId: z.string().trim().min(1).max(200).optional(),
});
export function publicMember(member) {
  return { id: member.id, name: member.name, phone: member.phone, churchName: member.church_name, loginProvider: member.login_provider, createdAt: member.created_at };
}

export function adminMember(member) {
  return {
    id: member.id,
    name: `${member.name.slice(0, 1)}***`,
    phone: member.phone.length >= 7
      ? `${member.phone.slice(0, 3)}****${member.phone.slice(-4)}`
      : '****',
    churchName: '비공개',
    provider: member.login_provider,
    createdAt: member.created_at,
  };
}
