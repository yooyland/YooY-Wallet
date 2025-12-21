export type AdminRole = 'super_admin' | 'rewards_admin' | 'fees_admin';

export type AdminUser = {
  email: string;
  role: AdminRole;
  description?: string;
};

export const ADMINS: AdminUser[] = [
  { email: 'admin@yooyland.com', role: 'super_admin', description: 'Super administrator' },
  { email: 'jch4389@gmail.com', role: 'rewards_admin', description: '이벤트 보상 YOY 지급' },
  { email: 'landyooy@gmail.com', role: 'fees_admin', description: 'App에서 발생한 수수료' },
];

export function getAdminRoleByEmail(email: string): AdminRole | null {
  const u = ADMINS.find((a) => a.email.toLowerCase() === email.toLowerCase());
  return u ? u.role : null;
}

export function isAdmin(email: string): boolean {
  return getAdminRoleByEmail(email) !== null;
}


