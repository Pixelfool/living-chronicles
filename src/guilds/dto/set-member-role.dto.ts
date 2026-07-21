import { IsIn } from 'class-validator';

export const ASSIGNABLE_ROLES = ['OFFICER', 'MEMBER'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class SetMemberRoleDto {
  @IsIn(ASSIGNABLE_ROLES)
  role: AssignableRole;
}
